/**
 * Importa la base de invitados desde un CSV y genera, para cada uno, su
 * token de RSVP y su token para compartir con socios.
 *
 * Uso:
 *   node scripts/import-contacts.js base_invitados.csv salida_mailchimp.csv
 *
 * El CSV de entrada debe tener columnas: firstname,email,empresa
 * (empresa es opcional, se puede dejar vacía y se llena en el form).
 *
 * El CSV de salida trae: firstname,email,RSVP_URL — listo para subir a
 * Mailchimp como base con un merge field custom (ej. RSVPURL).
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { nanoid } = require("nanoid");
const db = require("../src/db");
const { PUBLIC_BASE_URL } = require("../src/config");

const [, , inputPath, outputPath] = process.argv;

if (!inputPath || !outputPath) {
  console.error("Uso: node scripts/import-contacts.js <entrada.csv> <salida.csv>");
  process.exit(1);
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cols = line.split(",").map((c) => c.trim());
    const row = {};
    header.forEach((h, i) => (row[h] = cols[i] || ""));
    return row;
  });
}

const insertContact = db.prepare(`
  INSERT INTO contacts (token, share_token, firstname, email, empresa)
  VALUES (?, ?, ?, ?, ?)
`);

const rows = parseCsv(fs.readFileSync(inputPath, "utf8"));
const outLines = ["firstname,email,RSVP_URL"];
let created = 0;

for (const row of rows) {
  if (!row.email) continue;
  const token = nanoid(24);
  const shareToken = nanoid(24);
  try {
    insertContact.run(token, shareToken, row.firstname || "", row.email, row.empresa || null);
    created++;
    outLines.push(`${row.firstname || ""},${row.email},${PUBLIC_BASE_URL}/rsvp/${token}`);
  } catch (err) {
    console.warn(`[skip] ${row.email}: ${err.message}`);
  }
}

fs.writeFileSync(path.resolve(outputPath), outLines.join("\n"));
console.log(`Listo. ${created} contactos importados. Archivo generado: ${outputPath}`);
