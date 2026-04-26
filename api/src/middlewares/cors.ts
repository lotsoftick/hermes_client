import cors from 'cors';

/**
 * CORS policy for the Hermes Client API.
 *
 * This is a single-user local desktop app (not a public multi-tenant
 * service). Auth is JWT-bearer in the `Authorization` header — no
 * cookies, so CSRF surface is essentially zero — and the whole point of
 * exposing it on `0.0.0.0` is so the user can reach it from their other
 * devices on the same LAN or over Tailscale. A strict origin allowlist
 * is therefore the wrong default: it breaks every legitimate access
 * pattern beyond "browser open on the install host" while protecting
 * nothing of value.
 *
 * Policy:
 *   - In `development`, allow every origin (was already the case).
 *   - In production, allow every origin **by default** so installs
 *     accessed via Tailscale/LAN/IP just work.
 *   - If `ALLOWED_DOMAIN` is set (comma-separated), it acts as an
 *     allowlist *augmenting* the permissive default — and if
 *     `HERMES_STRICT_CORS=1` is also set, the allowlist becomes the
 *     final word and everything else is rejected.
 *
 * Operators who want the old strict behaviour:
 *   `ALLOWED_DOMAIN=https://hermes.example.com HERMES_STRICT_CORS=1`
 */
const STRICT = ['1', 'true', 'yes'].includes(
  String(process.env.HERMES_STRICT_CORS || '').toLowerCase()
);

const ALLOWLIST = (process.env.ALLOWED_DOMAIN || '')
  .split(',')
  .map((d) => d.trim())
  .filter(Boolean);

export default cors({
  exposedHeaders: 'access-token',
  origin: (origin, next) => {
    // Same-origin / non-browser callers (curl, server-to-server) don't
    // send Origin and shouldn't be blocked.
    if (!origin) return next(null, true);

    if (process.env.NODE_ENV === 'development') return next(null, true);

    if (ALLOWLIST.includes(origin)) return next(null, true);

    if (STRICT) {
      return next(
        new Error(
          `CORS policy: origin ${origin} is not in ALLOWED_DOMAIN and HERMES_STRICT_CORS is on.`
        ),
        false
      );
    }

    return next(null, true);
  },
});
