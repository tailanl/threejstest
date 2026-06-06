const fs = require('fs');
const srcPath = 'src/components/game/GameScene.tsx';
const src = fs.readFileSync(srcPath, 'utf8');
const lines = src.split('\n');

// Take L1-6712
const part = lines.slice(0, 6712).join('\n');

let parens = 0, braces = 0, brackets = 0;
for (let i = 0; i < part.length; i++) {
  const c = part[i];
  if (c === '(') parens++;
  else if (c === ')') parens--;
  else if (c === '{') braces++;
  else if (c === '}') braces--;
  else if (c === '[') brackets++;
  else if (c === ']') brackets--;
}

console.log('L1-6712 bracket counts:');
console.log(`  (: ${part.split('(').length - 1}`);
console.log(`  ): ${part.split(')').length - 1}`);
console.log(`  Net (): ${parens}`);
console.log(`  {: ${part.split('{').length - 1}`);
console.log(`  }: ${part.split('}').length - 1}`);
console.log(`  Net {}: ${braces}`);
console.log(`  [: ${part.split('[').length - 1}`);
console.log(`  ]: ${part.split(']').length - 1}`);
console.log(`  Net []: ${brackets}`);

// Now check: what if we count ONLY in code (skip strings/comments)?
function countInCode(text) {
  let p = 0, b = 0, bk = 0;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    // Skip strings
    if (c === "'" || c === '"' || c === '`') {
      const q = c; i++;
      while (i < text.length && text[i] !== q) { if (text[i] === '\\') i++; i++; }
      i++; continue;
    }
    // Skip // comments
    if (c === '/' && i + 1 < text.length && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; continue; }
    // Skip /* */ comments  
    if (c === '/' && i + 1 < text.length && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && i + 1 < text.length && text[i + 1] === '/')) { if (text[i] === '\n') {} i++; }
      continue;
    }
    if (c === '(') p++;
    else if (c === ')') p--;
    else if (c === '{') b++;
    else if (c === '}') b--;
    else if (c === '[') bk++;
    else if (c === ']') bk--;
    i++;
  }
  return { p, b, bk };
}

const codeCounts = countInCode(part);
console.log('\nL1-6712 CODE-ONLY counts (skip strings/comments):');
console.log(`  Net (): ${codeCounts.p}`);
console.log(`  Net {}: ${codeCounts.b}`);
console.log(`  Net []: ${codeCounts.bk}`);

// Also check the full file
const fullCounts = countInCode(src);
console.log('\nFull file CODE-ONLY counts:');
console.log(`  Net (): ${fullCounts.p}`);
console.log(`  Net {}: ${fullCounts.b}`);
console.log(`  Net []: ${fullCounts.bk}`);
