const fs = require('fs');
const c = fs.readFileSync('src/components/game/GameScene.tsx', 'utf8');
const lines = c.split('\n');

// Calculate depth at L3865 (should be 3 based on previous trace)
let depth = 0;
for (let i = 2885; i < 3864; i++) {
  for (let j = 0; j < lines[i].length; j++) {
    if (lines[i][j] === '{') depth++;
    else if (lines[i][j] === '}') depth--;
  }
}

console.log(`Depth at L3865: ${depth} (expected 3)\n`);
console.log(`=== Trace L3865-L3925 ===\n`);

for (let i = 3864; i < 3925; i++) {
  const l = lines[i];
  let startDepth = depth;
  
  for (let j = 0; j < l.length; j++) {
    if (l[j] === '{') { depth++; console.log(`    +{ L${i+1}:${j+1}`); }
    else if (l[j] === '}') { console.log(`    -} L${i+1}:${j+1}  [${depth}->${depth-1}]`); depth--; }
  }
  
  console.log(`L${i+1}: [${startDepth} -> ${depth}] ${l.trim().substring(0, 115)}`);
}

console.log(`\nFinal depth: ${depth} (should be >0, still inside animate)`);
