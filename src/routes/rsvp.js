const express = require("express");
const path = require("path");
const { nanoid } = require("nanoid");
const db = require("../db");
const { upload } = require("../upload");
const { sendConfirmationEmail } = require("../email");
const { EVENT_DATE_LABEL, EVENT_CITY, PRIVACY_URL, PUBLIC_BASE_URL } = require("../config");

const router = express.Router();

const getContactByToken = db.prepare("SELECT * FROM contacts WHERE token = ?");
const getSociosByContact = db.prepare("SELECT * FROM socios WHERE contact_id = ? ORDER BY created_at ASC");

const updateYes = db.prepare(`
  UPDATE contacts SET
    nombre = ?, empresa = ?, telefono = ?, ine_path = COALESCE(?, ine_path),
    privacy_accepted_at = datetime('now'), status = 'yes', responded_at = datetime('now')
  WHERE id = ?
`);

const updateNo = db.prepare(`
  UPDATE contacts SET status = 'no', responded_at = datetime('now') WHERE id = ?
`);

function shareUrl(contact) {
  return `${PUBLIC_BASE_URL}/invite/${contact.share_token}`;
}
function rsvpUrl(contact) {
  return `${PUBLIC_BASE_URL}/rsvp/${contact.token}`;
}

router.get("/:token", (req, res) => {
  const contact = getContactByToken.get(req.params.token);
  if (!contact) {
    return res.status(404).render("not_found", { title: "No encontrado" });
  }

  const editing = req.query.edit === "1";

  if (contact.status === "yes" && !editing) {
    return res.render("rsvp_confirmed", {
      title: "Confirmado — Moove Private",
      contact,
      shareUrl: shareUrl(contact),
      rsvpUrl: rsvpUrl(contact),
    });
  }

  if (contact.status === "no" && !editing) {
    return res.render("rsvp_declined", {
      title: "Moove Private",
      contact,
      rsvpUrl: rsvpUrl(contact),
    });
  }

  return res.render("rsvp_form", {
    title: "Moove Private",
    contact,
    eventDate: EVENT_DATE_LABEL,
    eventCity: EVENT_CITY,
    privacyUrl: PRIVACY_URL,
    error: null,
  });
});

router.post("/:token/yes", upload.single("ine"), (req, res) => {
  const contact = getContactByToken.get(req.params.token);
  if (!contact) return res.status(404).render("not_found", { title: "No encontrado" });

  const { nombre, empresa, telefono, privacy } = req.body;

  if (!nombre || !nombre.trim() || !empresa || !empresa.trim() || !telefono || !telefono.trim()) {
    return res.status(400).render("rsvp_form", {
      title: "Moove Private",
      contact,
      eventDate: EVENT_DATE_LABEL,
      eventCity: EVENT_CITY,
      privacyUrl: PRIVACY_URL,
      error: "Faltan campos por completar.",
    });
  }
  if (!privacy) {
    return res.status(400).render("rsvp_form", {
      title: "Moove Private",
      contact,
      eventDate: EVENT_DATE_LABEL,
      eventCity: EVENT_CITY,
      privacyUrl: PRIVACY_URL,
      error: "Debes aceptar el aviso de privacidad para continuar.",
    });
  }

  const inePath = req.file ? path.basename(req.file.path) : null;

  updateYes.run(nombre.trim(), empresa.trim(), telefono.trim(), inePath, contact.id);
  const updated = getContactByToken.get(req.params.token);

  sendConfirmationEmail({
    to: updated.email,
    firstname: updated.firstname,
    rsvpUrl: rsvpUrl(updated),
    shareUrl: shareUrl(updated),
  }).catch((err) => console.error("[email] error enviando confirmación:", err.message));

  res.redirect(`/rsvp/${updated.token}`);
});

router.post("/:token/no", (req, res) => {
  const contact = getContactByToken.get(req.params.token);
  if (!contact) return res.status(404).render("not_found", { title: "No encontrado" });

  updateNo.run(contact.id);
  res.redirect(`/rsvp/${contact.token}`);
});

module.exports = router;
