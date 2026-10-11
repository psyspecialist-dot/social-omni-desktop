import { strToU8, zipSync } from 'fflate';
import type { AdvancedResult } from '@workspace/api-client-react';

const headers = ['Module', 'Name', 'Phone', 'Email', 'Address', 'Website', 'Status', 'Reason', 'Created', 'Telegram User ID', 'Telegram Username'];
const clean = (value: unknown): string => {
  // eslint-disable-next-line no-control-regex
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
};
const safe = (value: unknown): string => {
  const text = clean(value);
  return /^[=+\-@\t\r|%]/.test(text.trimStart()) || /^[\t\r]/.test(text) ? `'${text}` : text;
};
const row = (r: AdvancedResult) => [r.kind, r.name, r.phone, r.email, r.address, r.website, r.status, r.reason, r.createdAt, r.userId, r.username].map(clean);
const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const col = (i: number) => String.fromCharCode(65 + i);

export function makeAdvancedCsv(results: AdvancedResult[]): string {
  if (!results.length) throw new Error('There are no results to export.');
  const rows = [headers, ...results.map(row)];
  return '\uFEFF' + rows.map(r => r.map(c => `"${safe(c).replace(/"/g, '""')}"`).join(',')).join('\r\n') + '\r\n';
}
export function makeAdvancedXlsx(results: AdvancedResult[]): Uint8Array {
  if (!results.length) throw new Error('There are no results to export.');
  const rows = [headers, ...results.map(row)];
    const files: Record<string, Uint8Array> = {};
    const add = (n: string, c: string) => { files[n] = strToU8(c); };
    add('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
    add('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    add('xl/workbook.xml', '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Results" sheetId="1" r:id="rId1"/></sheets></workbook>');
    add('xl/_rels/workbook.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
    add('xl/worksheets/sheet1.xml', `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((r, i) => `<row r="${i + 1}">${r.map((v, c) => `<c r="${col(c)}${i + 1}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`);
    return zipSync(files);
}
export function downloadAdvancedResults(results: AdvancedResult[], format: 'csv' | 'xlsx', label = 'results'): void {
  const blob = format === 'csv'
    ? new Blob([makeAdvancedCsv(results)], { type: 'text/csv;charset=utf-8' })
    : new Blob([new Uint8Array(makeAdvancedXlsx(results)).buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = `social-najhin-${label}-${new Date().toISOString().slice(0, 10)}.${format}`;
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export async function readListFile(file: File, kind = ''): Promise<string> {
  if (file.size > 2 * 1024 * 1024) throw new Error('List files must be at most 2 MB.');
  if (!/\.(txt|csv)$/i.test(file.name)) throw new Error('Choose a TXT or CSV file.');
  const text = (await file.text()).replace(/^\uFEFF/, '');
  if (/\.txt$/i.test(file.name)) return text.trim();
  const first = text.split(/\r?\n/, 1)[0];
  const delimiter = first.includes('\t') ? '\t' : first.includes(';') && !first.includes(',') ? ';' : ',';
  const rows: string[][] = [];
  let cells: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) { cells.push(cell.trim()); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      cells.push(cell.trim()); if (cells.some(Boolean)) rows.push(cells);
      cells = []; cell = '';
    } else cell += char;
  }
  if (quoted) throw new Error('The CSV has an unclosed quoted field.');
  cells.push(cell.trim()); if (cells.some(Boolean)) rows.push(cells);
  if (!rows.length) return '';
  const header = rows[0].map(value => value.toLowerCase().replace(/[\s_-]/g, ''));
  const names = ['email-send', 'verify-email'].includes(kind) ? ['email', 'emails', 'emailaddress']
    : kind.startsWith('telegram') ? ['telegramusername', 'username', 'telegramuserid', 'userid', 'id']
    : ['website', 'url', 'groupurl', 'target'];
  const column = header.findIndex(value => names.includes(value));
  if (column >= 0) {
    const nameColumn = header.findIndex(value => ['name','fullname','recipientname'].includes(value));
    return [...new Set(rows.slice(1).map(row => {
      const address=row[column] || '', name=nameColumn >= 0 ? row[nameColumn] || '' : '';
      if(kind !== 'email-send' || !name || !address) return address;
      if(/[<>\r\n]/.test(name) || name.length>150) throw new Error('Recipient name must not contain angle brackets or newlines.');
      return `${name} <${address}>`;
    }).filter(Boolean))].join('\n');
  }
  if (rows.some(row => row.length > 1)) throw new Error(`Use a single-column CSV or add a ${names[0]} column header.`);
  return [...new Set(rows.map(row => row[0]).filter(Boolean))].join('\n');
}
