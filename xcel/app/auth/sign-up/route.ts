import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

const schema = z
  .object({
    name: z.string().trim().min(2, "Enter your full name").max(80),
    // Invitees post an empty string (the field is hidden for them) — treat it
    // as absent so `.min(2)` doesn't reject the whole sign-up.
    businessName: z.preprocess(
      (v) => (typeof v === "string" && !v.trim() ? undefined : v),
      z.string().trim().min(2, "Enter your business name").max(80).optional(),
    ),
    email: z.string().email("Enter a valid email"),
    password: z.string().min(8, "At least 8 characters"),
    /** Pre-provisioned users (invited staff) skip business creation. */
    joinCode: z.string().trim().optional(),
  })
  .superRefine((val, ctx) => {
    if (!val.joinCode && !val.businessName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["businessName"],
        message: "Enter your business name",
      });
    }
  });

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid details." },
      { status: 400 },
    );
  }
  const { name, businessName, email, password, joinCode } = parsed.data;

  // Validate the invitation BEFORE creating an auth user, so a bad code
  // never leaves an orphaned Supabase account behind.
  let invitedProfileId: string | null = null;
  if (joinCode) {
    const profile = await prisma.user.findFirst({
      where: {
        inviteCode: joinCode.toUpperCase(),
        email: email.trim().toLowerCase(),
        authUserId: null,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!profile) {
      return NextResponse.json(
        { error: "Invalid invite code, or this email doesn't match the invitation." },
        { status: 400 },
      );
    }
    invitedProfileId = profile.id;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${new URL(request.url).origin}/auth/callback`,
    },
  });
  if (error || !data.user) {
    return NextResponse.json(
      { error: error?.message ?? "Sign-up failed." },
      { status: 400 },
    );
  }
  const authUserId = data.user.id;

  try {
    if (invitedProfileId) {
      // Invited staff joining an existing business — profile was pre-created
      // by the owner; just link the auth user and burn the code.
      await prisma.user.update({
        where: { id: invitedProfileId },
        data: { authUserId, name, inviteCode: null },
      });
      return NextResponse.json({ ok: true, joined: true });
    }

    // Business owner path — provision Business + Owner profile + first
    // location atomically, so a mid-way failure never leaves a half-set-up
    // account behind.
    await prisma.$transaction(async (tx) => {
      const business = await tx.business.create({ data: { name: businessName! } });
      await tx.user.create({
        data: {
          email,
          name,
          role: "OWNER",
          businessId: business.id,
          authUserId,
        },
      });
      await tx.location.create({
        data: {
          businessId: business.id,
          name: "Main Shop",
        },
      });
    });

    return NextResponse.json({ ok: true, owner: true });
  } catch (e) {
    // Auth user exists but provisioning failed — surface a clear message.
    console.error("[sign-up] provisioning failed", e);
    return NextResponse.json(
      {
        error:
          "Account created but setup failed. Sign in again and complete setup — your data was not lost.",
      },
      { status: 500 },
    );
  }
}
