const fs = require('fs');
let content = fs.readFileSync('apps/pos/src/pages/AdminSettings.tsx', 'utf8');
content = content.replace(
    "allowSelfRegistration: true, pairingSecret: '', linkedDevices: []",
    "allowSelfRegistration: true, pairingSecret: '', deviceNotes: '', linkedDevices: []"
);
fs.writeFileSync('apps/pos/src/pages/AdminSettings.tsx', content);
console.log('Fixed AdminSettings.tsx');