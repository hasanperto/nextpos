const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function test() {
    const token = 'YOUR_TOKEN_HERE'; // I need to get a token
    // Actually, I can't easily get a token.
}
