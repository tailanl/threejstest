const fs = require('fs');
const c = fs.readFileSync('src/components/game/GameScene.tsx', 'utf8');
const lines = c.split('\n');

// Full trace from line 5720 to 5885
let depth = 0;
console.log('=== Detailed trace L5720-L5885 ===\n');

for (let i = 5719; i < 5885; i++) {
  const l = lines[i];
  let startDepth = depth;
  
  for (let j = 0; j < l.length; j++) {
    if (l[j] === '{') depth++;
    else if (l[j] === '}') depth--;
  }
  
  console.log(`L${i+1}: [${startDepth} -> ${depth}] ${l.trim().substring(0, 120)}`);
}

console.log(`\nFinal depth: ${depth}`);
