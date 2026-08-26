import { createToken, jsonResponse } from "../_shared/auth.js";

// POST /api/login  { passcode: "..." }  ->  { token: "..." }
//
// ADMIN_PASSCODE and SESSION_SECRET are set as Cloudflare Pages secrets
// (Settings > Environment variables), never committed to code, and never
// sent to the browser except as part of this one check.
export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid request" }, 400);
  }

  const passcode = (body && body.passcode) || "";

  if (!env.ADMIN_PASSCODE || !env.SESSION_SECRET) {
    return jsonResponse({ error: "Server not configured. Set ADMIN_PASSCODE and SESSION_SECRET." }, 500);
  }

  if (passcode !== env.ADMIN_PASSCODE) {
    // Deliberately generic error — don't reveal whether the passcode was close.
    return jsonResponse({ error: "Invalid passcode" }, 401);
  }

  const token = await createToken(env.SESSION_SECRET, 60 * 60 * 2); // 2 hour session
  return jsonResponse({ token });
}
