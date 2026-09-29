import { redirect } from "next/navigation";

import { getDashboardStats } from "@/app/actions/dashboard";
import { DashboardHome } from "@/components/dashboard/dashboard-home";
import { getSessionUser } from "@/lib/auth";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  // Salespeople work from the POS terminal only.
  if (session.role === "STAFF") redirect("/dashboard/pos");

  const now = new Date();
  const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const stats = await getDashboardStats({ from: ymd, to: ymd });

  return (
    <DashboardHome
      businessId={session.businessId}
      role={session.role}
      userName={session.name}
      businessName={session.businessName}
      initialStats={stats}
    />
  );
}
