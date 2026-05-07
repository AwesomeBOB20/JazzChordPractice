const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

function getFiles(dir, filesList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getFiles(fullPath, filesList);
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
      filesList.push(fullPath);
    }
  }
  return filesList;
}

const files = getFiles(srcDir);
files.push(path.join(__dirname, 'index.ts'));

function getAlias(absPath) {
  const relPath = path.relative(__dirname, absPath).replace(/\\/g, '/');
  if (relPath.startsWith('src/app')) return relPath.replace('src/app', '@app');
  if (relPath.startsWith('src/features')) return relPath.replace('src/features', '@features');
  if (relPath.startsWith('src/shared')) return relPath.replace('src/shared', '@shared');
  return null;
}

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;
  
  content = content.replace(/(from|import)\s+['"](\.\.?\/[^'"]+)['"]/g, (match, p1, p2) => {
    const currentDir = path.dirname(file);
    const absImportPath = path.resolve(currentDir, p2);
    
    const alias = getAlias(absImportPath);
    if (alias) {
      changed = true;
      return `${p1} '${alias}'`;
    }
    return match;
  });
  
  if (changed) {
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Updated ${file}`);
  }
}
