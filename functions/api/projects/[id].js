import { requireAuth, jsonResponse } from "../../_shared/auth.js";
import { DEFAULT_PROJECTS } from "../../_shared/defaultProjects.js";

const KV_KEY = "projects";

async function getProjects(env) {
  const raw = await env.PORTFOLIO_KV.get(KV_KEY);
  return raw ? JSON.parse(raw) : DEFAULT_PROJECTS;
}

function getProjectIndex(params) {
  return parseInt(params.id, 10);
}

function r2KeyFromImageUrl(src) {
  if (typeof src !== "string") return null;
  try {
    const url = new URL(src, "https://portfolio.invalid");
    if (url.pathname !== "/api/image") return null;
    const key = url.searchParams.get("key");
    return key && key.startsWith("projects/") ? key : null;
  } catch {
    return null;
  }
}

// PUT /api/projects/:id -> replace an existing project (requires admin session)
export async function onRequestPut(context) {
  const { request, env, params } = context;

  const authed = await requireAuth(request, env.SESSION_SECRET);
  if (!authed) return jsonResponse({ error: "Unauthorized" }, 401);

  const idx = getProjectIndex(params);
  const projects = await getProjects(env);

  if (Number.isNaN(idx) || idx < 0 || idx >= projects.length) {
    return jsonResponse({ error: "Project not found" }, 404);
  }

  let project;
  try {
    project = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid project data" }, 400);
  }

  if (!project || !project.title) {
    return jsonResponse({ error: "A project needs at least a title" }, 400);
  }

  projects[idx] = project;

  try {
    await env.PORTFOLIO_KV.put(KV_KEY, JSON.stringify(projects));
  } catch (err) {
    console.error("KV update failed", err);
    return jsonResponse({ error: "Cloudflare KV rejected the project update" }, 500);
  }

  return jsonResponse(projects);
}

// DELETE /api/projects/:id -> remove the project and its R2-hosted images.
export async function onRequestDelete(context) {
  const { request, env, params } = context;

  const authed = await requireAuth(request, env.SESSION_SECRET);
  if (!authed) return jsonResponse({ error: "Unauthorized" }, 401);

  const idx = getProjectIndex(params);
  const projects = await getProjects(env);

  if (Number.isNaN(idx) || idx < 0 || idx >= projects.length) {
    return jsonResponse({ error: "Project not found" }, 404);
  }

  const [removed] = projects.splice(idx, 1);
  await env.PORTFOLIO_KV.put(KV_KEY, JSON.stringify(projects));

  // Best-effort R2 cleanup. Static /img paths and legacy base64 images are ignored.
  if (env.PORTFOLIO_IMAGES && removed && Array.isArray(removed.images)) {
    const keys = removed.images.map(r2KeyFromImageUrl).filter(Boolean);
    if (keys.length) {
      try {
        await env.PORTFOLIO_IMAGES.delete(keys);
      } catch (err) {
        console.error("R2 cleanup after project delete failed", err);
      }
    }
  }

  return jsonResponse(projects);
}
