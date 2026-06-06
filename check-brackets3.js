const fs = require('fs');
const c = fs.readFileSync('src/components/game/GameScene.tsx', 'utf8');
const lines = c.split('\n');

// Track all opening brackets from line 2886 to 6713
let stack = [];
let roundBracketCount = 0;

for (let i = 2885; i < 6713; i++) {
  const l = lines[i];
  for (let j = 0; j < l.length; j++) {
    const ch = l[j];
    if (ch === '(') {
      stack.push({ type: '(', line: i + 1, col: j + 1 });
      roundBracketCount++;
    } else if (ch === ')') {
      if (stack.length > 0 && stack[stack.length - 1].type === '(') {
        stack.pop();
        roundBracketCount--;
      }
    } else if (ch === '{') {
      stack.push({ type: '{', line: i + 1, col: j + 1 });
    } else if (ch === '}') {
      if (stack.length > 0 && stack[stack.length - 1].type === '{') {
        stack.pop();
      }
    }
  }
}

console.log('Unbalanced round brackets remaining:', roundBracketCount);
console.log('\nLast 5 unclosed items in stack:');
stack.slice(-5).forEach((item, idx) => {
  console.log(`${idx + 1}. ${item.type} at line ${item.line}, col ${item.col}`);
  if (item.line > 6000) {
    console.log(`   Content: ${lines[item.line - 1].trim().substring(0, 150)}`);
  }
});
