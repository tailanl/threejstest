const fs = require('fs');
const c = fs.readFileSync('src/components/game/GameScene.tsx', 'utf8');
const lines = c.split('\n');

// Trace L5486-L5595 in detail
let depth = 0;
console.log('=== Detailed trace L5486-L5595 ===\n');

for (let i = 5485; i < 5595; i++) {
  const l = lines[i];
  let startDepth = depth;
  
  for (let j = 0; j < l.length; j++) {
    if (l[j] === '{') {
      depth++;
      console.log(`  L${i+1} col${j+1}: {  -> ${depth}`);
    }
    else if (l[j] === '}') {
      console.log(`  L${i+1} col${j+1}: }  ${depth}->${depth-1}`);
      depth--;
    }
  }
  
  if (startDepth !== depth) {
    console.log(`L${i+1}: [${startDepth} -> ${depth}] ${l.trim().substring(0, 100)}`);
  } else {
    console.log(`L${i+1}: [${depth}]     ${l.trim().substring(0, 100)}`);
  }
}

console.log(`\nFinal depth: ${depth} (should be 0 after closing bare block)`);
