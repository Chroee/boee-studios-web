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
  await env.PORTFOLIO_KV.put(KV_KEY, JSON.stringify(projects));

  return jsonResponse(projects);
}

// DELETE /api/projects/:id -> requires a valid session token from /api/login
// :id is the project's index in the array.
export async function onRequestDelete(context) {
  const { request, env, params } = context;

  const authed = await requireAuth(request, env.SESSION_SECRET);
  if (!authed) return jsonResponse({ error: "Unauthorized" }, 401);

  const idx = getProjectIndex(params);
  const projects = await getProjects(env);

  if (Number.isNaN(idx) || idx < 0 || idx >= projects.length) {
    return jsonResponse({ error: "Project not found" }, 404);
  }

  projects.splice(idx, 1);
  await env.PORTFOLIO_KV.put(KV_KEY, JSON.stringify(projects));

  return jsonResponse(projects);
}
