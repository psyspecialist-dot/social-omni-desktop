const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {chromium}=require('../../artifacts/api-server/node_modules/playwright');
const {extract,phone}=require('./whatsapp-members.cjs');
const {taskInput,validateRun}=require('./advanced.cjs');
function fixture({direct=false,virtual=false,change=false}={}) {
  return `<!doctype html><meta charset="UTF-8">
  <style>#members{height:90px;overflow-y:auto}.row{height:80px}</style>
  <div id="pane-side"><span title="+19999999999">Unrelated sidebar</span></div>
  <div id="main"><header><button onclick="document.querySelector('aside').hidden=false"><span title="مجموعة الاختبار">مجموعة الاختبار</span></button></header><footer><button onclick="window.sent++">Send</button></footer></div>
  <aside data-testid="drawer-right" hidden><h2>${direct?'Contact info':'معلومات المجموعة'}</h2><div id="members"></div></aside>
  <script>
  window.sent=0;
  const rows=[
    ['أحمد','+212 600-000-001'],
    ['Zoë','+١٢٠٢٥٥٥٠١٠٢'],
    ['أحمد','+212600000001'],
    ['اسم محفوظ',''],
    ['Final member','+442070000001']
  ];
  function render(start=0) {
    document.querySelector('#members').innerHTML=rows.slice(start,${virtual?'start+2':'rows.length'}).map(([name,number])=>'<div class="row" data-testid="participant-row" role="listitem"><span title="'+name+'">'+name+'</span><span>'+number+'</span><span style="display:none">+18888888888</span></div>').join('');
  }
  render();
  ${virtual?"let batch=0;document.querySelector('#members').addEventListener('scroll',()=>{if(batch<2 && document.querySelector('#members').scrollTop>0){batch++;render(batch*2);document.querySelector('#members').scrollTop=0;}});":''}
  ${change?"document.querySelector('#members').addEventListener('scroll',()=>document.querySelector('header span').setAttribute('title','Another group'));":''}
  </script>`;
}
async function browserFixture(options,run) {
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||'/repl/tools/bin/chromium',args:['--no-sandbox']});
  try {
    const page=await browser.newPage();
    await page.route('https://web.whatsapp.com/**',r=>r.fulfill({contentType:'text/html',body:fixture(options)}));
    await page.goto('https://web.whatsapp.com/');
    await run(page);
    assert.equal(await page.evaluate(()=>window.sent),0);
  } finally {await browser.close();}
}
test('phone parsing preserves observed international digits, rejects guessed/national/invalid numbers',()=>{
  assert.equal(phone('+٢١٢ (٦٠٠) ٠٠٠-٠٠١'),'+212600000001');
  assert.equal(phone('+۱۲۰۲۵۵۵۰۱۰۲'),'+12025550102');
  for(const s of ['0600000001','2026-10-11','Admin +12025550102','+0123456789','+123']) assert.equal(phone(s),'');
});
test('reads group participants, deduplicates phones, excludes hidden and sidebar details',async()=>{
  await browserFixture({},async page=>{
    const rows=[];
    const summary=await extract({page,groupName:'مجموعة الاختبار',result:r=>rows.push(r),waitTimeout:100});
    assert.equal(summary.count,4);
    assert.deepEqual(rows.map(r=>r.phone),['+212600000001','+12025550102','','+442070000001']);
    assert.equal(rows[2].status,'Unknown');
    assert.match(rows[2].reason,/not inferred/);
  });
});
test('captures virtualized members across scroll batches and respects extraction limit',async()=>{
  await browserFixture({virtual:true},async page=>{
    const rows=[];
    await extract({page,groupName:'مجموعة الاختبار',result:r=>rows.push(r),waitTimeout:100});
    assert.equal(rows.length,4);
    assert.equal(rows.at(-1).phone,'+442070000001');
  });
  await browserFixture({},async page=>{
    const rows=[];
    const summary=await extract({page,groupName:'مجموعة الاختبار',limit:1,result:r=>rows.push(r),waitTimeout:100});
    assert.equal(summary.limitReached,true);assert.equal(rows.length,1);
  });
});
test('wrong group, direct conversation, changed group and cancellation stop without sending',async()=>{
  await browserFixture({},page=>assert.rejects(extract({page,groupName:'Wrong group',waitTimeout:0,result(){throw Error('Unexpected row');}}),/exact approved/));
  await browserFixture({direct:true},page=>assert.rejects(extract({page,groupName:'مجموعة الاختبار',result(){},waitTimeout:100}),/Direct chats/));
  await browserFixture({change:true},page=>assert.rejects(extract({page,groupName:'مجموعة الاختبار',result(){},waitTimeout:100}),/group changed/));
  await browserFixture({},page=>assert.rejects(extract({page,groupName:'مجموعة الاختبار',result(){},guard(){throw Error('cancelled');}}),/cancelled/));
});
test('requires authorized WhatsApp account and immediate manually reviewed extraction',()=>{
  const id=randomUUID(),state={store:{accounts:[{id,platform:'WhatsApp',status:'Active'}]}};
  const task=taskInput({kind:'whatsapp-members',name:'Members',query:'مجموعة الاختبار',accountId:id,approved:true});
  assert.equal(task.limit,2000);validateRun(state,task,{});
  assert.throws(()=>validateRun(state,{...task,approved:false},{}),/permission/);
  assert.throws(()=>validateRun(state,{...task,query:''},{}),/exact WhatsApp/);
  assert.throws(()=>validateRun(state,{...task,accountId:randomUUID()},{}),/active WhatsApp/);
  assert.throws(()=>taskInput({...task,limit:2001}),/1–2000/);
  assert.throws(()=>taskInput({...task,scheduledAt:new Date(Date.now()+100000).toISOString()}),/manually/);
});
test('full worker/API saves extracted phone numbers in SQLite and restores them after reopening', {timeout:60000},async()=>{
  const express=require('../../artifacts/api-server/node_modules/express');
  const createService=require('./service.cjs');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'najhin-members-')),dbPath=path.join(dir,'workspace.sqlite'),workspace=randomUUID();
  let service,server;
  const runtime={profileDir:path.join(dir,'profiles'),chromium:{async launchPersistentContext(profile,options){
    const context=await chromium.launchPersistentContext(profile,{...options,headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||'/repl/tools/bin/chromium',args:['--no-sandbox']});
    await context.route('https://web.whatsapp.com/**',r=>r.fulfill({contentType:'text/html',body:fixture({virtual:true})}));
    return context;
  }}};
  const start=async()=>{
    service=createService({express,dbPath,automation:runtime});
    const app=express();app.use(express.json());app.use('/api/socialomni',service.router);
    server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  };
  const api=async(method,route,body)=>{
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api/socialomni${route}`,{method,headers:{'content-type':'application/json','x-socialomni-workspace':workspace},body:body===undefined?undefined:JSON.stringify(body)});
    const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data;
  };
  const stop=async()=>{await service.close();await new Promise(resolve=>server.close(resolve));};
  try {
    await start();
    let state=await api('POST','/accounts',{platform:'WhatsApp',displayLabel:'Local test account',handle:'Fixture',status:'Active label'});
    const account=state.store.accounts[0];
    state=await api('POST','/advanced/tasks',{kind:'whatsapp-members',name:'Local extraction',query:'مجموعة الاختبار',accountId:account.id,limit:2000});
    const task=state.advanced.tasks[0];
    await api('POST',`/advanced/tasks/${task.id}/run`,{approved:true});
    const deadline=Date.now()+35000;
    while(Date.now()<deadline) {
      state=await api('GET','/state');
      if(['Failed','Completed'].includes(state.advanced.tasks[0].status)) break;
      await new Promise(r=>setTimeout(r,100));
    }
    assert.equal(state.advanced.tasks[0].status,'Completed',JSON.stringify(state.advanced.tasks[0]));
    assert.equal(state.advanced.tasks[0].totalCount,4);
    assert.equal(state.advanced.tasks[0].completedCount,4);
    const numbers=state.advanced.results.filter(r=>r.phone).map(r=>r.phone).sort();
    assert.deepEqual(numbers,['+12025550102','+212600000001','+442070000001']);
    assert.equal(state.advanced.results.length,4);
    await stop();await start();
    const restored=await api('GET','/state');
    assert.deepEqual(restored.advanced.results,state.advanced.results);
    assert.equal(restored.advanced.tasks[0].status,'Completed');
    const limited=await api('POST','/advanced/tasks',{kind:'whatsapp-members',name:'Bounded extraction',query:'مجموعة الاختبار',accountId:account.id,limit:1});
    const limitedId=limited.advanced.tasks[0].id;
    await api('POST',`/advanced/tasks/${limitedId}/run`,{approved:true});
    let capped;
    const capDeadline=Date.now()+20000;
    while(Date.now()<capDeadline) {
      capped=await api('GET','/state');
      if(['Needs review','Failed','Completed'].includes(capped.advanced.tasks[0].status)) break;
      await new Promise(r=>setTimeout(r,100));
    }
    assert.equal(capped.advanced.tasks[0].status,'Needs review',JSON.stringify(capped.advanced.tasks[0]));
    assert.equal(capped.advanced.tasks[0].completedCount,1);
    assert.equal(capped.advanced.tasks[0].totalCount,1);
    assert.match(capped.advanced.tasks[0].error,/partial/);
  } finally {if(service&&server) await stop().catch(()=>{});fs.rmSync(dir,{recursive:true,force:true});}
});
