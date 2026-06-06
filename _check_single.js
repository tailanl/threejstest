const ts = require('typescript');
const fs = require('fs');
const srcPath = 'src/components/game/GameScene.tsx';
const src = fs.readFileSync(srcPath, 'utf8');
const lines = src.split('\n');

// Test: what if we ONLY comment out L4537 (keep L4536 and L4538+)
function testCommentOnly(lineNum) {
  let result = [];
  for (let li = 0; li < lines.length; li++) {
    if (li === lineNum - 1) {
      result.push('    // [COMMENTED] ' + lines[li].trim());
    } else {
      result.push(lines[li]);
    }
  }
  return result.join('\n');
}

console.log('Test: Comment only specific lines:');
for (const ln of [4536, 4537]) {
  const testSrc = testCommentOnly(ln);
  const sf = ts.createSourceFile('test.tsx', testSrc, ts.ScriptTarget.Latest, true, ts.SyntaxKind.TSX);
  
  let errors = [];
  function visit(n) { 
    if (n.parseDiagnostics) {
      for (const d of n.parseDiagnostics) {
        const l = testSrc.substring(0, d.start).split('\n').length;
        errors.push({ line: l, code: d.code });
      }
    } 
    ts.forEachChild(n, visit); 
  }
  visit(sf);
  
  const has6713 = errors.some(e => e.line >= 6712 && e.line <= 6714);
  console.log(`Comment only L${ln}: ${errors.length} errs, L6713-error=${has6713}`);
  if (errors.length > 0 && errors.length < 10) {
    for (const e of errors.slice(0, 5)) {
      console.log(`  L${e.line} [TS${e.code}]`);
    }
  }
}

// Also show the EXACT content of L4536 and L4537 with byte info
console.log('\nExact content:');
for (const ln of [4535, 4536, 4537, 4538]) {
  const line = lines[ln - 1];
  const bytes = Array.from(Buffer.from(line));
  console.log(`L${ln} (${line.length} chars, ${bytes.length} bytes): ${line.trim().substring(0, 100)}`);
}
