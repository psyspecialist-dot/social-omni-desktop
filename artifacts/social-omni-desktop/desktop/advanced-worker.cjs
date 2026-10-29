const {randomUUID} = require('node:crypto');
const {defaults,lines,active,email,validateRun} = require('./advanced.cjs');
const network = require('./advanced-network.cjs');
const deps = require('./advanced-deps.cjs');
const browser = require('./advanced-browser.cjs');
const {publicError} = require('./automation-errors.cjs');
const emailMarketing = require('./email-marketing.cjs');
const smsMarketing = require('./sms-marketing.cjs');
const facebookMarketing = require('./facebook-marketing.cjs');

module.exports = function createAdvancedWorker({get,save,ids,recordActivity,runtime,vault,kickLegacy,cancelLegacy,readMedia,smsRequest,assertLicense=()=>{}}) {
  const running=new Map(),auth=new Map();
  let closed=false;
  const touch=(id,fn)=>{
    if(closed) throw new Error('Application closing.');
    const state=get(id); fn(state); save(id,state); return state;
  };
  const telegramClient=(config,signingIn=false)=>{
    const {TelegramClient}=deps('telegram'),{StringSession}=deps('telegram/sessions');
    const client=new TelegramClient(new StringSession(config.session || ''),config.apiId,config.apiHash,
      {connectionRetries:1,requestRetries:signingIn?3:1,autoReconnect:false,floodSleepThreshold:0});
    client.setLogLevel('none'); return client;
  };
  const stage=(id,stage,error='')=>touch(id,s=>{
    const c=s.advanced.connections.find(c=>c.id==='telegram'); if(c) {c.stage=stage;c.error=error;c.connected=stage==='connected';}
  });
  async function authorize(id,phone) {
    let client;
    try {
      const config=vault.read(id,'telegram');
      client=telegramClient(config,true); auth.get(id).client=client;
      const ask=kind=>new Promise((resolve,reject)=>{
        if(closed) return reject(new Error('Closing'));
        const session=auth.get(id);
        session.kind=kind;session.resolve=resolve;session.reject=reject;
        stage(id,kind);
        session.timer=setTimeout(()=>{session.reject?.(new Error('Sign-in timed out.'));},300000);
      });
      await client.start({phoneNumber:async()=>phone,phoneCode:()=>ask('code'),password:()=>ask('password'),onError:async()=>true});
      if(!await client.checkAuthorization()) throw new Error('Authorization did not complete.');
      vault.write(id,'telegram',{...config,session:client.session.save()});
      stage(id,'connected');
      touch(id,s=>recordActivity(s,'Telegram account authorized; encrypted session stored locally.','success'));
    } catch (error) {
      if(!closed) stage(id,'error',publicError(error,'Telegram authorization'));
    } finally {
      const session=auth.get(id); if(session?.timer) clearTimeout(session.timer);
      if(client) await client.disconnect().catch(()=>{});
      auth.delete(id);
    }
  }
  async function execute(id,taskId) {
    let transport,client;
    const session=running.get(id), signal=session.controller.signal;
    const guard=()=>{
      assertLicense();
      if(closed || signal.aborted) throw new Error('Task cancelled.');
      const t=get(id).advanced.tasks.find(t=>t.id===taskId);
      if(!t || !active(t)) throw new Error('Task cancelled.');
    };
    const update=(fn,message,level='info')=>touch(id,s=>{
      const t=s.advanced.tasks.find(t=>t.id===taskId); if(!t || !active(t)) throw new Error('Task cancelled.');
      fn(t,s); if(message) recordActivity(s,message,level,t);
    });
    const pace=async phase=>{
      guard();const seconds=5+Math.floor(Math.random()*8);
      update(t=>{t.phase=`Waiting ${seconds}s · ${phase}`;t.nextActionAt=new Date(Date.now()+seconds*1000).toISOString();},`${phase}: ${seconds}s rate-control delay.`);
      const deadline=Date.now()+seconds*1000;
      while(Date.now()<deadline) {await new Promise(resolve=>setTimeout(resolve,Math.min(200,deadline-Date.now())));guard();}
      update(t=>{t.phase=phase;t.nextActionAt=null;});
    };
    const add=(data,receipt)=>{
      guard();let record;
      update((t,s)=>{
        if(s.advanced.results.length>=2000 && !receipt) throw new Error('Result limit reached. Remove old results before continuing.');
        record=receipt?s.advanced.results.find(r=>r.id===receipt):null;
        if(record) Object.assign(record,data);
        else {
          record={id:randomUUID(),taskId,kind:t.kind,name:'',phone:'',email:'',address:'',website:'',status:'Unknown',reason:'',createdAt:new Date().toISOString(),...data};
          s.advanced.results.unshift(record);
        }
        t.completedCount++;t.progress=Math.min(99,Math.round(t.completedCount/Math.max(1,t.totalCount)*100));
      },`${data.name || data.email || 'Result'}: ${data.status}.`,data.status==='Accepted'?'success':'info');
      return record.id;
    };
    const reserve=target=>{
      guard();let receipt;
      update((t,s)=>{
        if(s.advanced.results.length>=2000) throw new Error('Result limit reached.');
        const r={id:randomUUID(),taskId,kind:t.kind,name:target,phone:'',email:t.kind==='email-send'?target:'',address:'',website:'',
          status:'Unconfirmed',reason:'Submission reserved. Verify the platform/server before attempting again; never automatically retried.',createdAt:new Date().toISOString()};
        if(t.kind==='sms-send') r.phone=target;
        s.advanced.results.unshift(r);receipt=r.id;
      });
      return receipt;
    };
    try {
      const state=get(id),task=state.advanced.tasks.find(t=>t.id===taskId);
      validateRun(state,task,runtime);
      const recipients=task.kind==='email-send'?emailMarketing.recipients(task.source).slice(0,task.limit):task.kind==='sms-send'?smsMarketing.prepared(task.source,task.message,state.store.contacts,task.limit):null;
      const targets=recipients?recipients.map(r=>r.email || r.phone):/^facebook-(join|post)$/.test(task.kind)?facebookMarketing.targets(task.source,task.limit):lines(task.source).slice(0,task.limit);
      update(t=>{t.status='Running';t.phase='Starting';t.totalCount=['maps','telegram-members','whatsapp-members'].includes(t.kind)?t.limit:t.kind==='instagram-post'?1:targets.length;},`${task.kind}: started “${task.name}”.`);
      if(task.kind==='verify-email') {
        for(const value of targets) {await pace('Checking email syntax and mail domain');add(await network.verifyEmail(value));}
      } else if(task.kind==='b2b') {
        for(const url of targets) {
          await pace('Reading an authorized public business website');
          try { const page=await network.fetchWebsite(url,signal);add(network.business(page.html,page.url)); }
          catch {guard();add({website:url,status:'Unknown',reason:'Website unavailable, blocked, private or unreadable. No information inferred.'});}
        }
      } else if(['maps','instagram-post','whatsapp-members'].includes(task.kind)) {
        const outcome = await browser.execute({runtime,task,state,pace,guard,result:add,reserve,readMedia:mediaId=>readMedia(id,mediaId),setContext:context=>{session.context=context;}});
        if (task.kind === 'whatsapp-members') {
          update(t=>{t.totalCount=outcome.count;});
          if (outcome.limitReached) {
            update(t=>{t.status='Needs review';t.phase='Extraction limit reached';t.progress=100;t.nextActionAt=null;
              t.error='Extraction limit reached. Results are partial; review before another extraction.';
            },'Member extraction reached its limit. Saved results are partial, not a complete group directory.','warning');
            return;
          }
        }
      } else if(task.kind==='email-send') {
        const config=vault.read(id,'smtp'); if(!config) throw new Error('SMTP credentials unavailable.');
        transport=deps('nodemailer').createTransport(emailMarketing.transportOptions(config));
        session.transport=transport;
        await pace('Checking the SMTP connection');await transport.verify();guard();
        touch(id,s=>{const c=s.advanced.connections.find(c=>c.id==='smtp');if(c) {c.connected=true;c.stage='connected';}});
        for(const recipient of recipients) {
          const target=recipient.email;
          await pace('Sending an approved email');
          const contact=get(id).store.contacts.find(c=>c.channel==='Email' && c.value.toLowerCase()===target.toLowerCase());
          if(contact && !contact.optedIn) throw new Error('A recipient is opted out in Contacts. Sending stopped.');
          const receipt=reserve(target), template=emailMarketing.personalize(task.message,recipient,contact);
          let info;
          try {
            info=await transport.sendMail({from:config.from,to:target,subject:emailMarketing.personalize(task.subject,recipient,contact),text:template,
              headers:{'X-Mailer':'Social Najhin'},disableFileAccess:true,disableUrlAccess:true});
          } catch(error) {
            guard();
            // An explicit envelope rejection means no message was submitted.
            // Transport loss during DATA remains uncertain and stops the batch.
            if (error.code !== 'EENVELOPE') throw error;
            add({email:target,status:'Rejected',reason:'SMTP rejected this recipient before message submission.'},receipt);
            continue;
          }
          guard();
          if(!info.accepted?.some(e=>String(e).toLowerCase()===target.toLowerCase())) {
            if (info.rejected?.some(e=>String(e).toLowerCase()===target.toLowerCase())) {
              add({email:target,status:'Rejected',reason:'SMTP explicitly rejected the recipient.'},receipt); continue;
            }
            throw new Error('SMTP did not confirm the recipient. Review the reserved attempt before retrying.');
          }
          add({name:recipient.name || contact?.name || target,email:target,status:'Accepted',reason:'SMTP server accepted the message. Recipient delivery, inbox placement and bounce outcome are not guaranteed.'},receipt);
        }
      } else if(task.kind==='sms-send') {
        const config=vault.read(id,'twilio');if(!config) throw new Error('Twilio credentials unavailable.');
        const transport=smsMarketing.createTransport(config,smsRequest);
        await pace('Checking the Twilio connection');await transport.verify(signal);guard();
        touch(id,s=>{const c=s.advanced.connections.find(c=>c.id==='twilio');if(c){c.connected=true;c.stage='connected';c.error='';}});
        for(const recipient of recipients) {
          await pace('Sending an approved SMS');
          const source=recipient.inlineName?`${recipient.inlineName} <${recipient.phone}>`:recipient.phone;
          const current=smsMarketing.prepared(source,task.message,get(id).store.contacts,1)[0];
          const body=current.body;
          const receipt=reserve(recipient.phone),estimate=smsMarketing.segments(body);
          const outcome=await transport.send(recipient.phone,body,signal);guard();
          const {rejected,...confirmed}=outcome;
          add({...confirmed,name:current.name,phone:recipient.phone,providerAccountSid:config.accountSid,estimatedSegments:estimate.count,encoding:estimate.encoding},receipt);
          if(rejected) throw new Error('Twilio rejected the SMS request. Sending stopped; no automatic retry.');
        }
      } else if(task.kind.startsWith('telegram-')) {
        const config=vault.read(id,'telegram'); if(!config?.session) throw new Error('Telegram is not authorized.');
        client=telegramClient(config);session.client=client;await pace('Connecting the Telegram account');await client.connect();
        if(!await client.checkAuthorization()) {stage(id,'ready','Session expired. Sign in again.');throw new Error('Telegram authorization expired. Sign in again.');}
        if(task.kind==='telegram-members') {
          if(targets.length!==1) throw new Error('Choose one authorized group or channel.');
          await pace('Checking group administration permission');
          const entity=await client.getEntity(targets[0]);
          if(!entity.creator && !entity.adminRights) throw new Error('Member extraction is limited to groups/channels you administer.');
          await pace('Reading the permitted member directory');
          const members=await client.getParticipants(entity,{limit:task.limit});
          for(const member of members) {guard();add({name:[member.firstName,member.lastName].filter(Boolean).join(' '),userId:member.id.toString(),username:member.username || '',
            phone:'',email:'',website:member.username?`https://t.me/${member.username}`:'',
            status:'Member · no consent',reason:`User ID ${member.id.toString()}; administration export only. Membership is not marketing consent; privacy-hidden fields are not extracted.`});}
          if(!members.length) throw new Error('No readable members. Telegram may restrict the directory.');
        } else {
          for(const target of targets) {
            await pace('Resolving an approved Telegram target');
            const entity=await client.getEntity(target);
            if(task.kind==='telegram-channel' && entity.broadcast && !entity.creator && !entity.adminRights?.postMessages) throw new Error('You do not have channel-posting permission.');
            await pace('Submitting the approved Telegram message');
            const receipt=reserve(target);
            await client.sendMessage(entity,{message:task.message,parseMode:undefined});
            guard();add({name:target,status:'Accepted',reason:'Telegram returned a message record. Recipient read/delivery is not guaranteed.'},receipt);
          }
        }
      } else if(task.kind.startsWith('facebook-')) {
        const action=task.kind==='facebook-post'?'publish':task.kind.slice(9),account=state.store.accounts.find(a=>a.id===task.accountId);
        const legacy={id:taskId,mode:'live',platform:'Facebook',kind:'campaign',action,accountId:task.accountId,accountName:account.displayLabel,
          campaignId:null,status:'Pending',phase:'Queued',createdAt:new Date().toISOString(),progress:0,currentStep:0,completedCount:0,
          totalCount:targets.length,steps:[],delayMin:5,delayMax:12,keywords:task.query,messageContent:task.message,
           mediaId:task.mediaId || null,mediaName:state.media.find(m=>m.id===task.mediaId)?.name || null,searchLimit:task.limit,
           targets:targets.map(name=>({id:randomUUID(),name,joinStatus:'Pending',postStatus:'Pending',sendStatus:'Pending'}))};
         update((_t,s)=>{s.jobs.unshift(legacy);facebookMarketing.syncResults(s,legacy);});kickLegacy(id);
        while(true) {
          guard();const job=get(id).jobs.find(j=>j.id===taskId);
          update(t=>{t.phase=job.phase;t.progress=job.progress;t.completedCount=job.completedCount || 0;t.totalCount=job.totalCount || 0;});
          if(job.status==='Completed') {
             update((t,s)=>{facebookMarketing.syncResults(s,job);const rows=s.advanced.results.filter(r=>r.taskId===taskId);
               t.totalCount=rows.length;t.completedCount=rows.filter(r=>r.status!=='Not attempted').length;});break;
          }
           if(job.status==='Cancelled') {
             update(t=>{t.status='Cancelled';t.phase='Cancelled';t.nextActionAt=null;},'Facebook browser task cancelled. Already submitted actions cannot be undone.','warning');
             return;
           }
           if(job.status==='Failed') throw new Error('Facebook task stopped. Review its live browser log before retrying.');
          await new Promise(resolve=>setTimeout(resolve,500));
        }
      }
      const rejected = get(id).advanced.results.some(r => r.taskId === taskId && r.status === 'Rejected');
      const review=task.kind.startsWith('facebook-') && get(id).advanced.results.some(r=>r.taskId===taskId && !['Found','Joined','Posted'].includes(r.status));
      update(t=>{t.status=rejected?'Failed':review?'Needs review':'Completed';t.phase=rejected?'Finished with errors':review?'Review Facebook outcomes':'Done';t.progress=100;t.nextActionAt=null;
        if(review)t.error='Review Facebook results manually. Pending membership and uncertain posts are never retried automatically.';
        if(rejected)t.error='Some recipients were rejected. Review the per-recipient report; accepted recipients are not retried.';
      },rejected?'Batch finished with SMTP rejections. Review recipient reports.':'Task completed. Results reflect observed outcomes, not simulated actions.',rejected?'warning':'success');
    } catch (error) {
      if(!closed) {
        const t=get(id).advanced.tasks.find(t=>t.id===taskId);
        if(t && active(t)) touch(id,s=>{
          const task=s.advanced.tasks.find(t=>t.id===taskId);
          const failedPhase=task.phase;
          task.status='Failed';task.phase='Stopped — review required';task.nextActionAt=null;
          // Never persist provider error bodies: SMTP and auth errors may contain credentials.
          task.error=publicError(error, failedPhase);
          recordActivity(s,`${task.kind}: ${task.error}`,'warning',task);
        });
      }
    } finally {
      if(transport) transport.close();
      if(client) await client.disconnect().catch(()=>{});
      if(session.context) await session.context.close().catch(()=>{});
      running.delete(id);
    }
  }
  const timer=setInterval(()=>{
    if(closed || !runtime) return;
    try { assertLicense(); } catch { return; }
    for(const id of ids()) {
      if(running.has(id) || auth.has(id)) continue;
      const state=get(id);
      let missed=false;
      for(const task of state.advanced.tasks) if(task.status==='Scheduled' && Date.now()-Date.parse(task.scheduledAt)>60000) {
        Object.assign(task,{status:'Needs review',phase:'Missed schedule',error:'The app was asleep or another task blocked execution. Review targets and create a new schedule.'});missed=true;
      }
      if(missed) save(id,state);
      if(state.jobs.some(j=>['Pending','Running'].includes(j.status))) continue;
      const task=[...state.advanced.tasks].reverse().find(t=>t.status==='Queued' || t.status==='Scheduled' && Date.parse(t.scheduledAt)<=Date.now());
      if(task) {
        if(task.status==='Scheduled') touch(id,s=>{const t=s.advanced.tasks.find(t=>t.id===task.id);t.status='Queued';});
        const session={taskId:task.id,controller:new AbortController()};
        running.set(id,session);session.promise=execute(id,task.id);
      }
    }
  },1000);
  timer.unref();
  return {
    authBusy:id=>auth.has(id),
    testSms(id) {
      const controller=new AbortController();auth.set(id,{kind:'sms-test',controller});
      setImmediate(async()=>{
        try {
          if(closed) return;
          await smsMarketing.createTransport(vault.read(id,'twilio'),smsRequest).verify(controller.signal);
          if(!closed) touch(id,s=>{const c=s.advanced.connections.find(c=>c.id==='twilio');if(c){c.connected=true;c.stage='connected';c.error='';}
            recordActivity(s,'Twilio authentication and message-read access verified. No SMS was sent; sender eligibility and send permissions still require an approved test.','success');});
        } catch(error) {
          if(!closed) touch(id,s=>{const c=s.advanced.connections.find(c=>c.id==='twilio');if(c){c.connected=false;c.stage='error';c.error=publicError(error,'Twilio connection');}});
        } finally {auth.delete(id);}
      });
    },
    refreshSms(id,resultId) {
      const controller=new AbortController();auth.set(id,{kind:'sms-refresh',controller});
      setImmediate(async()=>{
        try {
          if(closed) return;
          const row=get(id).advanced.results.find(r=>r.id===resultId);
          const outcome=await smsMarketing.createTransport(vault.read(id,'twilio'),smsRequest).lookup(row.providerId,row.phone,controller.signal);
          if(!closed) touch(id,s=>{const current=s.advanced.results.find(r=>r.id===resultId);if(current) Object.assign(current,outcome,{statusCheckedAt:new Date().toISOString(),statusRefreshError:''});
            recordActivity(s,'SMS status read from Twilio. No SMS was resent.');});
        } catch(error) {
          if(!closed) touch(id,s=>{const row=s.advanced.results.find(r=>r.id===resultId);if(row) row.statusRefreshError=publicError(error,'Twilio status lookup');
            recordActivity(s,'SMS status could not be refreshed. The previous outcome was preserved; no SMS was resent.','warning');});
        } finally {auth.delete(id);}
      });
    },
    testSmtp(id){
      auth.set(id,{kind:'smtp-test'});
      setImmediate(async()=>{
        let transport;
        try {
          if(closed) return;
          const config=vault.read(id,'smtp');
          transport=deps('nodemailer').createTransport(emailMarketing.transportOptions(config));
          await transport.verify();
          touch(id,s=>{const c=s.advanced.connections.find(c=>c.id==='smtp');if(c){c.connected=true;c.stage='connected';c.error='';}
            recordActivity(s,'SMTP connection verified. No email was sent.','success');});
        } catch (error) {
          if(!closed) touch(id,s=>{const c=s.advanced.connections.find(c=>c.id==='smtp');if(c){c.connected=false;c.stage='error';c.error=publicError(error,'SMTP connection');}});
        } finally {transport?.close();auth.delete(id);}
      });
    },
    beginAuth(id,phone){auth.set(id,{});setImmediate(()=>{if(!closed) void authorize(id,phone);});},
    answerAuth(id,kind,value){const session=auth.get(id);if(!session?.resolve || session.kind!==kind) throw Object.assign(new Error('No matching Telegram sign-in prompt.'),{status:400});
      clearTimeout(session.timer);const resolve=session.resolve;session.resolve=null;resolve(value);},
    cancel(id,taskId){const session=running.get(id);if(session?.taskId===taskId){session.controller.abort();session.transport?.close();void session.client?.disconnect().catch(()=>{});void session.context?.close().catch(()=>{});}cancelLegacy(id,taskId);},
    close(){closed=true;clearInterval(timer);
      const sessions=[...running.values()];
      for(const session of sessions){session.controller.abort();session.transport?.close();}
      for(const session of auth.values()){clearTimeout(session.timer);session.controller?.abort();session.reject?.(new Error('Closing'));void session.client?.disconnect().catch(()=>{});}
      return Promise.allSettled(sessions.map(async session=>{
        await session.context?.close().catch(()=>{});
        await session.client?.disconnect().catch(()=>{});
        await session.promise;
      }));
    },
  };
};
