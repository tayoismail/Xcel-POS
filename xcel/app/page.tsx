import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, Boxes, ScanBarcode, Users } from "lucide-react";

import { XcelLogoMark } from "@/components/shared/logo";

export const metadata: Metadata = {
  title: { absolute: "Xcel - POS and inventory for modern retail" },
  description:
    "Checkout, inventory, customers, and reporting in one workspace for multi-branch retail.",
};

const features = [
  {
    icon: ScanBarcode,
    title: "POS Terminal",
    description:
      "Fast checkout with product search, cart, discounts and payment capture.",
  },
  {
    icon: Boxes,
    title: "Products & Inventory",
    description:
      "Manage the catalog, track stock across branches and get restock alerts.",
  },
  {
    icon: Users,
    title: "Walk-in Customers",
    description:
      "Capture walk-ins at the counter, look up regulars by phone, and track credit balances.",
  },
  {
    icon: BarChart3,
    title: "Sales & Reports",
    description: "Transaction history, refunds, and analytics on every sale.",
  },
];

const retailSegments = [
  "Phone & Electronics",
  "Fashion & Apparel",
  "Supermarkets",
  "Home & Hardware",
  "Pharmacies",
  "Gift & Lifestyle",
];


const footerColumns = [
  {
    heading: "Product",
    links: [
      { label: "POS Terminal", href: "/dashboard/pos" },
      { label: "Inventory", href: "/dashboard/products" },
      { label: "Reports", href: "/dashboard/reports" },
      { label: "Invoices", href: "/dashboard/invoices" },
    ],
  },
  {
    heading: "Get started",
    links: [
      { label: "Sign in", href: "/login" },
      { label: "Open dashboard", href: "/dashboard" },
      { label: "Set up your business", href: "/onboarding" },
    ],
  },
];

