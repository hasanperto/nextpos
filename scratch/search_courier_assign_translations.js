const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'apps', 'pos', 'src', 'i18n', 'posMessages.ts');
const content = fs.readFileSync(file, 'utf8');

function findValue(val) {
    console.log(`\n🔍 Searching for text: ${val}`);
    const regex = new RegExp(`['"]?([a-zA-Z0-9_.-]+)['"]?\\s*:\\s*['"\`]([^'"\`]*${val}[^'"\`]*)['"\`]`, 'gi');
    let match;
    while ((match = regex.exec(content)) !== null) {
        console.log(`${match[1]}: ${match[2]}`);
    }
}

findValue('Ata');
findValue('Kuryeye');
findValue('zuweisen');
findValue('übergeben');
findValue('Liefer');
