const fs = require('fs');
const c = fs.readFileSync('src/components/game/GameScene.tsx', 'utf8');
const lines = c.split('\n');

// Find the EXACT line where depth first becomes -1
let depth = 0;

for (let i = 2885; i < 6714; i++) {
  const l = lines[i];
  let startDepth = depth;
  
  for (let j = 0; j < l.length; j++) {
    if (l[j] === '{') depth++;
    else if (l[j] === '}') {
      depth--;
      // Check if THIS brace made depth negative
      if (depth < 0 && startDepth >= 0) {
        console.log(`*** FOUND! L${i+1} col${j+1}: '}' made depth ${startDepth} -> ${depth} ***`);
        console.log(`    Full line: ${l.trim().substring(0, 150)}`);
        
        // Print context (5 lines before)
        console.log(`\n--- Context (5 lines before) ---`);
        for (let k = Math.max(2885, i - 5); k < i; k++) {
          console.log(`L${k+1}: ${lines[k].trim().substring(0, 120)}`);
        }
        console.log(`>>> L${i+1}: ${l.trim().substring(0, 120)}`);
        
        process.exit(0);
      }
    }
  }
}

console.log('No negative depth found (unexpected)');
