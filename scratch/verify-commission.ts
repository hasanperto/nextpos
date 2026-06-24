import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { processTenantWalletCharge, purchaseBulkPlanForTenant } from '../apps/api/src/services/billing.service.js';
import { updatePaymentStatus } from '../apps/api/src/controllers/saas-advanced.controller.js';

// Setup ES Modules support
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Env vars injection
const envPath = path.join(__dirname, '../apps/api/.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const lines = envContent.split('\n');
for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    let key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1);
    }
    process.env[key] = val;
}

const prisma = new PrismaClient();

async function main() {
    console.log('🚀 Starting Reseller / SaaS Admin Commission Verification Flow...');

    // Get the first super admin in the database (which receives fallback commission splits)
    const firstSuperAdmin = await prisma.saasAdmin.findFirst({
        where: { role: 'super_admin' },
        orderBy: { id: 'asc' }
    });
    if (!firstSuperAdmin) {
        throw new Error('No super_admin found in the database. Please seed the database first.');
    }
    const firstSuperAdminId = firstSuperAdmin.id;
    console.log(`ℹ️ System Super Admin selected for fallback splits: ${firstSuperAdmin.username} (ID: ${firstSuperAdminId})`);

    // 2. Setup Test Reseller
    console.log('👤 Setting up test reseller...');
    const testReseller = await prisma.saasAdmin.upsert({
        where: { username: 'test_commission_reseller' },
        update: { role: 'reseller' },
        create: {
            username: 'test_commission_reseller',
            passwordHash: 'dummy',
            fullName: 'Test Commission Reseller',
            email: 'reseller_comm@test.local',
            role: 'reseller',
            walletBalance: 0
        }
    });

    console.log(`Reseller ID: ${testReseller.id}`);

    // Clean up existing test tenants if any
    await prisma.tenantBilling.deleteMany({
        where: { tenantId: { in: ['99999999-9999-4999-9999-111111111111', '99999999-9999-4999-9999-222222222222'] } }
    });
    await prisma.tenantWalletTransaction.deleteMany({
        where: { tenantId: { in: ['99999999-9999-4999-9999-111111111111', '99999999-9999-4999-9999-222222222222'] } }
    });
    await prisma.paymentHistory.deleteMany({
        where: { tenantId: { in: ['99999999-9999-4999-9999-111111111111', '99999999-9999-4999-9999-222222222222'] } }
    });
    await prisma.tenant.deleteMany({
        where: { id: { in: ['99999999-9999-4999-9999-111111111111', '99999999-9999-4999-9999-222222222222'] } }
    });

    // 3. Setup Test Tenants
    console.log('🏢 Creating test tenants...');
    // Tenant A: WITH reseller
    const tenantA = await prisma.tenant.create({
        data: {
            id: '99999999-9999-4999-9999-111111111111',
            name: 'Test Tenant With Reseller',
            schemaName: 'tenant_comm_a',
            resellerId: testReseller.id,
            walletBalance: 1000.00,
            status: 'active',
            subscriptionPlan: 'pro'
        }
    });
    await prisma.tenantBilling.create({
        data: {
            tenantId: tenantA.id,
            planCode: 'pro',
            monthlyRecurringTotal: 100.00,
            yearlyPrepayTotal: 1000.00,
            paymentCurrent: true
        }
    });

    // Tenant B: WITHOUT reseller
    const tenantB = await prisma.tenant.create({
        data: {
            id: '99999999-9999-4999-9999-222222222222',
            name: 'Test Tenant No Reseller',
            schemaName: 'tenant_comm_b',
            resellerId: null,
            walletBalance: 1000.00,
            status: 'active',
            subscriptionPlan: 'pro'
        }
    });
    await prisma.tenantBilling.create({
        data: {
            tenantId: tenantB.id,
            planCode: 'pro',
            monthlyRecurringTotal: 100.00,
            yearlyPrepayTotal: 1000.00,
            paymentCurrent: true
        }
    });

    // Ensure system settings setup rates/monthly rates
    let settings = await prisma.systemSetting.findFirst();
    if (!settings) {
        settings = await prisma.systemSetting.create({
            data: {
                resellerMonthlyRate: 50.00,
                resellerSetupRate: 75.00,
                annualDiscountRate: 15.00
            }
        });
    }

    // Upsert subscription plan 'pro'
    await prisma.subscriptionPlan.upsert({
        where: { code: 'pro' },
        update: { monthlyFee: 50.00, setupFee: 100.00 },
        create: { code: 'pro', name: 'Pro Plan', monthlyFee: 50.00, setupFee: 100.00 }
    });

    console.log('Setup finished successfully!');

    // ----------------------------------------------------
    // TEST CASE 1: Wallet Charge (processTenantWalletCharge)
    // ----------------------------------------------------
    console.log('\n--- TEST CASE 1: processTenantWalletCharge ---');
    
    // Get baseline balances
    const getResellerBal = async () => Number((await prisma.saasAdmin.findUnique({ where: { id: testReseller.id } }))?.walletBalance || 0);
    const getSuperBal = async () => Number((await prisma.saasAdmin.findUnique({ where: { id: firstSuperAdminId } }))?.walletBalance || 0);

    const baseRes1 = await getResellerBal();
    const baseSup1 = await getSuperBal();

    // Charge Tenant A (With reseller)
    console.log('Charging Tenant A (with reseller)...');
    await processTenantWalletCharge(tenantA.id, 100.00, 'plan_charge', 'Test Plan Charge');
    
    const deltaRes1 = (await getResellerBal()) - baseRes1;
    const deltaSup1 = (await getSuperBal()) - baseSup1;
    console.log(`Reseller balance change: +${deltaRes1} EUR (Expected: +50.00 EUR)`);
    console.log(`Super Admin balance change: +${deltaSup1} EUR (Expected: +0.00 EUR)`);
    if (deltaRes1 === 50 && deltaSup1 === 0) {
        console.log('✅ Test 1.1 (Wallet Charge with Reseller) passed!');
    } else {
        console.log('❌ Test 1.1 (Wallet Charge with Reseller) failed!');
    }

    const baseRes2 = await getResellerBal();
    const baseSup2 = await getSuperBal();

    // Charge Tenant B (No reseller)
    console.log('Charging Tenant B (no reseller)...');
    await processTenantWalletCharge(tenantB.id, 100.00, 'plan_charge', 'Test Plan Charge B');
    
    const deltaRes2 = (await getResellerBal()) - baseRes2;
    const deltaSup2 = (await getSuperBal()) - baseSup2;
    console.log(`Reseller balance change: +${deltaRes2} EUR (Expected: +0.00 EUR)`);
    console.log(`Super Admin balance change: +${deltaSup2} EUR (Expected: +50.00 EUR)`);
    if (deltaRes2 === 0 && deltaSup2 === 50) {
        console.log('✅ Test 1.2 (Wallet Charge no Reseller) passed!');
    } else {
        console.log('❌ Test 1.2 (Wallet Charge no Reseller) failed!');
    }

    // ----------------------------------------------------
    // TEST CASE 2: Bulk Plan Purchase (purchaseBulkPlanForTenant)
    // ----------------------------------------------------
    console.log('\n--- TEST CASE 2: purchaseBulkPlanForTenant ---');
    
    await prisma.tenant.update({ where: { id: tenantA.id }, data: { walletBalance: 1000.00 } });
    await prisma.tenant.update({ where: { id: tenantB.id }, data: { walletBalance: 1000.00 } });

    const baseRes3 = await getResellerBal();
    const baseSup3 = await getSuperBal();

    console.log('Purchasing bulk plan (6 months) for Tenant A (with reseller)...');
    // Total cost = 50 * 6 = 300 EUR. Reseller commission = 50% = 150 EUR.
    await purchaseBulkPlanForTenant(tenantA.id, 'pro', 6);
    
    const deltaRes3 = (await getResellerBal()) - baseRes3;
    const deltaSup3 = (await getSuperBal()) - baseSup3;
    console.log(`Reseller balance change: +${deltaRes3} EUR (Expected: +150.00 EUR)`);
    console.log(`Super Admin balance change: +${deltaSup3} EUR (Expected: +0.00 EUR)`);
    if (deltaRes3 === 150 && deltaSup3 === 0) {
        console.log('✅ Test 2.1 (Bulk Plan with Reseller) passed!');
    } else {
        console.log('❌ Test 2.1 (Bulk Plan with Reseller) failed!');
    }

    const baseRes4 = await getResellerBal();
    const baseSup4 = await getSuperBal();

    console.log('Purchasing bulk plan (6 months) for Tenant B (no reseller)...');
    await purchaseBulkPlanForTenant(tenantB.id, 'pro', 6);
    
    const deltaRes4 = (await getResellerBal()) - baseRes4;
    const deltaSup4 = (await getSuperBal()) - baseSup4;
    console.log(`Reseller balance change: +${deltaRes4} EUR (Expected: +0.00 EUR)`);
    console.log(`Super Admin balance change: +${deltaSup4} EUR (Expected: +150.00 EUR)`);
    if (deltaRes4 === 0 && deltaSup4 === 150) {
        console.log('✅ Test 2.2 (Bulk Plan no Reseller) passed!');
    } else {
        console.log('❌ Test 2.2 (Bulk Plan no Reseller) failed!');
    }

    // ----------------------------------------------------
    // TEST CASE 3: Bank Transfer Approval (updatePaymentStatus)
    // ----------------------------------------------------
    console.log('\n--- TEST CASE 3: updatePaymentStatus (Bank Transfer) ---');

    // Setup Tenant A settings & pending payment
    const settingsA = {
        pending_bank_transfer: true,
        reseller_commission_amount: 80.00,
        reseller_commission_breakdown: { setupCorporate: 0, addonModules: 0, recurring: 80.00, billingCycle: 'monthly' }
    };
    await prisma.tenant.update({
        where: { id: tenantA.id },
        data: { settings: settingsA }
    });

    const paymentA = await prisma.paymentHistory.create({
        data: {
            tenantId: tenantA.id,
            amount: 200.00,
            currency: 'EUR',
            paymentType: 'subscription',
            paymentMethod: 'bank_transfer',
            status: 'pending',
            description: 'Havale bekleniyor - Test'
        }
    });

    const baseRes5 = await getResellerBal();
    const baseSup5 = await getSuperBal();

    // Mock Express Request & Response for updatePaymentStatus
    console.log('Approving Bank Transfer for Tenant A (with reseller)...');
    let responseStatus = 200;
    let responseJson: any = null;
    const reqMockA = {
        params: { id: String(paymentA.id) },
        body: { status: 'paid' },
        ip: '127.0.0.1',
        socket: { remoteAddress: '127.0.0.1' },
        user: { role: 'super_admin', userId: firstSuperAdminId, username: firstSuperAdmin.username }
    } as any;
    const resMockA = {
        status: (s: number) => { responseStatus = s; return resMockA; },
        json: (j: any) => { responseJson = j; return resMockA; }
    } as any;

    await updatePaymentStatus(reqMockA, resMockA);
    
    const deltaRes5 = (await getResellerBal()) - baseRes5;
    const deltaSup5 = (await getSuperBal()) - baseSup5;
    console.log(`Reseller balance change: +${deltaRes5} EUR (Expected: +80.00 EUR)`);
    console.log(`Super Admin balance change: +${deltaSup5} EUR (Expected: +0.00 EUR)`);
    if (deltaRes5 === 80 && deltaSup5 === 0) {
        console.log('✅ Test 3.1 (Bank Transfer with Reseller) passed!');
    } else {
        console.log('❌ Test 3.1 (Bank Transfer with Reseller) failed!');
    }

    // Setup Tenant B settings & pending payment (No reseller)
    const settingsB = {
        pending_bank_transfer: true,
        reseller_commission_amount: 80.00,
        reseller_commission_breakdown: { setupCorporate: 0, addonModules: 0, recurring: 80.00, billingCycle: 'monthly' }
    };
    await prisma.tenant.update({
        where: { id: tenantB.id },
        data: { settings: settingsB }
    });

    const paymentB = await prisma.paymentHistory.create({
        data: {
            tenantId: tenantB.id,
            amount: 200.00,
            currency: 'EUR',
            paymentType: 'subscription',
            paymentMethod: 'bank_transfer',
            status: 'pending',
            description: 'Havale bekleniyor - Test B'
        }
    });

    const baseRes6 = await getResellerBal();
    const baseSup6 = await getSuperBal();

    console.log('Approving Bank Transfer for Tenant B (no reseller)...');
    const reqMockB = {
        params: { id: String(paymentB.id) },
        body: { status: 'paid' },
        ip: '127.0.0.1',
        socket: { remoteAddress: '127.0.0.1' },
        user: { role: 'super_admin', userId: firstSuperAdminId, username: firstSuperAdmin.username }
    } as any;
    const resMockB = {
        status: (s: number) => { responseStatus = s; return resMockB; },
        json: (j: any) => { responseJson = j; return resMockB; }
    } as any;

    await updatePaymentStatus(reqMockB, resMockB);
    
    const deltaRes6 = (await getResellerBal()) - baseRes6;
    const deltaSup6 = (await getSuperBal()) - baseSup6;
    console.log(`Reseller balance change: +${deltaRes6} EUR (Expected: +0.00 EUR)`);
    console.log(`Super Admin balance change: +${deltaSup6} EUR (Expected: +80.00 EUR)`);
    if (deltaRes6 === 0 && deltaSup6 === 80) {
        console.log('✅ Test 3.2 (Bank Transfer no Reseller) passed!');
    } else {
        console.log('❌ Test 3.2 (Bank Transfer no Reseller) failed!');
    }

    // 4. Cleanup
    console.log('\n🧹 Cleaning up test entities...');
    await prisma.tenantBilling.deleteMany({
        where: { tenantId: { in: [tenantA.id, tenantB.id] } }
    });
    await prisma.tenantWalletTransaction.deleteMany({
        where: { tenantId: { in: [tenantA.id, tenantB.id] } }
    });
    await prisma.paymentHistory.deleteMany({
        where: { tenantId: { in: [tenantA.id, tenantB.id] } }
    });
    await prisma.tenant.deleteMany({
        where: { id: { in: [tenantA.id, tenantB.id] } }
    });
    await prisma.saasAdmin.deleteMany({
        where: { id: { in: [testReseller.id] } }
    });
    console.log('🧹 Cleanup complete!');
}

main()
    .catch((e) => {
        console.error('Test execution failed with error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
