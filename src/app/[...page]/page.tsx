import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import {
  inspectInvitation,
  inspectPasswordReset,
  setupOpen,
} from "@/lib/accounts";
import { Brand } from "@/components/brand";
import { AuthForm } from "@/components/forms";
import { Workspace } from "@/components/workspace";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ page?: string[] }>;
}) {
  const parts = (await params).page ?? [];
  const path = parts.join("/");
  if (path === "privacy")
    return (
      <div className="auth-page">
        <Brand />
        <article className="auth-card">
          <h1>Datenschutz</h1>
          <p>
            SchwesterLib speichert Kontodaten und organisatorische Termindaten.
            Medizinische Diagnosen und Behandlungsnotizen werden nicht erfasst.
          </p>
          <p>
            Die Anmeldung verwendet ein technisch notwendiges Session-Cookie mit
            einer Laufzeit von sieben Tagen. Es gibt keine Analyse-Cookies oder
            Werbetracker.
          </p>
          <p>
            Bei eingerichtetem SMTP werden E-Mail-Adressen für Einladungen und
            Terminbenachrichtigungen an den konfigurierten Mailserver
            übermittelt. Optionale externe Profilbilder werden vom jeweiligen
            Bildanbieter geladen.
          </p>
          <p>
            Für Auskunft, Berichtigung oder Löschung wende dich an den
            Administrator dieser privaten Installation. Betreiberangaben,
            Rechtsgrundlage und Aufbewahrungsfristen müssen vor einem
            öffentlichen oder beruflichen Betrieb durch den Betreiber ergänzt
            werden.
          </p>
        </article>
      </div>
    );
  if (path === "setup") {
    if (!(await setupOpen())) redirect("/login");
    return (
      <div className="auth-page">
        <Brand />
        <div className="auth-card">
          <AuthForm
            mode="setup"
            setupKeyRequired={
              process.env.NODE_ENV === "production" || !!process.env.SETUP_KEY
            }
          />
        </div>
      </div>
    );
  }
  if (path === "login") {
    if (await currentUser()) redirect("/dashboard");
    if (await setupOpen()) redirect("/setup");
    return (
      <div className="auth-page">
        <Brand />
        <div className="auth-card">
          <AuthForm mode="login" />
        </div>
      </div>
    );
  }
  if (parts[0] === "invite" && parts.length === 2) {
    let invitation;
    try {
      invitation = await inspectInvitation(parts[1]);
    } catch {
      return (
        <div className="auth-page">
          <Brand />
          <div className="auth-card">
            <h1>Einladung nicht verfügbar</h1>
            <p>
              Dieser Link ist abgelaufen, widerrufen oder bereits verwendet.
              Bitte frage nach einer neuen Einladung.
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="auth-page">
        <Brand />
        <div className="auth-card">
          <AuthForm
            mode="invite"
            secret={parts[1]}
            email={invitation.email}
            displayName={invitation.displayName}
          />
        </div>
      </div>
    );
  }
  if (parts[0] === "reset-password" && parts.length === 2) {
    let reset;
    try {
      reset = await inspectPasswordReset(parts[1]);
    } catch {
      return (
        <div className="auth-page">
          <Brand />
          <div className="auth-card">
            <h1>Link nicht verfügbar</h1>
            <p>
              Dieser Link ist abgelaufen oder wurde bereits verwendet. Bitte
              frage den Administrator nach einem neuen Link.
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="auth-page">
        <Brand />
        <div className="auth-card">
          <AuthForm
            mode="reset"
            secret={parts[1]}
            displayName={reset.displayName}
          />
        </div>
      </div>
    );
  }
  const allowed = [
    "dashboard",
    "book",
    "appointments",
    "profile",
    "calendar",
    "admin",
    "admin/appointments",
    "admin/calendar",
    "admin/users",
    "admin/invitations",
    "admin/providers",
    "admin/types",
    "admin/settings",
    "admin/audit",
    "provider",
    "provider/calendar",
    "provider/availability",
    "provider/profile",
    "provider/types",
  ];
  if (!allowed.includes(path)) notFound();
  const user = await currentUser();
  if (!user) redirect("/login");
  if (path.startsWith("admin") && user.role !== "ADMIN") notFound();
  if (path.startsWith("provider") && !["ADMIN", "PROVIDER"].includes(user.role))
    notFound();
  return <Workspace user={user} path={path} />;
}
