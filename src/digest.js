// Resumen semanal para el equipo: los jueves a las 10:00 a. m. (CDMX), del
// DIGEST_FROM al DIGEST_UNTIL (por defecto 8 al 29 de octubre de 2026, un mes).
// Solo se manda si hay gente nueva (interesados con notificado_at vacío).
const db = require("./db");
const { sendResumenSemanal, adminEmails, TZ } = require("./resend");

const FROM = process.env.DIGEST_FROM || "2026-10-08";
const UNTIL = process.env.DIGEST_UNTIL || "2026-10-29";
const HORA_ENVIO = 10; // 10:00 a. m. hora de CDMX
const HORA_LIMITE = 22; // si la app estuvo caída, se reintenta hasta las 10 p. m.

const getMeta = db.prepare("SELECT value FROM meta WHERE key = ?");
const setMeta = db.prepare(
  "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
);

function partesCdmx(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      hour12: false,
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );
  return {
    fecha: `${parts.year}-${parts.month}-${parts.day}`,
    diaSemana: parts.weekday, // "Thu"
    hora: Number(parts.hour) % 24,
  };
}

// `now` y `send` se pueden inyectar para probarlo sin esperar al jueves.
async function runDigest(now = new Date(), send = sendResumenSemanal) {
  const { fecha, diaSemana, hora } = partesCdmx(now);
  if (diaSemana !== "Thu" || hora < HORA_ENVIO || hora >= HORA_LIMITE) return "fuera de horario";
  if (fecha < FROM || fecha > UNTIL) return "fuera de fechas";

  const ya = getMeta.get("digest_last_date");
  if (ya && ya.value === fecha) return "ya procesado hoy";

  const to = adminEmails();
  if (!to.length) return "sin destinatarios (ADMIN_NOTIFY_EMAILS)";

  const rows = db.prepare("SELECT * FROM interesados WHERE notificado_at IS NULL ORDER BY created_at ASC").all();
  if (!rows.length) {
    setMeta.run("digest_last_date", fecha);
    return "sin novedades";
  }

  const total = db.prepare("SELECT COUNT(*) AS n FROM interesados").get().n;
  const result = await send({ to, rows, total });
  if (result && result.skipped) return "sin RESEND_API_KEY"; // no marca nada: reintenta cuando haya llave

  const marks = rows.map(() => "?").join(",");
  db.prepare(`UPDATE interesados SET notificado_at = datetime('now') WHERE id IN (${marks})`).run(...rows.map((r) => r.id));
  setMeta.run("digest_last_date", fecha);
  return `enviado (${rows.length})`;
}

let running = false;
function startDigestScheduler() {
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await runDigest();
      if (result.startsWith("enviado")) console.log("[digest]", result);
    } catch (err) {
      console.error("[digest] error:", err.message);
    } finally {
      running = false;
    }
  };
  setTimeout(tick, 30 * 1000);
  setInterval(tick, 15 * 60 * 1000);
}

module.exports = { startDigestScheduler, runDigest };
