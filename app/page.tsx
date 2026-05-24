"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

type Stock = {
  stockId: string;
  warehouseId: string;
  warehouseName: string;
  warehouseLocation: string;
  totalUnits: number;
  reservedUnits: number;
  availableUnits: number;
};

type Product = {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  stocks: Stock[];
};

export default function Home() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadingId, setLoadingId] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const loadProducts = useCallback(async () => {
    try {
      const res = await fetch("/api/products", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to load inventory data.");
      const data = (await res.json()) as Product[];
      setProducts(data);

      // Initialize default quantities
      setQuantities((prev) => {
        const initialQuantities: Record<string, number> = { ...prev };
        data.forEach((p: Product) => {
          p.stocks.forEach((s: Stock) => {
            const key = `${p.id}-${s.warehouseId}`;
            if (initialQuantities[key] === undefined) {
              initialQuantities[key] = 1;
            }
          });
        });
        return initialQuantities;
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Could not retrieve products.";
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      await loadProducts();
    };
    load();
  }, [loadProducts]);

  const handleQuantityChange = (productId: string, warehouseId: string, val: number, max: number) => {
    const key = `${productId}-${warehouseId}`;
    const clamped = Math.max(1, Math.min(max, val));
    setQuantities((prev) => ({ ...prev, [key]: clamped }));
  };

  async function reserve(productId: string, warehouseId: string, availableUnits: number) {
    const qtyKey = `${productId}-${warehouseId}`;
    const quantity = quantities[qtyKey] || 1;

    if (quantity > availableUnits) {
      setError("Cannot reserve more than the available stock.");
      return;
    }

    setError("");
    setLoadingId(productId + warehouseId);

    // Client-side Idempotency Key generation
    const idempotencyKey = crypto.randomUUID();

    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          productId,
          warehouseId,
          quantity,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Reservation failed.");
        setLoadingId("");
        await loadProducts(); // refresh stock numbers
        return;
      }

      // Smooth navigation to the reservation checkout page
      router.push(`/reservations/${data.id}`);
    } catch {
      setError("A connection error occurred. Please try again.");
      setLoadingId("");
      await loadProducts();
    }
  }

  // Calculate high-level stats
  const totalProducts = products.length;
  const totalWarehouses = Array.from(
    new Set(products.flatMap((p) => p.stocks.map((s) => s.warehouseId)))
  ).length;
  const totalStockInSystem = products.reduce(
    (acc, p) => acc + p.stocks.reduce((sum, s) => sum + s.totalUnits, 0),
    0
  );
  const totalReservedInSystem = products.reduce(
    (acc, p) => acc + p.stocks.reduce((sum, s) => sum + s.reservedUnits, 0),
    0
  );

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-teal-500 selection:text-slate-950 font-sans">
      {/* Decorative top ambient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[350px] bg-gradient-to-b from-teal-500/10 via-transparent to-transparent blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40">
        <div className="mx-auto max-w-6xl px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-teal-500 to-emerald-400 p-[1.5px] shadow-lg shadow-teal-500/25">
              <div className="h-full w-full rounded-[10px] bg-slate-950 flex items-center justify-center">
                <span className="text-xl font-bold bg-gradient-to-tr from-teal-400 to-emerald-300 bg-clip-text text-transparent">A</span>
              </div>
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Allo Inventory Hub</h1>
              <p className="text-xs text-slate-400">Multi-Warehouse Reservation Engine</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-teal-500/10 px-2.5 py-0.5 text-xs font-medium text-teal-400 border border-teal-500/25 animate-pulse">
              Live Core Syncing
            </span>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="mx-auto max-w-6xl w-full px-4 py-8 flex-1 flex flex-col gap-8 z-10">
        {/* Stats Dashboard */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-slate-900 bg-slate-900/30 p-5 backdrop-blur-sm">
            <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">SKU Catalog</p>
            <p className="mt-2 text-3xl font-bold bg-gradient-to-r from-slate-100 to-slate-300 bg-clip-text text-transparent">{loading ? "-" : totalProducts}</p>
          </div>
          <div className="rounded-2xl border border-slate-900 bg-slate-900/30 p-5 backdrop-blur-sm">
            <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Active Warehouses</p>
            <p className="mt-2 text-3xl font-bold bg-gradient-to-r from-slate-100 to-slate-300 bg-clip-text text-transparent">{loading ? "-" : totalWarehouses}</p>
          </div>
          <div className="rounded-2xl border border-slate-900 bg-slate-900/30 p-5 backdrop-blur-sm">
            <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Total Stock Units</p>
            <p className="mt-2 text-3xl font-bold bg-gradient-to-r from-teal-400 to-emerald-400 bg-clip-text text-transparent">{loading ? "-" : totalStockInSystem}</p>
          </div>
          <div className="rounded-2xl border border-slate-900 bg-slate-900/30 p-5 backdrop-blur-sm">
            <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Currently Reserved</p>
            <p className="mt-2 text-3xl font-bold bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">{loading ? "-" : totalReservedInSystem}</p>
          </div>
        </section>

        {/* Errors & Notifications */}
        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-950/20 px-6 py-4 text-red-200 backdrop-blur-md flex items-start gap-3 shadow-xl shadow-red-950/20 transition-all duration-300 animate-in fade-in slide-in-from-top-4">
            <svg className="h-5 w-5 mt-0.5 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
            <div className="flex-1">
              <h4 className="font-semibold text-red-300">Transaction Blocked</h4>
              <p className="mt-1 text-sm text-red-200/80">{error}</p>
            </div>
            <button onClick={() => setError("")} className="text-red-400 hover:text-red-300 transition-colors">
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg>
            </button>
          </div>
        )}

        {/* Loading Spinner */}
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 gap-4">
            <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-slate-800 border-t-teal-400" />
            <p className="text-sm text-slate-400">Loading catalog and warehouse stocks...</p>
          </div>
        ) : (
          /* Products Grid */
          <section className="grid gap-8">
            {products.map((product) => (
              <div
                key={product.id}
                className="group relative rounded-3xl border border-slate-900 bg-slate-900/10 p-6 sm:p-8 backdrop-blur-md transition-all duration-300 hover:border-slate-800/80 hover:bg-slate-900/20"
              >
                {/* Subtle border glowing effect on hover */}
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-teal-500/5 to-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 z-10 relative">
                  <div>
                    <span className="inline-flex items-center rounded-md bg-slate-950 px-2.5 py-1 text-xs font-semibold text-slate-400 uppercase border border-slate-800 tracking-wider">
                      {product.sku}
                    </span>
                    <h2 className="mt-3 text-2xl font-bold text-slate-100 tracking-tight">{product.name}</h2>
                    <p className="mt-2 text-slate-400 max-w-xl text-sm leading-relaxed">{product.description || "No description provided."}</p>
                  </div>
                </div>

                <div className="mt-8 grid gap-6 md:grid-cols-2 z-10 relative">
                  {product.stocks.map((stock) => {
                    const qtyKey = `${product.id}-${stock.warehouseId}`;
                    const quantity = quantities[qtyKey] || 1;
                    const isOut = stock.availableUnits <= 0;
                    const isReserving = loadingId === product.id + stock.warehouseId;

                    return (
                      <div
                        key={stock.warehouseId}
                        className="rounded-2xl border border-slate-900 bg-slate-950/60 p-5 flex flex-col justify-between transition-all duration-300 hover:border-slate-800 hover:bg-slate-950/80 shadow-md"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h3 className="font-semibold text-slate-100">{stock.warehouseName}</h3>
                              <p className="text-xs text-slate-400">{stock.warehouseLocation}</p>
                            </div>
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${
                              isOut 
                                ? "bg-red-500/10 text-red-400 border-red-500/25" 
                                : "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                            }`}>
                              {isOut ? "Out of Stock" : "In Stock"}
                            </span>
                          </div>

                          <div className="mt-4 grid grid-cols-3 gap-2 py-3 px-4 rounded-xl bg-slate-900/30 border border-slate-900 text-center text-xs">
                            <div>
                              <p className="text-slate-400 font-medium">Total</p>
                              <p className="mt-1 text-base font-bold text-slate-200">{stock.totalUnits}</p>
                            </div>
                            <div className="border-x border-slate-900">
                              <p className="text-slate-400 font-medium">Reserved</p>
                              <p className="mt-1 text-base font-bold text-slate-200">{stock.reservedUnits}</p>
                            </div>
                            <div>
                              <p className="text-slate-400 font-medium">Available</p>
                              <p className={`mt-1 text-base font-extrabold ${isOut ? 'text-red-400' : 'text-emerald-400 animate-pulse'}`}>{stock.availableUnits}</p>
                            </div>
                          </div>
                        </div>

                        {!isOut && (
                          <div className="mt-5 flex items-center gap-3">
                            {/* Incremental Quantity Selector */}
                            <div className="flex items-center rounded-xl bg-slate-900 border border-slate-800 h-[42px] px-1 shadow-inner shrink-0">
                              <button
                                onClick={() => handleQuantityChange(product.id, stock.warehouseId, quantity - 1, stock.availableUnits)}
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" /></svg>
                              </button>
                              <span className="w-8 text-center text-sm font-bold text-slate-200 select-none">
                                {quantity}
                              </span>
                              <button
                                onClick={() => handleQuantityChange(product.id, stock.warehouseId, quantity + 1, stock.availableUnits)}
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                              </button>
                            </div>

                            {/* Reservable button */}
                            <button
                              onClick={() => reserve(product.id, stock.warehouseId, stock.availableUnits)}
                              disabled={isReserving}
                              className="flex-1 rounded-xl bg-gradient-to-tr from-teal-500 to-emerald-400 px-4 py-2 h-[42px] font-bold text-slate-950 hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center shadow-lg shadow-teal-500/10 disabled:opacity-50"
                            >
                              {isReserving ? (
                                <div className="flex items-center gap-2">
                                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950 border-t-transparent" />
                                  <span>Securing hold...</span>
                                </div>
                              ) : (
                                "Reserve Hold"
                              )}
                            </button>
                          </div>
                        )}
                        {isOut && (
                          <div className="mt-5">
                            <button
                              disabled
                              className="w-full rounded-xl bg-slate-900 border border-slate-800 px-4 py-2 h-[42px] font-semibold text-slate-600 cursor-not-allowed flex items-center justify-center"
                            >
                              Temporarily Depleted
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        )}
      </div>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-900/60 bg-slate-950 py-6 text-center text-xs text-slate-500 z-10">
        <p>© 2026 Allo Engineering Take-Home Exercise. Crafted for high-concurrency operations.</p>
      </footer>
    </main>
  );
}