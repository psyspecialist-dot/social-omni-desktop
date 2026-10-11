import {test} from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {makeAdvancedCsv,makeAdvancedXlsx} from './advanced-export.ts';
const member={id:'fixture',taskId:'fixture',kind:'whatsapp-members',name:'أحمد، "Ali" & <Co>',phone:'+212600000001',
  email:'',address:'',website:'',status:'Extracted',reason:'Visible member; no marketing consent.',createdAt:'2026-10-11'};
test('member CSV preserves Arabic, escaping, missing phones and prevents formulas',()=>{
  const csv=makeAdvancedCsv([member,{...member,name:'=HYPERLINK("x")',phone:'',status:'Unknown'}]);
  assert.ok(csv.startsWith('\uFEFF"Module","Name","Phone"'));
  assert.ok(csv.includes('أحمد، ""Ali"" & <Co>'));
  assert.ok(csv.includes('"\' +212600000001"'.replace("' ","'")));
  assert.ok(csv.includes(`"'=HYPERLINK`));
  assert.ok(csv.includes('"Unknown"'));
});
test('member Excel keeps + and digits literally without formulas or apostrophes',()=>{
  const files=unzipSync(makeAdvancedXlsx([member,{...member,name:'=1+1',phone:''}]));
  const sheet=strFromU8(files['xl/worksheets/sheet1.xml']);
  assert.ok(sheet.includes('<c r="C2" t="inlineStr"><is><t xml:space="preserve">+212600000001</t>'));
  assert.ok(sheet.includes('أحمد، &quot;Ali&quot; &amp; &lt;Co&gt;'));
  assert.ok(sheet.includes('>=1+1</t>'));
  assert.ok(!sheet.includes('<f>'));
  assert.ok(!sheet.includes("'+2126"));
});
test('empty exports fail explicitly',()=>{
  assert.throws(()=>makeAdvancedCsv([]),/no results/);
  assert.throws(()=>makeAdvancedXlsx([]),/no results/);
});
