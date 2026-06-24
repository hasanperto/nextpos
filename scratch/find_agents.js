const fs = require('fs');
const path = require('path');

const brainDir = 'C:/Users/Perto/.gemini/antigravity/brain';

try {
  const dirs = fs.readdirSync(brainDir);
  for (const dir of dirs) {
    const fullPath = path.join(brainDir, dir);
    if (fs.statSync(fullPath).isDirectory()) {
      // check if it's a UUID folder
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dir)) {
        // Look for any identifying files
        // E.g. we could check if there's a task.md or a system prompt
        const systemPromptPath = path.join(fullPath, '.system_generated', 'system_prompt.md');
        if (fs.existsSync(systemPromptPath)) {
          const content = fs.readFileSync(systemPromptPath, 'utf8');
          if (content.includes('Cashier API Agent')) {
            console.log(`FOUND Cashier API Agent in dir: ${dir}`);
          }
          if (content.includes('Courier UI Agent')) {
            console.log(`FOUND Courier UI Agent in dir: ${dir}`);
          }
        }
      }
    }
  }
} catch (err) {
  console.error(err);
}
