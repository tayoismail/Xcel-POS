import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  const [biz, users, products, sales, purchases, movements, payments] =
    await Promise.all([
      p.business.count(),
      p.user.count(),
      p.product.count(),
      p.sale.count(),
      p.purchase.count(),
      p.stockMovement.count(),
      p.payment.count(),
    ]);

  console.log(
    `Business: ${biz} | Users: ${users} | Products: ${products} | Sales: ${sales} | Purchases: ${purchases} | StockMovements: ${movements} | Payments: ${payments}`
  );

  const top = await p.sale.findMany({
    take: 3,
    orderBy: { createdAt: "desc" },
    select: {
      invoiceNo: true,
      totalAmount: true,
      paymentMethod: true,
      paymentStatus: true,
    },
  });
  console.log("Latest sales:", JSON.stringify(top, null, 2));

  const sampleStock = await p.stockLevel.findMany({
    take: 3,
    include: { product: { select: { name: true } } },
  });
  console.log(
    "Sample stock:",
    sampleStock.map((s) => `${s.product.name}: ${s.quantity}`).join(" | ")
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
