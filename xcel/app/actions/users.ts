"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import { audit } from "@/lib/audit";
import { getSessionUser } from "@/lib/auth";
import { can, type Role } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

type ActionState = { ok: true } | { ok: false; error: string };

/** User management is OWNER-only (`team.manage`). */
async function requireOwner() {
  const session = await getSessionUser();
  if (!session) throw new Error("Unauthorized");
  if (!can(session.role, "team.manage")) {
    throw new Error("Forbidden: only the owner can manage users.");
  }
  return session;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES: Role[] = ["OWNER", "MANAGER", "STAFF"];

/** Ambiguity-free alphabet so codes are easy to read aloud / retype. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateInviteCode(): string {
  let out = "";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

export type TeamUserRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** ACTIVE = signed up already, INVITED = waiting for the invite code. */
  status: "ACTIVE" | "INVITED";
  createdAt: string;
};

export async function listUsersAction(): Promise<TeamUserRow[]> {
  const session = await requireOwner();
  const users = await prisma.user.findMany({
    where: { businessId: session.businessId, deletedAt: null },
    orderBy: [{ createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      authUserId: true,
      createdAt: true,
    },
  });
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    status: u.authUserId ? "ACTIVE" : "INVITED",
    createdAt: u.createdAt.toISOString(),
  }));
}

export async function inviteUserAction(input: {
  name: string;
  email: string;
  role: Role;
}): Promise<ActionState & { id?: string; inviteCode?: string }> {
  const session = await requireOwner();

  const name = input.name?.trim();
  const email = input.email?.trim().toLowerCase();
  if (!name || name.length < 2) return { ok: false, error: "Enter the user's full name." };
  if (!email || !EMAIL_RE.test(email)) return { ok: false, error: "Enter a valid email address." };
  if (!ROLES.includes(input.role)) return { ok: false, error: "Choose a valid role." };

  const inviteCode = generateInviteCode();
  try {
    // Re-inviting an email that already has a (possibly soft-deleted) row in
    // this business must revive it — the global unique email would otherwise
    // make every re-invite fail with P2002.
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true, businessId: true, authUserId: true },
    });
    if (existing && existing.businessId !== session.businessId) {
      return { ok: false, error: "That email is already registered." };
    }

    let userId: string;
    let code: string | undefined;
    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          name,
          role: input.role,
          deletedAt: null,
          // Previously signed-up users just sign in again — no new code.
          inviteCode: existing.authUserId ? null : inviteCode,
        },
      });
      userId = existing.id;
      code = existing.authUserId ? undefined : inviteCode;
    } else {
      const created = await prisma.user.create({
        data: {
          name,
          email,
          role: input.role,
          businessId: session.businessId,
          inviteCode,
        },
        select: { id: true },
      });
      userId = created.id;
      code = inviteCode;
    }

    await audit({
      businessId: session.businessId,
      userId: session.id,
      action: "USER_INVITE",
      entity: "User",
      entityId: userId,
      summary: `Invited ${name} (${email}) as ${input.role}`,
      meta: { email, role: input.role },
    });
    revalidatePath("/dashboard/settings");
    return { ok: true, id: userId, inviteCode: code };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "That email is already registered." };
    }
    return { ok: false, error: e instanceof Error ? e.message : "Could not invite user." };
  }
}

export async function regenerateInviteCodeAction(
  userId: string,
): Promise<ActionState & { inviteCode?: string }> {
  const session = await requireOwner();
  try {
    const user = await prisma.user.findFirst({
      where: { id: userId, businessId: session.businessId, deletedAt: null },
      select: { id: true, name: true, authUserId: true },
    });
    if (!user) return { ok: false, error: "User not found." };
    if (user.authUserId) {
      return { ok: false, error: "This user has already signed up — no code needed." };
    }

    const inviteCode = generateInviteCode();
    await prisma.user.update({ where: { id: user.id }, data: { inviteCode } });
    await audit({
      businessId: session.businessId,
      userId: session.id,
      action: "USER_UPDATE",
      entity: "User",
      entityId: user.id,
      summary: `Regenerated invite code for ${user.name}`,
    });
    revalidatePath("/dashboard/settings");
    return { ok: true, inviteCode };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not regenerate code." };
  }
}

export async function updateUserRoleAction(
  userId: string,
  role: Role,
): Promise<ActionState> {
  const session = await requireOwner();
  if (userId === session.id) {
    return { ok: false, error: "You can't change your own role." };
  }
  if (!ROLES.includes(role)) return { ok: false, error: "Choose a valid role." };

  try {
    const user = await prisma.user.findFirst({
      where: { id: userId, businessId: session.businessId, deletedAt: null },
      select: { id: true, name: true, role: true },
    });
    if (!user) return { ok: false, error: "User not found." };
    if (user.role === role) return { ok: true };

    if (user.role === "OWNER" && role !== "OWNER") {
      const otherOwners = await prisma.user.count({
        where: {
          businessId: session.businessId,
          role: "OWNER",
          deletedAt: null,
          id: { not: userId },
        },
      });
      if (otherOwners === 0) {
        return { ok: false, error: "You can't demote the only owner of the business." };
      }
    }

    await prisma.user.update({ where: { id: user.id }, data: { role } });
    await audit({
      businessId: session.businessId,
      userId: session.id,
      action: "USER_UPDATE",
      entity: "User",
      entityId: user.id,
      summary: `Changed role of ${user.name}: ${user.role} → ${role}`,
      meta: { oldRole: user.role, newRole: role },
    });
    revalidatePath("/dashboard/settings");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not update role." };
  }
}

export async function removeUserAction(userId: string): Promise<ActionState> {
  const session = await requireOwner();
  if (userId === session.id) {
    return { ok: false, error: "You can't remove your own account." };
  }

  try {
    const user = await prisma.user.findFirst({
      where: { id: userId, businessId: session.businessId, deletedAt: null },
      select: { id: true, name: true, role: true, authUserId: true },
    });
    if (!user) return { ok: false, error: "User not found." };

    if (user.role === "OWNER") {
      const otherOwners = await prisma.user.count({
        where: {
          businessId: session.businessId,
          role: "OWNER",
          deletedAt: null,
          id: { not: userId },
        },
      });
      if (otherOwners === 0) {
        return { ok: false, error: "You can't remove the only owner of the business." };
      }
    }

    // Soft delete keeps sales/audit history intact; an un-joined invite
    // also loses its code so it can't be redeemed afterwards.
    await prisma.user.update({
      where: { id: user.id },
      data: { deletedAt: new Date(), inviteCode: null },
    });
    await audit({
      businessId: session.businessId,
      userId: session.id,
      action: "USER_REMOVE",
      entity: "User",
      entityId: user.id,
      summary: `Removed ${user.name} (${user.role})`,
      meta: { role: user.role },
    });
    revalidatePath("/dashboard/settings");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not remove user." };
  }
}
