const fs = require('fs');
const path = 'd:\\Yedeklerim\\nextpos1\\nextpos\\apps\\pos\\src\\store\\usePosStore.ts';
const content = fs.readFileSync(path, 'utf-8');
const lines = content.split('\n');

for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('tables') || lines[i].includes('fetchTables') || lines[i].includes('fetch(\'')) {
        console.log(`Line ${i + 1}: ${lines[i].trim()}`);
    }
}
