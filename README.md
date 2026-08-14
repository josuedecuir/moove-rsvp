# Moove RSVP — Save the Date

App de RSVP para el evento Moove Society (15 de octubre). Reemplaza el flujo
viejo de "plus one" por: cada contacto conocido confirma su propia asistencia
y, si quiere, comparte un link personal para que sus socios se registren por
su cuenta (cada uno con su propio nombre, teléfono y foto de INE).

## Flujo

1. **Correo Save the Date** (`email-templates/save_the_date.html`, para Mailchimp,
   enviado desde `noreply@moove.mx`) — un botón que lleva a `/rsvp/:token`.
2. **`/rsvp/:token`** — el contacto confirma Sí/No y llena su info. Si ya
   respondió, el mismo link muestra directo su estatus (no vuelve a pedirle
   los datos) — para editar, agrega `?edit=1` a la URL.
3. Al confirmar que sí asiste, recibe un **correo de confirmación** con su
   link personal para compartir (`/invite/:shareToken`).
4. **`/invite/:shareToken`** — el socio invitado ve quién lo invitó, la fecha
   y ciudad (sin más detalles del evento) y llena su propia info.
5. **`/admin`** — panel con usuario/contraseña únicos (`ADMIN_USER` /
   `ADMIN_PASS`) para ver todas las confirmaciones y fotos de INE. Las fotos
   solo se sirven a sesión autenticada, nunca por URL pública.

## Correr en local

```bash
npm install
cp .env.example .env    # y ajusta los valores
npm start
```

Abre `http://localhost:3000/admin` para el panel, y crea un contacto de
prueba con el script de importación (ver abajo) para probar `/rsvp/:token`.

## Cargar la base de invitados

```bash
node scripts/import-contacts.js base_invitados.csv salida_mailchimp.csv
```

- `base_invitados.csv` de entrada: columnas `firstname,email,empresa`.
- `salida_mailchimp.csv` de salida: `firstname,email,RSVP_URL` — súbelo a
  Mailchimp como base con un merge field custom (ej. `RSVPURL`) y úsalo en
  el botón del correo (`{{ RSVP_URL }}` en la plantilla ya está listo para
  eso).

## Deploy en Railway

1. Crea el proyecto en Railway a partir de este repo.
2. Agrega un **Volume** montado en, por ejemplo, `/data`.
3. Variables de entorno: copia las de `.env.example`, apuntando
   `DB_PATH=/data/rsvp.db` y `UPLOADS_DIR=/data/uploads` (dentro del volumen,
   para que sobrevivan a los redeploys).
4. Configura el dominio público y ponlo en `PUBLIC_BASE_URL` (con `https://`).
5. Railway detecta `npm start` solo — no hace falta Procfile.

## Pendiente / decisiones que quedaron abiertas

- El aviso de privacidad se referencia por link (`PRIVACY_URL`), no se copia
  el texto completo dentro del formulario.
- La fecha límite de RSVP no está definida todavía (se agregará como
  variable de entorno `RSVP_DEADLINE` cuando se decida, con validación en
  las rutas de `/rsvp` e `/invite`).
- El envío del correo de confirmación depende de tener SMTP configurado
  (`SMTP_HOST`, `SMTP_USER`, etc.). Si no está configurado, la app sigue
  funcionando pero solo deja un log de advertencia en vez de enviar el correo.
- El admin usa una sola cuenta compartida (usuario/contraseña), no cuentas
  individuales — así se decidió para este MVP.
