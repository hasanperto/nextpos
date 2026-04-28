/** Masa tablet kiosk menü — QR müşteri akışı (tr / en / de) */

export type KioskLang = 'tr' | 'en' | 'de';

export type KioskMessages = {
    metaTitle: string;
    idleTagline: string;
    idleChooseLang: string;
    idleOpenMenu: string;
    idleQrHint: string;
    loginTitle: string;
    loginSubtitle: string;
    tableBadge: string;
    tabQr: string;
    tabPhone: string;
    tabGuest: string;
    qrScanTitle: string;
    qrScanSub: string;
    or: string;
    demoQr: string;
    phoneLabel: string;
    phonePlaceholder: string;
    phoneContinue: string;
    demoPhone: string;
    guestNameLabel: string;
    guestNamePlaceholder: string;
    guestCountLabel: string;
    guestContinue: string;
    back: string;
    exit: string;
    /** Üst menü — açılır panel tetikleyici (erişilebilirlik) */
    headerOptionsMenu: string;
    /** Çıkış butonu — oturumu kapat açıklaması */
    exitSessionTitle: string;
    menuBrand: string;
    cartTitle: string;
    cartEmpty: string;
    subtotal: string;
    taxLine: string;
    total: string;
    orderBtn: string;
    /** Sepet ana CTA — sipariş garsona gider */
    sendToWaiterBtn: string;
    /** Alt sabit menü — kısa etiket */
    bottomCallWaiter: string;
    bottomClean: string;
    srvWaiter: string;
    srvBill: string;
    srvWater: string;
    srvClear: string;
    categoryAll: string;
    suggested: string;
    /** Şerit: tanınmış müşteri — son sipariş ürünleri */
    ribbonRecentOrders: string;
    /** Şerit: misafir / yedek — çok satanlar */
    ribbonPopular: string;
    addToCart: string;
    quickAdd: string;
    customize: string;
    unavailable: string;
    confTitle: string;
    confSub: string;
    confCancel: string;
    confOk: string;
    succTitle: string;
    succSub: string;
    guestNameShort: string;
    notePlaceholder: string;
    orderStatusPrefix: string;
    loading: string;
    invalidQr: string;
    invalidQrHelp: string;
    addedToast: string;
    serviceSent: string;
    /** Garson çağrısını hedef garson üstlendiğinde */
    waiterOnWayToast: string;
    networkError: string;
    orderFailed: string;
    extras: string;
    qty: string;
    sizeSelect: string;
    confirmAdd: string;
    newBadge: string;
    popularBadge: string;
    /** Kurum sihirbazı */
    wizardTitle: string;
    wizardSubtitle: string;
    licenseLabel: string;
    licenseHint: string;
    tableIdLabel: string;
    tableIdHint: string;
    pairingLabel: string;
    pairingHint: string;
    wizardSave: string;
    wizardSaving: string;
    wizardErrGeneric: string;
    wizardErrNetwork: string;
    /** Ayarlar → PIN → bağlantı kaldır */
    settings: string;
    settingsModalTitle: string;
    settingsModalHint: string;
    adminPinLabel: string;
    settingsResetBtn: string;
    settingsCancel: string;
    settingsPinError: string;
    settingsPinWrong: string;
    settingsPinBusy: string;
    settingsResetOk: string;
    /** Idle timeout mesajı */
    idleTimeout: string;
    /** Sipariş hazır etiketi */
    orderReadyLabel: string;
};

