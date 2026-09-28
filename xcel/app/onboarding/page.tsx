import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

export const metadata = { title: "Welcome" };

export default async function OnboardingPage() {
  const session = await getSessionUser();
  if (!session) redirect("/login?next=/onboarding");

  const [locationCount, productCount] = await Promise.all([
    prisma.location.count({ where: { businessId: session.businessId } }),
    prisma.product.count({ where: { businessId: session.businessId, deletedAt: null } }),
  ]);

  return (
    <OnboardingWizard
      businessName={session.businessName}
      userName={session.name}
      role={session.role}
      hasLocation={locationCount > 0}
      hasProducts={productCount > 0}
    />
  );
}
