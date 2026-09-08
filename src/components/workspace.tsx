"use client";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addDays,
  addMonths,
  startOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  format,
  isSameDay,
} from "date-fns";
import { de } from "date-fns/locale";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import {
  ArrowRight,
  CalendarDays,
  LayoutDashboard,
  Users,
  Mail,
  Stethoscope,
  Settings,
  LogOut,
  Menu,
  Clock3,
  Plus,
  Check,
  ChevronLeft,
  ChevronRight,
  Bandage,
  ShieldCheck,
  UserRound,
  ClipboardList,
  Copy,
  X,
  RefreshCw,
  Download,
  ExternalLink,
} from "lucide-react";
import type { Actor } from "@/lib/auth";
import { Brand } from "./brand";
import { Button } from "./ui/button";
import { api, Field } from "./forms";
type Type = {
  id: string;
  name: string;
  description: string;
  duration: number;
  bufferBefore: number;
  bufferAfter: number;
  active: boolean;
  color: string;
  providers?: { id: string }[];
};
type Provider = {
  id: string;
  user: { displayName: string; email?: string | null };
  invitation?: { status: string; expiresAt: string } | null;
  emailNotifications?: boolean;
  specialty: string;
  description: string;
  location: string;
  imageUrl: string;
  qualifications: string;
  timezone: string;
  active: boolean;
  types: Type[];
  rules: { weekday: number; startMinute: number; endMinute: number }[];
  exceptions: {
    id: string;
    startsAt: string;
    endsAt: string;
    available: boolean;
  }[];
};
type Appointment = {
  id: string;
  userId: string;
  providerId: string;
  typeId: string;
  typeName: string;
  startsAt: string;
  endsAt: string;
  status: string;
  provider: Provider;
  user: { displayName: string };
};
type Invitation = {
  id: string;
  email: string | null;
  displayName: string | null;
  role: string;
  status: string;
  expiresAt: string;
};
const statusLabels: Record<string, string> = {
  PENDING: "Ausstehend",
  CONFIRMED: "Bestätigt",
  CANCELLED: "Abgesagt",
  COMPLETED: "Erledigt",
  NO_SHOW: "Nicht erschienen",
};
const roleLabels: Record<string, string> = {
  USER: "Benutzer",
  PROVIDER: "Behandler",
  ADMIN: "Administrator",
};
const dateLabel = (value: string, tz = "Europe/Berlin") =>
  formatInTimeZone(new Date(value), tz, "dd. MMM yyyy · HH:mm", { locale: de });
