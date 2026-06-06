const fs = require('fs');
const c = fs.readFileSync('src/components/game/GameScene.tsx', 'utf8');
const lines = c.split('\n');

// Find where depth first goes negative from line 5560 to 5730
let depth = 0;
console.log('=== Trace L5560-L5730 ===\n');

for (let i = 5559; i < 5730; i++) {
  const l = lines[i];
  let startDepth = depth;
  
  for (let j = 0; j < l.length; j++) {
    if (l[j] === '{') depth++;
    else if (l[j] === '}') depth--;
  }
  
  // Print all lines
  console.log(`L${i+1}: [${startDepth} -> ${depth}] ${l.trim().substring(0, 110)}`);
}

console.log(`\nFinal: ${depth}`);
