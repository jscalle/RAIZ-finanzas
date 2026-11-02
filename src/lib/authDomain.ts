export interface LocationLike {
  protocol: string;
  hostname: string;
  host: string;
}

// Firebase Hosting serves the auth handler (/__/auth/*) on every domain attached
// to the site, including custom ones. Using the page's own host as `authDomain`
// keeps `signInWithRedirect` same-origin: with a different authDomain the
// redirect result is stored on another origin, and browsers that partition
// third-party storage (in-app browsers, Chrome custom tabs, Safari) never hand
// it back, so the user returns signed out.
//
// Every host used this way must have `https://<host>/__/auth/handler` listed as
// an authorized redirect URI in the Google OAuth web client, and be listed in
// Firebase Authentication > Authorized domains.
const isLoopback = (hostname: string): boolean =>
  hostname === 'localhost' ||
  hostname.endsWith('.localhost') ||
  hostname.startsWith('[') ||
  /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);

export function resolveAuthDomain(
  configured: string,
  location?: LocationLike | null,
  isNativePlatform = false
): string {
  if (isNativePlatform || !location) return configured;
  if (location.protocol !== 'https:' || isLoopback(location.hostname)) {
    return configured;
  }
  return location.host;
}
