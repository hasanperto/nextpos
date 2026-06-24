const fs = require('fs');
const html = fs.readFileSync('d:/Yedeklerim/nextpos1/nextpos/scratch/comprehensive-2b-waiter-clicked.html', 'utf8');

// Search for elements containing "EUR" or class names with "fixed" or "bottom" or "float"
const lines = html.split('\n');
console.log('--- Matches for cart button in HTML ---');
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('EUR4') || line.includes('EUR') && line.includes('button') && line.includes('fixed') || line.includes('floating') || line.includes('bottom-')) {
        console.log(`${i+1}: ${line.trim()}`);
    }
}
