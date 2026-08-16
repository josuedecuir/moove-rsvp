const express = require("express");
const path = require("path");
const db = require("../db");
const { upload } = require("../upload");
const { EVENT_DATE_LABEL, EVENT_CITY, PRIVACY_URL } = require("../config");

const router = express.Router();

const getContactByShareToken = db.prepare("SELECT * FROM contacts WHERE share_token = ?");
const insertSocio = db.prepare(`
  INSERT INTO socios (contact_id, nombre, email, telefono, ine_front_path, ine_back_path, privacy_accepted_at)
  VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
`);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.get("/:shareToken", (req, res) => {
  const contact = getContactByShareToken.get(req.params.shareToken);
  if (!contact || contact.status !== "yes") {
    return res.status(404).render("not_found", { title: "No encontrado" });
  }

  res.render("invite_form", {
    title: "The New Society — Invitación",
    inviterName: contact.nombre || contact.firstname || "Un contacto Moove",
    eventDate: EVENT_DATE_LABEL,
    eventCity: EVENT_CITY,
    privacyUrl: PRIVACY_URL,
    shareToken: contact.share_token,
    error: null,
  });
});

const uploadIne = upload.fields([
  { name: "ine_front", maxCount: 1 },
  { name: "ine_back", maxCount: 1 },
]);

router.post("/:shareToken", uploadIne, (req, res) => {
  const contact = getContactByShareToken.get(req.params.shareToken);
  if (!contact || contact.status !== "yes") {
    return res.status(404).render("not_found", { title: "No encontrado" });
  }

  const { nombre, email, telefono, privacy } = req.body;
  const files = req.files || {};
  const renderError = (msg) =>
    res.status(400).render("invite_form", {
      title: "The New Society — Invitación",
      inviterName: contact.nombre || contact.firstname || "Un contacto Moove",
      eventDate: EVENT_DATE_LABEL,
      eventCity: EVENT_CITY,
      privacyUrl: PRIVACY_URL,
      shareToken: contact.share_token,
      error: msg,
    });

  if (!nombre || !nombre.trim() || !email || !email.trim() || !telefono || !telefono.trim()) {
    return renderError("Faltan campos por completar.");
  }
  if (!EMAIL_RE.test(email.trim())) {
    return renderError("Ingresa un correo válido.");
  }
  if (!/^[0-9]{10}$/.test(telefono.trim())) {
    return renderError("El teléfono debe tener 10 dígitos.");
  }
  if (!files.ine_front || !files.ine_front[0] || !files.ine_back || !files.ine_back[0]) {
    return renderError("Necesitamos la foto del anverso y del reverso de tu INE.");
  }
  if (!privacy) {
    return renderError("Debes aceptar el aviso de privacidad para continuar.");
  }

  const inefrontPath = path.basename(files.ine_front[0].path);
  const inebackPath = path.basename(files.ine_back[0].path);
  insertSocio.run(contact.id, nombre.trim(), email.trim(), telefono.trim(), inefrontPath, inebackPath);

  res.render("invite_thanks", {
    title: "Confirmado — The New Society",
    inviterName: contact.nombre || contact.firstname,
  });
});

module.exports = router;
