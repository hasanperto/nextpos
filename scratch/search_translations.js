const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'apps', 'pos', 'src', 'i18n', 'posMessages.ts');
if (!fs.existsSync(file)) {
    console.error('File not found:', file);
    process.exit(1);
}

const content = fs.readFileSync(file, 'utf8');

function findKey(key) {
    console.log(`\n🔍 Translations for key: ${key}`);
    const regex = new RegExp(`['"]?${key}['"]?\\s*:\\s*['"\`]([^'"\`]+)['"\`]`, 'g');
    let match;
    while ((match = regex.exec(content)) !== null) {
        console.log(match[0]);
    }
}

findKey('payCash');
findKey('payCard');
findKey('sendToKitchen');
findKey('checkout');
findKey('payment');
findKey('cart_open');
