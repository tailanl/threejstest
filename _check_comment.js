const ts = require('typescript');
const fs = require('fs');
const srcPath = 'src/components/game/GameScene.tsx';
const src = fs.readFileSync(srcPath, 'utf8');
const lines = src.split('\n');

// Test: wrap lines 4500-6713 in a block comment to see if error goes away
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

// Test commenting out different ranges
const ranges = [
  [5483, 6713], // Comment out from floating damage sprites to end of animate
  [4537, 5482], // Comment out from push() to before floating sprites  
  [4000, 4500], // Comment out selection rebuild area
];

for (const [cs, ce] of ranges) {
  const testSrc = testWithCommentedRange(cs, ce);
  const sf = ts.createSourceFile('test.tsx', testSrc, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  
  let errors = [];
  function visit(n) {
    if (n.parseDiagnostics) {
      for (const d of n.parseDiagnostics) {
        const pos = d.start;
        if (pos < src.length) { // only count errors in original content area
          const lnum = testSrc.substring(0, pos).split('\n').length;
          if (lnum <= 6714) { // only care about errors at or before L6713
            errors.push({ line: lnum, code: d.code });
          }
        }
      }
    }
    ts.forEachChild(n, visit);
  }
  visit(sf);
  
  const has6713Error = errors.some(e => e.line >= 6712 && e.line <= 6714);
  console.log(`Commented L${cs}-L${ce}: ${errors.length} errs in L1-6714, L6713-error=${has6713Error}`);
}
