const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { nanoid } = require("nanoid");
const db = require("../db");
const { UPLOADS_DIR } = require("../upload");
const { PUBLIC_BASE_URL } = require("../config");

const router = express.Router();
const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

const insertContact = db.prepare(`
  INSERT INTO contacts (token, share_token, firstname, email, empresa)
  VALUES (?, ?, ?, ?, ?)
`);

const insertContactFull = db.prepare(`
  INSERT INTO contacts (token, share_token, nombre, email, empresa, telefono)
  VALUES (?, ?, ?, ?, ?, ?)
`);

// Solo se actualizan nombre/empresa/teléfono si el contacto sigue "pending" —
// si ya respondió (yes/no), sus propios datos mandan y no se pisan con el CSV.
const updateContactIfPending = db.prepare(`
  UPDATE contacts SET nombre = ?, empresa = ?, telefono = ?
  WHERE id = ? AND status = 'pending'
`);

const updateContactFields = db.prepare(`
  UPDATE contacts SET nombre = ?, empresa = ?, telefono = ? WHERE id = ?
`);

const getContactByEmail = db.prepare("SELECT * FROM contacts WHERE LOWER(email) = LOWER(?)");

// Parser de CSV con soporte de campos entre comillas (a diferencia del
// split-by-comma simple de scripts/import-contacts.js).
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      pushField();
    } else if (c === "\n") {
      pushRow();
    } else if (c === "\r") {
      // ignore, \n lo maneja
    } else {
      field += c;
    }
  }
  if (field.length || row.length) pushRow();

  const cleaned = rows.filter((r) => r.some((c) => c.trim().length));
  if (!cleaned.length) return [];
  const header = cleaned[0].map((h) => h.trim().toLowerCase());
  return cleaned.slice(1).map((r) => {
    const obj = {};
    header.forEach((h, i) => (obj[h] = (r[i] || "").trim()));
    return obj;
  });
}

function requireAuth(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.redirect("/admin/login");
}

router.get("/login", (req, res) => {
  res.render("admin_login", { title: "Admin — Moove Private", error: null });
});

router.post("/login", (req, res) => {
  const { username, password } = req.body;
  const validUser = process.env.ADMIN_USER || "moove";
  const validPass = process.env.ADMIN_PASS || "";

  if (username === validUser && password && password === validPass) {
    req.session.isAdmin = true;
    return res.redirect("/admin");
  }
  res.status(401).render("admin_login", {
    title: "Admin — Moove Private",
    error: "Usuario o contraseña incorrectos.",
  });
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/admin/login"));
});

router.get("/", requireAuth, (req, res) => {
  const contacts = db
    .prepare("SELECT * FROM contacts ORDER BY created_at DESC")
    .all();

  const socios = db.prepare("SELECT * FROM socios ORDER BY created_at ASC").all();
  const sociosByContact = {};
  for (const s of socios) {
    (sociosByContact[s.contact_id] ||= []).push(s);
  }

  const stats = {
    total: contacts.length,
    yes: contacts.filter((c) => c.status === "yes").length,
    no: contacts.filter((c) => c.status === "no").length,
    pending: contacts.filter((c) => c.status === "pending").length,
    socios: socios.length,
  };

  let importSummary = null;
  if (req.query.creados !== undefined) {
    importSummary = {
      creados: Number(req.query.creados) || 0,
      actualizados: Number(req.query.actualizados) || 0,
      existentes: Number(req.query.existentes) || 0,
      omitidos: Number(req.query.omitidos) || 0,
    };
  }

  res.render("admin_dashboard", {
    title: "Admin — Moove Private",
    contacts,
    sociosByContact,
    stats,
    baseUrl: PUBLIC_BASE_URL,
    importSummary,
  });
});

// Alta manual de un contacto (ej. para pruebas o para alguien fuera del CSV de Mailchimp).
router.post("/contacts", requireAuth, (req, res) => {
  const { firstname, email, empresa } = req.body;
  if (!email || !email.trim()) {
    return res.redirect("/admin");
  }
  const token = nanoid(24);
  const shareToken = nanoid(24);
  insertContact.run(token, shareToken, (firstname || "").trim(), email.trim(), (empresa || "").trim() || null);
  res.redirect("/admin");
});

const deleteSociosByContact = db.prepare("DELETE FROM socios WHERE contact_id = ?");
const deleteContactById = db.prepare("DELETE FROM contacts WHERE id = ?");

// Borra un contacto y a sus socios (ej. para limpiar pruebas).
router.post("/contacts/:id/delete", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (Number.isInteger(id)) {
    deleteSociosByContact.run(id);
    deleteContactById.run(id);
  }
  res.redirect("/admin");
});

// Edita nombre/empresa/teléfono de un contacto ya existente (ej. para
// corregir datos que vinieron mal del CSV de origen).
router.post("/contacts/:id/edit", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { nombre, empresa, telefono } = req.body;
  if (Number.isInteger(id)) {
    updateContactFields.run((nombre || "").trim() || null, (empresa || "").trim() || null, (telefono || "").trim() || null, id);
  }
  res.redirect("/admin");
});

