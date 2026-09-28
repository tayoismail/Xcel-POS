import { redirect } from "next/navigation";

import { ProductionManager } from "@/components/dashboard/production-manager";
import { PageHeader } from "@/components/shared/page-header";
import { getSessionUser } from "@/lib/auth";

export const metadata = { title: "Production" };

export default async function ProductionPage() {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  if (session.role === "STAFF") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Production"
        description="Log assembly runs to push finished units into stock with a PRODUCTION movement."
      />
      <ProductionManager />
    </div>
  );
}
