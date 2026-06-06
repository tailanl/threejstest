const fs = require('fs');
const srcPath = 'src/components/game/GameScene.tsx';
const src = fs.readFileSync(srcPath, 'utf8');
const lines = src.split('\n');

function countParensInCode(text) {
  let p = 0;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === "'" || c === '"' || c === '`') {
      const q = c; i++;
      while (i < text.length && text[i] !== q) { if (text[i] === '\\') i++; i++; }
      i++; continue;
    }
    if (c === '/' && i + 1 < text.length && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (c === '/' && i + 1 < text.length && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && i + 1 < text.length && text[i + 1] === '/')) i++;
      continue;
    }
    if (c === '(') p++;
    else if (c === ')') p--;
    i++;
  }
  return p;
}

// Binary search for where the extra ( appears
console.log('Binary search for extra ( in L1-6712:');
let lo = 2886, hi = 6712; // search within animate function
while (lo < hi - 1) {
  const mid = Math.floor((lo + hi) / 2);
  const p1 = countParensInCode(lines.slice(0, lo).join('\n'));
  const pMid = countParensInCode(lines.slice(0, mid).join('\n'));
  const p2 = countParensInCode(lines.slice(0, hi).join('\n'));
  
  console.log(`L${lo}: net()=${p1} | L${mid}: net()=${pMid} | L${hi}: net()=${p2}`);
  
  // The extra ( is between the point where depth first becomes > expected
  // At L2886 (animate start), depth should be 1 (from useEffect's ()
  // We're looking for where it jumps to 2 or more and stays
  if (pMid >= 2) {
    hi = mid;
  } else {
    lo = mid;
  }
}
console.log(`\nExtra ( is around L${lo}-${hi}`);

// Show lines around that area
for (let li = Math.max(lo - 3, 1); li <= Math.min(hi + 3, 6712); li++) {
  const lineText = lines[li - 1];
  const lineParens = countParensInCode(lines.slice(0, li).join('\n'));
  const prevParens = li > 1 ? countParensInCode(lines.slice(0, li - 1).join('\n')) : 0;
  console.log(`L${li}: (${prevParens}->${lineParens}) delta=${lineParens-prevParens} | ${lineText.trim().substring(0, 90)}`);
}
