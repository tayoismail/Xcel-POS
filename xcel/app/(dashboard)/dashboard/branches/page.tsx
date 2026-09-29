import { Store } from "lucide-react";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Branches" };

export default async function BranchesPage() {
  const session = await getSessionUser();
  if (!session) redirect("/login");

  // Staff are strictly POS-only (mirrors the sidebar visibility rule)
  if (session.role === "STAFF") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Branches"
        description="Multi-branch management for locations and staff."
      />
      <Card>
        <CardContent>
          <EmptyState
            icon={Store}
            title="Branch management is coming soon"
            description="Add locations, assign staff and compare performance across branches."
          />
        </CardContent>
      </Card>
    </div>
  );
}
