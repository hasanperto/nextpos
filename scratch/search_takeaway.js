const fs = require('fs');
const glob = require('glob');
// Search all files in apps/pos/src
glob.sync('d:\\Yedeklerim\\nextpos1\\nextpos\\apps\\pos\\src/**/*.tsx').forEach((file) => {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes('onAddTakeawayToCart') || content.includes('loadOrderToCart')) {
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
            if (line.includes('onAddTakeawayToCart') || line.includes('loadOrderToCart')) {
                console.log(`${file}:${idx+1} -> ${line.trim()}`);
            }
        });
    }
});
