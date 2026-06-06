const fs = require('fs');
const buf = fs.readFileSync('src/components/game/GameScene.tsx');
console.log('BOM:', (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) ? 'YES' : 'NO');
console.log('First 10 bytes:', Array.from(buf.slice(0, 10)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));

// Check for weird characters around line 6713
const src = buf.toString('utf8');
const lines = src.split('\n');
const targetLine = lines[6712]; // L6713 (0-indexed)
console.log('\nL6713 raw bytes:', Array.from(Buffer.from(targetLine)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
console.log('L6713 text: [' + targetLine + ']');
console.log('L6713 length:', targetLine.length);

// Also check a few lines before and after
for (let li = 6710; li < 6716; li++) {
  const ln = lines[li];
  const bytes = Array.from(Buffer.from(ln));
  const hasNonAscii = bytes.some(b => b > 127);
  if (hasNonAscii) {
    console.log(`\nL${li+1} has non-ASCII:`);
    console.log(`  Text: [${ln}]`);
    console.log(`  Bytes: ${bytes.map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}`);
  }
}

// Check for zero-width or other invisible characters in the whole file
let weirdCount = 0;
const weirdChars = new Set();
for (let i = 0; i < src.length; i++) {
  const code = src.charCodeAt(i);
  // Zero-width chars, soft hyphen, BOM, etc.
  if ([0x200B, 0x200C, 0x200D, 0xFEFF, 0xAD, 0x200E, 0x200F, 0x202A, 0x202B, 0x202C, 0x202D, 0x202E, 0x2060, 0x2061, 0x2062, 0x2063, 0x2064].includes(code)) {
    weirdCount++;
    weirdChars.add(`U+${code.toString(16).toUpperCase()} at line ${src.substring(0, i).split('\n').length}`);
  }
}
if (weirdCount > 0) {
  console.log(`\nFound ${weirdCount} weird characters:`);
  for (const w of weirdChars) console.log(`  ${w}`);
} else {
  console.log('\nNo weird/invisible characters found.');
}
