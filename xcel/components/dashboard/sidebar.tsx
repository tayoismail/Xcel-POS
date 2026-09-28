"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  Banknote,
  BarChart3,
  Boxes,
  ChevronLeft,
  FileText,
  Factory,
  LayoutDashboard,
  LogOut,
  Package,
  ReceiptText,
  ScanBarcode,
  Settings2,
  ShoppingCart,
  Store,
  Users,
} from "lucide-react";

import { signOutAction } from "@/app/actions/auth";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { XcelLogoMark } from "@/components/shared/logo";
import { PendingSubmitButton } from "@/components/shared/pending-submit-button";
import { cn } from "@/lib/utils";

export type SidebarUser = {
  name: string;
  email: string;
  role: "OWNER" | "MANAGER" | "STAFF";
  avatarUrl?: string | null;
};

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Roles allowed to see this item. Omitted = everyone. */
  roles?: Array<SidebarUser["role"]>;
};

type NavSection = {
  label?: string;
  items: NavItem[];
};

const NAV: NavSection[] = [
  {
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Sales & Inventory",
    items: [
      { href: "/dashboard/pos", label: "POS Sales", icon: ScanBarcode },
      { href: "/dashboard/invoices", label: "Invoices", icon: FileText, roles: ["OWNER", "MANAGER"] },
      { href: "/dashboard/purchases", label: "Purchases", icon: ShoppingCart, roles: ["OWNER", "MANAGER"] },
      { href: "/dashboard/products", label: "Products", icon: Boxes },
      { href: "/dashboard/inventory", label: "Stock Manager", icon: ArrowLeftRight },
      { href: "/dashboard/production", label: "Production", icon: Factory, roles: ["OWNER", "MANAGER"] },
      { href: "/dashboard/quotations", label: "Quotations", icon: ReceiptText, roles: ["OWNER", "MANAGER"] },
    ],
  },
  {
    label: "Accounting",
    items: [
      { href: "/dashboard/expenses", label: "Expenses", icon: Banknote, roles: ["OWNER", "MANAGER"] },
      { href: "/dashboard/bank", label: "Bank & Cash Accounts", icon: Package },
      { href: "/dashboard/reports", label: "Reports", icon: BarChart3, roles: ["OWNER", "MANAGER"] },
    ],
  },
  {
    label: "Business",
    items: [
      { href: "/dashboard/customers", label: "Customers", icon: Users },
      { href: "/dashboard/branches", label: "Branches", icon: Store, roles: ["OWNER"] },
      { href: "/dashboard/settings", label: "Settings", icon: Settings2, roles: ["OWNER", "MANAGER"] },
    ],
  },
];



export function Sidebar({
  user,
  className,
  collapsible = true,
  onNavigate,
}: {
  user: SidebarUser;
  className?: string;
  /** Hide the collapse toggle (used inside the mobile drawer). */
  collapsible?: boolean;
  /** Called after a nav link is clicked — used to close the mobile drawer. */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const isCollapsed = collapsed && collapsible;

  const sections = NAV.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) => !item.roles || item.roles.includes(user.role),
    ),
  })).filter((s) => s.items.length > 0);

  return (
    <aside
      data-collapsed={isCollapsed}
      className={cn(
        "group/sidebar relative flex h-full shrink-0 flex-col bg-sidebar text-sidebar-foreground",
        "transition-[width] duration-300 ease-in-out",
        isCollapsed ? "w-[72px]" : "w-64",
        className,
      )}
    >
      {/* Brand — links to the landing page */}
      <Link
        href="/"
        aria-label="Xcel — back to home"
        className={cn(
          "flex h-[72px] shrink-0 items-center border-b border-sidebar-border outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30 focus-visible:ring-inset",
          isCollapsed ? "justify-center px-2" : "gap-3 px-4",
        )}
      >
        <XcelLogoMark className="size-[42px] rounded-lg" />
        {!isCollapsed && (
          <div className="grid leading-tight">
            <span className="text-base font-bold tracking-wider text-white uppercase">
              Xcel
            </span>
            <span className="mt-0.5 text-[10px] font-semibold tracking-wider text-sidebar-foreground/70 uppercase">
              POS
            </span>
          </div>
        )}
      </Link>

      {/* Nav */}
      <nav className="scrollbar-thin flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {sections.map((section, si) => (
          <div key={section.label ?? `section-${si}`}>
            {section.label && !isCollapsed && (
              <p className="mb-2 px-3 text-xs font-semibold tracking-wider text-sidebar-foreground/55 uppercase">
                {section.label}
              </p>
            )}
            {isCollapsed && <div className="mx-3 mb-2 border-t border-sidebar-border/60" />}
            <ul className="grid gap-1">
              {section.items.map((item) => {
                const active =
                  item.href === "/dashboard"
                    ? pathname === "/dashboard"
                    : pathname.startsWith(item.href);
                const link = (
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={onNavigate}
                    className={cn(
                      "relative flex h-[42px] items-center rounded-md text-sm font-semibold transition-all duration-200",
                      isCollapsed ? "justify-center px-2" : "gap-3 px-3.5",
                      active
                        ? "bg-sidebar-accent font-bold text-white before:absolute before:top-1/2 before:-left-3 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-primary"
                        : "font-semibold text-sidebar-foreground hover:bg-sidebar-hover hover:text-white",
                    )}
                  >
                    <item.icon
                      className={cn(
                        "shrink-0 size-[18px]",
                        active
                          ? "text-primary"
                          : "text-sidebar-foreground/80 group-hover/sidebar:text-white",
                      )}
                    />
                    {!isCollapsed && item.label}
                  </Link>
                );
                return (
                  <li key={item.href}>
                    {isCollapsed ? (
                      <Tooltip>
                        <TooltipTrigger asChild>{link}</TooltipTrigger>
                        <TooltipContent side="right" sideOffset={8}>
                          {item.label}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      link
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Bottom actions */}
      <div className="shrink-0 p-3">
        {/* Open POS — prominent pill */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href="/pos"
              onClick={onNavigate}
              className={cn(
                "mb-3 flex h-11 items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground transition-colors duration-200 hover:bg-[color-mix(in_oklab,var(--primary)_88%,black)]",
                isCollapsed ? "px-2" : "px-4",
              )}
            >
              <ScanBarcode className="size-[18px]" />
              {!isCollapsed && "Open POS"}
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">Open POS terminal</TooltipContent>
        </Tooltip>

        {/* Collapse toggle */}
        {collapsible && (
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className={cn(
              "mb-1 flex h-8 w-full items-center justify-center rounded-md text-sidebar-foreground/70 transition-all duration-200 hover:bg-sidebar-hover hover:text-white",
              isCollapsed ? "" : "justify-end px-3",
            )}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <ChevronLeft
              className={cn(
                "size-4 transition-transform duration-300",
                collapsed && "rotate-180",
              )}
            />
          </button>
        )}

        {/* Sign out — quiet nav-style item */}
        <form action={signOutAction}>
          <PendingSubmitButton
            pendingLabel="Signing out…"
            className={cn(
              "flex h-[42px] w-full cursor-pointer items-center rounded-md text-sm font-semibold text-sidebar-foreground transition-all duration-200 hover:bg-sidebar-hover hover:text-white disabled:opacity-60",
              isCollapsed ? "justify-center px-2" : "gap-3 px-3.5",
            )}
            aria-label="Sign out"
          >
            <LogOut className="size-[18px] shrink-0 text-sidebar-foreground/80" />
            {!isCollapsed && "Sign out"}
          </PendingSubmitButton>
        </form>
      </div>
    </aside>
  );
}
