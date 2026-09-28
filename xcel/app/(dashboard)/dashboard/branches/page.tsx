import { Store } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Branches" };

export default function BranchesPage() {
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
