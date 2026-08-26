// Shared auth helpers for Pages Functions.
// Tokens are short-lived, HMAC-signed, and never contain the passcode itself.

function b64urlEncode(bytesOrString) {
  const str = typeof bytesOrString === "string" ? bytesOrString : String.fromCharCode(...bytesOrString);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str) {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  return atob(padded);
}

async function hmac(secret, data) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return b64urlEncode(new Uint8Array(sigBuf));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

// Issues a signed session token good for `ttlSeconds`.
export async function createToken(secret, ttlSeconds = 60 * 60 * 2) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payloadB64 = b64urlEncode(JSON.stringify({ exp }));
  const sig = await hmac(secret, payloadB64);
  return `${payloadB64}.${sig}`;
}

// Verifies a token's signature and expiry. Returns true/false.
export async function verifyToken(token, secret) {
  if (!token || !secret) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payloadB64, sig] = parts;
  const expectedSig = await hmac(secret, payloadB64);
  if (!timingSafeEqual(sig, expectedSig)) return false;
  try {
    const payload = JSON.parse(b64urlDecode(payloadB64));
    return typeof payload.exp === "number" && payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

// Pulls a bearer token out of an incoming request's Authorization header
// and confirms it's valid for the given secret.
export async function requireAuth(request, secret) {
  const header = request.headers.get("Authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "");
  return verifyToken(token, secret);
}

export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
