import { Users } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Customers" };

export default function CustomersPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="CRM for walk-ins and regulars — contact details and purchase history."
      />
      <Card>
        <CardContent>
          <EmptyState
            icon={Users}
            title="Customer profiles are coming soon"
            description="Search customers, review purchase history and manage credit accounts from here."
          />
        </CardContent>
      </Card>
    </div>
  );
}
