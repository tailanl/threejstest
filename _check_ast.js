const ts = require('typescript');
const fs = require('fs');
const srcPath = 'src/components/game/GameScene.tsx';
const src = fs.readFileSync(srcPath, 'utf8');

const sourceFile = ts.createSourceFile(srcPath, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

// Find the node at position L6713 (0-indexed: line 6712)
const lines = src.split('\n');
// Position of L6713 column 6 (the '}')
let targetPos = 0;
for (let i = 0; i < 6712; i++) targetPos += lines[i].length + 1;
targetPos += 5; // column 6 (0-indexed: 5)

console.log(`Target position: ${targetPos}`);
console.log(`L6713 content: [${lines[6712]}]`);

// Find the deepest node containing this position
function findNodeAtPos(node) {
  if (node.start > targetPos || node.end < targetPos) return null;
  
  let bestMatch = null;
  ts.forEachChild(node, child => {
    const found = findNodeAtPos(child);
    if (found) bestMatch = found;
  });
  
  return bestMatch || node;
}

const targetNode = findNodeAtPos(sourceFile);
if (targetNode) {
  console.log(`\nNode at L6713:6:`);
  console.log(`  Kind: ${ts.SyntaxKind[targetNode.kind]} (${targetNode.kind})`);
  console.log(`  Start: ${targetNode.start}, End: ${targetNode.end}`);
  console.log(`  Text: [${src.substring(targetNode.start, Math.min(targetNode.end, targetNode.start + 100))}]`);
  
  // Walk up the parent chain
  console.log(`\nParent chain:`);
  let current = targetNode.parent;
  let depth = 0;
  while (current && depth < 20) {
    const startLine = src.substring(0, current.start).split('\n').length;
    console.log(`  ${'  '.repeat(depth)}${ts.SyntaxKind[current.kind]} (${current.kind}) at L${startLine} [${src.substring(current.start, Math.min(current.end, current.start + 60)).replace(/\n/g, ' ')}]`);
    current = current.parent;
    depth++;
  }
}

// Also show all parse diagnostics with more context
console.log('\n=== All Parse Diagnostics ===');
let diagCount = 0;
function visit(node) {
  if (node.parseDiagnostics) {
    for (const d of node.parseDiagnostics) {
      diagCount++;
      const pos = d.start;
      const lnum = src.substring(0, pos).split('\n').length;
      const lineStart = src.lastIndexOf('\n', pos - 1);
      const col = pos - lineStart - 1;
      const lineContent = lines[lnum - 1] || '';
      console.log(`\nDiag #${diagCount}: L${lnum}:${col} [TS${d.code}]`);
      console.log(`  Message: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`);
      console.log(`  Line: ${lineContent.trim()}`);
      console.log(`  Pointer: ${' '.repeat(col)}^`);
      
      // Show parent chain for this diagnostic position too
      let pnode = node;
      let pd = 0;
      console.log(`  Context chain:`);
      while (pnode && pd < 8) {
        const pl = src.substring(0, pnode.start).split('\n').length;
        console.log(`    ${' '.repeat(pd)}${ts.SyntaxKind[pnode.kind]} @ L${pl}`);
        pnode = pnode.parent;
        pd++;
      }
    }
  }
  ts.forEachChild(node, visit);
}
visit(sourceFile);
console.log(`\nTotal parse diagnostics: ${diagCount}`);
