const ts = require('typescript');
const fs = require('fs');
const srcPath = 'src/components/game/GameScene.tsx';
const src = fs.readFileSync(srcPath, 'utf8');

// Create source file and try to parse it
const sourceFile = ts.createSourceFile(
  srcPath,
  src,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);

// Check for parse errors
const diagnostics = [];
function visit(node, depth = 0) {
  // Check for missing nodes or parse errors
  if (node.parseDiagnostics) {
    for (const d of node.parseDiagnostics) {
      const pos = d.start;
      const lineNum = src.substring(0, pos).split('\n').length;
      const col = pos - src.lastIndexOf('\n', pos - 1);
      diagnostics.push({
        line: lineNum,
        col,
        msg: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
        kind: d.code
      });
    }
  }
  ts.forEachChild(node, child => visit(child, depth + 1));
}

visit(sourceFile);

if (diagnostics.length > 0) {
  console.log('Parse diagnostics found:');
  for (const d of diagnostics) {
    console.log(`  L${d.line}:${d.col} [TS${d.kind}] ${d.msg}`);
  }
} else {
  console.log('No parse diagnostics from AST traversal.');
}

// Also try emit to get full errors
const compilerHost = ts.createCompilerHost({}, true);
compilerHost.getSourceFile = (fileName) => fileName === srcPath ? sourceFile : undefined;
compilerHost.fileExists = (name) => name === srcPath;
compilerHost.readFile = (name) => name === srcPath ? src : undefined;
compilerHost.getDefaultLibFileName = () => 'lib.d.ts';
compilerHost.getCurrentDirectory = () => '.';
compilerHost.getCanonicalFileName = (f) => f;
compilerHost.useCaseSensitiveFileNames = () => true;
compilerHost.getNewLine = () => '\n';
compilerHost.writeFile = () => {};

const program = ts.createProgram([srcPath], {}, compilerHost);
const emitResult = program.emit();
const allDiags = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);

console.log('\nAll TypeScript diagnostics (first 10):');
for (let i = 0; i < Math.min(10, allDiags.length); i++) {
  const d = allDiags[i];
  if (!d.file || d.file.fileName !== srcPath) continue;
  const pos = d.start ?? 0;
  const lineNum = src.substring(0, pos).split('\n').length;
  const col = pos - src.lastIndexOf('\n', pos - 1);
  console.log(`  L${lineNum}:${col} [TS${d.code}] ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`);
}
