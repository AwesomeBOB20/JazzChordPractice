const fs = require('fs');
const existingFile = fs.readFileSync('src/shared/guitar/dropVoicings.ts', 'utf8');
const lines = existingFile.split('\n');

for (let i = 0; i < Math.min(50, lines.length); i++) {
  const line = lines[i];
  if (line.includes('drop') || line.includes('shell') || line.match(/'[\w]+':\s*\[/) || line.match(/label:/)) {
    console.log(`Line ${i+1}: ${line.trim()}`);
  }
}
