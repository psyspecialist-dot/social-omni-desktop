import { strToU8, strFromU8, zipSync, unzipSync } from 'fflate';
import type { WaFilterResult } from '@workspace/api-client-react';

function csvRows(source: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"') {
      if (quoted && source[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted;
    } else if (!quoted && /[,;\t]/.test(c)) { row.push(cell); cell = ''; }
    else if (!quoted && /[\r\n]/.test(c)) {
      if (c === '\r' && source[i + 1] === '\n') i++;
      row.push(cell); if (row.some(v => v.trim())) rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (quoted) throw new Error('CSV contains an unfinished quoted field.');
  row.push(cell); if (row.some(v => v.trim())) rows.push(row);
  return rows;
}
const pickPhones = (rows: string[][]) => {
  if (!rows.length) throw new Error('No phone numbers found in this file.');
  const index = rows[0].findIndex(c => typeof c === 'string' && /^(phone(?: number)?|mobile(?: number)?|number|whatsapp)$/i.test(c.trim()));
  const selected = index < 0 ? rows.flat() : rows.slice(1).map(r => r[index]);
  const source = selected.filter(Boolean).map(v => v.trim()).filter(Boolean).join('\n');
  if (!source || source.length > 10000) throw new Error('Use a list of at most 200 numbers and 10,000 characters.');
  return source;
};
export async function importPhones(file: File): Promise<string> {
  if (file.size > 5 * 1024 * 1024) throw new Error('Import files must be at most 5 MB.');
  const extension = file.name.split('.').at(-1)?.toLowerCase();
  if (extension === 'txt') return pickPhones(csvRows((await file.text()).replace(/^\uFEFF/, '')));
  if (extension === 'csv') return pickPhones(csvRows((await file.text()).replace(/^\uFEFF/, '')));
  if (extension !== 'xlsx') throw new Error('Choose a TXT, CSV or Excel (.xlsx) file.');
  let expanded = 0;
  const bytes = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: entry => {
    if (!/^xl\/(?:sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/.test(entry.name)) return false;
    expanded += entry.originalSize;
    if (expanded > 10 * 1024 * 1024) throw new Error('Excel content is too large. Export the phone column to CSV.');
    return true;
  } });
  const parse = (name: string) => {
    const data = bytes[name]; if (!data) return null;
    const doc = new DOMParser().parseFromString(strFromU8(data), 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('Invalid Excel XML. Try exporting the phone column to CSV.');
    return doc;
  };
  const shared = parse('xl/sharedStrings.xml');
  const strings = shared ? Array.from(shared.getElementsByTagName('si')).map(n => n.textContent || '') : [];
  const sheetName = Object.keys(bytes).filter(n => n.startsWith('xl/worksheets/')).sort()[0];
  const sheet = sheetName && parse(sheetName);
  if (!sheet) throw new Error('No readable worksheet found.');
  const rows = Array.from(sheet.getElementsByTagName('row')).slice(0, 1000).map(row => {
    const cells: string[] = [];
    for (const cell of Array.from(row.getElementsByTagName('c'))) {
      const col = (cell.getAttribute('r') || 'A').replace(/\d/g, '').split('').reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
      if (col > 100) continue;
      const value = cell.getElementsByTagName('v')[0]?.textContent || '';
      cells[col] = cell.getAttribute('t') === 's' ? strings[Number(value)] || '' :
        cell.getAttribute('t') === 'inlineStr' ? cell.getElementsByTagName('is')[0]?.textContent || '' : value;
    }
    return cells;
  });
  return pickPhones(rows);
}
const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function downloadFilter(results: WaFilterResult[], format: 'csv' | 'xlsx'): void {
  const active = [...new Set(results.filter(r => r.status === 'Active/Valid').map(r => r.phone))];
  if (!active.length) throw new Error('No live-verified active numbers to export.');
  let blob: Blob;
  if (format === 'csv') {
    blob = new Blob(['\uFEFFPhone Number\r\n' + active.map(p => `"${`'${p}`.replace(/"/g, '""')}"`).join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
  } else {
    const files: Record<string, Uint8Array> = {};
    const add = (name: string, content: string) => { files[name] = strToU8(content); };
    add('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
    add('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    add('xl/workbook.xml', '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Active Numbers" sheetId="1" r:id="rId1"/></sheets></workbook>');
    add('xl/_rels/workbook.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
    add('xl/worksheets/sheet1.xml', `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="25" customWidth="1"/></cols><sheetData>${['Phone Number', ...active].map((v, i) => `<row r="${i + 1}"><c r="A${i + 1}" t="inlineStr"><is><t>${escapeXml(v)}</t></is></c></row>`).join('')}</sheetData></worksheet>`);
    blob = new Blob([new Uint8Array(zipSync(files)).buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = `social-najhin-active-numbers-${new Date().toISOString().slice(0, 10)}.${format}`;
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}
