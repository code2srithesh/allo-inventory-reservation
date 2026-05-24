import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleIdempotentRequest } from "@/lib/idempotency";
import { Reservation, Stock } from "@prisma/client";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleIdempotentRequest(req, async () => {
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

        // If it was already confirmed, return it safely (idempotent case)
        if (reservation.status === "CONFIRMED") {
          return tx.reservation.findUnique({
            where: { id },
            include: { product: true, warehouse: true },
          });
        }

        // If it was already released, throw 410 expired error
        if (reservation.status === "RELEASED") {
          throw new Error("RESERVATION_EXPIRED");
        }

        // Check if the timer has expired in real-time
        if (reservation.expiresAt < new Date()) {
          // Lock the stock row to release hold
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

          // Mark reservation as released
          await tx.reservation.update({
            where: { id },
            data: { status: "RELEASED" },
          });

          throw new Error("RESERVATION_EXPIRED");
        }

        // Lock the Stock row for confirming permanent sale
        const stockList = await tx.$queryRaw<Stock[]>`
          SELECT * FROM "Stock"
          WHERE "productId" = ${reservation.productId} AND "warehouseId" = ${reservation.warehouseId}
          FOR UPDATE
        `;
        const stock = stockList[0];

        if (!stock) {
          throw new Error("STOCK_NOT_FOUND");
        }

        // Decrement both totalUnits (permanent purchase) and reservedUnits (release temporary hold)
        await tx.stock.update({
          where: { id: stock.id },
          data: {
            totalUnits: {
              decrement: reservation.quantity,
            },
            reservedUnits: {
              decrement: Math.min(reservation.quantity, stock.reservedUnits),
            },
          },
        });

        // Set status to CONFIRMED
        return tx.reservation.update({
          where: { id },
          data: { status: "CONFIRMED" },
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
      if (error instanceof Error) {
        if (error.message === "RESERVATION_EXPIRED") {
          return NextResponse.json(
            { error: "Reservation has expired and stock was released" },
            { status: 410 }
          );
        }

        if (error.message === "RESERVATION_NOT_FOUND") {
          return NextResponse.json(
            { error: "Reservation not found" },
            { status: 404 }
          );
        }

        if (error.message === "STOCK_NOT_FOUND") {
          return NextResponse.json(
            { error: "Stock record not found for this product/warehouse" },
            { status: 404 }
          );
        }
      }

      console.error("Reservation confirmation error:", error);
      return NextResponse.json(
        { error: "Something went wrong" },
        { status: 500 }
      );
    }
  });
}