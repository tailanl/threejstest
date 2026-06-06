const ts = require('typescript');
const fs = require('fs');
const srcPath = 'src/components/game/GameScene.tsx';
const src = fs.readFileSync(srcPath, 'utf8');
const lines = src.split('\n');

// Test: take lines 1-6713 and add proper closing
function testUpTo(lineCount, label) {
  const partial = lines.slice(0, lineCount).join('\n');
  // Add enough closing braces/parens to make it syntactically valid for testing
  const testSrc = partial + '\n});'; // close animate, close useEffect callback, close useEffect call
  
  try {
    const sf = ts.createSourceFile('test.tsx', testSrc, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    
    let errors = [];
    function visit(node) {
      if (node.parseDiagnostics) {
        for (const d of node.parseDiagnostics) {
          errors.push({ code: d.code, pos: d.start, msg: ts.flattenDiagnosticMessageText(d.messageText, '\n').substring(0, 60) });
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sf);
    
    // Filter out errors that are just because of our artificial closing
    const realErrors = errors.filter(e => e.pos < partial.length);
    
    if (realErrors.length > 0) {
      console.log(`${label}: ${realErrors.length} REAL error(s) before truncation point:`);
      for (const e of realErrors) {
        const lnum = partial.substring(0, e.pos).split('\n').length;
        console.log(`  L${lnum} [TS${e.code}] ${e.msg}`);
      }
    } else {
      console.log(`${label}: No parse errors (only truncation artifacts)`);
    }
    return realErrors.length;
  } catch(e) {
    console.log(`${label}: CRASH - ${e.message}`);
    return 999;
  }
}

// Test progressive truncation
testUpTo(2886, 'L2886 (animate start)');
testUpTo(4000, 'L4000');
testUpTo(5000, 'L5000');
testUpTo(6000, 'L6000');
testUpTo(6500, 'L6500');
testUpTo(6600, 'L6600');
testUpTo(6670, 'L6670');
testUpTo(6700, 'L6700');
testUpTo(6713, 'L6713 (animate end)');
