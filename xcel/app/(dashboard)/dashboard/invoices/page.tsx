import { redirect } from "next/navigation";

import { InvoicesTable } from "@/components/dashboard/invoices-table";
import { PageHeader } from "@/components/shared/page-header";
import { getSessionUser } from "@/lib/auth";

export const metadata = { title: "Invoices" };

export default async function InvoicesPage() {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  if (session.role === "STAFF") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        description="Create invoices manually or generate them from credit sales, then print or save as PDF."
      />
      <InvoicesTable />
    </div>
  );
}
