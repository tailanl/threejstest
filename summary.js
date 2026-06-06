const fs = require('fs');
const c = fs.readFileSync('src/components/game/GameScene.tsx', 'utf8');
const lines = c.split('\n');

// Full trace from line 2886 to 6714
let depth = 0;
let minDepth = 0;
let maxDepth = 0;
let firstExcess = -1;

for (let i = 2885; i < 6714; i++) {
  const l = lines[i];
  
  for (let j = 0; j < l.length; j++) {
    if (l[j] === '{') {
      depth++;
      if (depth > maxDepth) maxDepth = depth;
    }
    else if (l[j] === '}') {
      depth--;
      if (depth < minDepth) minDepth = depth;
    }
  }
  
  // Find where depth first exceeds reasonable range
  if (depth > 10 && firstExcess === -1) {
    firstExcess = i + 1;
  }
}

console.log(`=== BRACE BALANCE SUMMARY (L2886-L6713) ===`);
console.log(`Final depth: ${depth}`);
console.log(`Min depth: ${minDepth}`);
console.log(`Max depth: ${maxDepth}`);
console.log(`First depth>10 at: L${firstExcess}`);

if (depth > 0) {
  console.log(`\n*** PROBLEM: Missing ${depth} closing braces '}' ***`);
} else if (depth < 0) {
  console.log(`\n*** PROBLEM: ${Math.abs(depth)} extra closing braces '}' ***`);
}
