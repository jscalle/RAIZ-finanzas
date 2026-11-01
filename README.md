<div align="center">
  <img src="public/brand/raiz-logo.jpeg" alt="RAÍZ Finanzas Logo" width="260" style="border-radius: 24px;" />
  <h1>🌱 RAÍZ — Finanzas con Base Firme</h1>
  <p><strong>Plataforma inteligente de finanzas personales y en pareja con sincronización en tiempo real, seguridad Zero-Trust y asistente multimodal de IA en Telegram.</strong></p>
</div>

---

## ✨ ¿Qué es RAÍZ Finanzas?

**RAÍZ** es una aplicación web y móvil (PWA / iOS Capacitor) diseñada para gestionar presupuestos personales, familiares o en pareja con trazabilidad exacta de flujo de caja vs. topes mensuales planeados.

<div align="center">
  <img src="public/brand/raiz-assistant.jpeg" alt="Asistente IA RAÍZ" width="320" style="border-radius: 20px;" />
</div>

### Pilares Principales
- 📊 **Disponible Real Basado en Topes Planeados**: Calcula tu liquidez libre descontando el ahorro del mes, la reserva total de tus categorías presupuestadas, cualquier exceso fuera de tope y el pago de deuda de tarjetas de crédito de meses anteriores.
- 💳 **Conciliación Inteligente de Tarjetas de Crédito**: Distingue entre el consumo real del mes (compras con débito/efectivo y tarjeta de crédito) y los pagos a tarjetas, cruzando automáticamente las compras pendientes (`CREDITO`) en orden cronológico (FIFO) cuando registras un abono a tarjeta.
- 🤖 **Asistente Multimodal con IA en Telegram (Gemini)**:
  - Envía **notas de voz (audios)**, **fotos de comprobantes/facturas** o **mensajes de texto** en lenguaje natural.
  - Consulta en cualquier momento cuánto tienes disponible, el estado de tus topes o el resumen del mes.
  - Edita o aprueba borradores desde las tarjetas interactivas de Telegram o desde el banner de la Web App con sincronización bidireccional instantánea.
- 🛡️ **Espacios Compartidos con Seguridad Zero-Trust**:
  - Cada espacio genera un código único privado (`ESP-XXXXXXXX`), y solo sus miembros pueden leer sus datos.
  - Aun teniendo el código del espacio, cualquier intento de conexión desde la Web o desde Telegram (`/conectar ESP-XXXXXXXX`) genera una **alerta en tiempo real para el propietario del espacio**, quien debe aprobar explícitamente el acceso (y puede revocarlo en un clic).
- 📬 **Sincronización con Gmail**: Lectura opcional de alertas bancarias en Gmail.

---

## 🛠️ Stack Tecnológico

- **Frontend**: React 19, TypeScript, Tailwind CSS 4, Lucide Icons, Motion, Capacitor (iOS).
- **Backend**: Node.js, Express, Esbuild (`server.ts`).
- **Base de Datos y Autenticación**: Firebase Authentication (Google + Email/Password) y Cloud Firestore en tiempo real.
- **Inteligencia Artificial**: Google Gemini (`@google/genai` compatible tanto con **Google AI Studio API Key** como con **Google Cloud Vertex AI**).

---

## 🚀 Guía Paso a Paso para Replicar el Proyecto (Fork / Instalación Propia)

Este repositorio está **100% libre de credenciales, llaves o datos personales**. Sigue este instructivo paso a paso para levantar tu propia instancia privada en menos de 15 minutos.

### Paso 1: Clonar el repositorio e instalar dependencias

**Requisitos previos:** Node.js 20+ y una cuenta de Google / Firebase.

```bash
git clone https://github.com/jscalle/RAIZ-finanzas.git
cd RAIZ-finanzas
npm install
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
5. **Vincular tu proyecto local (Opcional para despliegue)**:
   - Edita el archivo `.firebaserc` en la raíz del proyecto y reemplaza `"your-firebase-project-id"` por el `projectId` real de tu proyecto Firebase.

---

### Paso 3: Configurar tus Variables de Entorno (`.env`)

1. Duplica el archivo de plantilla `.env.example` para crear tu archivo `.env` local (el archivo `.env` está protegido en `.gitignore` y nunca se subirá a GitHub):

```bash
cp .env.example .env
```

2. Abre `.env` y completa tus credenciales:

```env
# --- 1. Configuración de Firebase (Frontend + Sincronización) ---
VITE_FIREBASE_PROJECT_ID="tu-proyecto-id"
VITE_FIREBASE_API_KEY="tu-firebase-web-api-key"
VITE_FIREBASE_AUTH_DOMAIN="tu-proyecto-id.firebaseapp.com"
VITE_FIREBASE_STORAGE_BUCKET="tu-proyecto-id.appspot.com"
VITE_FIREBASE_MESSAGING_SENDER_ID="000000000000"
VITE_FIREBASE_APP_ID="1:000000000000:web:abcdef123456"

