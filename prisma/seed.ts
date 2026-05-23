import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.reservation.deleteMany();
  await prisma.stock.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();

  const p1 = await prisma.product.create({
    data: {
      name: "Allo Wellness Kit",
      sku: "ALLO-KIT-001",
      description: "A starter wellness kit for customers.",
    },
  });

  const p2 = await prisma.product.create({
    data: {
      name: "Personal Care Pack",
      sku: "CARE-PACK-002",
      description: "Essential personal care bundle.",
    },
  });

  const w1 = await prisma.warehouse.create({
    data: {
      name: "Bangalore Warehouse",
      location: "Bangalore",
    },
  });

  const w2 = await prisma.warehouse.create({
    data: {
      name: "Mumbai Warehouse",
      location: "Mumbai",
    },
  });

  await prisma.stock.createMany({
    data: [
      {
        productId: p1.id,
        warehouseId: w1.id,
        totalUnits: 5,
        reservedUnits: 0,
      },
      {
        productId: p1.id,
        warehouseId: w2.id,
        totalUnits: 3,
        reservedUnits: 0,
      },
      {
        productId: p2.id,
        warehouseId: w1.id,
        totalUnits: 4,
        reservedUnits: 0,
      },
      {
        productId: p2.id,
        warehouseId: w2.id,
        totalUnits: 2,
        reservedUnits: 0,
      },
    ],
  });

  console.log("Database seeded successfully");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });