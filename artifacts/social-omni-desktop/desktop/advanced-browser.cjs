const fs = require('node:fs');
const path = require('node:path');
const { readable } = require('./automation-errors.cjs');
async function execute({runtime,task,state,readMedia,pace,guard,result,reserve,setContext, existingContext}) {
  const profile = task.kind === 'maps' ? 'maps-research' : task.accountId;
  if (task.kind !== 'maps' && !/^[a-f0-9-]{36}$/i.test(profile)) throw new Error('Invalid browser account.');
  fs.mkdirSync(path.join(runtime.profileDir,profile),{recursive:true,mode:0o700});
  const context=existingContext || await runtime.chromium.launchPersistentContext(path.join(runtime.profileDir,profile),{headless:false,viewport:null,locale:'en-US',timeout:30000});
  setContext(context);
  try {
    const page=(task.kind === 'whatsapp-members' ? context.pages().find(p => p.url().startsWith('https://web.whatsapp.com/')) : null) || context.pages()[0] || await context.newPage(); page.setDefaultTimeout(20000);
    const restriction=async()=>{
      guard();
      if (/checkpoint|challenge|captcha|\/sorry|\/blocked/.test(page.url()) || await page.getByText(/unusual traffic|temporarily blocked|try again later|verify you are human|account.*restricted/i).first().isVisible().catch(()=>false)) throw new Error('Platform restriction detected. Resolve it manually; no bypass or automatic retry.');
    };
    if (task.kind==='whatsapp-members') {
      if (!page.url().startsWith('https://web.whatsapp.com/')) {
        guard(); await page.goto('https://web.whatsapp.com/', {waitUntil:'domcontentloaded'});
      }
      await pace('Sign in to WhatsApp and open the approved group manually');
      return await require('./whatsapp-members.cjs').extract({page, groupName:task.query, limit:task.limit, guard, restriction, result});
    } else if (task.kind==='maps') {
      guard();
      await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(task.query)}`,{waitUntil:'domcontentloaded',timeout:45000});
      const consent=page.getByRole('button',{name:/^(reject all|accept all)$/i}).first();
      if(await consent.isVisible().catch(()=>false)) await consent.click();
      await restriction();
      await readable(page,[page.locator('a[href*="/maps/place/"]')],'Google Maps business result link',30000);
      const urls=new Set();
      for (let i=0;i<Math.ceil(task.limit/10)+1 && urls.size<task.limit;i++) {
        for (const url of await page.locator('a[href*="/maps/place/"]').evaluateAll(es=>es.map(e=>e.href))) urls.add(url);
        if (urls.size>=task.limit) break;
        await pace('Reading more visible Maps results'); await restriction();
        const feed=page.getByRole('feed');
        if (!await feed.count()) break;
        const before=urls.size;
        await feed.evaluate(e=>e.scrollBy(0,1200)); await page.waitForTimeout(1200);
        const next=await page.locator('a[href*="/maps/place/"]').evaluateAll(es=>es.map(e=>e.href));
        next.forEach(url=>urls.add(url));
        if (urls.size===before) break;
      }
      if (!urls.size) throw new Error('No readable business results. Nothing fabricated.');
      for (const url of [...urls].slice(0,task.limit)) {
        await pace('Extracting a Google Maps business');
        await page.goto(url,{waitUntil:'domcontentloaded'}); await restriction();
        await readable(page,[page.locator('h1')],'Google Maps business heading');
        // A missing attribute stays blank; selectors never generate sample details.
        const data=await page.evaluate(()=>{
          const text=e=>e?.textContent?.trim() || '';
          const address=document.querySelector('[data-item-id="address"]');
          const telephone=document.querySelector('[data-item-id^="phone:tel:"],a[href^="tel:"]');
          const site=document.querySelector('a[data-item-id="authority"],a[aria-label^="Website:"]');
          return {name:text(document.querySelector('h1')),address:address?.getAttribute('aria-label')?.replace(/^Address: /,'') || text(address),
            phone:telephone?.getAttribute('data-item-id')?.replace('phone:tel:','') || telephone?.getAttribute('href')?.replace('tel:','') || '',website:site?.href || ''};
        });
        if (!data.name) throw new Error('Business details are unreadable. Extraction stopped.');
        result({...data,status:'Extracted',reason:'Public Maps listing; missing fields remain blank. No contact consent established.'});
      }
    } else if (task.kind==='instagram-post') {
      await pace('Opening Instagram');
      await page.goto('https://www.instagram.com/',{waitUntil:'domcontentloaded'});
      const deadline=Date.now()+300000;
      while (!await page.locator('a[href*="/direct/"]').first().isVisible().catch(()=>false)) {
        await restriction(); if(Date.now()>deadline) throw new Error('Instagram sign-in timed out. Sign in manually in the visible browser.');
        await page.waitForTimeout(500);
      }
      await pace('Opening the Instagram feed composer');
      await page.getByRole('link',{name:/^create|new post$/i}).first().click();
      const media=readMedia(task.mediaId);
      if (!media) throw new Error('Image no longer exists.');
      const directory=fs.mkdtempSync(path.join(runtime.profileDir,'instagram-upload-'));
      const file=path.join(directory,media.mime==='image/png'?'image.png':'image.jpg');
      try {
        fs.writeFileSync(file,media.content,{mode:0o600});
        await pace('Uploading the approved image'); await restriction();
        await page.locator('input[type="file"]').first().setInputFiles(file);
        for (let i=0;i<2;i++) {
          const next=page.getByRole('button',{name:/^next$/i});
          if(await next.first().isVisible().catch(()=>false)) {await pace('Advancing the image composer');await next.first().click();}
        }
        await pace('Preparing the approved caption');
        await page.locator('textarea[placeholder*="caption"],[contenteditable="true"][role="textbox"]').first().fill(task.message);
        await pace('Submitting the approved Instagram post');await restriction();guard();
        const receipt=reserve('Instagram feed');
        await page.getByRole('button',{name:/^share$/i}).first().click();
        await page.getByText(/your post has been shared/i).first().waitFor({timeout:30000});
        await restriction();
        result({name:'Instagram feed',status:'Accepted',reason:'Instagram displayed its post-shared confirmation.'},receipt);
      } finally {fs.rmSync(directory,{recursive:true,force:true});}
    }
  } finally {if(!existingContext) await context.close().catch(()=>{});}
}
module.exports={execute};
