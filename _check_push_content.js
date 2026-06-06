const ts = require('typescript');
const fs = require('fs');
const srcPath = 'src/components/game/GameScene.tsx';
const src = fs.readFileSync(srcPath, 'utf8');
const lines = src.split('\n');

// Build version where push has minimal content vs full content
function buildWithPushContent(contentLines) {
  let result = [];
  let inPush = false;
  let pushLineIdx = 0;
  
  for (let li = 0; li < lines.length; li++) {
    const trimmed = lines[li].trim();
    
    // Detect start of push call (L4537)
    if (li === 4536) {
      result.push('              sceneRef.current.projectileAnimations.push({');
      for (const cl of contentLines) result.push(cl);
      inPush = true;
      pushLineIdx = 0;
      continue;
    }
    
    // Detect end of original push call (L4549)
    if (inPush && trimmed === '});') {
      result.push('              });');
      inPush = false;
      continue;
    }
    
    // Skip original push content lines
    if (inPush) continue;
    
    result.push(lines[li]);
  }
  return result.join('\n');
}

console.log('Test with different push content complexities:\n');

const tests = [
  ['empty_obj',     ['              }']],
  ['one_prop',      ['                id: 1,', '              }']],
  ['two_props',     ['                id: 1,', '                x: 2,', '              }']),
  ['like_original', ['                id: ++effectIdCounter,', '                mainSphere,', '                trailSpheres,', '              }')],
];

for (const [label, contentLines] of tests) {
  const testSrc = buildWithPushContent(contentLines);
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
  console.log('  ' + label + ': ' + (errAt6713 ? 'ERROR at L6713' : 'OK'));
}

// MOST IMPORTANT TEST: Use the EXACT original content but check character by character
console.log('\n--- Original content character test ---');
const origLines = [];
for (let li = 4537; li <= 4548; li++) origLines.push(lines[li - 1]);
console.log('Original push body lines (' + origLines.length + '):');
for (let i = 0; i < origLines.length; i++) {
  const ln = origLines[i];
  console.log('  L' + (4537 + i) + ' (' + ln.length + ' chars): [' + ln.trim() + ']');
}
