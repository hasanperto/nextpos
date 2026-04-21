/**
 * Ortak tipler ve sabitler (Faz 0 — API + POS ile paylaşım için iskelet).
 * Tema / UI değişikliği gerektirmez.
 */

export const API_VERSION = 'v1' as const;

export type TenantStatus = 'active' | 'suspended' | 'inactive';

/** Sipariş yaşam döngüsü — tenant API ile hizalı tutulmalı */
export type OrderLifecycleStatus =
    | 'draft'
    | 'pending'
    | 'confirmed'
    | 'preparing'
    | 'ready'
    | 'served'
    | 'completed'
    | 'cancelled';
