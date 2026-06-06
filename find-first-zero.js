const fs = require('fs');
const c = fs.readFileSync('src/components/game/GameScene.tsx', 'utf8');
const lines = c.split('\n');

// Find where depth first returns to 0 inside animate function
// This is where animate's { gets prematurely closed
let depth = 0;
let firstZeroAfterStart = -1;

for (let i = 2885; i < 6713; i++) {
  const l = lines[i];
  
  for (let j = 0; j < l.length; j++) {
    if (l[j] === '{') depth++;
    else if (l[j] === '}') {
      depth--;
      // If we just hit depth 0, record it (first time only after initial {)
      if (depth === 0 && firstZeroAfterStart === -1 && i > 2885) {
        firstZeroAfterStart = i + 1;
        console.log(`*** FIRST DEPTH=0 at L${i+1} col${j+1} ***`);
        console.log(`Line: ${l.trim().substring(0, 150)}`);
        
        // Print context
        console.log(`\n--- Context (10 lines before) ---`);
        for (let k = Math.max(2885, i - 10); k <= i; k++) {
          console.log(`L${k+1}: ${lines[k].trim().substring(0, 120)}`);
        }
      }
    }
  }
}

console.log(`\nFirst return to depth 0: L${firstZeroAfterStart}`);
console.log(`(This is where animate's '{' gets closed - should NOT happen until L6713)`);
