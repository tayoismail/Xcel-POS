"use client";

import { useState } from "react";
import {
  ChevronLeft,
  ChevronsUpDown,
  LogOut,
  Menu,
  ScanBarcode,
  Store,
  UserRound,
} from "lucide-react";
import Link from "next/link";

import { signOutAction } from "@/app/actions/auth";
import { Sidebar, type SidebarUser } from "@/components/dashboard/sidebar";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { PendingSubmitButton } from "@/components/shared/pending-submit-button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export type HeaderUser = SidebarUser;

export type HeaderLocation = {
  id: string;
  name: string;
};

export function Header({
  user,
  businessName,
  locations,
  activeLocationId,
}: {
  user: HeaderUser;
  businessName: string;
  locations: HeaderLocation[];
  activeLocationId?: string;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const activeLocation =
    locations.find((l) => l.id === activeLocationId) ?? locations[0];

  return (
    <>
      <header className="sticky top-0 z-20 flex h-[72px] shrink-0 items-center gap-2.5 border-b border-border/70 bg-background/85 px-4 backdrop-blur-md md:gap-3 md:px-8">
        {/* Mobile nav trigger */}
        <Button
          variant="outline"
          size="icon"
          className="shrink-0 lg:hidden"
          aria-label="Open navigation"
          onClick={() => setNavOpen(true)}
        >
          <Menu className="size-4" />
        </Button>

        {/* Eyebrow + business name — links to dashboard home */}
        <Link
          href="/dashboard"
          aria-label="Xcel — go to dashboard"
          className="grid min-w-0 rounded-md leading-tight outline-none transition-colors hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/30"
        >
          <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-muted-soft">
            Xcel
          </span>
          <span className="truncate text-lg leading-tight font-semibold tracking-tight text-slate-900 dark:text-foreground">
            {businessName}
          </span>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          {/* Dark mode toggle */}
          <ThemeToggle />

          {/* Business / location switcher */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="h-10 gap-2 rounded-full px-3 font-semibold md:px-4"
                aria-label="Switch location"
              >
                <Store className="size-4 text-muted-foreground" />
                <span className="hidden max-w-40 truncate text-sm font-medium text-slate-900 dark:text-foreground sm:inline">
                  {activeLocation?.name ?? businessName}
                </span>
                <ChevronsUpDown className="size-3.5 text-muted-soft" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                {businessName} — locations
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {locations.map((location) => (
                <DropdownMenuItem
                  key={location.id}
                  className={cn(
                    location.id === activeLocation?.id &&
                      "bg-very-soft-green text-primary",
                  )}
                >
                  <Store className="size-4" />
                  <span className="grid flex-1 leading-tight">
                    <span>{location.name}</span>
                  </span>
                  {location.id === activeLocation?.id && (
                    <span className="text-xs font-semibold text-primary">
                      Active
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* POS pill — dark */}
          <Button
            asChild
              className="hidden h-10 gap-2 rounded-full bg-sidebar px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-primary hover:text-primary-foreground sm:inline-flex"
          >
            <Link href="/dashboard/pos">
              <ScanBarcode className="size-4" />
              POS
            </Link>
          </Button>

          {/* User pill */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="h-10 gap-2 rounded-full border-transparent bg-accent px-1.5 pr-3 font-semibold hover:bg-accent/70 dark:bg-muted dark:hover:bg-muted/70"
                aria-label="Account menu"
              >
                <Avatar className="size-8">
                  <AvatarFallback className="bg-primary text-xs font-bold text-primary-foreground">
                    {user.name
                      .split(" ")
                      .map((p) => p[0])
                      .slice(0, 2)
                      .join("")
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden text-sm font-semibold text-slate-900 dark:text-foreground lg:inline">
                  {user.name}
                </span>
                <ChevronsUpDown className="hidden size-3.5 text-muted-soft lg:inline" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="grid">
                <span>{user.name}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {user.email}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled>
                <UserRound className="size-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <form action={signOutAction} className="w-full">
                  <PendingSubmitButton
                    pendingLabel="Signing out…"
                    className="flex w-full cursor-pointer items-center gap-2 disabled:opacity-60"
                  >
                    <LogOut className="size-4" />
                    Sign out
                  </PendingSubmitButton>
                </form>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Mobile navigation drawer */}
      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="w-[248px] gap-0 overflow-hidden border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Sidebar
            user={user}
            className="h-full w-full"
            collapsible={false}
            onNavigate={() => setNavOpen(false)}
          />
          <button
            type="button"
            onClick={() => setNavOpen(false)}
            aria-label="Close navigation"
              className="absolute top-4 right-3 flex size-8 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-hover hover:text-white"
          >
            <ChevronLeft className="size-4" />
          </button>
        </SheetContent>
      </Sheet>
    </>
  );
}
