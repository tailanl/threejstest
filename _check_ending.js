const ts = require('typescript');
const fs = require('fs');
const srcPath = 'src/components/game/GameScene.tsx';
const src = fs.readFileSync(srcPath, 'utf8');
const lines = src.split('\n');

function testWithEnding(lineCount, ending) {
  const partial = lines.slice(0, lineCount).join('\n') + '\n' + ending;
  const sf = ts.createSourceFile('test.tsx', partial, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  
  let errors = [];
  function visit(node) {
    if (node.parseDiagnostics) {
      for (const d of node.parseDiagnostics) {
        if (d.start < lines.slice(0, lineCount).join('\n').length) {
          errors.push({ code: d.code, msg: ts.flattenDiagnosticMessageText(d.messageText, '\n').substring(0, 50) });
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return errors;
}

// Test L1-6712 with different endings
console.log('Testing L1-6712 with different endings:');
for (const ending of ['}', '};', '); });', '}\n}); ', '})\n}; ']) {
  const errs = testWithEnding(6712, ending);
  console.log(`  Ending "${ending.replace(/\n/g, '\\n')}": ${errs.length > 0 ? errs.length + ' error(s): ' + errs[0].msg : 'OK'}`);
}

// Also test: what if we just add a single ) before }; ?
console.log('\nTesting L1-6713 (which includes `};`) with extra ): ');
const fullTo6713 = lines.slice(0, 6713).join('\n');
for (const suffix of ['', ')', '))', '\n))']) {
  const testSrc = fullTo6713 + suffix;
  const sf = ts.createSourceFile('test.tsx', testSrc, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let errors = [];
  function visit(node) {
    if (node.parseDiagnostics) {
      for (const d of node.parseDiagnostics) {
        if (d.start < fullTo6713.length) {
          errors.push({ code: d.code, pos: d.start, msg: ts.flattenDiagnosticMessageText(d.messageText, '\n').substring(0, 60) });
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  const realErrs = errors.filter(e => e.pos < fullTo6713.length - 10); // only errors in original content
  console.log(`  Suffix "${suffix.replace(/\n/g, '\\n')}": ${realErrs.length} real error(s) in original content`);
}

// MOST IMPORTANT TEST: Is the issue that there's an EXTRA ( somewhere that shouldn't be?
// Let's check: what does L1-6713 look like to the parser RIGHT BEFORE the }; ?
console.log('\n=== Detailed analysis of parsing state ===');
const sfTest = ts.createSourceFile('test.tsx', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

// Get ALL nodes, find ones near position 304049 (L6713)
let nodesNearError = [];
function collectAll(node, depth) {
  if (node.start !== undefined && node.end !== undefined) {
    const targetPos = 304049; // L6713 col 5 (the })
    if (node.start <= targetPos && node.end >= targetPos) {
      nodesNearError.push({ kind: ts.SyntaxKind[node.kind], start: node.start, end: node.end, depth });
    }
  }
  ts.forEachChild(node, child => collectAll(child, depth + 1));
}
collectAll(sfTest, 0);

nodesNearError.sort((a, b) => b.depth - a.depth);
console.log('\nNodes containing L6713 position (sorted by depth):');
for (const n of nodesNearError.slice(0, 10)) {
  console.log(`  depth=${n.depth} ${n.kind} [${n.start}-${n.end}]`);
}
