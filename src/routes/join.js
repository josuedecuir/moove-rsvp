const express = require("express");
const { nanoid } = require("nanoid");
const db = require("../db");
const { sendConfirmationEmail } = require("../email");
const { EVENT_DATE_LABEL, EVENT_CITY, PRIVACY_URL, PUBLIC_BASE_URL, JOIN_TOKEN } = require("../config");

const router = express.Router();

const insertContact = db.prepare(`
  INSERT INTO contacts (token, share_token, nombre, email, empresa, telefono, privacy_accepted_at, status, responded_at)
  VALUES (?, ?, ?, ?, ?, ?, datetime('now'), 'yes', datetime('now'))
`);

const getContactByEmail = db.prepare("SELECT * FROM contacts WHERE LOWER(email) = LOWER(?)");

const updateExistingAsYes = db.prepare(`
  UPDATE contacts SET
    nombre = ?, empresa = ?, telefono = ?,
    privacy_accepted_at = datetime('now'), status = 'yes', responded_at = datetime('now')
  WHERE id = ?
`);

function isValidPhone(telefono) {
  return /^[0-9]{10}$/.test((telefono || "").trim());
}
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || "").trim());
}
function rsvpUrl(token) {
  return `${PUBLIC_BASE_URL}/rsvp/${token}`;
}
function shareUrl(shareToken) {
  return `${PUBLIC_BASE_URL}/invite/${shareToken}`;
}

router.get("/:token", (req, res) => {
  if (req.params.token !== JOIN_TOKEN) {
    return res.status(404).render("not_found", { title: "No encontrado" });
  }
  res.render("join_form", {
    title: "Moove Private",
    eventDate: EVENT_DATE_LABEL,
    eventCity: EVENT_CITY,
    privacyUrl: PRIVACY_URL,
    joinToken: JOIN_TOKEN,
    error: null,
    ogTitle: "Moove Private — Algo está por suceder.",
    ogDescription: `${EVENT_DATE_LABEL} · ${EVENT_CITY}. Evento privado — confirma tu asistencia.`,
  });
});

router.post("/:token", (req, res) => {
  if (req.params.token !== JOIN_TOKEN) {
    return res.status(404).render("not_found", { title: "No encontrado" });
  }

  const { nombre, email, empresa, telefono, privacy } = req.body;
  const renderError = (msg) =>
    res.status(400).render("join_form", {
      title: "Moove Private",
      eventDate: EVENT_DATE_LABEL,
      eventCity: EVENT_CITY,
      privacyUrl: PRIVACY_URL,
      joinToken: JOIN_TOKEN,
      error: msg,
    });

  if (!nombre || !nombre.trim() || !email || !email.trim() || !empresa || !empresa.trim() || !telefono || !telefono.trim()) {
    return renderError("Faltan campos por completar.");
  }
  if (!isValidEmail(email)) {
    return renderError("Ingresa un correo válido.");
  }
  if (!isValidPhone(telefono)) {
    return renderError("El teléfono debe tener 10 dígitos.");
  }
  if (!privacy) {
    return renderError("Debes aceptar el aviso de privacidad para continuar.");
  }

  // Si el correo ya existe (ej. venía de la campaña con su propio link
  // personal), no se crea un contacto duplicado — se actualiza el que ya
  // tenía y se reutiliza su token de siempre.
  const existing = getContactByEmail.get(email.trim());
  if (existing) {
    updateExistingAsYes.run(nombre.trim(), empresa.trim(), telefono.trim(), existing.id);
    const updated = getContactByEmail.get(email.trim());

    sendConfirmationEmail({
      to: updated.email,
      firstname: nombre.trim().split(" ")[0],
      rsvpUrl: rsvpUrl(updated.token),
      shareUrl: shareUrl(updated.share_token),
    }).catch((err) => console.error("[email] error enviando confirmación:", err.message));

    return res.redirect(`/rsvp/${updated.token}`);
  }

  const token = nanoid(24);
  const newShareToken = nanoid(24);
  insertContact.run(token, newShareToken, nombre.trim(), email.trim(), empresa.trim(), telefono.trim());

  sendConfirmationEmail({
    to: email.trim(),
    firstname: nombre.trim().split(" ")[0],
    rsvpUrl: rsvpUrl(token),
    shareUrl: shareUrl(newShareToken),
  }).catch((err) => console.error("[email] error enviando confirmación:", err.message));

  res.redirect(`/rsvp/${token}`);
});

module.exports = router;
