const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),tls=require('node:tls');
const {execFileSync}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const {recipients,personalize,transportOptions}=require('./email-marketing.cjs');
test('recipient names, address deduplication and literal personalization are safe',()=>{
  const list=recipients('أحمد <client@example.com>\nclient@example.com\nZoë <other@example.com>');
  assert.deepEqual(list,[{name:'أحمد',email:'client@example.com'},{name:'Zoë',email:'other@example.com'}]);
  assert.equal(personalize('Hi {{name}} / {{email}}',list[0],{name:'Contact'}),'Hi أحمد / client@example.com');
  assert.equal(personalize('{{name}}',{name:'$& {{email}}',email:'a@example.com'}),'$& {{email}}');
  assert.equal(personalize('{{name}}',{name:'',email:'a@example.com'},{name:'Saved Name'}),'Saved Name');
  assert.equal(personalize('{{name}}',{name:'',email:'a@example.com'}),'a@example.com');
  for(const source of ['Bad <invalid>','Injected <x@example.com> extra','x@example.com\nBcc: other@example.com','']) assert.throws(()=>recipients(source));
  assert.equal(transportOptions({secure:false}).requireTLS,true);
  assert.equal(transportOptions({secure:true}).tls.rejectUnauthorized,true);
});
function smtpServer(options,messages) {
  const sockets=new Set();
  const server=tls.createServer(options,socket=>{
    sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});
    let buffer='',data=false,auth=false,recipient='';
    socket.setEncoding('utf8');socket.write('220 localhost Social Najhin local test\r\n');
    socket.on('data',chunk=>{
      buffer+=chunk;
      while(true) {
        if(data) {
          const end=buffer.indexOf('\r\n.\r\n');if(end<0) return;
          messages.push({recipient,raw:buffer.slice(0,end)});buffer=buffer.slice(end+5);data=false;
          socket.write('250 2.0.0 Accepted for local test\r\n');continue;
        }
        const end=buffer.indexOf('\r\n');if(end<0) return;
        const line=buffer.slice(0,end);buffer=buffer.slice(end+2);
        if(/^EHLO /i.test(line)) socket.write('250-localhost\r\n250 AUTH PLAIN\r\n');
        else if(/^AUTH PLAIN /i.test(line)) {
          auth=Buffer.from(line.slice(11),'base64').toString()==='\0fixture\0LOCAL_TEST_PASSWORD';
          socket.write(auth?'235 Authentication successful\r\n':'535 Authentication rejected\r\n');
        } else if(/^MAIL FROM:/i.test(line)) socket.write(auth?'250 Sender accepted\r\n':'530 Authentication required\r\n');
        else if(/^RCPT TO:/i.test(line)) {recipient=line.match(/<([^>]+)>/)?.[1] || '';socket.write('250 Recipient accepted\r\n');}
        else if(/^DATA$/i.test(line)) {data=true;socket.write('354 End with dot\r\n');}
        else if(/^QUIT$/i.test(line)) socket.end('221 Bye\r\n');
        else if(/^RSET$/i.test(line)) socket.write('250 Reset\r\n');
        else socket.write('502 Not supported\r\n');
      }
    });
  });
  return {server,close:async()=>{for(const s of sockets)s.destroy();await new Promise(r=>server.close(r));}};
}
test('cached password is reused only for the same SMTP host and username',()=>{
  const {install,defaults}=require('./advanced.cjs');
  const handlers={};
  let cached={host:'smtp.example.com',port:587,secure:false,username:'fixture',password:'LOCAL_TEST_PASSWORD',from:'sender@example.com'};
  const state={jobs:[],advanced:defaults()};
  install({route:(verb,url,fn)=>{handlers[`${verb} ${url}`]=fn;},runtime:{},
    vault:{available:()=>false,read:()=>cached,write:(_workspace,_key,config)=>{cached=config;}},
    engine:{authBusy:()=>false,testSmtp(){}},recordActivity(){}});
  const save=body=>handlers['put /advanced/connections/:id'](state,{workspaceId:'fixture',params:{id:'smtp'},body});
  const config={...cached,password:'',sessionOnly:true};
  save(config);assert.equal(cached.password,'LOCAL_TEST_PASSWORD');
  assert.throws(()=>save({...config,host:'other.example.com'}),/password/);
  assert.throws(()=>save({...config,username:'different-user'}),/password/);
  assert.equal(cached.host,'smtp.example.com');
});
function messageText(raw) {
  const [headers,...body]=raw.split('\r\n\r\n'),content=body.join('\r\n\r\n');
  if(/Content-Transfer-Encoding: base64/i.test(headers)) return Buffer.from(content.replace(/\s/g,''),'base64').toString('utf8');
  if(/Content-Transfer-Encoding: quoted-printable/i.test(headers)) {
    return Buffer.from(content.replace(/=\r\n/g,'').replace(/=([a-f0-9]{2})/ig,(_s,h)=>String.fromCharCode(parseInt(h,16))),'binary').toString('utf8');
  }
  return content;
}
test('real Nodemailer sends personalized TLS/authenticated mail; session settings never enter SQLite and expire on restart', {timeout:110000},async()=>{
  const express=require('../../artifacts/api-server/node_modules/express');
  const deps=require('./advanced-deps.cjs'),mail=deps('nodemailer'),original=mail.createTransport;
  const createService=require('./service.cjs');
  const {DatabaseSync}=require('node:sqlite');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'najhin-smtp-')),dbPath=path.join(dir,'workspace.sqlite'),workspace=randomUUID();
  const certPath=path.join(dir,'cert.pem'),keyPath=path.join(dir,'key.pem');
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost','-keyout',keyPath,'-out',certPath],{stdio:'ignore'});
  const cert=fs.readFileSync(certPath),messages=[];
  const fixture=smtpServer({key:fs.readFileSync(keyPath),cert},messages);
  await new Promise(r=>fixture.server.listen(0,'127.0.0.1',r));
  // Real SMTP transport; only remap the standard port to our isolated listener
  // and trust the test certificate. Production keeps certificate verification on.
  mail.createTransport=options=>{
    assert.equal(options.tls.rejectUnauthorized,true);
    return original({...options,host:'localhost',port:fixture.server.address().port,tls:{...options.tls,ca:cert}});
  };
  let service,server;
  const start=async()=>{
    service=createService({express,dbPath,automation:{}});
    const app=express();app.use(express.json());app.use(service.router);
    server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});
  };
  const stop=async()=>{await service.close();await new Promise(r=>server.close(r));};
  const api=async(method,route,body,status=200)=>{
    const response=await fetch(`http://127.0.0.1:${server.address().port}${route}`,{method,headers:{'content-type':'application/json','x-socialomni-workspace':workspace},body:body===undefined?undefined:JSON.stringify(body)});
    const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));return data;
  };
  const wait=async(predicate)=>{
    const deadline=Date.now()+45000;
    while(Date.now()<deadline) {
      const state=await api('GET','/state');
      if(predicate(state)) return state;
      await new Promise(r=>setTimeout(r,100));
    }
    throw new Error('Timed out waiting for SMTP task.');
  };
  try {
    await start();
    await api('PUT','/advanced/connections/smtp',{host:'localhost',port:465,secure:true,username:'fixture',password:'LOCAL_TEST_PASSWORD',from:'sender@example.com',sessionOnly:true});
    let state=await wait(s=>s.advanced.connections[0]?.stage!=='testing');
    assert.equal(state.advanced.connections[0].connected,true);
    assert.equal(state.advanced.connections[0].settings.host,'localhost');
    assert.ok(!JSON.stringify(state).includes('LOCAL_TEST_PASSWORD'));
    await api('POST','/advanced/smtp/test-message',{recipient:'client@example.com',recipientName:'Alice',approved:false},400);
    state=await api('POST','/advanced/smtp/test-message',{recipient:'client@example.com',recipientName:'Alice',approved:true});
    const testId=state.advanced.tasks[0].id;
    state=await wait(s=>['Completed','Failed'].includes(s.advanced.tasks.find(t=>t.id===testId).status));
    assert.equal(state.advanced.tasks[0].status,'Completed',JSON.stringify(state.advanced.tasks[0]));
    assert.equal(messages.length,1);
    assert.equal(messages[0].recipient,'client@example.com');
    assert.match(messageText(messages[0].raw),/Hello Alice/);
    assert.match(messageText(messages[0].raw),/client@example.com/);
    assert.equal(state.advanced.results[0].status,'Accepted');
    await new Promise(r=>setTimeout(r,100));
    state=await api('POST','/advanced/tasks',{kind:'email-send',name:'Personalized campaign',source:'أحمد <a@example.com>\nZoë <b@example.com>\na@example.com',subject:'Welcome {{name}}',message:'Hello {{name}}, your email is {{email}}.'});
    const campaignId=state.advanced.tasks[0].id;
    await api('POST',`/advanced/tasks/${campaignId}/run`,{approved:true});
    state=await wait(s=>['Completed','Failed'].includes(s.advanced.tasks.find(t=>t.id===campaignId).status));
    assert.equal(state.advanced.tasks[0].status,'Completed',JSON.stringify(state.advanced.tasks[0]));
    assert.equal(state.advanced.tasks[0].totalCount,2);
    assert.equal(messages.length,3,'duplicate address receives one campaign email');
    assert.match(messageText(messages[1].raw),/Hello أحمد, your email is a@example.com/);
    assert.match(messageText(messages[2].raw),/Hello Zoë, your email is b@example.com/);
    const reader=new DatabaseSync(dbPath,{readOnly:true});
    assert.equal(reader.prepare('SELECT count(*) AS n FROM credential_vault').get().n,0);
    assert.ok(!reader.prepare('SELECT payload FROM workspaces').get().payload.includes('LOCAL_TEST_PASSWORD'));
    reader.close();
    await stop();await start();
    state=await api('GET','/state');
    assert.equal(state.advanced.connections[0].configured,false);
    assert.equal(state.advanced.connections[0].stage,'expired');
    assert.equal(state.advanced.connections[0].settings,undefined);
    await api('POST','/advanced/smtp/test-message',{recipient:'client@example.com',approved:true},400);
    assert.equal(messages.length,3);
  } finally {
    mail.createTransport=original;
    if(service&&server) await stop().catch(()=>{});
    await fixture.close();fs.rmSync(dir,{recursive:true,force:true});
  }
});
