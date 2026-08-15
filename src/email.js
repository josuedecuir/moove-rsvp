const nodemailer = require("nodemailer");

function getTransport() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

// Correo de confirmación enviado justo al confirmar asistencia (Sí).
// Sirve de respaldo del link para compartir, por si se pierde el correo original.
async function sendConfirmationEmail({ to, firstname, rsvpUrl, shareUrl }) {
  const transport = getTransport();
  if (!transport) {
    console.warn(
      "[email] SMTP no configurado — se omite el envío del correo de confirmación.",
      { to, shareUrl }
    );
    return { skipped: true };
  }

  const html = `
  <div style="background:#050605;padding:40px 16px;font-family:'DM Sans',Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#0B0D0B;border:1px solid #1A1F1A;padding:40px 36px;">
      <div style="color:#8D9687;font-size:10px;letter-spacing:.28em;text-transform:uppercase;margin-bottom:24px;">
        Moove Private
      </div>
      <div style="color:#F4F1EA;font-family:Georgia,serif;font-size:30px;line-height:1.15;margin-bottom:20px;">
        Quedas confirmado${firstname ? ", " + firstname : ""}.
      </div>
      <p style="color:#C7C4BB;font-size:15px;line-height:1.8;">
        Ya tenemos tu lugar apartado. Guarda este correo — tu link personal de acceso es este mismo:
      </p>
      <p style="margin:28px 0;">
        <a href="${rsvpUrl}" style="display:inline-block;background:#F4F1EA;color:#050605;text-decoration:none;padding:14px 24px;font-size:12px;text-transform:uppercase;letter-spacing:.08em;font-weight:600;">
          Ver mi confirmación
        </a>
      </p>
      <p style="color:#C7C4BB;font-size:15px;line-height:1.8;">
        En los próximos días te compartimos los detalles puntuales del evento.
      </p>
      <p style="color:#C7C4BB;font-size:15px;line-height:1.8;">
        Si tienes socios en tu empresa que quieras invitar, comparte este otro link con ellos:
      </p>
      <p style="color:#ADB7A6;font-size:13px;word-break:break-all;">
        ${shareUrl}
      </p>
      <div style="margin-top:40px;padding-top:24px;border-top:1px solid #1A1F1A;color:#5F655D;font-size:10px;">
        Moove Private · Confidencial
      </div>
    </div>
  </div>`;

  return transport.sendMail({
    from: process.env.SMTP_FROM || "Moove <noreply@moove.mx>",
    to,
    subject: "Quedas confirmado — Moove Private",
    html,
  });
}

module.exports = { sendConfirmationEmail };
