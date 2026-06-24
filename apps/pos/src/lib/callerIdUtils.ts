/** Caller ID — telefon eşleştirme ve arama durumu */

export type CallerCallRecord = {
    number: string;
    name?: string;
    address?: string;
    customerId?: number;
    receivedAt?: string;
    status?: string;
    isCancelled?: boolean;
    orderId?: number | string;
    orderNumber?: number | string;
    deliveredAt?: string;
    cancelledAt?: string;
    dismissedAt?: string;
};

export type CallerOrderLike = {
    id?: string;
    remoteId?: number;
    status?: string;
    orderType?: string;
    customerPhone?: string;
    customerName?: string;
    createdAt?: Date | string;
    delivery_phone?: string;
    customer_phone?: string;
    paymentStatus?: string;
};

export function isOrderPaid(order: CallerOrderLike | null | undefined): boolean {
    const ps = String(order?.paymentStatus || '').toLowerCase();
    return ps === 'paid' || ps === 'partial';
}

export function isOrderDeliveredLike(order: CallerOrderLike | null | undefined): boolean {
    if (!order) return false;
    return order.status === 'delivered' || isOrderPaid(order);
}

export function isOrderCancelledLike(order: CallerOrderLike | null | undefined): boolean {
    if (!order) return false;
    if (isOrderPaid(order)) return false;
    return order.status === 'cancelled';
}

export type CallDisplayStatus = 'new_call' | 'ongoing' | 'delivered' | 'cancelled';

export function normalizeCallerPhone(phone: unknown): string {
    if (phone == null || phone === '') return '';
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length >= 10) return digits.slice(-10);
    return digits;
}

export function callRecordKey(call: Pick<CallerCallRecord, 'number' | 'receivedAt'>): string {
    return `${call.number}|${call.receivedAt || ''}`;
}

export function orderContactPhones(order: CallerOrderLike | null | undefined): string[] {
    if (!order) return [];
    const candidates: unknown[] = [
        order.customerPhone,
        order.delivery_phone,
        order.customer_phone,
    ];
    const name = order.customerName || '';
    if (/^[\d\s+\-().]+$/.test(String(name).trim()) && /\d/.test(String(name))) {
        candidates.push(name);
    }
    return [...new Set(candidates.map(normalizeCallerPhone).filter(Boolean))];
}

export function isEndedOrderStatus(status: string | undefined): boolean {
    return status === 'delivered' || status === 'cancelled';
}

export function callMatchesOrder(
    call: CallerCallRecord,
    order: CallerOrderLike,
    maxHoursAfter = 24,
): boolean {
    const callPhone = normalizeCallerPhone(call.number);
    if (!callPhone) return false;

    const orderPhones = orderContactPhones(order);
    if (!orderPhones.some((p) => p === callPhone)) return false;

    if (call.receivedAt && order.createdAt) {
        const callTime = new Date(call.receivedAt).getTime();
        const orderTime = new Date(order.createdAt).getTime();
        if (Number.isNaN(callTime) || Number.isNaN(orderTime)) return true;
        const diff = orderTime - callTime;
        if (diff < -15 * 60 * 1000) return false;
        if (diff > maxHoursAfter * 60 * 60 * 1000) return false;
    }
    return true;
}

function orderTimeScore(call: CallerCallRecord, order: CallerOrderLike): number {
    if (!call.receivedAt || !order.createdAt) return 0;
    const callTime = new Date(call.receivedAt).getTime();
    const orderTime = new Date(order.createdAt).getTime();
    if (Number.isNaN(callTime) || Number.isNaN(orderTime)) return 0;
    return -Math.abs(orderTime - callTime);
}

function orderStatusScore(call: CallerCallRecord, order: CallerOrderLike): number {
    const oid = order.remoteId ?? order.id;
    if (call.orderId != null && oid != null && String(oid) === String(call.orderId)) {
        return 1_000_000;
    }
    // Aynı numarada birden fazla sipariş varsa en yakın zamanı seç (iptal/teslim önceliği yok)
    return orderTimeScore(call, order);
}

/** Aynı numarada birden fazla sipariş varsa en doğru eşleşmeyi seç */
export function findBestMatchingOrder(
    call: CallerCallRecord,
    orders: CallerOrderLike[],
    endedOnly = false,
): CallerOrderLike | undefined {
    if (call.orderId != null) {
        const byId = (orders || []).find(
            (o) => String(o.remoteId ?? o.id) === String(call.orderId),
        );
        if (byId) return byId;
    }

    const candidates = (orders || []).filter((o) => {
        if (endedOnly && !isEndedOrderStatus(o.status) && !isOrderPaid(o)) return false;
        return callMatchesOrder(call, o);
    });
    if (!candidates.length) return undefined;

    return [...candidates].sort((a, b) => orderStatusScore(call, b) - orderStatusScore(call, a))[0];
}

