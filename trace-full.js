const fs = require('fs');
const c = fs.readFileSync('src/components/game/GameScene.tsx', 'utf8');
const lines = c.split('\n');

// Full trace from L2886, but focus on where things go wrong
let depth = 0;
console.log('=== Trace from L2886, showing depth transitions ===\n');

for (let i = 2885; i < 3930; i++) {
  const l = lines[i];
  let startDepth = depth;
  
  for (let j = 0; j < l.length; j++) {
    if (l[j] === '{') depth++;
    else if (l[j] === '}') depth--;
  }
  
  // Print all lines where depth changes or is interesting
  if (startDepth !== depth || depth <= 0 || (i >= 3855 && i <= 3930)) {
    console.log(`L${i+1}: [${startDepth} -> ${depth}] ${l.trim().substring(0, 115)}`);
  }
}

console.log(`\nFinal depth at L3930: ${depth}`);
