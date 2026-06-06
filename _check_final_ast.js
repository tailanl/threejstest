const ts = require('typescript');
const fs = require('fs');
const srcPath = 'src/components/game/GameScene.tsx';
const src = fs.readFileSync(srcPath, 'utf8');
const lines = src.split('\n');

// Parse L1-6712 (the last "good" version) and check its AST structure
// Specifically: what does the parser think is still open at the end?
const goodPart = lines.slice(0, 6712).join('\n');
const sfGood = ts.createSourceFile('test.tsx', goodPart, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

console.log('=== Analyzing L1-6712 (last good state) ===');
console.log(`Total length: ${goodPart.length} chars`);
console.log(`Last 80 chars: [${goodPart.slice(-80)}]`);

// Find the deepest/last node in the AST
let lastNode = null;
let maxEnd = -1;
function findLast(node) {
  if (node.start !== undefined && node.end !== undefined && node.end > maxEnd && node.end <= goodPart.length) {
    // Skip SourceFile
    if (node.kind !== ts.SyntaxKind.SourceFile) {
      lastNode = node;
      maxEnd = node.end;
    }
  }
  ts.forEachChild(node, findLast);
}
findLast(sfGood);

if (lastNode) {
  console.log(`\nLast AST node:`);
  console.log(`  Kind: ${ts.SyntaxKind[lastNode.kind]}`);
  console.log(`  Start: ${lastNode.start}, End: ${lastNode.end}`);
  console.log(`  Text: [${goodPart.substring(lastNode.start, Math.min(lastNode.end, lastNode.start + 150))}]`);
  
  // Walk up to understand what's "open"
  let p = lastNode.parent;
  let depth = 0;
  console.log('\nParent chain (what is still open):');
  while (p && depth < 25) {
    const pText = goodPart.substring(p.start, Math.min(p.end, p.start + 60)).replace(/\n/g, '\\n');
    console.log(`  ${'  '.repeat(depth)}${ts.SyntaxKind[p.kind]} [${p.start}-${p.end}] ${pText}`);
    p = p.parent;
    depth++;
  }
}

// Also: check for parse diagnostics in the "good" part
let goodDiags = 0;
function countDiags(node) {
  if (node.parseDiagnostics) {
    for (const d of node.parseDiagnostics) {
      if (d.start < goodPart.length) goodDiags++;
    }
  }
  ts.forEachChild(node, countDiags);
}
countDiags(sfGood);
console.log(`\nParse diagnostics in L1-6712: ${goodDiags}`);

// Now parse L1-6713 and show the error with full context
const badPart = lines.slice(0, 6713).join('\n');
const sfBad = ts.createSourceFile('test.tsx', badPart, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let badDiags = [];
function collectDiags(node) {
  if (node.parseDiagnostics) {
    for (const d of node.parseDiagnostics) {
      if (d.start < badPart.length) {
        badDiags.push({
          code: d.code,
          pos: d.start,
          msg: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
          line: badPart.substring(0, d.start).split('\n').length
        });
      }
    }
  }
  ts.forEachChild(node, collectDiags);
}
collectDiags(sfBad);
console.log(`\nParse diagnostics in L1-6713: ${badDiags.length}`);
for (const d of badDiags) {
  console.log(`  L${d.line}:${d.pos} [TS${d.code}] ${d.msg}`);
}
