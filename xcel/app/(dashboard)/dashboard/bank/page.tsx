import { redirect } from "next/navigation";

import { AccountsManager } from "@/components/dashboard/accounts-manager";
import { PageHeader } from "@/components/shared/page-header";
import { getSessionUser } from "@/lib/auth";

export const metadata = { title: "Bank & Cash" };

export default async function BankPage() {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  if (session.role === "STAFF") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bank & Cash Accounts"
        description="Balances fed by sales, expenses and payments — adjust or transfer with a full audit trail."
      />
      <AccountsManager />
    </div>
  );
}
