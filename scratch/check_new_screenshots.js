const fs = require('fs');
const path = require('path');

const files = [
    'e2e-int-1-cashier-loaded.png',
    'e2e-int-2-wa-order-incoming.png',
    'e2e-int-3-wa-modal-opened.png',
    'e2e-int-4-wa-order-cart-loaded.png',
    'e2e-int-5-wa-order-sent-to-kitchen.png'
];

for (const file of files) {
    const fullPath = path.join('d:\\Yedeklerim\\nextpos1\\nextpos\\scratch', file);
    if (fs.existsSync(fullPath)) {
        const stat = fs.statSync(fullPath);
        console.log(`${file}: size=${stat.size} bytes, mtime=${stat.mtime.toISOString()}`);
    } else {
        console.log(`${file}: NOT FOUND`);
    }
}
