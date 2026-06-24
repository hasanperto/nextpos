const fs = require('fs');
const content = fs.readFileSync('d:/Yedeklerim/nextpos1/nextpos/apps/pos/src/store/usePosStore.ts', 'utf8');

const lines = content.split('\n');
console.log('--- Matches for lang in usePosStore.ts ---');
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('lang:') || line.includes('setLang') || line.includes('changeLanguage') || line.includes('language:')) {
        console.log(`${i+1}: ${line.trim()}`);
    }
}
