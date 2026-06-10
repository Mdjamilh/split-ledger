import type { User } from "@split-ledger/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";

import { api, ApiError } from "../api";
import { DemoBanner, Logo } from "../components/Layout";
import ui from "../components/ui.module.css";
import { keys, useConfig, useMe } from "../queries";
import styles from "./Auth.module.css";

/** Only same-site paths are followed after sign-in, never an attacker-supplied URL. */
function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

function useSignedIn() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  return (user: User) => {
    client.setQueryData(keys.me, user);
    void client.invalidateQueries({ queryKey: keys.groups });
    navigate(safeNext(params.get("next")), { replace: true });
  };
}

function TryDemo() {
  const { data: config } = useConfig();
  const signedIn = useSignedIn();
  const demo = useMutation({ mutationFn: api.demo, onSuccess: signedIn });
  if (!config?.demo) return null;
  return (
    <div className={styles.demo}>
      <button type="button" className={`${ui.primary} ${styles.wide}`} onClick={() => demo.mutate()} disabled={demo.isPending}>
        {demo.isPending ? "Opening the demo..." : "Try the demo"}
      </button>
      <p className={ui.muted}>One click, no sign-up: you'll be Alex, with three groups of sample expenses.</p>
      {demo.error && <p className={ui.error}>{demo.error.message}</p>}
      <div className={styles.divider}>
        <span>or use an account</span>
      </div>
    </div>
  );
}

function AuthShell({ title, children, footer }: { title: string; children: React.ReactNode; footer: React.ReactNode }) {
  const { data: me } = useMe();
  const [params] = useSearchParams();
  // Already signed in (or just signed in): go where the visitor was heading.
  if (me) return <Navigate to={safeNext(params.get("next"))} replace />;
  return (
    <div className={styles.page}>
      <DemoBanner />
      <div className={styles.layout}>
        <section className={styles.pitch}>
          <Logo />
          <h1>Shared costs, without the awkward maths.</h1>
          <ul>
            <li>Split bills equally, by exact amounts, by percentage or by shares.</li>
            <li>Keep trips in several currencies without mixing them up.</li>
            <li>See who owes what, then settle up in the fewest payments.</li>
          </ul>
        </section>
        <section className={`${ui.card} ${styles.panel}`}>
          <h2>{title}</h2>
          <TryDemo />
          {children}
          <p className={styles.footer}>{footer}</p>
        </section>
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  ...input
}: { label: string; error?: string | undefined } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = `f-${input.name}`;
  return (
    <div className={ui.field}>
      <label className={ui.label} htmlFor={id}>
        {label}
      </label>
      <input id={id} className={ui.input} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} {...input} />
      {error && (
        <p id={`${id}-error`} className={ui.error}>
          {error}
        </p>
      )}
    </div>
  );
}

export function LoginPage() {
  const signedIn = useSignedIn();
  const [params] = useSearchParams();
  const login = useMutation({ mutationFn: api.login, onSuccess: signedIn });
  const error = login.error instanceof ApiError ? login.error : undefined;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    login.mutate({ email: String(form.get("email")), password: String(form.get("password")) });
  }

  return (
    <AuthShell
      title="Sign in"
      footer={
        <>
          New here? <Link to={`/register${params.get("next") ? `?next=${encodeURIComponent(params.get("next")!)}` : ""}`}>Create an account</Link>
        </>
      }
    >
      <form className={styles.form} onSubmit={submit} noValidate>
        {error && error.issues.length === 0 && (
          <p className={ui.alert} role="alert">
            {error.message}
          </p>
        )}
        <Field label="Email" name="email" type="email" autoComplete="email" required error={error?.field("email")} />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required error={error?.field("password")} />
        <button className={`${ui.button} ${styles.wide}`} disabled={login.isPending}>
          {login.isPending ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </AuthShell>
  );
}

export function RegisterPage() {
  const signedIn = useSignedIn();
  const [params] = useSearchParams();
  const register = useMutation({ mutationFn: api.register, onSuccess: signedIn });
  const [error, setError] = useState<ApiError>();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(undefined);
    register.mutate(
      { name: String(form.get("name")), email: String(form.get("email")), password: String(form.get("password")) },
      { onError: (e) => setError(e instanceof ApiError ? e : new ApiError(0, e.message)) },
    );
  }

  return (
    <AuthShell
      title="Create an account"
      footer={
        <>
          Already have one? <Link to={`/login${params.get("next") ? `?next=${encodeURIComponent(params.get("next")!)}` : ""}`}>Sign in</Link>
        </>
      }
    >
      <form className={styles.form} onSubmit={submit} noValidate>
        {error && error.issues.length === 0 && (
          <p className={ui.alert} role="alert">
            {error.message}
          </p>
        )}
        <Field label="Your name" name="name" autoComplete="name" required error={error?.field("name")} />
        <Field label="Email" name="email" type="email" autoComplete="email" required error={error?.field("email")} />
        <Field
          label="Password (8+ characters)"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          error={error?.field("password")}
        />
        <button className={`${ui.button} ${styles.wide}`} disabled={register.isPending}>
          {register.isPending ? "Creating..." : "Create account"}
        </button>
      </form>
    </AuthShell>
  );
}
