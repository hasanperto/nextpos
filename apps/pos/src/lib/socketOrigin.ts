/** Socket.io bağlantı kökeni — dev'de Vite proxy 502 vermemesi için doğrudan API */
export function getSocketOrigin(): string {
    const env = import.meta.env.VITE_SOCKET_ORIGIN as string | undefined;
    if (env && String(env).trim()) return String(env).trim().replace(/\/$/, '');
    if (import.meta.env.DEV) return 'http://127.0.0.1:3101';
    if (typeof window !== 'undefined') return window.location.origin;
    return '';
}
