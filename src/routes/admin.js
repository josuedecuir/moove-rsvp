const express = require("express");
const path = require("path");
const fs = require("fs");
const { nanoid } = require("nanoid");
const db = require("../db");
const { UPLOADS_DIR } = require("../upload");
const { PUBLIC_BASE_URL } = require("../config");

const router = express.Router();

const insertContact = db.prepare(`
  INSERT INTO contacts (token, share_token, firstname, email, empresa)
  VALUES (?, ?, ?, ?, ?)
`);

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

  res.render("admin_dashboard", {
    title: "Admin — Moove Private",
    contacts,
    sociosByContact,
    stats,
    baseUrl: PUBLIC_BASE_URL,
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

// CSV listo para importar a Mailchimp: contactos confirmados (status = yes)
// + todos los socios (si ya subieron su info, se asume que van).
router.get("/export.csv", requireAuth, (req, res) => {
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
