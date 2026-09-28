import { redirect } from "next/navigation";

import { PurchasesTable } from "@/components/dashboard/purchases-table";
import { PageHeader } from "@/components/shared/page-header";
import { getSessionUser } from "@/lib/auth";

export const metadata = { title: "Purchases" };

export default async function PurchasesPage() {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  if (session.role === "STAFF") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchases"
        description="Record supplier purchases and receive stock into your locations."
      />
      <PurchasesTable />
    </div>
  );
}
