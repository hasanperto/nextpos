import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

import { runAccountingCron } from '../src/services/billing.service.js';

async function addResellerSaleAndCommission() {
    try {
        console.log('Bayi (reseller) ve örnek restoran aranıyor...');
        
        // demo_reseller'ı bul
        const reseller = await prisma.saasAdmin.findFirst({
            where: { username: 'demo_reseller' }
        });

        if (!reseller) {
            console.error('demo_reseller bulunamadı!');
            process.exit(1);
        }

        // Örnek bir tenant (restoran) bul veya yoksa hata ver
        const tenant = await prisma.tenant.findFirst({
            where: { resellerId: reseller.id }
        });

        const tenantId = tenant ? tenant.id : null;
        const tenantName = tenant ? tenant.name : 'Yeni Örnek Restoran';

        console.log(`Bayi bulundu: ${reseller.username} (ID: ${reseller.id})`);
        if (tenantId) {
            console.log(`Restoran bulundu: ${tenantName} (ID: ${tenantId})`);
        } else {
            console.log('Bu bayiye ait restoran bulunamadı, komisyon anonim tenant olarak eklenecek.');
        }

        // Komisyon ve Satış tutarları
        const saleAmount = 1000.00; // Restorana yapılan toplam satış
        const commissionRate = Number(reseller.commissionRate || 15); // %15 varsayılan
        const commissionAmount = (saleAmount * commissionRate) / 100;

        console.log(`Satış Tutarı: €${saleAmount}`);
        console.log(`Komisyon Oranı: %${commissionRate}`);
        console.log(`Hesaplanan Komisyon: €${commissionAmount}`);

        await prisma.$transaction(async (tx) => {
            // Test için restoranın ödeme vadesini 5 gün sonraya çek
            if (tenantId) {
                const testDate = new Date();
                testDate.setDate(testDate.getDate() + 5);
                
                await tx.tenantBilling.update({
                    where: { tenantId: tenantId },
                    data: { nextPaymentDue: testDate }
                });
                console.log(`Restoranın sonraki ödeme tarihi ${testDate.toISOString().slice(0, 10)} olarak güncellendi (Test amaçlı 5 gün sonra).`);
            }

            // 1. Restoran için "Abonelik/Lisans" satışı ödemesini ekle (SaaS Admin tarafı için gelir)
            if (tenantId) {
                await tx.paymentHistory.create({
                    data: {
                        tenantId: tenantId,
                        saasAdminId: null, // Direkt restoranın ödemesi
                        amount: saleAmount,
                        currency: 'EUR',
                        paymentType: 'subscription', // Abonelik ödemesi
                        paymentMethod: 'credit_card',
                        status: 'paid',
                        paidAt: new Date(),
                        description: `${tenantName} - Yıllık Lisans Yenileme`,
                        invoice_number: `INV-${Date.now()}`
                    }
                });
            }

            // 2. Bayi için Komisyon ödemesini (Gelir/Income) ekle
            await tx.paymentHistory.create({
                data: {
                    tenantId: tenantId, // Hangi restorandan geldiği bilinsin
                    saasAdminId: reseller.id,
                    amount: commissionAmount,
                    currency: 'EUR',
                    paymentType: 'reseller_income', // Bayi komisyon geliri
                    paymentMethod: 'wallet_balance', // Cüzdana aktarılacak
                    status: 'paid',
                    paidAt: new Date(),
                    description: `${tenantName} satışı üzerinden %${commissionRate} komisyon (Aylık/Yıllık Döngü)`,
                    invoice_number: `COMM-${Date.now()}`
                }
            });

            // 3. Bayinin cüzdan bakiyesini (Wallet Balance) güncelle
            await tx.saasAdmin.update({
                where: { id: reseller.id },
                data: {
                    walletBalance: {
                        increment: commissionAmount
                    }
                }
            });
        });

        console.log('✅ Başarılı! Veritabanına satış, komisyon ve cüzdan bakiyesi işlendi.');
        
        console.log('⏳ Bekleyen faturaları (subscription) oluşturmak için runAccountingCron çalıştırılıyor...');
        await runAccountingCron();
        console.log('✅ Faturalar başarıyla oluşturuldu!');

    } catch (error) {
        console.error('Hata oluştu:', error);
    } finally {
        await prisma.$disconnect();
    }
}

addResellerSaleAndCommission();