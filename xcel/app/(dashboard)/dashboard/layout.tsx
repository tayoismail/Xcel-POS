import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSessionUser();
  if (!session) {
    // Session exists at the auth layer but no profile row — bounce to login
    redirect("/login?error=profile");
  }

  const locations = await prisma.location.findMany({
    where: { businessId: session.businessId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex h-svh overflow-hidden bg-background">
      <div className="hidden h-full shrink-0 lg:block">
        <Sidebar
          user={{
            name: session.name,
            email: session.email,
            role: session.role,
            avatarUrl: session.avatarUrl,
          }}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
            user={{ name: session.name, email: session.email, role: session.role }}
          businessName={session.businessName}
          locations={locations}
        />
        <main className="scrollbar-thin flex-1 overflow-y-auto bg-background">
          <div className="mx-auto w-full max-w-[1400px] px-4 pt-6 pb-12 sm:px-5 md:px-8 md:pt-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
