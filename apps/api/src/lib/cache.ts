import { createClient } from 'redis';

type MemoryEntry = { value: string; expiresAt: number };

const mem = new Map<string, MemoryEntry>();
let redisClient: any = null;
let redisInit = false;

function pruneMemory() {
    const now = Date.now();
    for (const [k, v] of mem.entries()) {
        if (v.expiresAt <= now) mem.delete(k);
    }
}

async function getRedis(): Promise<any> {
    if (redisInit) return redisClient;
    redisInit = true;
    try {
        const client = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
        client.on('error', () => {
            /* sessiz degrade */
        });
        await client.connect();
        redisClient = client;
    } catch {
        redisClient = null;
    }
    return redisClient;
}

export async function getCacheJson<T>(key: string): Promise<T | null> {
    pruneMemory();
    const cached = mem.get(key);
    if (cached && cached.expiresAt > Date.now()) {
        return JSON.parse(cached.value) as T;
    }
    const redis = await getRedis();
    if (!redis) return null;
    try {
        const raw = await redis.get(key);
        if (!raw) return null;
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

export async function setCacheJson(key: string, value: unknown, ttlSec: number): Promise<void> {
    const raw = JSON.stringify(value);
    mem.set(key, { value: raw, expiresAt: Date.now() + ttlSec * 1000 });
    const redis = await getRedis();
    if (!redis) return;
    try {
        await redis.set(key, raw, { EX: ttlSec });
    } catch {
        /* ignore */
    }
}

export async function delCacheByPrefix(prefix: string): Promise<void> {
    for (const key of mem.keys()) {
        if (key.startsWith(prefix)) mem.delete(key);
    }
    const redis = await getRedis();
    if (!redis) return;
    try {
        const keys = await redis.keys(`${prefix}*`);
        if (keys.length) await redis.del(keys);
    } catch {
        /* ignore */
    }
}

