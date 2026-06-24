import fs from 'fs';
import path from 'path';

const logPath = 'C:\\Users\\Perto\\.gemini\\antigravity\\brain\\a3917444-f2b6-4cb6-b806-a60c253ce22d\\.system_generated\\tasks\\task-310.log';

if (fs.existsSync(logPath)) {
  const content = fs.readFileSync(logPath, 'utf8');
  const lines = content.split('\n');
  console.log('🔍 Searching log file for "dev/reset-devices"...');
  
  let foundCount = 0;
  lines.forEach((line, idx) => {
    if (line.includes('dev/reset-devices') || line.includes('Reset başarısız')) {
      foundCount++;
      console.log(`\n--- Match ${foundCount} at Line ${idx + 1} ---`);
      const start = Math.max(0, idx - 2);
      const end = Math.min(lines.length - 1, idx + 10);
      for (let i = start; i <= end; i++) {
        console.log(`${i + 1}: ${lines[i]}`);
      }
    }
  });
} else {
  console.log(`Log file not found at: ${logPath}`);
}
