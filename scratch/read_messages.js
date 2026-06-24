const fs = require('fs');
const path = require('path');

const messagesDir = 'C:/Users/Perto/.gemini/antigravity/brain/c528b612-c150-4e18-bfaf-7283c951d508/.system_generated/messages';

try {
  const files = fs.readdirSync(messagesDir);
  for (const file of files) {
    if (file.endsWith('.json') && file !== 'cursor.json' && file !== 'read.json') {
      const fullPath = path.join(messagesDir, file);
      const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      console.log(`File: ${file} | Sender: ${data.Sender} | Recipient: ${data.Recipient}`);
      if (data.Content && (data.Content.includes('cashier') || data.Content.includes('courier'))) {
        console.log(`  Content snippet: ${data.Content.substring(0, 100)}`);
      }
    }
  }
} catch (e) {
  console.error(e);
}
