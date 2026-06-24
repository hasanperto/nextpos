
const axios = require('axios');

async function sendTestOrder() {
    console.log('--- QR Menü Test Siparişi Gönderiliyor ---');
    
    const orderData = {
        customerName: "Ahmet Yilmaz (TEST)",
        customerPhone: "05551234567",
        orderType: "delivery",
        address: "Test Mah. Yazilim Sok. No:42/1",
        paymentMethod: "cash",
        notes: "Lutfen temassiz teslimat yapiniz.",
        items: [
            {
                productId: 358, // Pizza Margherita
                quantity: 2,
                notes: "Extra acili olsun"
            },
            {
                productId: 362, // Kola 33cl
                quantity: 1
            }
        ]
    };

    try {
        const response = await axios.post('http://localhost:3101/api/v1/qr/external-order', orderData, {
            headers: {
                'x-tenant-id': 'a1111111-1111-4111-8111-111111111111', // Yerel test icin tenant ID
                'Content-Type': 'application/json'
            }
        });

        console.log('✅ Sipariş Başarıyla Gönderildi!');
        console.log('ID:', response.data.orderId);
        console.log('Mesaj:', response.data.message);
        console.log('\n🔔 POS Ekranini kontrol edin, alarm çaliyor olmali!');
    } catch (error) {
        console.error('❌ Hata Oluştu:', error.response ? error.response.data : error.message);
    }
}

sendTestOrder();
