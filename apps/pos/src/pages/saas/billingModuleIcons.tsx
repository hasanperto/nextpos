import React from 'react';
import {
    FiCoffee,
    FiShoppingCart,
    FiSmartphone,
    FiMonitor,
    FiTablet,
    FiTruck,
    FiMapPin,
    FiGrid,
    FiLayers,
    FiPackage,
    FiUsers,
    FiCreditCard,
    FiBell,
    FiWifi,
    FiSettings,
    FiBarChart2,
    FiHome,
    FiPrinter,
    FiCamera,
    FiMessageSquare,
    FiClock,
    FiCalendar,
    FiKey,
    FiShield,
    FiZap,
    FiGlobe,
    FiNavigation,
    FiEdit3,
    FiPieChart,
    FiTrendingUp,
    FiCpu,
    FiHeadphones,
    FiBookOpen,
    FiCode,
} from 'react-icons/fi';

/** DB'de saklanan anahtar → bileşen (önizleme) */
export const BILLING_MODULE_ICON_MAP: Record<
    string,
    React.ComponentType<{ size?: number; className?: string }>
> = {
    FiCoffee,
    FiShoppingCart,
    FiSmartphone,
    FiMonitor,
    FiTablet,
    FiTruck,
    FiMapPin,
    FiGrid,
    FiLayers,
    FiPackage,
    FiUsers,
    FiCreditCard,
    FiBell,
    FiWifi,
    FiSettings,
    FiBarChart2,
    FiHome,
    FiPrinter,
    FiCamera,
    FiMessageSquare,
    FiClock,
    FiCalendar,
    FiKey,
    FiShield,
    FiZap,
    FiGlobe,
    FiNavigation,
    FiEdit3,
    FiPieChart,
    FiTrendingUp,
    FiCpu,
    FiHeadphones,
    FiBookOpen,
    FiCode,
};

/** value → messages.ts anahtarı: billingModules.icon.<suffix> */
const ICON_OPTION_ENTRIES: { value: string; suffix: string }[] = [
    { value: '', suffix: 'none' },
    { value: 'FiCoffee', suffix: 'FiCoffee' },
    { value: 'FiShoppingCart', suffix: 'FiShoppingCart' },
    { value: 'FiSmartphone', suffix: 'FiSmartphone' },
    { value: 'FiMonitor', suffix: 'FiMonitor' },
    { value: 'FiTablet', suffix: 'FiTablet' },
    { value: 'FiTruck', suffix: 'FiTruck' },
    { value: 'FiMapPin', suffix: 'FiMapPin' },
    { value: 'FiGrid', suffix: 'FiGrid' },
    { value: 'FiLayers', suffix: 'FiLayers' },
    { value: 'FiPackage', suffix: 'FiPackage' },
    { value: 'FiUsers', suffix: 'FiUsers' },
    { value: 'FiCreditCard', suffix: 'FiCreditCard' },
    { value: 'FiBell', suffix: 'FiBell' },
    { value: 'FiWifi', suffix: 'FiWifi' },
    { value: 'FiSettings', suffix: 'FiSettings' },
    { value: 'FiBarChart2', suffix: 'FiBarChart2' },
    { value: 'FiHome', suffix: 'FiHome' },
    { value: 'FiPrinter', suffix: 'FiPrinter' },
    { value: 'FiCamera', suffix: 'FiCamera' },
    { value: 'FiMessageSquare', suffix: 'FiMessageSquare' },
    { value: 'FiClock', suffix: 'FiClock' },
    { value: 'FiCalendar', suffix: 'FiCalendar' },
    { value: 'FiKey', suffix: 'FiKey' },
    { value: 'FiShield', suffix: 'FiShield' },
    { value: 'FiZap', suffix: 'FiZap' },
    { value: 'FiGlobe', suffix: 'FiGlobe' },
    { value: 'FiNavigation', suffix: 'FiNavigation' },
    { value: 'FiEdit3', suffix: 'FiEdit3' },
    { value: 'FiPieChart', suffix: 'FiPieChart' },
    { value: 'FiTrendingUp', suffix: 'FiTrendingUp' },
    { value: 'FiCpu', suffix: 'FiCpu' },
    { value: 'FiHeadphones', suffix: 'FiHeadphones' },
    { value: 'FiBookOpen', suffix: 'FiBookOpen' },
    { value: 'FiCode', suffix: 'FiCode' },
];

export function getBillingModuleIconOptions(t: (key: string) => string): { value: string; label: string }[] {
    return ICON_OPTION_ENTRIES.map(({ value, suffix }) => ({
        value,
        label: t(`billingModules.icon.${suffix}`),
    }));
}

export function BillingModuleIconPreview({ name, className }: { name: string; className?: string }) {
    if (!name || !BILLING_MODULE_ICON_MAP[name]) {
        return (
            <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-[10px] text-slate-500 ${className ?? ''}`}>
                —
            </span>
        );
    }
    const Cmp = BILLING_MODULE_ICON_MAP[name];
    return (
        <span
            className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/25 bg-violet-500/10 ${className ?? ''}`}
            title={name}
        >
            <Cmp size={22} className="text-violet-300" />
        </span>
    );
}

/** Listede olmayan kayıtlı ikon için ek seçenek (İkon yok + standart liste korunur) */
export function mergeIconSelectOptions(
    stored: string | null | undefined,
    t: (key: string) => string
): { value: string; label: string }[] {
    const opts = getBillingModuleIconOptions(t);
    const s = (stored || '').trim();
    if (!s) return opts;
    const exists = opts.some((o) => o.value === s);
    if (exists) return opts;
    return [
        opts[0],
        { value: s, label: t('billingModules.icon.stored').replace('{code}', s) },
        ...opts.slice(1),
    ];
}
