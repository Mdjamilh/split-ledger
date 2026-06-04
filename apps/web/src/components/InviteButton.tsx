import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "../api";
import { useInvalidateGroup } from "../queries";
import styles from "./InviteButton.module.css";
import ui from "./ui.module.css";

/** Creates a fresh invite link and offers to copy it. */
export function InviteButton({ groupId }: { groupId: string }) {
  const invalidate = useInvalidateGroup();
  const [copied, setCopied] = useState(false);
  const invite = useMutation({
    mutationFn: () => api.createInvite(groupId),
    onSuccess: () => invalidate(groupId),
  });
  const link = invite.data ? `${window.location.origin}/invite/${invite.data.token}` : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <button type="button" className={ui.button} onClick={() => invite.mutate()} disabled={invite.isPending} aria-expanded={Boolean(link)}>
        Invite people
      </button>
      {link && (
        <div className={`${ui.card} ${styles.popover}`} role="dialog" aria-label="Invite link">
          <label className={ui.label} htmlFor="invite-link">
            Anyone with this link can join for the next 7 days
          </label>
          <div className={styles.row}>
            <input id="invite-link" className={ui.input} value={link} readOnly onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className={ui.primary} onClick={copy}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <button type="button" className={`${ui.ghost} ${ui.small}`} onClick={() => invite.reset()}>
            Close
          </button>
        </div>
      )}
      {invite.error && <p className={ui.error}>{invite.error.message}</p>}
    </div>
  );
}
