const fs = require('fs');
const c = fs.readFileSync('src/components/game/GameScene.tsx', 'utf8');
const lines = c.split('\n');

// Track every single curly brace from line 6000 to 6713
let depth = 0;
console.log('=== Curly brace tracking (lines 6000-6713) ===\n');

for (let i = 5999; i < 6713; i++) {
  const l = lines[i];
  let changed = false;
  
  for (let j = 0; j < l.length; j++) {
    if (l[j] === '{') {
      depth++;
      changed = true;
      console.log(`L${i+1} col${j+1}: {  depth=${depth}  | ${l.trim().substring(0, 100)}`);
    } else if (l[j] === '}') {
      console.log(`L${i+1} col${j+1}: }  depth=${depth}->${depth-1}  | ${l.trim().substring(0, 100)}`);
      depth--;
      changed = true;
    }
  }
  
  // Also print lines that are just closing braces with nothing else significant
  if (!changed && l.trim() === '}') {
    console.log(`L${i+1}: standalone }  depth before=${depth}`);
  }
}

console.log(`\n=== FINAL DEPTH: ${depth} ===`);
console.log('(should be 0 for balanced, negative means extra })');
