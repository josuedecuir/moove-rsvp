// "¿Te interesa unirte?" de la portada: guarda quién quiere entrar a Moove Space.
const express = require("express");
const db = require("../db");
const { sendConfirmacionInteresado } = require("../resend");

const router = express.Router();

const getByCorreo = db.prepare("SELECT * FROM interesados WHERE correo = ?");
const getContactByToken = db.prepare("SELECT id FROM contacts WHERE token = ?");
const getContactByEmail = db.prepare("SELECT id FROM contacts WHERE LOWER(email) = LOWER(?)");
const insertInteresado = db.prepare(`
  INSERT INTO interesados (nombre, empresa, correo, contact_id) VALUES (?, ?, ?, ?)
`);
const updateInteresado = db.prepare(`
  UPDATE interesados SET nombre = ?, empresa = ?, contact_id = COALESCE(contact_id, ?), updated_at = datetime('now')
  WHERE id = ?
`);

// Límite sencillo por dispositivo: 6 envíos por hora desde la misma IP.
const MAX_POR_HORA = 6;
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const recientes = (hits.get(ip) || []).filter((t) => now - t < 3600 * 1000);
  if (recientes.length >= MAX_POR_HORA) {
    hits.set(ip, recientes);
    return true;
  }
  recientes.push(now);
  hits.set(ip, recientes);
  return false;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, list] of hits) {
    if (!list.some((t) => now - t < 3600 * 1000)) hits.delete(ip);
  }
}, 30 * 60 * 1000).unref();

function clean(value, max) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function validate({ nombre, empresa, correo }) {
  if (nombre.split(" ").length < 2 || nombre.length < 5) return "Escribe tu nombre completo.";
  if (empresa.length < 2) return "Escribe el nombre de tu empresa.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo)) return "Escribe un correo válido.";
  return null;
}

router.post("/", (req, res) => {
  const wantsJson = req.is("application/json") || req.accepts(["html", "json"]) === "json";
  const done = () => (wantsJson ? res.json({ ok: true }) : res.redirect(303, "/?enviado=1#join"));
  const fail = (status, error) =>
    wantsJson ? res.status(status).json({ ok: false, error }) : res.redirect(303, "/?error=" + encodeURIComponent(error) + "#join");

  const body = req.body || {};
  if (body.website) return done(); // campo escondido: es un robot, se descarta sin avisar

  if (limited(req.ip)) return fail(429, "Demasiados intentos. Inténtalo más tarde.");

  const data = {
    nombre: clean(body.nombre, 120),
    empresa: clean(body.empresa, 120),
    correo: clean(body.correo, 160).toLowerCase(),
  };
  const error = validate(data);
  if (error) return fail(400, error);

  // ¿Ya es contacto de Moove? Por su link del correo (sesión) o porque su correo coincide.
  let contactId = null;
  const token = req.session && req.session.contactToken;
  const porToken = token ? getContactByToken.get(token) : null;
  if (porToken) contactId = porToken.id;
  else {
    const porCorreo = getContactByEmail.get(data.correo);
    if (porCorreo) contactId = porCorreo.id;
  }

  const existente = getByCorreo.get(data.correo);
  if (existente) {
    updateInteresado.run(data.nombre, data.empresa, contactId, existente.id);
  } else {
    insertInteresado.run(data.nombre, data.empresa, data.correo, contactId);
    sendConfirmacionInteresado({ to: data.correo, nombre: data.nombre, empresa: data.empresa }).catch((err) =>
      console.error("[email] confirmación al interesado:", err.message)
    );
  }
  return done();
});

module.exports = router;
