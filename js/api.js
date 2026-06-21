const API_BASE = "/api/vulns";

async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `Ошибка ${res.status}`);
  }

  return data;
}

export async function fetchVulnerabilities() {
  try {
    return await request(API_BASE);
  } catch {
    return request("/data/store.json");
  }
}

export async function addVulnerability(vuln) {
  return request(API_BASE, {
    method: "POST",
    body: JSON.stringify(vuln),
  });
}

export async function toggleVulnerability(id, checked, checkedBy) {
  return request(`${API_BASE}/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ checked, checkedBy }),
  });
}

export async function deleteVulnerability(id) {
  return request(`${API_BASE}/${id}`, { method: "DELETE" });
}

export function getCoderName() {
  return localStorage.getItem("coderName") || "";
}

export function setCoderName(name) {
  localStorage.setItem("coderName", name);
}
