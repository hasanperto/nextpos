async function run() {
    const args = process.argv.slice(2);
    const mode = args[0] || 'new';

    const TENANT_ID = 'a1111111-1111-4111-8111-111111111111';
    const callerIdWebhookUrl = `http://127.0.0.1:3101/api/v1/integrations/caller-id?tenant=${TENANT_ID}&key=DEMO`;
    
    let payload = {};
    if (mode === 'registered') {
        // Hasan Bey exists in the database (tenant_demo)
        payload = {
            number: '+905321112233'
        };
        console.log('Simulating call from REGISTERED customer: Hasan Bey (+905321112233)');
    } else {
        const randomNum = '+90555' + Math.floor(Math.random() * 9000000 + 1000000);
        payload = {
            number: randomNum,
            name: 'Bilinmeyen Numara'
        };
        console.log(`Simulating call from NEW customer: ${randomNum}`);
    }

    try {
        const res = await fetch(callerIdWebhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        console.log('Status:', res.status);
        const text = await res.text();
        console.log('Body:', text);
    } catch (e) {
        console.error('Error:', e);
    }
}

run();
