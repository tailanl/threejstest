const fs = require('fs');
const src = fs.readFileSync('src/components/game/GameScene.tsx', 'utf8');
const lines = src.split('\n');
let depth = 0;

for (let li = 2885; li < Math.min(6490, lines.length); li++) {
  const prevDepth = depth;
  const ln = lines[li];
  for (const ch of ln) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
  }
  // Show all lines where depth >= 4 or where depth changes to/from 4/5
  if (depth >= 4 || prevDepth >= 4 || (depth >= 3 && depth !== prevDepth)) {
    console.log(`L${li+1}: ${prevDepth}->${depth} | ${ln.trim().substring(0, 120)}`);
  }
}
console.log(`\nAt L6490: depth=${depth}`);
