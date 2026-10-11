const {bad}=require('./validation.cjs');
function recipients(source) {
  const {email}=require('./advanced.cjs');
  const targets=[],seen=new Set();
  for (const line of String(source || '').split(/[\r\n]+/).map(v=>v.trim()).filter(Boolean)) {
    const named=/^([^<>]+)\s*<([^<>]+)>$/.exec(line);
    const address=(named?named[2]:line).trim(),name=named?named[1].trim():'';
    if (!email(address) || name.length>150 || /[<>\r\n]/.test(name)) throw bad('Use email addresses or Name <email> recipients, one per line.');
    const key=address.toLowerCase();
    if (!seen.has(key)) {seen.add(key);targets.push({email:address,name});}
  }
  if (!targets.length || targets.length>200) throw bad('Use 1–200 unique email recipients.');
  return targets;
}
function personalize(template, recipient, contact) {
  const values={email:recipient.email,name:recipient.name || contact?.name || recipient.email};
  // One replacement pass: user-provided names cannot inject a second placeholder.
  return String(template).replace(/\{\{(name|email)\}\}/g,(_match,key)=>values[key]);
}
function transportOptions(config) {
  return {host:config.host,port:config.port,secure:config.secure,requireTLS:!config.secure,
    auth:{user:config.username,pass:config.password},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:30000,
    tls:{rejectUnauthorized:true},disableFileAccess:true,disableUrlAccess:true};
}
module.exports={recipients,personalize,transportOptions};
