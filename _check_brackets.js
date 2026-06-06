const fs = require('fs');
const src = fs.readFileSync('src/components/game/GameScene.tsx', 'utf8');
let depth = 0;
let line = 1;
let firstPositive = null;

for (let i = 0; i < src.length; i++) {
  if (src[i] === '\n') line++;
  const ch = src[i];
  
  // Skip strings
  if (ch === "'" || ch === '"' || ch === '`') {
    const q = ch;
    i++;
    while (i < src.length && src[i] !== q) {
      if (src[i] === '\\') i++;
      i++;
    }
    continue;
  }
  
  // Skip // comments
  if (ch === '/' && i + 1 < src.length && src[i + 1] === '/') {
    while (i < src.length && src[i] !== '\n') i++;
    continue;
  }
  
  // Skip /* comments */
  if (ch === '/' && i + 1 < src.length && src[i + 1] === '*') {
    i += 2;
    while (i < src.length && !(src[i] === '*' && i + 1 < src.length && src[i + 1] === '/')) {
      if (src[i] === '\n') line++;
      i++;
    }
    continue;
  }
  
  if (ch === '(') {
    depth++;
    if (depth > 0 && !firstPositive) {
      firstPositive = { line, depth, pos: i };
      console.log(`First unclosed '(' at line ${line}, depth=${depth}`);
      // Show surrounding context
      const start = Math.max(0, src.lastIndexOf('\n', i) + 1);
      const end = src.indexOf('\n', i);
      console.log(`Context: ${src.substring(start, end).trim()}`);
    }
  } else if (ch === ')') {
    depth--;
    if (firstPositive && depth <= 0) {
      firstPositive = null;
    }
  }
}

console.log(`\nFinal depth: ${depth}`);
console.log(`Total lines: ${line}`);

// Show all lines where depth > 0 in the 2800-6720 range (animate function)
const lines = src.split('\n');
depth = 0;
for (let li = 0; li < lines.length; li++) {
  const ln = lines[li];
  for (const ch of ln) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
  }
  if (depth > 0 && li >= 2880 && li <= 6720) {
    console.log(`Line ${li+1}: depth=${depth} | ${ln.trim().substring(0, 120)}`);
  }
}
