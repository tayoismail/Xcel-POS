import { redirect } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { SettingsTabs } from "@/components/dashboard/settings/settings-tabs";
import { getSessionUser } from "@/lib/auth";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  if (session.role === "STAFF") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Manage your team, product categories and bulk uploads."
      />
      <SettingsTabs role={session.role} currentUserId={session.id} />
    </div>
  );
}
