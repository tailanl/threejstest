const fs = require('fs');
const c = fs.readFileSync('src/components/game/GameUI.tsx', 'utf8');
const lines = c.split('\n');

// Find the orphaned old LEFT PANEL code
// It starts after "{/* ===== UNIFIED BOTTOM BAR ===== */}" (line 7866)
// and ends at "})()}" (line 8740)
// Then the REAL unified bottom bar starts at next line

let start = -1;
let end = -1;
for (let i = 0; i < lines.length; i++) {
  // Find the orphaned comment + code start
  if (lines[i].trim() === '{/* ===== UNIFIED BOTTOM BAR ===== */}') {
    // Check if NEXT line is indented (orphaned, not proper <div>)
    if (i + 1 < lines.length && /^\s+<div/.test(lines[i+1]) && !lines[i+1].includes('pointer-events-auto')) {
      start = i;
    }
  }
  // Find the end marker })()}
  if (start >= 0 && /^\s+\}\)\}\(\)$/.test(lines[i])) {
    end = i;
    break;
  }
}

console.log(`Orphaned block: L${start+1} to L${end+1} (${end - start + 1} lines)`);

if (start >= 0 && end >= 0) {
  // Show first 3 and last 3 lines of the block to confirm
  console.log('\nFirst 3 lines:');
  for (let j = start; j < Math.min(start + 3, end); j++) console.log(`  L${j+1}: ${lines[j].trim().substring(0, 80)}`);
  console.log('\nLast 3 lines:');
  for (let j = Math.max(start, end - 2); j <= end; j++) console.log(`  L${j+1}: ${lines[j].trim().substring(0, 80)}`);
  
  // Show what comes after
  console.log('\nLine after end:');
  console.log(`  L${end+2}: ${lines[end+1]?.trim().substring(0, 80)}`);
}
