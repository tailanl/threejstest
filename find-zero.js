const fs = require('fs');
const c = fs.readFileSync('src/components/game/GameScene.tsx', 'utf8');
const lines = c.split('\n');

// Find where depth last hits 0 before going to -1 at L6713
// This will reveal the extra }
let depth = 0;
let lastZeroLine = -1;
let transitions = [];

for (let i = 2885; i < 6714; i++) {
  const l = lines[i];
  let startDepth = depth;
  
  for (let j = 0; j < l.length; j++) {
    if (l[j] === '{') depth++;
    else if (l[j] === '}') depth--;
  }
  
  // Record all depth=0 points after line 6000
  if (depth === 0 && i > 6000) {
    lastZeroLine = i + 1;
    transitions.push({ line: i + 1, from: startDepth, content: l.trim().substring(0, 100) });
  }
}

console.log('=== Lines where depth = 0 (after L6000) ===');
transitions.forEach(t => {
  console.log(`L${t.line}: [${t.from} -> 0] ${t.content}`);
});

console.log(`\nLast depth=0 at: L${lastZeroLine}`);
console.log(`This is the line after which we're already balanced before L6713`);
console.log(`The '}' that brought depth to 0 here (or the missing '{' before) is the problem`);
