const fs = require('fs');
const src = fs.readFileSync('src/components/game/GameScene.tsx', 'utf8');
const lines = src.split('\n');
let depth = 0;
// Find where depth first becomes 4 or more in the file (after line 2886)
for (let li = 0; li < lines.length; li++) {
  const prevDepth = depth;
  const ln = lines[li];
  for (const ch of ln) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
  }
  // In the range before L6464, show when depth first hits 4 or 5
  if (li >= 2885 && li < 6464 && depth >= 4) {
    console.log(`L${li+1}: ${prevDepth}->${depth} | ${ln.trim().substring(0, 120)}`);
    if (prevDepth < 4) console.log(`  ^^^ FIRST TIME depth>=4!`);
    break;
  }
}
// Also check: what's the depth at line 4009 (after selectionMeshes object)
let d2 = 0;
for (let li = 0; li < 4010 && li < lines.length; li++) {
  for (const ch of lines[li]) { if (ch==='(') d2++; else if (ch===')') d2--; }
}
console.log(`\nDepth at L4010: ${d2}`);
