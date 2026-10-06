const dns = require('node:dns').promises;
const https = require('node:https');
const { BlockList, isIP } = require('node:net');
const blocked = new BlockList();
for (const [ip,bits] of [['0.0.0.0',8],['10.0.0.0',8],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.168.0.0',16],['100.64.0.0',10],['224.0.0.0',4],['240.0.0.0',4],['198.18.0.0',15]]) blocked.addSubnet(ip,bits,'ipv4');
for (const [ip,bits] of [['::',128],['::1',128],['fc00::',7],['fe80::',10],['ff00::',8]]) blocked.addSubnet(ip,bits,'ipv6');
const publicAddress = ip => Boolean(isIP(ip)) && !blocked.check(ip,isIP(ip)===6?'ipv6':'ipv4');
async function publicUrl(value, lookup = dns.lookup) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw new Error('Use public HTTPS business websites without credentials or custom ports.');
  const host = url.hostname.replace(/^\[|\]$/g,'');
  const addresses = isIP(host) ? [{address:host,family:isIP(host)}] : await lookup(host,{all:true});
  if (!addresses.length || addresses.some(a=>!publicAddress(a.address))) throw new Error('Private, local and internal network addresses are not allowed.');
  return {url,addresses};
}
async function fetchWebsite(value, signal, redirects = 0) {
  const {url,addresses} = await publicUrl(value);
  return new Promise((resolve,reject) => {
    const request = https.get(url,{signal,timeout:15000,headers:{'user-agent':'SocialNajhin/1.0 (authorized business research)','accept':'text/html'},
      lookup: (_host,opts,callback) => opts.all ? callback(null,addresses) : callback(null,addresses[0].address,addresses[0].family)
    }, res => {
      if ([301,302,303,307,308].includes(res.statusCode)) {
        res.resume();
        if (redirects >= 3 || !res.headers.location) return reject(new Error('Too many redirects.'));
        return resolve(fetchWebsite(new URL(res.headers.location,url).href,signal,redirects+1));
      }
      if (res.statusCode !== 200 || !/text\/html/i.test(res.headers['content-type'] || '')) {res.resume(); return reject(new Error('Website did not return readable HTML.')); }
      const chunks = []; let size=0;
      res.on('data',chunk=>{size+=chunk.length;if(size>2*1024*1024) request.destroy(new Error('Website exceeds 2 MB.'));else chunks.push(chunk);});
      res.on('end',()=>resolve({html:Buffer.concat(chunks).toString('utf8'),url:url.href}));
      res.on('error',reject);
    });
    request.on('timeout',()=>request.destroy(new Error('Website timed out.')));
    request.on('error',reject);
  });
}
function business(html,url) {
  const {load} = require('./advanced-deps.cjs')('cheerio');
  const $ = load(html); let structured = {};
  $('script[type="application/ld+json"]').each((_i,el)=>{
    try {
      const parsed=JSON.parse($(el).text()), queue=Array.isArray(parsed)?parsed:[parsed];
      for (const node of queue.flatMap(n=>n['@graph'] || [n])) if (node.telephone || node.address || /Business|Organization|Store|Restaurant/.test(String(node['@type']))) {structured=node;break;}
    } catch { /* A malformed schema is not evidence of business data. */ }
  });
  const address=structured.address;
  const phone=String(structured.telephone || $('a[href^="tel:"]').first().attr('href')?.slice(4) || '').slice(0,100);
  const emails=[...new Set($('a[href^="mailto:"]').map((_i,el)=>$(el).attr('href').slice(7).split('?')[0]).get())];
  const {email}=require('./advanced.cjs');
  return {name:String(structured.name || $('meta[property="og:site_name"]').attr('content') || $('h1').first().text() || $('title').text()).trim().slice(0,150),
    phone,email:emails.filter(email).join('; ').slice(0,1000),address:typeof address==='string'?address:address?[address.streetAddress,address.addressLocality,address.addressRegion,address.postalCode,address.addressCountry].filter(Boolean).join(', '):'',
    website:url,status:'Extracted',reason:'Public website facts only; missing fields are blank. Contact consent is not established.'};
}
async function verifyEmail(value, resolver = dns.resolveMx) {
  const {email} = require('./advanced.cjs');
  if (!email(value)) return {email:value,status:/["\u0080-\uFFFF]/.test(value)?'Unknown':'Invalid',
    reason:/["\u0080-\uFFFF]/.test(value)?'Quoted or international address syntax is unsupported; do not assume invalid or deliverable.':'Invalid email-address syntax.'};
  const domain=value.split('@')[1].toLowerCase();
  try {
    const records=await resolver(domain);
    if (records.some(r=>r.exchange && r.exchange!=='.')) return {email:value,status:'Domain ready',reason:'Mail exchanger exists. Mailbox acceptance and deliverability remain unknown.'};
    return {email:value,status:'Invalid',reason:'Domain has no usable MX record (or explicitly rejects mail).'};
  } catch (e) {
    if (e.code==='ENODATA') {
      // RFC 5321 implicit MX: no MX may still accept mail at an A/AAAA address.
      try { const addresses=await dns.lookup(domain,{all:true});if(addresses.length) return {email:value,status:'Unknown',reason:'No explicit MX; implicit mail routing may exist. Mailbox unverified.'}; } catch {}
    }
    return {email:value,status:e.code==='ENOTFOUND'?'Invalid':'Unknown',reason:e.code==='ENOTFOUND'?'Domain does not exist.':'DNS check was inconclusive. Do not treat as deliverable or automatically discard.'};
  }
}
module.exports={publicAddress,publicUrl,fetchWebsite,business,verifyEmail};
