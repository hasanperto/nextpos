async function main() {
  try {
    const res = await fetch('http://127.0.0.1:3101/api/v1/billing/tenants/a1111111-1111-4111-8111-111111111111/wallet/deposit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: 500,
        paymentMethod: 'credit_card',
        description: 'Cüzdan Bakiye Yükleme Test'
      })
    });

    console.log('Status:', res.status);
    const text = await res.text();
    console.log('Body:', text);
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

main();
