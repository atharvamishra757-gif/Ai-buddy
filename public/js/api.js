/* ---------------- API client ---------------- */

const TOKEN_KEY = 'studyai.token';

export const auth = {
  get token() { return localStorage.getItem(TOKEN_KEY); },
  set token(v) { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); },
};

export class ApiError extends Error {
  constructor(message, { status, fields } = {}) {
    super(message);
    this.status = status;
    this.fields = fields || {};
  }
}

export async function api(path, { method = 'GET', body, ...rest } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(rest.headers || {}) };
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;

  let res;
  try {
    res = await fetch(`/api${path}`, {
      method, headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Network unavailable. Check your connection and try again.', { status: 0 });
  }

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }

  if (res.status === 401) {
    auth.token = null;
    window.dispatchEvent(new CustomEvent('auth:expired'));
    throw new ApiError(data?.error || 'Your session expired. Please sign in again.', { status: 401 });
  }
  if (!res.ok) {
    throw new ApiError(data?.error || `Request failed (${res.status})`, { status: res.status, fields: data?.fields });
  }
  return data;
}

export const get = (p) => api(p);
export const post = (p, body) => api(p, { method: 'POST', body: body ?? {} });
export const patch = (p, body) => api(p, { method: 'PATCH', body: body ?? {} });
export const del = (p) => api(p, { method: 'DELETE' });
