const fs = require('fs');

const filePath = 'd:\\Yedeklerim\\nextpos1\\nextpos\\apps\\pos\\src\\features\\terminal\\components\\WaOrderModal.tsx';
const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');

console.log('Imports and store hooks in WaOrderModal.tsx:');
for (let i = 0; i < 150; i++) {
    if (lines[i].includes('import') || lines[i].includes('usePosStore') || lines[i].includes('useUIStore')) {
        console.log(`Line ${i + 1}: ${lines[i].trim()}`);
    }
}
