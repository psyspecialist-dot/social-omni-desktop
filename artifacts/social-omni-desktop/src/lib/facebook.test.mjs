import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {normalizeGroupUrl,normalizeGroupLines,safePermalink} from '../modules/advanced/config.ts';
const require=createRequire(import.meta.url),backend=require('../../../../lib/socialomni-api/facebook-marketing.cjs');
test('Facebook editor and backend save exactly the same canonical group URLs',()=>{
  const variants=['https://www.facebook.com/groups/1?ref=x','https://www.facebook.com/groups/1/','https://www.facebook.com/groups/1','https://www.facebook.com/groups/example.group#about'];
  for(const value of variants)assert.equal(normalizeGroupUrl(value),backend.groupUrl(value));
  const result=normalizeGroupLines(variants.join('\n'));
  assert.deepEqual(result,{ok:['https://www.facebook.com/groups/1/','https://www.facebook.com/groups/example.group/'],bad:[]});
  for(const value of ['https://user:pass@www.facebook.com/groups/1','https://www.facebook.com:444/groups/1','https://www.facebook.com/groups/%31','https://www.facebook.com/groups/1/posts/2','https://evil.example/groups/1']) {
    assert.equal(normalizeGroupUrl(value),null);assert.throws(()=>backend.groupUrl(value));
  }
});
test('Facebook receipt links are explicit same-provider group post permalinks',()=>{
  assert.equal(safePermalink('https://www.facebook.com/groups/1/posts/99/'),'https://www.facebook.com/groups/1/posts/99/');
  for(const value of ['javascript:alert(1)','https://evil.example/groups/1/posts/99/','https://user@www.facebook.com/groups/1/posts/99/','https://www.facebook.com/groups/1/','https://www.facebook.com/groups/1/posts/%99'])assert.equal(safePermalink(value),null);
});
