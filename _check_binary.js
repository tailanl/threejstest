const ts = require('typescript');
const fs = require('fs');
const srcPath = 'src/components/game/GameScene.tsx';
let src = fs.readFileSync(srcPath, 'utf8');
const lines = src.split('\n');

// Binary search: try parsing with only first N lines to find where it breaks
function testParse(lineCount) {
  const partial = lines.slice(0, lineCount).join('\n');
  // Add closing braces/parens to make it valid
  const sf = ts.createSourceFile('test.tsx', partial + '\n;', ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  
  let errors = 0;
  let lastError = null;
  function visit(node) {
    if (node.parseDiagnostics) {
      for (const d of node.parseDiagnostics) {
        errors++;
        lastError = { code: d.code, msg: ts.flattenDiagnosticMessageText(d.messageText, '\n'), pos: d.start };
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return { errors, lastError };
}

// Test at key points
const testPoints = [2886, 4000, 5000, 5500, 6000, 6500, 6713];
for (const tp of testPoints) {
  const r = testParse(tp);
  console.log(`Lines 1-${tp}: ${r.errors} parse error(s)${r.lastError ? ' [TS' + r.lastError.code + '] ' + r.lastError.msg.substring(0, 60) : ''}`);
}