const tr: KioskMessages = {
    metaTitle: 'Masa Menüsü',
    idleTagline: 'Dijital menüye hoş geldiniz',
    idleChooseLang: 'Dil seçin',
    idleOpenMenu: 'Menüyü aç →',
    idleQrHint: 'Hızlı erişim için QR kodu okutun',
    loginTitle: 'Giriş veya devam',
    loginSubtitle: 'Misafir veya üye',
    tableBadge: 'Masa',
    tabQr: 'QR Kod',
    tabPhone: 'Telefon',
    tabGuest: 'Misafir',
    qrScanTitle: 'Üyelik QR kodunu okutun',
    qrScanSub: 'Kamera izni istenebilir',
    or: 'veya',
    demoQr: 'Demo: QR tanındı',
    phoneLabel: 'Cep telefonu',
    phonePlaceholder: '+90 5xx xxx xx xx',
    phoneContinue: 'Devam',
    demoPhone: 'Demo: numara ile devam',
    guestNameLabel: 'İsim (isteğe bağlı)',
    guestNamePlaceholder: 'örn. Ahmet',
    guestCountLabel: 'Kişi sayısı',
    guestContinue: 'Misafir olarak devam',
    back: '← Geri',
    exit: 'Çıkış',
    headerOptionsMenu: 'Dil ve ayarlar',
    exitSessionTitle: 'Oturumu kapat — karşılama ekranına dön',
    menuBrand: 'Menü',
    cartTitle: 'Sepet',
    cartEmpty: 'Sepetiniz boş',
    subtotal: 'Ara toplam',
    taxLine: 'KDV %10',
    total: 'Toplam',
    orderBtn: 'Sipariş ver',
    sendToWaiterBtn: 'Garsona gönder',
    bottomCallWaiter: 'Garson çağır',
    bottomClean: 'Temizle',
    srvWaiter: 'Garson',
    srvBill: 'Hesap',
    srvWater: 'Su',
    srvClear: 'Topla',
    categoryAll: 'Tümü',
    suggested: 'Önerilen',
    ribbonRecentOrders: 'Son siparişleriniz',
    ribbonPopular: 'Çok satanlar',
    addToCart: 'Sepete ekle',
    quickAdd: 'Hızlı ekle',
    customize: 'Seçenekler',
    unavailable: 'Tükendi',
    confTitle: 'Siparişi onaylıyor musunuz?',
    confSub: 'Sipariş garsona iletilecek.',
    confCancel: 'İptal',
    confOk: 'Onayla',
    succTitle: 'Sipariş alındı!',
    succSub: 'En kısa sürede hazırlanacak.',
    guestNameShort: 'İsim',
    notePlaceholder: 'Not (alerjen vb.)',
    orderStatusPrefix: 'Durum:',
    loading: 'Yükleniyor…',
    invalidQr: 'Geçersiz veya eksik bağlantı',
    invalidQrHelp: 'Lütfen masadaki QR kodunu kullanın veya personelden yardım isteyin.',
    addedToast: 'Sepete eklendi',
    serviceSent: 'Talebiniz iletildi',
    waiterOnWayToast: 'Bir garson birazdan sizinle ilgilenecek.',
    networkError: 'Bağlantı hatası',
    orderFailed: 'Sipariş gönderilemedi',
    extras: 'Ekstralar',
    qty: 'Adet',
    sizeSelect: 'Boyut',
    confirmAdd: 'Sepete onayla',
    newBadge: 'Yeni',
    popularBadge: 'Popüler',
    wizardTitle: 'Bağlantı',
    wizardSubtitle: 'Lisans numarası ve bu cihazın masasını girin.',
    licenseLabel: 'Lisans numarası',
    licenseHint: 'Kiracı kimliği (UUID) veya özel lisans anahtarı',
    tableIdLabel: 'Masa adı veya QR kodu',
    tableIdHint: 'Masa adı veya masanın QR kodu',
    pairingLabel: 'Eşleştirme kodu (isteğe bağlı)',
    pairingHint: 'Tanımlıysa girin',
    wizardSave: 'Kaydet ve menüye geç',
    wizardSaving: 'Doğrulanıyor…',
    wizardErrGeneric: 'Bilgiler doğrulanamadı',
    wizardErrNetwork: 'Sunucuya ulaşılamadı',
    settings: 'Ayarlar',
    settingsModalTitle: 'Yönetici doğrulaması',
    settingsModalHint: 'Bu cihazın masayla bağlantısını kaldırmak için yönetici PIN kodunu girin.',
    adminPinLabel: 'Yönetici PIN (6 hane)',
    settingsResetBtn: 'Bağlantıyı kaldır',
    settingsCancel: 'Vazgeç',
    settingsPinError: '6 haneli PIN girin',
    settingsPinWrong: 'PIN hatalı',
    settingsPinBusy: 'Kontrol ediliyor…',
    settingsResetOk: 'Bağlantı kaldırıldı',
    idleTimeout: 'Oturum zaman aşımına uğradı',
    orderReadyLabel: 'HAZIR',
};

