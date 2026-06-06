const fs = require('fs');
const f = 'd:\\game\\src\\components\\game\\GameUI.tsx';
let content = fs.readFileSync(f, 'utf8');

// Read new bottom bar content
const newBar = fs.readFileSync('d:\\game\\_new_bottom_bar.txt', 'utf8');

// Replace BOTTOM BAR
const bbStart = '{/* ===== BOTTOM BAR - Compact hint + collapsible combat log ===== */}';
const bbEnd = '{/* [REMOVED] ACTION HISTORY PANEL per user request */}';
const bbStartIdx = content.indexOf(bbStart);
const bbEndIdx = content.indexOf(bbEnd);
console.log('BOTTOM BAR: startIdx=', bbStartIdx, ' endIdx=', bbEndIdx);

if (bbStartIdx === -1 || bbEndIdx === -1) {
  console.log('BOTTOM BAR NOT FOUND - aborting');
  process.exit(1);
}

content = content.substring(0, bbStartIdx) + newBar + '\n\n        ' + content.substring(bbEndIdx);
console.log('BOTTOM BAR replaced successfully (' + (bbEndIdx - bbStartIdx) + ' chars removed, ' + newBar.length + ' chars added)');

fs.writeFileSync(f, content, 'utf8');
console.log('File saved!');
