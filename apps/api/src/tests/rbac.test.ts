import assert from 'node:assert';
import { KITCHEN_ROUTE_ROLES } from '../routes/kitchen.js';
import {
    DELIVERY_VALID_TRANSITIONS,
    validateDeliveryTransition,
} from '../controllers/orders.controller.js';

console.log('🧪 Running RBAC & delivery transition tests...\n');

let failed = 0;

function runTest(name: string, fn: () => void) {
    try {
        fn();
        console.log(`✅ ${name}`);
    } catch (err) {
        failed++;
        console.error(`❌ ${name}`);
        console.error(err instanceof Error ? err.message : err);
    }
}

/** Mutfak rotası: kitchen ve admin erişebilir */
function isKitchenRouteAllowed(role: string): boolean {
    return (KITCHEN_ROUTE_ROLES as readonly string[]).includes(role);
}

runTest('kitchen route allows kitchen role', () => {
    assert.strictEqual(isKitchenRouteAllowed('kitchen'), true);
});

runTest('kitchen route allows admin role', () => {
    assert.strictEqual(isKitchenRouteAllowed('admin'), true);
});

runTest('kitchen route denies cashier role', () => {
    assert.strictEqual(isKitchenRouteAllowed('cashier'), false);
});

runTest('kitchen route denies waiter role', () => {
    assert.strictEqual(isKitchenRouteAllowed('waiter'), false);
});

runTest('kitchen route denies courier role', () => {
    assert.strictEqual(isKitchenRouteAllowed('courier'), false);
});

runTest('DELIVERY_VALID_TRANSITIONS ready → shipped', () => {
    assert.deepStrictEqual(DELIVERY_VALID_TRANSITIONS.ready, ['shipped']);
});

runTest('DELIVERY_VALID_TRANSITIONS shipped → delivered|failed', () => {
    assert.deepStrictEqual(DELIVERY_VALID_TRANSITIONS.shipped, ['delivered', 'failed']);
});

runTest('delivery: ready → shipped is valid', () => {
    assert.strictEqual(validateDeliveryTransition('ready', 'shipped', 'delivery'), true);
});

runTest('delivery: shipped → delivered is valid', () => {
    assert.strictEqual(validateDeliveryTransition('shipped', 'completed', 'delivery'), true);
});

runTest('delivery: shipped → failed (cancelled) is valid', () => {
    assert.strictEqual(validateDeliveryTransition('shipped', 'cancelled', 'delivery'), true);
});

runTest('delivery: ready → delivered is invalid', () => {
    assert.strictEqual(validateDeliveryTransition('ready', 'delivered', 'delivery'), false);
});

runTest('delivery: shipped → shipped is invalid', () => {
    assert.strictEqual(validateDeliveryTransition('shipped', 'shipped', 'delivery'), false);
});

runTest('non-delivery orders skip transition guard', () => {
    assert.strictEqual(validateDeliveryTransition('ready', 'delivered', 'dine_in'), true);
});

console.log(`\n📊 Sonuç: ${13 - failed} başarılı, ${failed} başarısız.`);
if (failed > 0) {
    process.exit(1);
}
console.log('🎉 RBAC testleri tamamlandı!');
process.exit(0);
