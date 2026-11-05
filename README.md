<div align="center">
  <img src="public/brand/raiz-logo.jpeg" alt="RAÍZ Finanzas Logo" width="260" style="border-radius: 24px;" />
  <h1>🌱 RAÍZ — Finanzas con Base Firme</h1>
  <p><strong>Plataforma inteligente de finanzas personales y en pareja con sincronización en tiempo real, seguridad Zero-Trust y un asistente multimodal de IA integrado en la app.</strong></p>
</div>

---

## ✨ ¿Qué es RAÍZ Finanzas?

**RAÍZ** es una aplicación web y móvil (PWA / iOS Capacitor) diseñada para gestionar presupuestos personales, familiares o en pareja con trazabilidad exacta de flujo de caja vs. topes mensuales planeados.

<div align="center">
  <img src="public/brand/raiz-assistant.jpeg" alt="Asistente IA RAÍZ" width="320" style="border-radius: 20px;" />
</div>

> 📖 **¿Quieres conocer la historia del proyecto?** Lee el artículo [RAÍZ Finanzas: cómo lo construí](https://www.jscalle.site/blog/raiz-finanzas) en mi portafolio: el porqué, las decisiones de diseño y lo aprendido en el camino.

### Pilares Principales
- 📊 **Disponible Real Basado en Topes Planeados**: Calcula tu liquidez libre descontando el ahorro del mes, la reserva total de tus categorías presupuestadas, cualquier exceso fuera de tope y el pago de deuda de tarjetas de crédito de meses anteriores.
- 💳 **Conciliación Inteligente de Tarjetas de Crédito**: Distingue entre el consumo real del mes (compras con débito/efectivo y tarjeta de crédito) y los pagos a tarjetas, cruzando automáticamente las compras pendientes (`CREDITO`) en orden cronológico (FIFO) cuando registras un abono a tarjeta.
- 🤖 **Asistente Multimodal con IA (Gemini) dentro de la app**:
  - Pestaña **Asistente** (y burbuja flotante) donde escribes en lenguaje natural, adjuntas **fotos de comprobantes/facturas**, **audios** o grabas una **nota de voz** (hasta 10 MB por adjunto; sin video).
  - Consulta en cualquier momento cuánto tienes disponible, el estado de tus topes o el resumen del mes.
  - Los movimientos detectados llegan como **borradores** que revisas, editas y apruebas antes de que se guarden.
  - *Opcional:* el mismo asistente puede usarse desde un bot de Telegram (ver [Paso 7](#paso-7-opcional-conectar-un-bot-de-telegram)).
- 🛡️ **Espacios Compartidos con Seguridad Zero-Trust**:
  - Cada espacio genera un código único privado (`ESP-XXXXXXXX`), y solo sus miembros pueden leer sus datos (reglas de Firestore *member-only*).
  - Aun teniendo el código del espacio, cualquier solicitud de acceso genera una **alerta en tiempo real para el propietario del espacio**, quien debe aprobar explícitamente el acceso (y puede revocarlo en un clic).

---

## 🛠️ Stack Tecnológico

- **Frontend**: React 19, TypeScript, Tailwind CSS 4, Lucide Icons, Motion, Capacitor (iOS).
- **Backend**: Node.js, Express, Esbuild (`server.ts` y carpeta `server/`).
- **Base de Datos y Autenticación**: Firebase Authentication (Google + Email/Password) y Cloud Firestore en tiempo real.
- **Inteligencia Artificial**: Google Gemini (`@google/genai` compatible tanto con **Google AI Studio API Key** como con **Google Cloud Vertex AI**).

---

## 🚀 Guía Paso a Paso para Replicar el Proyecto (Fork / Instalación Propia)

Este repositorio está **libre de credenciales, llaves o datos personales**: todo lo propio de tu instancia vive en archivos ignorados por Git (`.env`) o en tu proyecto de Firebase/Google Cloud. Sigue este instructivo para levantar tu propia instancia privada.

### Paso 1: Clonar el repositorio e instalar dependencias

**Requisitos previos:** Node.js 20+, [pnpm](https://pnpm.io/installation) (el repo trae `pnpm-lock.yaml`) y una cuenta de Google / Firebase.

```bash
git clone https://github.com/jscalle/RAIZ-finanzas.git
cd RAIZ-finanzas
pnpm install
git config core.hooksPath .githooks   # activa la guardia contra secretos (ver "Protección contra publicar secretos")
```

---

### Paso 2: Crear y configurar tu proyecto en Firebase

1. Entra a [Firebase Console](https://console.firebase.google.com/) y haz clic en **Crear un proyecto**.
2. **Habilitar Authentication**:
   - En el menú lateral ve a **Build → Authentication → Sign-in method**.
   - Habilita **Correo electrónico/contraseña** y **Google**.
3. **Crear Base de Datos Firestore**:
   - Ve a **Build → Firestore Database → Crear base de datos**.
   - Elige tu ubicación preferida y comienza en modo producción.
4. **Obtener las credenciales Web**:
   - Ve a **Configuración del proyecto (⚙️) → General → Tus apps** y selecciona el ícono Web (`</>`).
   - Registra la app (ej. `raiz-web`) y copia los valores de `firebaseConfig` (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`).
5. **Vincular tu proyecto local (necesario para desplegar)**:
   - Edita `.firebaserc` y reemplaza `"your-firebase-project-id"` por el `projectId` real de tu proyecto. Si prefieres no modificar un archivo versionado, omite este paso y pasa `--project TU_PROJECT_ID` a cada comando de `firebase`.

---

### Paso 3: Configurar tus Variables de Entorno (`.env`)

1. Duplica la plantilla `.env.example` para crear tu archivo `.env` local (está protegido en `.gitignore` y nunca se subirá a GitHub):

```bash
cp .env.example .env
```

2. Abre `.env` y completa tus valores:

```env
# --- 1. Configuración de Firebase (solo para el build web) ---
VITE_FIREBASE_PROJECT_ID="tu-proyecto-id"
VITE_FIREBASE_API_KEY="tu-firebase-web-api-key"
VITE_FIREBASE_AUTH_DOMAIN="tu-proyecto-id.firebaseapp.com"
VITE_FIREBASE_STORAGE_BUCKET="tu-proyecto-id.appspot.com"
VITE_FIREBASE_MESSAGING_SENDER_ID="000000000000"
VITE_FIREBASE_APP_ID="1:000000000000:web:abcdef123456"
VITE_FIREBASE_MEASUREMENT_ID=""        # opcional (Analytics)
VITE_GOOGLE_OAUTH_CLIENT_ID=""         # opcional (builds nativos Capacitor)

# URL de tu backend en producción (déjalo vacío "" en desarrollo local)
VITE_API_BASE_URL=""

# --- 2. Backend e IA ---
# Obligatorio: proyecto de Firebase/GCP que lee y escribe el servidor.
GOOGLE_CLOUD_PROJECT="tu-proyecto-id"

# Elige UNA opción de IA:
# Opción A: API Key de Google AI Studio (https://aistudio.google.com/apikey)
GEMINI_API_KEY="tu-gemini-api-key"
# Opción B: Vertex AI en Google Cloud (Cloud Run sin API Key). Deja GEMINI_API_KEY vacío;
# usa el GOOGLE_CLOUD_PROJECT de arriba como proyecto de Vertex AI.
VERTEX_AI_LOCATION="global"

# Opcional, solo en local: JSON de una cuenta de servicio para Firebase Admin
FIREBASE_SERVICE_ACCOUNT=""

# Opcional, solo si el frontend y la API están en orígenes distintos (ver Paso 6)
CORS_ALLOWED_ORIGINS=""

# --- 3. Bot de Telegram (OPCIONAL, ver Paso 7) ---
TELEGRAM_BOT_TOKEN=""
# Obligatorio si usas el bot. Genéralo con: openssl rand -hex 32
TELEGRAM_WEBHOOK_SECRET=""
```

> `GOOGLE_CLOUD_PROJECT` es obligatorio en el backend: de ahí toma el ID del proyecto de Firebase (si falta, usa `FIREBASE_PROJECT_ID` y luego `VITE_FIREBASE_PROJECT_ID`). Si no hay ninguno o el valor es una plantilla (`your-firebase-project-id` o cualquier valor que empiece por `your-`), el servidor registra un error `[config]` al arrancar y los endpoints que usan Firebase responden 503.

---

### Paso 4: Desplegar las Reglas de Seguridad de Firestore

Las reglas Zero-Trust para espacios compartidos están en [`firestore.rules`](firestore.rules). Para publicarlas en tu proyecto:

```bash
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules --project TU_PROJECT_ID
```

---

### Paso 5: Ejecutar en Desarrollo Local

Inicia el servidor Express + Vite en modo desarrollo:

```bash
pnpm run dev
```

Abre `http://localhost:3000` en tu navegador.
- Puedes usar la app de inmediato en modo local, o iniciar sesión desde **Ajustes → Nube y Compartir** (en móvil: **Más → Nube y Compartir**) para crear tu **Espacio en la Nube**.
- El **Asistente** necesita el backend con tu `GEMINI_API_KEY` (o Vertex AI) configurado; `pnpm run dev` ya lo levanta junto al frontend.

---

### Paso 6: Desplegar a producción (Cloud Run + Firebase Hosting)

El backend es necesario para el Asistente. El frontend va en Firebase Hosting y la API en Cloud Run, así que viven en **orígenes distintos** y la API debe permitir el tuyo.

1. **Requisitos**: [Google Cloud SDK (`gcloud`)](https://cloud.google.com/sdk/docs/install) y habilitadas las APIs de Cloud Run, Cloud Build y Vertex AI (o usa `GEMINI_API_KEY`).
2. **Desplegar el backend en Cloud Run**:

```bash
gcloud run deploy raiz-finanzas-api \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --project TU_PROJECT_ID \
  --set-env-vars GOOGLE_CLOUD_PROJECT="TU_PROJECT_ID",VITE_FIREBASE_PROJECT_ID="TU_PROJECT_ID",GEMINI_API_KEY="TU_GEMINI_API_KEY"
```

3. **Permitir el origen de tu frontend (CORS)**. Usa los orígenes exactos (esquema + host, sin `*` ni rutas):

```bash
gcloud run services update raiz-finanzas-api \
  --region us-central1 \
  --project TU_PROJECT_ID \
  --update-env-vars "^@^CORS_ALLOWED_ORIGINS=https://TU_PROJECT_ID.web.app,https://TU_PROJECT_ID.firebaseapp.com"
```

4. **Apuntar el frontend a la API**: Cloud Run te da una URL como `https://raiz-finanzas-api-xxxxx.us-central1.run.app`. Colócala en `VITE_API_BASE_URL` de tu `.env`.
5. **Desplegar la Web App en Firebase Hosting**:

```bash
pnpm run build
npx firebase-tools deploy --only hosting --project TU_PROJECT_ID
```

6. En la consola de Firebase, agrega tu dominio de Hosting a **Authentication → Settings → Authorized domains** si usas un dominio propio.

Más detalle (variables, CORS, limpieza de variables antiguas y un **entorno QA aislado** con su script guardado) en [`DEPLOYMENT.md`](DEPLOYMENT.md).

---

### Paso 7 (Opcional): Conectar un bot de Telegram

El Asistente ya funciona dentro de la app; el bot es un canal adicional.

1. **Crear el Bot**: en Telegram busca a **[@BotFather](https://t.me/BotFather)**, envía `/newbot`, asigna un nombre y un usuario terminado en `bot`, y copia el **HTTP API Token** en `TELEGRAM_BOT_TOKEN`.
2. **Secreto del webhook**: genera uno con `openssl rand -hex 32` (solo letras, números, `_` y `-`) y colócalo en `TELEGRAM_WEBHOOK_SECRET`. Sin él, el backend rechaza todos los mensajes del bot.
3. **Cargar ambas variables en Cloud Run**:

```bash
gcloud run services update raiz-finanzas-api \
  --region us-central1 \
  --project TU_PROJECT_ID \
  --update-env-vars TELEGRAM_BOT_TOKEN="TU_TELEGRAM_BOT_TOKEN",TELEGRAM_WEBHOOK_SECRET="TU_SECRETO_DEL_WEBHOOK"
```

4. **Registrar el webhook** (una sola vez), incluyendo el mismo secreto en `secret_token`:

```bash
curl -X POST "https://api.telegram.org/bot<TU_TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://<TU_URL_DE_CLOUD_RUN>/api/webhook/telegram", "secret_token": "<TU_SECRETO_DEL_WEBHOOK>"}'
```

   - Si luego cambias el secreto no tienes que repetirlo: al arrancar en Cloud Run (donde existe `K_SERVICE`), el backend consulta `getWebhookInfo` y vuelve a registrar la misma URL (y los mismos `allowed_updates`) con el secreto configurado. Fuera de Cloud Run ese re-registro se omite, así que un servidor local nunca cambia el webhook de producción.
   - Si tienes varios servicios de Cloud Run con el mismo bot, todos deben usar el mismo `TELEGRAM_WEBHOOK_SECRET`.
5. **Vincular tu cuenta con aprobación Zero-Trust**:
   - En la app ve a **Nube y Compartir** y copia el **Código Único del Espacio** (ej. `ESP-9K2F7M`).
   - En tu bot envía:
     ```text
     /conectar ESP-9K2F7M
     ```
   - En la app aparecerá una alerta de **Solicitud de Acceso Pendiente** con tu nombre y tu ID de Telegram. Haz clic en **Aceptar** y el bot te confirmará que quedó autorizado.

---

## 🧪 Scripts Disponibles

| Comando | Descripción |
| :--- | :--- |
| `pnpm run dev` | Inicia el servidor de desarrollo (Frontend Vite + Backend Express) en el puerto `3000`. |
| `pnpm run build` | Compila la aplicación web en `dist/` y empaqueta el servidor en `dist/server.cjs`. |
| `pnpm start` | Ejecuta el servidor compilado en producción (`node dist/server.cjs`). |
| `pnpm run test:run` | Ejecuta la suite de pruebas automatizadas con Vitest (sin las pruebas de reglas de Firestore). |
| `pnpm run test:rules` | Prueba `firestore.rules` contra el emulador local de Firestore (`firebase emulators:exec`, proyecto `demo-raiz`). Requiere Firebase CLI y Java (ver abajo). |
| `pnpm run typecheck` | Verifica los tipos de TypeScript sin emitir archivos. |
| `pnpm run lint` | Ejecuta ESLint sobre `src`. |
| `scripts/check-public-safety.sh --all` | Audita el repositorio en busca de secretos y datos personales antes de publicar. |

**Pruebas de reglas de Firestore (`test:rules`)**: el emulador de Firestore necesita Java (JDK 21) en el `PATH`. En macOS con Homebrew:

```bash
brew install openjdk@21
export PATH="$(brew --prefix openjdk@21)/bin:$PATH"
pnpm run test:rules
```

Las pruebas viven en `tests/rules/` y usan `@firebase/rules-unit-testing`; no se conectan a ningún proyecto real.

### 🔒 Protección contra publicar secretos

El repositorio incluye hooks de Git que bloquean commits y pushes con credenciales, archivos `.env`, Team IDs de Apple, rutas locales o emails personales. Actívalos una vez por clon:

```bash
git config core.hooksPath .githooks
```

Usa el email *noreply* de GitHub en tus commits. Para iOS, define tu `DEVELOPMENT_TEAM` en `ios/signing.local.xcconfig` (ignorado por Git) en lugar de guardarlo en el proyecto de Xcode. Si necesitas bloquear datos propios (nombre, correo, dominio), agrégalos a `.git/info/public-safety-denylist`: es local y nunca se versiona.

---

## 📚 Más documentación

- [`DEPLOYMENT.md`](DEPLOYMENT.md): despliegue, CORS y entorno QA aislado.
- [`public/guia.html`](public/guia.html): guía de uso para las personas que usan la app.
- [`public/privacidad.html`](public/privacidad.html): política de privacidad base (ajústala a tu instancia).
- 📖 [Artículo del proyecto en el blog](https://www.jscalle.site/blog/raiz-finanzas).

---

## 📄 Licencia

Distribuido bajo licencia MIT. Puedes hacer fork, adaptar y desplegar tu propia instancia libremente.
