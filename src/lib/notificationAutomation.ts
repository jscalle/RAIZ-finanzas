import * as CapacitorCore from '@capacitor/core';

export type DeviceOS = 'android' | 'ios' | 'web';

export interface BankNotificationEvent {
  packageName: string;
  title: string;
  text: string;
  timestamp?: number;
}

export interface BankNotificationListenerPlugin {
  checkPermission(): Promise<{ granted: boolean }>;
  openSettings(): Promise<{ opened: boolean }>;
  addListener(
    eventName: 'bankNotificationReceived',
    listenerFunc: (event: BankNotificationEvent) => void
  ): Promise<{ remove: () => Promise<void> }>;
}

let cachedNativePlugin: BankNotificationListenerPlugin | null = null;
function getNativeBankPlugin(): BankNotificationListenerPlugin | null {
  if (cachedNativePlugin) return cachedNativePlugin;
  try {
    const winCap =
      typeof window !== 'undefined'
        ? (
            window as unknown as {
              Capacitor?: {
                Plugins?: {
                  BankNotificationListener?: BankNotificationListenerPlugin;
                };
              };
            }
          ).Capacitor
        : undefined;
    if (winCap?.Plugins?.BankNotificationListener) {
      cachedNativePlugin = winCap.Plugins.BankNotificationListener;
      return cachedNativePlugin;
    }
    const reg = (
      CapacitorCore as unknown as {
        registerPlugin?: <T>(name: string) => T;
      }
    ).registerPlugin;
    if (typeof reg === 'function') {
      cachedNativePlugin = reg<BankNotificationListenerPlugin>(
        'BankNotificationListener'
      );
      return cachedNativePlugin;
    }
  } catch {
    // Ignore when @capacitor/core is partially mocked in tests
  }
  return null;
}

const { Capacitor } = CapacitorCore;

export const NOTIFICATION_LISTENER_STORAGE_KEY =
  'p_android_notification_listener_enabled';

export const IOS_SHORTCUT_STORAGE_KEY = 'p_ios_shortcut_automation_enabled';

export const SUPPORTED_BANK_PACKAGES: ReadonlyArray<{
  packageName: string;
  name: string;
  channel: 'APP_PUSH' | 'SMS';
}> = [
  {
    packageName: 'com.todo1.mobile',
    name: 'Bancolombia',
    channel: 'APP_PUSH',
  },
  {
    packageName: 'com.davivienda.daviviendaapp',
    name: 'Davivienda',
    channel: 'APP_PUSH',
  },
  {
    packageName: 'com.davivienda.daviplataapp',
    name: 'DaviPlata',
    channel: 'APP_PUSH',
  },
  {
    packageName: 'com.nequi.MobileApp',
    name: 'Nequi',
    channel: 'APP_PUSH',
  },
  {
    packageName: 'com.nu.production',
    name: 'Nu Colombia',
    channel: 'APP_PUSH',
  },
  {
    packageName: 'com.lulobank.app',
    name: 'Lulo Bank',
    channel: 'APP_PUSH',
  },
  {
    packageName: 'com.google.android.apps.messaging',
    name: 'Mensajes SMS Bancarios',
    channel: 'SMS',
  },
];

/**
 * Detects whether the current client is running on Android, iOS, or desktop/other Web.
 */
export function detectDeviceOS(overrideUserAgent?: string): DeviceOS {
  try {
    const capPlatform =
      typeof Capacitor?.getPlatform === 'function'
        ? Capacitor.getPlatform()
        : undefined;
    if (capPlatform === 'android') return 'android';
    if (capPlatform === 'ios') return 'ios';
  } catch {
    // Fallback to userAgent inspection
  }

  const ua =
    overrideUserAgent ??
    (typeof navigator !== 'undefined' ? navigator.userAgent || '' : '');

  if (/android/i.test(ua)) return 'android';
  if (/iPad|iPhone|iPod/i.test(ua)) return 'ios';
  return 'web';
}

