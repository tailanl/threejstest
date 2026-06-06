const fs = require('fs');
const c = fs.readFileSync('src/components/game/GameScene.tsx', 'utf8');
const lines = c.split('\n');

// Check ONLY round brackets ( and )
let depth = 0;
let maxDepth = 0;
let problemLines = [];

for (let i = 2885; i < 6713; i++) {
  const l = lines[i];
  let lineStartDepth = depth;
  
  for (let j = 0; j < l.length; j++) {
    if (l[j] === '(') depth++;
    else if (l[j] === ')') depth--;
    
    if (depth > maxDepth) maxDepth = depth;
  }
  
  // Track lines where depth is unusually high
  if (depth > 15 || (lineStartDepth !== depth && Math.abs(depth) > 5)) {
    problemLines.push({ line: i + 1, start: lineStartDepth, end: depth, content: l.trim().substring(0, 120) });
  }
}

console.log(`Final round bracket depth at line 6713: ${depth}`);
console.log(`Max depth reached: ${maxDepth}`);
console.log('\n=== Lines with unusual bracket depth ===');
problemLines.slice(-30).forEach(p => {
  console.log(`L${p.line}: [${p.start} -> ${p.end}]`);
  console.log(`   ${p.content}`);
});
