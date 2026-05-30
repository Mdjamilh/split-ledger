import { useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, Outlet, useLocation, useNavigate } from "react-router";

import { api } from "../api";
import { useConfig, useMe } from "../queries";
import { Avatar, Spinner } from "./bits";
import styles from "./Layout.module.css";
import ui from "./ui.module.css";

export function Logo() {
  return (
    <span className={styles.logo}>
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="#0f766e" />
        <path d="M9 11h14M9 16h9M9 21h14" stroke="#ecfdf5" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="23" cy="16" r="2.5" fill="#fbbf24" />
      </svg>
      Split Ledger
    </span>
  );
}

export function DemoBanner() {
  const { data } = useConfig();
  if (!data?.demo) return null;
  return (
    <div className={styles.banner} role="note">
      <strong>Demo mode.</strong> Data lives in memory and resets whenever the server restarts, so feel free to experiment.
    </div>
  );
}

export function Layout() {
  const { data: me } = useMe();
  const client = useQueryClient();
  const navigate = useNavigate();

  async function signOut() {
    await api.logout();
    client.clear();
    navigate("/login");
  }

  return (
    <div className={styles.shell}>
      <DemoBanner />
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link to="/" className={styles.brand} aria-label="Split Ledger home">
            <Logo />
          </Link>
          {me && (
            <div className={styles.user}>
              <Avatar id={me.id} name={me.name} size={30} />
              <span className={styles.userName}>{me.name}</span>
              <button type="button" className={`${ui.ghost} ${ui.small}`} onClick={signOut}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}

/** Gate for pages that need a session; remembers where to come back to. */
export function RequireAuth() {
  const { data: me, isPending } = useMe();
  const location = useLocation();
  if (isPending) return <Spinner />;
  if (!me) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  return <Outlet />;
}
