import { StockManager } from "@/components/dashboard/stock-manager";
import { getSessionUser } from "@/lib/auth";
import { PageHeader } from "@/components/shared/page-header";
import { redirect } from "next/navigation";

export const metadata = { title: "Stock Manager" };

export default async function InventoryPage() {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  if (session.role === "STAFF") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock Manager"
        description="Track stock levels per location and audit every movement."
      />
      <StockManager userRole={session.role} />
    </div>
  );
}
