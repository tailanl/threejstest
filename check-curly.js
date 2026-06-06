const fs = require('fs');
const c = fs.readFileSync('src/components/game/GameScene.tsx', 'utf8');
const lines = c.split('\n');

// Check ONLY curly braces { and }
let depth = 0;
let problemLines = [];

for (let i = 2885; i < 6713; i++) {
  const l = lines[i];
  let lineStartDepth = depth;
  
  for (let j = 0; j < l.length; j++) {
    if (l[j] === '{') depth++;
    else if (l[j] === '}') depth--;
  }
  
  if (lineStartDepth !== depth) {
    problemLines.push({ line: i + 1, start: lineStartDepth, end: depth });
  }
}

console.log(`Final curly brace depth at line 6713: ${depth}`);
console.log(`\n=== Last 30 depth changes ===`);
problemLines.slice(-30).forEach(p => {
  const content = lines[p.line - 1].trim().substring(0, 120);
  console.log(`L${p.line}: [${p.start} -> ${p.end}] ${content}`);
});
