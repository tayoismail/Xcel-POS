"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

type ActionState = { ok: true; id?: string } | { ok: false; error: string };

async function requireSession() {
  const session = await getSessionUser();
  if (!session) throw new Error("Unauthorized");
  return session;
}

const money = (n: number) => new Prisma.Decimal(n.toFixed(2));
const isManagerRole = (role: string) => role === "OWNER" || role === "MANAGER";

export type AccountTypeFilter = "BANK" | "CASH" | "POS";

export type AccountRow = {
  id: string;
  name: string;
  type: AccountTypeFilter;
  accountNumber: string | null;
  balance: string;
  isActive: boolean;
  lastActivityAt: string | null;
  paymentsIn: string;
  spent: string;
};

export async function listAccountsAction(): Promise<AccountRow[]> {
  const session = await requireSession();
  const accounts = await prisma.bankAccount.findMany({
    where: { businessId: session.businessId },
    orderBy: [{ isActive: "desc" }, { type: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      type: true,
      accountNumber: true,
      balance: true,
      isActive: true,
      payments: {
        select: { amount: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
      expenses: {
        select: { amount: true, date: true },
        orderBy: { date: "desc" },
        take: 50,
      },
    },
  });

  return accounts.map((a) => {
    const paymentsIn = a.payments.reduce((s, p) => s + Number(p.amount), 0);
    const spent = a.expenses.reduce((s, e) => s + Number(e.amount), 0);
    const lastPayment = a.payments[0]?.createdAt ?? null;
    const lastExpense = a.expenses[0]?.date ?? null;
    const lastActivity =
      lastPayment && lastExpense
        ? lastPayment > lastExpense
          ? lastPayment
          : lastExpense
        : (lastPayment ?? lastExpense);

    return {
      id: a.id,
      name: a.name,
      type: a.type,
      accountNumber: a.accountNumber,
      balance: a.balance.toString(),
      isActive: a.isActive,
      lastActivityAt: lastActivity?.toISOString() ?? null,
      paymentsIn: paymentsIn.toFixed(2),
      spent: spent.toFixed(2),
    };
  });
}

export async function createAccountAction(input: {
  name: string;
  type: AccountTypeFilter;
  accountNumber?: string;
  openingBalance?: number;
}): Promise<ActionState> {
  const session = await getSessionUser();
  if (!session) return { ok: false, error: "Unauthorized" };
  if (!isManagerRole(session.role)) {
    return { ok: false, error: "Only managers can add accounts." };
  }
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Account name is required." };
  const opening = Math.max(0, Number(input.openingBalance) || 0);

  try {
    const account = await prisma.$transaction(async (tx) => {
      const created = await tx.bankAccount.create({
        data: {
          businessId: session.businessId,
          name,
          type: input.type,
          accountNumber: input.accountNumber?.trim() || null,
          balance: money(opening),
        },
        select: { id: true, name: true },
      });
      await tx.auditLog.create({
        data: {
          businessId: session.businessId,
          userId: session.id,
          action: "ACCOUNT_CREATE",
          entity: "BankAccount",
          entityId: created.id,
          meta: { name: created.name, openingBalance: opening },
        },
      });
      return created;
    });

    revalidatePath("/dashboard/bank");
    return { ok: true, id: account.id };
  } catch {
    return { ok: false, error: "Could not create account. Please try again." };
  }
}

export async function updateAccountAction(input: {
  accountId: string;
  name?: string;
  type?: AccountTypeFilter;
  accountNumber?: string | null;
  isActive?: boolean;
}): Promise<ActionState> {
  const session = await getSessionUser();
  if (!session) return { ok: false, error: "Unauthorized" };
  if (!isManagerRole(session.role)) {
    return { ok: false, error: "Only managers can edit accounts." };
  }

  try {
    const existing = await prisma.bankAccount.findFirst({
      where: { id: input.accountId, businessId: session.businessId },
      select: { id: true },
    });
    if (!existing) return { ok: false, error: "Account not found." };
    if (input.name !== undefined && !input.name.trim()) {
      return { ok: false, error: "Account name is required." };
    }

    await prisma.bankAccount.update({
      where: { id: existing.id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.accountNumber !== undefined
          ? { accountNumber: input.accountNumber?.trim() || null }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });

    revalidatePath("/dashboard/bank");
    return { ok: true, id: existing.id };
  } catch {
    return { ok: false, error: "Could not update account. Please try again." };
  }
}

/** Manual balance correction — signed amount (+ credit / − debit). */
export async function adjustBalanceAction(input: {
  accountId: string;
  amount: number;
  note?: string;
}): Promise<ActionState> {
  const session = await getSessionUser();
  if (!session) return { ok: false, error: "Unauthorized" };
  if (!isManagerRole(session.role)) {
    return { ok: false, error: "Only managers can adjust balances." };
  }
  if (!Number.isFinite(input.amount) || input.amount === 0) {
    return { ok: false, error: "Enter a non-zero amount." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const account = await tx.bankAccount.findFirst({
        where: { id: input.accountId, businessId: session.businessId },
        select: { id: true, name: true },
      });
      if (!account) throw new Error("Account not found.");

      await tx.bankAccount.update({
        where: { id: account.id },
        data: { balance: { increment: money(input.amount) } },
      });
      await tx.auditLog.create({
        data: {
          businessId: session.businessId,
          userId: session.id,
          action: "ACCOUNT_ADJUST",
          entity: "BankAccount",
          entityId: account.id,
          meta: { amount: input.amount, note: input.note ?? null },
        },
      });
    });

    revalidatePath("/dashboard/bank");
    return { ok: true, id: input.accountId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "Account not found.") return { ok: false, error: msg };
    return { ok: false, error: "Could not adjust balance. Please try again." };
  }
}

export async function transferAction(input: {
  fromId: string;
  toId: string;
  amount: number;
  note?: string;
}): Promise<ActionState> {
  const session = await getSessionUser();
  if (!session) return { ok: false, error: "Unauthorized" };
  if (!isManagerRole(session.role)) {
    return { ok: false, error: "Only managers can transfer funds." };
  }
  if (input.fromId === input.toId) {
    return { ok: false, error: "Choose two different accounts." };
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, error: "Amount must be greater than zero." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const [from, to] = await Promise.all([
        tx.bankAccount.findFirst({
          where: { id: input.fromId, businessId: session.businessId },
          select: { id: true, name: true },
        }),
        tx.bankAccount.findFirst({
          where: { id: input.toId, businessId: session.businessId },
          select: { id: true, name: true },
        }),
      ]);
      if (!from || !to) throw new Error("Account not found.");

      await tx.bankAccount.update({
        where: { id: from.id },
        data: { balance: { decrement: money(input.amount) } },
      });
      await tx.bankAccount.update({
        where: { id: to.id },
        data: { balance: { increment: money(input.amount) } },
      });
      await tx.auditLog.create({
        data: {
          businessId: session.businessId,
          userId: session.id,
          action: "ACCOUNT_TRANSFER",
          entity: "BankAccount",
          entityId: from.id,
          meta: {
            from: from.name,
            to: to.name,
            toId: to.id,
            amount: input.amount,
            note: input.note ?? null,
          },
        },
      });
    });

    revalidatePath("/dashboard/bank");
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "Account not found.") return { ok: false, error: msg };
    return { ok: false, error: "Transfer failed. Please try again." };
  }
}