// Importa en lote un CSV (nombre,email,empresa,telefono — o el formato viejo
// firstname,email,empresa, sigue funcionando). Si el correo ya existe:
// - y sigue "pending", se actualizan sus datos (nombre/empresa/teléfono) con
//   los del CSV — útil para corregir datos que vinieron mal la primera vez.
// - y ya respondió (yes/no), no se toca nada — sus propios datos mandan.
// En ningún caso se duplica: siempre se reutiliza el token de siempre.
// Al terminar regresa a /admin (no descarga archivo) — para el CSV con
// RSVP_URL listo para Mailchimp usa "Descargar CSV (Mailchimp)" → Todos.
router.post("/contacts/import", requireAuth, csvUpload.single("file"), (req, res) => {
  if (!req.file) return res.redirect("/admin");

  const text = req.file.buffer.toString("utf8").replace(/^﻿/, "");
  const rows = parseCsv(text);

  let creados = 0;
  let actualizados = 0;
  let existentes = 0;
  let omitidos = 0;

  for (const row of rows) {
    const email = (row.email || "").trim();
    const nombreCompleto = (row.nombre || row.firstname || "").trim();
    const empresa = (row.empresa || "").trim();
    const telefono = (row.telefono || "").trim();
    if (!email) { omitidos++; continue; }

    const existing = getContactByEmail.get(email);
    if (existing) {
      if (existing.status === "pending") {
        updateContactIfPending.run(nombreCompleto || null, empresa || null, telefono || null, existing.id);
        actualizados++;
      } else {
        existentes++;
      }
    } else {
      const token = nanoid(24);
      const shareToken = nanoid(24);
      insertContactFull.run(token, shareToken, nombreCompleto, email, empresa || null, telefono || null);
      creados++;
    }
  }

  const params = new URLSearchParams({ creados, actualizados, existentes, omitidos });
  res.redirect(`/admin?${params.toString()}`);
});

function csvCell(value) {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function splitName(fullName) {
  const parts = (fullName || "").trim().split(/\s+/);
  const first = parts.shift() || "";
  const last = parts.join(" ");
  return [first, last];
}

// CSV para Mailchimp. Dos modos via ?scope=:
// - "todos" (default): TODOS los contactos con su RSVP_URL — para la
//   campaña de invitación inicial.
// - "confirmados": solo status = yes + sus socios, sin RSVP_URL — para
//   sincronizar la lista final de asistentes ya cerca del evento.
router.get("/export.csv", requireAuth, (req, res) => {
  if (req.query.scope !== "confirmados") {
    const contacts = db.prepare("SELECT * FROM contacts ORDER BY created_at ASC").all();
    const rows = [["firstname", "email", "RSVP_URL"]];
    for (const c of contacts) {
      const firstname = (c.nombre || c.firstname || "").trim().split(/\s+/)[0] || "";
      rows.push([firstname, c.email || "", `${PUBLIC_BASE_URL}/rsvp/${c.token}`]);
    }
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="moove_todos_rsvp_urls.csv"');
    return res.send("﻿" + csv);
  }

  const contacts = db.prepare("SELECT * FROM contacts WHERE status = 'yes' ORDER BY created_at ASC").all();
  const socios = db.prepare("SELECT * FROM socios ORDER BY created_at ASC").all();
  const contactById = {};
  for (const c of contacts) contactById[c.id] = c;
  // Un contacto puede tener socios aunque no esté en la lista de `yes` filtrada arriba
  // en un estado inconsistente — se ignoran esos socios huérfanos por seguridad.
  const allContactsById = {};
  for (const c of db.prepare("SELECT * FROM contacts").all()) allContactsById[c.id] = c;

  const rows = [["Email Address", "First Name", "Last Name", "Company", "Phone", "Tipo"]];

  for (const c of contacts) {
    const [first, last] = splitName(c.nombre || c.firstname || "");
    rows.push([c.email || "", first, last, c.empresa || "", c.telefono || "", "Cliente"]);
  }

  for (const s of socios) {
    const inviter = allContactsById[s.contact_id];
    if (!inviter || inviter.status !== "yes") continue;
    const [first, last] = splitName(s.nombre || "");
    rows.push([s.email || "", first, last, inviter.empresa || "", s.telefono || "", "Socio"]);
  }

  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="moove_rsvp_confirmados.csv"');
  res.send("﻿" + csv); // BOM para que Excel abra bien los acentos
});

// Sirve las fotos de INE solo a sesión autenticada — nunca por URL pública directa.
router.get("/file/:filename", requireAuth, (req, res) => {
  const filename = path.basename(req.params.filename); // evita path traversal
  const filePath = path.join(UPLOADS_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).send("No encontrado");
  res.sendFile(filePath);
});

module.exports = router;
