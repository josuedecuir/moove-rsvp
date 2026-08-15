module.exports = {
  EVENT_DATE_LABEL: "15 de octubre",
  EVENT_CITY: "Ciudad de México",
  PRIVACY_URL: process.env.PRIVACY_URL || "https://moove.mx/aviso-de-privacidad",
  PUBLIC_BASE_URL: (process.env.PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/$/, ""),
  // Slug fijo del link universal de invitación (/join/:token). Un solo link,
  // pensado para que Daniel lo reenvíe por WhatsApp a quien quiera.
  JOIN_TOKEN: process.env.JOIN_TOKEN || "cambia-este-slug",
};
