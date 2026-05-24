import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Reservation, Stock } from "@prisma/client";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Concurrency Control: Lock the reservation row immediately using SELECT ... FOR UPDATE
      const resList = await tx.$queryRaw<Reservation[]>`
        SELECT * FROM "Reservation" WHERE id = ${id} FOR UPDATE
      `;
      const reservation = resList[0];

      if (!reservation) {
        throw new Error("RESERVATION_NOT_FOUND");
      }

      // If it is not pending (already confirmed or released), return it as is
      if (reservation.status !== "PENDING") {
        return tx.reservation.findUnique({
          where: { id },
          include: { product: true, warehouse: true },
        });
      }

      // Lock the Stock row for decrementing reserved units safely
      const stockList = await tx.$queryRaw<Stock[]>`
        SELECT * FROM "Stock"
        WHERE "productId" = ${reservation.productId} AND "warehouseId" = ${reservation.warehouseId}
        FOR UPDATE
      `;
      const stock = stockList[0];

      if (stock) {
        await tx.stock.update({
          where: { id: stock.id },
          data: {
            reservedUnits: {
              decrement: Math.min(reservation.quantity, stock.reservedUnits),
            },
          },
        });
      }

      return tx.reservation.update({
        where: { id },
        data: { status: "RELEASED" },
        include: {
          product: true,
          warehouse: true,
        },
      });
    }, {
      timeout: 30000,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "RESERVATION_NOT_FOUND") {
      return NextResponse.json(
        { error: "Reservation not found" },
        { status: 404 }
      );
    }

    console.error("Reservation release error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
