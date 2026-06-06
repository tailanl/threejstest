const fs = require('fs');
const c = fs.readFileSync('src/components/game/GameUI.tsx', 'utf8');
const lines = c.split('\n');

// Strategy: find ALL occurrences of the UNIFIED BOTTOM BAR comment
// and identify which one is the orphaned one (followed by non-<div> wrapper code)
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('UNIFIED BOTTOM BAR')) {
    console.log(`L${i+1}: ${lines[i].trim()}`);
    for (let j = i+1; j < Math.min(i+4, lines.length); j++) {
      console.log(`  L${j+1}: [${lines[j].length}ch] ${lines[j].trim().substring(0, 100)}`);
    }
    console.log('');
  }
}

// Also search for })()}) pattern near line 8740
console.log('=== Lines 8735-8745 ===');
for (let i = 8734; i < 8745 && i < lines.length; i++) {
  console.log(`L${i+1}: ${lines[i].trim().substring(0, 100)}`);
}
