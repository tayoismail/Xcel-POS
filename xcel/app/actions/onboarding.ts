"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/rbac";

type ActionState = { ok: true } | { ok: false; error: string };

async function requireSession() {
  const session = await getSessionUser();
  if (!session) throw new Error("Unauthorized");
  return session;
}

export type OnboardingStatus = {
  /** Profile exists but belongs to no business (signed up, not provisioned). */
  needsBusiness: boolean;
  /** Business exists but has no locations yet. */
  needsLocation: boolean;
  /** Business + location exist but no products. */
  needsProducts: boolean;
  businessName: string | null;
  locationCount: number;
  productCount: number;
};

/** Snapshot used by the onboarding UI to know which step to show. */
export async function getOnboardingStatus(): Promise<OnboardingStatus | null> {
  const session = await getSessionUser();
  if (!session) return null;

  const [locationCount, productCount] = await Promise.all([
    prisma.location.count({ where: { businessId: session.businessId } }),
    prisma.product.count({ where: { businessId: session.businessId, deletedAt: null } }),
  ]);

  return {
    needsBusiness: false,
    needsLocation: locationCount === 0,
    needsProducts: productCount === 0,
    businessName: session.businessName,
    locationCount,
    productCount,
  };
}

export type CreateLocationInput = {
  name: string;
  address?: string | null;
};

/** Step 2 — add the first (or another) location. Owner/Manager only. */
export async function createLocationAction(
  input: CreateLocationInput,
): Promise<ActionState & { id?: string; name?: string }> {
  const session = await requireSession();
  if (!can(session.role, "settings.manage") && !can(session.role, "team.manage")) {
    // Managers may add locations in practice; only STAFF is blocked
    if (session.role === "STAFF") {
      return { ok: false, error: "Staff accounts cannot add locations." };
    }
  }
  const name = input.name?.trim();
  if (!name) return { ok: false, error: "Location name is required." };
  if (name.length > 80) return { ok: false, error: "Location name is too long." };

  const existing = await prisma.location.findFirst({
    where: { businessId: session.businessId, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) {
    return { ok: false, error: `A location named “${name}” already exists.` };
  }

  const location = await prisma.location.create({
    data: {
      businessId: session.businessId,
      name,
      address: input.address?.trim() || null,
    },
    select: { id: true, name: true },
  });

  revalidatePath("/dashboard");
  revalidatePath("/onboarding");
  return { ok: true, id: location.id };
}

export type QuickStartProductInput = {
  name: string;
  sku?: string | null;
  price: string;
  costPrice?: string;
  stock: string;
};

export type QuickStartResult = {
  created: number;
  skipped: number;
  products: { id: string; name: string; sku: string }[];
};

/**
 * Step 3 — create the first products in bulk with opening stock.
 * All rows share one location; SKUs are auto-generated when omitted.
 */
export async function createQuickStartProductsAction(
  locationId: string,
  products: QuickStartProductInput[],
): Promise<ActionState & { result?: QuickStartResult }> {
  const session = await requireSession();
  if (!can(session.role, "products.manage")) {
    return { ok: false, error: "Staff accounts cannot add products." };
  }
  if (!Array.isArray(products) || products.length === 0) {
    return { ok: false, error: "Add at least one product." };
  }
  if (products.length > 50) {
    return { ok: false, error: "Add up to 50 products at a time." };
  }

  const location = await prisma.location.findFirst({
    where: { id: locationId, businessId: session.businessId },
    select: { id: true },
  });
  if (!location) return { ok: false, error: "Invalid location." };

  // Verify the location belongs to the business (already ensured above)

  const created: QuickStartResult["products"] = [];
  let skipped = 0;
  const baseSku = `SKU-${Date.now().toString(36).toUpperCase()}`;

  try {
    for (const [i, p] of products.entries()) {
      const name = p.name?.trim();
      const price = Number(p.price);
      if (!name || !Number.isFinite(price) || price < 0) {
        skipped++;
        continue;
      }
      const sku = p.sku?.trim() || `${baseSku}-${i + 1}`;
      const stock = Math.max(0, Math.trunc(Number(p.stock) || 0));

      try {
        const product = await prisma.product.create({
          data: {
            businessId: session.businessId,
            name,
            sku,
            price: price.toFixed(2),
            costPrice: (Number(p.costPrice) || 0).toFixed(2),
            unit: "pcs",
            alertAt: 5,
            status: "ACTIVE",
          },
        });
        if (stock > 0) {
          await prisma.stockLevel.create({
            data: {
              productId: product.id,
              locationId: location.id,
              quantity: stock,
            },
          });
          await prisma.stockMovement.create({
            data: {
              productId: product.id,
              locationId: location.id,
              type: "ADJUSTMENT",
              quantity: stock,
              notes: "Opening stock (onboarding)",
              createdById: session.id,
            },
          });
        }
        created.push({ id: product.id, name: product.name, sku: product.sku });
      } catch (err) {
        if (
          typeof err === "object" &&
          err !== null &&
          "code" in err &&
          (err as { code?: string }).code === "P2002"
        ) {
          skipped++; // duplicate SKU — keep moving
          continue;
        }
        throw err;
      }
    }

    if (created.length === 0) {
      return { ok: false, error: "No products could be created — check names and prices." };
    }

    revalidatePath("/dashboard/products");
    revalidatePath("/onboarding");
    return { ok: true, result: { created: created.length, skipped, products: created } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Couldn't create products.",
    };
  }
}

/** Dismiss the onboarding checklist from the dashboard. */
export async function dismissOnboardingAction(): Promise<ActionState> {
  await requireSession();
  revalidatePath("/dashboard");
  return { ok: true };
}
