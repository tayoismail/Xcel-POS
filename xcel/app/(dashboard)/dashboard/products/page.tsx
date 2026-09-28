import { ProductsTable } from "@/components/dashboard/products-table";
import { listProductsAction } from "@/app/actions/products";
import { getSessionUser } from "@/lib/auth";
import { PageHeader } from "@/components/shared/page-header";
import { redirect } from "next/navigation";

export const metadata = { title: "Products" };

export default async function ProductsPage() {
  const session = await getSessionUser();
  if (!session) redirect("/login");

  const initial = await listProductsAction({ page: 1, pageSize: 25 });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        description="Manage your catalog, prices and stock alert thresholds."
      />
      <ProductsTable initialRows={initial.rows} userRole={session.role} />
    </div>
  );
}
