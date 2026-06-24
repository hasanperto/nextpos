import { isTenantModuleEnabled } from '../apps/api/src/services/billing.service.ts';

async function main() {
    try {
        const tenantId = 'a1111111-1111-4111-8111-111111111111';
        const modules = [
            'whatsapp_orders',
            'caller_id_android',
            'qr_menu',
            'kitchen_display',
            'waiter_tablet',
            'courier_module',
            'queue_display'
        ];
        console.log('Checking enabled modules for tenant:', tenantId);
        for (const m of modules) {
            const ok = await isTenantModuleEnabled(tenantId, m);
            console.log(`- ${m}: ${ok ? 'ENABLED ✅' : 'DISABLED ❌'}`);
        }
    } catch (e) {
        console.error(e);
    }
}

main();
