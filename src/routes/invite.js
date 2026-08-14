const express = require("express");
const path = require("path");
const db = require("../db");
const { upload } = require("../upload");
const { EVENT_DATE_LABEL, EVENT_CITY, PRIVACY_URL } = require("../config");

const router = express.Router();

const getContactByShareToken = db.prepare("SELECT * FROM contacts WHERE share_token = ?");
const insertSocio = db.prepare(`
  INSERT INTO socios (contact_id, nombre, telefono, ine_path, privacy_accepted_at)
  VALUES (?, ?, ?, ?, datetime('now'))
`);

router.get("/:shareToken", (req, res) => {
  const contact = getContactByShareToken.get(req.params.shareToken);
  if (!contact || contact.status !== "yes") {
    return res.status(404).render("not_found", { title: "No encontrado" });
  }

  res.render("invite_form", {
    title: "Moove Private — Invitación",
    inviterName: contact.nombre || contact.firstname || "Un contacto Moove",
    eventDate: EVENT_DATE_LABEL,
    eventCity: EVENT_CITY,
    privacyUrl: PRIVACY_URL,
    shareToken: contact.share_token,
    error: null,
  });
});

router.post("/:shareToken", upload.single("ine"), (req, res) => {
  const contact = getContactByShareToken.get(req.params.shareToken);
  if (!contact || contact.status !== "yes") {
    return res.status(404).render("not_found", { title: "No encontrado" });
  }

  const { nombre, telefono, privacy } = req.body;
  const renderError = (msg) =>
    res.status(400).render("invite_form", {
      title: "Moove Private — Invitación",
      inviterName: contact.nombre || contact.firstname || "Un contacto Moove",
      eventDate: EVENT_DATE_LABEL,
      eventCity: EVENT_CITY,
      privacyUrl: PRIVACY_URL,
      shareToken: contact.share_token,
      error: msg,
    });

  if (!nombre || !nombre.trim() || !telefono || !telefono.trim()) {
    return renderError("Faltan campos por completar.");
  }
  if (!privacy) {
    return renderError("Debes aceptar el aviso de privacidad para continuar.");
  }

  const inePath = req.file ? path.basename(req.file.path) : null;
  insertSocio.run(contact.id, nombre.trim(), telefono.trim(), inePath);

  res.render("invite_thanks", {
    title: "Confirmado — Moove Private",
    inviterName: contact.nombre || contact.firstname,
  });
});

module.exports = router;
