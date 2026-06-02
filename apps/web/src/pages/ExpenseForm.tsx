import { CURRENCY_CODES, parseAmount, toDecimalString, type Currency, type Expense, type GroupDetail } from "@split-ledger/shared";
import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { api, ApiError } from "../api";
import { Spinner } from "../components/bits";
import { SplitEditor } from "../components/SplitEditor";
import ui from "../components/ui.module.css";
import { useExpenses, useGroup, useInvalidateGroup, useMe } from "../queries";
import { draftEntries, draftFromExpense, previewSplit, type SplitDraft } from "../splitForm";
import styles from "./ExpenseForm.module.css";

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function Form({ group, existing, meId }: { group: GroupDetail; existing: Expense | undefined; meId: string }) {
  const navigate = useNavigate();
  const invalidate = useInvalidateGroup();
  const memberIds = group.members.map((m) => m.id);

  const [description, setDescription] = useState(existing?.description ?? "");
  const [currency, setCurrency] = useState<Currency>((existing?.currency as Currency) ?? group.currency);
  const [amountText, setAmountText] = useState(existing ? toDecimalString(existing.amount, existing.currency as Currency) : "");
  const [paidBy, setPaidBy] = useState(existing?.paidBy ?? (memberIds.includes(meId) ? meId : memberIds[0]!));
  const [occurredOn, setOccurredOn] = useState(existing?.occurredOn ?? today());
  const [draft, setDraft] = useState<SplitDraft>(
    existing ? draftFromExpense(existing, memberIds) : { method: "equal", included: Object.fromEntries(memberIds.map((id) => [id, true])), values: {} },
  );

  const amount = parseAmount(amountText, currency);
  const amountInvalid = amountText.trim() !== "" && amount === null;
  const preview = previewSplit(amount, draft, memberIds, currency);

  const save = useMutation({
    mutationFn: () => {
      const input = {
        description,
        amount: amount ?? 0,
        currency,
        paidBy,
        occurredOn,
        method: draft.method,
        entries: draftEntries(draft, memberIds, currency).entries,
      };
      return existing ? api.updateExpense(group.id, existing.id, input) : api.addExpense(group.id, input);
    },
    onSuccess: async () => {
      await invalidate(group.id);
      navigate(`/groups/${group.id}`);
    },
  });
  const error = save.error instanceof ApiError ? save.error : undefined;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (amount === null || preview.kind !== "ok" || !description.trim()) return;
    save.mutate();
  }

  const canSave = amount !== null && preview.kind === "ok" && description.trim() !== "";

  return (
    <form className={`${ui.card} ${styles.form}`} onSubmit={submit} noValidate>
      <h1>{existing ? "Edit expense" : "Add an expense"}</h1>

      <div className={ui.field}>
        <label className={ui.label} htmlFor="description">
          Description
        </label>
        <input
          id="description"
          className={ui.input}
          value={description}
          maxLength={120}
          placeholder="Groceries, taxi, hotel..."
          onChange={(e) => setDescription(e.target.value)}
          required
          autoFocus={!existing}
        />
        {error?.field("description") && <p className={ui.error}>{error.field("description")}</p>}
      </div>

      <div className={styles.amountRow}>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="amount">
            Amount
          </label>
          <input
            id="amount"
            className={`${ui.input} num`}
            inputMode="decimal"
            placeholder="0.00"
            value={amountText}
            aria-invalid={amountInvalid || undefined}
            aria-describedby={amountInvalid ? "amount-error" : undefined}
            onChange={(e) => setAmountText(e.target.value)}
            required
          />
          {amountInvalid && (
            <p id="amount-error" className={ui.error}>
              Enter a positive amount with at most {currency === "JPY" ? "no" : currency === "KWD" ? "3" : "2"} decimals.
            </p>
          )}
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="currency">
            Currency
          </label>
          <select id="currency" className={ui.input} value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
            {CURRENCY_CODES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="date">
            Date
          </label>
          <input id="date" type="date" className={ui.input} value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} required />
        </div>
      </div>

      <div className={ui.field}>
        <label className={ui.label} htmlFor="paid-by">
          Paid by
        </label>
        <select id="paid-by" className={ui.input} value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
          {group.members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id === meId ? `${m.name} (you)` : m.name}
            </option>
          ))}
        </select>
      </div>

      <SplitEditor members={group.members} amount={amount} currency={currency} draft={draft} onChange={setDraft} meId={meId} />

      {error && (
        <p className={ui.alert} role="alert">
          {error.issues[0]?.message ?? error.message}
        </p>
      )}

      <div className={styles.actions}>
        <button className={ui.primary} disabled={!canSave || save.isPending}>
          {save.isPending ? "Saving..." : existing ? "Save changes" : "Add expense"}
        </button>
        <Link to={`/groups/${group.id}`} className={ui.ghost}>
          Cancel
        </Link>
      </div>
    </form>
  );
}

export function ExpenseFormPage() {
  const { groupId = "", expenseId } = useParams();
  const { data: me } = useMe();
  const group = useGroup(groupId);
  const expenses = useExpenses(groupId);

  if (group.isPending || (expenseId && expenses.isPending)) return <Spinner />;
  if (group.error) return <p className={ui.alert}>{group.error.message}</p>;
  const existing = expenseId ? expenses.data?.find((e) => e.id === expenseId) : undefined;
  if (expenseId && !existing) return <p className={ui.alert}>That expense no longer exists.</p>;

  return (
    <div className={styles.page}>
      <nav aria-label="Breadcrumb" className={styles.crumbs}>
        <Link to="/">Groups</Link> <span aria-hidden="true">/</span> <Link to={`/groups/${group.data.id}`}>{group.data.name}</Link>
      </nav>
      <Form key={existing?.id ?? "new"} group={group.data} existing={existing} meId={me?.id ?? ""} />
    </div>
  );
}
