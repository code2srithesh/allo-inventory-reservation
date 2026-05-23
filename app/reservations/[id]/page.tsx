"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Reservation = {
  id: string;
  quantity: number;
  status: string;
  expiresAt: string;
  product: {
    name: string;
    sku: string;
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
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadReservation() {
    const res = await fetch(`/api/reservations/${id}`, {
      cache: "no-store",
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Reservation not found");
      return;
    }

    setReservation(data);
  }

  useEffect(() => {
    loadReservation();
  }, []);

  useEffect(() => {
    if (!reservation) return;

    const timer = setInterval(() => {
      const diff = Math.max(
        0,
        Math.floor(
          (new Date(reservation.expiresAt).getTime() - Date.now()) / 1000
        )
      );

      setSecondsLeft(diff);
    }, 1000);

    return () => clearInterval(timer);
  }, [reservation]);

  async function confirmPurchase() {
    setError("");
    setMessage("");

    const res = await fetch(`/api/reservations/${id}/confirm`, {
      method: "POST",
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Could not confirm reservation");
      return;
    }

    setReservation(data);
    setMessage("Purchase confirmed successfully.");
  }

  async function cancelReservation() {
    setError("");
    setMessage("");

    const res = await fetch(`/api/reservations/${id}/release`, {
      method: "POST",
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Could not cancel reservation");
      return;
    }

    setReservation(data);
    setMessage("Reservation cancelled and stock released.");
  }

  if (!reservation) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">
        <p>{error || "Loading..."}</p>
      </main>
    );
  }

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white">
      <div className="mx-auto max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h1 className="text-2xl font-bold">Checkout Reservation</h1>

        <div className="mt-6 space-y-3 text-slate-300">
          <p>
            <span className="text-slate-500">Product:</span>{" "}
            {reservation.product.name}
          </p>
          <p>
            <span className="text-slate-500">SKU:</span>{" "}
            {reservation.product.sku}
          </p>
          <p>
            <span className="text-slate-500">Warehouse:</span>{" "}
            {reservation.warehouse.name}, {reservation.warehouse.location}
          </p>
          <p>
            <span className="text-slate-500">Quantity:</span>{" "}
            {reservation.quantity}
          </p>
          <p>
            <span className="text-slate-500">Status:</span>{" "}
            <span className="font-semibold">{reservation.status}</span>
          </p>
        </div>

        {reservation.status === "PENDING" && (
          <div className="mt-6 rounded-xl bg-slate-950 p-5 text-center">
            <p className="text-slate-400">Reservation expires in</p>
            <p className="mt-2 text-4xl font-bold">
              {minutes}:{seconds.toString().padStart(2, "0")}
            </p>
          </div>
        )}

        {error && (
          <div className="mt-5 rounded-lg border border-red-500 bg-red-950 p-4 text-red-200">
            {error}
          </div>
        )}

        {message && (
          <div className="mt-5 rounded-lg border border-green-500 bg-green-950 p-4 text-green-200">
            {message}
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button
            onClick={confirmPurchase}
            disabled={reservation.status !== "PENDING"}
            className="flex-1 rounded-lg bg-green-500 px-4 py-2 font-semibold text-slate-950 disabled:bg-slate-700 disabled:text-slate-400"
          >
            Confirm Purchase
          </button>

          <button
            onClick={cancelReservation}
            disabled={reservation.status !== "PENDING"}
            className="flex-1 rounded-lg bg-red-500 px-4 py-2 font-semibold text-white disabled:bg-slate-700 disabled:text-slate-400"
          >
            Cancel
          </button>
        </div>

        <button
          onClick={() => router.push("/")}
          className="mt-4 w-full rounded-lg border border-slate-700 px-4 py-2 text-slate-300"
        >
          Back to Products
        </button>
      </div>
    </main>
  );
}