const fs = require('fs');

const path = 'C:/Users/Perto/.gemini/antigravity/brain/689639f4-6382-4fca-9e67-92f3e669134d/.system_generated/tasks/task-1190.log';
const content = fs.readFileSync(path, 'utf-8');
const lines = content.split('\n');

console.log('Total lines:', lines.length);

const keywords = ['payment', 'orders', 'error', '500', '400', 'POST', 'PATCH'];
const matches = [];

for (let i = lines.length - 1; i >= 0 && matches.length < 50; i--) {
    const line = lines[i];
    if (keywords.some(kw => line.toLowerCase().includes(kw))) {
        matches.push(`${i + 1}: ${line}`);
    }
}

console.log('--- RECENT MATCHES ---');
console.log(matches.reverse().join('\n'));
