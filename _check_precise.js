const fs = require('fs');
const src = fs.readFileSync('src/components/game/GameScene.tsx', 'utf8');
const lines = src.split('\n');

function analyzeRange(startLine, endLine, label) {
  let depth = 0;
  const results = [];
  
  for (let li = startLine; li < endLine && li < lines.length; li++) {
    const prevDepth = depth;
    const ln = lines[li];
    let i = 0;
    while (i < ln.length) {
      const ch = ln[i];
      
      // Skip single-line comments
      if (ch === '/' && i + 1 < ln.length && ln[i + 1] === '/') {
        break; // rest of line is comment
      }
      
      // Skip strings
      if (ch === "'" || ch === '"' || ch === '`') {
        const q = ch;
        i++;
        while (i < ln.length && ln[i] !== q) {
          if (ln[i] === '\\') i++;
          i++;
        }
        i++;
        continue;
      }
      
      // Skip template expressions in template literals (already handled above)
      
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      i++;
    }
    
    // Show all lines in range with their depth
    results.push({ line: li + 1, prevDepth, depth, code: ln.trim().substring(0, 110) });
  }
  
  return { startDepth: results[0]?.prevDepth || 0, endDepth: depth, results };
}

// Analyze the animate function body only
const { startDepth, endDepth, results } = analyzeRange(2885, 6714, 'animate');
console.log(`=== Animate function range (L2886-L6714) ===`);
console.log(`Start depth (before L2886): ${startDepth}`);
console.log(`End depth (after L6713): ${endDepth}`);
console.log(`Net change: ${endDepth - startDepth}`);
console.log(`\nLines where depth > ${startDepth + 1} (suspiciously deep nesting):`);
for (const r of results) {
  if (r.depth > startDepth + 1) {
    console.log(`  L${r.line}: d=${r.prevDepth}->${r.depth} | ${r.code}`);
  }
}

// Also find: are there any lines where a ( opens but is never closed within the function?
// Show the "baseline" depth - what it should be at each point
console.log(`\n--- Depth trace showing anomalies ---`);
let baseline = startDepth;
let maxAnomaly = 0;
let anomalyLine = -1;
for (const r of results) {
  // After normal statement-level nesting closes, we should return to baseline or nearby
  // If depth stays elevated for many lines, that's the anomaly
  if (r.depth > baseline + 1 && r.depth - baseline > maxAnomaly) {
    maxAnomaly = r.depth - baseline;
    anomalyLine = r.line;
  }
}
console.log(`Max elevation above baseline: ${maxAnomaly} at around L${anomalyLine}`);

// Show depth progression at key points
const keyPoints = [2885, 4009, 4078, 4100, 4500, 5000, 5500, 6000, 6500, 6710];
console.log(`\nDepth at key points:`);
for (const kp of keyPoints) {
  if (kp >= 2885 && kp < results.length + 2885) {
    const r = results[kp - 2885];
    if (r) console.log(`  L${r.line}: depth=${r.depth} | ${r.code.substring(0, 80)}`);
  }
}