/** Static recreation of the POS terminal UI — the product speaks for itself. */
function PosMockup() {
  const products = [
    { name: "iPhone 14 Screen", price: "₦85,000", stock: "12" },
    { name: "Samsung S23 Battery", price: "₦32,500", stock: "8" },
    { name: "USB-C Cable 2m", price: "₦4,500", stock: "64" },
    { name: "Anker 20W Charger", price: "₦12,000", stock: "23" },
    { name: "Tempered Glass", price: "₦2,500", stock: "110" },
    { name: "Back Cover S21", price: "₦6,800", stock: "3" },
  ];
  const cart = [
    { name: "iPhone 14 Screen", qty: 1, total: "₦85,000.00" },
    { name: "Anker 20W Charger", qty: 2, total: "₦24,000.00" },
    { name: "USB-C Cable 2m", qty: 1, total: "₦4,500.00" },
  ];
  return (
    <div
      aria-hidden
      className="pointer-events-none select-none overflow-hidden rounded-xl border border-slate-700/60 bg-[#0F172A] text-left shadow-2xl"
    >
      {/* Window chrome */}
      <div className="flex items-center gap-1.5 border-b border-slate-700/60 bg-[#0B1120] px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-slate-700" />
        <span className="size-2.5 rounded-full bg-slate-700" />
        <span className="size-2.5 rounded-full bg-slate-700" />
        <span className="ml-3 font-mono text-[10px] tracking-wider text-slate-500">
          XCEL POS — TERMINAL 01
        </span>
      </div>

      <div className="grid grid-cols-[1fr_240px]">
        {/* Products pane */}
        <div className="border-r border-slate-700/60 p-4">
          <div className="mb-3 flex items-center gap-2">
            <div className="h-7 flex-1 rounded-md border border-slate-700 bg-[#0B1120] px-2.5 text-[10px] leading-7 text-slate-500">
              Search products…
            </div>
            <div className="h-7 rounded-md bg-emerald-500/10 px-2.5 text-[10px] leading-7 font-medium text-emerald-400">
              All Categories
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {products.map((p) => (
              <div
                key={p.name}
                className="rounded-lg border border-slate-700/60 bg-[#0B1120] p-2.5"
              >
                <p className="truncate text-[10px] font-medium text-slate-300">
                  {p.name}
                </p>
                <p className="mt-1 text-xs font-semibold text-emerald-400">
                  {p.price}
                </p>
                <p className="text-[9px] text-slate-500">Stock {p.stock}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Cart pane */}
        <div className="flex flex-col bg-[#0B1120]">
          <p className="px-3.5 pt-3.5 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
            Cart · 4 items
          </p>
          <div className="mt-2 space-y-1.5 px-3.5">
            {cart.map((l) => (
              <div
                key={l.name}
                className="flex items-center justify-between rounded-md border border-slate-800 bg-[#0F172A] px-2.5 py-1.5"
              >
                <span className="truncate text-[10px] text-slate-300">{l.name}</span>
                <span className="ml-2 font-mono text-[10px] text-slate-400">
                  {l.total}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-auto border-t border-slate-800 p-3.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] text-slate-400">Total payable</span>
              <span className="font-mono text-base font-bold text-white">
                ₦113,500.00
              </span>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-1.5">
              <span className="rounded-md bg-[#1E293B] py-1.5 text-center text-[9px] font-medium text-slate-300">
                Multiple pay
              </span>
              <span className="rounded-md bg-emerald-600 py-1.5 text-center text-[9px] font-semibold text-white">
                Cash
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-svh bg-white font-sans text-slate-900">
      {/* ===================================================== NAV */}
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <XcelLogoMark
              className="size-7 rounded-md bg-slate-900"
              iconClassName="size-4 text-emerald-400"
            />
            <span className="text-base font-bold tracking-tight">Xcel</span>
          </Link>
          <div className="flex items-center gap-5">
            <Link
              href="/login"
              className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
            >
              Sign in
            </Link>
            <Link
              href="/dashboard"
              className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
            >
              Open dashboard
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* ===================================================== HERO (dark) */}
        <section className="relative overflow-hidden bg-[#0B1120] text-white">
          {/* Grid + glow backdrop */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(rgba(148,163,184,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.06) 1px, transparent 1px)",
              backgroundSize: "56px 56px",
              maskImage:
                "radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%)",
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute top-[-12rem] left-1/2 h-[24rem] w-[48rem] -translate-x-1/2 rounded-full bg-emerald-500/15 blur-[120px]"
          />

          <div className="relative mx-auto max-w-6xl px-6 pt-20 pb-0 text-center">
            <span className="inline-flex items-center rounded-full bg-slate-100/10 px-3 py-1 font-mono text-xs tracking-wider text-slate-300 uppercase ring-1 ring-slate-400/20 ring-inset">
              Multi-branch retail suite
            </span>

            <h1 className="mx-auto mt-6 max-w-3xl text-5xl leading-tight font-bold tracking-tight text-white md:text-6xl">
              The operations platform for modern retail.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-400">
              Xcel brings checkout, inventory, customers, and reporting into one
              premium workspace — built for speed, with dark mode included.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/dashboard"
                className="rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
              >
                Get started
              </Link>
              <Link
                href="/login"
                className="rounded-md border border-slate-700 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Sign in
              </Link>
            </div>

            {/* Product shot */}
            <div className="relative mt-16 pb-20">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-8 -top-6 bottom-10 rounded-2xl bg-emerald-500/20 blur-3xl"
              />
              <div className="relative mx-auto max-w-5xl">
                <PosMockup />
              </div>
            </div>
          </div>
        </section>

        {/* ===================================================== USE CASES */}
        <section className="border-b border-slate-200 bg-white py-12">
          <div className="mx-auto max-w-6xl px-6">
            <p className="text-center font-mono text-xs tracking-wider text-slate-500 uppercase">
              Built for every kind of retail counter
            </p>
            <div className="mt-8 grid grid-cols-2 items-center justify-items-center gap-x-8 gap-y-6 sm:grid-cols-3 lg:grid-cols-6">
              {retailSegments.map((segment) => (
                <span
                  key={segment}
                  className="text-base font-bold tracking-tight text-slate-400 transition-colors hover:text-slate-600"
                >
                  {segment}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ===================================================== FEATURES */}
        <section id="features" className="bg-slate-50 py-24">
          <div className="mx-auto max-w-6xl px-6">
            <h2 className="text-center text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
              Everything retail operations need. Nothing they don&apos;t.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-slate-600">
              Four core modules, one workspace — engineered for the speed a busy
              sales floor demands.
            </p>

            <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
              {features.map((feature) => (
                <div
                  key={feature.title}
                  className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                    <feature.icon className="size-5" strokeWidth={1.75} />
                  </div>
                  <h3 className="mb-2 text-lg leading-tight font-semibold tracking-tight text-slate-900">
                    {feature.title}
                  </h3>
                  <p className="text-sm leading-normal text-slate-500">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===================================================== CTA BAND (dark) */}
        <section className="bg-[#0B1120] py-20 text-center">
          <div className="mx-auto max-w-3xl px-6">
            <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
              Ready to run your retail on Xcel?
            </h2>
            <p className="mt-4 text-lg text-slate-400">
              Set up your first branch in minutes. No credit card required.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/dashboard"
                className="rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
              >
                Get started
              </Link>
              <Link
                href="/login"
                className="rounded-md border border-slate-700 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Sign in
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* ===================================================== FOOTER (dark) */}
      <footer className="border-t border-slate-800 bg-[#0B1120] text-slate-400">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid grid-cols-2 gap-10 md:grid-cols-6">
            <div className="col-span-2">
              <div className="flex items-center gap-2.5">
                <XcelLogoMark
                  className="size-7 rounded-md bg-white/10"
                  iconClassName="size-4 text-emerald-400"
                />
                <span className="text-base font-bold tracking-tight text-white">
                  Xcel
                </span>
              </div>
              <p className="mt-4 max-w-xs text-sm leading-normal">
                The operations platform for modern multi-branch retail.
              </p>

            </div>

            {footerColumns.map((col) => (
              <div key={col.heading}>
                <h4 className="text-sm font-semibold text-white">{col.heading}</h4>
                <ul className="mt-4 space-y-2.5">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-sm transition-colors hover:text-white"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-slate-800 pt-8 text-xs sm:flex-row">
            <p>© {new Date().getFullYear()} Xcel. All rights reserved.</p>
            <p className="font-mono tracking-wider text-slate-500 uppercase">
              Built for modern retail
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
