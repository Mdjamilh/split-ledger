import type { Currency, Expense, Member } from "@split-ledger/shared";
import { useState } from "react";
import { Link, useParams } from "react-router";

import { ApiError } from "../api";
import { Avatar, Money, Spinner } from "../components/bits";
import { BalancesPanel } from "../components/BalancesPanel";
import { InviteButton } from "../components/InviteButton";
import ui from "../components/ui.module.css";
import { useActivity, useDeleteExpense, useExpenses, useGroup, useMe } from "../queries";
import { api } from "../api";
import styles from "./Group.module.css";

const METHOD_LABEL = { equal: "split equally", exact: "exact amounts", percentage: "by percentage", shares: "by shares" };

function formatDay(isoDate: string) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function ExpenseRow({ expense, members, meId, groupId }: { expense: Expense; members: Map<string, Member>; meId: string; groupId: string }) {
  const remove = useDeleteExpense(groupId);
  const payer = members.get(expense.paidBy);
  const myShare = expense.shares.find((s) => s.userId === meId)?.amount ?? 0;
  const lent = expense.paidBy === meId ? expense.amount - myShare : -myShare;
  const currency = expense.currency as Currency;

  return (
    <li className={styles.expense}>
      <time className={styles.date} dateTime={expense.occurredOn}>
        {formatDay(expense.occurredOn)}
      </time>
      <div className={styles.expenseMain}>
        <span className={styles.expenseTitle}>{expense.description}</span>
        <span className={ui.muted}>
          {payer?.id === meId ? "You" : (payer?.name ?? "Someone")} paid <Money amount={expense.amount} currency={currency} /> ·{" "}
          {METHOD_LABEL[expense.method]}
        </span>
      </div>
      <div className={styles.expenseYou}>
        {lent === 0 ? (
          <span className={ui.muted}>not involved</span>
        ) : lent > 0 ? (
          <span className={ui.owed}>
            you lent <Money amount={lent} currency={currency} />
          </span>
        ) : (
          <span className={ui.owe}>
            you borrowed <Money amount={-lent} currency={currency} />
          </span>
        )}
      </div>
      <div className={styles.expenseActions}>
        <Link className={`${ui.ghost} ${ui.small}`} to={`/groups/${groupId}/expenses/${expense.id}/edit`} aria-label={`Edit ${expense.description}`}>
          Edit
        </Link>
        <button
          type="button"
          className={`${ui.ghost} ${ui.small}`}
          aria-label={`Delete ${expense.description}`}
          disabled={remove.isPending}
          onClick={() => {
            if (window.confirm(`Delete "${expense.description}"?`)) remove.mutate(expense.id);
          }}
        >
          Delete
        </button>
      </div>
    </li>
  );
}

function ActivityList({ groupId }: { groupId: string }) {
  const { data, isPending } = useActivity(groupId);
  if (isPending) return <Spinner label="Loading activity" />;
  return (
    <ol className={styles.activity}>
      {data?.map((a) => (
        <li key={a.id}>
          <Avatar id={a.actorId} name={a.actorName} size={28} />
          <div>
            <strong>{a.actorName}</strong> {a.summary}
            <div className={ui.muted}>
              <time dateTime={a.createdAt}>{new Date(a.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</time>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function GroupPage() {
  const { groupId = "" } = useParams();
  const { data: me } = useMe();
  const group = useGroup(groupId);
  const expenses = useExpenses(groupId);
  const [tab, setTab] = useState<"expenses" | "activity">("expenses");

  if (group.isPending) return <Spinner label="Loading group" />;
  if (group.error) {
    const missing = group.error instanceof ApiError && group.error.status === 404;
    return (
      <div className={`${ui.card} ${styles.missing}`}>
        <h1>{missing ? "Group not found" : "Something went wrong"}</h1>
        <p className={ui.muted}>{missing ? "It may have been removed, or you are not a member." : group.error.message}</p>
        <Link to="/" className={ui.button}>
          Back to your groups
        </Link>
      </div>
    );
  }

  const g = group.data;
  const members = new Map(g.members.map((m) => [m.id, m]));

  return (
    <div className={styles.page}>
      <nav aria-label="Breadcrumb" className={styles.crumbs}>
        <Link to="/">Groups</Link> <span aria-hidden="true">/</span> <span aria-current="page">{g.name}</span>
      </nav>

      <header className={styles.header}>
        <div>
          <h1>{g.name}</h1>
          <div className={styles.members}>
            <span className={styles.avatars}>
              {g.members.map((m) => (
                <Avatar key={m.id} id={m.id} name={m.name} />
              ))}
            </span>
            <span className={ui.muted}>{g.members.map((m) => (m.id === me?.id ? "You" : m.name.split(" ")[0])).join(", ")}</span>
          </div>
        </div>
        <div className={styles.actions}>
          <InviteButton groupId={g.id} />
          <a className={ui.button} href={api.exportUrl(g.id)} download>
            Export CSV
          </a>
          <Link className={ui.primary} to={`/groups/${g.id}/expenses/new`}>
            Add expense
          </Link>
        </div>
      </header>

      <div className={styles.columns}>
        <section className={`${ui.card} ${styles.listCard}`} aria-label="Group history">
          <div className={ui.segmented} role="tablist" aria-label="View">
            <button type="button" role="tab" className={ui.segment} aria-selected={tab === "expenses"} onClick={() => setTab("expenses")}>
              Expenses
            </button>
            <button type="button" role="tab" className={ui.segment} aria-selected={tab === "activity"} onClick={() => setTab("activity")}>
              Activity
            </button>
          </div>
          {tab === "expenses" ? (
            expenses.isPending ? (
              <Spinner label="Loading expenses" />
            ) : expenses.data?.length === 0 ? (
              <div className={styles.emptyList}>
                <p>No expenses yet.</p>
                <Link className={ui.primary} to={`/groups/${g.id}/expenses/new`}>
                  Add the first one
                </Link>
              </div>
            ) : (
              <ul className={styles.expenses} aria-label="Expenses">
                {expenses.data?.map((e) => (
                  <ExpenseRow key={e.id} expense={e} members={members} meId={me?.id ?? ""} groupId={g.id} />
                ))}
              </ul>
            )
          ) : (
            <ActivityList groupId={g.id} />
          )}
        </section>

        <BalancesPanel group={g} meId={me?.id ?? ""} />
      </div>
    </div>
  );
}
