import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth";
import { PageHeader } from "@/components/shared/page-header";
import { ReportsClient } from "@/components/reports/reports-client";

export const metadata = { title: "Reports" };

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function ReportsPage() {
  const session = await getSessionUser();
  if (!session) redirect("/login");

  // Manager-only page (mirrors the sidebar visibility rule)
  if (session.role === "STAFF") redirect("/dashboard");

  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 29);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Every corner of the business, one report away — filter, export, print."
      />
      <ReportsClient
        businessName={session.businessName}
        range={{ from: ymd(from), to: ymd(to) }}
      />
    </div>
  );
}
