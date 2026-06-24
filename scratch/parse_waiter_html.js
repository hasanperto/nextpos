const fs = require('fs');

function analyze(filename) {
    console.log(`=== ANALYZING: ${filename} ===`);
    if (!fs.existsSync(filename)) {
        console.log("File does not exist!");
        return;
    }
    const html = fs.readFileSync(filename, 'utf8');

    // Check for product names
    const products = ['Kola', 'Ayran', 'Tiramisu', 'Pizza'];
    console.log('Product occurrences in DOM:');
    products.forEach(p => {
        const regex = new RegExp(p, 'gi');
        const matches = html.match(regex);
        console.log(`  - ${p}: ${matches ? matches.length : 0} occurrences`);
    });

    // Check if customize modal is open
    const hasModal = html.includes('customize') || html.includes('seçenek') || html.includes('Zutaten') || html.includes('Extrabeilage');
    console.log(`Customize Modal indicators: ${hasModal}`);

    // Check for cart count or cart drawer items
    // Let's look for cart item indicators
    const hasCartItems = html.includes('cart-item') || html.includes('sepet') || html.includes('quant') || html.includes('Quantity');
    console.log(`Cart items indicators: ${hasCartItems}`);

    // Look for button elements and print their text and state (disabled or not)
    // We can extract all <button> tags
    const buttonRegex = /<button[^>]*>([\s\S]*?)<\/button>/gi;
    let match;
    console.log('Buttons found:');
    let btnCount = 0;
    while ((match = buttonRegex.exec(html)) !== null && btnCount < 40) {
        const fullTag = match[0];
        const innerText = match[1].replace(/<[^>]*>/g, '').trim();
        if (innerText) {
            const isDisabled = fullTag.includes('disabled');
            console.log(`  - "${innerText}" [disabled=${isDisabled}]`);
            btnCount++;
        }
    }
}

analyze('d:/Yedeklerim/nextpos1/nextpos/scratch/comprehensive-2-waiter-table1.html');
analyze('d:/Yedeklerim/nextpos1/nextpos/scratch/comprehensive-2b-waiter-clicked.html');
analyze('d:/Yedeklerim/nextpos1/nextpos/scratch/comprehensive-2c-waiter-cart-opened.html');
