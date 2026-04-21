import { test, expect } from '@playwright/test';

/**
 * Phase 12 - Fiscal Order Workflow E2E Test
 * Verifies that the German KassenSichV (TSE) signing logic works through the API.
 */
test.describe('Fiscal Order Workflow (TSE Compliance)', () => {
    const tenantId = 'demo'; // demo tenant usually has id '11111111-1111-4111-8111-111111111111' 
    // but in e2e we use the header
    
    test('should create a dine-in order and have a tss_signature', async ({ request }) => {
        // 1. Create Order
        const newOrder = await request.post('/api/orders', {
            data: {
                orderType: 'dine_in',
                tableId: 1,
                items: [
                    { productId: 1, quantity: 2, unitPrice: 12.5 }
                ]
            },
            headers: {
                'x-tenant-id': tenantId,
                'Authorization': 'Bearer test-token-if-needed' // usually mocked for localhost
            }
        });

        expect(newOrder.ok()).toBe(true);
        const orderData = await newOrder.json();
        
        // 🛡️ Critical Assertion: Order must have a signature and transaction number
        expect(orderData.tss_signature).toBeDefined();
        expect(orderData.tss_signature.length).toBeGreaterThan(20);
        expect(orderData.tss_transaction_no).toMatch(/^TX-/);
        
        console.log('✅ Fiscal Order Signature verified:', orderData.tss_signature);
    });

    test('should complete a checkout and sign the payment', async ({ request }) => {
        // 1. Checkout (Full order creation + payment)
        const checkout = await request.post('/api/orders/checkout', {
            data: {
                orderType: 'takeaway',
                deliveryPhone: '0123456789',
                items: [
                    { productId: 2, quantity: 1, unitPrice: 45.0 }
                ],
                payment: {
                    method: 'cash',
                    receivedAmount: 50.0
                }
            },
            headers: {
                'x-tenant-id': tenantId
            }
        });

        expect(checkout.ok()).toBe(true);
        const data = await checkout.json();
        
        // 🛡️ Critical Assertion: Payment must be signed
        expect(data.payment.tss_signature).toBeDefined();
        expect(data.payment.tss_signature.length).toBeGreaterThan(20);
        
        console.log('✅ Fiscal Payment Signature verified:', data.payment.tss_signature);
    });
});
