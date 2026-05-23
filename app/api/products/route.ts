import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const products = await prisma.product.findMany({
    include: {
      stocks: {
        include: {
          warehouse: true,
        },
      },
    },
  });

  const result = products.map((product) => ({
    id: product.id,
    name: product.name,
    sku: product.sku,
    description: product.description,
    stocks: product.stocks.map((stock) => ({
      stockId: stock.id,
      warehouseId: stock.warehouseId,
      warehouseName: stock.warehouse.name,
      warehouseLocation: stock.warehouse.location,
      totalUnits: stock.totalUnits,
      reservedUnits: stock.reservedUnits,
      availableUnits: stock.totalUnits - stock.reservedUnits,
    })),
  }));

  return NextResponse.json(result);
}