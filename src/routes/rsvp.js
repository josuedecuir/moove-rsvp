const express = require("express");
const db = require("../db");
const { sendConfirmationEmail } = require("../email");
const { EVENT_DATE_LABEL, EVENT_CITY, PRIVACY_URL, PUBLIC_BASE_URL } = require("../config");

const router = express.Router();

const getContactByToken = db.prepare("SELECT * FROM contacts WHERE token = ?");
const getSociosByContact = db.prepare("SELECT * FROM socios WHERE contact_id = ? ORDER BY created_at ASC");

const updateYes = db.prepare(`
  UPDATE contacts SET
    nombre = ?, empresa = ?, telefono = ?,
    privacy_accepted_at = datetime('now'), status = 'yes', responded_at = datetime('now')
  WHERE id = ?
`);

function isValidPhone(telefono) {
  return /^[0-9]{10}$/.test((telefono || "").trim());
}

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

router.post("/:token/yes", (req, res) => {
  const contact = getContactByToken.get(req.params.token);
  if (!contact) return res.status(404).render("not_found", { title: "No encontrado" });

  const { nombre, empresa, telefono, privacy } = req.body;
  const renderError = (msg) =>
    res.status(400).render("rsvp_form", {
      title: "Moove Private",
      contact: { ...contact, nombre, empresa, telefono },
      eventDate: EVENT_DATE_LABEL,
      eventCity: EVENT_CITY,
      privacyUrl: PRIVACY_URL,
      error: msg,
    });

  if (!nombre || !nombre.trim() || !empresa || !empresa.trim() || !telefono || !telefono.trim()) {
    return renderError("Faltan campos por completar.");
  }
  if (!isValidPhone(telefono)) {
    return renderError("El teléfono debe tener 10 dígitos.");
  }
  if (!privacy) {
    return renderError("Debes aceptar el aviso de privacidad para continuar.");
  }

  updateYes.run(nombre.trim(), empresa.trim(), telefono.trim(), contact.id);
  const updated = getContactByToken.get(req.params.token);

  sendConfirmationEmail({
    to: updated.email,
    firstname: (updated.nombre || updated.firstname || "").trim().split(" ")[0],
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
