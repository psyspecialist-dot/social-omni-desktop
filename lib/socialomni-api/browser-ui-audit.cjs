// Runs the actual renderer -> actual preload/IPC handlers -> API/SQLite -> Chromium workers.
// Only Electron transport and platform pages are controlled; no mocked API/job/results.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {randomUUID}=require('node:crypto');
const express=require('../../artifacts/api-server/node_modules/express');
const {chromium}=require('../../artifacts/api-server/node_modules/playwright');
const createService=require('./service.cjs');
const registerIpc=require('../../artifacts/social-omni-desktop/desktop/browser-ipc.cjs');
const fixture=require('./browser-fixtures.cjs');

async function audit() {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'najhin-ui-audit-')),workspace=randomUUID();
  const handlers=new Map(),listeners=new Map(),calls=[],contexts=[],sender={},secret=randomUUID();
  let bridge,page,browser,server,service,unsubscribe;
  try {
    service=createService({express,secret,dbPath:path.join(directory,'workspace.sqlite'),automation:{
      profileDir:path.join(directory,'profiles'),
      onEvent:event=>listeners.get('socialomni:browser-event')?.({},event),
      chromium:{async launchPersistentContext(profile,options){
        const context=await chromium.launchPersistentContext(profile,{...options,headless:true,
          executablePath:process.env.CHROMIUM_EXECUTABLE || '/repl/tools/bin/chromium',args:['--no-sandbox']});
        await context.route('**/*',route=>route.fulfill({contentType:'text/html',body:fixture(route.request().url())}));
        contexts.push(context);return context;
      }},
    }});
    const app=express();app.use(express.json());app.use('/api/socialomni',service.router);
    server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
    registerIpc({ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},
      assertTrustedSender:event=>assert.equal(event.sender,sender),
      getConnection:()=>({workspace,secret,port:server.address().port})});
    vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../artifacts/social-omni-desktop/desktop/preload.js'),'utf8'),{
      console:{info(){},error:console.error},require:name=>{
        assert.equal(name,'electron');return{
          contextBridge:{exposeInMainWorld:(_name,api)=>{bridge=api;}},
          ipcRenderer:{
            invoke:(channel,...args)=>{calls.push(channel);return handlers.get(channel)({sender},...args);},
            on:(channel,fn)=>listeners.set(channel,fn),
            removeListener:(channel,fn)=>{if(listeners.get(channel)===fn)listeners.delete(channel);},
          },
        };
      },
    });
    const api=(...args)=>bridge.apiRequest(...args);
    await api('POST','/initialize');
    await api('PUT','/settings',{delayMin:5,delayMax:5,language:'en',phoneNumbers:'+12025550101\n+12025550102',messageContent:'UI fixture only'});
    for(const platform of ['WhatsApp','Facebook']) await api('POST','/accounts',{platform,displayLabel:`UI ${platform}`,handle:'fixture',status:'Active label'});
    browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE || '/repl/tools/bin/chromium',args:['--no-sandbox']});
    page=await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.exposeFunction('__desktopRpc',(method,...args)=>bridge[method](...args));
    await page.addInitScript(()=>{
      const callbacks=new Set();
      window.__auditEvent=event=>{for(const fn of callbacks)fn(event);};
      window.socialOmni={
        isDesktop:true,getItem:async()=>null,setItem:async()=>{},removeItem:async()=>{},
        apiRequest:(...args)=>window.__desktopRpc('apiRequest',...args),
        startBrowserJob:(...args)=>window.__desktopRpc('startBrowserJob',...args),
        onBrowserEvent:fn=>{callbacks.add(fn);return()=>callbacks.delete(fn);},
      };
    });
    unsubscribe=bridge.onBrowserEvent(event=>{void page.evaluate(event=>window.__auditEvent?.(event),event).catch(()=>{});});
    const base=process.env.UI_AUDIT_URL || 'http://127.0.0.1:80/';
    await page.goto(`${base}#/whatsapp`);
    await page.getByTestId('live-consent-whatsapp').check();
    await page.getByTestId('live-run-whatsapp').click();
    const wait=async(action,status)=>{
      for(let i=0;i<1400;i++){
        const state=await api('GET','/state'),job=state.jobs.find(j=>j.action===action);
        if(job && ['Completed','Failed'].includes(job.status)){assert.equal(job.status,status,job.error);return state;}
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      throw new Error(`UI ${action} never finished.`);
    };
    let state=await wait('send','Failed');
    assert.deepEqual(state.jobs[0].targets.map(t=>t.sendStatus),['Sent','Failed']);
    await page.getByText('Some recipients failed. Review the recipient table. Confirmed sends are not retried.',{exact:true}).first().waitFor({timeout:10000});
    await page.getByText('WhatsApp rejected this phone number. No message was submitted.',{exact:true}).first().waitFor();
    assert.equal(state.analytics.realMessagesSent,1);
    console.log('PASS WhatsApp UI button -> IPC -> actual sequential DOM sends/rejection -> live recipient rows');
    await page.goto(`${base}#/automation`);
    await page.getByRole('textbox',{name:'Group search keywords'}).fill('fixture permitted group');
    await page.getByTestId('live-search-facebook').click();
    state=await wait('search','Completed');
    await page.getByText('Fixture permitted group',{exact:false}).first().waitFor({timeout:10000});
    const resultsTable=page.getByRole('table',{name:'Discovered Facebook groups'});
    await resultsTable.waitFor();
    assert.equal(await resultsTable.getByRole('row').count(),2,'one header and one actual search result');
    await resultsTable.getByRole('checkbox',{name:'Select group Fixture permitted group'}).check();
    assert.equal(await page.getByRole('textbox',{name:'Approved group URLs (one per line, up to 20)'}).inputValue(),'https://www.facebook.com/groups/123456/');
    assert.equal(state.jobs[0].discoveredGroups[0].url,'https://www.facebook.com/groups/123456/');
    await page.getByRole('textbox',{name:'Approved group URLs (one per line, up to 20)'}).fill('https://www.facebook.com/groups/234567/');
    await page.getByTestId('live-consent-facebook').check();
    await page.getByTestId('live-join-facebook').click();
    state=await wait('join','Completed');
    assert.equal(state.jobs[0].targets[0].joinStatus,'Requested');
    await page.getByText('Requested',{exact:true}).waitFor({timeout:10000});
    assert.ok(calls.includes('socialomni:start-browser-job'),'real dedicated IPC handler invoked by frontend buttons');
    assert.equal(errors.length,0,errors.join('\n'));
    console.log('PASS Facebook UI search/join -> secure IPC -> DOM typing/Enter/group filter/join -> persisted UI results');
    await page.screenshot({path:path.join(directory,'facebook-ui.png'),fullPage:true});
    console.log('All UI checks passed. Native Electron/macOS and real accounts remain outside this controlled audit.');
  } finally {
    unsubscribe?.();await browser?.close();
    for(const context of contexts)await context.close().catch(()=>{});
    if(server)await new Promise(resolve=>server.close(resolve));
    await service?.close();fs.rmSync(directory,{recursive:true,force:true});
  }
}
audit().catch(error=>{console.error(error);process.exitCode=1;});
