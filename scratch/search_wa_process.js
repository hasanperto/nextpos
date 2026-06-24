const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'apps', 'pos', 'src', 'i18n', 'posMessages.ts');
const content = fs.readFileSync(file, 'utf8');

const regex = /['"]?wa\.process['"]?\s*:\s*['"\`]([^'"\`]+)['"\`]/g;
let match;
while ((match = regex.exec(content)) !== null) {
    console.log(match[0]);
}
