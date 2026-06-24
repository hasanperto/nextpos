const fs = require('fs');

const path = 'C:/Users/Perto/.gemini/antigravity/brain/689639f4-6382-4fca-9e67-92f3e669134d/.system_generated/tasks/task-1190.log';
const content = fs.readFileSync(path, 'utf-8');
const lines = content.split('\n');

const keywords = ['checkout', 'payment', 'createOrder', 'error', 'fail', '400', '500'];
const matches = [];

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (keywords.some(kw => line.toLowerCase().includes(kw))) {
        if (line.includes('API-ERROR') || line.includes('error') || line.includes('Error') || line.includes('Fail')) {
            matches.push(`${i + 1}: ${line}`);
        }
    }
}

console.log('--- ERROR MATCHES ---');
console.log(matches.slice(-50).join('\n'));
