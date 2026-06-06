const fs = require('fs');
const c = fs.readFileSync('src/components/game/GameScene.tsx', 'utf8');
const lines = c.split('\n');

// Find the EXACT line where depth first goes wrong
// by comparing what depth SHOULD be vs what it IS
let depth = 0;
let problemFound = false;

for (let i = 2885; i < 6714 && !problemFound; i++) {
  const l = lines[i];
  let startDepth = depth;
  
  for (let j = 0; j < l.length; j++) {
    if (l[j] === '{') depth++;
    else if (l[j] === '}') depth--;
    
    // After each brace, check if depth is suspicious
    // In a well-structured animate function, depth should be:
    // - At least 1 (we're inside animate's { })
    // - Never negative
    
    if (depth < 0) {
      console.log(`*** FIRST NEGATIVE DEPTH! ***`);
      console.log(`L${i+1} col${j+1}: '${l[j]}' made depth ${l[j] === '{' ? depth-1 : depth+1} -> ${depth}`);
      console.log(`Line: ${l.trim().substring(0, 150)}`);
      
      // Print 10 lines before for context
      console.log(`\n--- Context ---`);
      for (let k = Math.max(2885, i - 10); k <= i; k++) {
        let d = 0;
        for (let ch of lines[k]) {
          if (ch === '{') d++;
          else if (ch === '}') d--;
        }
        console.log(`L${k+1} [depth change: ${d}] ${lines[k].trim().substring(0, 120)}`);
      }
      
      problemFound = true;
      break;
    }
  }
}

if (!problemFound) {
  console.log('No negative depth found in L2886-L6713');
  console.log(`Final depth: ${depth}`);
}
