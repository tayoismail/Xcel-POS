import { redirect } from "next/navigation";

import { ExpensesTable } from "@/components/dashboard/expenses-table";
import { PageHeader } from "@/components/shared/page-header";
import { getSessionUser } from "@/lib/auth";

export const metadata = { title: "Expenses" };

export default async function ExpensesPage() {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  if (session.role === "STAFF") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses"
        description="Track spend by category, description, account and date — net sales on the dashboard update automatically."
      />
      <ExpensesTable />
    </div>
  );
}
