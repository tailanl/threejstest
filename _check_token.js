const ts = require('typescript');
const fs = require('fs');
const srcPath = 'src/components/game/GameScene.tsx';
const src = fs.readFileSync(srcPath, 'utf8');
const lines = src.split('\n');

// Extract just the area around L6711-L6713 and tokenize it in context
const snippetStart = lines.slice(0, 6710).join('\n').length;
const snippet = src.substring(snippetStart - 200, snippetStart + 200);
console.log('Context around transition point:');
console.log(snippet);
console.log('\n---');

// Create source file for JUST the last 50 lines and check tokens
const last50 = lines.slice(6663, 6713).join('\n'); // L6664-L6713
console.log('\nLast 50 lines (L6664-L6713):');
const sf50 = ts.createSourceFile('test.tsx', last50, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

// Print all tokens
let token = sf50.text.charAt(0);
let pos = 0;
const tokenList = [];
while (pos < last50.length) {
  const result = ts.scanToken(last50, pos, ts.ScriptTarget.Latest, true, ts.SyntaxKind.TSX);
  const text = last50.substring(pos, result.end);
  if (text.trim()) {
    tokenList.push({ kind: ts.SyntaxKind[result.token], text, pos });
  }
  pos = result.pos;
  if (result.token === ts.SyntaxKind.EndOfFileToken) break;
}

console.log('\nTokens (last 30):');
for (const t of tokenList.slice(-30)) {
  console.log(`  ${t.kind.toString().padEnd(35)} [${t.pos}] ${t.text.replace(/\n/g, '\\n').substring(0, 40)}`);
}

// Now check: what does TypeScript think is the STATE when it reaches }; ?
// Let's try parsing with a wrapper to see if it's an arrow function close or something else
console.log('\n=== Key test: What does }; close? ===');

// Test 1: Is this closing an arrow function?
const asArrowFn = `(function(){${last50}})`;
const sfArrow = ts.createSourceFile('test.tsx', asArrowFn, ts.ScriptTarget.Latest, true);
let arrowErr = 0;
function visitArrow(n) {
  if (n.parseDiagnostics) { for (const d of n.parseDiagnostics) arrowErr++; }
  ts.forEachChild(n, visitArrow);
}
visitArrow(sfArrow);
console.log(`Wrapped as IIFE: ${arrowErr} errors`);

// Test 2: Does adding ) before }; fix it?
const withParen = last50.replace(/};\s*$/, '});');
const sfParen = ts.createSourceFile('test.tsx', withParen, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let parenErr = 0;
function visitParen(n) {
  if (n.parseDiagnostics) { for (const d of n.parseDiagnostics) { if (d.start < withParen.length - 5) parenErr++; } }
  ts.forEachChild(n, visitParen);
}
visitParen(sfParen);
console.log(`With }); instead of }; : ${parenErr} errors`);
