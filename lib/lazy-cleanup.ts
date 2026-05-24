import { prisma } from "./prisma";
import { Reservation, Stock } from "@prisma/client";

/**
 * Automatically releases any expired pending reservations.
 * Uses pessimistic locks to ensure we do not conflict with concurrent confirms or releases.
 */
export async function lazyCleanup() {
  try {
    const expired = await prisma.reservation.findMany({
      where: {
        status: "PENDING",
        expiresAt: {
          lt: new Date(),
        },
      },
      select: {
        id: true,
      },
      take: 10, // process at most 10 at a time to prevent blocking requests
    });

    if (expired.length === 0) return;

    for (const res of expired) {
      await prisma.$transaction(async (tx) => {
        // Lock the reservation row first to prevent other transactions from modifying it
        const lockedList = await tx.$queryRaw<Reservation[]>`
          SELECT * FROM "Reservation" WHERE id = ${res.id} FOR UPDATE
        `;
        const fresh = lockedList[0];

        // If it's no longer PENDING, it was already confirmed or cancelled/released in another transaction
        if (!fresh || fresh.status !== "PENDING") {
          return;
        }

        // Lock the Stock row as well to prevent stock drift
        const stockList = await tx.$queryRaw<Stock[]>`
          SELECT * FROM "Stock"
          WHERE "productId" = ${fresh.productId} AND "warehouseId" = ${fresh.warehouseId}
          FOR UPDATE
        `;
        const stock = stockList[0];

        if (stock) {
          await tx.stock.update({
            where: { id: stock.id },
            data: {
              reservedUnits: {
                decrement: Math.min(fresh.quantity, stock.reservedUnits), // avoid negative reserved units
              },
            },
          });
        }

        await tx.reservation.update({
          where: { id: fresh.id },
          data: {
            status: "RELEASED",
          },
        });
      }, {
        timeout: 30000,
      });
    }
  } catch (error) {
    console.error("Error in lazyCleanup:", error);
  }
}
