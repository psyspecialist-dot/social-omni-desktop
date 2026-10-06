import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { makeLeadCsv, makeLeadXlsx } from './lead-export.ts';

const sample = {
  id: 'demo', businessName: 'Demo café, "Central" & <North>', phoneNumber: '+12025550100',
  address: '100 Example Street, Example City', website: 'https://business-001.example',
  keyword: 'cafes', city: 'Example City', jobId: 'demo', createdAt: '', simulated: true,
};
test('CSV has headers, escaped fields, Unicode and safe text phone numbers', () => {
  const csv = makeLeadCsv([sample]);
  assert.ok(csv.startsWith('\uFEFF"Business Name","Phone Number","Address","Website","Data Source"'));
  assert.ok(csv.includes('"Demo café, ""Central"" & <North>"'));
  assert.ok(csv.includes(`"'+12025550100"`));
  assert.ok(csv.includes('Synthetic local simulation'));
  assert.ok(makeLeadCsv([{ ...sample, businessName: '=HYPERLINK("https://bad.example")' }]).includes(`"'=HYPERLINK`));
});
test('XLSX contains valid workbook parts, XML escaping and literal string cells', () => {
  const files = unzipSync(makeLeadXlsx([sample]));
  assert.equal(Object.keys(files).length, 5);
  const sheet = strFromU8(files['xl/worksheets/sheet1.xml']);
  assert.ok(sheet.includes('Demo café, &quot;Central&quot; &amp; &lt;North&gt;'));
  assert.ok(sheet.includes('<c r="B2" t="inlineStr"><is><t xml:space="preserve">+12025550100</t></is></c>'));
  assert.ok(sheet.includes('Synthetic local simulation'));
  assert.ok(sheet.includes('autoFilter ref="A1:E2"'));
  assert.ok(strFromU8(files['xl/workbook.xml']).includes('name="Simulated Leads"'));
  assert.ok(!sheet.includes('<f>'));
});
