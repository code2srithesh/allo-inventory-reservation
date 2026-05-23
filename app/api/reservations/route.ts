import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createReservationSchema } from "@/lib/validations";

export async function POST(req: Request) {
  try {
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
      const stock = await tx.stock.findUnique({
        where: {
          productId_warehouseId: {
            productId,
            warehouseId,
          },
        },
      });

      if (!stock) {
        throw new Error("STOCK_NOT_FOUND");
      }

      const availableUnits = stock.totalUnits - stock.reservedUnits;

      if (availableUnits < quantity) {
        throw new Error("INSUFFICIENT_STOCK");
      }

      const updatedStock = await tx.stock.updateMany({
        where: {
          productId,
          warehouseId,
          reservedUnits: {
            lte: stock.totalUnits - quantity,
          },
        },
        data: {
          reservedUnits: {
            increment: quantity,
          },
        },
      });

      if (updatedStock.count === 0) {
        throw new Error("INSUFFICIENT_STOCK");
      }

      return tx.reservation.create({
        data: {
          productId,
          warehouseId,
          quantity,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        },
        include: {
          product: true,
          warehouse: true,
        },
      });
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

    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}