function useData<T>(path: string) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const refresh = useCallback(() => {
    setError("");
    api<T>(path)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [path]);
  useEffect(() => {
    let live = true;
    api<T>(path)
      .then((v) => {
        if (live) setData(v);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [path]);
  return { data, error, refresh };
}
function Select({
  label,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const labelId = useId();
  return (
    <label className="field">
      <span id={labelId}>{label}</span>
      <select aria-labelledby={labelId} {...props}>
        {children}
      </select>
    </label>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="empty">
      <CalendarDays size={32} />
      <h3>Noch ein bisschen Freiraum.</h3>
      <p>{children}</p>
    </div>
  );
}
function Notice({ error, message }: { error?: string; message?: string }) {
  return (
    <>
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
    </>
  );
}
function ActionForm({
  endpoint,
  children,
  transform,
  onSuccess,
  label = "Speichern",
}: {
  endpoint: string;
  children: React.ReactNode;
  transform?: (data: Record<string, FormDataEntryValue>) => unknown;
  onSuccess?: (result: unknown) => void;
  label?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const values = Object.fromEntries(new FormData(e.currentTarget));
      const result = await api(
        endpoint,
        transform ? transform(values) : values,
      );
      setMessage("Erfolgreich gespeichert.");
      onSuccess?.(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="form-stack" onSubmit={submit}>
      {children}
      <Notice error={error} message={message} />
      <Button disabled={busy}>{busy ? "Wird gespeichert …" : label}</Button>
    </form>
  );
}
export function Workspace({ user, path }: { user: Actor; path: string }) {
  const [menu, setMenu] = useState(false);
  const router = useRouter();
  const [logoutError, setLogoutError] = useState("");
  const isAdmin = user.role === "ADMIN",
    isProvider = user.role === "PROVIDER";
  const links = [
    { href: "/dashboard", label: "Übersicht", icon: LayoutDashboard },
    { href: "/book", label: "Termin buchen", icon: Plus },
    { href: "/appointments", label: "Meine Termine", icon: CalendarDays },
    { href: "/profile", label: "Mein Profil", icon: UserRound },
    ...(isAdmin
      ? [
          { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
          {
            href: "/admin/appointments",
            label: "Alle Termine",
            icon: ClipboardList,
          },
          { href: "/admin/calendar", label: "Kalender", icon: CalendarDays },
          { href: "/admin/users", label: "Benutzer", icon: Users },
          { href: "/admin/invitations", label: "Einladungen", icon: Mail },
          { href: "/admin/providers", label: "Behandler", icon: Stethoscope },
          { href: "/admin/types", label: "Terminarten", icon: Bandage },
          { href: "/admin/settings", label: "Einstellungen", icon: Settings },
          { href: "/admin/audit", label: "Aktivitäten", icon: ShieldCheck },
        ]
      : isProvider
        ? [
            {
              href: "/provider",
              label: "Praxisübersicht",
              icon: LayoutDashboard,
            },
            {
              href: "/provider/calendar",
              label: "Kalender",
              icon: CalendarDays,
            },
            {
              href: "/provider/availability",
              label: "Verfügbarkeit",
              icon: Clock3,
            },
            {
              href: "/provider/profile",
              label: "Behandlerprofil",
              icon: Stethoscope,
            },
            { href: "/provider/types", label: "Terminarten", icon: Bandage },
          ]
        : []),
  ];
  const title = links.find((l) => l.href === `/${path}`)?.label ?? "Kalender";
  return (
    <div className="workspace">
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <Brand />
        <div className="nav-caption">MEIN SCHWESTERLIB</div>
        <nav>
          {links.map((l, i) => (
            <div key={l.href}>
              {i === 4 && (
                <div className="nav-caption">
                  {isAdmin ? "ADMINISTRATION" : "MEINE PRAXIS"}
                </div>
              )}
              <Link
                className={l.href === `/${path}` ? "active" : ""}
                href={l.href}
                onClick={() => setMenu(false)}
              >
                <l.icon size={18} />
                {l.label}
              </Link>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="avatar">{user.displayName.slice(0, 1)}</span>
          <div>
            <strong>{user.displayName}</strong>
            <small>{roleLabels[user.role]}</small>
          </div>
          <button
            aria-label="Abmelden"
            onClick={async () => {
              try {
                await api("logout", {});
                router.push("/login");
                router.refresh();
              } catch (e) {
                setLogoutError((e as Error).message);
              }
            }}
          >
            <LogOut size={18} />
          </button>
        </div>
        <Notice error={logoutError} />
      </aside>
      <div className="workspace-main">
        <header className="workspace-header">
          <button
            className="mobile-menu"
            aria-label="Menü öffnen"
            onClick={() => setMenu(!menu)}
          >
            <Menu />
          </button>
          <span>
            Mein Bereich <span className="muted">/ {title}</span>
          </span>
          <span className="private-badge">
            <ShieldCheck size={14} />
            Privater Kreis
          </span>
        </header>
        <main className="workspace-content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">PERSÖNLICH. GUT ORGANISIERT.</span>
              <h1>{title}</h1>
            </div>
            {!path.includes("book") && (
              <Button asChild>
                <Link href="/book">
                  <Plus size={17} />
                  Termin buchen
                </Link>
              </Button>
            )}
          </div>
          {["dashboard", "admin", "provider"].includes(path) ? (
            <Dashboard user={user} admin={path === "admin"} />
          ) : path === "book" ? (
            <Booking />
          ) : path.endsWith("appointments") ? (
            <Appointments user={user} own={path === "appointments"} />
          ) : path.endsWith("calendar") ? (
            <Appointments user={user} calendar />
          ) : path === "profile" ? (
            <Profile user={user} />
          ) : path.endsWith("users") ? (
            <UsersPanel />
          ) : path.endsWith("invitations") ? (
            <Invitations />
          ) : path.endsWith("providers") ||
            path === "provider/profile" ||
            path.endsWith("availability") ? (
            <Providers availability={path.endsWith("availability")} />
          ) : path.endsWith("types") ? (
            <Types />
          ) : path.endsWith("settings") ? (
            <SettingsPanel />
          ) : path.endsWith("audit") ? (
            <Audit />
          ) : null}
        </main>
        <div className="workspace-footer">
          SchwesterLib · Mit Sorgfalt und Geschwisterbonus.{" "}
          <Link href="/privacy">Datenschutz</Link>
        </div>
      </div>
    </div>
  );
}
function Dashboard({ user, admin }: { user: Actor; admin: boolean }) {
  const { data, error } = useData<Appointment[]>("appointments");
  const people = useData<Actor[]>(admin ? "users" : "me");
  const invites = useData<Invitation[]>(admin ? "invitations" : "me");
  const upcoming = data?.filter(
    (a) =>
      ["CONFIRMED", "PENDING"].includes(a.status) &&
      new Date(a.startsAt) > new Date(),
  );
  const today = data?.filter(
    (a) =>
      formatInTimeZone(new Date(a.startsAt), "Europe/Berlin", "yyyy-MM-dd") ===
        formatInTimeZone(new Date(), "Europe/Berlin", "yyyy-MM-dd") &&
      a.status !== "CANCELLED",
  );
  return (
    <>
      <div className="welcome-banner">
        <div>
          <span className="eyebrow">EIN GUTER TAG FÜR GUTE VERSORGUNG</span>
          <h2>
            Hallo, {user.displayName} <span className="wave">✦</span>
          </h2>
          <p>
            Schön, dass du da bist. Hier ist alles für deine nächsten Termine.
          </p>
        </div>
        <CalendarDays size={76} strokeWidth={1} />
      </div>
      <Notice error={error} />
      <div className="stats-grid">
        <Stat label="Termine heute" value={today?.length} />
        <Stat label="Kommende Termine" value={upcoming?.length} />
        {admin && (
          <>
            <Stat
              label="Benutzer / Behandler"
              value={
                Array.isArray(people.data)
                  ? `${people.data.length} / ${people.data.filter((p) => p.role === "PROVIDER").length}`
                  : undefined
              }
            />
            <Stat
              label="Offene Einladungen"
              value={
                Array.isArray(invites.data)
                  ? invites.data.filter(
                      (i) =>
                        i.status === "OPEN" &&
                        new Date(i.expiresAt) > new Date(),
                    ).length
                  : undefined
              }
            />
          </>
        )}
      </div>
      <section className="panel">
        <div className="panel-title">
          <h2>Als Nächstes</h2>
          <Link
            className="text-link"
            href={admin ? "/admin/appointments" : "/appointments"}
          >
            Alle Termine <ArrowRight size={15} />
          </Link>
        </div>
        {!data ? (
          <p>Lade Termine …</p>
        ) : !upcoming?.length ? (
          <Empty>
            Dein Kalender ist noch frei. Finde jetzt einen passenden Termin.
          </Empty>
        ) : (
          upcoming
            .slice(0, 5)
            .map((a) => <AppointmentRow key={a.id} appointment={a} />)
        )}
      </section>
      <div className="tip-card">
        <HeartMark />
        <p>
          <strong>Gut zu wissen</strong>
          <br />
          Bitte erscheine pünktlich. Verspätungen können mit Augenrollen der
          behandelnden Schwester geahndet werden.
        </p>
      </div>
    </>
  );
}
function HeartMark() {
  return (
    <span className="icon-bubble">
      <ShieldCheck size={23} />
    </span>
  );
}
function Stat({ label, value }: { label: string; value?: number | string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value ?? "—"}</strong>
    </div>
  );
}
function AppointmentRow({
  appointment: a,
  children,
}: {
  appointment: Appointment;
  children?: React.ReactNode;
}) {
  return (
    <div className="appointment-row">
      <div className="date-tile">
        <strong>
          {formatInTimeZone(new Date(a.startsAt), a.provider.timezone, "dd")}
        </strong>
        <span>
          {formatInTimeZone(new Date(a.startsAt), a.provider.timezone, "MMM", {
            locale: de,
          })}
        </span>
      </div>
      <div className="appointment-info">
        <h3>{a.typeName}</h3>
        <p>
          {dateLabel(a.startsAt, a.provider.timezone)}–
          {formatInTimeZone(new Date(a.endsAt), a.provider.timezone, "HH:mm")}{" "}
          Uhr
        </p>
        <small>
          {a.provider.user.displayName} · {a.provider.location}
        </small>
      </div>
      <span className={`status ${a.status.toLowerCase()}`}>
        {statusLabels[a.status]}
      </span>
      {children}
    </div>
  );
}
function Booking({
  reschedule,
  onComplete,
}: {
  reschedule?: Appointment;
  onComplete?: () => void;
}) {
  const { data: providers, error } = useData<Provider[]>("catalog");
  const [providerId, setProvider] = useState(reschedule?.providerId ?? ""),
    [typeId, setType] = useState(reschedule?.typeId ?? ""),
    [date, setDate] = useState(
      formatInTimeZone(new Date(), "Europe/Berlin", "yyyy-MM-dd"),
    ),
    [selected, setSelected] = useState("");
  const [slots, setSlots] = useState<
      { startsAt: string; endsAt: string; label: string }[]
    >([]),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(""),
    [success, setSuccess] = useState(false),
    [mailWarning, setMailWarning] = useState(false);
  const provider = providers?.find((p) => p.id === providerId),
    type = provider?.types.find((t) => t.id === typeId);
  useEffect(() => {
    if (!providerId || !typeId || !date) return;
    let live = true;
    api<typeof slots>(
      `slots?providerId=${encodeURIComponent(providerId)}&typeId=${encodeURIComponent(typeId)}&date=${date}`,
    )
      .then((v) => {
        if (live) {
          setSlots(v);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (live) {
          setFailure(e.message);
          setLoading(false);
        }
      });
    return () => {
      live = false;
    };
  }, [providerId, typeId, date]);
  function invalidate() {
    setSelected("");
    setSlots([]);
    setLoading(true);
    setFailure("");
  }
  async function book() {
    setBusy(true);
    setFailure("");
    try {
      const result = await api<{ mailSent: boolean }>("appointments/book", {
        providerId,
        typeId,
        startsAt: selected,
        appointmentId: reschedule?.id,
      });
      setSuccess(true);
      setMailWarning(!result.mailSent);
      onComplete?.();
    } catch (e) {
      setFailure((e as Error).message);
      setSelected("");
    } finally {
      setBusy(false);
    }
  }
  if (success)
    return (
      <div className="panel booking-success">
        <span className="success-icon">
          <Check size={36} />
        </span>
        <h2>
          {reschedule
            ? "Dein Termin wurde verschoben."
            : "Ihr Termin wurde erfolgreich gebucht."}
        </h2>
        <p>
          {type?.name} · {dateLabel(selected, provider?.timezone)}
        </p>
        <p className="muted">
          Bitte erscheinen Sie pünktlich. Verspätungen können mit Augenrollen
          der behandelnden Schwester geahndet werden.
        </p>
        {mailWarning && (
          <p className="alert">
            Der Termin ist gespeichert. Die E-Mail konnte nicht zugestellt
            werden.
          </p>
        )}
        <Button asChild>
          <Link href="/appointments">
            Zu meinen Terminen <ArrowRight size={16} />
          </Link>
        </Button>
      </div>
    );
  return (
    <>
      <div className="booking-progress">
        <span className={providerId ? "done" : ""}>
          1 <b>Behandler & Leistung</b>
        </span>
        <i />
        <span className={selected ? "done" : ""}>
          2 <b>Datum & Uhrzeit</b>
        </span>
        <i />
        <span>
          3 <b>Bestätigen</b>
        </span>
      </div>
      <Notice error={error || failure} />
      <div className="booking-grid">
        <div>
          <section className="panel">
            <h2>Wer darf sich um dich kümmern?</h2>
            {!providers ? (
              <p>Lade Behandler …</p>
            ) : providers.length === 0 ? (
              <Empty>
                Es sind noch keine Behandler eingerichtet. Bitte wende dich an
                den Administrator.
              </Empty>
            ) : (
              <div className="provider-choices">
                {providers.map((p) => (
                  <button
                    key={p.id}
                    disabled={!!reschedule}
                    className={`provider-choice ${providerId === p.id ? "selected" : ""}`}
                    onClick={() => {
                      setProvider(p.id);
                      setType("");
                      invalidate();
                    }}
                  >
                    <span className="avatar large">
                      {p.imageUrl ? (
                        // Remote URLs are validated as HTTPS; no image proxy fetches private hosts.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.imageUrl}
                          alt=""
                          width={52}
                          height={52}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            borderRadius: "inherit",
                          }}
                        />
                      ) : (
                        p.user.displayName.slice(0, 1)
                      )}
                    </span>
                    <span>
                      <strong>{p.user.displayName}</strong>
                      <small>{p.specialty}</small>
                      <small>{p.location}</small>
                    </span>
                    {providerId === p.id && <Check size={20} />}
                  </button>
                ))}
              </div>
            )}
            {provider && (
              <div className="provider-description">
                <p>{provider.description}</p>
                <small>{provider.qualifications}</small>
              </div>
            )}
            {provider && (
              <>
                <h2 className="subheading">Was können wir für dich tun?</h2>
                <div className="type-choices">
                  {provider.types.map((t) => (
                    <button
                      disabled={!!reschedule && t.id !== reschedule.typeId}
                      key={t.id}
                      className={typeId === t.id ? "selected" : ""}
                      onClick={() => {
                        setType(t.id);
                        invalidate();
                      }}
                    >
                      <Bandage size={20} />
                      <span>
                        <strong>{t.name}</strong>
                        <small>
                          {t.duration} Minuten · {t.description}
                        </small>
                      </span>
                      {typeId === t.id && <Check size={18} />}
                    </button>
                  ))}
                </div>
                {!provider.types.length && (
                  <p className="muted">
                    Noch keine aktiven Leistungen zugeordnet.
                  </p>
                )}
              </>
            )}
          </section>
          {type && (
            <section className="panel">
              <h2>Wann passt es dir?</h2>
              <Field
                label={`Datum · Zeitzone ${provider?.timezone}`}
                type="date"
                value={date}
                min={formatInTimeZone(
                  new Date(),
                  provider?.timezone ?? "Europe/Berlin",
                  "yyyy-MM-dd",
                )}
                onChange={(e) => {
                  setDate(e.target.value);
                  invalidate();
                }}
              />
              <div className="slots">
                {loading ? (
                  <p>Freie Zeiten werden gesucht …</p>
                ) : slots.length ? (
                  slots.map((s) => (
                    <button
                      key={s.startsAt}
                      className={selected === s.startsAt ? "selected" : ""}
                      onClick={() => setSelected(s.startsAt)}
                    >
                      {s.label}
                    </button>
                  ))
                ) : (
                  <p className="muted">
                    An diesem Tag ist kein Termin frei. Wähle bitte ein anderes
                    Datum.
                  </p>
                )}
              </div>
            </section>
          )}
        </div>
        <aside className="panel booking-summary">
          <span className="eyebrow">DEIN TERMIN IM ÜBERBLICK</span>
          <span className="summary-icon">
            <CalendarDays size={29} />
          </span>
          <h2>{type?.name ?? "Ein bisschen Zeit für dich."}</h2>
          <p className="muted">
            {provider?.user.displayName ??
              "Wähle zuerst einen Behandler und eine Leistung."}
          </p>
          {type && (
            <p>
              <Clock3 size={16} /> {type.duration} Minuten
            </p>
          )}
          {selected && (
            <p>
              <CalendarDays size={16} />
              {dateLabel(selected, provider?.timezone)}–
              {formatInTimeZone(
                new Date(
                  new Date(selected).getTime() + (type?.duration ?? 0) * 60000,
                ),
                provider?.timezone ?? "Europe/Berlin",
                "HH:mm",
              )}{" "}
              Uhr
            </p>
          )}
          <div className="summary-line" />
          <Button onClick={book} disabled={!selected || busy}>
            {busy
              ? "Wird gebucht …"
              : reschedule
                ? "Termin verbindlich verschieben"
                : "Termin verbindlich buchen"}
            <ArrowRight size={16} />
          </Button>
          <small>
            <ShieldCheck size={14} /> Deine Daten bleiben im privaten Kreis.
          </small>
        </aside>
      </div>
    </>
  );
}
function Appointments({
  user,
  own = false,
  calendar = false,
}: {
  user: Actor;
  own?: boolean;
  calendar?: boolean;
}) {
  const { data, error, refresh } = useData<Appointment[]>("appointments");
  const [tab, setTab] = useState("upcoming"),
    [failure, setFailure] = useState(""),
    [busy, setBusy] = useState(false),
    [detail, setDetail] = useState<Appointment>(),
    [moving, setMoving] = useState<Appointment>(),
    [cancel, setCancel] = useState<Appointment>();
  const filtered = data?.filter(
    (a) =>
      !own ||
      a.userId === user.id ||
      (user.role === "PROVIDER" && a.providerId === user.provider?.id),
  );
  async function status(a: Appointment, value: string) {
    setBusy(true);
    setFailure("");
    try {
      const result = await api<{ mailSent: boolean }>("appointments/status", {
        id: a.id,
        status: value,
      });
      refresh();
      setCancel(undefined);
      setDetail(undefined);
      if (!result.mailSent)
        setFailure("Änderung gespeichert, E-Mail-Versand fehlgeschlagen.");
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const upcoming = (a: Appointment) =>
    new Date(a.startsAt) >= new Date() &&
    ["CONFIRMED", "PENDING"].includes(a.status);
  return (
    <>
      <Notice error={error || failure} />
      {moving ? (
        <>
          <Button variant="ghost" onClick={() => setMoving(undefined)}>
            <ChevronLeft size={16} />
            Zurück
          </Button>
          <Booking reschedule={moving} onComplete={refresh} />
        </>
      ) : (
        <>
          {calendar ? (
            <Calendar appointments={filtered ?? []} onSelect={setDetail} />
          ) : (
            <>
              <div className="tabs">
                <button
                  className={tab === "upcoming" ? "active" : ""}
                  onClick={() => setTab("upcoming")}
                >
                  Kommende Termine
                </button>
                <button
                  className={tab === "past" ? "active" : ""}
                  onClick={() => setTab("past")}
                >
                  Vergangene & abgesagte Termine
                </button>
              </div>
              <div className="panel">
                {!data ? (
                  <p>Lade Termine …</p>
                ) : !filtered?.filter((a) =>
                    tab === "upcoming" ? upcoming(a) : !upcoming(a),
                  ).length ? (
                  <Empty>Hier gibt es noch keine Termine.</Empty>
                ) : (
                  filtered
                    .filter((a) =>
                      tab === "upcoming" ? upcoming(a) : !upcoming(a),
                    )
                    .map((a) => (
                      <AppointmentRow key={a.id} appointment={a}>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDetail(a)}
                        >
                          Details
                        </Button>
                      </AppointmentRow>
                    ))
                )}
              </div>
            </>
          )}
          {detail && (
            <div className="modal-backdrop">
              <section
                role="dialog"
                aria-modal="true"
                aria-label="Termindetails"
                className="modal"
              >
                <button
                  className="close"
                  aria-label="Schließen"
                  onClick={() => setDetail(undefined)}
                >
                  <X />
                </button>
                <h2>Dein Termin im Detail</h2>
                <AppointmentRow appointment={detail} />
                <p>
                  Gebucht für: <strong>{detail.user.displayName}</strong>
                </p>
                <p>Zeitzone: {detail.provider.timezone}</p>
                <Notice error={failure} />
                <div className="actions">
                  {upcoming(detail) && (
                    <>
                      {(detail.userId === user.id || user.role === "ADMIN") && (
                        <Button
                          variant="outline"
                          onClick={() => {
                            setMoving(detail);
                            setDetail(undefined);
                          }}
                        >
                          Verschieben
                        </Button>
                      )}
                      <Button
                        variant="destructive"
                        onClick={() => {
                          setCancel(detail);
                          setDetail(undefined);
                        }}
                      >
                        Absagen
                      </Button>
                    </>
                  )}
                  {(user.role === "ADMIN" ||
                    (user.role === "PROVIDER" &&
                      detail.providerId === user.provider?.id)) &&
                    ["PENDING", "CONFIRMED"].includes(detail.status) && (
                      <>
                        {detail.status === "PENDING" && (
                          <Button
                            disabled={busy}
                            onClick={() => status(detail, "CONFIRMED")}
                          >
                            Bestätigen
                          </Button>
                        )}
                        {new Date(detail.startsAt) <= new Date() && (
                          <>
                            <Button
                              disabled={busy}
                              onClick={() => status(detail, "COMPLETED")}
                            >
                              Als erledigt markieren
                            </Button>
                            <Button
                              variant="outline"
                              disabled={busy}
                              onClick={() => status(detail, "NO_SHOW")}
                            >
                              Nicht erschienen
                            </Button>
                          </>
                        )}
                      </>
                    )}
                </div>
              </section>
            </div>
          )}
          {cancel && (
            <div className="modal-backdrop">
              <section
                role="dialog"
                aria-modal="true"
                aria-label="Termin absagen"
                className="modal"
              >
                <h2>Termin wirklich absagen?</h2>
                <p>
                  {cancel.typeName} ·{" "}
                  {dateLabel(cancel.startsAt, cancel.provider.timezone)}
                </p>
                <Notice error={failure} />
                <div className="actions">
                  <Button
                    disabled={busy}
                    variant="destructive"
                    onClick={() => status(cancel, "CANCELLED")}
                  >
                    Verbindlich absagen
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setCancel(undefined)}
                  >
                    Termin behalten
                  </Button>
                </div>
              </section>
            </div>
          )}
        </>
      )}
    </>
  );
}
function Calendar({
  appointments,
  onSelect,
}: {
  appointments: Appointment[];
  onSelect: (a: Appointment) => void;
}) {
  const [view, setView] = useState("week"),
    [date, setDate] = useState(new Date());
  const start =
    view === "month"
      ? startOfWeek(startOfMonth(date), { weekStartsOn: 1 })
      : view === "week"
        ? startOfWeek(date, { weekStartsOn: 1 })
        : date;
  const end =
    view === "month"
      ? addDays(startOfWeek(endOfMonth(date), { weekStartsOn: 1 }), 6)
      : view === "week"
        ? addDays(start, 6)
        : start;
  const days = eachDayOfInterval({ start, end });
  return (
    <div className="panel">
      <div className="calendar-toolbar">
        <div className="actions">
          <Button
            variant="outline"
            size="sm"
            aria-label="Vorheriger Zeitraum"
            onClick={() =>
              setDate(
                view === "month"
                  ? addMonths(date, -1)
                  : addDays(date, view === "week" ? -7 : -1),
              )
            }
          >
            <ChevronLeft size={16} />
          </Button>
          <strong>{format(date, "MMMM yyyy", { locale: de })}</strong>
          <Button
            variant="outline"
            size="sm"
            aria-label="Nächster Zeitraum"
            onClick={() =>
              setDate(
                view === "month"
                  ? addMonths(date, 1)
                  : addDays(date, view === "week" ? 7 : 1),
              )
            }
          >
            <ChevronRight size={16} />
          </Button>
        </div>
        <div className="actions">
          <Button variant="ghost" size="sm" onClick={() => setDate(new Date())}>
            Heute
          </Button>
          {[
            ["day", "Tag"],
            ["week", "Woche"],
            ["month", "Monat"],
          ].map(([v, l]) => (
            <Button
              key={v}
              size="sm"
              variant={view === v ? "default" : "outline"}
              onClick={() => setView(v)}
            >
              {l}
            </Button>
          ))}
        </div>
      </div>
      <p className="muted small-text">
        Kalenderanzeige in Europe/Berlin. Details zeigen die Behandler-Zeitzone.
      </p>
      <div className={`calendar-grid ${view}`}>
        {days.map((day) => (
          <div
            key={day.toISOString()}
            className={`calendar-day ${isSameDay(day, new Date()) ? "today" : ""}`}
          >
            <span>{format(day, "EEE, dd.", { locale: de })}</span>
            {appointments
              .filter(
                (a) =>
                  formatInTimeZone(
                    new Date(a.startsAt),
                    "Europe/Berlin",
                    "yyyy-MM-dd",
                  ) === format(day, "yyyy-MM-dd"),
              )
              .map((a) => (
                <button
                  key={a.id}
                  className={`calendar-event ${a.status === "CANCELLED" ? "cancelled" : ""}`}
                  onClick={() => onSelect(a)}
                >
                  <b>
                    {formatInTimeZone(
                      new Date(a.startsAt),
                      "Europe/Berlin",
                      "HH:mm",
                    )}
                  </b>{" "}
                  {a.typeName}
                  <small>{a.user.displayName}</small>
                </button>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}
function Profile({ user }: { user: Actor }) {
  return (
    <div className="two-columns">
      <section className="panel">
        <h2>Deine Angaben</h2>
        <ActionForm endpoint="profile">
          <Field
            name="displayName"
            label="Anzeigename"
            defaultValue={user.displayName}
            required
          />
          <Field
            name="email"
            label="E-Mail (optional)"
            type="email"
            defaultValue={user.email ?? ""}
          />
          <Field label="Benutzername" value={user.username} readOnly />
        </ActionForm>
      </section>
      <section className="panel">
        <h2>Passwort ändern</h2>
        <ActionForm endpoint="password" label="Passwort aktualisieren">
          <Field
            label="Aktuelles Passwort"
            name="current"
            type="password"
            required
            autoComplete="current-password"
          />
          <Field
            label="Neues Passwort (mindestens 12 Zeichen)"
            name="password"
            type="password"
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
          />
          <p className="muted">
            Andere Sitzungen werden nach der Änderung abgemeldet.
          </p>
        </ActionForm>
      </section>
    </div>
  );
}
function Invitations() {
  const { data, error, refresh } = useData<Invitation[]>("invitations");
  const [link, setLink] = useState(""),
    [message, setMessage] = useState(""),
    [failure, setFailure] = useState("");
  return (
    <div className="two-columns">
      <section className="panel">
        <h2>In den privaten Kreis einladen</h2>
        <p className="muted">
          Der Link funktioniert auch ohne eingerichteten E-Mail-Server.
        </p>
        <ActionForm
          endpoint="invitations"
          label="Einladung erstellen"
          transform={(d) => ({
            ...d,
            expiresAt: new Date(String(d.expiresAt)).toISOString(),
          })}
          onSuccess={(r) => {
            const result = r as { link: string; mailSent: boolean };
            setLink(result.link);
            setMessage(
              result.mailSent
                ? "Einladung per E-Mail versendet."
                : "Bitte teile den Link persönlich. Es wurde keine E-Mail versendet.",
            );
            refresh();
          }}
        >
          <Field label="Anzeigename (optional)" name="displayName" />
          <Field
            label="E-Mail (optional, bindet die Einladung)"
            name="email"
            type="email"
          />
          <Select label="Rolle" name="role" defaultValue="USER">
            {Object.entries(roleLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
          <Field
            label="Gültig bis"
            name="expiresAt"
            type="datetime-local"
            required
            defaultValue={format(addDays(new Date(), 7), "yyyy-MM-dd'T'HH:mm")}
          />
        </ActionForm>
        {link && (
          <div className="invite-link">
            <strong>Einladungslink jetzt sichern</strong>
            <p>Dieser geheime Link wird nur jetzt angezeigt.</p>
            <input readOnly value={link} aria-label="Einladungslink" />
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setMessage("Einladungslink kopiert.");
                } catch {
                  setMessage("Bitte den Link im Feld markieren und kopieren.");
                }
              }}
            >
              <Copy size={16} />
              Einladungslink kopieren
            </Button>
            <p role="status">{message}</p>
          </div>
        )}
      </section>
      <section className="panel">
        <h2>Einladungen</h2>
        <Notice error={error || failure} />
        {data?.length ? (
          data.map((i) => (
            <div className="list-item" key={i.id}>
              <div>
                <strong>
                  {i.displayName || i.email || "Persönliche Einladung"}
                </strong>
                <small>
                  {roleLabels[i.role]} · bis {dateLabel(i.expiresAt)}
                </small>
                <span className="status">
                  {i.status === "OPEN"
                    ? new Date(i.expiresAt) > new Date()
                      ? "Offen"
                      : "Abgelaufen"
                    : i.status === "USED"
                      ? "Verwendet"
                      : "Widerrufen"}
                </span>
              </div>
              {i.status === "OPEN" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await api("invitations/revoke", { id: i.id });
                      refresh();
                    } catch (e) {
                      setFailure((e as Error).message);
                    }
                  }}
                >
                  Widerrufen
                </Button>
              )}
            </div>
          ))
        ) : (
          <Empty>Noch keine Einladungen erstellt.</Empty>
        )}
      </section>
    </div>
  );
}
function UsersPanel() {
  const { data, error, refresh } = useData<Actor[]>("users");
  const [create, setCreate] = useState(false);
  return (
    <>
      <div className="section-actions">
        <Button onClick={() => setCreate(!create)} variant="outline">
          <Plus size={16} />
          {create ? "Formular schließen" : "Benutzer direkt erstellen"}
        </Button>
        <Button asChild>
          <Link href="/admin/invitations">
            <Mail size={16} />
            Benutzer einladen
          </Link>
        </Button>
      </div>
      <Notice error={error} />
      {create && (
        <section className="panel">
          <h2>Benutzer erstellen</h2>
          <ActionForm
            endpoint="users"
            onSuccess={() => {
              refresh();
              setCreate(false);
            }}
          >
            <div className="form-grid">
              <Field label="Benutzername" name="username" required />
              <Field label="Anzeigename" name="displayName" required />
              <Field label="E-Mail (optional)" name="email" type="email" />
              <Select label="Rolle" name="role">
                {Object.entries(roleLabels).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
              <Field
                label="Passwort (mindestens 12 Zeichen)"
                name="password"
                type="password"
                minLength={12}
                required
              />
              <Field
                label="Passwort bestätigen"
                name="passwordConfirm"
                type="password"
                required
              />
            </div>
          </ActionForm>
        </section>
      )}
      <section className="panel">
        <h2>Benutzerverwaltung</h2>
        {data?.map((u) => (
          <details key={u.id} className="detail-item">
            <summary>
              <span>
                <strong>{u.displayName}</strong>
                <small>
                  @{u.username} · {roleLabels[u.role]} ·{" "}
                  {u.active ? "Aktiv" : "Deaktiviert"}
                </small>
              </span>
              <Settings size={17} />
            </summary>
            <ActionForm
              endpoint="users/update"
              onSuccess={refresh}
              transform={(d) => ({
                id: u.id,
                role: d.role,
                active: d.active === "on",
              })}
            >
              <Select label="Rolle" name="role" defaultValue={u.role}>
                {Object.entries(roleLabels).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
              <label className="checkbox">
                <input
                  name="active"
                  type="checkbox"
                  defaultChecked={u.active}
                />
                Konto aktiv
              </label>
            </ActionForm>
          </details>
        ))}
      </section>
    </>
  );
}
function Providers({ availability }: { availability: boolean }) {
  const { data, error, refresh } = useData<Provider[]>("providers");
  return (
    <>
      <Notice error={error} />
      {data?.length ? (
        data.map((p) => (
          <section className="panel" key={p.id}>
            <h2>{p.user.displayName}</h2>
            {p.invitation && (
              <p className="alert" role="status">
                {p.invitation.status === "REVOKED"
                  ? "Einladung widerrufen"
                  : new Date(p.invitation.expiresAt) <= new Date()
                    ? "Einladung abgelaufen"
                    : "Einladung ausstehend"}
                {
                  " · Noch nicht buchbar. Profil, Leistungen und Verfügbarkeit können vorbereitet werden."
                }
              </p>
            )}
            {!availability && (
              <details className="detail-item" open>
                <summary>Behandlerprofil</summary>
                <ActionForm
                  endpoint="providers"
                  transform={(d) => ({
                    ...d,
                    id: p.id,
                    active: d.active === "on",
                    emailNotifications: d.emailNotifications === "on",
                  })}
                  onSuccess={refresh}
                >
                  <div className="form-grid">
                    {p.invitation && (
                      <Field
                        label="Anzeigename des Behandlerentwurfs"
                        name="draftDisplayName"
                        defaultValue={p.user.displayName}
                        required
                        minLength={2}
                        maxLength={80}
                      />
                    )}
                    <Field
                      label="Fachgebiet"
                      name="specialty"
                      defaultValue={p.specialty}
                    />
                    <Field
                      label="Standort"
                      name="location"
                      defaultValue={p.location}
                    />
                    <Field
                      label="Profilbild (HTTPS-URL, optional)"
                      name="imageUrl"
                      type="url"
                      defaultValue={p.imageUrl}
                    />
                    <Field
                      label="Zeitzone"
                      name="timezone"
                      required
                      defaultValue={p.timezone}
                    />
                    <Field
                      label="Kurzbeschreibung (keine Patientendaten)"
                      name="description"
                      defaultValue={p.description}
                    />
                    <Field
                      label="Qualifikationen"
                      name="qualifications"
                      defaultValue={p.qualifications}
                    />
                  </div>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      name="active"
                      defaultChecked={p.active}
                    />
                    {p.invitation
                      ? "Nach Einladungsannahme buchbar"
                      : "Behandler buchbar"}
                  </label>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      name="emailNotifications"
                      defaultChecked={p.emailNotifications}
                    />
                    E-Mail bei Buchung, Verschiebung und Absage
                  </label>
                  <p className="muted">
                    {p.user.email
                      ? `Empfänger: ${p.user.email}.`
                      : "Noch keine E-Mail-Adresse hinterlegt. Bitte im Benutzerprofil ergänzen; bei Entwürfen kann sie bei der Einladungsannahme angegeben werden."}
                    {
                      " Der Versand benötigt eingerichtetes SMTP und ein angenommenes Konto."
                    }
                  </p>
                </ActionForm>
              </details>
            )}
            <Availability provider={p} refresh={refresh} />
          </section>
        ))
      ) : (
        <div className="panel">
          <Empty>Lade zuerst eine Person mit der Rolle „Behandler“ ein.</Empty>
        </div>
      )}
    </>
  );
}
function Availability({
  provider: p,
  refresh,
}: {
  provider: Provider;
  refresh: () => void;
}) {
  const [rules, setRules] = useState(p.rules),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const days = [
    "Sonntag",
    "Montag",
    "Dienstag",
    "Mittwoch",
    "Donnerstag",
    "Freitag",
    "Samstag",
  ];
  const time = (n: number) =>
    `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
  const minutes = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  return (
    <>
      <h3 className="subheading">Wochenplan · {p.timezone}</h3>
      <p className="muted">
        Mehrere Zeitfenster pro Tag sind möglich. Bereits gebuchte Termine
        bleiben bei Änderungen bestehen.
      </p>
      <div className="rules">
        {rules.map((r, i) => (
          <div className="rule" key={i}>
            <Select
              label="Wochentag"
              value={r.weekday}
              onChange={(e) =>
                setRules(
                  rules.map((v, j) =>
                    j === i ? { ...v, weekday: Number(e.target.value) } : v,
                  ),
                )
              }
            >
              {days.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </Select>
            <Field
              label="Von"
              type="time"
              value={time(r.startMinute)}
              onChange={(e) =>
                setRules(
                  rules.map((v, j) =>
                    j === i
                      ? { ...v, startMinute: minutes(e.target.value) }
                      : v,
                  ),
                )
              }
            />
            <Field
              label="Bis"
              type="time"
              value={time(r.endMinute)}
              onChange={(e) =>
                setRules(
                  rules.map((v, j) =>
                    j === i ? { ...v, endMinute: minutes(e.target.value) } : v,
                  ),
                )
              }
            />
            <Button
              variant="ghost"
              aria-label="Zeitfenster entfernen"
              onClick={() => setRules(rules.filter((_, j) => j !== i))}
            >
              <X size={17} />
            </Button>
          </div>
        ))}
      </div>
      <div className="actions">
        <Button
          variant="outline"
          onClick={() =>
            setRules([
              ...rules,
              { weekday: 1, startMinute: 1020, endMinute: 1200 },
            ])
          }
        >
          <Plus size={16} />
          Zeitfenster
        </Button>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await api("availability", {
                providerId: p.id,
                rules: rules.map(({ weekday, startMinute, endMinute }) => ({
                  weekday,
                  startMinute,
                  endMinute,
                })),
              });
              setMessage("Wochenplan gespeichert.");
              refresh();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Wochenplan speichern
        </Button>
      </div>
      <Notice error={error} message={message} />
      <details className="detail-item">
        <summary>Urlaub, gesperrte Zeiten & zusätzliche Verfügbarkeit</summary>
        <ActionForm
          endpoint="exceptions"
          onSuccess={refresh}
          label="Zeitraum hinzufügen"
          transform={(d) => ({
            providerId: p.id,
            available: d.available === "true",
            startsAt: fromZonedTime(
              String(d.startsAt),
              p.timezone,
            ).toISOString(),
            endsAt: fromZonedTime(String(d.endsAt), p.timezone).toISOString(),
          })}
        >
          <div className="form-grid">
            <Field
              label={`Beginn (${p.timezone})`}
              name="startsAt"
              type="datetime-local"
              required
            />
            <Field
              label={`Ende (${p.timezone})`}
              name="endsAt"
              type="datetime-local"
              required
            />
            <Select label="Art" name="available">
              <option value="false">Abwesenheit / Urlaub / gesperrt</option>
              <option value="true">Zusätzlich verfügbar</option>
            </Select>
          </div>
        </ActionForm>
        {p.exceptions.map((e) => (
          <div key={e.id} className="list-item">
            <div>
              <strong>
                {e.available ? "Zusätzlich verfügbar" : "Gesperrt / abwesend"}
              </strong>
              <small>
                {dateLabel(e.startsAt, p.timezone)} bis{" "}
                {dateLabel(e.endsAt, p.timezone)}
              </small>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  await api("exceptions/remove", { id: e.id });
                  refresh();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Entfernen
            </Button>
          </div>
        ))}
      </details>
    </>
  );
}
function Types() {
  const { data, error, refresh } = useData<Type[]>("types");
  const providers = useData<Provider[]>("providers");
  const [create, setCreate] = useState(false);
  function editor(t?: Type) {
    return (
      <ActionForm
        endpoint="types"
        onSuccess={() => {
          refresh();
          if (!t) setCreate(false);
        }}
        transform={(d) => ({
          id: t?.id,
          name: d.name,
          description: d.description,
          duration: Number(d.duration),
          bufferBefore: Number(d.bufferBefore),
          bufferAfter: Number(d.bufferAfter),
          active: d.active === "on",
          color: d.color,
          providerIds:
            providers.data
              ?.filter((p) => d[`provider-${p.id}`] === "on")
              .map((p) => p.id) ?? [],
        })}
      >
        <div className="form-grid">
          <Field label="Name" name="name" required defaultValue={t?.name} />
          <Field
            label="Beschreibung"
            name="description"
            defaultValue={t?.description}
          />
          <Field
            label="Dauer (Minuten)"
            name="duration"
            type="number"
            min={5}
            max={240}
            required
            defaultValue={t?.duration ?? 15}
          />
          <Field
            label="Puffer vorher (Minuten)"
            name="bufferBefore"
            type="number"
            min={0}
            max={120}
            defaultValue={t?.bufferBefore ?? 0}
          />
          <Field
            label="Puffer danach (Minuten)"
            name="bufferAfter"
            type="number"
            min={0}
            max={120}
            defaultValue={t?.bufferAfter ?? 0}
          />
          <Select label="Farbe" name="color" defaultValue={t?.color ?? "teal"}>
            <option value="teal">Türkis</option>
            <option value="blue">Blau</option>
            <option value="orange">Orange</option>
            <option value="violet">Violett</option>
          </Select>
        </div>
        <label className="checkbox">
          <input
            type="checkbox"
            name="active"
            defaultChecked={t?.active ?? true}
          />
          Aktive Terminart
        </label>
        <strong>Buchbare Behandler</strong>
        {providers.data?.map((p) => (
          <label key={p.id} className="checkbox">
            <input
              type="checkbox"
              name={`provider-${p.id}`}
              defaultChecked={t?.providers?.some((v) => v.id === p.id) ?? false}
            />
            {p.user.displayName}
          </label>
        ))}
      </ActionForm>
    );
  }
  return (
    <>
      <Notice error={error || providers.error} />
      <div className="section-actions">
        <Button onClick={() => setCreate(!create)}>
          <Plus size={16} />
          Terminart erstellen
        </Button>
      </div>
      {create && (
        <section className="panel">
          <h2>Neue Terminart</h2>
          {editor()}
        </section>
      )}
      <section className="panel">
        {data?.length ? (
          data.map((t) => (
            <details className="detail-item" key={t.id}>
              <summary>
                <span>
                  <strong>{t.name}</strong>
                  <small>
                    {t.duration} Minuten · {t.active ? "Aktiv" : "Inaktiv"}
                  </small>
                </span>
                <Settings size={16} />
              </summary>
              {editor(t)}
            </details>
          ))
        ) : (
          <Empty>
            Lege die erste Leistung an oder führe den optionalen Seed aus.
          </Empty>
        )}
      </section>
    </>
  );
}
function SettingsPanel() {
  const smtp = useData<{
    host: string;
    port: number;
    secure: boolean;
    username: string;
    senderName: string;
    senderAddress: string;
  } | null>("smtp");
  const settings = useData<{ name: string; bookingHorizonDays: number }>(
    "settings",
  );
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="two-columns">
      <section className="panel">
        <h2>E-Mail / SMTP</h2>
        <p className="muted">
          TLS ist verpflichtend. Das gespeicherte Passwort wird nie angezeigt.
        </p>
        <Notice error={smtp.error} />
        {smtp.data !== undefined && (
          <ActionForm
            endpoint="smtp"
            onSuccess={smtp.refresh}
            transform={(d) => ({
              ...d,
              port: Number(d.port),
              secure: d.secure === "true",
            })}
          >
            <Field
              label="SMTP Host"
              name="host"
              required
              defaultValue={smtp.data?.host}
            />
            <div className="form-grid">
              <Field
                label="Port"
                name="port"
                type="number"
                required
                defaultValue={smtp.data?.port ?? 587}
              />
              <Select
                label="Verschlüsselung"
                name="secure"
                defaultValue={String(smtp.data?.secure ?? false)}
              >
                <option value="false">STARTTLS</option>
                <option value="true">TLS (direkt)</option>
              </Select>
            </div>
            <Field
              label="Benutzername"
              name="username"
              defaultValue={smtp.data?.username}
            />
            <Field
              label="SMTP-Passwort (leer = beibehalten)"
              name="password"
              type="password"
              autoComplete="new-password"
            />
            <Field
              label="Absendername"
              name="senderName"
              required
              defaultValue={smtp.data?.senderName ?? "SchwesterLib"}
            />
            <Field
              label="Absenderadresse"
              name="senderAddress"
              type="email"
              required
              defaultValue={smtp.data?.senderAddress}
            />
          </ActionForm>
        )}
        <hr />
        <Button
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await api("smtp/test", {});
              setMessage("Verbindung erfolgreich getestet.");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Gespeicherte Verbindung testen
        </Button>
        <Notice error={error} message={message} />
        <div className="subheading">
          <ActionForm endpoint="smtp/test" label="Testmail senden">
            <Field
              label="Empfänger der Testmail"
              name="recipient"
              type="email"
              required
            />
          </ActionForm>
        </div>
      </section>
      <section className="panel">
        <h2>Systemeinstellungen</h2>
        <Notice error={settings.error} />
        {settings.data && (
          <ActionForm
            endpoint="settings"
            onSuccess={settings.refresh}
            transform={(d) => ({
              ...d,
              bookingHorizonDays: Number(d.bookingHorizonDays),
            })}
          >
            <Field
              label="Installationsname"
              name="name"
              required
              defaultValue={settings.data.name}
            />
            <Field
              label="Buchungshorizont (Tage)"
              name="bookingHorizonDays"
              type="number"
              min={1}
              max={365}
              defaultValue={settings.data.bookingHorizonDays}
            />
          </ActionForm>
        )}
        <div className="tip-card">
          <ShieldCheck />
          <p>
            Die Erstinstallation ist dauerhaft gesperrt. Weitere Benutzer werden
            ausschließlich eingeladen oder administrativ angelegt.
          </p>
        </div>
        <UpdatePanel />
      </section>
    </div>
  );
}
type UpdateInfo = {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  configured: boolean;
  release: {
    name: string;
    notes: string;
    url: string;
    publishedAt: string | null;
  };
  status: {
    state: "idle" | "requested" | "running" | "success" | "failed";
    stage?: string;
    message?: string;
    version?: string;
  };
};
function UpdatePanel() {
  const [info, setInfo] = useState<UpdateInfo>(),
    [error, setError] = useState(""),
    [checking, setChecking] = useState(true),
    [installing, setInstalling] = useState(false);
  const initiated = useRef(false);
  const check = useCallback(async () => {
    try {
      const next = await api<UpdateInfo>("updates");
      setInfo(next);
      setError("");
      if (["requested", "running"].includes(next.status.state))
        setInstalling(true);
      if (next.status.state === "failed") setInstalling(false);
      if (next.status.state === "success" && initiated.current) {
        initiated.current = false;
        window.setTimeout(() => window.location.reload(), 1200);
      }
    } catch (cause) {
      if (!initiated.current) setError((cause as Error).message);
    } finally {
      setChecking(false);
    }
  }, []);
  useEffect(() => {
    const initial = window.setTimeout(() => void check(), 0);
    const timer = window.setInterval(
      () => void check(),
      installing ? 2000 : 300000,
    );
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [check, installing]);
  async function install() {
    if (
      !info ||
      !window.confirm(
        `Update ${info.latestVersion} jetzt installieren? Vor der Migration wird automatisch ein Datenbankbackup erstellt.`,
      )
    )
      return;
    initiated.current = true;
    setInstalling(true);
    setError("");
    try {
      await api("updates", { version: info.latestVersion });
    } catch (cause) {
      // The application can disconnect immediately after accepting the request.
      window.setTimeout(() => void check(), 1500);
      if (cause instanceof Error && cause.message !== "Failed to fetch")
        setError(cause.message);
    }
  }
  const active =
    installing ||
    ["requested", "running"].includes(info?.status.state ?? "idle");
  return (
    <div className="update-panel">
      <div className="panel-title">
        <div>
          <span className="eyebrow">SYSTEMUPDATE</span>
          <h2>SchwesterLib aktualisieren</h2>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={checking || active}
          onClick={() => {
            setChecking(true);
            void check();
          }}
        >
          <RefreshCw size={15} className={checking ? "spin" : ""} />
          Prüfen
        </Button>
      </div>
      <Notice error={error} />
      {!info ? (
        <p className="muted">Releaseinformationen werden geladen …</p>
      ) : (
        <>
          <div className="version-row">
            <span>
              Installiert <strong>v{info.currentVersion}</strong>
            </span>
            <span>
              Aktuell <strong>{info.latestVersion}</strong>
            </span>
          </div>
          {active && (
            <div className="update-progress" role="status" aria-live="polite">
              <span className="update-progress-bar" />
              <strong>
                {info.status.message ?? "Update wird vorbereitet …"}
              </strong>
              <small>
                Die Verbindung kann während des Neustarts kurz unterbrochen
                sein. Diese Seite verbindet sich automatisch wieder.
              </small>
            </div>
          )}
          {info.status.state === "failed" && (
            <p className="alert error" role="alert">
              {info.status.message ??
                "Das Update ist fehlgeschlagen. Bitte das Systemprotokoll prüfen."}
            </p>
          )}
          {!active && info.updateAvailable && (
            <Button disabled={!info.configured} onClick={install}>
              <Download size={16} /> {info.latestVersion} installieren
            </Button>
          )}
          {!info.configured && (
            <p className="alert">
              Der Web-Updater muss einmalig auf dem Server eingerichtet werden.
            </p>
          )}
          {!active &&
            !info.updateAvailable &&
            info.status.state !== "failed" && (
              <p className="success-text">SchwesterLib ist aktuell.</p>
            )}
          <details className="detail-item">
            <summary>Hinweise zu {info.release.name}</summary>
            <pre className="release-notes">
              {info.release.notes || "Keine Release-Hinweise vorhanden."}
            </pre>
            <a
              className="text-link"
              href={info.release.url}
              target="_blank"
              rel="noreferrer"
            >
              Release auf GitHub öffnen <ExternalLink size={14} />
            </a>
          </details>
        </>
      )}
    </div>
  );
}
function Audit() {
  const { data, error } = useData<
    {
      id: string;
      action: string;
      actorId: string | null;
      targetId: string | null;
      createdAt: string;
    }[]
  >("audit");
  return (
    <section className="panel">
      <h2>Letzte 200 Aktivitäten</h2>
      <Notice error={error} />
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Zeitpunkt</th>
              <th>Aktion</th>
              <th>Akteur-ID</th>
              <th>Objekt-ID</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((a) => (
              <tr key={a.id}>
                <td>{dateLabel(a.createdAt)}</td>
                <td>{a.action}</td>
                <td>{a.actorId ?? "Anonym"}</td>
                <td>{a.targetId ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