export function mapApiOrderToCallerLike(o: any, fallbackPhone?: string): CallerOrderLike {
    const rawNum = o.order_number ?? o.id;
    const remoteId =
        typeof rawNum === 'string' && rawNum.startsWith('#')
            ? rawNum.slice(1)
            : rawNum;
    return {
        id: o.id,
        remoteId: Number(remoteId) || remoteId,
        status: o.status,
        orderType: o.service_type,
        customerPhone: o.customer_phone ?? o.delivery_phone ?? fallbackPhone,
        customerName: o.customer_name,
        createdAt: o.created_at,
        paymentStatus: o.payment_status,
    };
}

export function buildCallerOrderPool(
    call: CallerCallRecord,
    storeOrders: CallerOrderLike[],
    apiOrders?: any[],
): CallerOrderLike[] {
    const apiLike = (apiOrders || []).map((o) => mapApiOrderToCallerLike(o, call.number));
    return [...(storeOrders || []), ...apiLike];
}

export function resolveActiveOrderMatch(
    call: CallerCallRecord,
    storeOrders: CallerOrderLike[],
    apiOrders?: any[],
): CallerOrderLike | undefined {
    const match = resolveAssociatedOrderMatch(call, storeOrders, apiOrders);
    const st = resolveCallStatusFromOrder(match);
    if (st === 'ongoing' || st === 'new_call') return match;
    return undefined;
}

export function resolveAssociatedOrderMatch(
    call: CallerCallRecord,
    storeOrders: CallerOrderLike[],
    apiOrders?: any[],
): CallerOrderLike | undefined {
    const pool = buildCallerOrderPool(call, storeOrders, apiOrders);
    return findBestMatchingOrder(call, pool, true) ?? findBestMatchingOrder(call, pool, false);
}

export function findMatchingOrder(
    call: CallerCallRecord,
    orders: CallerOrderLike[],
    endedOnly = false,
): CallerOrderLike | undefined {
    return findBestMatchingOrder(call, orders, endedOnly);
}

export function resolveCallStatusFromOrder(order: CallerOrderLike | undefined): CallDisplayStatus | null {
    if (!order) return null;
    if (isOrderDeliveredLike(order)) return 'delivered';
    if (isOrderCancelledLike(order)) return 'cancelled';
    if (!isEndedOrderStatus(order.status)) return 'ongoing';
    return null;
}

/** Teslim/iptal paket ve gel-al siparişlerinden geçmiş kaydı üret (arama silinse bile) */
export function historyEntriesFromEndedOrders(
    orders: CallerOrderLike[],
    existing: CallerCallRecord[],
): CallerCallRecord[] {
    const seenOrderIds = new Set(
        existing.map((h) => String(h.orderId ?? '')).filter(Boolean),
    );
    const seenKeys = new Set(existing.map(callRecordKey));
    const entries: CallerCallRecord[] = [];
    const maxAgeMs = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    for (const o of orders || []) {
        if (!isEndedOrderStatus(o.status) && !isOrderPaid(o)) continue;

        const orderType = String(o.orderType || '').toLowerCase();
        if (orderType && orderType !== 'delivery' && orderType !== 'takeaway' && orderType !== 'web') {
            continue;
        }

        const oid = o.remoteId ?? o.id;
        if (oid != null && seenOrderIds.has(String(oid))) continue;

        const phones = orderContactPhones(o);
        if (!phones.length) continue;

        const createdAt = o.createdAt ? new Date(o.createdAt) : new Date();
        if (now - createdAt.getTime() > maxAgeMs) continue;

        const rawPhone =
            (o.customerPhone && String(o.customerPhone).trim())
            || (o.delivery_phone && String(o.delivery_phone).trim())
            || phones[0];

        const entry: CallerCallRecord = {
            number: rawPhone,
            name: o.customerName,
            receivedAt: createdAt.toISOString(),
            status: isOrderDeliveredLike(o) ? 'delivered' : o.status,
            orderId: oid,
            orderNumber: oid,
            deliveredAt: isOrderDeliveredLike(o) ? createdAt.toISOString() : undefined,
            cancelledAt: isOrderCancelledLike(o) ? createdAt.toISOString() : undefined,
        };

        const key = callRecordKey(entry);
        if (seenKeys.has(key)) continue;
        if (oid != null) seenOrderIds.add(String(oid));
        seenKeys.add(key);
        entries.push(entry);
    }

    return entries;
}

