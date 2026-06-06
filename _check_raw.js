const ts = require('typescript');
const fs = require('fs');
const srcPath = 'src/components/game/GameScene.tsx';
const src = fs.readFileSync(srcPath, 'utf8');
const lines = src.split('\n');

function testRaw(lineCount) {
  // NO added suffix - raw truncation
  const partial = lines.slice(0, lineCount).join('\n');
  const sf = ts.createSourceFile('test.tsx', partial, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  
  let errors = [];
  function visit(node) {
    if (node.parseDiagnostics) {
      for (const d of node.parseDiagnostics) {
        if (d.start < partial.length) { // only count errors within our content
          errors.push({ code: d.code, pos: d.start, msg: ts.flattenDiagnosticMessageText(d.messageText, '\n').substring(0, 50) });
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return errors;
}

// Test each line from 6695 to 6713 - RAW (no suffix)
console.log('RAW test (no suffix added):');
for (let li = 6695; li <= 6713; li++) {
  const errs = testRaw(li);
  const l6713Err = errs.some(e => {
    const targetPos = lines.slice(0, 6712).join('\n').length + 4; // } in };
    return Math.abs(e.pos - targetPos) < 10;
  });
  console.log(`L${li}: ${errs.length} err(s), L6713-err=${l6713Err} | ${lines[li-1].trim().substring(0, 60)}`);
}
