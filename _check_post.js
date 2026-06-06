const ts = require('typescript');
const fs = require('fs');
const srcPath = 'src/components/game/GameScene.tsx';
const src = fs.readFileSync(srcPath, 'utf8');
const lines = src.split('\n');

// Binary search in the range 6714-9385 to find where the error first appears
function testUpTo(lineCount) {
  const partial = lines.slice(0, lineCount).join('\n') + '\n'; // don't add anything
  const sf = ts.createSourceFile('test.tsx', partial, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  
  let errors = [];
  function visit(node) {
    if (node.parseDiagnostics) {
      for (const d of node.parseDiagnostics) {
        if (d.start < partial.length) {
          const lnum = partial.substring(0, d.start).split('\n').length;
          errors.push({ code: d.code, line: lnum, msg: ts.flattenDiagnosticMessageText(d.messageText, '\n').substring(0, 50) });
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return errors;
}

console.log('Binary search from L6714 to L9385:');
let lo = 6714, hi = 9385;
while (lo < hi) {
  const mid = Math.floor((lo + hi) / 2);
  const errs = testUpTo(mid);
  // Check if any error is at or before L6713
  const hasErrorAt6713 = errs.some(e => e.line <= 6713);
  
  if (hasErrorAt6713) {
    console.log(`L1-${mid}: ERROR at/before L6713 (${errs.length} total errs)`);
    hi = mid;
  } else {
    console.log(`L1-${mid}: OK (errors only after our range or none)`);
    lo = mid + 1;
  }
}
console.log(`\nFirst problematic line is around L${lo}`);

// Now show what's at that area
console.log(`\n=== Lines around L${lo-5} to L${lo+5} ===`);
for (let li = Math.max(6714, lo - 5); li <= Math.min(lines.length, lo + 5); li++) {
  console.log(`L${li}: ${lines[li-1].trim().substring(0, 100)}`);
}

// Also check: what are the actual errors when we include up to lo?
console.log(`\nErrors when including L1-${lo}:`);
const finalErrs = testUpTo(lo);
for (const e of finalErrs.slice(0, 5)) {
  console.log(`  L${e.line} [TS${e.code}] ${e.msg}`);
}
