const fs = require('fs');
const c = fs.readFileSync('src/components/game/GameScene.tsx', 'utf8');
const lines = c.split('\n');

// Focus on L3750-3865 where we recently edited the unit status code
let depth = 0;

// First, calculate depth at L3750
for (let i = 2885; i < 3749; i++) {
  for (let j = 0; j < lines[i].length; j++) {
    if (lines[i][j] === '{') depth++;
    else if (lines[i][j] === '}') depth--;
  }
}

console.log(`Depth at L3750: ${depth}`);
console.log(`\n=== Detailed trace L3750-L3865 ===\n`);

for (let i = 3749; i < 3865; i++) {
  const l = lines[i];
  let startDepth = depth;
  
  for (let j = 0; j < l.length; j++) {
    if (l[j] === '{') {
      depth++;
      console.log(`    +{ L${i+1} col${j+1}`);
    }
    else if (l[j] === '}') {
      console.log(`    -} L${i+1} col${j+1}  [${depth}->${depth-1}]`);
      depth--;
    }
  }
  
  console.log(`L${i+1}: [${startDepth} -> ${depth}] ${l.trim().substring(0, 115)}`);
}

console.log(`\nFinal depth: ${depth}`);
