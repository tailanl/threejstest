const fs = require('fs');
const c = fs.readFileSync('src/components/game/GameScene.tsx', 'utf8');
const lines = c.split('\n');

// Full trace from line 5880 to 6010
let depth = 0;
console.log('=== Detailed trace L5880-L6010 ===\n');

for (let i = 5879; i < 6010; i++) {
  const l = lines[i];
  let startDepth = depth;
  let hasBrace = false;
  
  for (let j = 0; j < l.length; j++) {
    if (l[j] === '{') {
      depth++;
      hasBrace = true;
    } else if (l[j] === '}') {
      depth--;
      hasBrace = true;
    }
  }
  
  // Always print these lines to see the full structure
  console.log(`L${i+1}: [${startDepth} -> ${depth}] ${l.trim().substring(0, 130)}`);
}

console.log(`\nDepth at L6010: ${depth}`);
