const fs = require('fs');
const src = fs.readFileSync('src/components/game/GameScene.tsx', 'utf8');
const lines = src.split('\n');
let d = 0;

function skipStringsAndComments(ln, startPos) {
  let i = startPos;
  while (i < ln.length) {
    const c = ln[i];
    if (c === '/' && i + 1 < ln.length && ln[i + 1] === '/') return ln.length; // rest is comment
    if (c === "'" || c === '"' || c === '`') {
      const q = c;
      i++;
      while (i < ln.length && ln[i] !== q) { if (ln[i] === '\\') i++; i++; }
      i++;
      continue;
    }
    // Not a string start - check for bracket
    return i; // return position of first non-string char
  }
  return i;
}

// Simplified: just track ( and ) skipping strings/comments per line
for (let li = 0; li < lines.length; li++) {
  const prevD = d;
  const ln = lines[li];
  let i = 0;
  while (i < ln.length) {
    const c = ln[i];
    // Skip // comments
    if (c === '/' && i + 1 < ln.length && ln[i + 1] === '/') break;
    // Skip strings
    if (c === "'" || c === '"' || c === '`') {
      const q = c;
      i++;
      while (i < ln.length && ln[i] !== q) { if (ln[i] === '\\') i++; i++; }
      i++;
      continue;
    }
    // Skip /* */ comments
    if (c === '/' && i + 1 < ln.length && ln[i + 1] === '*') {
      i += 2;
      while (i < ln.length) {
        if (ln[i] === '*' && i + 1 < ln.length && ln[i + 1] === '/') { i += 2; break; }
        i++;
      }
      continue;
    }
    if (c === '(') d++;
    else if (c === ')') d--;
    i++;
  }
  // Show depth at key points
  if ((li >= 2885 && li <= 2886) || (li >= 6712 && li <= 6714) || 
      (li >= 6883 && li <= 6885) || (li >= 9384 && li <= 9386)) {
    console.log(`L${li+1}: d=${prevD}->${d} | ${ln.trim().substring(0, 100)}`);
  }
}
console.log(`\nFinal: ${d}`);
