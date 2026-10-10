const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),tls=require('node:tls');
const {execFileSync}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const express=require('../../artifacts/api-server/node_modules/express');
const nodemailer=require('../../artifacts/api-server/node_modules/nodemailer');
const createService=require('./service.cjs');

test('email API runs the real worker and Nodemailer against an authenticated TLS SMTP fixture', {timeout:90000}, async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'najhin-smtp-network-')),workspace=randomUUID(),events=[],messages=[],sockets=new Set();
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=localhost',
    '-addext','subjectAltName=DNS:localhost','-keyout',path.join(dir,'key.pem'),'-out',path.join(dir,'cert.pem')],{stdio:'ignore'});
  const cert=fs.readFileSync(path.join(dir,'cert.pem'));
  const smtp=tls.createServer({key:fs.readFileSync(path.join(dir,'key.pem')),cert},socket=>{
    sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});
    socket.write('220 localhost fixture SMTP\r\n');
    let buffer='',data=false,mail=[],authorized=false;
    socket.on('data',chunk=>{
      buffer+=chunk.toString();
      while(buffer.includes('\r\n')) {
        const end=buffer.indexOf('\r\n'),line=buffer.slice(0,end);buffer=buffer.slice(end+2);
        if(data) {
          if(line==='.') {messages.push(mail.join('\r\n'));mail=[];data=false;socket.write('250 2.0.0 Fixture accepted\r\n');}
          else mail.push(line);
        } else if(/^EHLO|^HELO/.test(line)) socket.write('250-localhost\r\n250 AUTH PLAIN\r\n');
        else if(/^AUTH PLAIN /.test(line)) {
          const auth=Buffer.from(line.slice(11),'base64').toString();
          authorized=auth==='\0fixture-user\0fixture-password';
          socket.write(authorized?'235 2.7.0 Authenticated\r\n':'535 5.7.8 Authentication rejected\r\n');
        } else if(/^RCPT TO:.*rejected@fixture.invalid/i.test(line)) socket.write('550 5.1.1 Recipient rejected\r\n');
        else if(/^MAIL FROM:|^RCPT TO:/.test(line)) socket.write(authorized?'250 2.1.0 Accepted\r\n':'530 Authentication required\r\n');
        else if(line==='DATA') {data=true;socket.write('354 End with a dot\r\n');}
        else if(line==='QUIT') {socket.end('221 Bye\r\n');}
        else socket.write('250 OK\r\n');
      }
    });
  });
  await new Promise((resolve,reject)=>{smtp.once('error',reject);smtp.listen(465,'127.0.0.1',resolve);});
  const original=nodemailer.createTransport;
  // Trust only this fixture CA; retain certificate/hostname verification.
  nodemailer.createTransport=options=>original({...options,tls:{...options.tls,ca:cert}});
  const service=createService({express,dbPath:path.join(dir,'workspace.sqlite'),
    automation:{onEvent:event=>events.push(event)},
    secureStore:{available:()=>true,encrypt:v=>Buffer.from(v),decrypt:v=>Buffer.from(v).toString()}});
  const app=express();app.use(express.json());app.use('/api/socialomni',service.router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const api=async(method,route,body)=>{
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api/socialomni${route}`,{method,
      headers:{'content-type':'application/json','x-socialomni-workspace':workspace},
      body:body===undefined?undefined:JSON.stringify(body)});
    const state=await response.json();assert.equal(response.status,200,state.error);return state;
  };
  try {
    await api('POST','/initialize');
    await api('PUT','/advanced/connections/smtp',{host:'localhost',port:465,secure:true,username:'fixture-user',password:'fixture-password',from:'sender@fixture.invalid'});
    let state=await api('POST','/advanced/tasks',{kind:'email-send',name:'TLS fixture only',source:'rejected@fixture.invalid\nrecipient@fixture.invalid',
      message:'Fixture mail only',subject:'Fixture test',limit:2,approved:false});
    const id=state.advanced.tasks[0].id;
    for(let i=0;i<100;i++){
      state=await api('GET','/state');
      if(state.advanced.connections[0].stage==='connected') break;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.equal(state.advanced.connections[0].stage,'connected',state.advanced.connections[0].error);
    await api('POST',`/advanced/tasks/${id}/run`,{approved:true});
    for(let i=0;i<600;i++) {
      state=await api('GET','/state');
      if(['Completed','Failed'].includes(state.advanced.tasks[0].status)) break;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.equal(state.advanced.tasks[0].status,'Failed', 'an explicit rejection is reported, not fake success');
    assert.equal(state.advanced.tasks[0].completedCount,2);
    assert.equal(state.advanced.tasks[0].progress,100, 'all recipients were actually processed');
    assert.equal(state.advanced.results.find(r=>r.email==='rejected@fixture.invalid').status,'Rejected');
    assert.equal(messages.length,1);
    assert.match(messages[0],/To: recipient@fixture.invalid/);assert.match(messages[0],/Fixture mail only/);
    assert.equal(state.advanced.results[0].status,'Accepted');
    assert.ok(events.some(e=>e.platform==='Email' && e.level==='success'));
    assert.ok(!JSON.stringify(state).includes('fixture-password'),'credentials never enter UI state');
  } finally {
    await new Promise(resolve=>server.close(resolve));await service.close();
    for(const socket of sockets) socket.destroy();
    await new Promise(resolve=>smtp.close(resolve));nodemailer.createTransport=original;
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
