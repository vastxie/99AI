const { join } = require('path');
const { readdirSync, statSync } = require('fs');
const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');

const distDirectory = './dist';

function obfuscateFile(filePath) {
  const fileContents = fs.readFileSync(filePath, 'utf8');
  const obfuscationResult = JavaScriptObfuscator.obfuscate(fileContents);

  fs.writeFileSync(filePath, obfuscationResult.getObfuscatedCode(), 'utf8');
}

function traverseDirectory(currentPath) {
  const files = readdirSync(currentPath).map(file => join(currentPath, file));
  files.forEach((file) => {
    console.log('encry =======> ', file);
    if (statSync(file).isDirectory()) {
      traverseDirectory(file);
    } else if (file.endsWith('.js')) {
      obfuscateFile(file);
    }
  });
}

traverseDirectory(distDirectory);

console.log('JavaScript obfuscation complete!');
