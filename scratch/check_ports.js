const targets = [
  'http://127.0.0.1:3001/api/v1/health',
  'http://localhost:3001/api/v1/health',
  'http://127.0.0.1:5000/api/v1/health',
  'http://localhost:5000/api/v1/health',
  'http://127.0.0.1:5173/api/v1/health',
  'http://localhost:5173/api/v1/health',
  'http://127.0.0.1:3001/health',
  'http://localhost:3001/health',
];

async function check() {
  console.log('🔍 Probing health check endpoints with native fetch...');
  for (const url of targets) {
    try {
      const res = await fetch(url);
      console.log(`URL: ${url} -> status ${res.status} (${res.statusText})`);
      if (res.ok) {
        const body = await res.text();
        console.log(`   Response: ${body.substring(0, 100)}`);
      }
    } catch (e) {
      console.log(`URL: ${url} -> ERROR: ${e.message}`);
    }
  }
}

check();
