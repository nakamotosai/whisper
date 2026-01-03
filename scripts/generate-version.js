const fs = require('fs');
const path = require('path');

const version = Date.now().toString();
const content = JSON.stringify({ version });
const outputPath = path.join(__dirname, '../public/version.json');

fs.writeFileSync(outputPath, content);
console.log(`Generated version.json with version: ${version}`);
