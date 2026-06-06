const fs = require('fs');
const src = fs.readFileSync('src/components/game/GameScene.tsx', 'utf8');
let d = 0, i = 0, line = 1;
while (i < src.length && line <= 4560) {
  const c = src[i];
  if (c === '\n') line++;
  if (c === "'" || c === '"' || c === '`') {
    const q = c; i++;
    while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; }
    i++; continue;
  }
  if (c === '/' && i + 1 < src.length && src[i + 1] === '/') {
    while (i < src.length && src[i] !== '\n') i++; continue;
  }
  if (c === '/' && i + 1 < src.length && src[i + 1] === '*') {
    i += 2;
    while (i < src.length && !(src[i] === '*' && i + 1 < src.length && src[i + 1] === '/')) {
      if (src[i] === '\n') line++; i++;
    }
    continue;
  }
  if (c === '(') d++;
  if (c === ')') d--;
  i++;
}
console.log(`Depth at L4560 (skip str/cmnt): ${d}`);
// Also show depth at key points around the push
const lines = src.split('\n');
d = 0;
for (let li = 0; li < lines.length && li < 4555; li++) {
  const prevD = d;
  const ln = lines[li];
  let j = 0;
  while (j < ln.length) {
    const c = ln[j];
    if (c === "'" || c === '"' || c === '`') { const q = c; j++; while (j < ln.length && ln[j] !== q) { if (ln[j] === '\\') j++; j++; } j++; continue; }
    if (c === '/' && j + 1 < ln.length && ln[j + 1] === '/') break;
    if (c === '(') d++; else if (c === ')') d--;
    j++;
  }
  if (li >= 4535 && li <= 4552) {
    console.log(`L${li+1}: ${prevD}->${d} | ${ln.trim().substring(0, 80)}`);
  }
}
