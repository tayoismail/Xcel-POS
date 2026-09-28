"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  createExpenseAction,
  EXPENSE_CATEGORIES,
  listExpenseAccountsAction,
  type AccountOption,
} from "@/app/actions/expenses";
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
import { Textarea } from "@/components/ui/textarea";

const today = () => new Date().toISOString().slice(0, 10);

export function ExpenseFormDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [customCategory, setCustomCategory] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("NONE");
  const [date, setDate] = useState(today());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCategory(EXPENSE_CATEGORIES[0]);
    setCustomCategory("");
    setDescription("");
    setAmount("");
    setAccountId("NONE");
    setDate(today());
    void listExpenseAccountsAction()
      .then(setAccounts)
      .catch(() => toast.error("Couldn't load expense accounts"));
  }, [open]);

  const isOther = category === "Other";
  const catLabel = isOther ? customCategory.trim() : category;
  const account = accounts.find((a) => a.id === accountId);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!catLabel) {
      toast.error(isOther ? "Enter a category name" : "Select a category");
      return;
    }
    if (!(Number(amount) > 0)) {
      toast.error("Enter an amount greater than zero");
      return;
    }

    setSaving(true);
    try {
      const res = await createExpenseAction({
        category: catLabel,
        description,
        amount: Number(amount),
        accountId: accountId === "NONE" ? null : accountId,
        date,
      });
      if (!res.ok) {
        toast.error("Couldn't record expense", { description: res.error });
        return;
      }
      toast.success(`Expense recorded`, {
        description: account
          ? `${account.name} balance updated.`
          : "No account selected — balances unchanged.",
      });
      onSaved();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New expense</DialogTitle>
          <DialogDescription>
            Category, amount, payment account and date. Account balances update
            immediately.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full" aria-label="Category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isOther && (
              <Input
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                placeholder="Category name"
                aria-label="Custom category"
              />
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="exp-desc">Description</Label>
            <Textarea
              id="exp-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What was this spend for?"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="exp-amount">Amount</Label>
              <Input
                id="exp-amount"
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="exp-date">Date</Label>
              <Input
                id="exp-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Paid from</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger className="w-full" aria-label="Payment account">
                <SelectValue placeholder="Account" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">No account</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} ({a.type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Record expense"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
