import { CURRENCY_CODES, type Currency, type GroupSummary } from "@split-ledger/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";

import { api, ApiError } from "../api";
import { Spinner, Standing } from "../components/bits";
import ui from "../components/ui.module.css";
import { keys, useGroups, useMe } from "../queries";
import styles from "./Groups.module.css";

function GroupCard({ group }: { group: GroupSummary }) {
  const standings = Object.entries(group.myBalances).filter(([, v]) => v !== 0);
  return (
    <li>
      <Link to={`/groups/${group.id}`} className={`${ui.card} ${styles.groupCard}`}>
        <div className={styles.cardTop}>
          <h2>{group.name}</h2>
          <span className={styles.currency}>{group.currency}</span>
        </div>
        <p className={ui.muted}>
          {group.memberCount} {group.memberCount === 1 ? "member" : "members"}
        </p>
        <div className={styles.standings}>
          {standings.length === 0 ? (
            <span className={ui.muted}>All settled up</span>
          ) : (
            standings.map(([currency, amount]) => (
              <div key={currency}>
                <Standing amount={amount} currency={currency as Currency} />
              </div>
            ))
          )}
        </div>
      </Link>
    </li>
  );
}

function NewGroup() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const create = useMutation({
    mutationFn: api.createGroup,
    onSuccess: async ({ id }) => {
      await client.invalidateQueries({ queryKey: keys.groups });
      navigate(`/groups/${id}`);
    },
  });
  const error = create.error instanceof ApiError ? create.error : undefined;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    create.mutate({ name: String(form.get("name")), currency: String(form.get("currency")) as Currency });
  }

  if (!open) {
    return (
      <button type="button" className={ui.primary} onClick={() => setOpen(true)}>
        New group
      </button>
    );
  }
  return (
    <form className={`${ui.card} ${styles.newGroup}`} onSubmit={submit} aria-label="New group">
      <div className={ui.field}>
        <label className={ui.label} htmlFor="group-name">
          Group name
        </label>
        <input id="group-name" name="name" className={ui.input} placeholder="Weekend in the hills" required autoFocus maxLength={80} />
        {error?.field("name") && <p className={ui.error}>{error.field("name")}</p>}
      </div>
      <div className={ui.field}>
        <label className={ui.label} htmlFor="group-currency">
          Main currency
        </label>
        <select id="group-currency" name="currency" className={ui.input} defaultValue="USD">
          {CURRENCY_CODES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className={styles.formActions}>
        <button className={ui.primary} disabled={create.isPending}>
          Create group
        </button>
        <button type="button" className={ui.ghost} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Adds up the user's position across every group, per currency. */
function totals(groups: GroupSummary[]) {
  const sum: Record<string, number> = {};
  for (const g of groups) for (const [c, v] of Object.entries(g.myBalances)) sum[c] = (sum[c] ?? 0) + v;
  return Object.entries(sum).filter(([, v]) => v !== 0);
}

export function GroupsPage() {
  const { data: me } = useMe();
  const { data: groups, isPending, error } = useGroups();

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <div>
          <h1>Hi {me?.name.split(" ")[0]}, here are your groups</h1>
          {groups && groups.length > 0 && (
            <p className={styles.overall}>
              Overall:{" "}
              {totals(groups).length === 0
                ? "you're all settled up."
                : totals(groups).map(([c, v], i) => (
                    <span key={c}>
                      {i > 0 && ", "}
                      <Standing amount={v} currency={c as Currency} />
                    </span>
                  ))}
            </p>
          )}
        </div>
        <NewGroup />
      </div>

      {isPending && <Spinner label="Loading your groups" />}
      {error && <p className={ui.alert}>{error.message}</p>}
      {groups?.length === 0 && (
        <div className={`${ui.card} ${styles.empty}`}>
          <h2>No groups yet</h2>
          <p className={ui.muted}>Create one for a trip, a shared flat or a regular dinner, then invite people with a link.</p>
        </div>
      )}
      {groups && groups.length > 0 && (
        <ul className={styles.grid}>
          {groups.map((g) => (
            <GroupCard key={g.id} group={g} />
          ))}
        </ul>
      )}
    </div>
  );
}
