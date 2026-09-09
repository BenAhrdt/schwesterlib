"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { Button } from "./ui/button";
export class ApiUnavailableError extends Error {}
export async function api<T = unknown>(
  path: string,
  data?: unknown,
): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method: data === undefined ? "GET" : "POST",
    headers: data === undefined ? {} : { "Content-Type": "application/json" },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json"))
    throw new ApiUnavailableError(
      "Der Server ist vorübergehend nicht erreichbar.",
    );
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new Error(result.error ?? "Die Anfrage ist fehlgeschlagen.");
  return result;
}
export function Field({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...props} />
    </label>
  );
}
export function AuthForm({
  mode,
  secret,
  email,
  displayName,
  setupKeyRequired,
}: {
  mode: "login" | "setup" | "invite" | "reset";
  secret?: string;
  email?: string | null;
  displayName?: string | null;
  setupKeyRequired?: boolean;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const router = useRouter();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(
        mode === "invite"
          ? `invite/${secret}`
          : mode === "reset"
            ? `reset-password/${secret}`
            : mode,
        Object.fromEntries(new FormData(e.currentTarget)),
      );
      if (mode === "reset") {
        setComplete(true);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (complete)
    return (
      <div className="form-stack">
        <div className="auth-icon">
          <LockKeyhole />
        </div>
        <h1>Passwort geändert</h1>
        <p className="alert success">
          Das neue Passwort ist gespeichert. Alle bisherigen Anmeldungen wurden
          beendet.
        </p>
        <Button asChild>
          <Link href="/login">Jetzt anmelden</Link>
        </Button>
      </div>
    );
  return (
    <form onSubmit={submit} className="form-stack">
      <div className="auth-icon">
        <LockKeyhole />
      </div>
      <h1>
        {mode === "login"
          ? "Schön, dass du da bist."
          : mode === "reset"
            ? "Neues Passwort vergeben"
            : mode === "setup"
              ? "Alles beginnt mit dir."
              : "Willkommen im Kreis."}
      </h1>
      <p className="muted">
        {mode === "login"
          ? "Melde dich an und plane deinen nächsten Termin."
          : mode === "reset"
            ? `${displayName ?? "Dein Konto"}: Wähle ein neues, einzigartiges Passwort.`
            : mode === "setup"
              ? "Richte SchwesterLib ein und erstelle dein Administratorkonto."
              : "Du wurdest zu SchwesterLib eingeladen. Erstelle jetzt dein Konto."}
      </p>
      {mode !== "reset" && (
        <Field
          label="Benutzername"
          name="username"
          required
          minLength={3}
          maxLength={32}
          autoComplete="username"
          pattern="[a-zA-Z0-9_.\-]+"
        />
      )}
      {mode !== "login" && mode !== "reset" && (
        <>
          <Field
            label="Anzeigename"
            name="displayName"
            defaultValue={displayName ?? ""}
            required
            minLength={2}
            maxLength={80}
            autoComplete="name"
          />
          <Field
            label={
              email
                ? "E-Mail-Adresse der Einladung"
                : "E-Mail-Adresse (optional)"
            }
            name="email"
            type="email"
            defaultValue={email ?? ""}
            readOnly={!!email}
            autoComplete="email"
          />
        </>
      )}
      <Field
        label="Passwort"
        name="password"
        type="password"
        required
        minLength={mode === "login" ? 1 : 12}
        maxLength={128}
        autoComplete={mode === "login" ? "current-password" : "new-password"}
      />
      {mode !== "login" && (
        <>
          <p className="field-hint">
            Mindestens 12 Zeichen. Ein langer, einzigartiger Satz eignet sich
            gut.
          </p>
          <Field
            label="Passwort bestätigen"
            name="passwordConfirm"
            type="password"
            required
            autoComplete="new-password"
          />
        </>
      )}
      {setupKeyRequired && (
        <Field
          label="Setup-Schlüssel aus der Serverkonfiguration"
          name="setupKey"
          type="password"
          required
        />
      )}
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      <Button disabled={busy}>
        {busy
          ? "Einen Moment …"
          : mode === "login"
            ? "Anmelden"
            : mode === "reset"
              ? "Passwort speichern"
              : mode === "setup"
                ? "SchwesterLib einrichten"
                : "Konto erstellen"}
        <ArrowRight size={17} />
      </Button>
      {mode === "login" && (
        <p className="auth-note">
          Noch kein Konto? Bitte den Administrator um eine Einladung.
        </p>
      )}
      <Link className="text-link" href="/">
        Zurück zur Startseite
      </Link>
    </form>
  );
}
