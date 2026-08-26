import { requireAuth, jsonResponse } from "../_shared/auth.js";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const ALLOWED_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["image/avif", "avif"]
]);

function getKey(request) {
  const url = new URL(request.url);
  return url.searchParams.get("key") || "";
}

function ensureBucket(env) {
  return env.PORTFOLIO_IMAGES && typeof env.PORTFOLIO_IMAGES.get === "function";
}

// GET /api/image?key=projects/... -> public image delivery from the private R2 bucket.
export async function onRequestGet({ request, env }) {
  if (!ensureBucket(env)) {
    return jsonResponse({ error: "R2 binding PORTFOLIO_IMAGES is not configured" }, 500);
  }

  const key = getKey(request);
  if (!key || !key.startsWith("projects/")) {
    return jsonResponse({ error: "Invalid image key" }, 400);
  }

  const object = await env.PORTFOLIO_IMAGES.get(key);
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("X-Content-Type-Options", "nosniff");

  return new Response(object.body, { headers });
}

// POST /api/image -> authenticated multipart upload to R2.
export async function onRequestPost({ request, env }) {
  const authed = await requireAuth(request, env.SESSION_SECRET);
  if (!authed) return jsonResponse({ error: "Unauthorized" }, 401);

  if (!ensureBucket(env)) {
    return jsonResponse({ error: "R2 binding PORTFOLIO_IMAGES is not configured" }, 500);
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return jsonResponse({ error: "Upload must be multipart/form-data" }, 400);
  }

  const file = form.get("image");
  if (!file || typeof file === "string" || typeof file.stream !== "function") {
    return jsonResponse({ error: "No image supplied" }, 400);
  }

  const ext = ALLOWED_TYPES.get(file.type);
  if (!ext) {
    return jsonResponse({ error: "Use a JPG, PNG, WebP, GIF, or AVIF image" }, 415);
  }

  if (typeof file.size === "number" && file.size > MAX_UPLOAD_BYTES) {
    return jsonResponse({ error: "That image is over the 20 MiB upload limit" }, 413);
  }

  const key = `projects/${Date.now()}-${crypto.randomUUID()}.${ext}`;

  try {
    await env.PORTFOLIO_IMAGES.put(key, file.stream(), {
      httpMetadata: {
        contentType: file.type,
        cacheControl: "public, max-age=31536000, immutable"
      },
      customMetadata: {
        originalName: String(file.name || "image").slice(0, 200)
      }
    });
  } catch (err) {
    console.error("R2 upload failed", err);
    return jsonResponse({ error: "Cloudflare R2 rejected the image upload" }, 500);
  }

  return jsonResponse({
    key,
    url: `/api/image?key=${encodeURIComponent(key)}`
  }, 201);
}

// DELETE /api/image?key=projects/... -> authenticated cleanup from R2.
export async function onRequestDelete({ request, env }) {
  const authed = await requireAuth(request, env.SESSION_SECRET);
  if (!authed) return jsonResponse({ error: "Unauthorized" }, 401);

  if (!ensureBucket(env)) {
    return jsonResponse({ error: "R2 binding PORTFOLIO_IMAGES is not configured" }, 500);
  }

  const key = getKey(request);
  if (!key || !key.startsWith("projects/")) {
    return jsonResponse({ error: "Invalid image key" }, 400);
  }

  await env.PORTFOLIO_IMAGES.delete(key);
  return jsonResponse({ ok: true });
}
