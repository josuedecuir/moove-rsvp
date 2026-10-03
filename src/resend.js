// Correos de Moove Space enviados con Resend (API HTTP). Variables de entorno:
//   RESEND_API_KEY        llave de Resend (si falta, los envíos se omiten con un aviso)
//   MAIL_FROM             remitente, ej. "Moove Society <noreply@moove.mx>"
//   ADMIN_NOTIFY_EMAILS   correos que reciben el resumen semanal, separados por coma
const fs = require("fs");
const path = require("path");

const TZ = "America/Mexico_City";
const TAG_CONTACTO =
  '<br><span style="display:inline-block;margin-top:6px;padding:2px 7px;border:1px solid #33502F;color:#B7D9B0;font-size:10px;letter-spacing:.08em;text-transform:uppercase;">Contacto Moove</span>';

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function template(name) {
  return fs.readFileSync(path.join(__dirname, "emails", name), "utf8");
}

function adminEmails() {
  return (process.env.ADMIN_NOTIFY_EMAILS || "")
    .split(/[,;]/)
    .map((e) => e.trim())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
}

async function sendResend({ to, subject, html }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("[email] RESEND_API_KEY no configurada — se omite el correo:", subject);
    return { skipped: true };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.MAIL_FROM || "Moove Society <noreply@moove.mx>",
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${detail.slice(0, 300)}`);
  }
  return { ok: true };
}

function primerNombre(nombre) {
  return String(nombre || "").trim().split(/\s+/)[0] || "";
}

// Al interesado que se anotó en la portada.
function sendConfirmacionInteresado({ to, nombre, empresa }) {
  const html = template("confirmacion_interesado.html")
    .replace("{{nombre}}", esc(primerNombre(nombre)))
    .replace("{{empresa}}", esc(empresa));
  return sendResend({ to, subject: "Ya estás en la lista de Moove Space", html });
}

function formatoHora(utc) {
  return new Date(String(utc).replace(" ", "T") + "Z").toLocaleString("es-MX", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Al equipo: gente nueva desde el último aviso. rows = filas de `interesados`.
function sendResumenSemanal({ to, rows, total }) {
  const base = template("resumen_semanal_equipo.html");
  const bloque = base.match(/<!--FILAS-->([\s\S]*?)<!--\/FILAS-->/);
  if (!bloque) throw new Error("La plantilla del resumen no tiene el bloque <!--FILAS-->.");
  const filas = rows
    .map((r) =>
      bloque[1]
        .replace("{{tag}}", r.contact_id ? TAG_CONTACTO : "")
        .replace("{{nombre}}", esc(r.nombre))
        .replace("{{empresa}}", esc(r.empresa))
        .replace("{{correo}}", esc(r.correo))
        .replace("{{hora}}", esc(formatoHora(r.created_at)))
    )
    .join("");
  const n = rows.length;
  const titulo = n === 1 ? "1 persona nueva quiere entrar." : `${n} personas nuevas quieren entrar.`;
  const html = base
    .replace(bloque[0], filas)
    .replace(/\{\{titulo\}\}/g, titulo)
    .replace("{{total}}", String(total));
  const subject = `Moove Space: ${titulo.replace(/\.$/, "")}`;
  return sendResend({ to, subject, html });
}

module.exports = { sendResend, sendConfirmacionInteresado, sendResumenSemanal, adminEmails, TZ };
