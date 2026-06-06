const fs = require('fs');
const c = fs.readFileSync('src/components/game/GameScene.tsx', 'utf8');
const lines = c.split('\n');

// Check from line 2886 (animate function start) to line 6713
let depth = 0;
let lineDepths = [];

for (let i = 2885; i < 6713; i++) { // 0-indexed, so 2885 = line 2886
  const l = lines[i];
  const startDepth = depth;
  
  for (let ch of l) {
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    if (ch === ')' || ch === ']' || ch === '}') depth--;
  }
  
  lineDepths.push({ line: i + 1, start: startDepth, end: depth, content: l.trim().substring(0, 100) });
}

console.log('Final depth at line 6713:', depth);
console.log('\nLast 20 lines with depth changes:');
lineDepths.slice(-20).forEach(d => {
  console.log(`L${d.line}: [${d.start} -> ${d.end}] ${d.content}`);
});
