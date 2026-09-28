import { redirect } from "next/navigation";
import { PosClient } from "./pos-client";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "POS" };

export default async function PosPage() {
  const session = await getSessionUser();
  if (!session) redirect("/login?next=/pos");

  const [locations, business] = await Promise.all([
    prisma.location.findMany({
      where: { businessId: session.businessId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.business.findUnique({
      where: { id: session.businessId },
      select: { currency: true },
    }),
  ]);

  return (
    <PosClient
      user={{ name: session.name, role: session.role }}
      locations={locations}
      businessName={session.businessName}
      currency={business?.currency ?? "NGN"}
    />
  );
}
