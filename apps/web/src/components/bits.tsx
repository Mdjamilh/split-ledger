import { formatMoney, type Currency } from "@split-ledger/shared";

import ui from "./ui.module.css";

// Darker tones only, so white initials meet WCAG AA contrast.
const AVATAR_COLOURS = ["#0f766e", "#7c3aed", "#b45309", "#be185d", "#1d4ed8", "#4d7c0f", "#9f1239", "#0e7490"];

function hash(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export function Avatar({ id, name, size = 32 }: { id: string; name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      className={ui.avatar}
      style={{ background: AVATAR_COLOURS[hash(id) % AVATAR_COLOURS.length], width: size, height: size }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

export function Money({ amount, currency, className }: { amount: number; currency: Currency; className?: string }) {
  return <span className={["num", className].filter(Boolean).join(" ")}>{formatMoney(amount, currency)}</span>;
}

/** "you are owed $12.00" / "you owe $12.00" / "settled up" for the signed-in user. */
export function Standing({ amount, currency }: { amount: number; currency: Currency }) {
  if (amount === 0) return <span className={ui.muted}>settled up</span>;
  return amount > 0 ? (
    <span className={ui.owed}>
      you are owed <Money amount={amount} currency={currency} />
    </span>
  ) : (
    <span className={ui.owe}>
      you owe <Money amount={-amount} currency={currency} />
    </span>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <p role="status" className={ui.muted}>
      {label}...
    </p>
  );
}
