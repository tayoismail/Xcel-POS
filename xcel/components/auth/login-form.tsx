"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, LoaderCircle, MailCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { XcelLogoMark } from "@/components/shared/logo";

const passwordSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters"),
});

const magicSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
});

const signupSchema = z
  .object({
    name: z.string().min(2, "Enter your full name"),
    businessName: z.string().optional(),
    email: z.string().email("Enter a valid email"),
    password: z.string().min(8, "At least 8 characters"),
    joinCode: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (!val.joinCode?.trim() && (val.businessName ?? "").trim().length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["businessName"],
        message: "Enter your business name",
      });
    }
  });

type PasswordForm = z.infer<typeof passwordSchema>;
type MagicForm = z.infer<typeof magicSchema>;
type SignupForm = z.infer<typeof signupSchema>;

export function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState<string | null>(null);

  const signupForm = useForm<SignupForm>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: "", businessName: "", email: "", password: "", joinCode: "" },
  });

  // When an invite code is pasted, the user is joining an existing business —
  // the business-name field is irrelevant (and hidden).
  const joinCodeValue = signupForm.watch("joinCode");
  const isInvite = !!joinCodeValue?.trim();

  async function onSignUp(values: SignupForm) {
    try {
      const res = await fetch("/auth/sign-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          businessName: values.businessName?.trim() ? values.businessName.trim() : undefined,
          joinCode: values.joinCode?.trim() ? values.joinCode.trim().toUpperCase() : undefined,
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { error?: string; joined?: boolean }
        | null;
      if (!res.ok) {
        toast.error("Couldn't create your account", {
          description: body?.error ?? "Please try again.",
        });
        return;
      }
      toast.success(body?.joined ? "You've joined the team" : "Account created", {
        description: body?.joined
          ? "Sign in with your email and password to start working."
          : "Check your inbox to confirm your email, then sign in.",
      });
      window.location.assign("/login?registered=1");
    } catch {
      toast.error("Network error", { description: "Please try again." });
    }
  }

  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { email: "", password: "" },
  });

  const magicForm = useForm<MagicForm>({
    resolver: zodResolver(magicSchema),
    defaultValues: { email: "" },
  });

  async function onPasswordSignIn(values: PasswordForm) {
    try {
      const res = await fetch("/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error("Sign in failed", {
          description: body?.error ?? "Check your email and password.",
        });
        return;
      }

      window.location.assign("/dashboard");
    } catch {
      toast.error("Network error", { description: "Please try again." });
    }
  }

  async function onMagicLink(values: MagicForm) {
    try {
      const res = await fetch("/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error("Couldn't send link", {
          description: body?.error ?? "Please try again.",
        });
        return;
      }

      setMagicLinkSent(values.email);
    } catch {
      toast.error("Network error", { description: "Please try again." });
    }
  }

  if (magicLinkSent) {
    return (
    <Card className="w-full max-w-sm" size="sm">
      <CardHeader className="text-center">
        <div className="mx-auto mb-1 flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <MailCheck className="size-5" />
        </div>
          <CardTitle>
            Check your inbox
          </CardTitle>
          <CardDescription>
            We sent a sign-in link to{" "}
            <span className="font-medium text-foreground">{magicLinkSent}</span>. It
            expires in one hour.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              setMagicLinkSent(null);
              magicForm.reset();
            }}
          >
            Use a different email
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm" size="sm">
      <CardHeader className="text-center">
        <XcelLogoMark
          className="mx-auto mb-1 size-11 rounded-2xl"
          iconClassName="size-5 text-primary-foreground"
        />
        <CardTitle>
          Welcome back
        </CardTitle>
        <CardDescription>Sign in to your Xcel account</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="password">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="password">Sign in</TabsTrigger>
            <TabsTrigger value="magic">
              <Sparkles className="size-3.5" />
              Magic
            </TabsTrigger>
            <TabsTrigger value="signup">Create account</TabsTrigger>
          </TabsList>

          <TabsContent value="password" className="mt-4">
            <form
              onSubmit={passwordForm.handleSubmit(onPasswordSignIn)}
              className="grid gap-4"
              noValidate
            >
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="cashier@xcel.app"
                  autoComplete="email"
                  aria-invalid={!!passwordForm.formState.errors.email}
                  {...passwordForm.register("email")}
                />
                {passwordForm.formState.errors.email ? (
                  <p className="text-xs text-destructive">
                    {passwordForm.formState.errors.email.message}
                  </p>
                ) : null}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="pr-10"
                    aria-invalid={!!passwordForm.formState.errors.password}
                    {...passwordForm.register("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
                {passwordForm.formState.errors.password ? (
                  <p className="text-xs text-destructive">
                    {passwordForm.formState.errors.password.message}
                  </p>
                ) : null}
              </div>
              <Button
                type="submit"
                className="mt-1 w-full"
                disabled={passwordForm.formState.isSubmitting}
              >
                {passwordForm.formState.isSubmitting ? (
                  <>
                    <LoaderCircle className="animate-spin" />
                    Signing in…
                  </>
                ) : (
                  "Sign in"
                )}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="magic" className="mt-4">
            <form
              onSubmit={magicForm.handleSubmit(onMagicLink)}
              className="grid gap-4"
              noValidate
            >
              <div className="grid gap-2">
                <Label htmlFor="magic-email">Email</Label>
                <Input
                  id="magic-email"
                  type="email"
                  placeholder="owner@xcel.app"
                  autoComplete="email"
                  aria-invalid={!!magicForm.formState.errors.email}
                  {...magicForm.register("email")}
                />
                {magicForm.formState.errors.email ? (
                  <p className="text-xs text-destructive">
                    {magicForm.formState.errors.email.message}
                  </p>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                We&apos;ll email you a one-time sign-in link — no password needed.
              </p>
              <Button
                type="submit"
                variant="outline"
                className="w-full"
                disabled={magicForm.formState.isSubmitting}
              >
                {magicForm.formState.isSubmitting ? (
                  <>
                    <LoaderCircle className="animate-spin" />
                    Sending link…
                  </>
                ) : (
                  "Send magic link"
                )}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="signup" className="mt-4">
            <form
              onSubmit={signupForm.handleSubmit(onSignUp)}
              className="grid gap-3"
              noValidate
            >
              <div className="grid gap-1.5">
                <Label htmlFor="su-name">Your name</Label>
                <Input
                  id="su-name"
                  placeholder="Ada Obi"
                  autoComplete="name"
                  aria-invalid={!!signupForm.formState.errors.name}
                  {...signupForm.register("name")}
                />
                {signupForm.formState.errors.name ? (
                  <p className="text-xs text-destructive">{signupForm.formState.errors.name.message}</p>
                ) : null}
              </div>
              {!isInvite && (
                <div className="grid gap-1.5">
                  <Label htmlFor="su-biz">Business name</Label>
                  <Input
                    id="su-biz"
                    placeholder="Xcel Phones Ltd"
                    autoComplete="organization"
                    aria-invalid={!!signupForm.formState.errors.businessName}
                    {...signupForm.register("businessName")}
                  />
                  {signupForm.formState.errors.businessName ? (
                    <p className="text-xs text-destructive">{signupForm.formState.errors.businessName.message}</p>
                  ) : null}
                </div>
              )}
              <div className="grid gap-1.5">
                <Label htmlFor="su-code">Invite code {isInvite ? "" : "(optional)"}</Label>
                <Input
                  id="su-code"
                  placeholder="e.g. K7M2Q9XA"
                  autoComplete="off"
                  autoCapitalize="characters"
                  className="font-mono tracking-widest"
                  {...signupForm.register("joinCode")}
                />
                <p className="text-xs text-muted-foreground">
                  {isInvite
                    ? "Joining an existing business — the owner gave you this code."
                    : "Got an invite code from your owner? Paste it to join their team instead of creating a new business."}
                </p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="su-email">Email</Label>
                <Input
                  id="su-email"
                  type="email"
                  placeholder="owner@xcel.app"
                  autoComplete="email"
                  aria-invalid={!!signupForm.formState.errors.email}
                  {...signupForm.register("email")}
                />
                {signupForm.formState.errors.email ? (
                  <p className="text-xs text-destructive">{signupForm.formState.errors.email.message}</p>
                ) : null}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="su-password">Password</Label>
                <Input
                  id="su-password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  aria-invalid={!!signupForm.formState.errors.password}
                  {...signupForm.register("password")}
                />
                {signupForm.formState.errors.password ? (
                  <p className="text-xs text-destructive">{signupForm.formState.errors.password.message}</p>
                ) : null}
              </div>
              <Button
                type="submit"
                className="mt-1 w-full"
                disabled={signupForm.formState.isSubmitting}
              >
                {signupForm.formState.isSubmitting ? (
                  <>
                    <LoaderCircle className="animate-spin" />
                    Creating account…
                  </>
                ) : isInvite ? (
                  "Join the team"
                ) : (
                  "Create my business"
                )}
              </Button>
              <p className="text-center text-xs font-medium text-slate-500 dark:text-muted-foreground">
                {isInvite ? (
                  <>
                    You&apos;ll join the business as the role your owner assigned — no new
                    business is created.
                  </>
                ) : (
                  <>
                    You&apos;ll be set up as the <span className="font-semibold">Owner</span> with
                    full access. A “Main Shop” location is created for you.
                  </>
                )}
              </p>
            </form>
          </TabsContent>
        </Tabs>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Trouble signing in?{" "}
          <Link href="/login" className="text-foreground underline underline-offset-2">
            Contact your manager
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
