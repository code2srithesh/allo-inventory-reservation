import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { lazyCleanup } from "@/lib/lazy-cleanup";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Real-time cleanup in background to keep GET response ultra-fast
  lazyCleanup().catch((err) => console.error("Lazy cleanup error:", err));

  const { id } = await params;

  const reservation = await prisma.reservation.findUnique({
    where: { id },
    include: {
      product: true,
      warehouse: true,
    },
  });

  if (!reservation) {
    return NextResponse.json(
      { error: "Reservation not found" },
      { status: 404 }
    );
  }

  return NextResponse.json(reservation);
}
