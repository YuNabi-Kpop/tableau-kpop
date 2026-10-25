// Connexion Spotify (Authorization Code + PKCE, sans clé secrète) et appels à l'API Web.
// Respecte les règles « Development Mode » de 2026 : pas d'appels groupés
// (/tracks?ids=…), playlists via /me/playlists et /playlists/{id}/items, recherche limitée à 10.
import { CONFIG } from './config.js';

const API = 'https://api.spotify.com/v1';
const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SCOPES = ['playlist-modify-private', 'playlist-modify-public', 'playlist-read-private', 'user-library-read'];
const TOKEN_KEY = 'tk_spotify_token';
const VERIFIER_KEY = 'tk_spotify_verifier';
const STATE_KEY = 'tk_spotify_state';
const MIN_INTERVAL_MS = 120;      // espace minimal entre deux appels
const MAX_RETRIES = 6;

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignoré */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignoré */ } },
};

export function isConfigured() { return !!CONFIG.SPOTIFY_CLIENT_ID; }

export function redirectUri() {
  if (CONFIG.SPOTIFY_REDIRECT_URI) return CONFIG.SPOTIFY_REDIRECT_URI;
  return location.origin + location.pathname.replace(/index\.html$/, '');
}

function randomString(len) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

async function challengeFrom(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function readToken() {
  try { return JSON.parse(ls.get(TOKEN_KEY)) || null; } catch { return null; }
}
function saveToken(t, previous) {
  const token = {
    access_token: t.access_token,
    refresh_token: t.refresh_token || previous?.refresh_token,
    expires_at: Date.now() + (t.expires_in || 3600) * 1000,
  };
  ls.set(TOKEN_KEY, JSON.stringify(token));
  return token;
}

export function isLoggedIn() { return !!readToken()?.refresh_token || !!readToken()?.access_token; }

export async function login() {
  if (!isConfigured()) throw new Error('Spotify n’est pas configuré (config.js).');
  const verifier = randomString(64);
  const state = randomString(16);
  ls.set(VERIFIER_KEY, verifier);
  ls.set(STATE_KEY, state);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CONFIG.SPOTIFY_CLIENT_ID,
    scope: SCOPES.join(' '),
    code_challenge_method: 'S256',
    code_challenge: await challengeFrom(verifier),
    redirect_uri: redirectUri(),
    state,
  });
  location.assign(`${AUTH_URL}?${params}`);
}

export function logout() { ls.del(TOKEN_KEY); }

/** À appeler au chargement : termine la connexion si on revient de Spotify. */
export async function handleRedirect() {
  const url = new URL(location.href);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  if (!code && !error) return false;
  const clean = () => history.replaceState(null, '', url.pathname + url.hash);
  if (error) { clean(); throw new Error(`Connexion Spotify refusée (${error}).`); }
  if (url.searchParams.get('state') !== ls.get(STATE_KEY)) { clean(); throw new Error('Réponse Spotify invalide (state).'); }
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(),
      client_id: CONFIG.SPOTIFY_CLIENT_ID,
      code_verifier: ls.get(VERIFIER_KEY) || '',
    }),
  });
  clean();
  ls.del(VERIFIER_KEY); ls.del(STATE_KEY);
  if (!res.ok) throw new Error(`Échec de la connexion Spotify (${res.status}).`);
  saveToken(await res.json());
  return true;
}

let refreshing = null;
async function refresh() {
  const current = readToken();
  if (!current?.refresh_token) throw new SpotifyAuthError();
  if (!refreshing) {
    refreshing = (async () => {
      const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: current.refresh_token,
          client_id: CONFIG.SPOTIFY_CLIENT_ID,
        }),
      });
      if (!res.ok) { logout(); throw new SpotifyAuthError(); }
      return saveToken(await res.json(), current);
    })().finally(() => { refreshing = null; });
  }
  return refreshing;
}

export class SpotifyAuthError extends Error {
  constructor() { super('Connecte-toi à Spotify (Réglages ou bouton en haut à droite).'); this.name = 'SpotifyAuthError'; }
}
export class SpotifyHttpError extends Error {
  constructor(status, message) { super(message || `Erreur Spotify ${status}`); this.status = status; }
}

