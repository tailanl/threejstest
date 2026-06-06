const ts = require('typescript');
const fs = require('fs');
const srcPath = 'src/components/game/GameScene.tsx';
const src = fs.readFileSync(srcPath, 'utf8');
const lines = src.split('\n');

function testWithCommentedRange(commentStart, commentEnd) {
  let result = [];
  for (let li = 0; li < lines.length; li++) {
    if (li === commentStart - 1) result.push('    /* === COMMENTED OUT FOR DEBUG ===');
    if (li >= commentStart - 1 && li < commentEnd) {
      result.push('  // ' + lines[li]);
    } else {
      result.push(lines[li]);
    }
    if (li === commentEnd - 1) result.push('    */');
  }
  return result.join('\n');
}

// Binary search in range 4537-5482
console.log('Binary search in L4537-L5482:');
let lo = 4537, hi = 5482;
while (hi - lo > 5) {
  const mid = Math.floor((lo + hi) / 2);
  
  // Test commenting [lo, mid]
  const testSrc1 = testWithCommentedRange(lo, mid + 1);
  const sf1 = ts.createSourceFile('test.tsx', testSrc1, ts.ScriptTarget.Latest, true, ts.SyntaxKind.TSX);
  let err1 = false;
  function visit1(n) { if (n.parseDiagnostics) for (const d of n.parseDiagnostics) { const l = testSrc1.substring(0, d.start).split('\n').length; if (l >= 6712 && l <= 6714) err1 = true; } ts.forEachChild(n, visit1); }
  visit1(sf1);
  
  // Test commenting [mid+1, hi]  
  const testSrc2 = testWithCommentedRange(mid + 1, hi + 1);
  const sf2 = ts.createSourceFile('test.tsx', testSrc2, ts.ScriptTarget.Latest, true, ts.SyntaxKind.TSX);
  let err2 = false;
  function visit2(n) { if (n.parseDiagnostics) for (const d of n.parseDiagnostics) { const l = testSrc2.substring(0, d.start).split('\n').length; if (l >= 6712 && l <= 6714) err2 = true; } ts.forEachChild(n, visit2); }
  visit2(sf2);
  
  console.log(`L${lo}-L${mid}: ${err1 ? 'ERROR' : 'OK'} | L${mid+1}-L${hi}: ${err2 ? 'ERROR' : 'OK'}`);
  
  if (!err1 && err2) {
    hi = mid;
  } else if (err1 && !err2) {
    lo = mid + 1;
  } else if (!err1 && !err2) {
    // Both OK - problem might be in the interaction
    console.log(`  -> Both OK - trying smaller range`);
    hi = mid;
  } else {
    // Both have error - problem spans both ranges
    console.log(`  -> Both ERROR - problem spans both halves`);
    break;
  }
}
console.log(`\nNarrowed to L${lo}-L${hi}`);

// Show what's at these lines
for (let li = Math.max(lo - 2, 1); li <= Math.min(hi + 2, lines.length); li++) {
  console.log(`L${li}: ${lines[li-1].trim().substring(0, 100)}`);
}
