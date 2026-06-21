import fs from "fs";
import path from "path";
import { SEED_DATA } from "./_seed-data.mjs";

const GITLAB_PROJECT = "wkinger/adsasdasd";
const STORE_PATH = "data/store.json";
const LOCAL_FILE = path.join(process.cwd(), ".data", "vulnerabilities.json");
const USE_LOCAL = process.env.NETLIFY_DEV === "true" || !process.env.NETLIFY_SITE_ID;
const PROJECTS = SEED_DATA.projects;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders() });
}

function gitlabHeaders() {
  const token = process.env.GITLAB_TOKEN;
  return token ? { "PRIVATE-TOKEN": token } : {};
}

function gitlabFileUrl() {
  const project = encodeURIComponent(GITLAB_PROJECT);
  const file = encodeURIComponent(STORE_PATH);
  return `https://gitlab.com/api/v4/projects/${project}/repository/files/${file}`;
}

function loadLocal() {
  const storeFile = path.join(process.cwd(), "data", "store.json");
  if (fs.existsSync(LOCAL_FILE)) {
    return JSON.parse(fs.readFileSync(LOCAL_FILE, "utf8"));
  }
  if (fs.existsSync(storeFile)) {
    return JSON.parse(fs.readFileSync(storeFile, "utf8"));
  }
  return structuredClone(SEED_DATA);
}

function saveLocal(data) {
  fs.mkdirSync(path.dirname(LOCAL_FILE), { recursive: true });
  fs.writeFileSync(LOCAL_FILE, JSON.stringify(data, null, 2));
}

async function loadFromGitLab(req) {
  const token = process.env.GITLAB_TOKEN;
  const headers = gitlabHeaders();

  if (token) {
    const res = await fetch(`${gitlabFileUrl()}/raw?ref=main`, { headers });
    if (res.ok) return res.json();
  }

  const siteUrl = process.env.URL || new URL(req.url).origin;
  const staticRes = await fetch(`${siteUrl}/data/store.json`);
  if (staticRes.ok) return staticRes.json();

  const rawRes = await fetch(
    `https://gitlab.com/${GITLAB_PROJECT}/-/raw/main/${STORE_PATH}`
  );
  if (rawRes.ok) return rawRes.json();

  return structuredClone(SEED_DATA);
}

async function saveToGitLab(data) {
  const token = process.env.GITLAB_TOKEN;
  if (!token) {
    throw new Error("GITLAB_TOKEN не настроен в Netlify");
  }

  const headers = {
    ...gitlabHeaders(),
    "Content-Type": "application/json",
  };

  const content = Buffer.from(JSON.stringify(data, null, 2)).toString("base64");
  const getRes = await fetch(`${gitlabFileUrl()}?ref=main`, { headers });
  const exists = getRes.ok;
  const fileInfo = exists ? await getRes.json() : null;

  const body = {
    branch: "main",
    content,
    encoding: "base64",
    commit_message: "update knifex vulnerabilities",
  };

  if (exists) body.last_commit_id = fileInfo.last_commit_id;

  const saveRes = await fetch(gitlabFileUrl(), {
    method: exists ? "PUT" : "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!saveRes.ok) {
    const err = await saveRes.text();
    throw new Error(`GitLab save failed: ${err}`);
  }
}

async function loadData(req) {
  if (USE_LOCAL) return loadLocal();
  return loadFromGitLab(req);
}

async function saveData(req, data) {
  if (USE_LOCAL) {
    saveLocal(data);
    return;
  }
  await saveToGitLab(data);
}

function generateId() {
  return `vuln-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const url = new URL(req.url);
  const pathParts = url.pathname.replace(/^\/api\/vulns\/?/, "").split("/").filter(Boolean);
  const itemId = pathParts[0] || null;

  try {
    if (req.method === "GET" && !itemId) {
      const data = await loadData(req);
      return jsonResponse(200, data);
    }

    if (req.method === "POST" && !itemId) {
      const body = await req.json();
      const { projectId, title, description, severity, reporter } = body;

      if (!projectId || !title?.trim()) {
        return jsonResponse(400, { error: "projectId и title обязательны" });
      }

      if (!PROJECTS.find((p) => p.id === projectId)) {
        return jsonResponse(400, { error: "Неизвестный проект" });
      }

      const data = await loadData(req);
      const item = {
        id: generateId(),
        projectId,
        title: title.trim(),
        description: (description || "").trim(),
        severity: severity || "medium",
        checked: false,
        checkedBy: null,
        checkedAt: null,
        addedAt: new Date().toISOString(),
        reporter: (reporter || "WPC").trim(),
      };

      data.items.unshift(item);
      await saveData(req, data);
      return jsonResponse(201, item);
    }

    if (req.method === "PATCH" && itemId) {
      const body = await req.json();
      const data = await loadData(req);
      const index = data.items.findIndex((i) => i.id === itemId);

      if (index === -1) {
        return jsonResponse(404, { error: "Уязвимость не найдена" });
      }

      const item = data.items[index];

      if (typeof body.checked === "boolean") {
        item.checked = body.checked;
        item.checkedBy = body.checked ? (body.checkedBy || "coder").trim() : null;
        item.checkedAt = body.checked ? new Date().toISOString() : null;
      }

      if (body.title) item.title = body.title.trim();
      if (body.description !== undefined) item.description = body.description.trim();
      if (body.severity) item.severity = body.severity;

      data.items[index] = item;
      await saveData(req, data);
      return jsonResponse(200, item);
    }

    if (req.method === "DELETE" && itemId) {
      const data = await loadData(req);
      const before = data.items.length;
      data.items = data.items.filter((i) => i.id !== itemId);

      if (data.items.length === before) {
        return jsonResponse(404, { error: "Уязвимость не найдена" });
      }

      await saveData(req, data);
      return jsonResponse(200, { ok: true });
    }

    return jsonResponse(405, { error: "Метод не поддерживается" });
  } catch (err) {
    console.error("vulns error:", err);
    return jsonResponse(500, { error: err.message || "Внутренняя ошибка сервера" });
  }
};
