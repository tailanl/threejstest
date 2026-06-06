const ts = require('typescript');
const fs = require('fs');
const srcPath = 'src/components/game/GameScene.tsx';
const src = fs.readFileSync(srcPath, 'utf8');

// Parse the FULL file and find the FIRST parse diagnostic
const sf = ts.createSourceFile(srcPath, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

// Collect ALL parse diagnostics with their positions, sorted by position
const allDiags = [];
function visit(node, depth) {
  if (node.parseDiagnostics) {
    for (const d of node.parseDiagnostics) {
      allDiags.push({
        pos: d.start,
        code: d.code,
        msg: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
        nodeKind: ts.SyntaxKind[node.kind],
        depth
      });
    }
  }
  ts.forEachChild(node, child => visit(child, depth + 1));
}
visit(sf, 0);

allDiags.sort((a, b) => a.pos - b.pos);

console.log(`Total parse diagnostics: ${allDiags.length}`);
console.log('\nSorted by position:');
for (const d of allDiags) {
  const lineNum = src.substring(0, d.pos).split('\n').length;
  const lineStart = src.lastIndexOf('\n', d.pos - 1);
  const col = d.pos - lineStart - 1;
  console.log(`  L${lineNum}:${col} [TS${d.code}] ${d.msg.substring(0, 80)} (node: ${d.nodeKind}, depth: ${d.depth})`);
}

// Now find: at what line does parsing first "go wrong"?
// Strategy: check if the AST structure looks normal up to each point
console.log('\n=== Finding where parsing breaks down ===');

// For each diagnostic, show what's AT that position
for (const d of allDiags.slice(0, 1)) {
  const pos = d.pos;
  // Show surrounding context
  const contextStart = Math.max(0, pos - 50);
  const contextEnd = Math.min(src.length, pos + 30);
  console.log(`\nFirst error at position ${pos}:`);
  console.log(`Context: ...${src.substring(contextStart, contextEnd).replace(/\n/g, '\\n')}...`);
  
  // Show the exact character
  console.log(`Char at error: '${src[pos]}' (code ${src.charCodeAt(pos)})`);
  
  // Check if there's an unclosed template literal before this point
  let backtickCount = 0;
  inTemplate = false;
  for (let i = 0; i < pos; i++) {
    if (src[i] === '`') {
      if (!inTemplate) {
        inTemplate = true;
      } else {
        // Check if this closes the template
        // Simple check: count backticks
        inTemplate = false;
      }
    }
    if (inTemplate && src[i] === '$' && src[i+1] === '{') {
      // Template expression start - needs matching }
    }
  }
}
