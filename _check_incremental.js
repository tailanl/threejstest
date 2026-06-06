const ts = require('typescript');
const fs = require('fs');
const srcPath = 'src/components/game/GameScene.tsx';
const src = fs.readFileSync(srcPath, 'utf8');
const lines = src.split('\n');

// Start with L4537-L4540 commented out (known good state), then uncomment one by one
function buildWithLines(uncommentedLines) {
  let result = [];
  for (let li = 0; li < lines.length; li++) {
    if (li >= 4536 && li < 4540) {
      if (uncommentedLines.has(li + 1)) {
        result.push(lines[li]);
      } else {
        result.push('    // [COMMENTED] ' + lines[li].trim());
      }
    } else {
      result.push(lines[li]);
    }
  }
  return result.join('\n');
}

const targetLines = [4537, 4538, 4539, 4540];
console.log('Testing each combination of L4537-L4540:');
console.log('(Starting with all commented = known good state)\n');

// Test adding lines one by one
let active = new Set();
for (const lineToAdd of targetLines) {
  active.add(lineToAdd);
  const testSrc = buildWithLines(active);
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
  
  const status = errAt6713 ? 'ERROR' : 'OK';
  console.log(`+L${lineToAdd} (active: ${[...active].sort((a,b)=>a-b).join(',')}): ${status}`);
}