async function accessToken() {
  const t = readToken();
  if (!t) throw new SpotifyAuthError();
  if (Date.now() > t.expires_at - 60_000) return (await refresh()).access_token;
  return t.access_token;
}

// File d'attente : un appel à la fois, espacés d'au moins MIN_INTERVAL_MS.
let queue = Promise.resolve();
let lastCall = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
export let onRateLimit = null; // callback(seconds) pour afficher l'attente
export function setRateLimitListener(fn) { onRateLimit = fn; }

export function api(path, { method = 'GET', body } = {}) {
  const job = queue.then(() => doCall(path, method, body));
  queue = job.catch(() => {});
  return job;
}

async function doCall(path, method, body) {
  const url = path.startsWith('http') ? path : API + path;
  let retriedAuth = false;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const wait = lastCall + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${await accessToken()}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) {
      const seconds = Math.min(parseInt(res.headers.get('Retry-After') || '5', 10) || 5, 120);
      onRateLimit?.(seconds);
      await sleep(seconds * 1000 + 250);
      continue;
    }
    if (res.status === 401 && !retriedAuth) { retriedAuth = true; await refresh(); continue; }
    if (res.status >= 500 && attempt < 2) { await sleep(1500); continue; }
    if (!res.ok) {
      let msg;
      try { msg = (await res.json())?.error?.message; } catch { /* corps vide */ }
      throw new SpotifyHttpError(res.status, msg ? `Spotify ${res.status} : ${msg}` : undefined);
    }
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }
  throw new SpotifyHttpError(429, 'Spotify limite les appels : réessaie dans quelques minutes.');
}

/** Parcourt une liste paginée. Essaie limit=50, se rabat sur 10 si Spotify refuse. */
async function paginate(path, params = {}, limit = 50) {
  const items = [];
  let offset = 0;
  for (;;) {
    const qs = new URLSearchParams({ ...params, limit: String(limit), offset: String(offset) });
    let page;
    try {
      page = await api(`${path}?${qs}`);
    } catch (e) {
      if (e.status === 400 && limit > 10) { limit = 10; continue; }
      throw e;
    }
    items.push(...(page.items || []));
    if (!page.next || !page.items?.length) break;
    offset += page.items.length;
  }
  return items;
}

export const me = () => api('/me');

export async function searchArtists(q) {
  const qs = new URLSearchParams({ q, type: 'artist', limit: '10' });
  const r = await api(`/search?${qs}`);
  return r?.artists?.items || [];
}

export const getArtist = id => api(`/artists/${encodeURIComponent(id)}`);

export function getArtistAlbums(id, groups = 'album,single') {
  return paginate(`/artists/${encodeURIComponent(id)}/albums`, { include_groups: groups });
}

export function getAlbumTracks(id) {
  return paginate(`/albums/${encodeURIComponent(id)}/tracks`);
}

export function createPlaylist(name, description) {
  return api('/me/playlists', { method: 'POST', body: { name, description, public: false } });
}

export function updatePlaylistDetails(id, name, description) {
  return api(`/playlists/${encodeURIComponent(id)}`, { method: 'PUT', body: { name, description } });
}

/** Vérifie que la playlist est toujours dans la bibliothèque (pas supprimée par l'utilisateur). */
export async function playlistStillSaved(id) {
  try {
    const qs = new URLSearchParams({ uris: `spotify:playlist:${id}` });
    const r = await api(`/me/library/contains?${qs}`);
    return Array.isArray(r) ? r[0] !== false : true;
  } catch (e) {
    if (e.status === 404) return false;
    return true; // en cas de doute, on garde la playlist existante
  }
}

/** Remplace tout le contenu d'une playlist (par paquets de 100). */
export async function replacePlaylistItems(id, uris) {
  const path = `/playlists/${encodeURIComponent(id)}/items`;
  await api(path, { method: 'PUT', body: { uris: uris.slice(0, 100) } });
  for (let i = 100; i < uris.length; i += 100) {
    await api(path, { method: 'POST', body: { uris: uris.slice(i, i + 100) } });
  }
}
