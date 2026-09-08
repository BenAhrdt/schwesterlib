import "dotenv/config";
import { db } from "../src/lib/db";
const types = [
  {
    name: "Verbandswechsel",
    duration: 15,
    description: "Frisch verbunden. Gut aufgehoben.",
    color: "teal",
  },
  {
    name: "Wundkontrolle",
    duration: 10,
    description: "Ein sorgfältiger Blick fürs gute Gefühl.",
    color: "blue",
  },
  {
    name: "Pflaster-Notfall",
    duration: 5,
    description: "Kleine Hilfe für kleine Missgeschicke.",
    color: "orange",
  },
  {
    name: "Medizinische Beratung bei Kaffee",
    duration: 30,
    description: "Zeit für Fragen. Und eine Tasse Pause.",
    color: "violet",
  },
];
async function main() {
  for (const type of types) {
    if (!(await db.appointmentType.findFirst({ where: { name: type.name } })))
      await db.appointmentType.create({ data: type });
  }
  console.log(
    "Vier Beispiel-Terminarten angelegt. Keine Benutzer oder Zugangsdaten erstellt.",
  );
}
main().finally(() => db.$disconnect());