# URL de tu backend en producción (déjalo vacío "" en desarrollo local)
VITE_API_BASE_URL=""

# --- 2. Configuración de IA (Elige Opción A u Opción B) ---
# Opción A: Usar API Key gratuita/directa de Google AI Studio (https://aistudio.google.com/apikey)
GEMINI_API_KEY="tu-gemini-api-key"

# Opción B: O usar Vertex AI en Google Cloud (si despliegas en Cloud Run sin API Key)
GOOGLE_CLOUD_PROJECT="tu-proyecto-id"
VERTEX_AI_LOCATION="global"

# --- 3. Bot de Telegram (Opcional para el Asistente de Chat/Voz/Fotos) ---
TELEGRAM_BOT_TOKEN="0000000000:AAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
# Secreto del webhook (obligatorio si usas el bot). Genéralo con: openssl rand -hex 32
# Telegram lo envía en cada update y el backend rechaza (401) los que no lo traen.
TELEGRAM_WEBHOOK_SECRET="tu-secreto-aleatorio-del-webhook"
```

---

### Paso 4: Desplegar las Reglas de Seguridad de Firestore

Las reglas de seguridad Zero-Trust para espacios compartidos se encuentran en [`firestore.rules`](firestore.rules). Para publicarlas en tu proyecto Firebase:

```bash
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules --project TU_PROJECT_ID
```

---

### Paso 5: Ejecutar en Desarrollo Local

Para iniciar simultáneamente el servidor Express + Vite en modo desarrollo:

```bash
npm run dev
```

Abre `http://localhost:3000` en tu navegador.
- Puedes usar la app inmediatamente en modo local o ir a la pestaña **Nube y Compartir** para registrarte/iniciar sesión y crear tu **Espacio en la Nube**.

---

### Paso 6: Configurar tu Propio Bot de Telegram (Asistente IA)

Si deseas habilitar el asistente financiero por chat, notas de voz y fotos en Telegram:

