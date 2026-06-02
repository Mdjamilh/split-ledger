import { SPLIT_METHODS, type Currency, type Member, type SplitMethod } from "@split-ledger/shared";

import { Avatar, Money } from "./bits";
import styles from "./SplitEditor.module.css";
import ui from "./ui.module.css";
import { draftEntries, previewSplit, type SplitDraft } from "../splitForm";

const LABELS: Record<SplitMethod, string> = { equal: "Equally", exact: "Exact amounts", percentage: "Percentages", shares: "Shares" };
const HINTS: Record<SplitMethod, string> = {
  equal: "Tick everyone who shares this cost.",
  exact: "Type what each person owes. Leave blank for people not involved.",
  percentage: "Give each person a percentage. They must add up to 100.",
  shares: "Give each person a number of shares, e.g. 2 for someone who had a double portion.",
};

interface Props {
  members: Member[];
  amount: number | null;
  currency: Currency;
  draft: SplitDraft;
  onChange(draft: SplitDraft): void;
  meId: string;
}

/** Method picker, a row per member, and a live preview of every share. */
export function SplitEditor({ members, amount, currency, draft, onChange, meId }: Props) {
  const ids = members.map((m) => m.id);
  const preview = previewSplit(amount, draft, ids, currency);
  const { invalid } = draftEntries(draft, ids, currency);

  return (
    <fieldset className={styles.editor}>
      <legend className={ui.label}>Split</legend>
      <div className={ui.segmented} role="group" aria-label="Split method">
        {SPLIT_METHODS.map((m) => (
          <button key={m} type="button" className={ui.segment} aria-pressed={draft.method === m} onClick={() => onChange({ ...draft, method: m })}>
            {LABELS[m]}
          </button>
        ))}
      </div>
      <p className={styles.hint}>{HINTS[draft.method]}</p>

      <ul className={styles.rows}>
        {members.map((m) => {
          const name = m.id === meId ? `${m.name} (you)` : m.name;
          const share = preview.kind === "ok" ? preview.shares.get(m.id) : undefined;
          const inputId = `split-${m.id}`;
          return (
            <li key={m.id} className={styles.row}>
              {draft.method === "equal" ? (
                <label className={styles.person}>
                  <input
                    type="checkbox"
                    checked={Boolean(draft.included[m.id])}
                    onChange={(e) => onChange({ ...draft, included: { ...draft.included, [m.id]: e.target.checked } })}
                  />
                  <Avatar id={m.id} name={m.name} size={28} />
                  {name}
                </label>
              ) : (
                <>
                  <label className={styles.person} htmlFor={inputId}>
                    <Avatar id={m.id} name={m.name} size={28} />
                    {name}
                  </label>
                  <span className={styles.valueWrap}>
                    <input
                      id={inputId}
                      className={`${ui.input} ${styles.value}`}
                      inputMode={draft.method === "shares" ? "numeric" : "decimal"}
                      placeholder="0"
                      value={draft.values[m.id] ?? ""}
                      aria-invalid={invalid[m.id] ? true : undefined}
                      aria-label={`${LABELS[draft.method]} for ${m.name}`}
                      onChange={(e) => onChange({ ...draft, values: { ...draft.values, [m.id]: e.target.value } })}
                    />
                    <span className={styles.unit}>{draft.method === "percentage" ? "%" : draft.method === "shares" ? "x" : currency}</span>
                  </span>
                </>
              )}
              <span className={styles.share} data-testid={`share-${m.id}`}>
                {share !== undefined && share > 0 ? <Money amount={share} currency={currency} /> : <span className={ui.muted}>-</span>}
              </span>
            </li>
          );
        })}
      </ul>

      <div className={styles.status} aria-live="polite">
        {preview.kind === "empty" && <span className={ui.muted}>Enter an amount to see each share.</span>}
        {preview.kind === "error" && (
          <span className={ui.error}>
            {preview.message}
            {preview.remaining && <strong className={styles.remaining}>{preview.remaining}</strong>}
          </span>
        )}
        {preview.kind === "ok" && amount !== null && (
          <span className={ui.owed}>
            Adds up to <Money amount={amount} currency={currency} />.
          </span>
        )}
      </div>
    </fieldset>
  );
}
