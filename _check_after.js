const ts = require('typescript');
const fs = require('fs');
const srcPath = 'src/components/game/GameScene.tsx';
const src = fs.readFileSync(srcPath, 'utf8');
const lines = src.split('\n');

function testContent(extraContent) {
  const base = lines.slice(0, 6713).join('\n'); // up to and including `};`
  const testSrc = base + '\n' + extraContent;
  const sf = ts.createSourceFile('test.tsx', testSrc, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  
  let errors = [];
  function visit(node) {
    if (node.parseDiagnostics) {
      for (const d of node.parseDiagnostics) {
        errors.push({ code: d.code, pos: d.start, msg: ts.flattenDiagnosticMessageText(d.messageText, '\n').substring(0, 50) });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  
  // Check for error at L6713 position
  const targetPos = base.length - 2; // approximate position of } in };
  const has6713Error = errors.some(e => Math.abs(e.pos - targetPos) < 5);
  
  return { totalErrors: errors.length, has6713Error, errors };
}

console.log('Testing different content after L6713 `};`:');
for (const content of [
  '',
  '\n',
  '\n\n',
  '\n// comment',
  '\nreturn () => {};',
  '\nanimate();',
  '\nreturn () => {\n};',
  '\n}, []);',
  ' })',
]) {
  const r = testContent(content);
  console.log(`  "${content.replace(/\n/g, '\\n').substring(0, 30)}": ${r.totalErrors} errs, L6713-error=${r.has6713Error}`);
}
