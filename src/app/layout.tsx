import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "SchwesterLib · Meine Schwester. Mein Termin. Mein Verband.",
    template: "%s · SchwesterLib",
  },
  description: "Persönliche Terminbuchung für die familieninterne Versorgung.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
