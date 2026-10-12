const {randomUUID}=require('node:crypto');
const {bad}=require('./validation.cjs');
function groupUrl(value) {
  let url;
  try {url=new URL(value);} catch {throw bad('Use exact https://www.facebook.com/groups/<group-id> URLs.');}
  if(url.protocol!=='https:' || url.hostname!=='www.facebook.com' || url.username || url.password || url.port ||
    !/^\/groups\/[a-zA-Z0-9._-]+\/?$/.test(url.pathname)) throw bad('Use exact https://www.facebook.com/groups/<group-id> URLs.');
  return `https://www.facebook.com${url.pathname.replace(/\/?$/, '/')}`;
}
function targets(source,limit=200) {
  const unique=[...new Set(String(source || '').split(/[\r\n]+/).map(s=>s.trim()).filter(Boolean).map(groupUrl))];
  if(!unique.length || unique.length>200) throw bad('Use 1–200 unique Facebook group URLs.');
  return unique.slice(0,limit);
}
const reasons={
  Found:'Observed Facebook group search result. Review the group before requesting membership or posting.',
  Joined:'Facebook showed membership. This is not permission to publish.',
  Requested:'Facebook showed a membership request. Administrator approval is not confirmed.',
  Posted:'A new matching group post appeared. Public visibility and moderator approval are not guaranteed.',
  'Needs review':'Facebook membership or permission needs manual review. Nothing is retried automatically.',
  'Not posted':'No post was confirmed. Posting never requests membership automatically.',
  Unconfirmed:'A Facebook submission may have happened. Check the group manually; never retry automatically.',
  'Not attempted':'This group action was not attempted.',
};
// Mirror each browser outcome in the SAME saved state, including the pre-click
// reservation. A shutdown must never hide an uncertain post in a different log.
function syncResults(state,job) {
  const task=state.advanced?.tasks.find(t=>t.id===job.id && t.kind.startsWith('facebook-'));
  if(!task || job.platform!=='Facebook' || job.action==='connect')return;
  const records=job.action==='search'?(job.discoveredGroups || []).map(g=>({name:g.name,website:g.url,status:'Found'})):
    (job.targets || []).map(r=>({name:r.name,website:r.postUrl || r.name,status:(job.action==='join'?r.joinStatus:r.postStatus)==='Pending'?'Not attempted':(job.action==='join'?r.joinStatus:r.postStatus) || 'Not attempted'}));
  for(const data of records) {
    let row=state.advanced.results.find(r=>r.taskId===task.id && (job.action==='search'?r.website===data.website:r.name===data.name));
    if(!row) {
      if(state.advanced.results.length>=2000)throw bad('Remove old results before starting Facebook actions (limit 2000).');
      row={id:randomUUID(),taskId:task.id,kind:task.kind,name:'',phone:'',email:'',address:'',website:'',status:'Not attempted',reason:'',createdAt:new Date().toISOString()};
      state.advanced.results.unshift(row);
    }
    Object.assign(row,data,{reason:reasons[data.status] || reasons['Needs review']});
  }
}
async function postLinks(page,text,group) {
  if(!text.trim())return [];
  const links=await page.getByText(text,{exact:true}).filter({visible:true}).evaluateAll(elements=>elements.flatMap(el=>{
    const article=el.closest('[role="article"]');
    return article?Array.from(article.querySelectorAll('a[href]'),a=>a.href):[];
  }));
  const prefix=new URL(groupUrl(group)).pathname;
  return [...new Set(links.flatMap(value=>{
    try {
      const url=new URL(value);
      if(url.protocol==='https:' && url.hostname==='www.facebook.com' && !url.username && !url.password && !url.port &&
        url.pathname.startsWith(prefix) && /^(posts|permalink)\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname.slice(prefix.length))) return [`https://www.facebook.com${url.pathname.replace(/\/?$/, '/')}`];
    } catch {}
    return [];
  }))];
}
module.exports={groupUrl,targets,syncResults,reasons,postLinks};
