import { redirect } from "next/navigation";

import { QuotationsTable } from "@/components/dashboard/quotations-table";
import { PageHeader } from "@/components/shared/page-header";
import { getSessionUser } from "@/lib/auth";

export const metadata = { title: "Quotations" };

export default async function QuotationsPage() {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  if (session.role === "STAFF") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quotations"
        description="Draft price quotes for customers and convert them into invoices or POS sales."
      />
      <QuotationsTable />
    </div>
  );
}
