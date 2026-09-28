/**
 * Xcel POS — database seed
 * Creates a demo business "Xcel Demo" with one location, staff users,
 * phone-parts style products, suppliers, customers, purchases, sales,
 * payments, expenses and supporting records.
 *
 * Run with: npx prisma db seed   (or: npx tsx prisma/seed.ts)
 * Requires a reachable DATABASE_URL / DIRECT_URL (Supabase or local Postgres).
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const money = (n: number) => n.toFixed(2);
const daysAgo = (n: number, hours = 0) =>
  new Date(Date.now() - n * 86_400_000 - hours * 3_600_000);

/** Add stock for a product at the main location and log a PURCHASE movement. */
async function addStock(
  productId: string,
  locationId: string,
  qty: number,
  createdById: string,
  referenceId: string,
) {
  await prisma.stockLevel.upsert({
    where: { productId_locationId: { productId, locationId } },
    update: { quantity: { increment: qty } },
    create: { productId, locationId, quantity: qty },
  });
  await prisma.stockMovement.create({
    data: {
      productId,
      locationId,
      type: "PURCHASE",
      quantity: qty,
      referenceId,
      notes: "Initial stock from purchase",
      createdById,
    },
  });
}

/** Create a completed sale: items, stock deduction, movements and payment. */
async function createSale(opts: {
  businessId: string;
  locationId: string;
  invoiceNo: string;
  customerId: string | null;
  soldById: string;
  paymentMethod: "CASH" | "TRANSFER" | "POS" | "SPLIT" | "CREDIT";
  createdAt: Date;
  accountId: string | null;
  items: { productId: string; qty: number; unitPrice: number; discount?: number }[];
}) {
  const itemsTotal = opts.items.map((i) => ({
    ...i,
    subtotal: i.qty * i.unitPrice - (i.discount ?? 0),
  }));
  const totalAmount = itemsTotal.reduce((s, i) => s + i.subtotal, 0);
  const itemsCount = opts.items.reduce((s, i) => s + i.qty, 0);
  const paid = opts.paymentMethod === "CREDIT" ? totalAmount * 0.4 : totalAmount;
  const due = totalAmount - paid;
  const paymentStatus = due === 0 ? "PAID" : paid === 0 ? "UNPAID" : "PARTIAL";

  const sale = await prisma.sale.create({
    data: {
      businessId: opts.businessId,
      locationId: opts.locationId,
      invoiceNo: opts.invoiceNo,
      customerId: opts.customerId,
      soldById: opts.soldById,
      status: "COMPLETED",
      paymentMethod: opts.paymentMethod,
      paymentStatus,
      totalAmount: money(totalAmount),
      totalPaid: money(paid),
      due: money(due),
      itemsCount,
      createdAt: opts.createdAt,
      updatedAt: opts.createdAt,
      items: {
        create: itemsTotal.map((i) => ({
          productId: i.productId,
          qty: i.qty,
          unitPrice: money(i.unitPrice),
          discount: money(i.discount ?? 0),
          subtotal: money(i.subtotal),
        })),
      },
    },
  });

  for (const item of itemsTotal) {
    await prisma.stockLevel.upsert({
      where: {
        productId_locationId: {
          productId: item.productId,
          locationId: opts.locationId,
        },
      },
      update: { quantity: { decrement: item.qty } },
      create: {
        productId: item.productId,
        locationId: opts.locationId,
        quantity: -item.qty,
      },
    });
    await prisma.stockMovement.create({
      data: {
        productId: item.productId,
        locationId: opts.locationId,
        type: "SALE",
        quantity: -item.qty,
        referenceId: sale.id,
        notes: `Sale ${opts.invoiceNo}`,
        createdById: opts.soldById,
        createdAt: opts.createdAt,
      },
    });
  }

  if (paid > 0) {
    await prisma.payment.create({
      data: {
        saleId: sale.id,
        method: opts.paymentMethod === "CREDIT" ? "CASH" : opts.paymentMethod,
        amount: money(paid),
        accountId: opts.accountId,
        reference: `RCPT-${opts.invoiceNo}`,
        createdAt: opts.createdAt,
      },
    });
  }

  return sale;
}