const en: KioskMessages = {
    metaTitle: 'Table menu',
    idleTagline: 'Welcome to the digital menu',
    idleChooseLang: 'Choose language',
    idleOpenMenu: 'Open menu →',
    idleQrHint: 'Scan QR code for quick access',
    loginTitle: 'Sign in or continue',
    loginSubtitle: 'Guest or member',
    tableBadge: 'Table',
    tabQr: 'QR code',
    tabPhone: 'Phone',
    tabGuest: 'Guest',
    qrScanTitle: 'Scan membership QR',
    qrScanSub: 'Camera permission may be required',
    or: 'or',
    demoQr: 'Demo: QR recognized',
    phoneLabel: 'Mobile number',
    phonePlaceholder: '+1 …',
    phoneContinue: 'Continue',
    demoPhone: 'Demo: continue with number',
    guestNameLabel: 'First name (optional)',
    guestNamePlaceholder: 'e.g. John',
    guestCountLabel: 'Guests',
    guestContinue: 'Continue as guest',
    back: '← Back',
    exit: 'Exit',
    headerOptionsMenu: 'Language & settings',
    exitSessionTitle: 'End session — return to welcome screen',
    menuBrand: 'Menu',
    cartTitle: 'Cart',
    cartEmpty: 'Your cart is empty',
    subtotal: 'Subtotal',
    taxLine: 'VAT 10%',
    total: 'Total',
    orderBtn: 'Place order',
    sendToWaiterBtn: 'Send to waiter',
    bottomCallWaiter: 'Call waiter',
    bottomClean: 'Clear table',
    srvWaiter: 'Waiter',
    srvBill: 'Bill',
    srvWater: 'Water',
    srvClear: 'Clear table',
    categoryAll: 'All',
    suggested: 'Suggested',
    ribbonRecentOrders: 'Your recent orders',
    ribbonPopular: 'Popular picks',
    addToCart: 'Add to cart',
    quickAdd: 'Quick add',
    customize: 'Options',
    unavailable: 'Unavailable',
    confTitle: 'Confirm your order?',
    confSub: 'It will be sent to the waiter.',
    confCancel: 'Cancel',
    confOk: 'Confirm',
    succTitle: 'Order placed!',
    succSub: 'We will prepare it shortly.',
    guestNameShort: 'Name',
    notePlaceholder: 'Note (allergies, etc.)',
    orderStatusPrefix: 'Status:',
    loading: 'Loading…',
    invalidQr: 'Invalid or missing link',
    invalidQrHelp: 'Please use the QR on your table or ask staff for help.',
    addedToast: 'Added to cart',
    serviceSent: 'Request sent',
    waiterOnWayToast: 'A server will be with you shortly.',
    networkError: 'Network error',
    orderFailed: 'Could not place order',
    extras: 'Extras',
    qty: 'Qty',
    sizeSelect: 'Size',
    confirmAdd: 'Add to cart',
    newBadge: 'New',
    popularBadge: 'Popular',
    wizardTitle: 'Connection',
    wizardSubtitle: 'Enter license and table for this device.',
    licenseLabel: 'License / tenant ID',
    licenseHint: 'Tenant UUID or special license key',
    tableIdLabel: 'Table name or QR code',
    tableIdHint: 'Table name or QR value',
    pairingLabel: 'Pairing code (optional)',
    pairingHint: 'If set in Admin → Kiosk',
    wizardSave: 'Save and open menu',
    wizardSaving: 'Verifying…',
    wizardErrGeneric: 'Could not verify',
    wizardErrNetwork: 'Network error',
    settings: 'Settings',
    settingsModalTitle: 'Admin verification',
    settingsModalHint: 'Enter the admin PIN to remove this device’s table link.',
    adminPinLabel: 'Admin PIN (6 digits)',
    settingsResetBtn: 'Remove link',
    settingsCancel: 'Cancel',
    settingsPinError: 'Enter a 6-digit PIN',
    settingsPinWrong: 'Wrong PIN',
    settingsPinBusy: 'Checking…',
    settingsResetOk: 'Link removed',
    idleTimeout: 'Session timed out',
    orderReadyLabel: 'READY',
};

