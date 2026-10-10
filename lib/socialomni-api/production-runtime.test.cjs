const {test} = require('node:test');
const assert = require('node:assert/strict');
const {chromium} = require('../../artifacts/api-server/node_modules/playwright');
const engine = require('./wa-suite-browser.cjs');

test('dispatcher cancels legacy simulations instead of fabricating completion', () => {
  const state = {jobs:[{id:'legacy',status:'Running',progress:12},{id:'real',mode:'live',status:'Pending'}]};
  let dispatched = 0;
  const worker = require('./worker.cjs')({get:()=>state,save(){},recordActivity(){},onLive:()=>dispatched++});
  worker.kick('test');
  assert.equal(state.jobs[0].status,'Cancelled');
  assert.equal(state.jobs[0].progress,12);
  assert.equal(state.jobs[1].status,'Pending');
  assert.equal(dispatched,1);
  worker.close();worker.kick('test');assert.equal(dispatched,1);
});

test('real DOM unread observer routes to the correct CRM client, preserves drafts and never replays history', {timeout:20000}, async () => {
  const browser = await chromium.launch({headless:true,executablePath:chromium.executablePath(),args:['--no-sandbox']});
  const page = await browser.newPage();
  let active = true, observation;
  const state = {
    waSuite:{threads:[{id:'beta',name:'Beta',phone:'+15550000002',optedIn:true,messages:[],remoteKey:null}],
      rules:[{id:'price',name:'Price',keyword:'price',template:'Hello {{name}}',match:'contains',enabled:true,delayMin:3,delayMax:3,cooldownMinutes:5}]},
    store:{contacts:[],lists:[]},analytics:{},
  };
  const job = {accountId:'account',currentStep:0,completedCount:0};
  const wait = async predicate => {
    const deadline = Date.now()+6000;
    while(!predicate()) {if(Date.now()>deadline)throw new Error('Observer assertion timed out');await new Promise(r=>setTimeout(r,50));}
  };
  try {
    await page.setContent(`<div id="pane-side"></div><div id="main"><header><span title="Alpha"></span></header>
      <div class="message-in" data-id="false_15550000001@c.us_initial"><span class="selectable-text copyable-text">price old</span></div></div>
      <footer><div contenteditable="true" role="textbox"></div><button id="send"><span data-icon="send"></span></button></footer>
      <script>
      window.sends=0; window.peer='15550000001';
      window.unread=(name,peer,text)=>{
        const row=document.createElement('div');row.setAttribute('role','row');
        row.innerHTML='<span title="'+name+'">'+name+'</span><span aria-label="1 unread message">1</span>';
        row.onclick=()=>{
          window.peer=peer;row.querySelector('[aria-label]').remove();
          document.querySelector('#main').innerHTML='<header><span title="'+name+'"></span></header><div class="message-in" data-id="false_'+peer+'@c.us_new"><span class="selectable-text copyable-text">'+text+'</span></div>';
        };document.querySelector('#pane-side').append(row);
      };
      document.querySelector('#send').onclick=()=>{
        window.sends++;const input=document.querySelector('footer [contenteditable]');
        const el=document.createElement('div');el.className='message-out';el.setAttribute('data-id','true_'+window.peer+'@c.us_sent');
        el.innerHTML='<span class="selectable-text copyable-text">'+input.textContent+'</span><span data-icon="msg-check">✓</span>';
        document.querySelector('#main').append(el);input.textContent='';
      };
      </script>`);
    observation = engine.inbox({page,job,getState:()=>state,update:fn=>fn(job,state),
      guard:()=>{if(!active)throw new Error('Stopped');},restriction:async()=>{},
      act:async(_phase,operation,pacing)=>{assert.deepEqual(pacing,{min:3,max:3});await operation();}
    }).catch(error=>{if(active)throw error;});
    await wait(()=>state.waSuite.threads.some(t=>t.name==='Alpha'));
    assert.equal(await page.evaluate(()=>window.sends),0);
    await page.evaluate(()=>window.unread('Beta','15550000002','price please'));
    await wait(()=>state.waSuite.threads.find(t=>t.id==='beta').messages.some(m=>m.status==='Accepted'));
    assert.equal(await page.evaluate(()=>window.sends),1);
    assert.equal(state.waSuite.threads.find(t=>t.id==='beta').messages.at(-1).text,'Hello Beta');
    assert.ok(state.waSuite.threads.find(t=>t.id==='beta').replyReservations['false_15550000002@c.us_new']);
    await page.locator('footer [contenteditable]').fill('Human draft');
    await page.evaluate(()=>window.unread('Gamma','15550000003','price'));
    await new Promise(r=>setTimeout(r,1200));
    assert.equal(await page.locator('#main header [title]').getAttribute('title'),'Beta');
    assert.equal(await page.locator('footer [contenteditable]').textContent(),'Human draft');
    await page.locator('footer [contenteditable]').fill('');
    await wait(()=>state.waSuite.threads.some(t=>t.name==='Gamma'));
    assert.equal(await page.evaluate(()=>window.sends),1,'no consent means no reply');
    assert.ok(job.currentStep>=3,'message counts come from observed DOM messages');
  } finally {
    active=false; await observation; await browser.close();
  }
});
