import React from 'react';

type Props = {
    children: React.ReactNode;
};

type State = {
    hasError: boolean;
};

export class ErrorBoundary extends React.Component<Props, State> {
    state: State = { hasError: false };

    static getDerivedStateFromError(): State {
        return { hasError: true };
    }

    handleReload = () => {
        window.location.reload();
    };

    handleGoHome = () => {
        window.location.href = '/';
    };

    render() {
        if (!this.state.hasError) {
            return this.props.children;
        }

        return (
            <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-6">
                <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl">
                    <div className="inline-flex items-center rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs font-black uppercase tracking-[0.25em] text-rose-300">
                        Sistem Hatası
                    </div>
                    <h1 className="mt-4 text-3xl font-black tracking-tight">Ekran yüklenemedi</h1>
                    <p className="mt-3 text-sm font-medium leading-6 text-slate-300">
                        Beklenmeyen bir arayüz hatası oluştu. Sayfayı yenileyebilir veya ana ekrana dönebilirsiniz.
                    </p>
                    <div className="mt-6 flex flex-wrap gap-3">
                        <button
                            type="button"
                            onClick={this.handleReload}
                            className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-black text-slate-950 transition hover:brightness-110"
                        >
                            Sayfayı Yenile
                        </button>
                        <button
                            type="button"
                            onClick={this.handleGoHome}
                            className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-black text-white transition hover:bg-white/10"
                        >
                            Ana Ekrana Dön
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}