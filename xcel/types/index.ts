export type SaleStatus = "DRAFT" | "PAID" | "REFUNDED" | "PARTIALLY_REFUNDED";

export interface DashboardKpi {
  label: string;
  value: string;
  delta?: string;
  trend?: "up" | "down";
}

export interface ProductListItem {
  id: string;
  name: string;
  sku: string;
  category: string | null;
  price: number;
  stock: number;
}

export interface RecentSale {
  id: string;
  customer: string | null;
  total: number;
  status: SaleStatus;
  createdAt: string;
}
