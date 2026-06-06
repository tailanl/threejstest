const fs = require('fs');
const src = fs.readFileSync('src/components/game/GameScene.tsx', 'utf8');
const lines = src.split('\n');
let depth = 0;

for (let li = 0; li < lines.length; li++) {
  const prevDepth = depth;
  const ln = lines[li];
  for (const ch of ln) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
  }
  // Show around transition points and in the target range
  if (depth !== prevDepth || (li >= 6530 && li <= 6540)) {
    console.log(`L${li+1}: ${prevDepth}->${depth} | ${ln.trim().substring(0, 120)}`);
  }
}
console.log(`\nFinal depth: ${depth}`);
