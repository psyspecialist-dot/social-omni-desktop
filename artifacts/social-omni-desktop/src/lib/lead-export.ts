import { strToU8, zipSync } from 'fflate';
import type { Lead } from './api';

const headers = ['Business Name', 'Phone Number', 'Address', 'Website', 'Data Source'];
const rows = (leads: Lead[]) => [headers, ...leads.map(l => [l.businessName, l.phoneNumber, l.address, l.website, 'Synthetic local simulation'])];
// Remove illegal XML characters and escape all user-provided text.
const xml = (value: string) => value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
// CSV spreadsheet applications may interpret formulas even inside quoted cells.
// Use a literal-text prefix for formula-like values (including + phone numbers).
const csvCell = (value: string) => `"${(/^[\s]*[=+\-@\t\r]/.test(value) ? `'${value}` : value).replace(/"/g, '""')}"`;

export function makeLeadCsv(leads: Lead[]): string {
  return '\uFEFF' + rows(leads).map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function makeLeadXlsx(leads: Lead[]): Uint8Array {
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const sheetRows = rows(leads).map((row, i) => `<row r="${i + 1}">${row.map((cell, j) =>
    `<c r="${String.fromCharCode(65 + j)}${i + 1}" t="inlineStr"><is><t xml:space="preserve">${xml(cell)}</t></is></c>`).join('')}</row>`).join('');
  const files = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Simulated Leads" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${ns}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="30" customWidth="1"/><col min="2" max="2" width="20" customWidth="1"/><col min="3" max="3" width="50" customWidth="1"/><col min="4" max="5" width="35" customWidth="1"/></cols><sheetData>${sheetRows}</sheetData><autoFilter ref="A1:E${leads.length + 1}"/></worksheet>`,
  };
  return zipSync(Object.fromEntries(Object.entries(files).map(([name, content]) => [name, strToU8(content)])));
}

export function downloadLeads(leads: Lead[], format: 'csv' | 'xlsx'): void {
  if (!leads.length) throw new Error('There are no simulated leads to export.');
  const blob = format === 'csv'
    ? new Blob([makeLeadCsv(leads)], { type: 'text/csv;charset=utf-8' })
    : new Blob([new Uint8Array(makeLeadXlsx(leads)).buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `socialomni-simulated-leads-${new Date().toISOString().slice(0, 10)}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}
