const ts = require('typescript');
const fs = require('fs');
const srcPath = 'src/components/game/GameScene.tsx';
const src = fs.readFileSync(srcPath, 'utf8');
const lines = src.split('\n');

function hasErrorBefore6713(lineCount) {
  const partial = lines.slice(0, lineCount).join('\n');
  const sf = ts.createSourceFile('test.tsx', partial, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  
  let found = false;
  function visit(node) {
    if (found) return;
    if (node.parseDiagnostics) {
      for (const d of node.parseDiagnostics) {
        // Position of L6713's `}`
        const targetPos = lines.slice(0, 6712).join('\n').length + 4; // the } char
        if (d.start <= targetPos + 2 && d.start >= targetPos - 2) {
          found = true;
          console.log(`  Error at L6713 when including up to L${lineCount}: [TS${d.code}] ${ts.flattenDiagnosticMessageText(d.messageText, '\n').substring(0, 40)}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return found;
}

// Test each line from 6714 to 6800
console.log('Testing line by line from L6714:');
let errorStart = -1;
for (let li = 6714; li <= Math.min(6900, lines.length); li++) {
  const hasErr = hasErrorBefore6713(li);
  if (hasErr && errorStart === -1) {
    errorStart = li;
    console.log(`\n*** FIRST ERROR at L${li} ***`);
    console.log(`Content: ${lines[li-1].trim().substring(0, 100)}`);
    break;
  }
}
if (errorStart === -1) {
  console.log('No error triggered in range 6714-6900');
}
