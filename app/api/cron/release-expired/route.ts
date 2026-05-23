import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const expiredReservations = await prisma.reservation.findMany({
    where: {
      status: "PENDING",
      expiresAt: {
        lt: new Date(),
      },
    },
  });

  for (const reservation of expiredReservations) {
    await prisma.$transaction(async (tx) => {
      const fresh = await tx.reservation.findUnique({
        where: { id: reservation.id },
      });

      if (!fresh || fresh.status !== "PENDING") return;

      await tx.stock.update({
        where: {
          productId_warehouseId: {
            productId: fresh.productId,
            warehouseId: fresh.warehouseId,
          },
        },
        data: {
          reservedUnits: {
            decrement: fresh.quantity,
          },
        },
      });

      await tx.reservation.update({
        where: { id: fresh.id },
        data: { status: "RELEASED" },
      });
    });
  }

  return NextResponse.json({
    released: expiredReservations.length,
  });
}