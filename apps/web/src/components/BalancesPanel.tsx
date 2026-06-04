import type { Currency, GroupDetail } from "@split-ledger/shared";
import { useState } from "react";

import { useBalances, useRecordSettlement } from "../queries";
import styles from "./BalancesPanel.module.css";
import { Avatar, Money, Spinner } from "./bits";
import ui from "./ui.module.css";

export function BalancesPanel({ group, meId }: { group: GroupDetail; meId: string }) {
  const { data, isPending } = useBalances(group.id);
  const record = useRecordSettlement(group.id);
  const [picked, setPicked] = useState<string>();
  const fullName = (id: string) => group.members.find((m) => m.id === id)?.name ?? "Former member";
  const nameOf = (id: string) => (id === meId ? "You" : fullName(id));

  if (isPending || !data) {
    return (
      <aside className={`${ui.card} ${styles.panel}`}>
        <Spinner label="Working out balances" />
      </aside>
    );
  }

  const ledgers = data.ledgers;
  const ledger = ledgers.find((l) => l.currency === picked) ?? ledgers[0];
  const currency = (ledger?.currency ?? group.currency) as Currency;
  const largest = Math.max(1, ...(ledger?.balances.map((b) => Math.abs(b.net)) ?? []));

  return (
    <aside className={`${ui.card} ${styles.panel}`} aria-labelledby="balances-title">
      <div className={styles.titleRow}>
        <h2 id="balances-title">Balances</h2>
        {ledgers.length > 1 && (
          <div className={ui.segmented} aria-label="Currency">
            {ledgers.map((l) => (
              <button key={l.currency} type="button" className={ui.segment} aria-pressed={l.currency === currency} onClick={() => setPicked(l.currency)}>
                {l.currency}
              </button>
            ))}
          </div>
        )}
      </div>

      {!ledger ? (
        <p className={ui.muted}>Nothing to balance yet. Add an expense to get started.</p>
      ) : (
        <>
          <ul className={styles.bars} aria-label={`Balances in ${currency}`}>
            {ledger.balances.map((b) => (
              <li key={b.userId} className={styles.bar}>
                <span className={styles.who}>
                  <Avatar id={b.userId} name={fullName(b.userId)} size={26} />
                  {nameOf(b.userId)}
                </span>
                <span className={`${styles.amount} ${b.net > 0 ? ui.owed : b.net < 0 ? ui.owe : ui.muted}`}>
                  {b.net > 0 ? "gets back " : b.net < 0 ? "owes " : ""}
                  {b.net === 0 ? "settled" : <Money amount={Math.abs(b.net)} currency={currency} />}
                </span>
                <span className={styles.track} aria-hidden="true">
                  <span
                    className={b.net >= 0 ? styles.fillOwed : styles.fillOwe}
                    style={{ width: `${(Math.abs(b.net) / largest) * 50}%` }}
                  />
                </span>
              </li>
            ))}
          </ul>

          <div className={styles.plan}>
            <h3>Settle up</h3>
            {ledger.plan.length === 0 ? (
              <p className={styles.done}>Everyone is square in {currency}.</p>
            ) : (
              <>
                <p className={ui.muted}>
                  {ledger.plan.length === 1 ? "One payment" : `${ledger.plan.length} payments`} settle everything in {currency}.
                </p>
                <ol className={styles.steps}>
                  {ledger.plan.map((t) => (
                    <li key={`${t.from}-${t.to}`} className={styles.step}>
                      <span>
                        <strong>{nameOf(t.from)}</strong> pays <strong>{nameOf(t.to)}</strong>
                      </span>
                      <Money amount={t.amount} currency={currency} className={styles.stepAmount} />
                      <button
                        type="button"
                        className={`${ui.button} ${ui.small}`}
                        disabled={record.isPending}
                        aria-label={`Record ${nameOf(t.from)} paying ${nameOf(t.to)}`}
                        onClick={() => record.mutate({ fromUserId: t.from, toUserId: t.to, amount: t.amount, currency })}
                      >
                        Mark paid
                      </button>
                    </li>
                  ))}
                </ol>
              </>
            )}
            {record.error && <p className={ui.error}>{record.error.message}</p>}
          </div>
        </>
      )}

      {data.settlements.length > 0 && (
        <div className={styles.history}>
          <h3>Recorded payments</h3>
          <ul>
            {data.settlements.slice(0, 5).map((s) => (
              <li key={s.id}>
                {nameOf(s.fromUserId)} paid {nameOf(s.toUserId)} <Money amount={s.amount} currency={s.currency} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