const de: KioskMessages = {
    metaTitle: 'Tischmenü',
    idleTagline: 'Willkommen beim digitalen Menü',
    idleChooseLang: 'Sprache wählen',
    idleOpenMenu: 'Menü öffnen →',
    idleQrHint: 'QR scannen für direkten Zugang',
    loginTitle: 'Anmelden oder fortfahren',
    loginSubtitle: 'Gast oder Mitglied',
    tableBadge: 'Tisch',
    tabQr: 'QR-Code',
    tabPhone: 'Nummer',
    tabGuest: 'Gast',
    qrScanTitle: 'Mitglieds-QR scannen',
    qrScanSub: 'Kamera kann angefordert werden',
    or: 'oder',
    demoQr: 'Demo: QR erkannt',
    phoneLabel: 'Handynummer',
    phonePlaceholder: '+49 …',
    phoneContinue: 'Weiter',
    demoPhone: 'Demo: mit Nummer fortfahren',
    guestNameLabel: 'Vorname (optional)',
    guestNamePlaceholder: 'z. B. Thomas',
    guestCountLabel: 'Personen',
    guestContinue: 'Als Gast fortfahren',
    back: '← Zurück',
    exit: 'Beenden',
    headerOptionsMenu: 'Sprache & Einstellungen',
    exitSessionTitle: 'Sitzung beenden — zur Begrüßung',
    menuBrand: 'Menü',
    cartTitle: 'Warenkorb',
    cartEmpty: 'Warenkorb ist leer',
    subtotal: 'Zwischensumme',
    taxLine: 'MwSt. 19%',
    total: 'Gesamt',
    orderBtn: 'Bestellen',
    sendToWaiterBtn: 'An Kellner senden',
    bottomCallWaiter: 'Kellner rufen',
    bottomClean: 'Abräumen',
    srvWaiter: 'Kellner',
    srvBill: 'Rechnung',
    srvWater: 'Wasser',
    srvClear: 'Abräumen',
    categoryAll: 'Alle',
    suggested: 'Empfohlen',
    ribbonRecentOrders: 'Ihre letzten Bestellungen',
    ribbonPopular: 'Beliebte Artikel',
    addToCart: 'In den Warenkorb',
    quickAdd: 'Schnell',
    customize: 'Optionen',
    unavailable: 'Ausverkauft',
    confTitle: 'Bestellung bestätigen?',
    confSub: 'Wird an den Kellner gesendet.',
    confCancel: 'Abbrechen',
    confOk: 'Bestätigen',
    succTitle: 'Bestellung aufgegeben!',
    succSub: 'Bitte kurz warten.',
    guestNameShort: 'Name',
    notePlaceholder: 'Notiz (Allergene …)',
    orderStatusPrefix: 'Status:',
    loading: 'Lädt…',
    invalidQr: 'Ungültiger Link',
    invalidQrHelp: 'Bitte den QR am Tisch nutzen oder Personal fragen.',
    addedToast: 'Hinzugefügt',
    serviceSent: 'Anfrage gesendet',
    waiterOnWayToast: 'Ein Kellner kümmert sich gleich um Sie.',
    networkError: 'Netzwerkfehler',
    orderFailed: 'Bestellung fehlgeschlagen',
    extras: 'Extras',
    qty: 'Menge',
    sizeSelect: 'Größe',
    confirmAdd: 'In den Warenkorb',
    newBadge: 'Neu',
    popularBadge: 'Beliebt',
    wizardTitle: 'Verknüpfung',
    wizardSubtitle: 'Lizenz und Tisch für dieses Gerät eingeben.',
    licenseLabel: 'Lizenz / Mandanten-ID',
    licenseHint: 'UUID oder Speziallizenz',
    tableIdLabel: 'Tischname oder QR-Code',
    tableIdHint: 'Tischname oder QR-Wert',
    pairingLabel: 'Kopplungscode (optional)',
    pairingHint: 'Falls unter Admin → Kiosk gesetzt',
    wizardSave: 'Speichern und Menü öffnen',
    wizardSaving: 'Prüfung…',
    wizardErrGeneric: 'Verifizierung fehlgeschlagen',
    wizardErrNetwork: 'Netzwerkfehler',
    settings: 'Einstellungen',
    settingsModalTitle: 'Admin-Prüfung',
    settingsModalHint: 'Geben Sie die Admin-PIN ein, um die Tisch-Verknüpfung zu entfernen.',
    adminPinLabel: 'Admin-PIN (6 Ziffern)',
    settingsResetBtn: 'Verknüpfung entfernen',
    settingsCancel: 'Abbrechen',
    settingsPinError: '6-stellige PIN eingeben',
    settingsPinWrong: 'Falsche PIN',
    settingsPinBusy: 'Wird geprüft…',
    settingsResetOk: 'Verknüpfung entfernt',
    idleTimeout: 'Sitzung abgelaufen',
    orderReadyLabel: 'FERTIG',
};

export const kioskMenuMessages: Record<KioskLang, KioskMessages> = { tr, en, de };

export function getKioskT(lang: string): KioskMessages {
    const k = (['tr', 'en', 'de'] as const).includes(lang as KioskLang) ? (lang as KioskLang) : 'tr';
    return kioskMenuMessages[k];
}
