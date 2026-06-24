/**
 * useCourierChat — Kasiyer ↔ Kurye anlık mesajlaşma hook'u
 *
 * Kullanım:
 *   const { messages, sendMessage, allChats } = useCourierChat(orderId, 'cashier');
 *   const { messages, sendMessage, allChats } = useCourierChat(orderId, 'courier');
 *
 * - orderId: number | null — aktif sohbet odası (null ise dinleme modu)
 * - role: 'cashier' | 'courier' — kimin mesaj gönderdiği
 * - messages: bu odanın mesajları
 * - sendMessage(text): mesaj gönder (state + localStorage + BroadcastChannel)
 * - allChats: tüm siparişlerin mesajları (unread badge vb. için)
 * - onNewMessage: callback (başka odadan yeni mesaj geldiğinde)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/useAuthStore';
import { getSocketOrigin } from '../lib/socketOrigin';

const STORAGE_KEY = 'pos-courier-order-chats';
const CHANNEL_NAME = 'nextpos-courier-chat';

export type ChatMessage = {
    sender: 'cashier' | 'courier';
    text: string;
    time: string;
};

export type ChatStore = Record<string | number, ChatMessage[]>;

function readStore(): ChatStore {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        return JSON.parse(raw) as ChatStore;
    } catch {
        return {};
    }
}

function writeStore(store: ChatStore): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
        // storage full — ignore
    }
}

export function useCourierChat(
    activeOrderId: number | string | null,
    role: 'cashier' | 'courier',
    onNewMessage?: (orderId: any, msg: ChatMessage) => void,
) {
    const [allChats, setAllChats] = useState<ChatStore>(() => readStore());
    const onNewMessageRef = useRef(onNewMessage);
    const socketRef = useRef<Socket | null>(null);

    // Keep ref current without triggering re-subscription
    useEffect(() => {
        onNewMessageRef.current = onNewMessage;
    }, [onNewMessage]);

    // Connect to Socket.io for cross-device real-time sync
    useEffect(() => {
        const { token, tenantId } = useAuthStore.getState();
        if (!token || !tenantId) return;

        const socket = io(getSocketOrigin(), {
            path: '/socket.io',
            transports: ['polling', 'websocket'],
            auth: { token },
            query: { tenantId },
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 3000,
        });

        socketRef.current = socket;

        socket.on('connect', () => {
            socket.emit('join:tenant', tenantId);
        });

        socket.on('courier:chat_message', (data: { orderId: any; sender: 'cashier' | 'courier'; text: string; time: string }) => {
            // Ignore messages from ourselves
            if (data.sender === role) return;

            const newMsg: ChatMessage = { sender: data.sender, text: data.text, time: data.time };

            setAllChats(prev => {
                const current = prev[data.orderId] ?? [];
                if (current.some(m => m.sender === data.sender && m.text === data.text && m.time === data.time)) {
                    return prev;
                }
                const updated = { ...prev, [data.orderId]: [...current, newMsg] };
                writeStore(updated);
                return updated;
            });

            onNewMessageRef.current?.(data.orderId, newMsg);
        });

        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
    }, [role]);

    // Listen for incoming messages from the OTHER side via BroadcastChannel (local tabs fallback)
    useEffect(() => {
        const channel = new BroadcastChannel(CHANNEL_NAME);

        const handleMessage = (e: MessageEvent) => {
            const rawId = e.data?.orderId;
            const sender = e.data?.sender as 'cashier' | 'courier' | undefined;
            const text = e.data?.text as string | undefined;
            const time = e.data?.time as string | undefined;

            if (rawId == null || !sender || !text || !time) return;
            const orderId = rawId;

            const expectedSender = role === 'cashier' ? 'courier' : 'cashier';
            if (sender !== expectedSender) return;

            const newMsg: ChatMessage = { sender, text, time };

            setAllChats(prev => {
                const current = prev[orderId] ?? [];
                if (current.some(m => m.sender === sender && m.text === text && m.time === time)) {
                    return prev;
                }
                const updated = { ...prev, [orderId]: [...current, newMsg] };
                writeStore(updated);
                return updated;
            });

            onNewMessageRef.current?.(orderId, newMsg);
        };

        channel.addEventListener('message', handleMessage);
        return () => {
            channel.removeEventListener('message', handleMessage);
            channel.close();
        };
    }, [role]);

    // Also sync from localStorage when tab gets focus
    useEffect(() => {
        const onFocus = () => {
            const fresh = readStore();
            setAllChats(fresh);
        };
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, []);

    const messages = activeOrderId != null ? (allChats[activeOrderId] ?? []) : [];

    const sendMessage = useCallback((text: string) => {
        if (activeOrderId == null || !text.trim()) return;

        const orderId = activeOrderId;
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const newMsg: ChatMessage = { sender: role, text: text.trim(), time };

        // Update local state immediately
        setAllChats(prev => {
            const current = prev[orderId] ?? [];
            if (current.some(m => m.sender === role && m.text === text.trim() && m.time === time)) {
                return prev;
            }
            const updated = { ...prev, [orderId]: [...current, newMsg] };
            writeStore(updated);
            return updated;
        });

        // Emit through Socket.io for cross-device sync
        const { tenantId } = useAuthStore.getState();
        if (socketRef.current?.connected && tenantId) {
            socketRef.current.emit('courier:chat_message', {
                tenantId,
                orderId,
                sender: role,
                text: text.trim(),
                time,
            });
        }

        // Broadcast to local tabs
        try {
            const channel = new BroadcastChannel(CHANNEL_NAME);
            channel.postMessage({ orderId, sender: role, text: text.trim(), time });
            channel.close();
        } catch (err) {
            console.error('[CourierChat] BroadcastChannel error:', err);
        }
    }, [activeOrderId, role]);

    return { messages, sendMessage, allChats };
}

