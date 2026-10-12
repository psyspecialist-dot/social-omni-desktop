const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),https=require('node:https');
const {execFileSync}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const sms=require('./sms-marketing.cjs');
const advanced=require('./advanced.cjs');
const config={accountSid:'AC'+'a'.repeat(32),apiKeySid:'SK'+'b'.repeat(32),apiKeySecret:'LOCAL_TWILIO_TEST_SECRET_NOT_REAL',from:'+15550009999'};
test('SMS parsing, name substitution, segment counts and opt-out preflight',()=>{
  assert.deepEqual(sms.recipients('أحمد <+1 (555) 000-1001>\n+15550001001\nZoë <+15550001002>'),
    [{name:'أحمد',phone:'+15550001001'},{name:'Zoë',phone:'+15550001002'}]);
  assert.equal(sms.personalize('{{name}} {{phone}}',{phone:'+15550001001',name:'$& {{phone}}'}),'$& {{phone}} +15550001001');
  assert.equal(sms.segments('a'.repeat(160)).count,1);
  assert.equal(sms.segments('a'.repeat(161)).count,2);
  assert.equal(sms.segments('^'.repeat(80)).count,1);
  assert.equal(sms.segments('^'.repeat(81)).count,2);
  assert.equal(sms.segments('ع'.repeat(70)).count,1);
  assert.equal(sms.segments('ع'.repeat(71)).count,2);
  assert.equal(sms.segments('😀'.repeat(35)).count,1);
  assert.equal(sms.segments('😀'.repeat(36)).count,2);
  for(const number of ['5550001001','0015550001001','+00000000','+15550001001,other','+1234567890123456']) assert.throws(()=>sms.phone(number));
  const contacts=[{channel:'Phone',value:'+1 (555) 000-1001',name:'Contact',optedIn:true},{channel:'Phone',value:'15550001001',name:'Duplicate opt-out',optedIn:false}];
  assert.throws(()=>sms.prepared('أحمد <+15550001001>','Hi {{name}}',contacts),/opted out/);
  assert.throws(()=>sms.prepared('Long name <+15550001001>','x'.repeat(1599)+'{{name}}',[]),/1600/);
  assert.equal(sms.prepared('+15550001001','Hi {{name}}',contacts.slice(0,1))[0].body,'Hi Contact');
  for(const status of ['unexpected','constructor','toString']) assert.throws(()=>sms.result({sid:'SM'+'1'.repeat(32),status}),/did not confirm/);
});
test('SMS requests use form encoding, sanitize provider rejections and never follow redirects',async()=>{
  let calls=0;
  const transport=sms.createTransport(config,async(url,options)=>{
    calls++;assert.match(url,/^https:\/\/api\.twilio\.com\/2010-04-01\/Accounts\/AC/);
    assert.equal(options.headers['Content-Type'],'application/x-www-form-urlencoded');
    assert.equal(options.redirect,'error');
    const fields=new URLSearchParams(options.body);
    assert.equal(fields.get('Body'),'مرحبا أحمد & +');
    assert.equal(fields.get('To'),'+15550001001');
    return Response.json({code:21610,message:config.apiKeySecret},{status:400});
  });
  const result=await transport.send('+15550001001','مرحبا أحمد & +');
  assert.equal(result.status,'Rejected');assert.equal(result.providerErrorCode,21610);
  assert.ok(!JSON.stringify(result).includes(config.apiKeySecret));assert.equal(calls,1);
});
test('a reserved ambiguous SMS cannot automatically retry',async t=>{
  t.mock.timers.enable({apis:['Date','setTimeout','setInterval']});
  let posts=0;
  let state={advanced:{...advanced.defaults(),connections:[{id:'twilio',configured:true,stage:'connected'}]},
    store:{contacts:[],accounts:[],activity:[]},jobs:[],media:[],settings:{delayMin:5,delayMax:12}};
  state.advanced.tasks.push({...advanced.taskInput({kind:'sms-send',name:'Ambiguity fixture',source:'Alice <+15550001001>',message:'Hi {{name}}',approved:true}),
    id:randomUUID(),status:'Queued',phase:'Queued',completedCount:0,totalCount:0,progress:0,createdAt:new Date().toISOString()});
  const engine=require('./advanced-worker.cjs')({get:()=>structuredClone(state),save:(_id,s)=>{state=structuredClone(s);},ids:()=>['fixture'],recordActivity(){},
    runtime:{},vault:{read:()=>config},kickLegacy(){},cancelLegacy(){},readMedia(){},
    smsRequest:async(_url,options)=>{if(options.method==='GET')return Response.json({messages:[]});posts++;throw new Error(config.apiKeySecret+' uncertain socket loss');}});
  const step=async()=>{t.mock.timers.tick(1000);await new Promise(r=>setImmediate(r));};
  try {
    for(let i=0;i<40 && state.advanced.tasks[0].status!=='Failed';i++) await step();
    assert.equal(posts,1);assert.equal(state.advanced.tasks[0].status,'Failed');assert.equal(state.advanced.results[0].status,'Unconfirmed');
    assert.equal(state.advanced.results[0].phone,'+15550001001');
    assert.ok(!JSON.stringify(state).includes(config.apiKeySecret));
    for(let i=0;i<30;i++)await step();assert.equal(posts,1);
  } finally {await engine.close();}
});
for(const optOutDuringVerification of [false,true]) test(`pre-send checks preserve inline-name precedence and current consent (${optOutDuringVerification?'opt-out':'consented'})`,async t=>{
  t.mock.timers.enable({apis:['Date','setTimeout','setInterval']});
  let posts=0;
  let state={advanced:advanced.defaults(),store:{contacts:[{channel:'Phone',value:'+15550001001',name:'ع'.repeat(150),optedIn:true}],accounts:[],activity:[]},jobs:[],media:[],settings:{delayMin:5,delayMax:12}};
  state.advanced.tasks.push({...advanced.taskInput({kind:'sms-send',name:'Current consent',source:'A <+15550001001>',message:'x'.repeat(1498)+'{{name}}',approved:true}),
    id:randomUUID(),status:'Queued',phase:'Queued',completedCount:0,totalCount:0,progress:0,createdAt:new Date().toISOString()});
  state.advanced.connections=[{id:'twilio',configured:true,stage:'connected'}];
  const engine=require('./advanced-worker.cjs')({get:()=>structuredClone(state),save:(_id,s)=>{state=structuredClone(s);},ids:()=>['fixture'],recordActivity(){},
    runtime:{},vault:{read:()=>config},kickLegacy(){},cancelLegacy(){},readMedia(){},
    smsRequest:async(_url,options)=>{
      if(options.method==='GET'){if(optOutDuringVerification)state.store.contacts[0].optedIn=false;return Response.json({messages:[]});}
      posts++;assert.equal(new URLSearchParams(options.body).get('Body'),'x'.repeat(1498)+'A');
      return Response.json({sid:'SM'+'c'.repeat(32),account_sid:config.accountSid,to:'+15550001001',status:'queued'});
    }});
  try {
    for(let i=0;i<40 && !['Completed','Failed'].includes(state.advanced.tasks[0].status);i++) {t.mock.timers.tick(1000);await new Promise(r=>setImmediate(r));}
    assert.equal(posts,optOutDuringVerification?0:1);
    assert.equal(state.advanced.tasks[0].status,optOutDuringVerification?'Failed':'Completed');
    if(optOutDuringVerification){assert.match(state.advanced.tasks[0].error,/opted out/);assert.equal(state.advanced.results.length,0);}
    else assert.equal(state.advanced.results[0].name,'A');
  } finally {await engine.close();}
});
test('real TLS Twilio-format requests run through the service, personalize, dedupe, refresh without resending, and expire safely', {timeout:150000},async()=>{
  const express=require('../../artifacts/api-server/node_modules/express'),createService=require('./service.cjs');
  const {DatabaseSync}=require('node:sqlite');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'najhin-sms-')),dbPath=path.join(dir,'workspace.sqlite'),workspace=randomUUID();
  const certPath=path.join(dir,'cert.pem'),keyPath=path.join(dir,'key.pem');
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost','-keyout',keyPath,'-out',certPath],{stdio:'ignore'});
  const cert=fs.readFileSync(certPath),messages=new Map(),sockets=new Set();
  let status='delivered';
  const fixture=https.createServer({key:fs.readFileSync(keyPath),cert},(req,res)=>{
    if(req.headers.authorization!==`Basic ${Buffer.from(`${config.apiKeySid}:${config.apiKeySecret}`).toString('base64')}`) {res.writeHead(401);res.end('{}');return;}
    const expected=`/2010-04-01/Accounts/${config.accountSid}/Messages`;
    res.setHeader('content-type','application/json');
    if(req.method==='GET' && req.url===expected+'.json?PageSize=1') {res.end('{"messages":[]}');return;}
    if(req.method==='GET' && req.url.startsWith(expected+'/')) {
      const sid=req.url.slice(expected.length+1).replace(/\.json$/,'');
      const message=messages.get(sid);
      if(!message){res.writeHead(404);res.end('{}');return;}
      res.end(JSON.stringify({...message,status,num_segments:'2'}));return;
    }
    if(req.method!=='POST' || req.url!==expected+'.json') {res.writeHead(404);res.end('{}');return;}
    assert.equal(req.headers['content-type'],'application/x-www-form-urlencoded');
    let body='';req.setEncoding('utf8');req.on('data',chunk=>{body+=chunk;});
    req.on('end',()=>{
      const form=new URLSearchParams(body),sid='SM'+(messages.size+1).toString(16).padStart(32,'0');
      assert.equal(form.get('From'),config.from);
      const message={sid,account_sid:config.accountSid,to:form.get('To'),from:form.get('From'),body:form.get('Body'),status:'queued',num_segments:'0'};
      messages.set(sid,message);res.writeHead(201);res.end(JSON.stringify(message));
    });
  });
  fixture.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});
  await new Promise(r=>fixture.listen(0,'127.0.0.1',r));
  // Inject only isolated endpoint/CA mapping; production always uses api.twilio.com,
  // authenticated HTTPS with certificate verification and a single POST attempt.
  const smsRequest=async(url,options)=>{
    assert.ok(url.startsWith('https://api.twilio.com/2010-04-01/Accounts/'));
    return new Promise((resolve,reject)=>{
      const parsed=new URL(url);
      const req=https.request({hostname:'127.0.0.1',servername:'localhost',port:fixture.address().port,path:parsed.pathname+parsed.search,method:options.method,headers:options.headers,ca:cert,signal:options.signal},res=>{
        let body='';res.setEncoding('utf8');res.on('data',chunk=>{body+=chunk;});res.on('end',()=>resolve(new Response(body,{status:res.statusCode,headers:{'content-type':'application/json'}})));
      });req.on('error',reject);req.end(options.body);
    });
  };
  let service,server;
  const start=async(native=true)=>{
    service=createService({express,dbPath,smsRequest,...(native?{automation:{}}:{})});
    const app=express();app.use(express.json());app.use(service.router);
    server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});
  };
  const stop=async()=>{await service.close();await new Promise(r=>server.close(r));};
  const api=async(method,route,body,expected=200)=>{
    const response=await fetch(`http://127.0.0.1:${server.address().port}${route}`,{method,headers:{'content-type':'application/json','x-socialomni-workspace':workspace},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const data=await response.json();assert.equal(response.status,expected,JSON.stringify(data));return data;
  };
  const wait=async(predicate)=>{
    const deadline=Date.now()+50000;
    while(Date.now()<deadline) {const state=await api('GET','/state');if(predicate(state))return state;await new Promise(r=>setTimeout(r,100));}
    throw new Error('Timed out waiting for the SMS fixture.');
  };
  try {
    await start(false);
    await api('PUT','/advanced/connections/twilio',{...config,sessionOnly:true},422);
    await api('POST','/advanced/sms/test-message',{recipient:'+15550001001',approved:true},422);
    assert.equal(messages.size,0);await stop();await start();
    let state=await api('PUT','/advanced/connections/twilio',{...config,sessionOnly:true});
    assert.equal(state.advanced.connections[0].sessionOnly,true);
    assert.ok(!JSON.stringify(state).includes(config.apiKeySecret));
    state=await wait(s=>s.advanced.connections[0].stage!=='testing');
    assert.equal(state.advanced.connections[0].connected,true);assert.equal(messages.size,0);
    await api('POST','/advanced/sms/test-message',{recipient:'+15550001001',approved:false},400);
    await api('POST','/advanced/sms/test-message',{recipient:'5550001001',approved:true},400);
    state=await api('POST','/advanced/sms/test-message',{recipient:'+15550001001',recipientName:'أحمد',approved:true});
    const testId=state.advanced.tasks[0].id;
    state=await wait(s=>['Completed','Failed'].includes(s.advanced.tasks.find(t=>t.id===testId).status));
    assert.equal(state.advanced.tasks[0].status,'Completed',JSON.stringify(state.advanced.tasks[0]));
    assert.equal(messages.size,1);assert.match([...messages.values()][0].body,/Hello أحمد/);
    assert.equal(state.advanced.results[0].status,'Accepted');assert.equal(state.advanced.results[0].encoding,'UCS-2');
    const resultId=state.advanced.results[0].id;
    await api('POST',`/advanced/sms/results/${resultId}/refresh`);
    state=await wait(s=>s.advanced.results.find(r=>r.id===resultId).status==='Delivered');
    assert.equal(messages.size,1);assert.equal(state.advanced.results[0].segments,2);
    status='sent';await api('POST',`/advanced/sms/results/${resultId}/refresh`);
    state=await wait(s=>s.advanced.results[0].providerStatus==='sent');assert.equal(state.advanced.results[0].status,'Sent');
    await new Promise(r=>setTimeout(r,100));
    state=await api('POST','/advanced/tasks',{kind:'sms-send',name:'Personalized SMS campaign',source:'Zoë <+15550001002>\nAli <+15550001003>\n+1 (555) 000-1002',message:'Hi {{name}} & {{phone}}'});
    const campaignId=state.advanced.tasks[0].id;
    await api('POST',`/advanced/tasks/${campaignId}/run`,{approved:true});
    state=await wait(s=>['Completed','Failed'].includes(s.advanced.tasks.find(t=>t.id===campaignId).status));
    assert.equal(state.advanced.tasks[0].status,'Completed',JSON.stringify(state.advanced.tasks[0]));
    assert.equal(state.advanced.tasks[0].totalCount,2);assert.equal(messages.size,3);
    assert.match([...messages.values()][1].body,/Hi Zoë & \+15550001002/);
    await api('POST','/contacts',{name:'Do not SMS',channel:'Phone',value:'+1 (555) 000-1004',optedIn:false,list:'No outreach'});
    state=await api('POST','/advanced/tasks',{kind:'sms-send',name:'Blocked SMS',source:'Named <+15550001004>',message:'Hi'});
    await api('POST',`/advanced/tasks/${state.advanced.tasks[0].id}/run`,{approved:true},400);
    assert.equal(messages.size,3);
    state=await api('POST','/advanced/tasks',{kind:'sms-send',name:'Future approved SMS',source:'+15550001002',message:'Hi',scheduledAt:new Date(Date.now()+3600000).toISOString(),approved:true});
    const futureId=state.advanced.tasks[0].id;
    const db=new DatabaseSync(dbPath,{readOnly:true});
    assert.equal(db.prepare('SELECT count(*) AS n FROM credential_vault').get().n,0);
    assert.ok(!db.prepare('SELECT payload FROM workspaces').get().payload.includes(config.apiKeySecret));db.close();
    await stop();await start();
    state=await api('GET','/state');assert.equal(state.advanced.connections[0].stage,'expired');
    assert.equal(state.advanced.connections[0].configured,false);
    assert.equal(state.advanced.tasks.find(t=>t.id===futureId).status,'Needs review');
    assert.equal(messages.size,3);
    await api('POST','/advanced/sms/test-message',{recipient:'+15550001001',approved:true},400);
  } finally {
    if(service&&server)await stop().catch(()=>{});
    for(const socket of sockets)socket.destroy();
    await new Promise(r=>fixture.close(r));fs.rmSync(dir,{recursive:true,force:true});
  }
});
