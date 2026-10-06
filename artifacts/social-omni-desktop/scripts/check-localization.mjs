import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.resolve(root,'../../package.json'));
const ts=require('typescript');
const allowed=new Set(['Social Najhin','SN','AR','EN','AR / EN','EN / AR','CSV','Excel','XLSX','SMTP','SQLite','API','QR','WhatsApp','Facebook','Instagram','Telegram','TikTok','WaFilter','WA-CRM','ID','api_id','api_hash']);
const attrs=new Set(['placeholder','title','aria-label','alt']);
const configFile=path.join(root,'src/modules/advanced/config.ts');
const configLabels=new Set(['label','hint','source','query','message','consent','eyebrow','title','sub']);
const gaps=[];
const missing=new Set();
const catalogKeys=new Set();
for(const name of ['ar.ts','extra-ar.ts']){
  const source=ts.createSourceFile(name,fs.readFileSync(path.join(root,'src/i18n',name),'utf8'),ts.ScriptTarget.Latest,true);
  function catalog(node){
    if(ts.isPropertyAssignment(node) && (ts.isStringLiteral(node.name)||ts.isIdentifier(node.name)))catalogKeys.add(node.name.text);
    ts.forEachChild(node,catalog);
  }
  catalog(source);
}
const normalized=s=>s.replace(/\s+/g,' ').trim();
function exempt(s){
  return !/[A-Za-z]/.test(s) || allowed.has(s) || /^https?:\/\//.test(s) ||
    /^[\w.+-]+@[\w.-]+\.[a-z]+$/i.test(s) || /^[@+][\w\d]+$/.test(s) ||
    /^\{\{[\w]+\}\}$/.test(s) || s==='DEMO-XXXX-XXXX-XXXX' || /^demo-[\w-]+$/.test(s);
}
function inCode(node){
  for(let p=node.parent;p;p=p.parent) if(ts.isJsxElement(p) && ['code','pre'].includes(p.openingElement.tagName.getText())) return true;
  return false;
}
function check(file){
  const text=fs.readFileSync(file,'utf8'),source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  function visit(node){
    let value='';
    if(ts.isCallExpression(node) && node.expression.getText(source)==='t' && node.arguments[0] && ts.isStringLiteral(node.arguments[0])){
      const key=node.arguments[0].text;
      if(!catalogKeys.has(key) && !exempt(key))missing.add(key);
    }
    if(file===configFile && ts.isPropertyAssignment(node) && configLabels.has(node.name.getText(source)) && ts.isStringLiteral(node.initializer)){
      const key=node.initializer.text;
      if(!catalogKeys.has(key) && !exempt(key))missing.add(key);
    }
    if(ts.isJsxExpression(node) && node.expression && ts.isPropertyAccessExpression(node.expression) && ['label','hint','consent'].includes(node.expression.name.text)){
      const {line}=source.getLineAndCharacterOfPosition(node.getStart(source));
      gaps.push(`${path.relative(root,file)}:${line+1} Untranslated display metadata: ${node.expression.getText(source)}`);
    }
    if(ts.isJsxText(node)) value=normalized(node.getText(source));
    if(ts.isJsxAttribute(node) && attrs.has(node.name.getText(source)) && node.initializer && ts.isStringLiteral(node.initializer)){
      // These components localize string props themselves.
      const element=node.parent.parent, tag=element.tagName?.getText(source);
      if(!['PageHeading','Stat','Empty','Head','Confirm'].includes(tag))value=normalized(node.initializer.text);
    }
    if(value && !exempt(value) && !inCode(node)){
      const {line}=source.getLineAndCharacterOfPosition(node.getStart(source));
      gaps.push(`${path.relative(root,file)}:${line+1} ${value}`);
    }
    ts.forEachChild(node,visit);
  }
  visit(source);
}
function walk(directory){
  for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
    if(entry.name==='ui' || entry.name==='i18n') continue;
    const file=path.join(directory,entry.name);
    if(entry.isDirectory()) walk(file);else if(file.endsWith('.tsx'))check(file);
  }
}
walk(path.join(root,'src'));
check(configFile);
console.log(`Unwrapped static UI translation gaps: ${gaps.length}`);
for(const gap of gaps.slice(0,60))console.log(gap);
console.log(`Missing literal translation keys: ${missing.size}`);
for(const key of missing)console.log(`Missing: ${key}`);
if(gaps.length || missing.size)process.exitCode=1;
