import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export type Role = "OWNER" | "MANAGER" | "STAFF";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  avatarUrl: string | null;
  businessId: string;
  businessName: string;
};

/**
 * Resolves the signed-in user from the Supabase session and hydrates
 * app-level profile data (name, role, business) from the User table.
 * Returns null when there is no session or no matching profile row.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const profile = await prisma.user.findFirst({
    where: { OR: [{ authUserId: user.id }, { email: user.email ?? "" }], deletedAt: null },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      avatarUrl: true,
      businessId: true,
      business: { select: { name: true } },
    },
  });
  if (!profile) return null;

  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    role: profile.role as Role,
    avatarUrl: profile.avatarUrl,
    businessId: profile.businessId,
    businessName: profile.business.name,
  };
}

/** Middleware-only session probe (no Prisma, edge-safe). */
export async function isAuthenticated(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return !!user;
}
