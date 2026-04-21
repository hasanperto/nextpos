import { useEffect, useRef } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { usePosStore } from '../store/usePosStore';

export const useIdleTimeout = () => {
  const { logout, isAuthenticated } = useAuthStore();
  const { settings } = usePosStore();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Default timeout: 300 seconds (5 minutes)
  const timeoutSeconds = settings?.integrations?.idleTimeout ?? 300;
  const timeoutMs = timeoutSeconds * 1000;

  const resetTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    if (isAuthenticated) {
      timerRef.current = setTimeout(() => {
        console.log('Idle timeout reached, logging out...');
        logout();
      }, timeoutMs);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    const events = [
      'mousedown',
      'mousemove',
      'keypress',
      'scroll',
      'touchstart',
      'click',
    ];

    const handleActivity = () => {
      resetTimer();
    };

    // Initialize timer
    resetTimer();

    // Add listeners
    events.forEach((event) => {
      window.addEventListener(event, handleActivity);
    });

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [isAuthenticated, timeoutMs, logout]);

  return resetTimer;
};
