import Link from "next/link";
import { redirect } from "next/navigation";
import { ScanBarcode } from "lucide-react";

import { getSessionUser } from "@/lib/auth";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { PosSalesTable } from "@/components/dashboard/pos-sales-table";

export const metadata = { title: "POS Sales" };

export default async function PosSalesPage() {
  const session = await getSessionUser();
  if (!session) redirect("/login");

  return (
    <div className="space-y-6">
      <PageHeader
        title="POS Sales"
        description="Every checkout in one place — search, filter, edit, refund and print receipts."
        actions={
          <Button asChild>
            <Link href="/pos">
              <ScanBarcode className="size-4" />
              Open POS terminal
            </Link>
          </Button>
        }
      />
      <PosSalesTable userRole={session.role} businessId={session.businessId} />
    </div>
  );
}
