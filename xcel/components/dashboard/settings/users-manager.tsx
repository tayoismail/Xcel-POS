"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  LoaderCircle,
  MailPlus,
  RefreshCw,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import {
  inviteUserAction,
  listUsersAction,
  regenerateInviteCodeAction,
  removeUserAction,
  updateUserRoleAction,
  type TeamUserRow,
} from "@/app/actions/users";
import { EmptyState } from "@/components/shared/empty-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });

const ROLE_HINT: Record<TeamUserRow["role"], string> = {
  OWNER: "Full access, including users & settings",
  MANAGER: "Products, stock, reports, expenses — no user management",
  STAFF: "POS terminal only",
};

export function UsersManager({ currentUserId }: { currentUserId: string }) {
  const [rows, setRows] = useState<TeamUserRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamUserRow["role"]>("STAFF");
  const [inviting, setInviting] = useState(false);

  const [codeDialog, setCodeDialog] = useState<{
    code: string;
    title: string;
    description: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [removeTarget, setRemoveTarget] = useState<TeamUserRow | null>(null);
  const [removing, setRemoving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setRows(await listUsersAction());
    } catch {
      toast.error("Couldn't load users", { description: "Please try again." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, [refresh]);

  function openInvite() {
    setInviteName("");
    setInviteEmail("");
    setInviteRole("STAFF");
    setInviteOpen(true);
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    try {
      const res = await inviteUserAction({
        name: inviteName,
        email: inviteEmail,
        role: inviteRole,
      });
      if (!res.ok) {
        toast.error("Couldn't invite user", { description: res.error });
        return;
      }
      setInviteOpen(false);
      setCopied(false);
      if (res.inviteCode) {
        setCodeDialog({
          code: res.inviteCode,
          title: `Invitation ready for ${inviteName.trim()}`,
          description: `Send this code to ${inviteEmail.trim()} — they paste it into the “Create account” tab at /login to set their password and join your business as ${inviteRole}.`,
        });
      } else {
        // Revived a previously removed user — they already have a password.
        toast.success(`${inviteName.trim()} reactivated`, {
          description: `${inviteEmail.trim()} can sign in again with their existing password.`,
        });
      }
      void refresh();
    } catch {
      toast.error("Couldn't invite user", { description: "Network error — please try again." });
    } finally {
      setInviting(false);
    }
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success("Invite code copied");
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — select the code and copy manually");
    }
  }

  async function changeRole(user: TeamUserRow, role: TeamUserRow["role"]) {
    if (role === user.role) return;
    setBusyId(user.id);
    try {
      const res = await updateUserRoleAction(user.id, role);
      if (!res.ok) {
        toast.error("Couldn't change role", { description: res.error });
        return;
      }
      toast.success(`${user.name} is now ${role}`);
      void refresh();
    } catch {
      toast.error("Couldn't change role", { description: "Network error — please try again." });
    } finally {
      setBusyId(null);
    }
  }

  async function regenCode(user: TeamUserRow) {
    setBusyId(user.id);
    try {
      const res = await regenerateInviteCodeAction(user.id);
      if (!res.ok || !res.inviteCode) {
        toast.error("Couldn't regenerate code", { description: res.ok ? "Try again." : res.error });
        return;
      }
      setCopied(false);
      setCodeDialog({
        code: res.inviteCode,
        title: `New invite code for ${user.name}`,
        description: `The old code no longer works. Send this one to ${user.email}.`,
      });
    } catch {
      toast.error("Couldn't regenerate code", { description: "Network error — please try again." });
    } finally {
      setBusyId(null);
    }
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      const res = await removeUserAction(removeTarget.id);
      if (!res.ok) {
        toast.error("Couldn't remove user", { description: res.error });
        return;
      }
      toast.success(`${removeTarget.name} removed`, {
        description: "Their sales and history stay intact.",
      });
      setRemoveTarget(null);
      void refresh();
    } catch {
      toast.error("Couldn't remove user", { description: "Network error — please try again." });
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-soft-green px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-900 dark:text-primary">
          <UserRound className="size-3.5" />
          {rows?.length ?? 0} team member{(rows?.length ?? 0) === 1 ? "" : "s"}
        </span>
        <Button size="sm" className="ml-auto" onClick={openInvite}>
          <MailPlus className="size-4" />
          Invite user
        </Button>
      </div>

      <div className="card-premium overflow-hidden">
        {loading && !rows ? (
          <div className="grid gap-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-xl" />
            ))}
          </div>
        ) : rows && rows.length === 0 ? (
          <EmptyState
            icon={UserRound}
            title="No team members yet"
            description="Invite your first user and give them a role — they'll sign up with the invite code."
            actionLabel="Invite user"
            onAction={openInvite}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead>User</TableHead>
                <TableHead className="hidden md:table-cell">Status</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="hidden lg:table-cell text-right">Joined</TableHead>
                <TableHead className="w-24 pr-4 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rows ?? []).map((u) => {
                const isSelf = u.id === currentUserId;
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-border/50 bg-muted text-[11px] font-semibold">
                          {u.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {u.name}
                            {isSelf ? (
                              <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>
                            ) : null}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge variant={u.status === "ACTIVE" ? "default" : "warning"}>
                        {u.status === "ACTIVE" ? "Active" : "Invited"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={u.role}
                        onValueChange={(v) => void changeRole(u, v as TeamUserRow["role"])}
                        disabled={isSelf || busyId === u.id}
                      >
                        <SelectTrigger className="h-8 w-32" aria-label={`Role for ${u.name}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="OWNER">Owner</SelectItem>
                          <SelectItem value="MANAGER">Manager</SelectItem>
                          <SelectItem value="STAFF">Salesperson</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="mt-1 hidden text-[11px] text-muted-foreground lg:block">
                        {ROLE_HINT[u.role]}
                      </p>
                    </TableCell>
                    <TableCell className="hidden text-right text-muted-foreground lg:table-cell">
                      {formatDate(u.createdAt)}
                    </TableCell>
                    <TableCell className="pr-4">
                      <div className="flex justify-end gap-1">
                        {u.status === "INVITED" ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={busyId === u.id}
                            onClick={() => void regenCode(u)}
                            aria-label={`Regenerate invite code for ${u.name}`}
                            title="New invite code"
                          >
                            <RefreshCw className="size-4" />
                          </Button>
                        ) : null}
                        {!isSelf ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setRemoveTarget(u)}
                            aria-label={`Remove ${u.name}`}
                          >
                            <Trash2 className="size-4 text-danger" />
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite a team member</DialogTitle>
            <DialogDescription>
              Creates the profile now; they set their own password at sign-up with the invite
              code you&apos;ll receive.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={sendInvite} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="inv-name">Full name</Label>
              <Input
                id="inv-name"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="e.g. Fatima Bello"
                required
                minLength={2}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="inv-email">Email</Label>
              <Input
                id="inv-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="cashier@xcel.app"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as TeamUserRow["role"])}>
                <SelectTrigger className="w-full" aria-label="Role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="STAFF">Salesperson — POS only</SelectItem>
                  <SelectItem value="MANAGER">Manager — catalog, stock, reports</SelectItem>
                  <SelectItem value="OWNER">Owner — full access</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{ROLE_HINT[inviteRole]}</p>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setInviteOpen(false)}
                disabled={inviting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={inviting}>
                {inviting ? (
                  <>
                    <LoaderCircle className="size-4 animate-spin" />
                    Creating…
                  </>
                ) : (
                  "Create invite"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Invite code display */}
      <Dialog open={!!codeDialog} onOpenChange={(o) => !o && setCodeDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{codeDialog?.title}</DialogTitle>
            <DialogDescription>{codeDialog?.description}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-soft-green px-4 py-3">
            <span className="font-mono text-2xl font-bold tracking-[0.25em] text-primary">
              {codeDialog?.code}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => codeDialog && void copyCode(codeDialog.code)}
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setCodeDialog(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove confirmation */}
      <AlertDialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removeTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They lose access immediately (sales history is kept). An un-joined invite code
              stops working. You can invite them again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button variant="destructive" disabled={removing} onClick={confirmRemove}>
                {removing ? "Removing…" : "Remove"}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
