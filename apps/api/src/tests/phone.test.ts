import assert from 'node:assert';
import { normalizePhone } from '../lib/phone.js';

console.log('🧪 Running normalisation tests for phone.ts...\n');

const testCases = [
    // --- Türkiye (90) Testleri ---
    {
        num: '0532 123 45 67',
        cc: '90',
        ac: '',
        expected: '+905321234567',
        desc: 'TR Mobil (Sıfır ile)'
    },
    {
        num: '532 123 45 67',
        cc: '90',
        ac: '',
        expected: '+905321234567',
        desc: 'TR Mobil (Sıfırsız)'
    },
    {
        num: '+90 532 123 45 67',
        cc: '90',
        ac: '',
        expected: '+905321234567',
        desc: 'TR Mobil (Zaten E.164)'
    },
    {
        num: '905321234567',
        cc: '90',
        ac: '',
        expected: '+905321234567',
        desc: 'TR Mobil (Artısız E.164)'
    },
    {
        num: '0212 123 45 67',
        cc: '90',
        ac: '212',
        expected: '+902121234567',
        desc: 'TR Sabit (Alan kodu ile)'
    },
    {
        num: '123 45 67',
        cc: '90',
        ac: '212',
        expected: '+902121234567',
        desc: 'TR Sabit Yerel (Varsayılan alan kodlu)'
    },
    {
        num: '00905321234567',
        cc: '90',
        ac: '',
        expected: '+905321234567',
        desc: 'TR Mobil (00 ön ekli)'
    },

    // --- Almanya (49) Testleri ---
    {
        num: '0176 12345678',
        cc: '49',
        ac: '',
        expected: '+4917612345678',
        desc: 'DE Mobil (Sıfır ile)'
    },
    {
        num: '030 123456',
        cc: '49',
        ac: '30',
        expected: '+4930123456',
        desc: 'DE Sabit (Sıfır ile)'
    },
    {
        num: '123456',
        cc: '49',
        ac: '30',
        expected: '+4930123456',
        desc: 'DE Sabit Yerel (Varsayılan alan kodlu)'
    },
    {
        num: '+49 176 12345678',
        cc: '49',
        ac: '',
        expected: '+4917612345678',
        desc: 'DE Mobil (Zaten E.164)'
    },
    {
        num: '4917612345678',
        cc: '49',
        ac: '',
        expected: '+4917612345678',
        desc: 'DE Mobil (Artısız E.164)'
    },
    {
        num: '004917612345678',
        cc: '49',
        ac: '',
        expected: '+4917612345678',
        desc: 'DE Mobil (00 ön ekli)'
    }
];

let failed = 0;

testCases.forEach((tc, idx) => {
    try {
        const result = normalizePhone(tc.num, tc.cc, tc.ac);
        assert.strictEqual(result, tc.expected);
        console.log(`✅ [TEST ${idx + 1}] Passed: ${tc.desc} (${tc.num} -> ${result})`);
    } catch (err) {
        failed++;
        console.error(`❌ [TEST ${idx + 1}] Failed: ${tc.desc}`);
        console.error(`   Input: ${tc.num} (CC: ${tc.cc}, AC: ${tc.ac})`);
        console.error(`   Expected: ${tc.expected}`);
        console.error(`   Got:      ${normalizePhone(tc.num, tc.cc, tc.ac)}`);
    }
});

console.log(`\n📊 Sonuç: ${testCases.length - failed} başarılı, ${failed} başarısız.`);
if (failed > 0) {
    process.exit(1);
} else {
    console.log('🎉 Tüm normalizasyon testleri başarıyla tamamlandı!');
    process.exit(0);
}
