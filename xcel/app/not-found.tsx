import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="grid min-h-svh place-items-center bg-background p-4">
      <div className="w-full max-w-md text-center">
        <p className="text-6xl leading-none font-bold tracking-tight text-primary/20 tabular-nums">
          404
        </p>
        <h1 className="mt-2 text-2xl leading-tight font-bold tracking-tight text-slate-900 md:text-3xl dark:text-foreground">Page not found</h1>
        <p className="mt-2 text-sm leading-normal text-slate-500 dark:text-muted-foreground">
          The page you are looking for doesn&apos;t exist or was moved.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button asChild>
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/pos">Open POS</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
