// Read only rendered participant details. Never derive numbers from private IDs.
const { AutomationError } = require('./automation-errors.cjs');
const PANEL = '[data-testid="group-info-drawer"], [data-testid="chat-info-drawer"], [data-testid="drawer-right"], [data-testid="group-participants"], [role="dialog"]';
const ROWS = '[data-testid="participant-row"], [data-testid="contact-list-item"], [role="listitem"], [role="button"]:has(span[title]):has(img), [role="button"]:has(span[title]):has([data-icon="default-user"])';
const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
function phone(value) {
  const s = normalize(value).replace(/[٠-٩]/g, c => String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g, c => String(c.charCodeAt(0)-1776));
  if (!/^\+[\d ()-]+$/.test(s)) return '';
  const number = s.replace(/[ ()-]/g, '');
  return /^\+[1-9]\d{6,14}$/.test(number) ? number : '';
}
async function extract({page, groupName, limit=2000, guard=()=>{}, restriction=async()=>{}, result, waitTimeout=300000}) {
  const expected = normalize(groupName);
  if (!expected || !Number.isInteger(limit) || limit < 1 || limit > 2000) throw new AutomationError('Invalid group name or extraction limit.');
  const header = page.locator('#main header');
  const groupTitle = header.locator('span[title]').filter({visible:true});
  const currentGroup = async () => {
    const titles = await groupTitle.evaluateAll(es=>es.map(e=>e.getAttribute('title')));
    return normalize(titles[0]) === expected;
  };
  const deadline = Date.now()+waitTimeout;
  while (!await currentGroup()) {
    guard(); await restriction();
    if (Date.now() >= deadline) throw new AutomationError('Open the exact approved WhatsApp group in the browser. No members were extracted.');
    await page.waitForTimeout(300);
  }
  const check = async () => {
    guard(); await restriction();
    if (!page.url().startsWith('https://web.whatsapp.com/') || !await currentGroup()) throw new AutomationError('The open WhatsApp group changed. Extraction stopped.');
  };
  await check();
  // Only the selected chat header is clicked; no member, composer or sidebar clicks.
  const title = groupTitle.filter({hasText:expected});
  if (!await title.count()) throw new AutomationError('WhatsApp group header unavailable.');
  await title.first().click();
  let panel;
  const panelDeadline = Date.now()+10000;
  while (!panel && Date.now()<panelDeadline) {
    await check();
    const candidates = page.locator(PANEL).filter({visible:true});
    for (let i=0;i<await candidates.count();i++) {
      const p=candidates.nth(i);
      if (await p.getByText(/^(group info|معلومات المجموعة|infos? du groupe)$/i).count() ||
          await p.getByText(/^\d+\s+(?:members?|participants?|أعضاء|عضو|أعضاء المجموعة|membres?)/i).count()) {
        panel=p; break;
      }
    }
    if (!panel) await page.waitForTimeout(200);
  }
  if (!panel) throw new AutomationError('Readable WhatsApp group information unavailable. Direct chats are not supported.');
  const all=panel.getByRole('button',{name:/^(view all|see all|view all members|عرض الكل|عرض جميع الأعضاء|tout afficher|voir tout)(?:\s.*)?$/i}).filter({visible:true});
  if (await all.count()) {
    await check(); await all.first().click(); await page.waitForTimeout(300);
    const expanded=page.locator(PANEL).filter({visible:true}).filter({has:page.locator(ROWS)});
    if (await expanded.count()) panel=expanded.last();
  }
  const seen=new Set();
  let quiet=0, scans=0;
  while (seen.size<limit && quiet<3 && scans++<250) {
    await check();
    if (!await panel.isVisible()) throw new AutomationError('Participant panel closed. Partial results remain available.');
    const rows=await panel.locator(ROWS).filter({visible:true}).evaluateAll(es=>es.filter(e=>!es.some(parent=>parent!==e && parent.contains(e))).map(e=>{
      const visible=n=>Boolean(n.getClientRects().length) && getComputedStyle(n).visibility!=='hidden' && getComputedStyle(n).display!=='none';
      const titles=[...e.querySelectorAll('span[title]')].filter(visible).map(n=>n.getAttribute('title'));
      const text=[...e.innerText.split('\n'), ...[...e.querySelectorAll('span')].filter(visible).map(n=>n.innerText)].map(s=>s.trim()).filter(Boolean);
      return {titles,text};
    }));
    const before=seen.size;
    for (const row of rows) {
      const values=[...row.titles,...row.text];
      const number=values.map(phone).find(Boolean) || '';
      const name=normalize(row.titles.find(v=>!phone(v)) || row.text.find(v=>!phone(v) && !/^(group admin|مشرف المجموعة|admin du groupe)$/i.test(v)) || '');
      if (!name && !number) continue;
      const key=number || `name:${name}`;
      if (seen.has(key)) continue;
      await check();
      seen.add(key);
      result({name:name || number,phone:number,status:number?'Extracted':'Unknown',
        reason:`Visible member of ${expected}. ${number?'Phone displayed by WhatsApp.':'Phone not displayed; not inferred.'} Membership is not marketing consent. Only rendered members are covered.`});
      if (seen.size>=limit) break;
    }
    if (!seen.size && quiet>=2) throw new AutomationError('No readable participant rows. Nothing fabricated; inspect the group panel manually.');
    quiet=before===seen.size?quiet+1:0;
    const moved=await panel.evaluate(root=>{
      const containers=[root,...root.querySelectorAll('*')].filter(e=>e.scrollHeight>e.clientHeight+8 && e.clientHeight>0 && /auto|scroll/.test(getComputedStyle(e).overflowY));
      const container=containers.sort((a,b)=>b.scrollHeight-a.scrollHeight)[0];
      if (!container) return false;
      const old=container.scrollTop;
      container.scrollTop+=Math.max(150,container.clientHeight*.8);
      return container.scrollTop>old;
    });
    if (!moved && quiet) await page.waitForTimeout(300);
    await page.waitForTimeout(450);
  }
  if (scans>=250 && quiet<3 && seen.size<limit) throw new AutomationError('Participant scrolling limit reached. Review partial results; completeness is not confirmed.');
  if (!seen.size) throw new AutomationError('No readable participants. Nothing extracted.');
  return {count:seen.size, limitReached:seen.size>=limit};
}
module.exports={extract,phone};
