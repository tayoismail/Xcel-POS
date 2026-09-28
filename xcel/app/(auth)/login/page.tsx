import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";
import { XcelLogoMark } from "@/components/shared/logo";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function LoginPage() {
  return (
    <main className="relative grid min-h-svh place-items-center bg-background px-4">
      {/* Subtle warm accent */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -top-24 left-1/2 size-96 -translate-x-1/2 rounded-full bg-primary/8 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 size-72 rounded-full bg-soft-green blur-3xl" />
        <div className="absolute top-1/3 left-8 size-64 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo lockup */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <XcelLogoMark
            className="size-[52px] rounded-[14px]"
            iconClassName="size-6"
          />
          <div className="grid text-center leading-tight">
            <h1 className="text-xl font-bold tracking-wider text-foreground uppercase">
              Xcel
            </h1>
            <p className="mt-0.5 text-[10px] font-semibold tracking-wider text-slate-500 uppercase dark:text-muted-soft">
              POS
            </p>
          </div>
        </div>

        <LoginForm />
      </div>
    </main>
  );
}
