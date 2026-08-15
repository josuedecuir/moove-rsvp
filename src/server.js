require("dotenv").config();
const path = require("path");
const express = require("express");
const session = require("express-session");
const SqliteSessionStore = require("./sessionStore");

const rsvpRoutes = require("./routes/rsvp");
const inviteRoutes = require("./routes/invite");
const adminRoutes = require("./routes/admin");
const joinRoutes = require("./routes/join");
const { EVENT_DATE_LABEL, EVENT_CITY, JOIN_TOKEN } = require("./config");

const app = express();

// Railway (y la mayoría de PaaS) terminan el HTTPS en su proxy y reenvían la
// petición por HTTP interno — sin esto, Express no reconoce la conexión como
// segura y la cookie de sesión (secure: true) nunca se guarda.
app.set("trust proxy", 1);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Guarda las sesiones en el mismo SQLite del Volume (tabla `sessions` en
// db.js) en vez de en memoria — así sobreviven a los redeploys y no hay
// riesgo de fuga de memoria en el proceso.
app.use(
  session({
    store: new SqliteSessionStore(),
    name: "moove.admin.sid",
    secret: process.env.SESSION_SECRET || "dev-secret-cambia-esto",
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 8 * 60 * 60 * 1000, // 8 horas
    },
  })
);

app.get("/", (req, res) => {
  res.render("landing", {
    title: "Moove Private",
    eventDate: EVENT_DATE_LABEL,
    eventCity: EVENT_CITY,
    joinToken: JOIN_TOKEN,
  });
});

app.use("/rsvp", rsvpRoutes);
app.use("/invite", inviteRoutes);
app.use("/admin", adminRoutes);
app.use("/join", joinRoutes);

app.use((req, res) => {
  res.status(404).render("not_found", { title: "No encontrado" });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render("error", {
    title: "Algo salió mal",
    message: err.message || "Ocurrió un error inesperado.",
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Moove RSVP corriendo en http://localhost:${PORT}`);
});
