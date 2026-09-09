"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { api } from "./forms";
import { Button } from "./ui/button";

type State = {
  permission: NotificationPermission | "unsupported" | "insecure" | "install";
  active: boolean;
  reminders: boolean;
  publicKey: string;
  subscription: PushSubscription | null;
};
export async function detachPushOnLogout() {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager?.getSubscription();
  if (subscription) {
    await api("push/unsubscribe", { endpoint: subscription.endpoint });
    await subscription.unsubscribe();
  }
  for (const notification of (await registration?.getNotifications()) ?? [])
    notification.close();
}

export function PushSettings({
  userId,
  provider = false,
  prompt = false,
}: {
  userId: string;
  provider?: boolean;
  prompt?: boolean;
}) {
  const [state, setState] = useState<State>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [dismissed, setDismissed] = useState(true);
  const dismissalKey = `push-prompt:${userId}`;
  const refresh = useCallback(async () => {
    let permission: State["permission"] = "unsupported";
    const ios =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (!window.isSecureContext) permission = "insecure";
    else if (
      ios &&
      !window.matchMedia("(display-mode: standalone)").matches &&
      !(navigator as Navigator & { standalone?: boolean }).standalone
    )
      permission = "install";
    else if (
      "Notification" in window &&
      "PushManager" in window &&
      "serviceWorker" in navigator
    )
      permission = Notification.permission;
    if (["insecure", "install", "unsupported"].includes(permission)) {
      setState({
        permission,
        active: false,
        reminders: true,
        publicKey: "",
        subscription: null,
      });
      return;
    }
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
    const subscription = await registration.pushManager.getSubscription();
    const config = await api<{ publicKey: string }>("push/config");
    const device = subscription
      ? await api<{ active: boolean; reminders: boolean }>("push/device", {
          endpoint: subscription.endpoint,
        })
      : { active: false, reminders: true };
    setState({
      permission,
      subscription,
      publicKey: config.publicKey,
      ...device,
      active: permission === "granted" && device.active,
    });
  }, []);
  useEffect(() => {
    const check = () => {
      refresh()
        .then(() => {
          try {
            setDismissed(localStorage.getItem(dismissalKey) === "dismissed");
          } catch {
            setDismissed(false);
          }
        })
        .catch((e) => setError((e as Error).message));
    };
    check();
    window.addEventListener("focus", check);
    const visible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh, dismissalKey]);

  async function enable() {
    if (!state) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      // Ask directly in the click handler: browsers require a user gesture.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState({ ...state, permission, active: false });
        if (permission === "default")
          setMessage("Du kannst Push später jederzeit hier aktivieren.");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      const key = Uint8Array.from(
        atob(state.publicKey.replace(/-/g, "+").replace(/_/g, "/")),
        (c) => c.charCodeAt(0),
      );
      const oldKey = subscription?.options.applicationServerKey;
      if (
        subscription &&
        oldKey &&
        !new Uint8Array(oldKey).every((v, i) => v === key[i])
      ) {
        await api("push/unsubscribe", { endpoint: subscription.endpoint });
        await subscription.unsubscribe();
        subscription = null;
      }
      subscription ??= await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      });
      await api("push/subscribe", {
        ...subscription.toJSON(),
        reminders: state.reminders,
      });
      setState({ ...state, permission, subscription, active: true });
      setMessage("Push-Benachrichtigungen sind auf diesem Gerät aktiviert.");
    } catch {
      setError(
        "Die Aktivierung ist fehlgeschlagen. Bitte Berechtigung und Verbindung prüfen und erneut versuchen.",
      );
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  async function action(run: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await run();
      await refresh();
      setMessage(success);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (
    prompt &&
    (dismissed || !state || state.active || state.permission !== "default")
  )
    return null;
  return (
    <section className="panel form-stack" aria-label="Push-Benachrichtigungen">
      <h2>
        <Bell size={21} aria-hidden="true" /> Push-Benachrichtigungen
      </h2>
      <p>
        {provider
          ? "Erfahre sofort, wenn ein Termin gebucht, verschoben oder abgesagt wird."
          : "Erhalte Bestätigungen und Änderungen zu deinen Terminen direkt auf diesem Gerät."}{" "}
        Die Aktivierung ist freiwillig.
      </p>
      {!state && !error && <p role="status">Berechtigung wird geprüft …</p>}
      {state?.permission === "insecure" && (
        <p className="alert">
          Öffne SchwesterLib über die sichere HTTPS-Adresse, um Push zu
          aktivieren.
        </p>
      )}
      {state?.permission === "install" && (
        <p className="alert">
          Auf iPhone und iPad: Öffne SchwesterLib in Safari, tippe auf „Teilen“
          und „Zum Home-Bildschirm“. Öffne anschließend die installierte
          Anwendung und aktiviere Push hier in den Einstellungen. Dafür ist
          iOS/iPadOS 16.4 oder neuer erforderlich.
        </p>
      )}
      {state?.permission === "unsupported" && (
        <p className="alert">
          Dieser Browser unterstützt Push hier nicht. Verwende einen aktuellen
          Browser oder ein anderes Gerät.
        </p>
      )}
      {state?.permission === "denied" && (
        <div className="alert">
          <strong>Benachrichtigungen sind blockiert.</strong>
          <p>
            Öffne über das Symbol neben der Internetadresse die
            Website-Einstellungen und erlaube „Benachrichtigungen“ für
            SchwesterLib. In Safari auf dem Mac findest du dies unter Safari →
            Einstellungen → Websites → Mitteilungen. Auf iPhone/iPad:
            Einstellungen → Mitteilungen → SchwesterLib → Mitteilungen erlauben.
          </p>
          <p>
            Kehre danach hierher zurück und aktiviere Push. Prüfe bei Bedarf
            auch die Benachrichtigungseinstellungen deines Geräts.
          </p>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => action(refresh, "Berechtigung erneut geprüft.")}
          >
            Berechtigung erneut prüfen
          </Button>
        </div>
      )}
      {state &&
        ["default", "granted"].includes(state.permission) &&
        (state.active ? (
          <>
            <p className="success-text">Auf diesem Gerät aktiviert.</p>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={state.reminders}
                disabled={busy}
                onChange={(e) => {
                  const reminders = e.target.checked;
                  setState({ ...state, reminders });
                  void action(
                    async () => {
                      try {
                        await api("push/reminders", {
                          endpoint: state.subscription!.endpoint,
                          reminders,
                        });
                      } catch (error) {
                        setState(state);
                        throw error;
                      }
                    },
                    "Erinnerungseinstellung gespeichert.",
                  );
                }}
              />{" "}
              An eigene Termine etwa 24 Stunden vorher erinnern
            </label>
            <div className="actions">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  action(
                    () =>
                      api("push/test", {
                        endpoint: state.subscription!.endpoint,
                      }),
                    "Testnachricht versendet. Prüfe die Mitteilungen auf deinem Gerät.",
                  )
                }
              >
                Testnachricht senden
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    await api("push/unsubscribe", {
                      endpoint: state.subscription!.endpoint,
                    });
                    await state.subscription!.unsubscribe();
                    try {
                      localStorage.setItem(dismissalKey, "dismissed");
                    } catch {
                      /* Storage is optional. */
                    }
                  }, "Push-Benachrichtigungen sind auf diesem Gerät deaktiviert.")
                }
              >
                Auf diesem Gerät deaktivieren
              </Button>
            </div>
          </>
        ) : (
          <Button disabled={busy || !state.publicKey} onClick={enable}>
            {busy ? "Wird aktiviert …" : "Benachrichtigungen aktivieren"}
          </Button>
        ))}
      {prompt && (
        <div className="actions">
          <Button
            variant="ghost"
            onClick={() => {
              setDismissed(true);
              try {
                localStorage.setItem(dismissalKey, "dismissed");
              } catch {
                /* Storage is optional. */
              }
            }}
          >
            Später
          </Button>
          <Link className="text-link" href="/settings">
            Zu den Einstellungen
          </Link>
        </div>
      )}
      {!prompt && (
        <p className="muted">
          Die Einstellung gilt für dieses Gerät und diesen Browser. Nach dem
          Abmelden wird Push hier deaktiviert. Vorhandene
          E-Mail-Benachrichtigungen bleiben bestehen. Push enthält keine Namen
          oder Behandlungsdetails.
        </p>
      )}
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="alert success">
          {message}
        </p>
      )}
      {!state && error && (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => action(refresh, "Berechtigung erneut geprüft.")}
        >
          Erneut versuchen
        </Button>
      )}
    </section>
  );
}
