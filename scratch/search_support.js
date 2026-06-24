import fs from 'fs';
import path from 'path';

const file = 'd:/Yedeklerim/nextpos1/nextpos/apps/api/src/controllers/tenants.controller.ts';
const content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');

const keywords = ['getSupportTicketsHandler', 'updateTicketStatusHandler', 'createSupportTicketHandler'];

lines.forEach((line, index) => {
    keywords.forEach(keyword => {
        if (line.includes(keyword)) {
            console.log(`L${index + 1}: ${line}`);
        }
    });
});
