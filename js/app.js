import {
  fetchVulnerabilities,
  toggleVulnerability,
  getCoderName,
} from "./api.js";
import { ensureNickname, openNickModal, setupUserBadge } from "./nick.js";

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const SEVERITY_LABELS = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

let state = {
  projects: [],
  items: [],
  activeProject: "all",
  activeFilter: "all",
  search: "",
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function showToast(message, type = "success") {
  const existing = $(".toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getFilteredItems() {
  let items = [...state.items];

  if (state.activeProject !== "all") {
    items = items.filter((i) => i.projectId === state.activeProject);
  }

  if (state.activeFilter === "open") {
    items = items.filter((i) => !i.checked);
  } else if (state.activeFilter === "fixed") {
    items = items.filter((i) => i.checked);
  }

  if (state.search) {
    const q = state.search.toLowerCase();
    items = items.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        i.reporter?.toLowerCase().includes(q)
    );
  }

  items.sort((a, b) => {
    if (a.checked !== b.checked) return a.checked ? 1 : -1;
    const sev = (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9);
    if (sev !== 0) return sev;
    return new Date(b.addedAt) - new Date(a.addedAt);
  });

  return items;
}

function getProjectName(id) {
  return state.projects.find((p) => p.id === id)?.name || id;
}

function renderStats() {
  const total = state.items.length;
  const open = state.items.filter((i) => !i.checked).length;
  const fixed = state.items.filter((i) => i.checked).length;
  const critical = state.items.filter(
    (i) => !i.checked && i.severity === "critical"
  ).length;

  const el = $("#stats");
  if (!el) return;

  el.innerHTML = `
    <span><b>${total}</b> всего</span>
    <span class="dot">·</span>
    <span><b>${open}</b> открытых</span>
    <span class="dot">·</span>
    <span><b>${fixed}</b> исправлено</span>
    ${critical ? `<span class="dot">·</span><span class="stat-critical"><b>${critical}</b> critical</span>` : ""}
  `;
}

function renderTabs() {
  const container = $("#tabs");
  if (!container) return;
  const counts = {};

  state.projects.forEach((p) => {
    counts[p.id] = state.items.filter(
      (i) => i.projectId === p.id && !i.checked
    ).length;
  });

  const allOpen = state.items.filter((i) => !i.checked).length;

  let html = `<button class="tab ${state.activeProject === "all" ? "active" : ""}" data-project="all">
    Все <span class="badge">${allOpen}</span>
  </button>`;

  state.projects.forEach((p) => {
    html += `<button class="tab ${state.activeProject === p.id ? "active" : ""}" data-project="${p.id}">
      ${p.name} <span class="badge">${counts[p.id]}</span>
    </button>`;
  });

  container.innerHTML = html;

  container.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.activeProject = btn.dataset.project;
      renderTabs();
      renderList();
    });
  });
}

function renderList() {
  const items = getFilteredItems();
  const container = $("#vuln-list");

  if (items.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>Нет уязвимостей по выбранным фильтрам</p>
      </div>`;
    return;
  }

  container.innerHTML = items
    .map(
      (item) => `
    <div class="vuln-card ${item.checked ? "checked" : ""}" data-id="${item.id}">
      <div class="checkbox-wrap">
        <input type="checkbox" ${item.checked ? "checked" : ""} aria-label="Отметить как исправлено" />
      </div>
      <div class="vuln-body">
        <div class="vuln-header">
          <span class="vuln-title">${escapeHtml(item.title)}</span>
          <span class="severity severity-${item.severity}">${SEVERITY_LABELS[item.severity] || item.severity}</span>
          ${state.activeProject === "all" ? `<span class="project-tag">${getProjectName(item.projectId)}</span>` : ""}
        </div>
        ${item.description ? `<p class="vuln-desc">${escapeHtml(item.description)}</p>` : ""}
        <div class="vuln-meta">
          <span>${escapeHtml(item.reporter || "WPC")}</span>
          <span>${formatDate(item.addedAt)}</span>
          ${item.checked ? `<span class="fixed-info">Исправлено${item.checkedBy ? ` — ${escapeHtml(item.checkedBy)}` : ""}${item.checkedAt ? `, ${formatDate(item.checkedAt)}` : ""}</span>` : ""}
        </div>
      </div>
    </div>`
    )
    .join("");

  container.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener("change", handleToggle);
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function handleToggle(e) {
  const card = e.target.closest(".vuln-card");
  const id = card.dataset.id;
  const checked = e.target.checked;
  const coderName = getCoderName();

  if (checked && !coderName) {
    e.target.checked = false;
    openNickModal();
    return;
  }

  e.target.disabled = true;

  try {
    const updated = await toggleVulnerability(id, checked, coderName);
    const index = state.items.findIndex((i) => i.id === id);
    if (index !== -1) state.items[index] = updated;
    renderStats();
    renderTabs();
    renderList();
    showToast(checked ? "Отмечено как исправлено" : "Снята отметка");
  } catch (err) {
    e.target.checked = !checked;
    showToast(err.message, "error");
  } finally {
    e.target.disabled = false;
  }
}

function setupFilters() {
  $$(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.activeFilter = btn.dataset.filter;
      $$(".filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderList();
    });
  });

  $("#search").addEventListener("input", (e) => {
    state.search = e.target.value;
    renderList();
  });
}

async function init() {
  const list = $("#vuln-list");
  list.innerHTML = `<div class="loading"><div class="spinner"></div><p>Загрузка...</p></div>`;

  try {
    const data = await fetchVulnerabilities();
    state.projects = data.projects;
    state.items = data.items;
    renderStats();
    renderTabs();
    renderList();
  } catch (err) {
    list.innerHTML = `
      <div class="empty-state">
        <p>Не удалось загрузить данные</p>
        <p style="margin-top:0.5rem;font-size:0.8rem">${escapeHtml(err.message)}</p>
        <p style="margin-top:1rem;font-size:0.8rem">Для сохранения чекбоксов добавь GITLAB_TOKEN в Netlify</p>
      </div>`;
  }

  setupFilters();
  setupUserBadge();
  $("#refresh-btn")?.addEventListener("click", init);
}

ensureNickname().then(init);
