import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { lazyCleanup } from "@/lib/lazy-cleanup";

export async function GET() {
  // Real-time stock correction: clean up in background to keep GET response ultra-fast
  lazyCleanup().catch((err) => console.error("Lazy cleanup error:", err));

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