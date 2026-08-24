const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
const SESSION_KEY = 'aces_supabase_session';
const LOGIN_EMAILS = {
  bannaga: 'bannaga.altieb@aces-co.com',
  hussam: 'hussam@aces-co.com',
  quhal: 'mquhal@aces-co.com',
};

export const supabaseConfigured = Boolean(SUPABASE_URL && PUBLISHABLE_KEY);

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    return null;
  }
}

function writeSession(session) {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

function tokenExpiry(token) {
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000;
  } catch {
    return 0;
  }
}

async function authRequest(path, body) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.msg || payload.message || payload.error_description || 'Authentication failed.');
  return payload;
}

async function refreshSession(session) {
  if (!session?.refresh_token) return null;
  const refreshed = await authRequest('token?grant_type=refresh_token', { refresh_token: session.refresh_token });
  const next = { ...refreshed, profile: session.profile };
  writeSession(next);
  return next;
}

export async function getSession() {
  if (!supabaseConfigured) return null;
  let session = readSession();
  if (!session?.access_token) return null;
  if (tokenExpiry(session.access_token) < Date.now() + 60_000) {
    try {
      session = await refreshSession(session);
    } catch {
      writeSession(null);
      return null;
    }
  }
  return session;
}

export async function signIn(username, password) {
  if (!supabaseConfigured) throw new Error('Supabase is not configured for this deployment.');
  const normalized = username.trim().toLowerCase();
  const email = normalized.includes('@') ? normalized : LOGIN_EMAILS[normalized];
  if (!email) throw new Error('This dashboard username has not been configured.');
  const session = await authRequest('token?grant_type=password', {
    email,
    password,
  });
  writeSession(session);
  const profiles = await databaseRequest(`/profiles?id=eq.${encodeURIComponent(session.user.id)}&select=username,role`);
  if (!profiles[0]) {
    writeSession(null);
    throw new Error('Your account has no dashboard profile.');
  }
  const complete = { ...session, profile: profiles[0] };
  writeSession(complete);
  return complete;
}

export async function signOut() {
  const session = readSession();
  if (session?.access_token) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${session.access_token}` },
    }).catch(() => {});
  }
  writeSession(null);
}

async function authorizedHeaders(extra = {}) {
  const session = await getSession();
  if (!session?.access_token) throw new Error('Your session has expired. Please sign in again.');
  return {
    apikey: PUBLISHABLE_KEY,
    Authorization: `Bearer ${session.access_token}`,
    ...extra,
  };
}

export async function databaseRequest(path, options = {}) {
  const headers = await authorizedHeaders({
    'Content-Type': 'application/json',
    ...options.headers,
  });
  const response = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { ...options, headers });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || payload.hint || `Database request failed (${response.status}).`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export async function rpc(name, body = {}) {
  return databaseRequest(`/rpc/${name}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
}

export async function uploadStorageObject(path, file) {
  const headers = await authorizedHeaders({
    'Content-Type': file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'x-upsert': 'false',
  });
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/revenue-workbooks/${path}`, {
    method: 'POST',
    headers,
    body: file,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || payload.error || `Workbook upload failed (${response.status}).`);
  }
  return response.json();
}
