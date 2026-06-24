import fs from 'fs';

const content = fs.readFileSync('d:/Yedeklerim/nextpos1/nextpos/apps/pos/src/store/useSaaSStore.ts', 'utf8');
const lines = content.split('\n');

lines.forEach((line, index) => {
    if (line.toLowerCase().includes('ticket') || line.toLowerCase().includes('support')) {
        console.log(`L${index + 1}: ${line}`);
    }
});
