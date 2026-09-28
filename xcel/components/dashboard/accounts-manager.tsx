"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeftRight,
  Landmark,
  Pencil,
  Plus,
  Scale,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import {
  adjustBalanceAction,
  createAccountAction,
  listAccountsAction,
  transferAction,
  updateAccountAction,
  type AccountRow,
  type AccountTypeFilter,
} from "@/app/actions/accounts";
import { EmptyState } from "@/components/shared/empty-state";
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
import { Switch } from "@/components/ui/switch";
import { cn, formatCurrency as naira } from "@/lib/utils";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const typeBadge: Record<AccountTypeFilter, { label: string; variant: "default" | "info" | "warning" | "secondary" }> = {
  BANK: { label: "Bank", variant: "info" },
  CASH: { label: "Cash", variant: "default" },
  POS: { label: "POS", variant: "warning" },
};

const typeIcon: Record<AccountTypeFilter, typeof Landmark> = {
  BANK: Landmark,
  CASH: Wallet,
  POS: Scale,
};

type AccountFormMode = "create" | "edit";

export function AccountsManager() {
  const [rows, setRows] = useState<AccountRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  const [accountForm, setAccountForm] = useState<{
    mode: AccountFormMode;
    account: AccountRow | null;
  } | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<AccountRow | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);

  // Account form state
  const [accName, setAccName] = useState("");
  const [accType, setAccType] = useState<AccountTypeFilter>("CASH");
  const [accNumber, setAccNumber] = useState("");
  const [accOpening, setAccOpening] = useState("");
  const [accActive, setAccActive] = useState(true);
  const [saving, setSaving] = useState(false);

  // Adjust state
  const [adjAmount, setAdjAmount] = useState("");
  const [adjNote, setAdjNote] = useState("");

  // Transfer state
  const [trFrom, setTrFrom] = useState("");
  const [trTo, setTrTo] = useState("");
  const [trAmount, setTrAmount] = useState("");
  const [trNote, setTrNote] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listAccountsAction());
    } catch {
      toast.error("Couldn't load accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function openCreate() {
    setAccountForm({ mode: "create", account: null });
    setAccName("");
    setAccType("CASH");
    setAccNumber("");
    setAccOpening("");
    setAccActive(true);
  }

  function openEdit(account: AccountRow) {
    setAccountForm({ mode: "edit", account });
    setAccName(account.name);
    setAccType(account.type);
    setAccNumber(account.accountNumber ?? "");
    setAccOpening("0");
    setAccActive(account.isActive);
  }

  function openTransfer(fromId?: string) {
    const active = (rows ?? []).filter((a) => a.isActive);
    setTrFrom(fromId ?? active[0]?.id ?? "");
    setTrTo(active.find((a) => a.id !== (fromId ?? active[0]?.id))?.id ?? "");
    setTrAmount("");
    setTrNote("");
    setTransferOpen(true);
  }

  async function saveAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!accName.trim()) {
      toast.error("Account name is required");
      return;
    }
    setSaving(true);
    try {
      const res =
        accountForm?.mode === "edit" && accountForm.account
          ? await updateAccountAction({
              accountId: accountForm.account.id,
              name: accName,
              type: accType,
              accountNumber: accNumber,
              isActive: accActive,
            })
          : await createAccountAction({
              name: accName,
              type: accType,
              accountNumber: accNumber,
              openingBalance: Number(accOpening) || 0,
            });
      if (!res.ok) {
        toast.error("Couldn't save account", { description: res.error });
        return;
      }
      toast.success(
        accountForm?.mode === "edit" ? "Account updated" : "Account created",
      );
      setAccountForm(null);
      void refresh();
    } finally {
      setSaving(false);
    }
  }

  async function saveAdjust(e: React.FormEvent) {
    e.preventDefault();
    if (!adjustTarget) return;
    const amount = Number(adjAmount);
    if (!amount) {
      toast.error("Enter a non-zero amount");
      return;
    }
    setSaving(true);
    try {
      const res = await adjustBalanceAction({
        accountId: adjustTarget.id,
        amount,
        note: adjNote,
      });
      if (!res.ok) {
        toast.error("Adjustment failed", { description: res.error });
        return;
      }
      toast.success(`${adjustTarget.name} adjusted by ${naira(String(amount))}`);
      setAdjustTarget(null);
      setAdjAmount("");
      setAdjNote("");
      void refresh();
    } finally {
      setSaving(false);
    }
  }

  async function saveTransfer(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await transferAction({
        fromId: trFrom,
        toId: trTo,
        amount: Number(trAmount),
        note: trNote,
      });
      if (!res.ok) {
        toast.error("Transfer failed", { description: res.error });
        return;
      }
      const from = rows?.find((a) => a.id === trFrom)?.name ?? "";
      const to = rows?.find((a) => a.id === trTo)?.name ?? "";
      toast.success(`Transferred ${naira(trAmount)}`, {
        description: `${from} → ${to}`,
      });
      setTransferOpen(false);
      void refresh();
    } finally {
      setSaving(false);
    }
  }

  const totalBalance = (rows ?? [])
    .filter((r) => r.isActive)
    .reduce((s, r) => s + Number(r.balance), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-soft-green px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-900 dark:text-primary animate-in fade-in duration-200">
          <Landmark className="size-3.5" />
          {rows?.length ?? 0} account{(rows?.length ?? 0) === 1 ? "" : "s"} ·{" "}
          {naira(String(totalBalance))}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => openTransfer()}>
            <ArrowLeftRight className="size-4" />
            Transfer
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4" />
            New account
          </Button>
        </div>
      </div>

      {loading && !rows ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
      ) : rows && rows.length === 0 ? (
        <div className="card-premium">
          <EmptyState
            icon={Landmark}
            title="No accounts yet"
            description="Add your cash drawer, bank and POS accounts so sales, expenses and transfers keep balances in sync."
            actionLabel="+ New account"
            onAction={openCreate}
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(rows ?? []).map((a) => {
            const Icon = typeIcon[a.type];
            const tone = typeBadge[a.type];
            const negative = Number(a.balance) < 0;
            return (
              <div
                key={a.id}
                className={cn(
                  "flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-5 shadow-card",
                  !a.isActive && "opacity-60",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-soft-green">
                      <Icon className="size-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-lg leading-tight font-semibold tracking-tight text-slate-900 dark:text-foreground">
                        {a.name}
                      </p>
                      <p className="truncate font-mono text-xs text-slate-500 dark:text-muted-foreground">
                        {a.accountNumber ?? "—"}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge variant={tone.variant}>{tone.label}</Badge>
                    {!a.isActive ? (
                      <Badge variant="outline">Inactive</Badge>
                    ) : null}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-muted-foreground">
                    Balance
                  </p>
                  <p
                    className={cn(
                      "mt-1.5 text-xl leading-tight font-bold tracking-tight tabular-nums",
                      negative ? "text-danger" : "text-foreground",
                    )}
                  >
                    {naira(a.balance)}
                  </p>
                  <p className="mt-1.5 text-xs text-slate-500 dark:text-muted-soft">
                    In {naira(a.paymentsIn)} · spent {naira(a.spent)}
                    {a.lastActivityAt ? ` · last ${formatDate(a.lastActivityAt)}` : ""}
                  </p>
                </div>

                <div className="mt-auto flex flex-wrap gap-2 border-t border-border/60 pt-3">
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => {
                      setAdjustTarget(a);
                      setAdjAmount("");
                      setAdjNote("");
                    }}
                  >
                    <Scale className="size-3.5" />
                    Adjust
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => openTransfer(a.id)}
                    disabled={!a.isActive}
                  >
                    <ArrowLeftRight className="size-3.5" />
                    Transfer
                  </Button>
                  <Button size="xs" variant="ghost" onClick={() => openEdit(a)}>
                    <Pencil className="size-3.5" />
                    Edit
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / edit account */}
      <Dialog open={!!accountForm} onOpenChange={(o) => !o && setAccountForm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {accountForm?.mode === "edit" ? "Edit account" : "New account"}
            </DialogTitle>
            <DialogDescription>
              Cash drawers, bank accounts and POS wallets used across the app.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveAccount} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="acc-name">Name</Label>
              <Input
                id="acc-name"
                value={accName}
                onChange={(e) => setAccName(e.target.value)}
                placeholder="e.g. Moniepoint, Opay, Cash drawer"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Type</Label>
                <Select
                  value={accType}
                  onValueChange={(v) => setAccType(v as AccountTypeFilter)}
                >
                  <SelectTrigger className="w-full" aria-label="Account type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">Cash</SelectItem>
                    <SelectItem value="BANK">Bank</SelectItem>
                    <SelectItem value="POS">POS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="acc-number">Account number</Label>
                <Input
                  id="acc-number"
                  value={accNumber}
                  onChange={(e) => setAccNumber(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>
            {accountForm?.mode === "create" ? (
              <div className="grid gap-2">
                <Label htmlFor="acc-opening">Opening balance</Label>
                <Input
                  id="acc-opening"
                  type="number"
                  step="0.01"
                  min={0}
                  value={accOpening}
                  onChange={(e) => setAccOpening(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            ) : (
              <label className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-secondary/50 px-3 py-2.5">
                <span className="text-sm font-medium">Active</span>
                <Switch checked={accActive} onCheckedChange={setAccActive} />
              </label>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAccountForm(null)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : accountForm?.mode === "edit" ? "Save" : "Create account"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Adjust balance */}
      <Dialog open={!!adjustTarget} onOpenChange={(o) => !o && setAdjustTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Adjust {adjustTarget?.name}</DialogTitle>
            <DialogDescription>
              Signed correction — positive credits the account, negative debits it.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveAdjust} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="adj-amount">Amount</Label>
              <Input
                id="adj-amount"
                type="number"
                step="0.01"
                value={adjAmount}
                onChange={(e) => setAdjAmount(e.target.value)}
                placeholder="e.g. 5000 or -1200"
              />
              <p className="text-xs text-muted-foreground">
                Current balance {adjustTarget ? naira(adjustTarget.balance) : ""}
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="adj-note">Note</Label>
              <Input
                id="adj-note"
                value={adjNote}
                onChange={(e) => setAdjNote(e.target.value)}
                placeholder="Why this correction? (logged)"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAdjustTarget(null)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Apply adjustment"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Transfer */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Transfer between accounts</DialogTitle>
            <DialogDescription>
              Moves funds instantly and writes an audit entry.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveTransfer} className="grid gap-4">
            <div className="grid gap-2">
              <Label>From</Label>
              <Select value={trFrom} onValueChange={setTrFrom}>
                <SelectTrigger className="w-full" aria-label="From account">
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  {(rows ?? [])
                    .filter((a) => a.isActive)
                    .map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} ({naira(a.balance)})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>To</Label>
              <Select value={trTo} onValueChange={setTrTo}>
                <SelectTrigger className="w-full" aria-label="To account">
                  <SelectValue placeholder="Destination" />
                </SelectTrigger>
                <SelectContent>
                  {(rows ?? [])
                    .filter((a) => a.isActive && a.id !== trFrom)
                    .map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tr-amount">Amount</Label>
              <Input
                id="tr-amount"
                type="number"
                min={0}
                step="0.01"
                value={trAmount}
                onChange={(e) => setTrAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tr-note">Note</Label>
              <Input
                id="tr-note"
                value={trNote}
                onChange={(e) => setTrNote(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setTransferOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving || !trFrom || !trTo || !(Number(trAmount) > 0)}
              >
                {saving ? "Transferring…" : "Transfer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
