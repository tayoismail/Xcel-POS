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

/** Manager-only read guard — blocks staff calling these actions directly. */
async function requireManagerSession() {
  const session = await requireSession();
  if (!isManagerRole(session.role)) {
    throw new Error("Forbidden: manager access required.");
  }
  return session;
}

export type AccountOption = {
  id: string;
  name: string;
  type: "BANK" | "CASH" | "POS";
};

export type ExpenseRow = {
  id: string;
  date: string;
  category: string;
  description: string | null;
  amount: string;
  accountName: string | null;
  createdByName: string;
};

export type ExpenseListResult = {
  rows: ExpenseRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  sum: string;
  counts: Record<string, number>;
};

export async function listExpenseAccountsAction(): Promise<AccountOption[]> {
  const session = await requireManagerSession();
  const accounts = await prisma.bankAccount.findMany({
    where: { businessId: session.businessId, isActive: true },
    orderBy: [{ type: "asc" }, { name: "asc" }],
    select: { id: true, name: true, type: true },
  });
  return accounts;
}

export async function listExpensesAction(opts: {
  search?: string;
  category?: string;
  page?: number;
  pageSize?: number;
}): Promise<ExpenseListResult> {
  const session = await requireManagerSession();
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));
  const term = opts.search?.trim();

  const baseWhere: Prisma.ExpenseWhereInput = {
    businessId: session.businessId,
    ...(opts.category && opts.category !== "ALL" ? { category: opts.category } : {}),
    ...(term
      ? {
          OR: [
            { category: { contains: term, mode: "insensitive" as const } },
            { description: { contains: term, mode: "insensitive" as const } },
            { account: { name: { contains: term, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [rows, total, summed, grouped] = await Promise.all([
    prisma.expense.findMany({
      where: baseWhere,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        date: true,
        category: true,
        description: true,
        amount: true,
        account: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
    }),
    prisma.expense.count({ where: baseWhere }),
    prisma.expense.aggregate({
      where: baseWhere,
      _sum: { amount: true },
    }),
    prisma.expense.groupBy({
      by: ["category"],
      where: { businessId: session.businessId },
      _count: { _all: true },
    }),
  ]);

  const counts: Record<string, number> = {};
  for (const g of grouped) counts[g.category] = g._count._all;

  return {
    rows: rows.map((r) => ({
      id: r.id,
      date: r.date.toISOString(),
      category: r.category,
      description: r.description,
      amount: r.amount.toString(),
      accountName: r.account?.name ?? null,
      createdByName: r.createdBy.name,
    })),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    sum: (summed._sum.amount ?? 0).toString(),
    counts,
  };
}

export async function createExpenseAction(input: {
  category: string;
  description?: string;
  amount: number;
  accountId?: string | null;
  date: string;
}): Promise<ActionState> {
  const session = await requireSession();
  if (!isManagerRole(session.role)) {
    return { ok: false, error: "Only managers can record expenses." };
  }
  if (!input.category?.trim()) return { ok: false, error: "Category is required." };
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, error: "Amount must be greater than zero." };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      if (input.accountId) {
        const account = await tx.bankAccount.findFirst({
          where: { id: input.accountId, businessId: session.businessId, isActive: true },
          select: { id: true },
        });
        if (!account) throw new Error("Account not found.");
      }

      const expense = await tx.expense.create({
        data: {
          businessId: session.businessId,
          category: input.category.trim(),
          description: input.description?.trim() || null,
          amount: money(input.amount),
          accountId: input.accountId || null,
          createdById: session.id,
          date: new Date(input.date),
        },
        select: { id: true },
      });

      // Spending from an account draws the balance down
      if (input.accountId) {
        await tx.bankAccount.update({
          where: { id: input.accountId },
          data: { balance: { decrement: money(input.amount) } },
        });
      }

      return expense;
    });

    revalidatePath("/dashboard/expenses");
    revalidatePath("/dashboard/bank");
    revalidatePath("/dashboard");
    return { ok: true, id: result.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "Account not found.") return { ok: false, error: msg };
    return { ok: false, error: "Could not record expense. Please try again." };
  }
}

export async function deleteExpenseAction(expenseId: string): Promise<ActionState> {
  const session = await requireSession();
  if (!isManagerRole(session.role)) {
    return { ok: false, error: "Only managers can delete expenses." };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const expense = await tx.expense.findFirst({
        where: { id: expenseId, businessId: session.businessId },
        select: { id: true, amount: true, accountId: true },
      });
      if (!expense) throw new Error("Expense not found.");

      // Refund the account balance spent
      if (expense.accountId) {
        await tx.bankAccount.update({
          where: { id: expense.accountId },
          data: { balance: { increment: expense.amount } },
        });
      }
      await tx.expense.delete({ where: { id: expense.id } });
      return expense;
    });

    revalidatePath("/dashboard/expenses");
    revalidatePath("/dashboard/bank");
    revalidatePath("/dashboard");
    return { ok: true, id: result.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "Expense not found.") return { ok: false, error: msg };
    return { ok: false, error: "Could not delete expense. Please try again." };
  }
}
