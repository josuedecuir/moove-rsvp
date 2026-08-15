# Moove RSVP — Documentación completa

App de confirmación de asistencia para el evento **"The New Society"** (Moove), el jueves 15 de octubre en Ciudad de México. Reemplaza el flujo clásico de "correo con +1" por: cada persona confirma su propia asistencia y sube su propia identificación, y quien ya confirmó puede compartir un link para que sus socios se registren por su cuenta.

---

## 1. Dónde vive todo

| Cosa | Dónde |
|---|---|
| Código fuente | [github.com/josuedecuir/moove-rsvp](https://github.com/josuedecuir/moove-rsvp) (rama `main`) |
| Hosting / servidor | [Railway](https://railway.com) — proyecto `moove-rsvp`, servicio del mismo nombre |
| Dominio principal | **https://rsvp.moove.mx** (dominio propio, certificado SSL válido) |
| Dominio de respaldo | https://moove-rsvp-production.up.railway.app (siempre funciona, mismo servicio) |
| Base de datos | SQLite, dentro de un **Volume** de Railway montado en `/data` — sobrevive a los redeploys |
| Fotos de INE | Mismo Volume, carpeta `/data/uploads` |
| Carpeta local de este proyecto | `App RSVP/` dentro de esta misma carpeta de Drive |

**Cómo se actualiza:** cualquier cambio que se sube a la rama `main` de GitHub se despliega solo en Railway (auto-deploy, sin pasos manuales). No hace falta tocar nada en Railway para publicar un cambio de código — solo `git push`.

---

## 2. Qué hace la app (resumen del flujo)

```
Correo/WhatsApp con un link  →  Persona llena sus datos  →  Confirma asistencia
                                                                    │
                              ┌─────────────────────────────────────┤
                              │                                     │
                    Le llega correo de confirmación         Puede compartir un link
                    con su link personal + link para           para que sus socios
                    compartir con socios                        se registren solos
                                                                    │
                                                          Socio llena sus datos
                                                          (incluye foto de INE
                                                           frente y reverso)

Todo lo anterior queda guardado y visible en /admin, con opción de exportar
un CSV listo para subir a Mailchimp.
```

---

## 3. Las 4 puertas de entrada (rutas públicas)

### a) `/` — Página raíz (`rsvp.moove.mx`)
Vitrina de la invitación: mismo copy y tono que el correo Save the Date ("Algo está por suceder..."). Tiene un botón "Confirmar mi asistencia" que lleva al link universal (`/join`). Pensada para compartirse directamente como link (tiene metadatos Open Graph — imagen y texto de preview cuando se pega en WhatsApp).

### b) `/rsvp/:token` — Link personal de un contacto conocido
Uno único por cada persona que ya está en la base de datos (importada vía CSV/Mailchimp, o agregada a mano desde el admin). Es el link que va en el correo de Mailchimp.
- Si no ha respondido: muestra el formulario (nombre, empresa, teléfono, aviso de privacidad). **No pide INE** — la identificación solo se pide a los socios.
- Si ya dijo que sí: muestra la pantalla de "confirmado" con su link personal para compartir con socios.
- Si ya dijo que no: muestra la pantalla de "qué mal", con opción de cambiar de opinión.
- Para editar su respuesta: agregar `?edit=1` al final del link.

### c) `/invite/:shareToken` — Link de un socio
Se genera automáticamente cuando un contacto (opción b) confirma que sí asiste. Es él quien lo comparte (por WhatsApp, etc.) con socios de su empresa que no están en la base de datos. El formulario del socio pide nombre, correo, teléfono, **y foto de INE (anverso y reverso, ambas obligatorias)**. Los socios no pueden generar su propio link para invitar a más gente — solo los contactos "de primera generación" tienen ese privilegio.

### d) `/join/:token` — Link universal
Un solo link fijo, protegido por una palabra clave en la URL (el `:token`), pensado para que Daniel (o quien sea) lo reenvíe por WhatsApp a cualquier cliente nuevo sin necesidad de que ya esté en la base de datos. Quien lo llena queda registrado como un contacto normal e independiente (no como "socio de alguien"), y también recibe su propio link para invitar socios.

**Link universal actual:** `https://rsvp.moove.mx/join/nlkpuvn1`
(la palabra clave vive en la variable de entorno `JOIN_TOKEN` en Railway — si se cambia ahí, cambia el link)

---

## 4. El panel de administración — `/admin`

Acceso con usuario y contraseña únicos (variables `ADMIN_USER` y `ADMIN_PASS` en Railway — pídemelas o revísalas ahí si no las tienes a la mano).

Desde ahí puedes:
- Ver todos los contactos con su estatus (confirmado / declinado / pendiente), y sus socios anidados debajo de cada uno.
- Ver las fotos de INE de los socios (protegidas — solo visibles con sesión iniciada, nunca por URL pública).
- **Agregar un contacto a mano** (nombre, correo, empresa) y obtener su link `/rsvp/:token` al instante — útil para dar de alta a alguien sin pasar por el CSV de Mailchimp.
- **Borrar un contacto** (y sus socios) — por ejemplo para limpiar pruebas.
- **Descargar un CSV** listo para importar a Mailchimp, con todos los confirmados (contactos + socios), columnas: `Email Address, First Name, Last Name, Company, Phone, Tipo`.

---

## 5. Base de datos (qué se guarda)

Dos tablas principales en SQLite (`/data/rsvp.db`):

**`contacts`** (los del link tipo b y d):
`nombre, email, empresa, telefono, status (pending/yes/no), token, share_token, responded_at, privacy_accepted_at`

**`socios`** (los del link tipo c, cada uno ligado a un `contact_id`):
`nombre, email, telefono, ine_front_path, ine_back_path, privacy_accepted_at`

Además hay una tabla `sessions` (para el login del admin — persistente en SQLite, no en memoria, así no se cierra sesión sola en cada redeploy).

---

## 6. Correo de confirmación automático

Al confirmar asistencia (por cualquiera de las 3 vías), se intenta mandar un correo automático con el link personal y el link para compartir con socios. **Depende de tener configurado un SMTP real** (variables `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` en Railway). Si no está configurado, la app sigue funcionando normal — solo se salta el envío y deja un aviso en los logs de Railway.

---

## 7. La pieza de correo para Mailchimp

Está en [`email-templates/save_the_date.html`](email-templates/save_the_date.html) dentro de este proyecto. Usa merge tags de Mailchimp (`{{ contact.firstname }}`, `{{ RSVP_URL }}`) — al importar la base con `scripts/import-contacts.js` (ver abajo) se genera un CSV con la columna `RSVP_URL` lista para subir como base de Mailchimp y usar en el botón del correo.

```bash
node scripts/import-contacts.js base_invitados.csv salida_mailchimp.csv
```

---

## 8. Variables de entorno (configuración en Railway)

| Variable | Para qué es |
|---|---|
| `PUBLIC_BASE_URL` | Dominio público actual (`https://rsvp.moove.mx`) — se usa para armar todos los links |
| `DB_PATH` | Ruta del archivo SQLite (`/data/rsvp.db`, dentro del Volume) |
| `UPLOADS_DIR` | Carpeta de fotos de INE (`/data/uploads`, dentro del Volume) |
| `ADMIN_USER` / `ADMIN_PASS` | Login del panel `/admin` |
| `SESSION_SECRET` | Secreto para firmar la cookie de sesión del admin |
| `PRIVACY_URL` | Link al aviso de privacidad de Moove (`moove.mx/aviso-de-privacidad`) |
| `JOIN_TOKEN` | La palabra clave del link universal `/join/:token` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Envío del correo de confirmación automático (opcional — sin esto, solo se omite el envío) |

Ver también [`.env.example`](.env.example) para correr el proyecto en local.

---

## 9. Seguridad — qué ya está cubierto

- Fotos de INE solo accesibles con sesión de admin iniciada (nunca por URL pública directa).
- Contraseñas y secretos viven como variables de entorno en Railway, nunca en el código ni en GitHub.
- Sesión del admin persistida en SQLite (no en memoria) — no se cierra sola en cada redeploy, y no acumula fugas de memoria.
- HTTPS válido en el dominio propio (certificado Let's Encrypt, renovación automática por Railway).
- Sin vulnerabilidades conocidas en las dependencias (`npm audit` limpio).
- El link universal (`/join`) y el de admin llevan su propia "palabra clave" — no son adivinables a simple vista.

## 10. Pendientes / cosas que quedaron abiertas

- **SMTP real**: falta conectar un proveedor de correo de verdad para que el correo de confirmación se mande solo (hoy solo se registra en logs si no está configurado).
- **Fecha límite de RSVP**: no está definida todavía — se planeó dejarla pendiente hasta tener varias piezas de comunicación listas.
- El envío del Save the Date por Mailchimp y la carga de la base de invitados es un paso manual fuera de esta app (usando el CSV que genera `scripts/import-contacts.js`).

---

## 11. Resolver problemas comunes

- **"El link no es válido"**: el token no existe en la base — puede ser un link viejo de una prueba, o un typo.
- **No me deja entrar al admin después de un cambio reciente**: espera 30–60 segundos a que Railway termine de redeployar.
- **Chrome dice "No seguro" en `rsvp.moove.mx`**: normalmente es caché vieja del navegador de antes de que el certificado quedara listo — probar en incógnito o limpiar datos del sitio lo resuelve.
- **La imagen de preview carga lento en WhatsApp**: revisar el peso de `src/public/og-image.jpg` — debe ser JPG, no PNG, e idealmente bajo 200KB.
