const ts = require('typescript');
const fs = require('fs');
const srcPath = 'src/components/game/GameScene.tsx';
const src = fs.readFileSync(srcPath, 'utf8');
const lines = src.split('\n');

function testUpTo(lineCount) {
  const partial = lines.slice(0, lineCount).join('\n');
  const testSrc = partial + '\n});';
  const sf = ts.createSourceFile('test.tsx', testSrc, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  
  let errors = [];
  function visit(node) {
    if (node.parseDiagnostics) {
      for (const d of node.parseDiagnostics) {
        if (d.start < partial.length) errors.push({ code: d.code, pos: d.start });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return errors.length;
}

// Test each line from 6700 to 6713
for (let li = 6700; li <= 6713; li++) {
  const errCount = testUpTo(li);
  const hasRealError = errCount > 0;
  console.log(`L${li}: ${hasRealError ? 'ERROR (' + errCount + ')' : 'OK'} | ${lines[li-1].trim().substring(0, 80)}`);
}
