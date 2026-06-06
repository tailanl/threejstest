const fs = require('fs');
const c = fs.readFileSync('src/components/game/GameScene.tsx', 'utf8');
const lines = c.split('\n');

// Find where depth becomes positive and stays positive
let depth = 0;
let problemStart = -1;

for (let i = 2885; i < 6713; i++) {
  const l = lines[i];
  const startDepth = depth;
  
  for (let ch of l) {
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    if (ch === ')' || ch === ']' || ch === '}') depth--;
  }
  
  // If depth jumped up by 2 or more and never came back, mark it
  if (depth > 0 && problemStart === -1) {
    problemStart = i + 1;
  }
  
  // Print lines where depth increases significantly
  if (depth - startDepth >= 2) {
    console.log(`L${i+1}: [${startDepth} -> ${depth}] INCREASE ${l.trim().substring(0, 120)}`);
  }
}

console.log(`\nProblem starts around line: ${problemStart}`);
console.log(`Final depth: ${depth}`);
