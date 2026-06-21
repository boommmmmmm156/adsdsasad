import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8889;
const LOCAL_FILE = path.join(__dirname, ".data", "vulnerabilities.json");

const SEED_DATA = JSON.parse(
  fs.readFileSync(path.join(__dirname, "data", "seed.json"), "utf8")
);

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".ico": "image/x-icon",
};

function loadData() {
  if (!fs.existsSync(LOCAL_FILE)) {
    fs.mkdirSync(path.dirname(LOCAL_FILE), { recursive: true });
    fs.writeFileSync(LOCAL_FILE, JSON.stringify(SEED_DATA, null, 2));
    return structuredClone(SEED_DATA);
  }
  return JSON.parse(fs.readFileSync(LOCAL_FILE, "utf8"));
}

function saveData(data) {
  fs.mkdirSync(path.dirname(LOCAL_FILE), { recursive: true });
  fs.writeFileSync(LOCAL_FILE, JSON.stringify(data, null, 2));
}

function generateId() {
  return `vuln-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

async function handleApi(req, res, url) {
  const parts = url.pathname.replace(/^\/api\/vulns\/?/, "").split("/").filter(Boolean);
  const itemId = parts[0] || null;

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  try {
    if (req.method === "GET" && !itemId) {
      return sendJson(res, 200, loadData());
    }

    if (req.method === "POST" && !itemId) {
      const body = await readBody(req);
      const { projectId, title, description, severity, reporter } = body;

      if (!projectId || !title?.trim()) {
        return sendJson(res, 400, { error: "projectId и title обязательны" });
      }

      const data = loadData();
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
      saveData(data);
      return sendJson(res, 201, item);
    }

    if (req.method === "PATCH" && itemId) {
      const body = await readBody(req);
      const data = loadData();
      const index = data.items.findIndex((i) => i.id === itemId);

      if (index === -1) return sendJson(res, 404, { error: "Уязвимость не найдена" });

      const item = data.items[index];
      if (typeof body.checked === "boolean") {
        item.checked = body.checked;
        item.checkedBy = body.checked ? (body.checkedBy || "coder").trim() : null;
        item.checkedAt = body.checked ? new Date().toISOString() : null;
      }

      data.items[index] = item;
      saveData(data);
      return sendJson(res, 200, item);
    }

    if (req.method === "DELETE" && itemId) {
      const data = loadData();
      const before = data.items.length;
      data.items = data.items.filter((i) => i.id !== itemId);
      if (data.items.length === before) {
        return sendJson(res, 404, { error: "Уязвимость не найдена" });
      }
      saveData(data);
      return sendJson(res, 200, { ok: true });
    }

    sendJson(res, 405, { error: "Метод не поддерживается" });
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
}

function serveStatic(req, res, url) {
  let filePath = path.join(__dirname, url.pathname === "/" ? "index.html" : url.pathname);

  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    return res.end("Not found");
  }

  const ext = path.extname(filePath);
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname.startsWith("/api/vulns")) {
    return handleApi(req, res, url);
  }

  serveStatic(req, res, url);
});

server.listen(PORT, () => {
  console.log(`\n  Knifex Tracker: http://localhost:${PORT}\n`);
});
