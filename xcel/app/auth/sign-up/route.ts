import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  name: z.string().trim().min(2, "Enter your full name").max(80),
  businessName: z.string().trim().min(2, "Enter your business name").max(80),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters"),
  /** Pre-provisioned users (invited staff) skip business creation. */
  joinCode: z.string().trim().optional(),
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

  try {
    if (joinCode) {
      // Invited staff joining an existing business — profile is pre-created by
      // the owner; just link the auth user id.
      const profile = await prisma.user.findFirst({
        where: { email, deletedAt: null, authUserId: null },
        select: { id: true },
      });
      if (profile) {
        await prisma.user.update({
          where: { id: profile.id },
          data: { authUserId: data.user.id, name },
        });
        return NextResponse.json({ ok: true, joined: true });
      }
    }

    // Business owner path — provision Business + Owner profile + first location
    const business = await prisma.business.create({ data: { name: businessName } });
    await prisma.user.create({
      data: {
        email,
        name,
        role: "OWNER",
        businessId: business.id,
        authUserId: data.user.id,
      },
    });
    await prisma.location.create({
      data: {
        businessId: business.id,
        name: "Main Shop",
      },
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
