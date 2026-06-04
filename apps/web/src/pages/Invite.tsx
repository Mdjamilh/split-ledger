import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, Navigate, useNavigate, useParams } from "react-router";

import { api } from "../api";
import { Spinner } from "../components/bits";
import ui from "../components/ui.module.css";
import { useInvalidateGroup } from "../queries";
import styles from "./Invite.module.css";

export function InvitePage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const invalidate = useInvalidateGroup();
  const preview = useQuery({ queryKey: ["invite", token], queryFn: () => api.invite(token), retry: false });
  const accept = useMutation({
    mutationFn: () => api.acceptInvite(token),
    onSuccess: async ({ groupId }) => {
      await invalidate(groupId);
      navigate(`/groups/${groupId}`);
    },
  });

  if (preview.isPending) return <Spinner label="Checking the invite" />;
  if (preview.error) {
    return (
      <div className={`${ui.card} ${styles.card}`}>
        <h1>Invite not valid</h1>
        <p className={ui.muted}>{preview.error.message} Ask for a new link.</p>
        <Link to="/" className={ui.button}>
          Go to your groups
        </Link>
      </div>
    );
  }
  const invite = preview.data;
  if (invite.alreadyMember) return <Navigate to={`/groups/${invite.groupId}`} replace />;

  return (
    <div className={`${ui.card} ${styles.card}`}>
      <p className={styles.eyebrow}>You're invited</p>
      <h1>Join {invite.groupName}</h1>
      <p className={ui.muted}>
        {invite.invitedBy} invited you. The group has {invite.memberCount} {invite.memberCount === 1 ? "member" : "members"}.
      </p>
      <div className={styles.actions}>
        <button type="button" className={ui.primary} onClick={() => accept.mutate()} disabled={accept.isPending}>
          {accept.isPending ? "Joining..." : "Join group"}
        </button>
        <Link to="/" className={ui.ghost}>
          Not now
        </Link>
      </div>
      {accept.error && <p className={ui.error}>{accept.error.message}</p>}
    </div>
  );
}
