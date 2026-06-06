const fs = require('fs');
const src = fs.readFileSync('src/components/game/GameScene.tsx', 'utf8');
const lines = src.split('\n');
let depth = 0;
// Track when depth first becomes abnormal in animate function (2886+)
let found = false;
let targetStart = 2885; // animate starts at line 2886

for (let li = 0; li < lines.length; li++) {
  const prevDepth = depth;
  const ln = lines[li];
  for (const ch of ln) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
  }
  // In animate range, show every line's depth to find the anomaly
  if (li >= targetStart && li <= 6715) {
    // Only show lines where depth is > 2 or where depth changes
    if (depth > 2 || (depth !== prevDepth && depth >= 2)) {
      console.log(`L${li+1}: ${prevDepth}->${depth} | ${ln.trim().substring(0, 120)}`);
    }
  }
}
console.log(`\nFinal depth: ${depth}`);
