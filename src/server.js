require("dotenv").config();
const path = require("path");
const express = require("express");
const session = require("express-session");

const rsvpRoutes = require("./routes/rsvp");
const inviteRoutes = require("./routes/invite");
const adminRoutes = require("./routes/admin");

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    name: "moove.admin.sid",
    secret: process.env.SESSION_SECRET || "dev-secret-cambia-esto",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 8 * 60 * 60 * 1000, // 8 horas
    },
  })
);

app.get("/", (req, res) => res.redirect("/admin"));

app.use("/rsvp", rsvpRoutes);
app.use("/invite", inviteRoutes);
app.use("/admin", adminRoutes);

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
