import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  Heart,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Bandage,
  MoveUpRight,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { currentUser } from "@/lib/auth";
export const dynamic = "force-dynamic";
export default async function Home() {
  const user = await currentUser();
  return (
    <>
      <header className="public-header">
        <Brand />
        <nav>
          <a href="#ablauf">So funktioniert’s</a>
          <a href="#leistungen">Unsere Leistungen</a>
          <Button asChild variant="outline">
            <Link href={user ? "/dashboard" : "/login"}>
              {user ? "Zum Dashboard" : "Anmelden"}
              <ArrowRight size={16} />
            </Link>
          </Button>
        </nav>
      </header>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">
              <span className="live-dot" /> DIE PERSÖNLICHSTE PRAXIS DER WELT
            </span>
            <h1>
              Meine Schwester.
              <br />
              Mein Termin.
              <br />
              <span>Mein Verband.</span>
            </h1>
            <p>
              Die beste Versorgung ist manchmal ganz in der Nähe. Buche deinen
              nächsten Termin – unkompliziert, persönlich und mit einer
              Extraportion Fürsorge.
            </p>
            <div className="hero-actions">
              <Button asChild>
                <Link href="/book">
                  Termin buchen <ArrowRight size={18} />
                </Link>
              </Button>
              <span>
                <ShieldCheck size={17} /> Privat. Nur auf Einladung.
              </span>
            </div>
            <div className="hero-proof">
              <div className="mini-avatars">
                <span>♡</span>
                <span>+</span>
                <span>✓</span>
              </div>
              <p>
                <strong>In besten Händen.</strong>
                <br />
                Mit Kompetenz. Und Geschwisterbonus.
              </p>
            </div>
          </div>
          <div className="hero-art">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="floating-note">
              <span className="icon-bubble">
                <Heart size={19} />
              </span>
              <div>
                <strong>Fürsorge, die bleibt.</strong>
                <small>Von Mensch zu Lieblingsmensch.</small>
              </div>
            </div>
            <div className="appointment-preview">
              <div className="preview-top">
                <span className="eyebrow">DEIN WOHLBEFINDEN. GUT GEPLANT.</span>
                <span className="dots">•••</span>
              </div>
              <div className="care-illustration">
                <div className="illustration-disc">
                  <Bandage size={95} strokeWidth={1.25} />
                  <span className="spark s1">✦</span>
                  <span className="spark s2">✧</span>
                  <span className="little-heart">♥</span>
                </div>
              </div>
              <span className="preview-label">
                KLEINER TERMIN. GROSSE WIRKUNG.
              </span>
              <h3>Ein bisschen Zeit für dich.</h3>
              <p>Verlässlich versorgt. Entspannt gebucht.</p>
              <div className="preview-divider" />
              <div className="preview-service">
                <span className="icon-bubble">
                  <Bandage size={21} />
                </span>
                <div>
                  <strong>Verbandswechsel</strong>
                  <small>15 Minuten · mit viel Sorgfalt</small>
                </div>
                <span className="round-arrow">
                  <MoveUpRight size={18} />
                </span>
              </div>
              <div className="preview-footer">
                <Check size={15} /> Einfach online planen
              </div>
            </div>
            <div className="floating-confirm">
              <span>
                <Check size={18} />
              </span>
              <div>
                <strong>Weniger Abstimmen.</strong>
                <small>Mehr Zeit füreinander.</small>
              </div>
            </div>
            <span className="art-caption">
              Gesundheitsversorgung war noch nie so familienintern.
            </span>
          </div>
        </section>
        <section className="trust-strip">
          <span>
            <ShieldCheck />
            Ein geschützter Kreis
          </span>
          <span>
            <CalendarDays />
            Termine, die wirklich passen
          </span>
          <span>
            <Heart />
            Persönlich statt anonym
          </span>
          <span>
            <Clock3 />
            In wenigen Klicks gebucht
          </span>
        </section>
        <section id="leistungen" className="section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">
                GUTE VERSORGUNG. GANZ OHNE WARTEZIMMER.
              </span>
              <h2>
                Für die kleinen Dinge,
                <br />
                die einen Unterschied machen.
              </h2>
            </div>
            <p>
              Professionelle Sorgfalt trifft auf ein vertrautes Gesicht.
              <br />
              Und vielleicht auch auf einen guten Kaffee.
            </p>
          </div>
          <div className="service-grid">
            {[
              {
                icon: Bandage,
                name: "Verbandswechsel",
                time: "15 Min.",
                text: "Frisch verbunden. Gut aufgehoben.",
                color: "teal",
              },
              {
                icon: Stethoscope,
                name: "Wundkontrolle",
                time: "10 Min.",
                text: "Ein sorgfältiger Blick fürs gute Gefühl.",
                color: "blue",
              },
              {
                icon: Sparkles,
                name: "Pflaster-Notfall",
                time: "5 Min.",
                text: "Kleine Hilfe für die kleinen Missgeschicke.",
                color: "orange",
              },
              {
                icon: Heart,
                name: "Beratung bei Kaffee",
                time: "30 Min.",
                text: "Zeit für Fragen. Und eine Tasse Pause.",
                color: "violet",
              },
            ].map((s) => (
              <Link
                href="/book"
                className={`service-card ${s.color}`}
                key={s.name}
              >
                <div className="service-card-top">
                  <span className="service-icon">
                    <s.icon size={24} />
                  </span>
                  <span className="duration">
                    <Clock3 size={12} />
                    {s.time}
                  </span>
                </div>
                <h3>{s.name}</h3>
                <p>{s.text}</p>
                <span className="service-link">
                  Termin finden <ArrowRight size={16} />
                </span>
              </Link>
            ))}
          </div>
          <p className="muted small-text">
            Beispielleistungen. Das tatsächliche Angebot siehst du nach der
            Anmeldung.
          </p>
        </section>
        <section id="ablauf" className="how-section">
          <div>
            <span className="eyebrow">WENIGER ORGANISIEREN. MEHR LEBEN.</span>
            <h2>
              Ein guter Termin beginnt
              <br />
              mit drei einfachen Schritten.
            </h2>
          </div>
          <div className="steps">
            {[
              "Leistung auswählen",
              "Passende Zeit finden",
              "Entspannt vorbeikommen",
            ].map((t, i) => (
              <div key={t}>
                <span className="step-number">0{i + 1}</span>
                <h3>{t}</h3>
                <p>
                  {
                    [
                      "Wähle, wer dich behandelt und was du brauchst.",
                      "Sieh freie Zeiten und buche deinen Wunschtermin.",
                      "Alles im Blick. Verschieben oder absagen geht auch.",
                    ][i]
                  }
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <footer>
        <Brand />
        <p>Mit Sorgfalt entwickelt. Mit einem Augenzwinkern gedacht.</p>
        <Link href="/privacy">Datenschutz</Link>
      </footer>
    </>
  );
}
