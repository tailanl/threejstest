const ts = require('typescript');
const fs = require('fs');
const srcPath = 'src/components/game/GameScene.tsx';
const src = fs.readFileSync(srcPath, 'utf8');
const lines = src.split('\n');

// Test L1-6700 with our added `});` - check the AST structure at end
const partial6700 = lines.slice(0, 6700).join('\n') + '\n});';
const sf6700 = ts.createSourceFile('test.tsx', partial6700, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

// Find the LAST meaningful statement in the AST
let lastStatement = null;
function findLast(node) {
  if (node.kind === ts.SyntaxKind.ExpressionStatement || 
      node.kind === ts.SyntaxKind.IfStatement ||
      node.kind === ts.SyntaxKind.ForStatement ||
      node.kind === ts.SyntaxKind.WhileStatement ||
      node.kind === ts.SyntaxKind.SwitchStatement ||
      node.kind === ts.SyntaxKind.BreakStatement ||
      node.kind === ts.SyntaxKind.VariableStatement) {
    lastStatement = node;
  }
  // Also track blocks
  if (node.kind === ts.SyntaxKind.Block) {
    const blockStmts = node.statements;
    if (blockStmts && blockStmts.length > 0) {
      lastStatement = blockStmts[blockStmts.length - 1];
    }
  }
  ts.forEachChild(node, findLast);
}
findLast(sf6700);

if (lastStatement) {
  console.log('Last statement in L1-6700 + `});`:');
  console.log(`  Kind: ${ts.SyntaxKind[lastStatement.kind]}`);
  console.log(`  Text: [${partial6700.substring(lastStatement.start, Math.min(lastStatement.end, lastStatement.start + 100))}]`);
  console.log(`  Parent kind: ${lastStatement.parent ? ts.SyntaxKind[lastStatement.parent.kind] : 'none'}`);
  
  // Walk up from last statement to understand context
  let p = lastStatement.parent;
  let depth = 0;
  console.log('\nContext chain from last statement:');
  while (p && depth < 15) {
    const pStartLine = partial6700.substring(0, p.start).split('\n').length;
    console.log(`  ${'  '.repeat(depth)}${ts.SyntaxKind[p.kind]} @ L${pStartLine}`);
    p = p.parent;
    depth++;
  }
}

// Now test FULL file and compare
console.log('\n\n=== FULL FILE ANALYSIS ===');
const sfFull = ts.createSourceFile(srcPath, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

// Find what's right before position L6713
const pos6713 = src.indexOf('};', lines.slice(0, 6712).join('\n').length);
console.log(`Position of L6713 '};': ${pos6713}`);

// Find the deepest node that ends at or near this position
let bestNode = null;
let bestDepth = -1;
function findDeepestAtPos(node, depth) {
  if (node.start !== undefined && node.end !== undefined) {
    if (node.start <= pos6713 && node.end > pos6713 && depth > bestDepth) {
      bestNode = node;
      bestDepth = depth;
    }
  }
  ts.forEachChild(node, child => findDeepestAtPos(child, depth + 1));
}
findDeepestAtPos(sfFull, 0);

if (bestNode) {
  console.log(`\nDeepest node containing L6713:`);
  console.log(`  Kind: ${ts.SyntaxKind[bestNode.kind]} (depth=${bestDepth})`);
  console.log(`  Start: ${bestNode.start}, End: ${bestNode.end}`);
  console.log(`  Text (first 150): [${src.substring(bestNode.start, Math.min(bestNode.end, bestNode.start + 150))}]`);
}
