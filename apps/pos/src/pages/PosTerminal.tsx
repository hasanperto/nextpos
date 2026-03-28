import React, { useEffect } from 'react';
import { FiShoppingCart } from 'react-icons/fi';
import { usePosStore } from '../store/usePosStore';
import { useUIStore } from '../store/useUIStore';

// Components
import { Header } from '../components/layout/Header';
import { CategorySidebar } from '../features/terminal/components/CategorySidebar';
import { ProductGrid } from '../features/terminal/components/ProductGrid';
import { CartPanel } from '../features/terminal/components/CartPanel';

// Modals
import { ProductModal } from '../features/terminal/components/ProductModal';
import { KitchenStatusModal } from '../features/kitchen/components/KitchenStatusModal';
import { CallerIdModal } from '../features/terminal/components/CallerIdModal';
import { CustomerModal } from '../features/terminal/components/CustomerModal';
import { WaOrderModal } from '../features/terminal/components/WaOrderModal';

function App() {
  const { lang, fetchCategories, fetchProducts, fetchModifiers, cart } = usePosStore();
  const { isCartOpen, setCartOpen } = useUIStore();

  useEffect(() => {
    fetchCategories();
    fetchProducts();
    fetchModifiers();
  }, [lang]);

  return (
    <div className="flex flex-col h-screen w-full bg-[var(--color-pos-bg-primary)] text-[var(--color-pos-text-primary)] font-sans overflow-hidden selector-disabled">

      {/* 1. ÜST DURUM ÇUBUĞU */}
      <Header />

      {/* ANA İÇERİK ALANI */}
      <main className="flex flex-1 overflow-hidden p-[10px] gap-3">

        {/* SOL: Kategori Sidebar */}
        <CategorySidebar />

        {/* ORTA: Ürün Grid */}
        <ProductGrid />

        {/* MOBIL/TABLET ARKA PLAN OVERLAY */}
        {isCartOpen && (
          <div className="fixed inset-0 bg-black/60 z-40 xl:hidden backdrop-blur-sm transition-opacity" onClick={() => setCartOpen(false)} />
        )}

        {/* SAĞ: Adisyon Paneli (Sepet) */}
        <CartPanel />

      </main>

      {/* 📱 TABLET/MOBİL FATURA BUTONU (FAB) */}
      <button
        onClick={() => setCartOpen(true)}
        className="xl:hidden fixed bottom-6 right-6 w-16 h-16 bg-gradient-to-tr from-emerald-500 to-teal-400 rounded-full shadow-2xl flex items-center justify-center text-white z-30 transform active:scale-90 transition-transform border-[3px] border-black/40"
      >
        <FiShoppingCart size={28} />
        {cart.length > 0 && (
          <span className="absolute -top-2 -right-2 bg-red-500 border-2 border-[var(--color-pos-bg-primary)] text-white w-7 h-7 flex items-center justify-center rounded-full font-black text-sm shadow animate-in zoom-in">
            {cart.reduce((s, i) => s + i.qty, 0)}
          </span>
        )}
      </button>

      {/* MODALS */}
      <ProductModal />
      <KitchenStatusModal />
      <CallerIdModal />
      <CustomerModal />
      <WaOrderModal />

    </div>
  );
}

export default App;
