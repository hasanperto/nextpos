const fs = require('fs');
const path = require('path');
const file = 'C:/Users/Perto/.gemini/antigravity/brain/c528b612-c150-4e18-bfaf-7283c951d508/.system_generated/messages/e1a4dbb0-cddb-4abe-9ced-1c196d0fd333.json';
try {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log('Keys:', Object.keys(data));
  console.log('Content:', data);
} catch (e) {
  console.error(e);
}
