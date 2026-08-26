import { requireAuth, jsonResponse } from "../../_shared/auth.js";
import { DEFAULT_PROJECTS } from "../../_shared/defaultProjects.js";

const KV_KEY = "projects";

async function getProjects(env) {
  const raw = await env.PORTFOLIO_KV.get(KV_KEY);
  return raw ? JSON.parse(raw) : DEFAULT_PROJECTS;
}

// GET /api/projects -> public, anyone visiting the site needs this to render the page
export async function onRequestGet(context) {
  const projects = await getProjects(context.env);
  return jsonResponse(projects);
}

// POST /api/projects -> requires a valid session token from /api/login
export async function onRequestPost(context) {
  const { request, env } = context;

  const authed = await requireAuth(request, env.SESSION_SECRET);
  if (!authed) return jsonResponse({ error: "Unauthorized" }, 401);

  let project;
  try {
    project = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid project data" }, 400);
  }

  if (!project || !project.title) {
    return jsonResponse({ error: "A project needs at least a title" }, 400);
  }

  const projects = await getProjects(env);
  projects.push(project);

  try {
    await env.PORTFOLIO_KV.put(KV_KEY, JSON.stringify(projects));
  } catch (err) {
    console.error("KV save failed", err);
    return jsonResponse({ error: "Cloudflare KV rejected the project save" }, 500);
  }

  return jsonResponse(projects);
}
