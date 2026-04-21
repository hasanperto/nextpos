/**
 * NextPOS Unified Notification System
 * Handles Sound, Vibration, and Visual Cues.
 */

const SOUNDS = {
  // Reliable preview URLs from Mixkit (Public CDN)
  new_order: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3',
  item_ready: 'https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3',
  service_call: 'https://assets.mixkit.co/active_storage/sfx/951/951-preview.mp3',
  error: 'https://assets.mixkit.co/active_storage/sfx/2383/2383-preview.mp3',
  success: 'https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3',
};

export type NotificationType = keyof typeof SOUNDS;

/** Aynı URL için tek Audio örneği — tarayıcıda tekrarlı new Audio() autoplay’i daha güvenilir kılar */
const audioPool = new Map<string, HTMLAudioElement>();

function getPooledAudio(type: NotificationType): HTMLAudioElement {
  const url = SOUNDS[type];
  let a = audioPool.get(url);
  if (!a) {
    a = new Audio(url);
    a.preload = 'auto';
    audioPool.set(url, a);
  }
  return a;
}

/**
 * Plays a notification sound and triggers vibration if supported.
 * Handles browser autoplay restrictions by returning a boolean indicating success.
 */
export async function playNotification(type: NotificationType): Promise<boolean> {
  try {
    const audio = getPooledAudio(type);
    audio.currentTime = 0;
    await audio.play();
    
    // Tactile feedback for mobile (Waiters)
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      if (type === 'service_call' || type === 'new_order') {
        navigator.vibrate([200, 100, 200]);
      } else {
        navigator.vibrate(100);
      }
    }
    
    return true;
  } catch (err) {
    console.warn(`[Notification] Audio autoplay blocked: ${err}`);
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
