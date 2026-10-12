import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {estimateSms,renderSms,isE164ish} from './sms.ts';
const require=createRequire(import.meta.url);
const backend=require('../../../../lib/socialomni-api/sms-marketing.cjs');
test('UI encoding and phone validation agree with the backend',()=>{
  for(const text of ['', 'A'.repeat(160),'A'.repeat(161),'^'.repeat(81),'ع'.repeat(71),'😀'.repeat(36),'Hi Zoë €']) {
    const expected=backend.segments(text),actual=estimateSms(text);
    assert.equal(actual.encoding,expected.encoding);assert.equal(actual.units,expected.units);assert.equal(actual.segments,expected.count);
  }
  for(const number of ['+15550001001','+1 (555) 000-1001','+1234567','+12345678','5550001001','+ 1 5550001001']) {
    let valid=true;try{backend.phone(number);}catch{valid=false;}
    assert.equal(isE164ish(number),valid);
  }
  const name='$& {{phone}}',phone='+15550001001',template='{{name}} / {{phone}} / {{ name }}';
  assert.equal(renderSms(template,name,phone),backend.personalize(template,{name,phone}));
});
