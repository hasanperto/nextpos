import fs from 'fs';

const file = 'd:/Yedeklerim/nextpos1/nextpos/apps/api/src/controllers/saas-advanced.controller.ts';
const content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');

const keywords = ['getTicketMessages', 'createTicketMessage', 'getTicketDetail', 'getSupportStats'];

lines.forEach((line, index) => {
    keywords.forEach(keyword => {
        if (line.includes(keyword)) {
            console.log(`L${index + 1}: ${line}`);
        }
    });
});