async function main() {
  // --------------------------------------------------------------- safety
  // The seed wipes the whole database. Refuse to run against a DB that
  // contains anything other than the demo business, unless explicitly
  // forced. Protects a live/production database from accidental wipes.
  const existingBusinesses = await prisma.business.findMany({ select: { name: true } });
  const hasRealBusiness = existingBusinesses.some((b) => b.name !== "Xcel Demo");
  if (hasRealBusiness && process.env.SEED_FORCE !== "true") {
    console.error(
      "🛑 Seed aborted: this database contains a non-demo business.\n" +
        "   Seeding would DELETE all of its data (sales, stock, users, ...).\n" +
        "   If you are sure this is a disposable database, re-run with:  SEED_FORCE=true npm run db:seed",
    );
    process.exit(1);
  }

  // ------------------------------------------------------------------ wipe
  // Delete in FK-safe order so the seed is re-runnable.
  await prisma.auditLog.deleteMany();
  await prisma.productionLog.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.saleItem.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.invoiceItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.quotationItem.deleteMany();
  await prisma.quotation.deleteMany();
  await prisma.purchaseItem.deleteMany();
  await prisma.purchase.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.bankAccount.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.stockLevel.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();
  await prisma.location.deleteMany();
  await prisma.business.deleteMany();

  // -------------------------------------------------------------- business
  const business = await prisma.business.create({
    data: { name: "Xcel Demo", currency: "NGN" },
  });

  const location = await prisma.location.create({
    data: {
      businessId: business.id,
      name: "Head Office — Ikeja",
      address: "12 Computer Village Road, Ikeja, Lagos",
    },
  });

  // ----------------------------------------------------------------- users
  const owner = await prisma.user.create({
    data: {
      email: "owner@xceldemo.com",
      name: "Ada Obi",
      role: "OWNER",
      businessId: business.id,
    },
  });
  const manager = await prisma.user.create({
    data: {
      email: "manager@xceldemo.com",
      name: "Chinedu Okafor",
      role: "MANAGER",
      businessId: business.id,
    },
  });
  const staff1 = await prisma.user.create({
    data: {
      email: "staff@xceldemo.com",
      name: "Fatima Bello",
      role: "STAFF",
      businessId: business.id,
    },
  });
  const staff2 = await prisma.user.create({
    data: {
      email: "staff2@xceldemo.com",
      name: "Tunde Adebayo",
      role: "STAFF",
      businessId: business.id,
    },
  });

  // ------------------------------------------------------------ categories
  const categoryNames = [
    "Screens",
    "Batteries",
    "Charging",
    "Cases & Covers",
    "Audio",
    "Tools",
  ];
  const categories = await Promise.all(
    categoryNames.map((name) =>
      prisma.category.create({ data: { businessId: business.id, name } }),
    ),
  );
  const [screens, batteries, charging, cases, audio, tools] = categories;

  // -------------------------------------------------------------- products
  // Phone-parts style catalog
  type ProductSeed = {
    name: string;
    sku: string;
    barcode: string;
    categoryId: string;
    brand: string;
    price: number;
    costPrice: number;
    alertAt?: number;
    unit?: string;
  };

  const productSeeds: ProductSeed[] = [
    { name: "iPhone 12 Screen Assembly", sku: "SCR-IP12", barcode: "501001", categoryId: screens.id, brand: "OEM", price: 42000, costPrice: 31000 },
    { name: "iPhone 13 Screen Assembly", sku: "SCR-IP13", barcode: "501002", categoryId: screens.id, brand: "OEM", price: 58000, costPrice: 44000 },
    { name: "Samsung S21 Screen Assembly", sku: "SCR-S21", barcode: "501003", categoryId: screens.id, brand: "Samsung", price: 49000, costPrice: 37000 },
    { name: "iPhone 11 Battery", sku: "BAT-IP11", barcode: "501004", categoryId: batteries.id, brand: "OEM", price: 14000, costPrice: 8500 },
    { name: "Samsung A52 Battery", sku: "BAT-A52", barcode: "501005", categoryId: batteries.id, brand: "Samsung", price: 9500, costPrice: 6000 },
    { name: "20W Fast Charger (USB-C)", sku: "CHG-20W", barcode: "501006", categoryId: charging.id, brand: "Anker", price: 12500, costPrice: 8000, alertAt: 10 },
    { name: "USB-C to Lightning Cable 1m", sku: "CBL-CL1", barcode: "501007", categoryId: charging.id, brand: "OEM", price: 6500, costPrice: 3800, alertAt: 15 },
    { name: "iPhone 12 Clear Case", sku: "CSE-IP12", barcode: "501008", categoryId: cases.id, brand: "Spigen", price: 5500, costPrice: 2800, alertAt: 12 },
    { name: "Tempered Glass Screen Protector", sku: "ACC-TGL", barcode: "501009", categoryId: cases.id, brand: "Generic", price: 2500, costPrice: 900, alertAt: 20 },
    { name: "iPhone X Loudspeaker", sku: "SPK-IPX", barcode: "501010", categoryId: audio.id, brand: "OEM", price: 8000, costPrice: 5200 },
    { name: "Phone Opening Tool Kit (24pc)", sku: "TOL-K24", barcode: "501011", categoryId: tools.id, brand: "Sunshine", price: 11000, costPrice: 7000 },
    { name: "Heat Gun / Separator Machine", sku: "TOL-SEP", barcode: "501012", categoryId: tools.id, brand: "Sunshine", price: 65000, costPrice: 52000, unit: "unit", alertAt: 2 },
    // Extended phone-parts catalog
    { name: "iPhone 11 Screen Assembly", sku: "SCR-IP11", barcode: "501013", categoryId: screens.id, brand: "OEM", price: 32000, costPrice: 23000 },
    { name: "iPhone XR Screen Assembly", sku: "SCR-IPXR", barcode: "501014", categoryId: screens.id, brand: "OEM", price: 28000, costPrice: 20000 },
    { name: "Samsung A32 Screen Assembly", sku: "SCR-A32", barcode: "501015", categoryId: screens.id, brand: "Samsung", price: 26000, costPrice: 19000 },
    { name: "iPhone 13 Pro Battery", sku: "BAT-IP13P", barcode: "501016", categoryId: batteries.id, brand: "OEM", price: 18000, costPrice: 11500 },
    { name: "Redmi Note 11 Battery", sku: "BAT-RN11", barcode: "501017", categoryId: batteries.id, brand: "Xiaomi", price: 7000, costPrice: 4200 },
    { name: "iPhone 12 Back Glass (Blue)", sku: "BKG-IP12", barcode: "501018", categoryId: screens.id, brand: "OEM", price: 9500, costPrice: 6200 },
    { name: "65W GaN Charger (Dual USB-C)", sku: "CHG-65W", barcode: "501019", categoryId: charging.id, brand: "Anker", price: 22000, costPrice: 15000, alertAt: 8 },
    { name: "Wireless Charging Pad 15W", sku: "CHG-W15", barcode: "501020", categoryId: charging.id, brand: "Anker", price: 10500, costPrice: 6800, alertAt: 8 },
    { name: "USB-C to USB-C Cable 2m", sku: "CBL-CC2", barcode: "501021", categoryId: charging.id, brand: "OEM", price: 4800, costPrice: 2600, alertAt: 20 },
    { name: "iPhone 13 Silicone Case (Black)", sku: "CSE-IP13", barcode: "501022", categoryId: cases.id, brand: "Spigen", price: 7800, costPrice: 4200, alertAt: 12 },
    { name: "Samsung S21 Clear Case", sku: "CSE-S21", barcode: "501023", categoryId: cases.id, brand: "Spigen", price: 6200, costPrice: 3300, alertAt: 12 },
    { name: "Ring Holder Phone Stand", sku: "ACC-RHS", barcode: "501024", categoryId: cases.id, brand: "Generic", price: 1800, costPrice: 700, alertAt: 25 },
    { name: "iPhone 11 Earpiece Speaker", sku: "SPK-IP11", barcode: "501025", categoryId: audio.id, brand: "OEM", price: 6500, costPrice: 3900 },
    { name: "Universal Bluetooth Earpiece", sku: "AUD-BT1", barcode: "501026", categoryId: audio.id, brand: "Oraimo", price: 13500, costPrice: 8900, alertAt: 10 },
    { name: "Oraimo FreePods 4", sku: "AUD-FP4", barcode: "501027", categoryId: audio.id, brand: "Oraimo", price: 24500, costPrice: 17000, alertAt: 6 },
    { name: "Precision Screwdriver Set (25in1)", sku: "TOL-SD25", barcode: "501028", categoryId: tools.id, brand: "Sunshine", price: 8500, costPrice: 5200, alertAt: 8 },
    { name: "Screen Separator Wire (0.1mm)", sku: "TOL-SSW", barcode: "501029", categoryId: tools.id, brand: "Sunshine", price: 3200, costPrice: 1800, alertAt: 15 },
    { name: "Universal PCB Holder Clamp", sku: "TOL-PCH", barcode: "501030", categoryId: tools.id, brand: "Sunshine", price: 7500, costPrice: 4800, alertAt: 6 },
  ];

  const products: Record<string, string> = {}; // sku -> id
  for (const p of productSeeds) {
    const created = await prisma.product.create({
      data: {
        businessId: business.id,
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        categoryId: p.categoryId,
        brand: p.brand,
        description: `${p.brand} ${p.name}`,
        price: money(p.price),
        costPrice: money(p.costPrice),
        unit: p.unit ?? "pcs",
        alertAt: p.alertAt ?? 5,
        status: "ACTIVE",
      },
    });
    products[p.sku] = created.id;
  }

  // ---------------------------------------------------------- bank accounts
  const [cash, bank, pos] = await Promise.all(
    (
      [
        { name: "Cash Drawer", type: "CASH" as const, balance: 85000 },
        { name: "GTBank Current", type: "BANK" as const, accountNumber: "0123456789", balance: 1250000 },
        { name: "Moniepoint POS", type: "POS" as const, accountNumber: "MP-88213", balance: 240000 },
        { name: "Opay Business", type: "BANK" as const, accountNumber: "OP-60419", balance: 165000 },
      ] as const
    ).map((a) =>
      prisma.bankAccount.create({
        data: { businessId: business.id, ...a, balance: money(a.balance) },
      }),
    ),
  );

  // -------------------------------------------------------------- suppliers
  const supplier1 = await prisma.supplier.create({
    data: {
      businessId: business.id,
      name: "Ikeja Phone Parts Ltd",
      phone: "+2348031234567",
      email: "sales@ikejaphoneparts.ng",
      address: "Circle Mall, Jakande, Lagos",
    },
  });
  const supplier2 = await prisma.supplier.create({
    data: {
      businessId: business.id,
      name: "Global Mobile Spares",
      phone: "+2348059876543",
      email: "orders@globalmobilespares.com",
      address: "Trade Fair Complex, Badagry Expy, Lagos",
    },
  });

  // -------------------------------------------------------------- customers
  // Walk-in customer is created for reference data even though no sale uses it directly.
  await prisma.customer.create({
    data: { businessId: business.id, name: "Walk-in Customer", type: "WALK_IN" },
  });
  const jane = await prisma.customer.create({
    data: {
      businessId: business.id,
      name: "Jane Cooper",
      phone: "+2348011112222",
      email: "jane.cooper@example.com",
      type: "REGISTERED",
    },
  });
  const robert = await prisma.customer.create({
    data: {
      businessId: business.id,
      name: "Robert Fox",
      phone: "+2348077778888",
      email: "robert.fox@example.com",
      type: "REGISTERED",
    },
  });

  // -------------------------------------------------------------- purchases
  const purchase1 = await prisma.purchase.create({
    data: {
      businessId: business.id,
      locationId: location.id,
      referenceNo: "PUR-0001",
      supplierId: supplier1.id,
      status: "RECEIVED",
      paymentStatus: "PAID",
      paymentDue: daysAgo(20),
      addedById: manager.id,
      date: daysAgo(21),
      createdAt: daysAgo(21),
      updatedAt: daysAgo(21),
    },
  });
  const purchase1Items = [
    { productId: products["SCR-IP12"], qty: 10, unitCost: 31000 },
    { productId: products["SCR-IP13"], qty: 8, unitCost: 44000 },
    { productId: products["BAT-IP11"], qty: 15, unitCost: 8500 },
    { productId: products["CBL-CL1"], qty: 30, unitCost: 3800 },
  ];
  let p1Total = 0;
  for (const item of purchase1Items) {
    const subtotal = item.qty * item.unitCost;
    p1Total += subtotal;
    await prisma.purchaseItem.create({
      data: {
        purchaseId: purchase1.id,
        productId: item.productId,
        qty: item.qty,
        unitCost: money(item.unitCost),
        subtotal: money(subtotal),
      },
    });
    await addStock(item.productId, location.id, item.qty, manager.id, purchase1.id);
  }
  await prisma.purchase.update({
    where: { id: purchase1.id },
    data: { grandTotal: money(p1Total) },
  });
  await prisma.payment.create({
    data: {
      purchaseId: purchase1.id,
      method: "TRANSFER",
      amount: money(p1Total),
      accountId: bank.id,
      reference: "RCPT-PUR-0001",
      createdAt: daysAgo(21),
    },
  });

  const purchase2 = await prisma.purchase.create({
    data: {
      businessId: business.id,
      locationId: location.id,
      referenceNo: "PUR-0002",
      supplierId: supplier2.id,
      status: "PENDING",
      paymentStatus: "UNPAID",
      paymentDue: daysAgo(-14), // due in 14 days
      addedById: owner.id,
      date: daysAgo(1),
      createdAt: daysAgo(1),
    },
  });
  const purchase2Items = [
    { productId: products["CHG-20W"], qty: 25, unitCost: 8000 },
    { productId: products["CSE-IP12"], qty: 40, unitCost: 2800 },
    { productId: products["ACC-TGL"], qty: 60, unitCost: 900 },
  ];
  let p2Total = 0;
  for (const item of purchase2Items) {
    const subtotal = item.qty * item.unitCost;
    p2Total += subtotal;
    await prisma.purchaseItem.create({
      data: {
        purchaseId: purchase2.id,
        productId: item.productId,
        qty: item.qty,
        unitCost: money(item.unitCost),
        subtotal: money(subtotal),
      },
    });
    // PENDING purchase: log nothing to stock until received
  }
  await prisma.purchase.update({
    where: { id: purchase2.id },
    data: { grandTotal: money(p2Total) },
  });

  // ------------------------------------------------------------------ sales
  await createSale({
    businessId: business.id,
    locationId: location.id,
    invoiceNo: "INV-0001",
    customerId: null,
    soldById: staff1.id,
    paymentMethod: "CASH",
    accountId: cash.id,
    createdAt: daysAgo(6, 3),
    items: [
      { productId: products["CBL-CL1"], qty: 2, unitPrice: 6500 },
      { productId: products["ACC-TGL"], qty: 1, unitPrice: 2500 },
    ],
  });

  await createSale({
    businessId: business.id,
    locationId: location.id,
    invoiceNo: "INV-0002",
    customerId: jane.id,
    soldById: staff1.id,
    paymentMethod: "TRANSFER",
    accountId: bank.id,
    createdAt: daysAgo(4, 5),
    items: [
      { productId: products["SCR-IP12"], qty: 1, unitPrice: 42000, discount: 2000 },
      { productId: products["TOL-K24"], qty: 1, unitPrice: 11000 },
    ],
  });

  await createSale({
    businessId: business.id,
    locationId: location.id,
    invoiceNo: "INV-0003",
    customerId: null,
    soldById: staff2.id,
    paymentMethod: "POS",
    accountId: pos.id,
    createdAt: daysAgo(3, 2),
    items: [
      { productId: products["CSE-IP12"], qty: 2, unitPrice: 5500 },
      { productId: products["CHG-20W"], qty: 1, unitPrice: 12500 },
    ],
  });

  const splitSale = await createSale({
    businessId: business.id,
    locationId: location.id,
    invoiceNo: "INV-0004",
    customerId: robert.id,
    soldById: manager.id,
    paymentMethod: "SPLIT",
    accountId: null,
    createdAt: daysAgo(1, 6),
    items: [
      { productId: products["SCR-IP13"], qty: 1, unitPrice: 58000 },
      { productId: products["BAT-IP11"], qty: 1, unitPrice: 14000 },
    ],
  });

  const creditSale = await createSale({
    businessId: business.id,
    locationId: location.id,
    invoiceNo: "INV-0005",
    customerId: robert.id,
    soldById: staff1.id,
    paymentMethod: "CREDIT",
    accountId: null,
    createdAt: daysAgo(0, 4),
    items: [
      { productId: products["BAT-A52"], qty: 3, unitPrice: 9500 },
      { productId: products["SPK-IPX"], qty: 1, unitPrice: 8000 },
    ],
  });

  // One refunded sale (stock returned via RETURN movement)
  const refundedSale = await prisma.sale.create({
    data: {
      businessId: business.id,
      locationId: location.id,
      invoiceNo: "INV-0006",
      customerId: null,
      soldById: staff2.id,
      status: "REFUNDED",
      paymentMethod: "CASH",
      paymentStatus: "PAID",
      totalAmount: money(6500),
      totalPaid: money(6500),
      due: money(0),
      itemsCount: 1,
      createdAt: daysAgo(2, 1),
      updatedAt: daysAgo(1, 2),
      items: {
        create: [
          {
            productId: products["CBL-CL1"],
            qty: 1,
            unitPrice: money(6500),
            discount: money(0),
            subtotal: money(6500),
          },
        ],
      },
    },
  });
  await prisma.payment.create({
    data: {
      saleId: refundedSale.id,
      method: "CASH",
      amount: money(6500),
      accountId: cash.id,
      reference: "RCPT-INV-0006",
      createdAt: daysAgo(2, 1),
    },
  });
  await prisma.stockLevel.upsert({
    where: {
      productId_locationId: { productId: products["CBL-CL1"], locationId: location.id },
    },
    update: { quantity: { increment: 1 } },
    create: { productId: products["CBL-CL1"], locationId: location.id, quantity: 1 },
  });
  await prisma.stockMovement.create({
    data: {
      productId: products["CBL-CL1"],
      locationId: location.id,
      type: "RETURN",
      quantity: 1,
      referenceId: refundedSale.id,
      notes: "Refund of INV-0006",
      createdById: staff2.id,
      createdAt: daysAgo(1, 2),
    },
  });

  // Split payments for INV-0004 (SPLIT = part cash, part transfer)
  await prisma.payment.createMany({
    data: [
      {
        saleId: splitSale.id,
        method: "CASH",
        amount: money(36000),
        accountId: cash.id,
        reference: "RCPT-INV-0004-CASH",
        createdAt: daysAgo(1, 6),
      },
      {
        saleId: splitSale.id,
        method: "TRANSFER",
        amount: money(36000),
        accountId: bank.id,
        reference: "RCPT-INV-0004-TRANSFER",
        createdAt: daysAgo(1, 6),
      },
    ],
  });

  // ------------------------------------------------------------ invoice etc.
  await prisma.invoice.create({
    data: {
      businessId: business.id,
      saleId: creditSale.id,
      customerId: robert.id,
      number: "FINV-0001",
      status: "ISSUED",
      issueDate: daysAgo(0, 4),
      dueDate: daysAgo(-7),
      totalAmount: money(36500),
      amountPaid: money(14600),
      notes: "Payment within 7 days — formal invoice for workshop order",
      items: {
        create: [
          { productId: products["BAT-A52"], name: "Samsung A52 Battery", qty: 3, unitPrice: money(9500), subtotal: money(28500) },
          { productId: products["SPK-IPX"], name: "iPhone X Loudspeaker", qty: 1, unitPrice: money(8000), subtotal: money(8000) },
        ],
      },
    },
  });

  await prisma.quotation.create({
    data: {
      businessId: business.id,
      customerId: jane.id,
      number: "QUO-0001",
      status: "SENT",
      issueDate: daysAgo(1),
      validUntil: daysAgo(-7),
      totalAmount: money(72500),
      notes: "Bundle quote: screen + battery replacement service",
      items: {
        create: [
          { productId: products["SCR-S21"], name: "Samsung S21 Screen Assembly", qty: 1, unitPrice: money(49000), subtotal: money(49000) },
          { productId: products["BAT-IP11"], name: "iPhone 11 Battery", qty: 1, unitPrice: money(14000), subtotal: money(14000) },
          { productId: products["TOL-K24"], name: "Phone Opening Tool Kit (24pc)", qty: 1, unitPrice: money(9500), subtotal: money(9500) },
        ],
      },
    },
  });

  // -------------------------------------------------- expenses & production
  await prisma.expense.createMany({
    data: [
      {
        businessId: business.id,
        category: "Rent",
        description: "Shop rent — September",
        amount: money(150000),
        accountId: bank.id,
        createdById: owner.id,
        date: daysAgo(5),
      },
      {
        businessId: business.id,
        category: "Utilities",
        description: "Electricity (diesel top-up)",
        amount: money(42000),
        accountId: cash.id,
        createdById: manager.id,
        date: daysAgo(3),
      },
      {
        businessId: business.id,
        category: "Internet",
        description: "Fibre subscription",
        amount: money(24500),
        accountId: bank.id,
        createdById: manager.id,
        date: daysAgo(2),
      },
    ],
  });

  await prisma.productionLog.create({
    data: {
      businessId: business.id,
      productId: products["TOL-K24"],
      quantity: 10,
      notes: "Bundled 10 tool kits from bulk components",
      createdById: staff1.id,
      createdAt: daysAgo(4),
    },
  });

  await prisma.auditLog.createMany({
    data: [
      {
        businessId: business.id,
        userId: manager.id,
        action: "PURCHASE_RECEIVE",
        entity: "Purchase",
        entityId: purchase1.id,
        meta: { referenceNo: "PUR-0001", items: 4 },
        createdAt: daysAgo(21),
      },
      {
        businessId: business.id,
        userId: staff1.id,
        action: "SALE_CREATE",
        entity: "Sale",
        entityId: creditSale.id,
        meta: { invoiceNo: "INV-0005", total: 36500 },
        createdAt: daysAgo(0, 4),
      },
    ],
  });

  console.log("✅ Seed complete — Xcel Demo is ready");
  console.log(`   Business: ${business.name} (${business.id})`);
  console.log(`   Location: ${location.name}`);
  console.log(`   Users: owner@xceldemo.com, manager@xceldemo.com, staff@xceldemo.com, staff2@xceldemo.com`);
  console.log(`   Products: ${productSeeds.length} · Sales: 6 · Purchases: 2`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
