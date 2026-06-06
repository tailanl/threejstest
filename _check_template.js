const fs = require('fs');
const src = fs.readFileSync('src/components/game/GameScene.tsx', 'utf8');
const lines = src.split('\n');

// Track template literal state
let inTemplate = false;
let templateStartLine = -1;
let templateStartCol = -1;
let braceDepthInTemplate = 0; // for ${} nesting

for (let li = 0; li < lines.length; li++) {
  const ln = lines[li];
  let i = 0;
  while (i < ln.length) {
    const c = ln[i];
    
    // Skip single-line comments
    if (c === '/' && i + 1 < ln.length && ln[i + 1] === '/') break;
    
    // Skip regular strings
    if ((c === "'" || c === '"') && !inTemplate) {
      const q = c;
      i++;
      while (i < ln.length && ln[i] !== q) { if (ln[i] === '\\') i++; i++; }
      i++;
      continue;
    }
    
    // Skip /* */ comments
    if (c === '/' && i + 1 < ln.length && ln[i + 1] === '*' && !inTemplate) {
      i += 2;
      while (i < ln.length) {
        if (ln[i] === '*' && i + 1 < ln.length && ln[i + 1] === '/') { i += 2; break; }
        i++;
      }
      continue;
    }
    
    if (c === '`') {
      if (!inTemplate) {
        inTemplate = true;
        templateStartLine = li + 1;
        templateStartCol = i;
        braceDepthInTemplate = 0;
        console.log(`Template OPEN at L${li+1}:${i}: ${ln.trim().substring(0, 80)}`);
      } else {
        if (braceDepthInTemplate === 0) {
          inTemplate = false;
          console.log(`Template CLOSE at L${li+1}:${i}`);
        } else {
          // This backtick is inside a ${}}, not the closing one
        }
      }
    }
    
    if (inTemplate) {
      if (c === '$' && i + 1 < ln.length && ln[i + 1] === '{') {
        braceDepthInTemplate++;
        i++; // skip {
      } else if (c === '}') {
        braceDepthInTemplate--;
      }
    }
    
    i++;
  }
}

if (inTemplate) {
  console.log(`\n!!! UNCLOSED TEMPLATE STRING starting at L${templateStartLine}:${templateStartCol} !!!`);
} else {
  console.log('\nAll template strings are properly closed.');
}
