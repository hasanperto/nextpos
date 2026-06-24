/**
 * NextPOS Premium Notification System
 * Web Audio API ile 3D sentetik sesler + titreşim + görsel efekt
 * Harici CDN bağımlılığı YOK — tüm sesler matematiksel dalga formları ile üretilir
 */

/* ═══════════ AudioContext Singleton ═══════════ */

let _ctx: AudioContext | null = null;

function getAudioContext(): AudioContext {
    if (!_ctx || _ctx.state === 'closed') {
        _ctx = new AudioContext();
    }
    return _ctx;
}

/** Tarayıcı autoplay kısıtını çözmek için ilk kullanıcı etkileşiminde çağrılır */
export async function primeNotificationAudio(): Promise<boolean> {
    try {
        const ctx = getAudioContext();
        if (ctx.state === 'suspended') await ctx.resume();
        // Sessiz bir oscillator başlatıp durdur — iOS/Safari unlock
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0;
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.01);
        return true;
    } catch {
        return false;
    }
}

/* ═══════════ Ses Üretim Yardımcıları ═══════════ */

type OscType = OscillatorType;

interface ToneConfig {
    freq: number;
    type: OscType;
    startTime: number;
    duration: number;
    gain: number;
    /** Fade-out süresi (saniye) */
    decay?: number;
}

function playTones(tones: ToneConfig[]): void {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') void ctx.resume();

    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.6;
    masterGain.connect(ctx.destination);

    for (const t of tones) {
        const osc = ctx.createOscillator();
        const env = ctx.createGain();

        osc.type = t.type;
        osc.frequency.value = t.freq;

        const start = ctx.currentTime + t.startTime;
        const end = start + t.duration;
        const decay = t.decay ?? t.duration * 0.3;

        env.gain.setValueAtTime(0, start);
        // Attack (10ms)
        env.gain.linearRampToValueAtTime(t.gain, start + 0.01);
        // Sustain
        env.gain.setValueAtTime(t.gain, end - decay);
        // Decay
        env.gain.exponentialRampToValueAtTime(0.001, end);

        osc.connect(env).connect(masterGain);
        osc.start(start);
        osc.stop(end + 0.05);
    }
}

/* ═══════════ Premium Ses Desenleri ═══════════ */

/** Yeni sipariş — Yükselen melodic arpej C5→E5→G5→C6 */
function playNewOrder(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    const tones: ToneConfig[] = notes.map((freq, i) => ({
        freq,
        type: 'sine' as OscType,
        startTime: i * 0.12,
        duration: 0.28,
        gain: 0.7 - i * 0.08,
        decay: 0.15,
    }));
    // İkinci tur (repeat) — daha yumuşak
    tones.push(...notes.map((freq, i) => ({
        freq,
        type: 'sine' as OscType,
        startTime: 0.7 + i * 0.12,
        duration: 0.22,
        gain: 0.45 - i * 0.06,
        decay: 0.12,
    })));
    playTones(tones);
}

/** Garson çağrısı — İki tonlu dikkat çekici ding-dong */
function playServiceCall(): void {
    playTones([
        { freq: 880, type: 'sine', startTime: 0, duration: 0.35, gain: 0.65, decay: 0.2 },
        { freq: 698.46, type: 'sine', startTime: 0.38, duration: 0.45, gain: 0.6, decay: 0.25 },
        // Üst harmonik katmanı
        { freq: 1760, type: 'sine', startTime: 0, duration: 0.2, gain: 0.15, decay: 0.12 },
        { freq: 1396.91, type: 'sine', startTime: 0.38, duration: 0.25, gain: 0.12, decay: 0.15 },
    ]);
}

/** Acil eskalasyon — Hızlı tekrarlı alarm deseni */
function playServiceCallUrgent(): void {
    const tones: ToneConfig[] = [];
    for (let i = 0; i < 5; i++) {
        tones.push(
            { freq: 1200, type: 'square', startTime: i * 0.25, duration: 0.1, gain: 0.35, decay: 0.05 },
            { freq: 900, type: 'square', startTime: i * 0.25 + 0.12, duration: 0.1, gain: 0.3, decay: 0.05 },
        );
    }
    playTones(tones);
}

/** Mutfaktan hazır — Yumuşak tek tonlu ping */
function playItemReady(): void {
    playTones([
        { freq: 1046.5, type: 'sine', startTime: 0, duration: 0.5, gain: 0.55, decay: 0.35 },
        // Üst harmonik parıltısı
        { freq: 2093, type: 'sine', startTime: 0.02, duration: 0.3, gain: 0.12, decay: 0.2 },
    ]);
}

/** İşlem başarılı — Kısa pozitif chime (G5→C6) */
function playSuccess(): void {
    playTones([
        { freq: 783.99, type: 'sine', startTime: 0, duration: 0.2, gain: 0.5, decay: 0.1 },
        { freq: 1046.5, type: 'sine', startTime: 0.15, duration: 0.35, gain: 0.55, decay: 0.2 },
    ]);
}

/** Hata — Düşük frekans buzzer */
function playError(): void {
    playTones([
        { freq: 220, type: 'sawtooth', startTime: 0, duration: 0.3, gain: 0.3, decay: 0.15 },
        { freq: 196, type: 'sawtooth', startTime: 0.35, duration: 0.4, gain: 0.25, decay: 0.2 },
    ]);
}

/* ═══════════ Public API ═══════════ */

export type NotificationType =
    | 'new_order'
    | 'item_ready'
    | 'service_call'
    | 'service_call_urgent'
    | 'error'
    | 'success';

const SYNTH_MAP: Record<NotificationType, () => void> = {
    new_order: playNewOrder,
    item_ready: playItemReady,
    service_call: playServiceCall,
    service_call_urgent: playServiceCallUrgent,
    error: playError,
    success: playSuccess,
};

/**
 * Premium 3D sentetik bildirim sesi çalar + mobilde titreşim tetikler.
 * @returns true = ses başarıyla çalındı
 */
export async function playNotification(type: NotificationType): Promise<boolean> {
    try {
        const ctx = getAudioContext();
        if (ctx.state === 'suspended') await ctx.resume();

        const fn = SYNTH_MAP[type];
        if (fn) fn();

        // Tactile feedback for mobile (Waiters)
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            if (type === 'service_call_urgent') {
                navigator.vibrate([300, 120, 300, 120, 300]);
            } else if (type === 'service_call' || type === 'new_order') {
                navigator.vibrate([200, 100, 200]);
            } else {
                navigator.vibrate(100);
            }
        }

        return true;
    } catch (err) {
        console.warn(`[Notification] Audio play failed: ${err}`);
        return false;
    }
}

/**
 * Visual feedback helper
 */
export function triggerVisualFlash(elementId: string = 'root') {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.classList.add('animate-flash-highlight');
    setTimeout(() => el.classList.remove('animate-flash-highlight'), 1000);
}
