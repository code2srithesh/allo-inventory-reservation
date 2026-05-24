import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createReservationSchema } from "@/lib/validations";
import { handleIdempotentRequest } from "@/lib/idempotency";
import { lazyCleanup } from "@/lib/lazy-cleanup";
import { Stock } from "@prisma/client";

export async function POST(req: Request) {
  return handleIdempotentRequest(req, async () => {
    try {
      // 1. Run lazy cleanup to release any expired reservations before checking stock
      await lazyCleanup();

      const body = await req.json();
      const parsed = createReservationSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid request data" },
          { status: 400 }
        );
      }

      const { productId, warehouseId, quantity } = parsed.data;

      const reservation = await prisma.$transaction(async (tx) => {
        // Concurrency Control: Lock the stock row immediately using SELECT ... FOR UPDATE
        const stockList = await tx.$queryRaw<Stock[]>`
          SELECT * FROM "Stock"
          WHERE "productId" = ${productId} AND "warehouseId" = ${warehouseId}
          FOR UPDATE
        `;
        const stock = stockList[0];

        if (!stock) {
          throw new Error("STOCK_NOT_FOUND");
        }

        const availableUnits = stock.totalUnits - stock.reservedUnits;

        if (availableUnits < quantity) {
          throw new Error("INSUFFICIENT_STOCK");
        }

        // Perform the update on the locked row
        await tx.stock.update({
          where: { id: stock.id },
          data: {
            reservedUnits: {
              increment: quantity,
            },
          },
        });

        // Create the pending reservation
        return tx.reservation.create({
          data: {
            productId,
            warehouseId,
            quantity,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10-minute hold
          },
          include: {
            product: true,
            warehouse: true,
          },
        });
      }, {
        timeout: 30000,
      });

      return NextResponse.json(reservation, { status: 201 });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "INSUFFICIENT_STOCK") {
          return NextResponse.json(
            { error: "Not enough stock available" },
            { status: 409 }
          );
        }

        if (error.message === "STOCK_NOT_FOUND") {
          return NextResponse.json(
            { error: "Stock not found for this warehouse" },
            { status: 404 }
          );
        }
      }

      console.error("Reservation creation error:", error);
      return NextResponse.json(
        { error: "Something went wrong" },
        { status: 500 }
      );
    }
  });
}