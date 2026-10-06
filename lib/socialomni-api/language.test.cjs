const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const express=require('../../artifacts/api-server/node_modules/express');
const createService=require('./service.cjs');

test('language preference is validated, isolated, retained in SQLite, and never changes stored content or canonical statuses',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'najhin-language-')),dbPath=path.join(dir,'local.sqlite'),id=randomUUID();
  let service,server,base;
  async function start(){
    service=createService({express,dbPath});
    const app=express();app.use(express.json());app.use(service.router);
    server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
    base=`http://127.0.0.1:${server.address().port}`;
  }
  async function stop(){await new Promise(resolve=>server.close(resolve));service.close();}
  async function request(method,route,body,status=200,workspace=id){
    const res=await fetch(base+route,{method,headers:{'content-type':'application/json','x-socialomni-workspace':workspace},body:body===undefined?undefined:JSON.stringify(body)});
    const data=await res.json();assert.equal(res.status,status,JSON.stringify(data));return data;
  }
  try {
    await start();
    let state=await request('POST','/initialize');assert.equal(state.settings.language,'en');
    state=await request('POST','/advanced/tasks',{kind:'email-send',name:'My campaign / حملتي',source:'client@example.com',subject:'Original subject',message:'مرحبا {{name}}'});
    const idBefore=state.advanced.tasks[0].id;
    state=await request('PUT','/settings',{language:'ar'});
    assert.equal(state.settings.language,'ar');
    assert.equal(state.advanced.tasks[0].message,'مرحبا {{name}}');
    assert.equal(state.advanced.tasks[0].status,'Draft');
    assert.equal(state.advanced.tasks[0].id,idBefore);
    await request('PUT','/settings',{language:'invalid'},400);
    assert.equal((await request('GET','/state')).settings.language,'ar');
    assert.equal((await request('GET','/state',undefined,200,randomUUID())).settings.language,'en');
    await stop();await start();
    state=await request('GET','/state');assert.equal(state.settings.language,'ar');
    state=await request('PUT','/settings',{keywords:'businesses'});assert.equal(state.settings.language,'ar');
    state=await request('DELETE','/state');assert.equal(state.settings.language,'ar','clear data retains presentation preference');
    state=await request('PUT','/settings',{language:'en'});assert.equal(state.settings.language,'en');
  } finally {if(server?.listening)await stop();fs.rmSync(dir,{recursive:true,force:true});}
});
