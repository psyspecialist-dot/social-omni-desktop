const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const facebook=require('./facebook-marketing.cjs'),advanced=require('./advanced.cjs');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('Facebook URLs are canonical, unique, bounded and cannot carry credentials or escape the group',()=>{
  assert.deepEqual(facebook.targets('https://www.facebook.com/groups/123?ref=x\nhttps://www.facebook.com/groups/123/\nhttps://www.facebook.com/groups/example.group#about'),[
    'https://www.facebook.com/groups/123/','https://www.facebook.com/groups/example.group/']);
  for(const url of ['https://user:password@www.facebook.com/groups/123','https://www.facebook.com:444/groups/123','https://facebook.com/groups/123','http://www.facebook.com/groups/123','https://www.facebook.com/groups/123/posts/456','https://www.facebook.com/groups/123/../../login','https://evil.example/groups/123'])assert.throws(()=>facebook.groupUrl(url));
  assert.equal(facebook.targets('https://www.facebook.com/groups/1\nhttps://www.facebook.com/groups/2',1).length,1);
});
test('Facebook preflight checks account, consent, attachment eligibility and report capacity before any browser launch',()=>{
  const accountId=randomUUID(),state={advanced:advanced.defaults(),store:{accounts:[{id:accountId,platform:'Facebook',status:'Active label'}]},media:[{id:'video',mime:'video/mp4'},{id:'pdf',mime:'application/pdf'}]};
  const task=advanced.taskInput({kind:'facebook-post',name:'Review',source:'https://www.facebook.com/groups/123',accountId,approved:true,mediaId:'video'});
  assert.doesNotThrow(()=>advanced.validateRun(state,task,{}),'a video-only post is allowed but needs manual outcome review');
  assert.throws(()=>advanced.validateRun(state,{...task,approved:false},{}),/consent/);
  assert.throws(()=>advanced.validateRun(state,{...task,mediaId:'pdf'},{}),/image or video/);
  assert.throws(()=>advanced.validateRun(state,{...task,mediaId:'deleted'},{}),/image or video/);
  assert.throws(()=>advanced.validateRun(state,{...task,mediaId:''},{}),/text or choose/);
  assert.throws(()=>advanced.validateRun(state,{...task,accountId:'imported-not-a-UUID'},{}));
  assert.throws(()=>advanced.validateRun(state,task,null),/desktop/);
  state.advanced.results=Array(2000).fill({});
  assert.throws(()=>advanced.validateRun(state,task,{}),/old results/);
});
test('Facebook reservations, errors and post receipts share one result without masking untouched groups',()=>{
  const state={advanced:advanced.defaults()};
  state.advanced.tasks.push({id:'task',kind:'facebook-post'});
  const job={id:'task',platform:'Facebook',action:'publish',targets:[{name:'https://www.facebook.com/groups/1/',postStatus:'Pending'},{name:'https://www.facebook.com/groups/2/',postStatus:'Pending'}]};
  facebook.syncResults(state,job);
  const first=state.advanced.results.find(r=>r.name.endsWith('/1/'));
  assert.equal(first.status,'Not attempted');
  job.targets[0].postStatus='Unconfirmed';facebook.syncResults(state,job);
  assert.equal(first.status,'Unconfirmed');assert.match(first.reason,/never retry/);
  job.status='Failed';facebook.syncResults(state,job);assert.equal(first.status,'Unconfirmed');
  job.targets[0].postStatus='Posted';job.targets[0].postUrl='https://www.facebook.com/groups/1/posts/99/';facebook.syncResults(state,job);
  assert.equal(state.advanced.results.length,2);assert.equal(first.status,'Posted');assert.equal(first.website,job.targets[0].postUrl);
  assert.equal(state.advanced.results.find(r=>r.name.endsWith('/2/')).status,'Not attempted');
});
for(const status of ['Completed','Failed','Cancelled']) test(`advanced Facebook bridge propagates approved media and normalized targets, preserving ${status} outcomes`,async t=>{
  t.mock.timers.enable({apis:['Date','setTimeout','setInterval']});
  const accountId=randomUUID(),taskId=randomUUID();
  let state={advanced:advanced.defaults(),store:{accounts:[{id:accountId,platform:'Facebook',displayLabel:'Fixture',status:'Active label'}]},jobs:[],media:[{id:'video',name:'fixture.mp4',mime:'video/mp4'}]};
  state.advanced.tasks.push({...advanced.taskInput({kind:'facebook-post',name:'Fixture post',source:'https://www.facebook.com/groups/123?ref=x\nhttps://www.facebook.com/groups/123/',mediaId:'video',message:'Fixture caption',accountId,approved:true}),id:taskId,status:'Queued',progress:0,completedCount:0,totalCount:0,phase:'Queued'});
  let launched=0;
  const engine=require('./advanced-worker.cjs')({get:()=>structuredClone(state),save:(_id,s)=>{state=structuredClone(s);},ids:()=>['fixture'],recordActivity(){},runtime:{},vault:{},cancelLegacy(){},readMedia(){},
    kickLegacy(){
      launched++;const job=state.jobs[0];assert.equal(job.targets.length,1);assert.equal(job.mediaId,'video');assert.equal(job.mediaName,'fixture.mp4');assert.equal(job.targets[0].name,'https://www.facebook.com/groups/123/');
      job.targets[0].postStatus=status==='Completed'?'Posted':'Unconfirmed';job.status=status;facebook.syncResults(state,job);
    }});
  try {
    for(let i=0;i<20 && ['Queued','Running'].includes(state.advanced.tasks[0].status);i++){t.mock.timers.tick(1000);await new Promise(r=>setImmediate(r));}
    assert.equal(launched,1);assert.equal(state.advanced.tasks[0].status,status);
    assert.equal(state.advanced.results[0].status,status==='Completed'?'Posted':'Unconfirmed');
    for(let i=0;i<10;i++){t.mock.timers.tick(1000);await new Promise(r=>setImmediate(r));}assert.equal(launched,1);
  } finally {await engine.close();}
});
test('Facebook search collects only actual main-region links, deduplicates them and honors the requested limit',async t=>{
  t.mock.timers.enable({apis:['Date','setTimeout']});
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'najhin-facebook-search-'));
  let url='about:blank',launches=0;
  let state={jobs:[{id:'search',mode:'live',platform:'Facebook',action:'search',kind:'campaign',accountId:'fixture',keywords:'Authorized business groups',searchLimit:2,status:'Pending',createdAt:new Date().toISOString(),delayMin:5,delayMax:5,targets:[],completedCount:0,currentStep:0}],
    advanced:{...advanced.defaults(),tasks:[{id:'search',kind:'facebook-search'}]},store:{campaigns:[],accounts:[],activity:[]}};
  const hidden={first(){return this;},isVisible:async()=>false};
  const links={...hidden,isVisible:async()=>true,filter(){return this;},evaluateAll:async()=>[
    {name:'First group',url:'https://www.facebook.com/groups/1?ref=a'},
    {name:'Duplicate link',url:'https://www.facebook.com/groups/1/'},
    {name:'Ignored navigation',url:'https://www.facebook.com/groups/1/members'},
    {name:'Second group',url:'https://www.facebook.com/groups/2/'},
    {name:'Beyond requested cap',url:'https://www.facebook.com/groups/3/'},
  ]};
  const search={...hidden,isVisible:async()=>true,fill:async text=>assert.equal(text,'Authorized business groups'),press:async()=>{url='https://www.facebook.com/search/groups/?q=fixture';}};
  const page={setDefaultTimeout(){},isClosed:()=>false,url:()=>url,goto:async next=>{url=next;},waitForURL:async()=>{},getByText:()=>hidden,
    getByRole(role,options){
      if(role==='main')return {count:async()=>1,locator:()=>links};
      if(options?.name?.source.includes('your profile'))return {...hidden,isVisible:async()=>true};
      if(['combobox','textbox'].includes(role))return search;
      return hidden;
    },locator:()=>hidden};
  const worker=require('./browser-worker.cjs')({get:()=>structuredClone(state),save:(_id,s)=>{state=structuredClone(s);},recordActivity(){},kick(){},
    automation:{profileDir:dir,chromium:{launchPersistentContext:async(_path,options)=>{launches++;assert.equal(options.headless,false);return {pages:()=>[page],close:async()=>{}};}}}});
  try {
    worker.kick('fixture');
    for(let i=0;i<160 && state.jobs[0].status!=='Completed';i++){t.mock.timers.tick(250);await new Promise(r=>setImmediate(r));}
    assert.equal(state.jobs[0].status,'Completed',state.jobs[0].error);assert.equal(launches,1);
    assert.deepEqual(state.jobs[0].discoveredGroups.map(g=>g.url),['https://www.facebook.com/groups/1/','https://www.facebook.com/groups/2/']);
    assert.equal(state.advanced.results.length,2);assert.ok(state.advanced.results.every(r=>r.status==='Found'));
  } finally {await worker.close();fs.rmSync(dir,{recursive:true,force:true});}
});
