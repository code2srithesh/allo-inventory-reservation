import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findUnique({
        where: { id },
      });

      if (!reservation) {
        throw new Error("RESERVATION_NOT_FOUND");
      }

      if (reservation.status !== "PENDING") {
        return reservation;
      }

      if (reservation.expiresAt < new Date()) {
        await tx.stock.update({
          where: {
            productId_warehouseId: {
              productId: reservation.productId,
              warehouseId: reservation.warehouseId,
            },
          },
          data: {
            reservedUnits: {
              decrement: reservation.quantity,
            },
          },
        });

        await tx.reservation.update({
          where: { id },
          data: { status: "RELEASED" },
        });

        throw new Error("RESERVATION_EXPIRED");
      }

      await tx.stock.update({
        where: {
          productId_warehouseId: {
            productId: reservation.productId,
            warehouseId: reservation.warehouseId,
          },
        },
        data: {
          totalUnits: {
            decrement: reservation.quantity,
          },
          reservedUnits: {
            decrement: reservation.quantity,
          },
        },
      });

      return tx.reservation.update({
        where: { id },
        data: { status: "CONFIRMED" },
        include: {
          product: true,
          warehouse: true,
        },
      });
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "RESERVATION_EXPIRED") {
        return NextResponse.json(
          { error: "Reservation expired" },
          { status: 410 }
        );
      }

      if (error.message === "RESERVATION_NOT_FOUND") {
        return NextResponse.json(
          { error: "Reservation not found" },
          { status: 404 }
        );
      }
    }

    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}