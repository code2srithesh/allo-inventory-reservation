"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";

type Reservation = {
  id: string;
  quantity: number;
  status: "PENDING" | "CONFIRMED" | "RELEASED";
  expiresAt: string;
  productId: string;
  warehouseId: string;
  product: {
    name: string;
    sku: string;
    description: string | null;
  };
  warehouse: {
    name: string;
    location: string;
  };
};

export default function ReservationPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Store a session-wide idempotency key for confirming this reservation
  const idempotencyKeyRef = useRef<string>("");

  useEffect(() => {
    idempotencyKeyRef.current = crypto.randomUUID();
  }, []);

  // Trigger release automatically when countdown hits zero
  const handleAutoRelease = useCallback(async () => {
    setReservation((prev) => {
      if (!prev || prev.status !== "PENDING") return prev;
      return { ...prev, status: "RELEASED" };
    });
    setError("This reservation hold has expired. Stock has been returned to the catalog.");
    setSecondsLeft(0);

    try {
      await fetch(`/api/reservations/${id}/release`, {
        method: "POST",
      });
    } catch (e) {
      console.error("Auto release failed:", e);
    }
  }, [id]);

  const loadReservation = useCallback(async () => {
    try {
      const res = await fetch(`/api/reservations/${id}`, {
        cache: "no-store",
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Reservation not found.");
        return;
      }

      setReservation(data);

      // Instantly compute the initial seconds left to avoid layout flicker
      if (data.status === "PENDING") {
        const diff = Math.max(
          0,
          Math.floor((new Date(data.expiresAt).getTime() - Date.now()) / 1000)
        );
        setSecondsLeft(diff);

        // If it's already expired upon load, trigger auto-release
        if (diff <= 0) {
          handleAutoRelease();
        }
      }
    } catch {
      setError("Failed to fetch reservation details.");
    } finally {
      setLoading(false);
    }
  }, [id, handleAutoRelease]);

  useEffect(() => {
    const load = async () => {
      await loadReservation();
    };
    load();
  }, [loadReservation]);

  // Handle countdown ticks
  useEffect(() => {
    if (!reservation || reservation.status !== "PENDING" || secondsLeft === null) return;

    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev === null) return 0;
        if (prev <= 1) {
          clearInterval(timer);
          handleAutoRelease();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [reservation, secondsLeft, handleAutoRelease]);

  async function confirmPurchase() {
    if (!reservation || confirming) return;

    setError("");
    setMessage("");
    setConfirming(true);

    try {
      const res = await fetch(`/api/reservations/${id}/confirm`, {
        method: "POST",
        headers: {
          "Idempotency-Key": idempotencyKeyRef.current,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Purchase confirmation failed.");
        if (res.status === 410) {
          // Explicitly handle 410 Reservation Expired
          setReservation((prev) => prev ? { ...prev, status: "RELEASED" } : null);
        }
        return;
      }

      setReservation(data);
      setMessage("Success! Your checkout is complete and inventory stock is permanently updated.");
    } catch {
      setError("A connection error occurred. Please try again.");
    } finally {
      setConfirming(false);
    }
  }

  async function cancelReservation() {
    if (!reservation || cancelling) return;

    setError("");
    setMessage("");
    setCancelling(true);

    try {
      const res = await fetch(`/api/reservations/${id}/release`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Could not cancel reservation.");
        return;
      }

      setReservation(data);
      setMessage("Your reservation was cancelled and the units were returned immediately.");
    } catch {
      setError("A connection error occurred. Please try again.");
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-100 font-sans">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-slate-800 border-t-teal-400" />
        <p className="mt-4 text-sm text-slate-400">Loading checkout session...</p>
      </main>
    );
  }

  if (!reservation) {
    return (
      <main className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-100 font-sans">
        <div className="max-w-md w-full rounded-2xl border border-red-500/20 bg-red-950/10 p-6 text-center shadow-xl">
          <h2 className="text-xl font-bold text-red-400">Session Error</h2>
          <p className="mt-2 text-sm text-red-200/80">{error || "This checkout session does not exist."}</p>
          <button
            onClick={() => router.push("/")}
            className="mt-6 w-full rounded-xl bg-slate-900 border border-slate-800 px-4 py-2 font-medium text-slate-200 hover:bg-slate-800 transition-colors"
          >
            Go Back Home
          </button>
        </div>
      </main>
    );
  }

  const mins = secondsLeft !== null ? Math.floor(secondsLeft / 60) : 10;
  const secs = secondsLeft !== null ? secondsLeft % 60 : 0;
  const progressPercent = secondsLeft !== null ? (secondsLeft / 600) * 100 : 100; // 10 minutes = 600s

  // Determine countdown colors based on time remaining
  let timerColorClass = "text-teal-400";
  let progressColorClass = "bg-teal-500";
  let pulseClass = "";

  if (secondsLeft !== null) {
    if (secondsLeft <= 60) {
      timerColorClass = "text-red-500";
      progressColorClass = "bg-red-500";
      pulseClass = "animate-pulse scale-105 transition-transform";
    } else if (secondsLeft <= 300) {
      timerColorClass = "text-amber-400";
      progressColorClass = "bg-amber-500";
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-teal-500 selection:text-slate-950 font-sans relative">
      {/* Dynamic backdrop ambient glow depending on reservation state */}
      {reservation.status === "PENDING" && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-5xl h-[300px] bg-gradient-to-b from-teal-500/5 via-transparent to-transparent blur-[100px] pointer-events-none" />
      )}
      {reservation.status === "CONFIRMED" && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-5xl h-[300px] bg-gradient-to-b from-emerald-500/10 via-transparent to-transparent blur-[100px] pointer-events-none" />
      )}
      {reservation.status === "RELEASED" && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-5xl h-[300px] bg-gradient-to-b from-red-500/5 via-transparent to-transparent blur-[100px] pointer-events-none" />
      )}

      {/* Main Panel container */}
      <div className="mx-auto max-w-2xl w-full px-4 py-16 flex-1 flex items-center justify-center z-10">
        <div className={`w-full rounded-3xl border p-6 sm:p-8 backdrop-blur-md shadow-2xl transition-all duration-500 ${
          reservation.status === "CONFIRMED"
            ? "border-emerald-500/20 bg-slate-900/10"
            : reservation.status === "RELEASED"
            ? "border-red-500/20 bg-slate-900/10"
            : "border-slate-900 bg-slate-900/10"
        }`}>
          {/* Header */}
          <div className="flex items-center justify-between pb-6 border-b border-slate-900/60">
            <div>
              <h1 className="text-xl font-bold tracking-tight">Secured Reservation</h1>
              <p className="text-xs text-slate-400">Order Token: #{reservation.id.slice(-8).toUpperCase()}</p>
            </div>
            {/* Status Badge */}
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border ${
              reservation.status === "CONFIRMED"
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : reservation.status === "RELEASED"
                ? "bg-red-500/10 text-red-400 border-red-500/20"
                : "bg-teal-500/10 text-teal-400 border-teal-500/20 animate-pulse"
            }`}>
              {reservation.status === "PENDING" && "Holding Stock"}
              {reservation.status === "CONFIRMED" && "Completed"}
              {reservation.status === "RELEASED" && "Expired / Released"}
            </span>
          </div>

          {/* Messages & Errors */}
          {error && (
            <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-950/20 px-5 py-4 text-sm text-red-200 backdrop-blur-sm flex gap-3 animate-in fade-in slide-in-from-top-4">
              <svg className="h-5 w-5 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
              <div>
                <span className="font-semibold text-red-300">Checkout Error:</span> {error}
              </div>
            </div>
          )}

          {message && (
            <div className="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-950/20 px-5 py-4 text-sm text-emerald-200 backdrop-blur-sm flex gap-3 animate-in fade-in slide-in-from-top-4">
              <svg className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              <div>
                <span className="font-semibold text-emerald-300">Status Update:</span> {message}
              </div>
            </div>
          )}

          {/* Details list */}
          <div className="mt-8 space-y-4">
            <div className="rounded-2xl border border-slate-900 bg-slate-950/60 p-5 space-y-3.5">
              <div className="flex justify-between items-center text-sm border-b border-slate-900/40 pb-3">
                <span className="text-slate-500 font-medium">Selected Item</span>
                <span className="font-semibold text-slate-200 text-right">{reservation.product.name}</span>
              </div>
              <div className="flex justify-between items-center text-sm border-b border-slate-900/40 pb-3">
                <span className="text-slate-500 font-medium">Unique SKU</span>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">{reservation.product.sku}</span>
              </div>
              <div className="flex justify-between items-center text-sm border-b border-slate-900/40 pb-3">
                <span className="text-slate-500 font-medium">Origin Warehouse</span>
                <span className="font-semibold text-slate-200 text-right">{reservation.warehouse.name} ({reservation.warehouse.location})</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 font-medium">Allocated Quantity</span>
                <span className="font-bold text-teal-400 text-base">{reservation.quantity} {reservation.quantity === 1 ? 'unit' : 'units'}</span>
              </div>
            </div>
          </div>

          {/* Conditional Layouts based on status */}

          {/* PENDING State (Timer + Actions) */}
          {reservation.status === "PENDING" && secondsLeft !== null && (
            <div className="mt-8 space-y-6">
              {/* Premium Timer section */}
              <div className="rounded-2xl border border-slate-900 bg-slate-950/30 p-6 flex flex-col items-center justify-center text-center">
                <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Allocated stock hold expires in</p>
                <div className={`mt-3 flex items-center justify-center ${pulseClass}`}>
                  <span className={`text-5xl font-extrabold tracking-tighter ${timerColorClass}`}>
                    {mins}:{secs.toString().padStart(2, "0")}
                  </span>
                </div>

                {/* Linear animated progress bar */}
                <div className="mt-6 w-full h-1.5 rounded-full bg-slate-900 overflow-hidden border border-slate-800/40">
                  <div
                    style={{ width: `${progressPercent}%` }}
                    className={`h-full rounded-full transition-all duration-1000 ${progressColorClass}`}
                  />
                </div>
                <p className="mt-2.5 text-[10px] text-slate-500">
                  This transaction is locked in the system. Complete checkout to finalize purchase.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <button
                  onClick={confirmPurchase}
                  disabled={confirming || cancelling}
                  className="rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 px-4 py-3 font-bold text-slate-950 hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center shadow-lg shadow-emerald-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {confirming ? (
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950 border-t-transparent" />
                      <span>Processing Payment...</span>
                    </div>
                  ) : (
                    "Confirm Purchase"
                  )}
                </button>

                <button
                  onClick={cancelReservation}
                  disabled={confirming || cancelling}
                  className="rounded-xl bg-slate-900 border border-slate-800 text-slate-300 px-4 py-3 font-bold hover:bg-slate-800 hover:text-white active:scale-[0.98] transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {cancelling ? (
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-transparent" />
                      <span>Cancelling...</span>
                    </div>
                  ) : (
                    "Release Stock"
                  )}
                </button>
              </div>
            </div>
          )}

          {/* CONFIRMED State Dashboard */}
          {reservation.status === "CONFIRMED" && (
            <div className="mt-8 p-6 rounded-2xl border border-emerald-500/15 bg-emerald-950/5 flex flex-col items-center justify-center text-center">
              <div className="h-14 w-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/5">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              </div>
              <h3 className="mt-4 text-lg font-bold text-emerald-300">Transaction Fully Settled</h3>
              <p className="mt-2 text-xs text-slate-400 max-w-sm">
                Units have been permanently decremented from warehouse stocks. This reservation is complete.
              </p>
            </div>
          )}

          {/* RELEASED State Dashboard */}
          {reservation.status === "RELEASED" && (
            <div className="mt-8 p-6 rounded-2xl border border-red-500/15 bg-red-950/5 flex flex-col items-center justify-center text-center">
              <div className="h-14 w-14 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 shadow-lg shadow-red-500/5">
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0-10.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.249-8.25-3.286Zm0 13.036h.008v.008H12v-.008Z" />
                </svg>
              </div>
              <h3 className="mt-4 text-lg font-bold text-red-300">Session Expired & Stock Released</h3>
              <p className="mt-2 text-xs text-slate-400 max-w-sm">
                The temporary stock reservation holds have been automatically released. Stock is immediately back in catalog.
              </p>
            </div>
          )}

          {/* Return Home */}
          <button
            onClick={() => router.push("/")}
            className="mt-6 w-full rounded-xl bg-slate-950 border border-slate-900 px-4 py-3 font-semibold text-slate-300 hover:bg-slate-900 hover:text-white transition-all text-sm flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" /></svg>
            <span>Return to Catalog Hub</span>
          </button>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-900/60 bg-slate-950 py-6 text-center text-xs text-slate-500 z-10">
        <p>© 2026 Allo Engineering Take-Home Exercise. Crafted for high-concurrency operations.</p>
      </footer>
    </main>
  );
}
