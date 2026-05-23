"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Product = {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  stocks: {
    warehouseId: string;
    warehouseName: string;
    warehouseLocation: string;
    totalUnits: number;
    reservedUnits: number;
    availableUnits: number;
  }[];
};

export default function Home() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState("");
  const [loadingId, setLoadingId] = useState("");

  async function loadProducts() {
    const res = await fetch("/api/products", {
      cache: "no-store",
    });
    const data = await res.json();
    setProducts(data);
  }

  useEffect(() => {
    loadProducts();
  }, []);

  async function reserve(productId: string, warehouseId: string) {
    setError("");
    setLoadingId(productId + warehouseId);

    const res = await fetch("/api/reservations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        productId,
        warehouseId,
        quantity: 1,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Reservation failed");
      setLoadingId("");
      await loadProducts();
      return;
    }

    router.push(`/reservations/${data.id}`);
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Allo Inventory Reservation</h1>
          <p className="text-slate-400 mt-2">
            Reserve products safely across multiple warehouses.
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-500 bg-red-950 p-4 text-red-200">
            {error}
          </div>
        )}

        <div className="grid gap-6">
          {products.map((product) => (
            <div
              key={product.id}
              className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow"
            >
              <h2 className="text-xl font-semibold">{product.name}</h2>
              <p className="text-sm text-slate-400">SKU: {product.sku}</p>
              <p className="mt-2 text-slate-300">{product.description}</p>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {product.stocks.map((stock) => (
                  <div
                    key={stock.warehouseId}
                    className="rounded-xl border border-slate-700 bg-slate-950 p-4"
                  >
                    <h3 className="font-medium">{stock.warehouseName}</h3>
                    <p className="text-sm text-slate-400">
                      {stock.warehouseLocation}
                    </p>

                    <div className="mt-3 text-sm">
                      <p>Total: {stock.totalUnits}</p>
                      <p>Reserved: {stock.reservedUnits}</p>
                      <p className="font-semibold text-green-400">
                        Available: {stock.availableUnits}
                      </p>
                    </div>

                    <button
                      onClick={() => reserve(product.id, stock.warehouseId)}
                      disabled={
                        stock.availableUnits <= 0 ||
                        loadingId === product.id + stock.warehouseId
                      }
                      className="mt-4 w-full rounded-lg bg-white px-4 py-2 font-medium text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
                    >
                      {loadingId === product.id + stock.warehouseId
                        ? "Reserving..."
                        : "Reserve"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}