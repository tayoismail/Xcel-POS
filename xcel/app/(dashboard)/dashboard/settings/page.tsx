import { Settings2 } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Business profile, taxes, receipts and user management."
      />
      <Card>
        <CardContent>
          <EmptyState
            icon={Settings2}
            title="Settings are coming soon"
            description="Business profile, tax rules, receipt branding and team permissions will be managed here."
          />
        </CardContent>
      </Card>
    </div>
  );
}
