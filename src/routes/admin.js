const express = require("express");
const path = require("path");
const fs = require("fs");
const db = require("../db");
const { UPLOADS_DIR } = require("../upload");

const router = express.Router();

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
  });
});

// Sirve las fotos de INE solo a sesión autenticada — nunca por URL pública directa.
router.get("/file/:filename", requireAuth, (req, res) => {
  const filename = path.basename(req.params.filename); // evita path traversal
  const filePath = path.join(UPLOADS_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).send("No encontrado");
  res.sendFile(filePath);
});

module.exports = router;
