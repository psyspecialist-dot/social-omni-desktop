const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('../../artifacts/api-server/node_modules/playwright');
const { attach } = require('./facebook-media.cjs');
const {postLinks}=require('./facebook-marketing.cjs');

test('Facebook uploads a real file payload to the scoped post dialog, never a PDF', async () => {
  const browser = await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE || '/repl/tools/bin/chromium',args:['--no-sandbox']});
  try {
    const page=await browser.newPage();
    await page.setContent('<input type="file" id="unrelated"><div role="dialog"><input type="file" accept="image/*,video/*"></div>');
    const dialog=page.getByRole('dialog');
    const options={act:async(_phase,operation)=>operation(),guard(){},restriction:async()=>{}};
    await attach(page,dialog,{name:'photo.png',mime:'image/png',content:Buffer.from('fixture')},options);
    assert.equal(await dialog.locator('input').evaluate(el=>el.files[0].name),'photo.png');
    assert.equal(await page.locator('#unrelated').evaluate(el=>el.files.length),0);
    await assert.rejects(()=>attach(page,dialog,{name:'file.pdf',mime:'application/pdf',content:Buffer.from('%PDF-')},options),/image or video/);
    await page.setContent('<div role="article"><p>Approved caption</p><a href="https://www.facebook.com/groups/example.group/posts/1/?ref=fixture">Date</a></div><div role="article" hidden><p>Approved caption</p><a href="https://www.facebook.com/groups/example.group/posts/2/">Hidden</a></div><div role="article"><p>Approved caption</p><a href="https://www.facebook.com/groups/exampleXgroup/posts/3/">Wrong group</a></div>');
    const before=await postLinks(page,'Approved caption','https://www.facebook.com/groups/example.group/');
    assert.deepEqual(before,['https://www.facebook.com/groups/example.group/posts/1/']);
    await page.evaluate(()=>{const article=document.createElement('div');article.setAttribute('role','article');article.innerHTML='<p>Approved caption</p><a href="https://www.facebook.com/groups/example.group/posts/99/">New post</a>';document.body.append(article);});
    const after=await postLinks(page,'Approved caption','https://www.facebook.com/groups/example.group/');
    assert.deepEqual(after.filter(url=>!before.includes(url)),['https://www.facebook.com/groups/example.group/posts/99/']);
    assert.deepEqual(await postLinks(page,'','https://www.facebook.com/groups/example.group/'),[]);
  } finally {await browser.close();}
});
