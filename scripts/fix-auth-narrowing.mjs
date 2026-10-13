import fs from 'fs';
import path from 'path';

function walk(d, a = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, a);
    else if (p.endsWith('.ts')) a.push(p);
  }
  return a;
}

const files = walk('app').concat(walk('lib'));
let n = 0;
const re = /if \(!(\w+)\.ok\) return jsonErr\(\1\.status, \1\.error\.message, \1\.error\.code\);/g;
for (const f of files) {
  let c = fs.readFileSync(f, 'utf8');
  const o = c;
  c = c.replace(re, (_, v) => `if (!${v}.ok) { return jsonErr(${v}.status, ${v}.error.message, ${v}.error.code); }`);
  if (c !== o) {
    fs.writeFileSync(f, c);
    n++;
    console.log(f);
  }
}
console.log('updated', n);
