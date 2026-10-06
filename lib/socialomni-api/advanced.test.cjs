const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const express=require('../../artifacts/api-server/node_modules/express');
const createService=require('./service.cjs'),advanced=require('./advanced.cjs'),network=require('./advanced-network.cjs');
const createEngine=require('./advanced-worker.cjs'),deps=require('./advanced-deps.cjs');
test('advanced drafts, hosted guards, validation, persistence and restart safety',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'najhin-advanced-')),dbPath=path.join(dir,'workspace.sqlite'),id=randomUUID();
  let service,server,base;
  const start=async()=>{
    service=createService({express,dbPath});
    const app=express();app.use(express.json());app.use(service.router);
    server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});base=`http://127.0.0.1:${server.address().port}`;
  };
  const stop=async()=>{await new Promise(resolve=>server.close(resolve));service.close();};
  const req=async(method,url,body,status=200,workspace=id)=>{
    const res=await fetch(base+url,{method,headers:{'content-type':'application/json','x-socialomni-workspace':workspace},body:body===undefined?undefined:JSON.stringify(body)});
    const data=await res.json();assert.equal(res.status,status,JSON.stringify(data));return data;
  };
  try {
    await start();await req('POST','/initialize');
    const draft={kind:'email-send',name:'Approved campaign',source:'client@example.com',message:'Hello {{name}}',subject:'A test campaign'};
    let state=await req('POST','/advanced/tasks',draft);
    const taskId=state.advanced.tasks[0].id;
    assert.equal(state.advanced.tasks[0].limit,200,'bulk recipients must not be silently truncated to 20');
    await req('POST',`/advanced/tasks/${taskId}/run`,{approved:true},422);
    await req('PUT','/advanced/connections/smtp',{password:'NOT_A_REAL_SECRET'},422);
    await req('POST','/advanced/telegram/auth',{action:'start',value:'+15550000001'},422);
    await req('POST','/advanced/tasks',{kind:'bogus',name:'Bad'},400);
    await req('POST','/advanced/tasks',{...draft,limit:201},400);
    state=await req('PATCH',`/advanced/tasks/${taskId}`,{...draft,message:'Edited text',scheduledAt:new Date(Date.now()+3600000).toISOString()});
    assert.equal(state.advanced.tasks[0].status,'Draft','an unapproved schedule cannot send');
    assert.equal((await req('GET','/state',undefined,200,randomUUID())).advanced.tasks.length,0);
    await stop();
    const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(dbPath);
    const payload=JSON.parse(db.prepare('SELECT payload FROM workspaces WHERE id=?').get(id).payload);
    const extra=mode=>({...payload.advanced.tasks[0],id:randomUUID(),status:mode,scheduledAt:mode==='Scheduled'?new Date(Date.now()-60000).toISOString():''});
    payload.advanced.tasks.push(extra('Queued'),extra('Scheduled'),{...extra('Scheduled'),scheduledAt:new Date(Date.now()+3600000).toISOString()});
    db.prepare('UPDATE workspaces SET payload=? WHERE id=?').run(JSON.stringify(payload),id);db.close();
    await start();
    state=await req('GET','/state');
    assert.equal(state.advanced.tasks[0].message,'Edited text');
    assert.deepEqual(state.advanced.tasks.slice(1).map(t=>t.status),['Needs review','Needs review','Scheduled']);
    await req('POST',`/advanced/tasks/${state.advanced.tasks[3].id}/cancel`);
    await req('DELETE',`/advanced/tasks/${taskId}`);
    await req('POST','/advanced/tasks',{kind:'b2b',name:'Website facts',source:'https://example.com'});
    state=await req('DELETE','/state');assert.deepEqual(state.advanced,advanced.defaults());
  } finally {if(server?.listening)await stop();fs.rmSync(dir,{recursive:true,force:true});}
});
test('business facts, public-only networking and honest email-domain classifications',async()=>{
  for(const value of ['127.0.0.1','10.1.2.3','172.16.5.1','169.254.1.2','::1','::ffff:127.0.0.1','fc00::1']) assert.equal(network.publicAddress(value),false,value);
  assert.equal(network.publicAddress('8.8.8.8'),true);
  await assert.rejects(network.publicUrl('https://public.example',async()=>[{address:'127.0.0.1',family:4}]));
  await assert.rejects(network.publicUrl('http://example.com'));
  const data=network.business('<title>Acme</title><script type="application/ld+json">{"@type":"LocalBusiness","name":"Acme Clinic","telephone":"+15550000001","address":{"streetAddress":"One Main","addressLocality":"Town"}}</script><a href="mailto:office@example.com">Email</a>','https://example.com');
  assert.equal(data.name,'Acme Clinic');assert.equal(data.phone,'+15550000001');assert.equal(data.email,'office@example.com');assert.equal(data.address,'One Main, Town');
  assert.equal(network.business('<title>Only a title</title>','https://example.com').phone,'');
  assert.equal((await network.verifyEmail('invalid',async()=>[])).status,'Invalid');
  for(const address of ['a..b@example.com','.a@example.com','a@example..com','a@-example.com']) assert.equal(advanced.email(address),false);
  assert.deepEqual(advanced.lines('https://example.com/?a=1,2\nhttps://example.com/?a=1,2'),['https://example.com/?a=1,2']);
  const result=await network.verifyEmail('office@example.com',async()=>[{exchange:'mx.example.com',priority:10}]);
  assert.equal(result.status,'Domain ready');assert.match(result.reason,/unknown/);
  assert.equal((await network.verifyEmail('office@example.com',async()=>[{exchange:'.',priority:0}])).status,'Invalid');
  assert.equal((await network.verifyEmail('office@example.com',async()=>{throw Object.assign(new Error(),{code:'ETIMEOUT'});})).status,'Unknown');
});
test('paced SMTP submissions reserve attempts, confirm acceptance, and never retry ambiguity',async t=>{
  t.mock.timers.enable({apis:['Date','setTimeout','setInterval']});
  const mail=deps('nodemailer'),original=mail.createTransport;
  let sends=0,fail=false;
  mail.createTransport=()=>({verify:async()=>true,close(){},sendMail:async message=>{
    sends++; if(fail) throw new Error('NOT_A_REAL_SECRET must not appear in persisted errors');return {accepted:[message.to]};
  }});
  let state={advanced:{...advanced.defaults(),connections:[{id:'smtp',configured:true,connected:true,stage:'connected'}]},
    store:{contacts:[],accounts:[],activity:[]},jobs:[],media:[],settings:{delayMin:5,delayMax:12}};
  const config={host:'smtp.example.com',port:587,secure:false,username:'fixture',password:'NOT_A_REAL_SECRET',from:'sender@example.com'};
  const make=()=>({...advanced.taskInput({kind:'email-send',name:'Fixture',source:'client@example.com',subject:'Test',message:'Hello',approved:true}),
    id:randomUUID(),status:'Queued',phase:'Queued',completedCount:0,totalCount:0,progress:0,createdAt:new Date().toISOString()});
  let task=make();state.advanced.tasks.push(task);
  const engine=createEngine({get:()=>structuredClone(state),save:(_id,s)=>{state=structuredClone(s);},ids:()=>['fixture'],recordActivity:(s,message)=>s.store.activity.push({message}),
    runtime:{},vault:{read:()=>config},kickLegacy(){},cancelLegacy(){},readMedia(){}});
  const step=async()=>{t.mock.timers.tick(1000);await new Promise(resolve=>setImmediate(resolve));};
  try {
    await step();assert.equal(sends,0,'never send immediately');
    for(let i=0;i<35 && state.advanced.tasks[0].status!=='Completed';i++)await step();
    assert.equal(state.advanced.tasks[0].status,'Completed');assert.equal(sends,1);
    assert.equal(state.advanced.results[0].status,'Accepted');assert.match(state.advanced.results[0].reason,/not guaranteed/);
    assert.ok(!JSON.stringify(state).includes(config.password));
    fail=true;task=make();state.advanced.tasks.push(task);
    for(let i=0;i<35 && state.advanced.tasks[1].status!=='Failed';i++)await step();
    assert.equal(state.advanced.tasks[1].status,'Failed');
    assert.equal(state.advanced.results[0].status,'Unconfirmed');
    const before=sends;for(let i=0;i<20;i++)await step();assert.equal(sends,before,'failed sends cannot automatically retry');
    assert.ok(!JSON.stringify(state).includes(config.password),'provider exception bodies must not persist');
  } finally {engine.close();mail.createTransport=original;}
});
test('native credential adapter encrypts secrets, strips responses, and supports approved schedule cancellation',async()=>{
  const crypto=require('node:crypto'),key=crypto.randomBytes(32);
  const secureStore={available:()=>true,
    encrypt(value){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
      const ciphertext=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),ciphertext]);},
    decrypt(value){const decipher=crypto.createDecipheriv('aes-256-gcm',key,value.subarray(0,12));decipher.setAuthTag(value.subarray(12,28));
      return Buffer.concat([decipher.update(value.subarray(28)),decipher.final()]).toString('utf8');}};
  const mail=deps('nodemailer'),original=mail.createTransport;
  mail.createTransport=()=>({verify:async()=>true,close(){}});
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'najhin-vault-')),dbPath=path.join(dir,'workspace.sqlite'),id=randomUUID();
  const service=createService({express,dbPath,automation:{},secureStore});
  const app=express();app.use(express.json());app.use(service.router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const base=`http://127.0.0.1:${server.address().port}`;
  const req=async(method,url,body,status=200)=>{
    const res=await fetch(base+url,{method,headers:{'content-type':'application/json','x-socialomni-workspace':id},body:body===undefined?undefined:JSON.stringify(body)});
    const data=await res.json();assert.equal(res.status,status,JSON.stringify(data));return data;
  };
  try {
    await req('POST','/initialize');
    let state=await req('PUT','/advanced/connections/smtp',{host:'smtp.example.com',port:587,secure:false,from:'sender@example.com',username:'FIXTURE_USERNAME',password:'FIXTURE_NOT_REAL_PASSWORD'});
    assert.ok(!JSON.stringify(state).includes('FIXTURE_NOT_REAL_PASSWORD'));
    for(let i=0;i<10 && !state.advanced.connections[0].connected;i++){await new Promise(resolve=>setImmediate(resolve));state=await req('GET','/state');}
    assert.equal(state.advanced.connections[0].stage,'connected');
    state=await req('PUT','/advanced/connections/telegram',{apiId:12345,apiHash:'a'.repeat(32)});
    assert.ok(!JSON.stringify(state).includes('a'.repeat(32)));
    const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(dbPath);
    const rows=db.prepare('SELECT data FROM credential_vault').all();assert.equal(rows.length,2);
    assert.ok(rows.every(r=>!Buffer.from(r.data).toString().includes('FIXTURE_NOT_REAL_PASSWORD')));db.close();
    state=await req('POST','/advanced/tasks',{kind:'email-send',name:'Approved future campaign',source:'client@example.com',message:'Hello',subject:'A fixture',
      scheduledAt:new Date(Date.now()+3600000).toISOString(),approved:true});
    assert.equal(state.advanced.tasks[0].status,'Scheduled');
    state=await req('POST',`/advanced/tasks/${state.advanced.tasks[0].id}/cancel`);
    assert.equal(state.advanced.tasks[0].status,'Cancelled');
    await req('DELETE','/advanced/connections/telegram');await req('DELETE','/advanced/connections/smtp');
    state=await req('GET','/state');assert.equal(state.advanced.connections.length,0);
  } finally {await new Promise(resolve=>server.close(resolve));service.close();mail.createTransport=original;fs.rmSync(dir,{recursive:true,force:true});}
});
