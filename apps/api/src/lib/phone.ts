/**
 * Telefon numarasını E.164 standart formatına getirir (+[Ülke][Alan Kodu][Numara]).
 * Desteklenen ülkeler: Türkiye (90), Almanya (49).
 */
export function normalizePhone(number: string, countryCode: string, areaCode?: string): string {
    if (!number) return '';
    const trimmed = number.trim();
    const startsWithZeroOrPlus = trimmed.startsWith('0') || trimmed.startsWith('+');
    let clean = number.replace(/\D/g, ''); // Sadece rakamları ayıkla
    
    // Uluslararası "00" ön ekini temizle
    if (clean.startsWith('00')) {
        clean = clean.slice(2);
    }
    
    const cleanCC = countryCode.replace(/\D/g, '');
    const cleanAC = areaCode ? areaCode.replace(/\D/g, '') : '';
    
    // Türkiye (90) kuralları
    if (cleanCC === '90') {
        if (clean.startsWith('90') && clean.length >= 12) {
            return `+${clean}`;
        }
        if (clean.startsWith('0')) {
            clean = clean.slice(1);
        }
        if (clean.length === 10) {
            return `+90${clean}`;
        }
        if (clean.length === 7 && cleanAC) {
            return `+90${cleanAC}${clean}`;
        }
        // Eğer 10 haneden kısa ama 7 haneden uzunsa ve 90 ile başlamıyorsa, başına 90 ekleyelim
        if (clean.length > 7 && !clean.startsWith('90')) {
            return `+90${clean}`;
        }
    }
    
    // Almanya (49) kuralları
    if (cleanCC === '49') {
        if (clean.startsWith('49') && clean.length >= 10) {
            return `+${clean}`;
        }
        if (clean.startsWith('0')) {
            clean = clean.slice(1);
        }
        // Kısa yerel numara ise alan kodu ekle (Almanya'da yerel numaralar genellikle 3-8 hane arasıdır)
        // Eğer numara baştan 0, 00 veya + ile başlıyorsa, alan kodu veya ülke kodu zaten girilmiştir.
        if (clean.length <= 8 && cleanAC && !startsWithZeroOrPlus) {
            return `+49${cleanAC}${clean}`;
        }
        return `+49${clean}`;
    }
    
    // Diğer ülkeler için genel eşleştirme
    if (clean.startsWith(cleanCC)) {
        return `+${clean}`;
    }
    
    return `+${cleanCC}${clean}`;
}