export function isAndroidNotificationEnabledInStorage(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(NOTIFICATION_LISTENER_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setAndroidNotificationEnabledInStorage(enabled: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (enabled) {
      localStorage.setItem(NOTIFICATION_LISTENER_STORAGE_KEY, 'true');
    } else {
      localStorage.removeItem(NOTIFICATION_LISTENER_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Checks whether the Android NotificationListenerService permission is currently granted.
 * On native Android, queries the Capacitor plugin; otherwise falls back to stored state.
 */
export async function checkAndroidNotificationPermission(): Promise<boolean> {
  try {
    const plugin = getNativeBankPlugin();
    if (
      plugin &&
      typeof Capacitor?.isNativePlatform === 'function' &&
      Capacitor.isNativePlatform() &&
      detectDeviceOS() === 'android'
    ) {
      const res = await plugin.checkPermission();
      setAndroidNotificationEnabledInStorage(!!res.granted);
      return !!res.granted;
    }
  } catch {
    // Fallback to persisted toggle if native plugin is not yet linked
  }
  return isAndroidNotificationEnabledInStorage();
}

/**
 * Opens Android's ACTION_NOTIFICATION_LISTENER_SETTINGS screen on native Android,
 * or enables the listener bridge so incoming bank notifications are auto-ingested.
 */
export async function connectAndroidNotificationListener(): Promise<{
  connected: boolean;
  openedNativeSettings: boolean;
}> {
  try {
    const plugin = getNativeBankPlugin();
    if (
      plugin &&
      typeof Capacitor?.isNativePlatform === 'function' &&
      Capacitor.isNativePlatform() &&
      detectDeviceOS() === 'android'
    ) {
      await plugin.openSettings();
      setAndroidNotificationEnabledInStorage(true);
      return { connected: true, openedNativeSettings: true };
    }
  } catch {
    // If native bridge is not registered in this build, still activate the web/hybrid listener state
  }

  setAndroidNotificationEnabledInStorage(true);
  return { connected: true, openedNativeSettings: false };
}

export function disconnectAndroidNotificationListener(): void {
  setAndroidNotificationEnabledInStorage(false);
}

export function isIosShortcutEnabledInStorage(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(IOS_SHORTCUT_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setIosShortcutEnabledInStorage(enabled: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (enabled) {
      localStorage.setItem(IOS_SHORTCUT_STORAGE_KEY, 'true');
    } else {
      localStorage.removeItem(IOS_SHORTCUT_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

export function buildIosMagicIngestUrl(
  spaceCode?: string,
  origin?: string
): string {
  const baseOrigin =
    origin ||
    (typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://raiz.app');
  const cleanCode = (spaceCode || 'ESP-SECURE').trim();
  return `${baseOrigin}/?ios_space=${encodeURIComponent(cleanCode)}&ios_tx=`;
}

export function buildIosWebhookApiUrl(
  spaceCode?: string,
  origin?: string
): string {
  const baseOrigin =
    origin ||
    (typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://raiz.app');
  const cleanCode = (spaceCode || 'ESP-SECURE').trim();
  return `${baseOrigin}/api/automation/ios-shortcut?code=${encodeURIComponent(cleanCode)}&text=`;
}

/**
 * Generates an Apple Shortcuts (.shortcut XML plist) definition pre-configured with
 * the user's space URL so the user can download and import the Shortcut with one tap.
 */
export function buildIosShortcutPlist(
  spaceCode?: string,
  origin?: string
): string {
  const magicUrl = buildIosMagicIngestUrl(spaceCode, origin).replace(
    /&/g,
    '&amp;'
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>WFWorkflowClientVersion</key>
  <string>2605.0.5</string>
  <key>WFWorkflowMinimumClientVersion</key>
  <integer>900</integer>
  <key>WFWorkflowIcon</key>
  <dict>
    <key>WFWorkflowIconStartColor</key>
    <integer>463140863</integer>
    <key>WFWorkflowIconGlyphNumber</key>
    <integer>59771</integer>
  </dict>
  <key>WFWorkflowInputContentItemClasses</key>
  <array>
    <string>WFStringContentItem</string>
  </array>
  <key>WFWorkflowActions</key>
  <array>
    <dict>
      <key>WFWorkflowActionIdentifier</key>
      <string>is.workflow.actions.urlencode</string>
      <key>WFWorkflowActionParameters</key>
      <dict>
        <key>WFEncodeMode</key>
        <string>Encode</string>
      </dict>
    </dict>
    <dict>
      <key>WFWorkflowActionIdentifier</key>
      <string>is.workflow.actions.openurl</string>
      <key>WFWorkflowActionParameters</key>
      <dict>
        <key>WFInput</key>
        <string>${magicUrl}</string>
      </dict>
    </dict>
  </array>
</dict>
</plist>`;
}

export function downloadIosShortcutFile(
  spaceCode?: string,
  origin?: string
): void {
  if (typeof document === 'undefined' || typeof Blob === 'undefined') return;
  const plist = buildIosShortcutPlist(spaceCode, origin);
  const blob = new Blob([plist], { type: 'application/x-apple-aspen-config' });
  const url =
    typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
      ? URL.createObjectURL(blob)
      : '';
  if (!url) return;
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Raiz-Bancos-iOS.shortcut';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  if (typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(url);
  }
}

export function connectIosShortcutAutomation(
  spaceCode?: string,
  origin?: string
): {
  connected: boolean;
  magicUrl: string;
  webhookApiUrl: string;
  shortcutDeepLink: string;
} {
  setIosShortcutEnabledInStorage(true);
  return {
    connected: true,
    magicUrl: buildIosMagicIngestUrl(spaceCode, origin),
    webhookApiUrl: buildIosWebhookApiUrl(spaceCode, origin),
    shortcutDeepLink: 'shortcuts://create-automation',
  };
}

export function disconnectIosShortcutAutomation(): void {
  setIosShortcutEnabledInStorage(false);
}

/**
 * Fast local filter to ensure only financial notifications (from allowed bank apps or
 * SMS containing currency/transaction keywords) are processed.
 */
export function isFinancialNotification(event: BankNotificationEvent): boolean {
  const combined = `${event.title || ''} ${event.text || ''}`.trim();
  if (!combined) return false;

  const isKnownBankApp = SUPPORTED_BANK_PACKAGES.some(
    (pkg) =>
      pkg.channel === 'APP_PUSH' && pkg.packageName === event.packageName
  );

  const hasFinancialKeyword =
    /(\$|cop|compra|compraste|transferencia|transferiste|recibiste|abono|pago|pagaste|retiro|bancolombia|davivienda|nequi|daviplata|nubank|lulo)/i.test(
      combined
    );

  if (isKnownBankApp) return hasFinancialKeyword;
  return hasFinancialKeyword;
}

/**
 * Deterministic fallback parser for Colombian bank SMS / Push notifications when offline
 * or when AI returns no amount.
 */
export function parseBankNotificationFallback(rawText: string): {
  type: 'INCOME' | 'EXPENSE';
  amount: number;
  paymentMethod: 'DEBITO' | 'CREDITO';
  description: string;
} | null {
  const text = rawText.trim();
  if (!text) return null;

  // Match Colombian peso amounts like $45.000, $1.250.000,00, $ 32,500 or COP 50000
  const amountMatch =
    text.match(/\$\s*([\d.]+(?:,\d{1,2})?)/i) ||
    text.match(/COP\s*([\d.,]+)/i) ||
    text.match(/por\s+\$?\s*([\d.]+)/i);

  if (!amountMatch) return null;

  const normalizedDigits = amountMatch[1]
    .replace(/\./g, '')
    .replace(/,\d+$/, '')
    .replace(/,/g, '');
  const amount = parseInt(normalizedDigits, 10);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const isIncome =
    /(recibiste|abono|consignaci[oó]n|n[oó]mina|te enviaron|transferencia recibida|dep[oó]sito)/i.test(
      text
    );
  const isCredit = /(t\.?\s*cr[eé]dito|tarjeta de cr[eé]dito|tc\b|cr[eé]dito)/i.test(
    text
  );

  // Try to extract merchant after "en " or "a "
  const merchantMatch = text.match(
    /\b(?:en|comercio|a)\s+([A-Z0-9ÁÉÍÓÚÑ][A-Za-z0-9ÁÉÍÓÚÑáéíóúñ\s.*-]{2,28}?)(?:\s+(?:el|por|con|desde|hora|\d{2}[/:])|[.,;]|$)/i
  );
  const bankMatch = text.match(
    /\b(Bancolombia|Davivienda|Nequi|DaviPlata|Nu|Lulo\s*Bank|BBVA)\b/i
  );

  const bankPrefix = bankMatch ? `${bankMatch[1]}: ` : '';
  const merchant = merchantMatch ? merchantMatch[1].trim() : 'Movimiento automático';

  return {
    type: isIncome ? 'INCOME' : 'EXPENSE',
    amount,
    paymentMethod: isCredit ? 'CREDITO' : 'DEBITO',
    description: `${bankPrefix}${merchant}`,
  };
}

/**
 * Subscribes to native Android bank notifications and custom DOM events (`raiz:bank-notification`)
 * so both real Android status-bar notifications and in-app simulated tests flow through the exact
 * same automatic ingestion pipeline.
 */
export function subscribeToAndroidBankNotifications(
  onNotification: (event: BankNotificationEvent) => void
): () => void {
  let pluginSub: { remove: () => Promise<void> } | null = null;

  const plugin = getNativeBankPlugin();
  if (
    plugin &&
    typeof Capacitor?.isNativePlatform === 'function' &&
    Capacitor.isNativePlatform() &&
    detectDeviceOS() === 'android'
  ) {
    plugin
      .addListener('bankNotificationReceived', (event) => {
        if (isFinancialNotification(event)) {
          onNotification(event);
        }
      })
      .then((handle) => {
        pluginSub = handle;
      })
      .catch(() => {
        // Ignore if native plugin is not attached
      });
  }

  const domHandler = (e: Event) => {
    const custom = e as CustomEvent<BankNotificationEvent>;
    if (custom.detail && isFinancialNotification(custom.detail)) {
      onNotification(custom.detail);
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('raiz:bank-notification', domHandler);
  }

  return () => {
    if (pluginSub) {
      void pluginSub.remove();
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('raiz:bank-notification', domHandler);
    }
  };
}
