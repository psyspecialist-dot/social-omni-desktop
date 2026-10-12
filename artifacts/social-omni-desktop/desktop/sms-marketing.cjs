const {bad}=require('./validation.cjs');
const {AutomationError}=require('./automation-errors.cjs');
const sid=(value,prefix)=>typeof value==='string' && new RegExp(`^${prefix}[a-f0-9]{32}$`,'i').test(value);
function phone(value) {
  const normalized=String(value || '').trim().replace(/[\s().-]/g,'');
  if(!/^\+[1-9]\d{7,14}$/.test(normalized)) throw bad('Use international phone numbers with + and country code.');
  return normalized;
}
function recipients(source) {
  const seen=new Set(),result=[];
  for(const line of String(source || '').split(/[\r\n]+/).map(s=>s.trim()).filter(Boolean)) {
    const named=/^([^<>]+)<([^<>]+)>$/.exec(line),name=named?named[1].trim():'';
    if(/[<>]/.test(line) && !named || name.length>150) throw bad('Use phone numbers or Name <+countrycode number>, one per line.');
    const number=phone(named?named[2]:line);
    if(!seen.has(number)) {seen.add(number);result.push({name,phone:number});}
  }
  if(!result.length || result.length>200) throw bad('Use 1–200 unique SMS recipients.');
  return result;
}
function personalize(template,recipient,contact) {
  const values={name:recipient.name || contact?.name || recipient.phone,phone:recipient.phone};
  return String(template).replace(/\{\{(name|phone)\}\}/g,(_match,key)=>values[key]);
}
const gsmBasic=new Set(Array.from('@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'));
const gsmExtended=new Set(Array.from('\f^{}\\[~]|€'));
function segments(body) {
  let units=0,unicode=false;
  for(const char of body) {
    if(gsmBasic.has(char)) units++;
    else if(gsmExtended.has(char)) units+=2;
    else {unicode=true;break;}
  }
  if(unicode) units=body.length;
  const single=unicode?70:160,multi=unicode?67:153;
  return {encoding:unicode?'UCS-2':'GSM-7',units,count:units?units<=single?1:Math.ceil(units/multi):0};
}
const contactPhone=c=>String(c.value || '').replace(/\D/g,'');
function prepared(source,template,contacts,limit=200) {
  if(!template || !template.trim()) throw bad('SMS text must be 1–1600 characters after personalization.');
  return recipients(source).slice(0,limit).map(recipient=>{
    const matches=contacts.filter(c=>c.channel==='Phone' && contactPhone(c)===recipient.phone.slice(1));
    if(matches.some(c=>!c.optedIn)) throw bad('An SMS recipient is opted out in Contacts. Sending stopped.');
    const body=personalize(template,recipient,matches[0]);
    if(!body.trim() || body.length>1600) throw bad('SMS text must be 1–1600 characters after personalization.');
    return {...recipient,inlineName:recipient.name,name:recipient.name || matches[0]?.name || recipient.phone,body,...segments(body)};
  });
}
function result(message) {
  const status=message.status;
  const map={accepted:'Accepted',queued:'Accepted',scheduled:'Accepted',sending:'Accepted',sent:'Sent',delivered:'Delivered',undelivered:'Undelivered',failed:'Failed',canceled:'Cancelled'};
  const known=typeof status==='string' && Object.hasOwn(map,status)?map[status]:null;
  if(!known || !sid(message.sid,'SM')) throw new AutomationError('Twilio did not confirm a message ID and status. Review the reserved attempt; never retry automatically.');
  const reason=status==='delivered'?'Twilio reported carrier delivery. This does not prove the recipient read the SMS.'
    :status==='sent'?'Twilio reported sent to the carrier, not confirmed delivery.'
    :['undelivered','failed','canceled'].includes(status)?'Twilio reported an unsuccessful message. It is not retried automatically.'
    :'Twilio accepted the request. Queued or accepted is not delivered.';
  const count=Number(message.num_segments);
  return {status:known,providerId:message.sid,providerStatus:status,reason,
    ...(message.num_segments!==undefined && Number.isInteger(count) && count>0?{segments:count}:{}),
    ...(Number.isInteger(message.error_code)?{providerErrorCode:message.error_code}:{})};
}
function createTransport(config,request=fetch) {
  const base=`https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}`;
  const headers={Authorization:`Basic ${Buffer.from(`${config.apiKeySid}:${config.apiKeySecret}`).toString('base64')}`};
  async function call(path,method,body,signal) {
    const response=await request(base+path,{method,headers:{...headers,...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{})},
      ...(body?{body:body.toString()}:{}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000),redirect:'error'});
    // Never log or persist provider response bodies: they can contain messages and private data.
    let data;
    try {data=await response.json();} catch {throw new AutomationError('Twilio response was unreadable. Review any reserved submission; never retry automatically.');}
    if(!response.ok) {
      if(response.status>=400 && response.status<500 && response.status!==408) return {rejected:true,code:Number.isInteger(data.code)?data.code:null,httpStatus:response.status};
      throw new AutomationError('Twilio outcome is uncertain. Review any reserved submission; never retry automatically.');
    }
    return data;
  }
  return {
    async verify(signal) {
      const data=await call('/Messages.json?PageSize=1','GET',null,signal);
      if(data.rejected || !Array.isArray(data.messages)) throw new AutomationError('Twilio connection could not be verified. Check the account and API key permissions.');
    },
    async send(to,body,signal) {
      const data=await call('/Messages.json','POST',new URLSearchParams({To:to,From:config.from,Body:body}),signal);
      if(data.rejected) return {status:'Rejected',providerStatus:'rejected',reason:`Twilio rejected the request (HTTP ${data.httpStatus}${data.code?`, code ${data.code}`:''}). No automatic retry.`,
        ...(data.code?{providerErrorCode:data.code}:{}),rejected:true};
      if(data.account_sid!==config.accountSid || phone(data.to)!==to) throw new AutomationError('Twilio returned an unexpected account or recipient. Review the reserved attempt.');
      return result(data);
    },
    async lookup(messageSid,to,signal) {
      if(!sid(messageSid,'SM')) throw bad('Invalid Twilio message ID.');
      const data=await call(`/Messages/${messageSid}.json`,'GET',null,signal);
      if(data.rejected) throw new AutomationError('Twilio message status could not be read. No SMS was resent.');
      if(data.sid!==messageSid || data.account_sid!==config.accountSid || phone(data.to)!==to) throw new AutomationError('Twilio returned an unexpected message. No SMS was resent.');
      return result(data);
    },
  };
}
module.exports={sid,phone,recipients,personalize,segments,prepared,result,createTransport};
