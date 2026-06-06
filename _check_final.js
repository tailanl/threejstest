const fs = require('fs');
const src = fs.readFileSync('src/components/game/GameScene.tsx', 'utf8');
let d = 0, inStr = false, strCh = '', esc = false, line = 1;
for (let i = 0; i < src.length; i++) {
  const c = src[i];
  if (c === '\n') line++;
  if (esc) { esc = false; continue; }
  if (!inStr && (c === "'" || c === '"' || c === '`')) {
    inStr = true; strCh = c; i++; continue;
  }
  if (inStr) {
    if (c === strCh) {
      inStr = false;
    }
    if (c === '\\') esc = true;
    continue;
  }
  // Skip // comments
  if (c === '/' && i + 1 < src.length && src[i + 1] === '/') {
    while (i < src.length && src[i] !== '\n') i++;
    continue;
  }
  // Skip /* */ comments
  if (c === '/' && i + 1 < src.length && src[i + 1] === '*') {
    i += 2;
    while (i < src.length && !(src[i] === '*' && i + 1 < src.length && src[i + 1] === '/')) {
      if (src[i] === '\n') line++;
      i++;
    }
    continue;
  }
  if (c === '(') d++;
  if (c === ')') d--;
}
console.log('Final depth (skipping strings/comments):', d);