1. **Crear el Bot en Telegram**:
   - Abre Telegram y busca a **[@BotFather](https://t.me/BotFather)**.
   - Envía el comando `/newbot`, asigna un nombre (ej. `Mi Asistente Raíz`) y un usuario terminado en `bot`.
   - Copia el **HTTP API Token** que te entrega `@BotFather` y colócalo en `TELEGRAM_BOT_TOKEN` dentro de tu `.env` (y en tus variables de entorno de Cloud Run).
   - Genera un secreto para el webhook (`openssl rand -hex 32`; solo letras, números, `_` y `-`) y colócalo en `TELEGRAM_WEBHOOK_SECRET`. Sin él, el backend rechaza todos los mensajes del bot.
2. **Desplegar el Backend en Google Cloud Run**:
   - Asegúrate de tener instalado [Google Cloud SDK (`gcloud`)](https://cloud.google.com/sdk/docs/install) y habilitadas las APIs de Cloud Run, Cloud Build y Vertex AI (o usa `GEMINI_API_KEY`).
   - Despliega el servicio ejecutando:

```bash
gcloud run deploy raiz-finanzas-api \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --project TU_PROJECT_ID \
  --set-env-vars GOOGLE_CLOUD_PROJECT="TU_PROJECT_ID",VITE_FIREBASE_PROJECT_ID="TU_PROJECT_ID",TELEGRAM_BOT_TOKEN="TU_TELEGRAM_BOT_TOKEN",TELEGRAM_WEBHOOK_SECRET="TU_SECRETO_DEL_WEBHOOK",GEMINI_API_KEY="TU_GEMINI_API_KEY"
```

   - `GOOGLE_CLOUD_PROJECT` es obligatorio en el backend: de ahí toma el ID del proyecto de Firebase (si falta, usa `FIREBASE_PROJECT_ID` y luego `VITE_FIREBASE_PROJECT_ID`). Si no hay ninguno o el valor es una plantilla (`your-firebase-project-id` o cualquier valor que empiece por `your-`), el servidor registra un error `[config]` al arrancar y los endpoints que usan Firebase responden 503.

3. **Conectar el Webhook de Telegram a tu URL de Cloud Run**:
   - Una vez desplegado, Cloud Run te dará una URL como `https://raiz-finanzas-api-xxxxx.us-central1.run.app`.
   - Coloca esa URL en `VITE_API_BASE_URL` en tu `.env` y registra el webhook en Telegram (una sola vez) incluyendo el mismo secreto en `secret_token`:

```bash
curl -X POST "https://api.telegram.org/bot<TU_TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://<TU_URL_DE_CLOUD_RUN>/api/webhook/telegram", "secret_token": "<TU_SECRETO_DEL_WEBHOOK>"}'
```

   - Si el webhook ya estaba registrado, no tienes que repetir este paso al cambiar el secreto: al arrancar en Cloud Run (donde existe `K_SERVICE`), el backend consulta `getWebhookInfo` y vuelve a registrar la misma URL (y los mismos `allowed_updates`) con el `TELEGRAM_WEBHOOK_SECRET` configurado.
   - Fuera de Cloud Run (por ejemplo, un servidor local) ese re-registro se omite y queda en el log, así que un servidor local nunca cambia el webhook de producción. Si tienes varios servicios de Cloud Run con el mismo bot, todos deben usar el mismo `TELEGRAM_WEBHOOK_SECRET`.

4. **Desplegar la Web App en Firebase Hosting**:

```bash
npm run build
npx firebase-tools deploy --only hosting --project TU_PROJECT_ID
```

5. **Vincular tu cuenta de Telegram con aprobación Zero-Trust**:
   - Entra a tu aplicación web desplegada → **Nube y Compartir** y copia el **Código Único del Espacio** (ej. `ESP-9K2F7M`).
   - En tu bot de Telegram, envía:
     ```text
     /conectar ESP-9K2F7M
     ```
   - En la aplicación web aparecerá inmediatamente una alerta amarilla de **Solicitud de Acceso Pendiente** mostrando tu nombre y tu ID de Telegram.
   - Haz clic en **Aceptar** en la Web. ¡El bot te confirmará al instante que tu cuenta quedó autorizada y sincronizada!

---

## 🧪 Scripts Disponibles

| Comando | Descripción |
| :--- | :--- |
| `npm run dev` | Inicia el servidor de desarrollo (Frontend Vite + Backend Express) en el puerto `3000`. |
| `npm run build` | Compila la aplicación web en `dist/` y empaqueta el servidor en `dist/server.cjs`. |
| `npm start` | Ejecuta el servidor compilado en producción (`node dist/server.cjs`). |
| `npm run test:run` | Ejecuta la suite de pruebas automatizadas con Vitest (sin las pruebas de reglas de Firestore). |
| `npm run test:rules` | Prueba `firestore.rules` contra el emulador local de Firestore (`firebase emulators:exec`, proyecto `demo-raiz`). Requiere Firebase CLI y Java (ver abajo). |
| `npm run typecheck` | Verifica los tipos de TypeScript sin emitir archivos. |
| `scripts/check-public-safety.sh --all` | Audita el repositorio en busca de secretos y datos personales antes de publicar. |

**Pruebas de reglas de Firestore (`test:rules`)**: el emulador de Firestore necesita Java (JDK 21) en el `PATH`. En macOS con Homebrew:

```bash
brew install openjdk@21
export PATH="$(brew --prefix openjdk@21)/bin:$PATH"
npm run test:rules
```

Las pruebas viven en `tests/rules/` y usan `@firebase/rules-unit-testing`; no se conectan a ningún proyecto real.

### 🔒 Protección contra publicar secretos

El repositorio incluye hooks de Git que bloquean commits y pushes con credenciales, archivos `.env`, Team IDs de Apple, rutas locales o emails personales. Actívalos una vez por clon:

```bash
git config core.hooksPath .githooks
```

Usa el email *noreply* de GitHub en tus commits. Para iOS, define tu `DEVELOPMENT_TEAM` en `ios/signing.local.xcconfig` (ignorado por Git) en lugar de guardarlo en el proyecto de Xcode.

---

## 📄 Licencia

Distribuido bajo licencia MIT. Puedes hacer fork, adaptar y desplegar tu propia instancia libremente.
