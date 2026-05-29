// Vercel Edge Middleware — simple shared-password gate with cookie TTL.
//
// Set SITE_PASSWORD in Vercel → Project → Settings → Environment Variables.
// Optionally set AUTH_TTL_HOURS (default 168 = 7 days). Optionally set AUTH_SECRET
// (defaults to SITE_PASSWORD itself, which is fine for a single-tenant tool).
//
// Behaviour:
//   * No SITE_PASSWORD configured → middleware no-ops (handy for local/dev).
//   * Authenticated visit → request flows through to the static app.
//   * Unauthenticated visit → returns a small inline sign-in page (401).
//   * POST to /__auth with the correct password → sets a signed cookie and
//     redirects back to the requested URL. Cookie is HttpOnly + Secure +
//     SameSite=Lax + Max-Age = TTL hours.

export const config = {
  // Run on everything except Vercel internals + favicon (we want the
  // favicon to load on the login page).
  matcher: '/((?!_vercel|favicon\\.).*)',
};

const DEFAULT_TTL_HOURS = 168;   // 7 days

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach(part => {
    const [k, ...rest] = part.trim().split('=');
    if (k) out[k] = decodeURIComponent(rest.join('='));
  });
  return out;
}

async function verifyCookie(value, secret) {
  if (!value) return false;
  const dot = value.lastIndexOf('.');
  if (dot < 0) return false;
  const expStr = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const exp = parseInt(expStr, 10);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const expected = await hmacHex(secret, expStr);
  // Constant-time-ish compare
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

async function makeCookie(secret, ttlSec) {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const sig = await hmacHex(secret, String(exp));
  return `${exp}.${sig}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

function loginHtml(nextUrl, errorMsg, ttlHours) {
  const next = escapeHtml(nextUrl || '/');
  const err = errorMsg ? `<div class="err">${escapeHtml(errorMsg)}</div>` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bamboo SKU Intelligence · Sign in</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; background: #f5f6f8; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; color: #1f2937; padding: 16px; }
  .card { background: white; padding: 36px 32px; border-radius: 12px; box-shadow: 0 4px 24px rgba(15,23,42,.06); width: 100%; max-width: 360px; }
  .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
  .brand .b { width: 28px; height: 28px; background: linear-gradient(135deg, #10b981, #047857); border-radius: 7px; color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; box-shadow: 0 1px 2px rgba(5,150,105,.25); }
  h1 { font-size: 16px; font-weight: 600; margin: 0; letter-spacing: -.01em; }
  h1 em { color: #047857; font-style: italic; font-weight: 600; }
  .sub { font-size: 12px; color: #6b7280; margin: 4px 0 24px; }
  label { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: #6b7280; margin-bottom: 6px; font-weight: 600; }
  input[type=password] { width: 100%; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 14px; margin-bottom: 16px; font-family: inherit; }
  input:focus { outline: none; border-color: #10b981; box-shadow: 0 0 0 3px rgba(16,185,129,.15); }
  button { width: 100%; background: linear-gradient(135deg, #059669, #047857); color: white; border: 0; padding: 11px; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer; transition: filter .15s ease; }
  button:hover { filter: brightness(1.05); }
  .err { color: #b91c1c; font-size: 12px; margin-top: 10px; background: rgba(220,38,38,.06); padding: 6px 9px; border-radius: 5px; border: 1px solid rgba(220,38,38,.15); }
  .ttl { color: #9ca3af; font-size: 10px; margin-top: 18px; text-align: center; font-family: ui-monospace, Menlo, monospace; }
</style>
</head>
<body>
  <form class="card" method="POST" action="/__auth" autocomplete="on">
    <div class="brand"><div class="b">B</div><h1>Bamboo <em>SKU</em> Intelligence</h1></div>
    <p class="sub">Enter the team password to continue.</p>
    <input type="hidden" name="next" value="${next}">
    <label for="p">Password</label>
    <input id="p" type="password" name="p" autofocus required autocomplete="current-password">
    <button type="submit">Sign in</button>
    ${err}
    <div class="ttl">stays signed in for ${ttlHours >= 24 && ttlHours % 24 === 0 ? (ttlHours/24) + ' day' + (ttlHours === 24 ? '' : 's') : ttlHours + ' hour' + (ttlHours === 1 ? '' : 's')}</div>
  </form>
</body>
</html>`;
}

export default async function middleware(request) {
  const password = process.env.SITE_PASSWORD;
  // If no password is configured, do nothing — handy for local previews.
  if (!password) return;

  const secret = process.env.AUTH_SECRET || password;
  const ttlHoursRaw = parseInt(process.env.AUTH_TTL_HOURS || '', 10);
  const ttlHours = Number.isFinite(ttlHoursRaw) && ttlHoursRaw > 0 ? ttlHoursRaw : DEFAULT_TTL_HOURS;
  const ttlSec = ttlHours * 3600;

  const url = new URL(request.url);

  // Handle login submission
  if (url.pathname === '/__auth' && request.method === 'POST') {
    let submitted = '';
    let next = '/';
    try {
      const formData = await request.formData();
      submitted = String(formData.get('p') || '');
      next = String(formData.get('next') || '/');
    } catch (_) { /* fall through */ }
    if (!next.startsWith('/')) next = '/';

    if (submitted === password) {
      const value = await makeCookie(secret, ttlSec);
      return new Response(null, {
        status: 302,
        headers: {
          'Location': next,
          'Set-Cookie': `bamboo_auth=${value}; Max-Age=${ttlSec}; Path=/; HttpOnly; Secure; SameSite=Lax`,
        },
      });
    }
    return new Response(loginHtml(next, 'Incorrect password.', ttlHours), {
      status: 401,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // Check existing cookie
  const cookies = parseCookies(request.headers.get('cookie') || '');
  if (await verifyCookie(cookies['bamboo_auth'], secret)) {
    return; // authenticated → fall through to the static app
  }

  // Unauthenticated → show the sign-in page
  const nextUrl = url.pathname + url.search;
  return new Response(loginHtml(nextUrl, null, ttlHours), {
    status: 401,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
