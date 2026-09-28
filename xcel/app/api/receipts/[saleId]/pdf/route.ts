import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { ReceiptPdf } from "@/lib/pdf";

export const dynamic = "force-dynamic";

type DecimalLike = { toString(): string };
const NGN = (v: string | number | DecimalLike) =>
  `NGN ${Number(v).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ saleId: string }> },
) {
  const session = await getSessionUser();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { saleId } = await params;
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, businessId: session.businessId },
    select: {
      invoiceNo: true,
      createdAt: true,
      paymentMethod: true,
      paymentStatus: true,
      totalAmount: true,
      totalPaid: true,
      due: true,
      location: { select: { name: true } },
      customer: { select: { name: true } },
      soldBy: { select: { name: true } },
      business: { select: { name: true } },
      items: {
        select: {
          qty: true,
          unitPrice: true,
          discount: true,
          subtotal: true,
          product: { select: { name: true } },
        },
      },
    },
  });
  if (!sale) {
    return new Response("Not found", { status: 404 });
  }

  const pdf = new ReceiptPdf();
  const center = (s: string, size = 8, bold = false) =>
    pdf.text(s, { size, bold, align: "center", max: pdf.width - 28 });
  const row = (l: string, r: string, size = 8, bold = false) =>
    pdf.row(l, r, { size, bold });

  center(sale.business.name.toUpperCase(), 11, true);
  center(sale.location.name, 7.5);
  pdf.line();
  pdf.text(`Receipt ${sale.invoiceNo}`, { size: 7.5 });
  pdf.text(
    `Date: ${sale.createdAt.toLocaleString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}`,
    { size: 7.5 },
  );
  pdf.text(`Cashier: ${sale.soldBy.name}`, { size: 7.5 });
  pdf.text(`Customer: ${sale.customer?.name ?? "Walk-in"}`, { size: 7.5, max: 180 });
  pdf.line({ dashed: true });

  for (const item of sale.items) {
    pdf.row(`${item.qty} x ${item.product.name}`, NGN(item.subtotal), { size: 8 });
  }

  pdf.line({ dashed: true });
  const subtotal = sale.items.reduce((s, i) => s + Number(i.subtotal), 0);
  const discount = sale.items.reduce((s, i) => s + Number(i.discount), 0);
  row("Subtotal", NGN(subtotal));
  if (discount > 0) row("Discount", `-${NGN(discount)}`);
  row("TOTAL", NGN(sale.totalAmount), 10, true);
  row(`Paid (${sale.paymentMethod})`, NGN(sale.totalPaid));
  if (Number(sale.due) > 0) row("DUE", NGN(sale.due), 10, true);
  pdf.line({ dashed: true });
  pdf.gap(2);
  center("Thank you for your purchase!", 7.5);
  center("Powered by Xcel POS", 6.5);

  // Bottom-anchored block like a printed receipt
  const bytes = pdf.build(`Receipt ${sale.invoiceNo}`);

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="receipt-${sale.invoiceNo}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}


