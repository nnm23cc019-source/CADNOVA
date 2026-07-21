const fs = require('fs');
const ts = fs.readFileSync('frontend/src/main.ts', 'utf8');
const html = fs.readFileSync('frontend/index.html', 'utf8');
const regex = /document\.getElementById\(['"]([^'"]+)['"]\)/g;
let match;
const missing = [];
while ((match = regex.exec(ts)) !== null) {
  const id = match[1];
  if (!html.includes('id=\"' + id + '\"') && !html.includes('id=\'' + id + '\'')) {
    missing.push(id);
  }
}
console.log('Missing IDs:', [...new Set(missing)]);