export function enrichCallWithOrderStatus(
    call: CallerCallRecord,
    orders: CallerOrderLike[],
): CallerCallRecord {
    const match = findBestMatchingOrder(call, orders, false);
    const orderStatus = resolveCallStatusFromOrder(match);
    const status: CallDisplayStatus =
        orderStatus
        ?? (call.status === 'delivered'
            ? 'delivered'
            : call.status === 'cancelled'
              ? 'cancelled'
              : 'new_call');
    const orderCancelled = orderStatus === 'cancelled';
    return {
        ...call,
        status,
        isCancelled: orderCancelled,
        orderId: call.orderId ?? match?.remoteId ?? match?.id,
        deliveredAt: status === 'delivered' ? (call.deliveredAt || new Date().toISOString()) : undefined,
        cancelledAt: orderCancelled ? (call.cancelledAt || new Date().toISOString()) : undefined,
    };
}

export function getCallDisplayStatus(
    call: CallerCallRecord | null | undefined,
    orders: CallerOrderLike[],
    historyDefault: CallDisplayStatus = 'new_call',
): CallDisplayStatus {
    if (!call) return 'cancelled';

    const match = findBestMatchingOrder(call, orders, false);
    const fromOrder = resolveCallStatusFromOrder(match);
    if (fromOrder) return fromOrder;

    // Sipariş eşleşmesi yoksa kayıtlı duruma bak (liste dismiss ≠ sipariş iptali)
    if (call.status === 'delivered') return 'delivered';
    if (call.status === 'cancelled') return 'cancelled';
    if (call.isCancelled && !call.dismissedAt) return 'cancelled';
    return historyDefault;
}

export function loadCallHistoryFromStorage(): CallerCallRecord[] {
    try {
        const raw = localStorage.getItem('pos-call-history') || '[]';
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export function saveCallHistoryToStorage(calls: CallerCallRecord[]): void {
    try {
        localStorage.setItem('pos-call-history', JSON.stringify(calls.slice(0, 100)));
    } catch {
        /* ignore */
    }
}

export function appendCallsToHistory(entries: CallerCallRecord[]): CallerCallRecord[] {
    if (!entries.length) return loadCallHistoryFromStorage();
    const merged = [...entries, ...loadCallHistoryFromStorage()].filter(
        (h, index, self) => self.findIndex((x) => callRecordKey(x) === callRecordKey(h)) === index,
    );
    saveCallHistoryToStorage(merged);
    return merged;
}

/** localStorage geçmişi + henüz taşınmamış teslim/iptal aktif aramalar */
export function mergeCallHistory(
    stored: CallerCallRecord[],
    recentCalls: CallerCallRecord[],
    orders: CallerOrderLike[],
): CallerCallRecord[] {
    const endedFromRecent = recentCalls
        .filter((call) => {
            const status = getCallDisplayStatus(call, orders, 'new_call');
            return status === 'delivered' || status === 'cancelled';
        })
        .map((call) => {
            const match = findBestMatchingOrder(call, orders, false);
            const status = resolveCallStatusFromOrder(match)
                ?? (call.status === 'delivered'
                    ? 'delivered'
                    : call.status === 'cancelled'
                      ? 'cancelled'
                      : 'new_call');
            const orderCancelled = status === 'cancelled' && resolveCallStatusFromOrder(match) === 'cancelled';
            return {
                ...call,
                status,
                isCancelled: orderCancelled,
                orderId: call.orderId ?? match?.remoteId ?? match?.id,
                deliveredAt: call.deliveredAt || (status === 'delivered' ? new Date().toISOString() : undefined),
                cancelledAt: call.cancelledAt || (status === 'cancelled' ? new Date().toISOString() : undefined),
            };
        });

    const mergedBase = [...stored, ...endedFromRecent];
    const fromOrders = historyEntriesFromEndedOrders(orders, mergedBase);

    const map = new Map<string, CallerCallRecord>();
    for (const c of [...mergedBase, ...fromOrders]) {
        map.set(callRecordKey(c), c);
    }
    return Array.from(map.values()).map((c) => enrichCallWithOrderStatus(c, orders));
}

export function filterActiveCalls(
    recentCalls: CallerCallRecord[],
    orders: CallerOrderLike[],
): CallerCallRecord[] {
    return recentCalls.filter((call) => {
        const status = getCallDisplayStatus(call, orders, 'new_call');
        return status === 'ongoing' || status === 'new_call';
    });
}
