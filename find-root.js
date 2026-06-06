const fs = require('fs');
const c = fs.readFileSync('src/components/game/GameScene.tsx', 'utf8');
const lines = c.split('\n');

// Find the FIRST place where depth goes wrong
// Start from animate function (line 2886) and track depth
let depth = 0;
let firstNegative = -1;
let firstNegativeLine = '';

for (let i = 2885; i < 6000; i++) {
  const l = lines[i];
  let startDepth = depth;
  
  for (let j = 0; j < l.length; j++) {
    if (l[j] === '{') depth++;
    else if (l[j] === '}') depth--;
  }
  
  // Record first time we go negative
  if (depth < 0 && firstNegative === -1) {
    firstNegative = i + 1;
    firstNegativeLine = l.trim();
    console.log(`*** FIRST NEGATIVE DEPTH at L${i+1}: [${startDepth} -> ${depth}] ***`);
    console.log(`    ${firstNegativeLine.substring(0, 150)}`);
  }
  
  // Print context around suspicious areas (depth jumps)
  if (Math.abs(depth - startDepth) > 3 && i > 5400 && i < 5500) {
    console.log(`L${i+1}: [${startDepth} -> ${depth}] ${l.trim().substring(0, 120)}`);
  }
}

console.log(`\n=== RESULT ===`);
console.log(`First negative at line: ${firstNegative}`);
console.log(`Final depth at L6000: ${depth}`);
