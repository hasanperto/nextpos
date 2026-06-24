const fs = require('fs');
const content = fs.readFileSync('d:/Yedeklerim/nextpos1/nextpos/apps/api/src/controllers/customers.controller.ts', 'utf8');

const lines = content.split('\n');
lines.forEach((line, index) => {
    if (line.includes('ensureCustomerColumns') || line.includes('ALTER TABLE')) {
        console.log(`Line ${index + 1}: ${line.trim()}`);
    }
});
