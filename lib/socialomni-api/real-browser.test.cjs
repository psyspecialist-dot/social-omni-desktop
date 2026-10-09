const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const express=require('../../artifacts/api-server/node_modules/express');
const {chromium}=require('../../artifacts/api-server/node_modules/playwright');
const serviceFactory=require('./service.cjs');
const fixture=require('./browser-fixtures.cjs');
const {readable}=require('./automation-errors.cjs');

test('real Chromium runs Maps, WhatsApp sends, Facebook search/post and WaFilter through SQLite API routes', {timeout:240000}, async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'najhin-real-browser-'));
  const dbPath=path.join(dir,'workspace.sqlite'),workspace=randomUUID(),events=[],contexts=[],requests=[];
  const runtime={profileDir:path.join(dir,'profiles'),onEvent:e=>events.push(e),chromium:{
    async launchPersistentContext(profile,options) {
      assert.equal(options.headless,false, 'production requests a visible browser');
      const context=await chromium.launchPersistentContext(profile,{...options,headless:true,
        executablePath:process.env.CHROMIUM_EXECUTABLE || '/repl/tools/bin/chromium',args:['--no-sandbox']});
      await context.route('**/*',route=>{requests.push(route.request().url());return route.fulfill({contentType:'text/html',body:fixture(route.request().url())});});
      context.on('page',page=>page.on('console',()=>{}));
      contexts.push(context);return context;
    },
  }};
  const service=serviceFactory({express,dbPath,automation:runtime});
  const app=express();app.use(express.json());app.use('/api/socialomni',service.router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const api=async(method,route,body)=>{
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api/socialomni${route}`,{method,
      headers:{'content-type':'application/json','x-socialomni-workspace':workspace},
      body:body===undefined?undefined:JSON.stringify(body)});
    const data=await response.json();assert.equal(response.status,200,data.error);return data;
  };
  const completed=async(id,expected='Completed')=>{
    for(let i=0;i<900;i++) {
      const state=await api('GET','/state'),job=state.jobs.find(j=>j.id===id);
      if(['Completed','Failed','Cancelled'].includes(job.status)) {
        assert.equal(job.status,expected,JSON.stringify({phase:job.phase,error:job.error,activity:state.store.activity.slice(0,3)}));
        // Wait for context close/profile flush and queue cleanup, not just the completed flag.
        for(const context of contexts) await context.close().catch(()=>{});
        await new Promise(resolve=>setTimeout(resolve,100));return state;
      }
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    throw new Error('Real-browser job did not reach a terminal status.');
  };
  try {
    await api('POST','/initialize');
    await api('PUT','/settings',{delayMin:5,delayMax:5,phoneNumbers:'+12025550101\n+12025550102\n+12025550103',messageContent:'Fixture message only'});
    const wa=(await api('POST','/accounts',{platform:'WhatsApp',displayLabel:'Fixture WhatsApp',handle:'fixture',status:'Active label'})).store.accounts.find(a=>a.platform==='WhatsApp');
    const fb=(await api('POST','/accounts',{platform:'Facebook',displayLabel:'Fixture Facebook',handle:'fixture',status:'Active label'})).store.accounts.find(a=>a.platform==='Facebook');
    await api('PUT','/leads',{keyword:'fixture',city:'test city',targetCount:2});
    let state=await api('POST','/jobs',{kind:'leads',mode:'live'});
    assert.equal(state.jobs[0].mode,'live');
    state=await completed(state.jobs[0].id);
    assert.equal(state.leads.results.length,2);
    assert.deepEqual(state.leads.results.map(r=>r.businessName),['Fixture Alpha','Fixture Beta']);
    assert.ok(state.leads.results.every(r=>r.simulated===false && r.phoneNumber==='+12025550101'));
    state=await api('POST','/browser/jobs',{action:'send',accountId:wa.id,approved:true});
    state=await completed(state.jobs[0].id,'Failed');
    assert.deepEqual(state.jobs[0].targets.map(t=>t.sendStatus),['Sent','Failed','Sent']);
    assert.match(state.jobs[0].targets[1].error,/No message was submitted/);
    assert.equal(state.jobs[0].completedCount,2);assert.equal(state.jobs[0].progress,100);
    assert.equal(state.analytics.realMessagesSent,2);
    state=await api('POST','/browser/jobs',{action:'search',accountId:fb.id,keywords:'fixture permitted group'});
    state=await completed(state.jobs[0].id);
    assert.equal(state.jobs[0].discoveredGroups.length,1,'unrelated sidebar groups must not become search results');
    assert.equal(state.jobs[0].discoveredGroups[0].url,'https://www.facebook.com/groups/123456/');
    assert.ok(requests.some(url=>new URL(url).pathname==='/search/top/' && new URL(url).searchParams.get('q')==='fixture permitted group'),'search typed keywords and pressed Enter');
    state=await api('POST','/browser/jobs',{action:'join',accountId:fb.id,groupUrls:'https://www.facebook.com/groups/234567/',approved:true});
    state=await completed(state.jobs[0].id);
    assert.equal(state.jobs[0].targets[0].joinStatus,'Requested');
    state=await api('POST','/campaigns',{title:'Fixture posting',platform:'Facebook',caption:'Fixture post only',status:'Draft',
      scheduledAt:'',keywords:'fixture',targetGroupCount:1,accountId:fb.id,mediaId:null});
    const campaign=state.store.campaigns[0];
    state=await api('POST','/browser/jobs',{action:'publish',accountId:fb.id,campaignId:campaign.id,groupUrls:'https://www.facebook.com/groups/123456/',approved:true});
    state=await completed(state.jobs[0].id);
    assert.equal(state.jobs[0].targets[0].postStatus,'Posted');
    await api('PUT','/suite/filter',{source:'+12025550101\n+12025550102'});
    state=await api('POST','/suite/session',{action:'filter',accountId:wa.id,approved:true});
    state=await completed(state.jobs[0].id);
    assert.deepEqual(state.waSuite.filter.results.map(r=>r.status),['Active/Valid','Inactive']);
    assert.ok(events.some(e=>e.platform==='Maps' && e.level==='success'));
    assert.ok(events.some(e=>e.message.includes('accepted the message')));
    assert.ok(events.some(e=>e.message.includes('WaFilter')));
    assert.ok(state.store.accounts.every(a=>a.browserConnectedAt));
    // A broken page reports the exact missing control; it is not treated as success.
    const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE || '/repl/tools/bin/chromium',args:['--no-sandbox']});
    try {
      const page=await browser.newPage();await page.setContent('<p>Changed layout</p>');
      await assert.rejects(readable(page,[page.getByRole('button',{name:'Send'})],'WhatsApp Send button',500),/Required platform control unavailable: WhatsApp Send button/);
    } finally {await browser.close();}
    await service.close();
    const reopened=serviceFactory({express,dbPath});
    const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(dbPath);
    const saved=JSON.parse(db.prepare('SELECT payload FROM workspaces WHERE id=?').get(workspace).payload);
    assert.equal(saved.leads.results.length,2);assert.equal(saved.analytics.realMessagesSent,2);
    db.close();await reopened.close();
  } finally {
    await new Promise(resolve=>server.close(resolve));
    for(const context of contexts) await context.close().catch(()=>{});
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
