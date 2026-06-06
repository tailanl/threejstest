const ts = require('typescript');
const fs = require('fs');
const srcPath = 'src/components/game/GameScene.tsx';
const src = fs.readFileSync(srcPath, 'utf8');
const lines = src.split('\n');

// Replace L4537-L4549 (the entire push call) with a single semicolon
function testReplace(rangeStart, rangeEnd, replacement) {
  let result = [];
  for (let li = 0; li < lines.length; li++) {
    if (li >= rangeStart - 1 && li < rangeEnd) {
      if (li === rangeStart - 1) result.push(replacement);
      // skip other lines in range
    } else {
      result.push(lines[li]);
    }
  }
  return result.join('\n');
}

console.log('Test replacing L4537-L4549 with different things:');

for (const [label, repl] of [
  ['single `;`     , '              ;'],
  ['void 0;'       , '              void 0;'],
  ['null;'         , '              null;'],
  ['empty block {}', '              {}'],
  ['keep push but remove {', '              sceneRef.current.projectileAnimations.push();'],
]) {
  const testSrc = testReplace(4537, 4549, repl);
  const sf = ts.createSourceFile('test.tsx', testSrc, ts.ScriptTarget.Latest, true, ts.SyntaxKind.TSX);
  
  let errAt6713 = false;
  function visit(n) { 
    if (n.parseDiagnostics) {
      for (const d of n.parseDiagnostics) {
        const l = testSrc.substring(0, d.start).split('\n').length;
        if (l >= 6712 && l <= 6714) errAt6713 = true;
      }
    } 
    ts.forEachChild(n, visit); 
  }
  visit(sf);
  console.log(`  ${label}: ${errAt6713 ? 'ERROR at L6713' : 'OK'}`);
}
