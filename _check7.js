const fs = require('fs');
const src = fs.readFileSync('src/components/game/GameScene.tsx', 'utf8');
const lines = src.split('\n');
let depth = 0;
let baseline = 0; // depth at start of animate (should be 1)
for (let li = 0; li < lines.length; li++) {
  const prevDepth = depth;
  const ln = lines[li];
  for (const ch of ln) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
  }
  if (li === 2885) baseline = prevDepth; // depth before animate starts
  // In range 4100-4740, show all lines where depth != 1 (the expected baseline inside animate)
  if (li >= 4100 && li < 4740) {
    if (depth !== 1 || prevDepth !== 1) {
      console.log(`L${li+1}: ${prevDepth}->${depth} | ${ln.trim().substring(0, 120)}`);
    }
  }
}
console.log(`\nBaseline (before animate): ${baseline}`);
console.log(`Depth at L4740: ${depth}`);
