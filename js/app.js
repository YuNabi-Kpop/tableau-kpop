// Tableau K-pop — interface principale.
import { CONFIG } from './config.js';
import * as sp from './spotify.js';
import { createStore, trackKey, trackDefaults } from './store.js';
import { DEFAULT_KEYWORDS, processDiscography, dedupeKey, playlistTracks, rankCompare, pickImage } from './fetcher.js';

const DEFAULT_SETTINGS = {
  subcategories: ['GG', 'G', 'BG', 'B'],   // sous-catégories, les mêmes dans chaque onglet
  artistSub: {},                // artistId → sous-catégorie
  artistSort: 'order',          // order | name | name-desc | songs | rated | favs
  keywords: DEFAULT_KEYWORDS,
  includeCompilations: false,
  dedupeMode: 'base',           // base | exact | none
  playlistMode: 'all',          // all | rated | favorites
  playlistMinRating: 3,
  playlistName: '{artiste} · Tableau K-pop',
};
const SUB_HINTS = { GG: 'Groupes féminins', G: 'Solistes féminines', BG: 'Groupes masculins', B: 'Solistes masculins' };
const SUB_NONE = '_';           // filtre « sans sous-catégorie »
const ARTIST_SORTS = [['order', 'Mon ordre'], ['name', 'Nom (A → Z)'], ['name-desc', 'Nom (Z → A)'], ['songs', 'Plus de chansons'], ['rated', 'Plus de chansons notées'], ['favs', 'Plus de coups de cœur']];
const MAX_MEMBERS = 12;
const MAX_PHOTOS = 25;          // photos par membre (une est tirée au hasard à chaque visite)
const IMG_RE = /\.(jpe?g|png|webp|gif|avif|bmp)$/i;
const DECOR_MIN_GUTTER = 104;   // largeur minimale de marge (px) pour afficher les photocards sur les côtés
const QUICK_CATEGORIES = ['2GG', '3GG', '4GG', '5GG', 'Solistes', 'Sous-unités'];
const PAGE_SIZE = 200;

const state = {
  categories: [],
  artists: [],
  tracks: new Map(),
  settings: { ...DEFAULT_SETTINGS },
  spotifyUser: null,
  job: null,
  view: { type: 'home' },
  catSub: {},                   // catId → dernière sous-catégorie affichée
  organize: false,              // mode « Organiser » d'un onglet
  orgPick: new Set(),           // artistes cochés en mode Organiser
  songFilters: { q: '', category: '', sub: '', minRating: 0, fav: false, showHidden: false, sort: 'rating', limit: PAGE_SIZE },
  artistFilters: { q: '', showHidden: false, sort: 'rank' },
  members: new Map(),           // artistId → [{ name, photos: [src…] }] (chargé à la demande)
  membersModal: null,           // artistId dont on gère les photos
  membersOpen: new Set(),       // membres dont on affiche toutes les photos dans la fenêtre
  visit: 0,                     // augmente à chaque navigation : nouveau tirage des photos
};
const store = createStore();

// ───────────────────────── Utilitaires ─────────────────────────
const $ = (sel, root = document) => root.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
}));
const plural = (n, one, many = one + 's') => `${n} ${n > 1 ? many : one}`;
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
const byPos = (a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name, 'fr');

const ICON = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h11M4 12h11M4 18h7M18 14v6m0 0-2.5-2.5M18 20l2.5-2.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  ext: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7c1.8 0 3.4-.5 4.7-1.3M9.9 9.9a3 3 0 0 0 4.2 4.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  butterfly: '<svg class="bf" viewBox="0 0 64 64" aria-hidden="true"><g class="bf-wings" fill="url(#bf-grad)"><path d="M31 31C26 15 10 7 6 15c-4 9 6 17 24 18z"/><path d="M33 31C38 15 54 7 58 15c4 9-6 17-24 18z"/><path d="M30 35c-11 1-18 9-15 16 3 6 11 2 15-11z"/><path d="M34 35c11 1 18 9 15 16-3 6-11 2-15-11z"/></g><rect x="30.6" y="24" width="2.8" height="24" rx="1.4" fill="#fff"/><path d="M32 25c-1-6-4-10-8-12M32 25c1-6 4-10 8-12" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>',
  image: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="9" r="2" fill="currentColor"/><path d="M21 16l-5-5-9 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill="currentColor"/></svg>',
  left: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  right: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  grip: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></g></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h3c4 0 6 10 10 10h4M3 17h3c1.6 0 2.8-1.6 3.8-3.5M14 9.5C15 8 16.2 7 18 7h2M17 4l3 3-3 3M17 14l3 3-3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  folder: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  music: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18a3 3 0 1 1-2-2.8V5l12-2v12a3 3 0 1 1-2-2.8V7.4L9 8.8z" fill="currentColor"/></svg>',
};

function cover(url, cls = 'thumb') {
  return url ? `<img class="${cls}" src="${esc(url)}" alt="" loading="lazy">` : `<span class="${cls} placeholder">${ICON.music}</span>`;
}

// ───────────────────────── Accès aux données ─────────────────────────
const categoryById = id => state.categories.find(c => c.id === id);
const artistById = id => state.artists.find(a => a.id === id);
const sortedCategories = () => [...state.categories].sort(byPos);
const artistsOf = catId => state.artists.filter(a => (a.category_id || 'none') === catId).sort(byPos);
const tracksOf = artistId => [...state.tracks.values()].filter(t => t.artist_id === artistId);
const orphanArtists = () => state.artists.filter(a => !a.category_id || !categoryById(a.category_id));

// Sous-catégories (enregistrées dans les réglages : aucune colonne Supabase à ajouter).
const subList = () => state.settings.subcategories || [];
const subOf = a => state.settings.artistSub?.[a.id] || '';
/** Sous-catégorie connue de l'artiste, ou SUB_NONE. */
const bucketOf = a => subList().includes(subOf(a)) ? subOf(a) : SUB_NONE;
const subLabel = sub => sub === SUB_NONE ? 'Sans sous-catégorie' : sub;
const catHash = (catId, sub = state.catSub[catId] || '') => `#/cat/${catId}${sub ? `/${encodeURIComponent(sub)}` : ''}`;
/** Artistes affichés dans la vue onglet (filtrés par la sous-catégorie choisie). */
function viewArtists(v) {
  const all = v.id === 'none' ? orphanArtists() : artistsOf(v.id);
  return v.sub ? all.filter(a => bucketOf(a) === v.sub) : all;
}
async function setSub(ids, sub) {
  const m = { ...(state.settings.artistSub || {}) };
  for (const id of ids) { if (sub) m[id] = sub; else delete m[id]; }
  state.settings = { ...state.settings, artistSub: m };
  await store.saveSettings(state.settings);
}
/** Tous les artistes d'un onglet dans « mon ordre ». */
const catList = catId => catId === 'none' ? orphanArtists().sort(byPos) : artistsOf(catId);
function sortArtists(list, stats) {
  const key = state.organize ? 'order' : (state.settings.artistSort || 'order');
  const st = a => stats.get(a.id) || { total: 0, rated: 0, fav: 0 };
  const byName = (a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
  const cmp = {
    name: byName,
    'name-desc': (a, b) => byName(b, a),
    songs: (a, b) => st(b).total - st(a).total || byName(a, b),
    rated: (a, b) => st(b).rated - st(a).rated || byName(a, b),
    favs: (a, b) => st(b).fav - st(a).fav || byName(a, b),
  }[key] || byPos;
  return [...list].sort(cmp);
}
/** Renumérote les positions d'une liste ordonnée et enregistre ce qui a changé. */
async function renumber(list) {
  const changed = [];
  list.forEach((x, k) => { if (x.position !== k) { x.position = k; changed.push(x); } });
  await Promise.all(changed.map(x => store.saveArtist(x)));
}
/** Place l'artiste id juste avant (ou après) targetId dans « mon ordre » de son onglet. */
async function placeArtist(id, targetId, after) {
  const a = artistById(id), t = artistById(targetId);
  if (!a || !t || a === t) return;
  const catId = t.category_id && categoryById(t.category_id) ? t.category_id : 'none';
  const full = catList(catId).filter(x => x.id !== id);
  full.splice(full.indexOf(t) + (after ? 1 : 0), 0, a);
  if (catId !== 'none') a.category_id = catId;
  await renumber(full);
}
// Groupe d'origine (soliste, sous-unité…) : texte libre dans la colonne « note » de l'artiste.
const normName = x => String(x || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const originParts = a => String(a?.note || '').split(/\s*[,/;]\s*/).map(x => x.trim()).filter(Boolean);
/** « TWICE, MISAMO » → liens vers les artistes du site quand le nom correspond. */
function originHtml(a) {
  return originParts(a).map(part => {
    const g = state.artists.find(x => x.id !== a.id && normName(x.name) === normName(part));
    return g ? `<a href="#/artist/${g.id}">${esc(g.name)}</a>` : esc(part);
  }).join(', ');
}
/** Vrai nom de l'artiste du site correspondant à part, sinon part tel quel. */
const originName = (a, part) => state.artists.find(x => x.id !== a.id && normName(x.name) === normName(part))?.name || part;
async function saveOrigins(a, parts) {
  a.note = parts.length ? parts.join(', ') : null;
  await saveArtist(a);
  render();
  document.querySelector(`[data-act="origin-add"][data-id="${CSS.escape(a.id)}"]`)?.focus();
}
/** Ajoute le(s) groupe(s) tapé(s) dans le champ « + Ajouter un groupe » (doublons et l'artiste lui-même ignorés). */
async function addOrigins(el) {
  const a = artistById(el.dataset.id);
  if (!a) return;
  const parts = originParts(a);
  const added = [];
  for (const raw of el.value.split(/\s*[,/;]\s*/)) {
    const x = originName(a, raw.trim().replace(/\s+/g, ' '));
    if (x && normName(x) !== normName(a.name) && ![...parts, ...added].some(p => normName(p) === normName(x))) added.push(x);
  }
  el.value = '';
  if (added.length) await saveOrigins(a, [...parts, ...added]);
}
/** Texte simple du groupe d'origine, avec le vrai nom des artistes du site. */
const originText = a => originParts(a).map(part => state.artists.find(x => x.id !== a.id && normName(x.name) === normName(part))?.name || part).join(', ');
/** Artistes dont le groupe d'origine est cet artiste (membres en solo). */
const solosOf = g => state.artists.filter(a => a.id !== g.id && originParts(a).some(p => normName(p) === normName(g.name))).sort((x, y) => x.name.localeCompare(y.name, 'fr'));

function subOptions(selected) {
  return `<option value="">—</option>${subList().map(x => `<option value="${esc(x)}" ${x === selected ? 'selected' : ''}>${esc(x)}</option>`).join('')}`;
}

function artistStats() {
  const m = new Map();
  for (const t of state.tracks.values()) {
    const s = m.get(t.artist_id) || { total: 0, rated: 0, fav: 0 };
    if (!t.hidden) s.total++;
    if (t.rating) s.rated++;
    if (t.favorite) s.fav++;
    m.set(t.artist_id, s);
  }
  return m;
}

async function loadData() {
  const data = await store.load();
  state.categories = data.categories;
  state.artists = data.artists.map(a => ({ album_ids: [], ...a }));
  state.tracks = new Map(data.tracks.map(t => [trackKey(t), trackDefaults(t)]));
  state.settings = { ...DEFAULT_SETTINGS, ...data.settings };
}

// ───────────────────────── Notifications, modales ─────────────────────────
function toast(msg, kind = 'info', ms = 4500) {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
}

function guard(fn) {
  return async (...args) => {
    try { return await fn(...args); } catch (e) {
      console.error(e);
      toast(e.message || String(e), 'error', 7000);
      if (e instanceof sp.SpotifyAuthError) renderAccount();
    }
  };
}

function openModal(html, { onOpen, wide = false } = {}) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="backdrop" data-act="modal-close"></div>
    <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  root.classList.add('open');
  onOpen?.(root.querySelector('.modal'));
  root.querySelector('input, button.primary')?.focus();
}
function closeModal() { const r = $('#modal-root'); r.classList.remove('open'); r.innerHTML = ''; state.membersModal = null; }
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('#modal-root').classList.contains('open')) $('#modal-root [data-act="modal-close"]')?.click();
});

function askText(title, value = '', { label = 'Nom', confirm = 'Enregistrer' } = {}) {
  return new Promise(resolve => {
    openModal(`<form class="form" id="ask-form">
      <h2>${esc(title)}</h2>
      <label>${esc(label)}<input name="v" value="${esc(value)}" required maxlength="60" autocomplete="off"></label>
      <div class="row end"><button type="button" class="ghost" data-act="modal-close">Annuler</button>
      <button class="primary">${esc(confirm)}</button></div></form>`, {
      onOpen(m) {
        m.querySelector('form').addEventListener('submit', e => {
          e.preventDefault(); const v = e.target.v.value.trim(); closeModal(); resolve(v || null);
        });
        m.parentElement.querySelectorAll('[data-act="modal-close"]').forEach(b => b.addEventListener('click', () => resolve(null)));
      },
    });
  });
}

function confirmBox(title, text, confirm = 'Supprimer') {
  return new Promise(resolve => {
    openModal(`<div class="form"><h2>${esc(title)}</h2><p>${esc(text)}</p>
      <div class="row end"><button class="ghost" data-act="modal-close">Annuler</button>
      <button class="danger" id="confirm-yes">${esc(confirm)}</button></div></div>`, {
      onOpen(m) {
        m.querySelector('#confirm-yes').addEventListener('click', () => { closeModal(); resolve(true); });
        m.parentElement.querySelectorAll('[data-act="modal-close"]').forEach(b => b.addEventListener('click', () => resolve(false)));
      },
    });
  });
}

// ───────────────────────── Rendu : en-tête ─────────────────────────
function renderTabs() {
  const v = state.view;
  const tabs = sortedCategories().map(c =>
    `<a class="tab ${v.type === 'cat' && v.id === c.id ? 'active' : ''}" href="${catHash(c.id)}">${esc(c.name)}</a>`);
  if (orphanArtists().length) tabs.push(`<a class="tab ${v.type === 'cat' && v.id === 'none' ? 'active' : ''}" href="#/cat/none">Sans onglet</a>`);
  $('#tabs').innerHTML = `${tabs.join('')}
    <button class="tab add" data-act="add-category" title="Nouvel onglet">${ICON.plus}<span class="sr">Nouvel onglet</span></button>
    <span class="tab-sep"></span>
    <a class="tab ${v.type === 'songs' ? 'active' : ''}" href="#/songs">Toutes mes chansons</a>
    <a class="tab icon ${v.type === 'settings' ? 'active' : ''}" href="#/settings" title="Réglages">${ICON.gear}<span class="sr">Réglages</span></a>`;
  $('#tabs .active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function renderAccount() {
  const el = $('#account');
  if (!sp.isConfigured()) { el.innerHTML = `<a class="pill warn" href="#/settings">Spotify non configuré</a>`; return; }
  if (!sp.isLoggedIn()) { el.innerHTML = `<button class="spotify" data-act="spotify-login">Se connecter à Spotify</button>`; return; }
  const u = state.spotifyUser;
  const img = u?.images?.[0]?.url;
  el.innerHTML = `<a class="pill ok" href="#/settings" title="Connecté à Spotify">
    ${img ? `<img src="${esc(img)}" alt="">` : '<span class="dot"></span>'}${esc(u?.display_name || 'Spotify')}</a>`;
}

function renderBanner() {
  const msgs = [];
  if (store.mode === 'local') msgs.push(`<strong>Mode local :</strong> tes données sont enregistrées dans ce navigateur seulement. Configure Supabase pour les sauvegarder en ligne (voir le guide).`);
  $('#banner').innerHTML = msgs.map(m => `<div class="banner">${m}</div>`).join('');
}

// ───────────────────────── Rendu : vues ─────────────────────────
function render() {
  renderTabs();
  renderAccount();
  const v = state.view;
  const main = $('#main');
  if (v.type === 'cat') main.innerHTML = viewCategory(v.id, v.sub);
  else if (v.type === 'artist') main.innerHTML = viewArtist(v.id);
  else if (v.type === 'songs') main.innerHTML = viewSongs();
  else if (v.type === 'settings') main.innerHTML = viewSettings();
  else main.innerHTML = viewHome();
  document.body.classList.toggle('organizing', state.organize && v.type === 'cat');
  renderDecor();
}

/** Re-rendu qui n'interrompt pas une saisie en cours (note, rang, recherche). */
function softRender() {
  const a = document.activeElement;
  if (a && a.closest('#main') && ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName)) { renderTabs(); return; }
  render();
}

function viewHome() {
  return `<section class="empty hero">
    <span class="logo big" aria-hidden="true">${ICON.butterfly}</span>
    <h1>Bienvenue, Yu Nabi <span class="sparkle" aria-hidden="true">✦</span></h1>
    <p>Commence par créer tes onglets (par génération, par type de groupe…), puis ajoute tes artistes.</p>
    <div class="chips">${QUICK_CATEGORIES.map(n => `<button class="chip" data-act="quick-cat" data-name="${esc(n)}">${ICON.plus}${esc(n)}</button>`).join('')}</div>
    <button class="primary" data-act="add-category">${ICON.plus}Autre onglet…</button>
    ${!sp.isConfigured() ? `<p class="muted small">Pour récupérer les chansons, il faudra aussi configurer Spotify — tout est expliqué dans le guide.</p>` : ''}
  </section>`;
}

function artistCard(a, stats) {
  const s = stats.get(a.id) || { total: 0, rated: 0, fav: 0 };
  const org = state.organize;
  const picked = state.orgPick.has(a.id);
  return `<article class="card artist-card ${a.excluded ? 'excluded' : ''}${org ? ' org' : ''}${picked ? ' picked' : ''}" data-id="${a.id}" ${org ? 'draggable="true"' : ''}>
      ${org ? `<label class="org-pick" title="Sélectionner"><input type="checkbox" data-act="org-pick" data-id="${a.id}" ${picked ? 'checked' : ''}><span class="sr">Sélectionner ${esc(a.name)}</span></label>
      <div class="org-arrows">
        <button class="icon-btn" data-act="org-move" data-id="${a.id}" data-dir="-1" aria-label="Avancer ${esc(a.name)}">${ICON.left}</button>
        <span class="org-grip" aria-hidden="true">${ICON.grip}</span>
        <button class="icon-btn" data-act="org-move" data-id="${a.id}" data-dir="1" aria-label="Reculer ${esc(a.name)}">${ICON.right}</button>
      </div>` : ''}
      <a class="art" href="#/artist/${a.id}" ${org ? 'draggable="false"' : ''}>${cover(a.image, 'art-img')}</a>
      <div class="card-body">
        <a class="name" href="#/artist/${a.id}">${esc(a.name)}</a>
        ${a.note ? `<div class="origin" title="${esc(originText(a))}">${ICON.heart}<span>${originHtml(a)}</span></div>` : ''}
        <div class="meta">${a.last_fetched_at ? `${plural(s.total, 'chanson')}${s.rated ? ` · <span class="gold">★ ${s.rated}</span>` : ''}${s.fav ? ` · <span class="pink">♥ ${s.fav}</span>` : ''}` : '<span class="muted">Pas encore récupéré</span>'}</div>
        <div class="card-foot">
          <label class="check small"><input type="checkbox" data-act="toggle-exclude" data-id="${a.id}" ${a.excluded ? 'checked' : ''}> Exclure</label>
          ${subList().length ? `<select class="sub-select" data-act="artist-sub" data-id="${a.id}" aria-label="Sous-catégorie de ${esc(a.name)}" title="Sous-catégorie">${subOptions(subOf(a))}</select>` : ''}
        </div>
      </div>
    </article>`;
}

function viewCategory(catId, sub = '') {
  const cat = catId === 'none' ? { id: 'none', name: 'Sans onglet' } : categoryById(catId);
  if (!cat) return viewHome();
  const all = catId === 'none' ? orphanArtists() : artistsOf(catId);
  const subs = subList();
  if (sub && sub !== SUB_NONE && !subs.includes(sub)) sub = '';
  const stats = artistStats();
  const artists = sortArtists(sub ? all.filter(a => bucketOf(a) === sub) : all, stats);
  const totals = artists.reduce((acc, a) => {
    const s = stats.get(a.id); if (s) { acc.t += s.total; acc.r += s.rated; } return acc;
  }, { t: 0, r: 0 });
  const active = artists.filter(a => !a.excluded).length;

  // Sous-onglets : Tout · GG · G · BG · B · (Sans sous-catégorie)
  const count = b => all.filter(a => bucketOf(a) === b).length;
  const none = count(SUB_NONE);
  const subtabs = subs.length ? `<nav class="subtabs" aria-label="Sous-catégories">
      <a class="subtab ${!sub ? 'active' : ''}" href="${catHash(catId, '')}">Tout <span>${all.length}</span></a>
      ${subs.map(x => `<a class="subtab ${sub === x ? 'active' : ''}" href="${catHash(catId, x)}" title="${esc(SUB_HINTS[x] || x)}">${esc(x)} <span>${count(x)}</span></a>`).join('')}
      ${none && none < all.length ? `<a class="subtab muted-tab ${sub === SUB_NONE ? 'active' : ''}" href="${catHash(catId, SUB_NONE)}">Sans sous-catégorie <span>${none}</span></a>` : ''}
    </nav>` : '';

  // « Tout » : une section par sous-catégorie dès qu'au moins un artiste est classé.
  let body;
  if (!artists.length) {
    body = `<div class="empty">
      <p>${sub ? `Aucun artiste « ${esc(subLabel(sub))} » dans cet onglet.` : 'Aucun artiste dans cet onglet pour l\u2019instant.'}</p>
      ${catId !== 'none' ? `<button class="primary" data-act="add-artist">${ICON.plus}Ajouter un artiste</button>` : ''}</div>`;
  } else if (!sub && subs.length && none < all.length) {
    body = [...subs, SUB_NONE].map(b => {
      const list = sortArtists(all.filter(a => bucketOf(a) === b), stats);
      if (!list.length) return '';
      return `<section class="sub-section">
        <h2 class="sub-title"><a href="${catHash(catId, b)}">${esc(subLabel(b))}</a> <span class="pill-count">${list.length}</span>
          ${SUB_HINTS[b] ? `<span class="muted small">${esc(SUB_HINTS[b])}</span>` : ''}</h2>
        <div class="grid">${list.map(a => artistCard(a, stats)).join('')}</div></section>`;
    }).join('');
  } else {
    body = `<div class="grid">${artists.map(a => artistCard(a, stats)).join('')}</div>`;
  }

  const cats = sortedCategories();
  const idx = cats.findIndex(c => c.id === catId);
  const scope = sub ? ` « ${subLabel(sub)} »` : '';
  return `<section class="view-head">
      <div>
        <h1>${esc(cat.name)}${sub ? ` <span class="h1-sub">· ${esc(subLabel(sub))}</span>` : ''}</h1>
        <p class="sub">${plural(artists.length, 'artiste')} · ${plural(totals.t, 'chanson')} · ${totals.r} notée${totals.r > 1 ? 's' : ''}</p>
      </div>
      <div class="actions">
        ${catId !== 'none' ? `<button class="primary" data-act="add-artist">${ICON.plus}Artiste</button>` : ''}
        <button data-act="fetch-cat" ${active ? '' : 'disabled'} title="Récupère les nouvelles sorties de tous les artistes${scope} non exclus">${ICON.refresh}Récupérer les chansons</button>
        <button data-act="playlists-cat" ${active ? '' : 'disabled'} title="Crée ou met à jour une playlist Spotify par artiste${scope}">${ICON.list}Playlists</button>
        ${catId !== 'none' ? `<details class="menu"><summary aria-label="Plus d'options">⋯</summary><div class="menu-list">
          <button data-act="rename-cat">Renommer l'onglet</button>
          ${idx > 0 ? `<button data-act="move-cat" data-dir="-1">Déplacer vers la gauche</button>` : ''}
          ${idx < cats.length - 1 ? `<button data-act="move-cat" data-dir="1">Déplacer vers la droite</button>` : ''}
          <button class="danger-text" data-act="delete-cat">Supprimer l'onglet</button></div></details>` : ''}
      </div>
    </section>
    <div class="cat-bar">
      ${subtabs}
      ${all.length ? `<div class="cat-tools">
        ${state.organize ? '' : `<label class="inline">Trier <select data-act="artist-sort" aria-label="Trier les artistes">
          ${ARTIST_SORTS.map(([v, l]) => `<option value="${v}" ${(state.settings.artistSort || 'order') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`}
        <button class="${state.organize ? 'primary' : ''}" data-act="org-toggle" title="Changer l'ordre, l'onglet ou la sous-catégorie des artistes">${state.organize ? `${ICON.check}Terminé` : `${ICON.grip}Organiser`}</button>
      </div>` : ''}
    </div>
    ${state.organize && all.length ? orgBar(catId, artists) : ''}
    ${body}`;
}

function orgBar(catId, visible) {
  const n = state.orgPick.size;
  const cats = sortedCategories();
  return `<div class="org-bar card">
    <p class="small"><strong>Mode Organiser :</strong> glisse les cartes (ou utilise les flèches) pour changer « Mon ordre ». Dans « Tout », glisser une carte dans une autre section change sa sous-catégorie.
      Coche des artistes pour les déplacer vers un autre onglet ou une autre sous-catégorie.</p>
    <div class="row wrap">
      <strong class="org-count">${n ? plural(n, 'artiste sélectionné', 'artistes sélectionnés') : 'Aucun artiste sélectionné'}</strong>
      <button class="link small" data-act="org-all" data-ids="${visible.map(a => a.id).join(',')}">Tout cocher</button>
      ${n ? `<button class="link small" data-act="org-none">Tout décocher</button>` : ''}
      <span class="grow"></span>
      <label class="inline">Onglet <select id="org-cat">${cats.map(c => `<option value="${c.id}" ${c.id === catId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      ${subList().length ? `<label class="inline">Sous-catégorie <select id="org-sub"><option value="__keep">(inchangée)</option><option value="">—</option>
        ${subList().map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('')}</select></label>` : ''}
      <button class="primary" data-act="org-apply" ${n ? '' : 'disabled'}>Déplacer</button>
    </div>
  </div>`;
}

function sortTracks(list, sort) {
  const cmp = {
    rank: rankCompare,
    rating: (a, b) => (b.rating || 0) - (a.rating || 0) || (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || rankCompare(a, b),
    'date-desc': (a, b) => String(b.release_date || '').localeCompare(String(a.release_date || '')) || (a.track_number || 0) - (b.track_number || 0),
    'date-asc': (a, b) => String(a.release_date || '').localeCompare(String(b.release_date || '')) || (a.track_number || 0) - (b.track_number || 0),
    title: (a, b) => a.name.localeCompare(b.name, 'fr'),
    artist: (a, b) => (artistById(a.artist_id)?.name || '').localeCompare(artistById(b.artist_id)?.name || '', 'fr') || rankCompare(a, b),
  }[sort] || rankCompare;
  return list.sort(cmp);
}

function matchesQuery(t, q) {
  if (!q) return true;
  const ar = artistById(t.artist_id);
  const hay = `${t.name} ${t.album_name || ''} ${t.note || ''} ${ar?.name || ''} ${ar?.note || ''}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).every(w => hay.includes(w));
}

function trackRow(t, { showArtist = false } = {}) {
  const a = showArtist ? artistById(t.artist_id) : null;
  const year = (t.release_date || '').slice(0, 4);
  const stars = [1, 2, 3, 4, 5].map(v =>
    `<button class="star ${v <= (t.rating || 0) ? 'on' : ''}" data-act="rate" data-v="${v}" aria-label="${v} étoile${v > 1 ? 's' : ''}">★</button>`).join('');
  return `<div class="track ${t.hidden ? 'is-hidden' : ''}" data-key="${esc(trackKey(t))}">
    <button class="play" data-act="play" title="Écouter">${ICON.play}</button>
    ${cover(t.album_image)}
    <div class="tinfo">
      <div class="tname" title="${esc(t.name)}">${esc(t.name)}</div>
      <div class="tsub">${a ? `<a href="#/artist/${a.id}">${esc(a.name)}</a>${a.note ? ` <span class="muted">(${esc(originText(a))})</span>` : ''} · ` : ''}${esc(t.album_name || '')}${year ? ` · ${year}` : ''}</div>
    </div>
    <div class="stars" role="group" aria-label="Note">${stars}</div>
    <button class="fav ${t.favorite ? 'on' : ''}" data-act="fav" title="Coup de cœur" aria-pressed="${!!t.favorite}">♥</button>
    <input class="rank" type="number" min="1" inputmode="numeric" data-act="rank" value="${t.rank ?? ''}" placeholder="#" title="Rang (ordre dans la playlist)" aria-label="Rang">
    <input class="note" type="text" data-act="note" value="${esc(t.note || '')}" placeholder="Note…" aria-label="Note">
    <button class="hide" data-act="hide" title="${t.hidden ? 'Réafficher' : 'Masquer cette chanson'}">${t.hidden ? ICON.eye : ICON.eyeOff}</button>
  </div>`;
}

function trackList(list, opts) {
  return `<div class="track-list">${list.map(t => trackRow(t, opts)).join('')}</div>`;
}

function viewArtist(id) {
  const a = artistById(id);
  if (!a) return `<div class="empty"><p>Artiste introuvable.</p><a href="#/">Retour</a></div>`;
  const f = state.artistFilters;
  const all = tracksOf(id);
  const hiddenCount = all.filter(t => t.hidden).length;
  const list = sortTracks(all.filter(t => (f.showHidden || !t.hidden) && matchesQuery(t, f.q)), f.sort);
  const cat = categoryById(a.category_id);
  const catOptions = sortedCategories().map(c => `<option value="${c.id}" ${c.id === a.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  const spotifyUrl = `https://open.spotify.com/artist/${encodeURIComponent(a.spotify_id)}`;
  const backId = cat ? cat.id : 'none';
  const backSub = state.catSub[backId];
  return `<a class="back" href="${catHash(backId)}">← ${esc(cat?.name || 'Sans onglet')}${backSub ? ` · ${esc(subLabel(backSub))}` : ''}</a>
    <section class="artist-hero">
      ${cover(a.image, 'hero-img')}
      <div class="hero-body">
        <h1>${esc(a.name)}</h1>
        ${a.note ? `<p class="origin big">${ICON.heart}<span>de ${originHtml(a)}</span></p>` : ''}
        ${solosOf(a).length ? `<p class="origin big">${ICON.heart}<span>En solo : ${solosOf(a).map(x => `<a href="#/artist/${x.id}">${esc(x.name)}</a>`).join(', ')}</span></p>` : ''}
        <p class="sub">${plural(all.length - hiddenCount, 'chanson')}${hiddenCount ? ` · ${hiddenCount} masquée${hiddenCount > 1 ? 's' : ''}` : ''}
          ${a.last_fetched_at ? ` · mis à jour le ${fmtDate(a.last_fetched_at)}` : ' · jamais récupéré'}</p>
        <div class="actions">
          <button class="primary" data-act="fetch-artist" data-id="${a.id}">${ICON.refresh}${a.last_fetched_at ? 'Nouvelles sorties' : 'Récupérer les chansons'}</button>
          ${a.last_fetched_at ? `<button data-act="fetch-artist" data-id="${a.id}" data-full="1" title="Revérifie toute la discographie (plus long)">Tout revérifier</button>` : ''}
          <button data-act="playlist-artist" data-id="${a.id}" ${all.length ? '' : 'disabled'}>${ICON.list}${a.playlist_id ? 'Mettre à jour la playlist' : 'Créer la playlist'}</button>
          ${a.playlist_id ? `<a class="btn" href="https://open.spotify.com/playlist/${esc(a.playlist_id)}" target="_blank" rel="noopener">${ICON.ext}Playlist</a>` : ''}
          <a class="btn" href="${spotifyUrl}" target="_blank" rel="noopener">${ICON.ext}Spotify</a>
          <button data-act="members" data-id="${a.id}" title="Photos affichées en photocards autour de la page">${ICON.image}Photos des membres${state.members.get(a.id)?.length ? ` (${state.members.get(a.id).length})` : ''}</button>
        </div>
        <div class="hero-members" id="hero-members" aria-hidden="true"></div>
        <div class="row wrap small">
          <label class="inline">Onglet <select data-act="artist-category" data-id="${a.id}">${catOptions}</select></label>
          ${subList().length ? `<label class="inline">Sous-catégorie <select data-act="artist-sub" data-id="${a.id}">${subOptions(subOf(a))}</select></label>` : ''}
          <div class="origin-edit" role="group" aria-label="Groupes d'origine">
            <span class="muted">Groupes d'origine</span>
            ${originParts(a).map((part, i) => `<span class="tag">${esc(originName(a, part))}<button data-act="origin-del" data-id="${a.id}" data-i="${i}" aria-label="Retirer ${esc(part)}">${ICON.x}</button></span>`).join('')}
            <input class="origin-input" data-act="origin-add" data-id="${a.id}" placeholder="${originParts(a).length ? '+ Autre groupe' : '+ Ajouter un groupe'}" maxlength="40" list="artist-names" aria-label="Ajouter un groupe d'origine" title="Pour un soliste ou une sous-unité : un groupe à la fois (Entrée pour valider).">
          </div>
          <datalist id="artist-names">${[...state.artists].filter(x => x.id !== a.id).sort((x, y) => x.name.localeCompare(y.name, 'fr')).map(x => `<option value="${esc(x.name)}">`).join('')}</datalist>
          <label class="check"><input type="checkbox" data-act="toggle-exclude" data-id="${a.id}" ${a.excluded ? 'checked' : ''}> Exclure des récupérations groupées</label>
          <button class="link danger-text" data-act="delete-artist" data-id="${a.id}">${ICON.trash}Supprimer l'artiste</button>
        </div>
      </div>
    </section>
    ${all.length ? `<div class="toolbar">
      <input type="search" placeholder="Filtrer les chansons…" value="${esc(f.q)}" data-filter="artist" data-key="q" aria-label="Filtrer">
      <label class="inline">Trier par <select data-filter="artist" data-key="sort">
        ${[['rank', 'Mon classement'], ['rating', 'Note'], ['date-asc', 'Date (anciennes)'], ['date-desc', 'Date (récentes)'], ['title', 'Titre']]
          .map(([v, l]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      ${hiddenCount ? `<label class="check"><input type="checkbox" data-filter="artist" data-key="showHidden" ${f.showHidden ? 'checked' : ''}> Afficher les masquées</label>` : ''}
    </div>
    ${list.length ? trackList(list) : '<div class="empty small"><p>Aucune chanson ne correspond au filtre.</p></div>'}`
    : `<div class="empty"><p>Aucune chanson pour l'instant. Clique sur « Récupérer les chansons » pour aller chercher sa discographie sur Spotify.</p></div>`}`;
}

function viewSongs() {
  const f = state.songFilters;
  const all = [...state.tracks.values()];
  const filtered = all.filter(t => {
    if (!f.showHidden && t.hidden) return false;
    if (f.fav && !t.favorite) return false;
    if (f.minRating && (t.rating || 0) < f.minRating) return false;
    if (f.category) {
      const a = artistById(t.artist_id);
      if ((a?.category_id || 'none') !== f.category) return false;
    }
    if (f.sub) {
      const a = artistById(t.artist_id);
      if (!a || bucketOf(a) !== f.sub) return false;
    }
    return matchesQuery(t, f.q);
  });
  const list = sortTracks(filtered, f.sort);
  const shown = list.slice(0, f.limit);
  const catOptions = [['', 'Tous les onglets'], ...sortedCategories().map(c => [c.id, c.name])]
    .map(([v, l]) => `<option value="${v}" ${f.category === v ? 'selected' : ''}>${esc(l)}</option>`).join('');
  return `<section class="view-head"><div><h1>Toutes mes chansons</h1>
      <p class="sub">${plural(list.length, 'chanson')}${list.length !== all.length ? ` sur ${all.length}` : ''}</p></div></section>
    <div class="toolbar">
      <input type="search" placeholder="Titre, album, artiste, note…" value="${esc(f.q)}" data-filter="songs" data-key="q" aria-label="Rechercher">
      <select data-filter="songs" data-key="category" aria-label="Onglet">${catOptions}</select>
      ${subList().length ? `<select data-filter="songs" data-key="sub" aria-label="Sous-catégorie">
        ${[['', 'Toutes les sous-catégories'], ...subList().map(x => [x, SUB_HINTS[x] ? `${x} · ${SUB_HINTS[x]}` : x]), [SUB_NONE, 'Sans sous-catégorie']]
          .map(([v, l]) => `<option value="${esc(v)}" ${f.sub === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>` : ''}
      <select data-filter="songs" data-key="minRating" aria-label="Note minimale">
        ${[0, 1, 2, 3, 4, 5].map(n => `<option value="${n}" ${f.minRating === n ? 'selected' : ''}>${n ? `★ ${n} et +` : 'Toutes les notes'}</option>`).join('')}</select>
      <label class="inline">Trier <select data-filter="songs" data-key="sort">
        ${[['rating', 'Note'], ['artist', 'Artiste'], ['date-desc', 'Date (récentes)'], ['date-asc', 'Date (anciennes)'], ['title', 'Titre']]
          .map(([v, l]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="check"><input type="checkbox" data-filter="songs" data-key="fav" ${f.fav ? 'checked' : ''}> ♥ seulement</label>
      <label class="check"><input type="checkbox" data-filter="songs" data-key="showHidden" ${f.showHidden ? 'checked' : ''}> Masquées</label>
    </div>
    ${shown.length ? trackList(shown, { showArtist: true }) : `<div class="empty"><p>${all.length ? 'Aucune chanson ne correspond aux filtres.' : 'Aucune chanson pour l’instant : ajoute des artistes et récupère leurs chansons.'}</p></div>`}
    ${list.length > shown.length ? `<div class="center"><button data-act="more-songs">Afficher ${Math.min(PAGE_SIZE, list.length - shown.length)} de plus</button></div>` : ''}`;
}

function viewSettings() {
  const s = state.settings;
  const spotifyBlock = !sp.isConfigured()
    ? `<p>Spotify n'est pas encore configuré. Ajoute ton <em>Client ID</em> dans <code>js/config.js</code> (voir le guide).</p>`
    : sp.isLoggedIn()
      ? `<p>Connecté en tant que <strong>${esc(state.spotifyUser?.display_name || '…')}</strong>.</p>
         <button data-act="spotify-logout">Se déconnecter de Spotify</button>`
      : `<button class="spotify" data-act="spotify-login">Se connecter à Spotify</button>`;
  return `<section class="view-head"><div><h1>Réglages</h1></div></section>
  <div class="settings">
    <section class="card pad">
      <h2>Spotify</h2>
      ${spotifyBlock}
      <p class="small muted">Adresse de redirection à inscrire dans le Spotify Developer Dashboard :</p>
      <code class="copy">${esc(sp.redirectUri())}</code>
    </section>

    <section class="card pad">
      <h2>Sauvegarde</h2>
      ${store.mode === 'supabase'
        ? `<p>Données enregistrées en ligne dans Supabase (${esc(store.user?.email || '')}).</p><button data-act="sb-logout">Se déconnecter</button>`
        : `<p>Mode local : données dans ce navigateur uniquement. Pour les mettre en ligne, remplis <code>SUPABASE_URL</code> et <code>SUPABASE_ANON_KEY</code> dans <code>js/config.js</code>.</p>`}
      <div class="row wrap">
        <button data-act="export">Exporter (JSON)</button>
        <label class="btn">Importer (JSON)<input type="file" accept="application/json,.json" data-act="import" hidden></label>
      </div>
      <p class="small muted">L'import remplace toutes les données actuelles. Pratique pour passer du mode local à Supabase.</p>
    </section>

    <form class="card pad form" id="settings-form">
      <h2>Sous-catégories</h2>
      <label>Les mêmes dans chaque onglet <span class="muted small">(une par ligne, dans l'ordre d'affichage)</span>
        <textarea name="subcategories" rows="4">${esc(subList().join('\n'))}</textarea></label>
      <p class="small muted">Laisse vide pour ne pas utiliser de sous-catégories. Si tu renommes une sous-catégorie, ses artistes passent dans « Sans sous-catégorie » : reclasse-les depuis leur carte.</p>

      <h2>Récupération des chansons</h2>
      <label>Mots-clés à écarter <span class="muted small">(un par ligne — cherchés seulement entre parenthèses ou après « - »)</span>
        <textarea name="keywords" rows="7">${esc((s.keywords || []).join('\n'))}</textarea></label>
      <label class="check"><input type="checkbox" name="includeCompilations" ${s.includeCompilations ? 'checked' : ''}> Inclure les compilations</label>
      <label>Doublons
        <select name="dedupeMode">
          <option value="base" ${(s.dedupeMode || 'base') === 'base' ? 'selected' : ''}>Une seule version par chanson (« CRUSH - KR » et « CRUSH - Japanese ver. » = 1)</option>
          <option value="exact" ${s.dedupeMode === 'exact' ? 'selected' : ''}>Garder toutes les versions (écarte seulement les titres identiques)</option>
          <option value="none" ${s.dedupeMode === 'none' ? 'selected' : ''}>Tout garder, même les titres identiques</option>
        </select></label>
      <p class="small muted">Après un changement, utilise « Tout revérifier » sur un artiste pour récupérer les chansons écartées avant.</p>

      <h2>Playlists</h2>
      <label>Nom des playlists <span class="muted small">({artiste} est remplacé par le nom)</span>
        <input name="playlistName" value="${esc(s.playlistName)}"></label>
      <label>Contenu
        <select name="playlistMode">
          <option value="all" ${s.playlistMode === 'all' ? 'selected' : ''}>Toutes les chansons (sauf masquées)</option>
          <option value="rated" ${s.playlistMode === 'rated' ? 'selected' : ''}>Seulement les chansons notées au moins…</option>
          <option value="favorites" ${s.playlistMode === 'favorites' ? 'selected' : ''}>Seulement mes coups de cœur ♥</option>
        </select></label>
      <label>Note minimale <select name="playlistMinRating">${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${s.playlistMinRating === n ? 'selected' : ''}>★ ${n}</option>`).join('')}</select></label>
      <p class="small muted">Ordre dans la playlist : ton rang (#), puis la note, puis la date de sortie.</p>
      <div class="row end"><button class="primary">Enregistrer</button></div>
    </form>
  </div>`;
}

function viewLogin() {
  return `<section class="login card pad">
    <span class="logo big" aria-hidden="true">${ICON.butterfly}</span>
    <h1>Connexion</h1>
    <p class="muted">Connecte-toi avec le compte créé dans Supabase.</p>
    <form class="form" id="login-form">
      <label>Courriel<input type="email" name="email" required autocomplete="email"></label>
      <label>Mot de passe<input type="password" name="password" required autocomplete="current-password"></label>
      <button class="primary">Se connecter</button>
    </form>
  </section>`;
}

// ───────────────────────── Décor : photocards autour de la page ─────────────────────────
const rand = (a, b) => a + Math.random() * (b - a);
const shuffle = arr => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const membersLoading = new Set();
const picks = new Map();        // artistId → { tag, srcs } : photo tirée pour chaque membre pendant cette visite
let membersVer = 0;

/** Ancien format { src, name } → { name, photos: [src] }. */
function normMembers(list) {
  return (Array.isArray(list) ? list : []).map(m => ({
    name: m?.name || '',
    photos: Array.isArray(m?.photos) ? m.photos.filter(Boolean) : (m?.src ? [m.src] : []),
  }));
}
function pickedPhotos(id, list) {
  const tag = `${state.visit}:${membersVer}`;
  let p = picks.get(id);
  if (!p || p.tag !== tag) {
    p = { tag, srcs: list.map(m => m.photos[Math.floor(Math.random() * m.photos.length)]) };
    picks.set(id, p);
  }
  return p.srcs;
}

function ensureMembers(id) {
  if (state.members.has(id) || membersLoading.has(id)) return;
  membersLoading.add(id);
  store.loadMembers(id).catch(() => []).then(m => {
    membersLoading.delete(id);
    m = normMembers(m);
    state.members.set(id, m);
    if (state.view.type === 'artist' && state.view.id === id) {
      decorSig = '';
      renderDecor();
      const btn = document.querySelector(`[data-act="members"][data-id="${id}"]`);
      if (btn && m.length) btn.lastChild.textContent = `Photos des membres (${m.length})`;
    }
  });
}

/** Ce qu'on affiche sur les côtés selon la vue : photos des membres, sinon pochettes / photos d'artistes. */
function decorSource() {
  const v = state.view;
  if (v.type === 'artist') {
    const m = state.members.get(v.id);
    if (m === undefined) { ensureMembers(v.id); return null; }
    if (m.some(x => x.photos.length)) {
      const srcs = pickedPhotos(v.id, m);
      return {
        key: `a:${v.id}:${picks.get(v.id).tag}`, shape: 'card',
        items: m.map((x, i) => ({ src: srcs[i], label: x.name })).filter(it => it.src),
      };
    }
    const covers = [...new Set(tracksOf(v.id).map(t => t.album_image).filter(Boolean))];
    return { key: `a:${v.id}:c${covers.length}`, shape: 'square', items: covers.map(src => ({ src })) };
  }
  if (v.type === 'cat') {
    const list = viewArtists(v).filter(a => a.image);
    return { key: `c:${v.id}:${v.sub}:${list.length}`, shape: 'square', items: list.map(a => ({ src: a.image, label: a.name })) };
  }
  if (v.type === 'songs') {
    const favs = [...new Set([...state.tracks.values()].filter(t => t.favorite && t.album_image).map(t => t.album_image))];
    return { key: `s:${favs.length}`, shape: 'square', items: favs.map(src => ({ src })) };
  }
  return { key: v.type, shape: 'square', items: [] };
}

function photocard({ src, label }, shape, small = false) {
  const card = document.createElement('figure');
  card.className = `pc ${shape}${small ? ' mini' : ''}`;
  const inner = document.createElement('div');
  inner.className = 'pc-in';
  const img = document.createElement('img');
  img.alt = '';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.referrerPolicy = 'no-referrer';
  img.onerror = () => card.remove();
  img.src = src;
  inner.append(img);
  if (label && !small) {
    const cap = document.createElement('figcaption');
    cap.textContent = label;
    inner.append(cap);
  }
  card.append(inner);
  return card;
}

let decorSig = '';
function renderDecor() {
  const src = decorSource();
  // Bandeau de photos dans l'en-tête de l'artiste (écrans étroits).
  const strip = $('#hero-members');
  if (strip && src && src.shape === 'card' && !strip.childElementCount) {
    src.items.forEach(it => {
      const c = photocard(it, 'card', true);
      c.style.setProperty('--r', `${rand(-7, 7).toFixed(1)}deg`);
      strip.append(c);
    });
  }
  const el = $('#decor');
  const vw = document.documentElement.clientWidth, vh = window.innerHeight;
  const sig = `${src?.key}|${vw}|${Math.round(vh / 40)}`;
  if (sig === decorSig) return;
  decorSig = sig;
  el.innerHTML = '';
  if (!src) return;
  const gutter = (vw - Math.min(vw, 1200)) / 2;
  if (gutter < DECOR_MIN_GUTTER) return;

  const top = 84, bottom = document.body.classList.contains('has-player') ? 110 : 24;
  const avail = vh - top - bottom;
  const items = shuffle(src.items).slice(0, src.shape === 'card' ? MAX_MEMBERS : 8);
  const ratio = src.shape === 'card' ? 1.5 : 1;
  const sides = [[], []];
  const first = Math.random() < .5 ? 0 : 1;
  items.forEach((it, i) => sides[(i + first) % 2].push(it));

  sides.forEach((list, side) => {
    const n = Math.max(list.length, 1);
    const slot = avail / n;
    const capH = src.shape === 'card' ? 34 : 14;
    let w = Math.min(gutter - 32, 170, (slot * 1.12 - capH) / ratio);
    w = Math.max(w, 64);
    list.forEach((it, i) => {
      const c = photocard(it, src.shape);
      const h = w * ratio + capH;
      let y = top + i * slot + rand(0, Math.max(0, slot - h));
      y = Math.min(y, vh - bottom - h);
      const span = Math.max(0, gutter - w - 24);
      const x = side === 0 ? 12 + rand(0, span) : vw - gutter + 12 + rand(0, span);
      c.style.cssText = `left:${x.toFixed(0)}px;top:${y.toFixed(0)}px;width:${w.toFixed(0)}px;--r:${rand(-9, 9).toFixed(1)}deg;--d:${rand(-7, 0).toFixed(1)}s;--t:${rand(5.5, 8.5).toFixed(1)}s`;
      el.append(c);
    });
  });
  // Quelques papillons qui volettent dans les marges.
  for (let i = 0; i < 3; i++) {
    const b = document.createElement('span');
    b.className = 'flutter';
    b.innerHTML = ICON.butterfly;
    const side = i % 2;
    const x = side === 0 ? rand(8, gutter - 40) : vw - gutter + rand(8, gutter - 40);
    b.style.cssText = `left:${x.toFixed(0)}px;top:${rand(top, vh - 60).toFixed(0)}px;--d:${rand(-9, 0).toFixed(1)}s;--s:${rand(.6, 1).toFixed(2)}`;
    el.append(b);
  }
}
let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(renderDecor, 200); });

// ───────────────────────── Photos des membres ─────────────────────────
function compressImage(file, max = 400) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k);
      c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', .8));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`${file.name} : image illisible (JPG, PNG ou WebP).`)); };
    img.src = url;
  });
}

function memberCard(m, i) {
  const n = m.photos.length;
  const open = state.membersOpen.has(i);
  return `<div class="member${open ? ' open' : ''}">
    <div class="member-img">
      ${n ? `<img src="${esc(m.photos[0])}" alt="" referrerpolicy="no-referrer">` : `<span class="member-empty">${ICON.image}</span>`}
      ${n > 1 ? `<button class="member-count" data-act="member-toggle" data-i="${i}" title="Voir ses photos">${ICON.shuffle} ${n}</button>` : ''}
      <button class="icon-btn member-del" data-act="member-del" data-i="${i}" aria-label="Retirer ce membre">${ICON.x}</button>
    </div>
    <input data-act="member-name" data-i="${i}" value="${esc(m.name)}" placeholder="Nom" maxlength="30" aria-label="Nom du membre">
    ${n < MAX_PHOTOS ? `<div class="member-add">
      <label class="btn small" title="Ajouter une ou plusieurs photos">${ICON.plus}Photos<input type="file" accept="image/*" multiple data-act="member-photos" data-i="${i}" hidden></label>
      <label class="btn small" title="Ajouter toutes les images d'un dossier">${ICON.folder}Dossier<input type="file" webkitdirectory directory multiple data-act="member-photos" data-i="${i}" hidden></label>
    </div>` : `<p class="small muted center">Maximum ${MAX_PHOTOS} photos</p>`}
    ${open && n > 1 ? `<div class="member-thumbs">${m.photos.map((src, j) => `<span class="mthumb">
        <img src="${esc(src)}" alt="" referrerpolicy="no-referrer">
        <button data-act="member-photo-del" data-i="${i}" data-j="${j}" aria-label="Retirer cette photo">${ICON.x}</button></span>`).join('')}</div>` : ''}
  </div>`;
}

function membersModalHtml(id) {
  const a = artistById(id);
  const list = state.members.get(id) || [];
  const missing = store.mode === 'supabase' && store.membersMissing;
  const total = list.reduce((n, m) => n + m.photos.length, 0);
  return `<div class="form">
    <div class="row between"><h2>${ICON.butterfly} Photos des membres · ${esc(a.name)}</h2><button class="icon-btn" data-act="modal-close" aria-label="Fermer">${ICON.x}</button></div>
    <p>Chaque membre peut avoir <strong>une photo</strong> ou <strong>plusieurs</strong> : à chaque visite de la page de ${esc(a.name)}, une de ses photos est tirée au hasard ${ICON.shuffle}</p>
    ${missing ? `<div class="banner flat">Une petite mise à jour de Supabase est nécessaire avant d'ajouter des photos : dans <strong>SQL Editor → New query</strong>, colle et lance :
      <code class="copy">alter table public.artists add column if not exists members jsonb not null default '[]'::jsonb;</code></div>` : ''}
    ${list.length ? `<div class="member-grid">${list.map(memberCard).join('')}</div>
      <p class="small muted">${plural(list.length, 'membre')} · ${plural(total, 'photo')}</p>` : '<p class="muted small">Aucun membre pour l’instant.</p>'}
    ${list.length < MAX_MEMBERS ? `<h2 class="sub-h">Ajouter des membres</h2>
    <div class="row wrap">
      <label class="btn primary" title="Chaque photo choisie devient un nouveau membre">${ICON.plus}Une photo par membre<input type="file" accept="image/*" multiple data-act="member-files" hidden></label>
      <label class="btn" title="Un sous-dossier par membre (ex. ITZY/Yeji, ITZY/Lia…) : le nom du sous-dossier devient le nom du membre">${ICON.folder}Dossier du groupe<input type="file" webkitdirectory directory multiple data-act="group-folder" hidden></label>
    </div>
    <div class="row wrap">
      <input type="url" id="member-url" placeholder="…ou coller le lien d'une image" class="grow">
      <button data-act="member-url">Ajouter</button>
    </div>
    <p class="small muted"><strong>Dossier du groupe :</strong> choisis un dossier qui contient un sous-dossier par membre (par exemple <code>ITZY/Yeji</code>, <code>ITZY/Lia</code>…). Chaque sous-dossier devient un membre, avec toutes ses photos. Un sous-dossier au nom d'un membre existant complète ses photos.
    Les photos sont copiées et réduites dans le site : si tu en ajoutes plus tard dans le dossier, il suffit de le réimporter.</p>`
    : `<p class="small muted">Maximum ${MAX_MEMBERS} membres par artiste.</p>`}
  </div>`;
}

/** Fichiers images d'une sélection (ignore les autres fichiers d'un dossier), triés par nom. */
function imageFiles(fileList) {
  return [...fileList].filter(f => f.type.startsWith('image/') || IMG_RE.test(f.name))
    .sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, 'fr', { numeric: true }));
}

/** Réduit une liste de fichiers ; renvoie les images lisibles et compte les autres. */
async function compressAll(files) {
  if (files.length > 3) toast(`Préparation de ${files.length} photos…`, 'info', 2500);
  const out = [];
  let failed = 0;
  for (const f of files) {
    try { out.push(await compressImage(f)); } catch { failed++; }
  }
  if (failed) toast(`${plural(failed, 'image ignorée', 'images ignorées')} (format non lu, par ex. HEIC : convertis-les en JPG).`, 'error', 7000);
  return out;
}

function warnIfHeavy(list) {
  const kb = JSON.stringify(list).length / 1024;
  if (kb > 6000) toast(`Attention : ${Math.round(kb / 1024)} Mo de photos pour ce groupe, la page mettra plus de temps à s'ouvrir.`, 'info', 7000);
}

function openMembers(id) {
  state.membersModal = id;
  state.membersOpen.clear();
  const show = () => openModal(membersModalHtml(id), { wide: true });
  if (state.members.has(id)) show();
  else store.loadMembers(id).catch(() => []).then(m => { state.members.set(id, normMembers(m)); show(); });
}

function refreshMembersModal() {
  const m = $('#modal-root .modal');
  if (m && state.membersModal) m.innerHTML = membersModalHtml(state.membersModal);
}

async function saveMembers(id, list) {
  const before = state.members.get(id) || [];
  state.members.set(id, list);
  membersVer++;
  try { await store.saveMembers(id, list); } catch (e) { state.members.set(id, before); refreshMembersModal(); throw e; }
  refreshMembersModal();
  if (state.view.type === 'artist' && state.view.id === id) { decorSig = ''; render(); }
}

// ───────────────────────── Navigation ─────────────────────────
function route() {
  state.visit++;
  const [, type, id, rawSub] = (location.hash || '#/').split('/');
  if (type === 'cat' && (id === 'none' || categoryById(id))) {
    let sub = '';
    try { sub = decodeURIComponent(rawSub || ''); } catch { sub = ''; }
    if (sub && sub !== SUB_NONE && !subList().includes(sub)) sub = '';
    state.catSub[id] = sub;
    if (state.view.type !== 'cat' || state.view.id !== id) { state.organize = false; state.orgPick.clear(); }
    state.view = { type: 'cat', id, sub };
  }
  else if (type === 'artist' && artistById(id)) {
    if (state.view.type !== 'artist' || state.view.id !== id) state.artistFilters = { q: '', showHidden: false, sort: 'rank' };
    state.view = { type: 'artist', id };
  } else if (type === 'songs') state.view = { type: 'songs' };
  else if (type === 'settings') state.view = { type: 'settings' };
  else {
    const first = sortedCategories()[0];
    state.view = first ? { type: 'cat', id: first.id, sub: state.catSub[first.id] || '' } : { type: 'home' };
  }
  if (state.view.type !== 'cat') { state.organize = false; state.orgPick.clear(); }
  if (!state.job) hideProgress();
  render();
  window.scrollTo(0, 0);
}
const go = hash => { if (location.hash === hash) route(); else location.hash = hash; };

// ───────────────────────── Actions : onglets & artistes ─────────────────────────
async function addCategory(name) {
  if (!name) return;
  const c = { id: uuid(), name, position: Math.max(-1, ...state.categories.map(c => c.position ?? 0)) + 1 };
  await store.saveCategory(c);
  state.categories.push(c);
  go(`#/cat/${c.id}`);
}

async function moveCategory(dir) {
  const cats = sortedCategories();
  const i = cats.findIndex(c => c.id === state.view.id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= cats.length) return;
  [cats[i], cats[j]] = [cats[j], cats[i]];
  cats.forEach((c, k) => { c.position = k; });
  await Promise.all(cats.map(c => store.saveCategory(c)));
  render();
}

function openAddArtist(catId) {
  if (!sp.isConfigured()) { toast('Configure d’abord Spotify (voir Réglages).', 'error'); return; }
  if (!sp.isLoggedIn()) { toast('Connecte-toi à Spotify pour chercher des artistes.', 'error'); return; }
  openModal(`<div class="form">
      <div class="row between"><h2>Ajouter un artiste</h2><button class="icon-btn" data-act="modal-close" aria-label="Fermer">${ICON.x}</button></div>
      <input type="search" id="artist-q" placeholder="Nom de l'artiste ou lien Spotify…" autocomplete="off">
      <div class="row wrap">
        ${subList().length ? `<label class="inline">Sous-catégorie <select id="artist-sub">${subOptions(state.view.type === 'cat' && state.view.sub !== SUB_NONE ? state.view.sub : '')}</select></label>` : ''}
        <label class="check small"><input type="checkbox" id="artist-fetch" checked> Récupérer ses chansons tout de suite</label>
      </div>
      <div id="artist-results" class="results"><p class="muted small">Tape un nom pour chercher sur Spotify.</p></div>
    </div>`, {
    wide: true,
    onOpen(m) {
      const input = m.querySelector('#artist-q');
      const out = m.querySelector('#artist-results');
      let timer, seq = 0;
      const show = items => {
        if (!items.length) { out.innerHTML = '<p class="muted small">Aucun résultat.</p>'; return; }
        out.innerHTML = items.map(it => {
          const already = state.artists.find(a => a.spotify_id === it.id);
          return `<div class="result">
            ${cover(pickImage(it.images, 160), 'result-img')}
            <div class="tinfo"><div class="tname">${esc(it.name)}</div>
              <div class="tsub">${esc((it.genres || []).slice(0, 3).join(', ') || 'Artiste')}</div></div>
            ${already ? `<span class="muted small">Déjà dans « ${esc(categoryById(already.category_id)?.name || 'Sans onglet')} »</span>`
              : `<button class="primary small" data-pick="${esc(it.id)}">Ajouter</button>`}
          </div>`;
        }).join('');
        out.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', guard(async () => {
          const it = items.find(x => x.id === b.dataset.pick);
          b.disabled = true;
          await addArtist(it, catId, m.querySelector('#artist-fetch').checked, m.querySelector('#artist-sub')?.value || '');
        })));
      };
      const search = guard(async () => {
        const q = input.value.trim();
        const my = ++seq;
        if (q.length < 2) { out.innerHTML = '<p class="muted small">Tape un nom pour chercher sur Spotify.</p>'; return; }
        out.innerHTML = '<p class="muted small">Recherche…</p>';
        const idMatch = q.match(/artist[/:]([A-Za-z0-9]{22})/) || q.match(/^([A-Za-z0-9]{22})$/);
        const items = idMatch ? [await sp.getArtist(idMatch[1])] : await sp.searchArtists(q);
        if (my === seq) show(items);
      });
      input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 350); });
    },
  });
}

async function addArtist(it, catId, fetchNow, sub = '') {
  const a = {
    id: uuid(), category_id: catId, spotify_id: it.id, name: it.name, image: pickImage(it.images),
    excluded: false, playlist_id: null, album_ids: [], last_fetched_at: null, note: null,
    position: artistsOf(catId).length,
  };
  await store.saveArtist(a);
  state.artists.push(a);
  if (sub) await setSub([a.id], sub);
  closeModal();
  toast(`${a.name} ajouté.`);
  render();
  if (fetchNow) guard(runFetch)([a]);
}

async function deleteArtist(id) {
  const a = artistById(id);
  if (!a) return;
  const n = tracksOf(id).length;
  if (!await confirmBox(`Supprimer ${a.name} ?`, `Ses ${n} chansons, notes et classements seront supprimés du site (la playlist Spotify, elle, reste).`)) return;
  await store.deleteArtist(id);
  state.artists = state.artists.filter(x => x.id !== id);
  if (subOf(a)) await setSub([id], '');
  for (const [k, t] of state.tracks) if (t.artist_id === id) state.tracks.delete(k);
  go(catHash(a.category_id || 'none'));
}

async function saveArtist(a) { await store.saveArtist(a); }

// ───────────────────────── Récupération des chansons ─────────────────────────
let progressTimer;
function showProgress({ title, line = '', pct = 0, done = false }) {
  const el = $('#progress');
  el.hidden = false;
  clearTimeout(progressTimer);
  if (done) progressTimer = setTimeout(() => { if (!state.job) hideProgress(); }, 8000);
  el.innerHTML = `<div class="row between"><strong>${esc(title)}</strong>
      ${done ? `<button class="icon-btn" data-act="close-progress" aria-label="Fermer">${ICON.x}</button>` : `<button class="link small" data-act="cancel-job">Annuler</button>`}</div>
    <div class="line">${esc(line)}</div>
    <div class="bar"><span style="width:${Math.round(pct * 100)}%"></span></div>`;
}
function hideProgress() { $('#progress').hidden = true; }

function startJob() {
  if (state.job) { toast('Une opération est déjà en cours.', 'error'); return null; }
  if (!sp.isConfigured()) { toast('Configure d’abord Spotify (voir Réglages).', 'error'); return null; }
  if (!sp.isLoggedIn()) { toast('Connecte-toi à Spotify d’abord.', 'error'); return null; }
  state.job = { cancel: false };
  return state.job;
}

async function fetchArtist(artist, { full = false, job, report }) {
  const groups = state.settings.includeCompilations ? 'album,single,compilation' : 'album,single';
  report(`${artist.name} : liste des sorties…`, 0);
  const albums = await sp.getArtistAlbums(artist.spotify_id, groups);
  const known = new Set(full ? [] : artist.album_ids || []);
  const todo = albums.filter(al => !known.has(al.id));
  const done = [];
  for (let i = 0; i < todo.length; i++) {
    if (job.cancel) break;
    report(`${artist.name} : ${i + 1}/${todo.length} — ${todo[i].name}`, (i + 1) / (todo.length + 1));
    done.push({ ...todo[i], tracks: await sp.getAlbumTracks(todo[i].id) });
  }
  const existing = tracksOf(artist.id);
  const mode = state.settings.dedupeMode || 'base';
  const existingKeys = new Set(existing.map(t => dedupeKey(t.name, mode)).filter(k => k !== null));
  const res = processDiscography(artist.spotify_id, done, state.settings.keywords, existingKeys, mode);
  const fresh = res.kept
    .map(t => trackDefaults({ ...t, artist_id: artist.id }))
    .filter(t => !state.tracks.has(trackKey(t)));
  if (fresh.length) await store.insertTracks(fresh);
  for (const t of fresh) state.tracks.set(trackKey(t), t);
  artist.album_ids = [...new Set([...(full ? [] : artist.album_ids || []), ...done.map(al => al.id)])];
  if (!job.cancel || done.length) artist.last_fetched_at = new Date().toISOString();
  await saveArtist(artist);
  return { added: fresh.length, filtered: res.filtered, releases: done.length };
}

async function runFetch(artists, { full = false } = {}) {
  const job = startJob();
  if (!job) return;
  let added = 0, releases = 0, errors = 0;
  try {
    for (let i = 0; i < artists.length && !job.cancel; i++) {
      const base = i / artists.length;
      const report = (line, p) => showProgress({ title: `Récupération ${i + 1}/${artists.length}`, line, pct: base + p / artists.length });
      try {
        const r = await fetchArtist(artists[i], { full, job, report });
        added += r.added; releases += r.releases;
      } catch (e) {
        if (e instanceof sp.SpotifyAuthError) throw e;
        errors++;
        console.error(e);
        toast(`${artists[i].name} : ${e.message}`, 'error', 7000);
      }
      softRender();
    }
    showProgress({
      title: job.cancel ? 'Récupération annulée' : 'Récupération terminée', done: true, pct: 1,
      line: `${plural(added, 'nouvelle chanson', 'nouvelles chansons')} · ${plural(releases, 'sortie vérifiée', 'sorties vérifiées')}${errors ? ` · ${errors} erreur(s)` : ''}`,
    });
  } catch (e) {
    hideProgress();
    throw e;
  } finally {
    state.job = null;
    softRender();
  }
}

async function syncPlaylist(artist) {
  const tracks = playlistTracks(tracksOf(artist.id), state.settings);
  if (!tracks.length) return { skipped: true };
  const name = (state.settings.playlistName || '{artiste}').replaceAll('{artiste}', artist.name);
  const desc = `Générée par Tableau K-pop · ${tracks.length} chansons · mise à jour le ${fmtDate(new Date().toISOString())}`;
  let id = artist.playlist_id;
  if (id && !(await sp.playlistStillSaved(id))) id = null;
  if (id) {
    try { await sp.updatePlaylistDetails(id, name, desc); } catch (e) { if ([403, 404].includes(e.status)) id = null; else throw e; }
  }
  if (!id) {
    const p = await sp.createPlaylist(name, desc);
    id = p.id;
    artist.playlist_id = id;
    await saveArtist(artist);
  }
  await sp.replacePlaylistItems(id, tracks.map(t => `spotify:track:${t.id}`));
  return { count: tracks.length, id };
}

async function runPlaylists(artists) {
  const job = startJob();
  if (!job) return;
  let made = 0, skipped = 0;
  try {
    for (let i = 0; i < artists.length && !job.cancel; i++) {
      showProgress({ title: `Playlists ${i + 1}/${artists.length}`, line: artists[i].name, pct: i / artists.length });
      try {
        const r = await syncPlaylist(artists[i]);
        if (r.skipped) skipped++; else made++;
      } catch (e) {
        if (e instanceof sp.SpotifyAuthError) throw e;
        toast(`${artists[i].name} : ${e.message}`, 'error', 7000);
      }
    }
    showProgress({
      title: job.cancel ? 'Playlists annulées' : 'Playlists à jour', done: true, pct: 1,
      line: `${plural(made, 'playlist mise à jour', 'playlists mises à jour')}${skipped ? ` · ${skipped} sans chanson à ajouter` : ''}`,
    });
  } catch (e) { hideProgress(); throw e; } finally { state.job = null; softRender(); }
}

// ───────────────────────── Chansons : notes, rangs… ─────────────────────────
async function patchTrack(key, patch, { rerow = true } = {}) {
  const t = state.tracks.get(key);
  if (!t) return;
  Object.assign(t, patch);
  if (rerow) {
    const row = document.querySelector(`.track[data-key="${CSS.escape(key)}"]`);
    if (row) {
      const showArtist = state.view.type === 'songs';
      row.outerHTML = trackRow(t, { showArtist });
    }
  }
  await store.updateTrack(t, patch);
}

function play(trackId) {
  const el = $('#player');
  el.hidden = false;
  el.innerHTML = `<iframe title="Lecteur Spotify" src="https://open.spotify.com/embed/track/${encodeURIComponent(trackId)}?utm_source=generator" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>
    <button class="icon-btn" data-act="close-player" aria-label="Fermer le lecteur">${ICON.x}</button>`;
  document.body.classList.add('has-player');
  decorSig = ''; renderDecor();
}

// ───────────────────────── Import / export ─────────────────────────
async function exportJson() {
  const members = await store.loadAllMembers();
  const data = {
    app: 'tableau-kpop', version: 1, exported_at: new Date().toISOString(),
    categories: state.categories, artists: state.artists.map(a => ({ ...a, members: members.get(a.id) || [] })), tracks: [...state.tracks.values()], settings: state.settings,
  };
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tableau-kpop-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importJson(file) {
  const data = JSON.parse(await file.text());
  if (data.app !== 'tableau-kpop') throw new Error('Ce fichier ne vient pas de Tableau K-pop.');
  if (!await confirmBox('Importer ce fichier ?', `${data.artists?.length || 0} artistes et ${data.tracks?.length || 0} chansons remplaceront toutes les données actuelles.`, 'Importer')) return;
  await store.importAll(data);
  for (const a of data.artists || []) {
    if (a.members?.length) {
      try { await store.saveMembers(a.id, a.members); } catch (e) { toast(e.message, 'error', 8000); break; }
    }
  }
  state.members.clear();
  await loadData();
  toast('Import terminé.');
  go('#/');
}

// ───────────────────────── Événements ─────────────────────────
const actions = {
  'add-category': async () => addCategory(await askText('Nouvel onglet', '', { confirm: 'Créer' })),
  'quick-cat': async el => addCategory(el.dataset.name),
  'rename-cat': async () => {
    const c = categoryById(state.view.id);
    const name = await askText('Renommer l’onglet', c.name);
    if (!name) return;
    c.name = name; await store.saveCategory(c); render();
  },
  'move-cat': async el => moveCategory(Number(el.dataset.dir)),
  'delete-cat': async () => {
    const c = categoryById(state.view.id);
    if (artistsOf(c.id).length) { toast('Déplace ou supprime d’abord les artistes de cet onglet.', 'error'); return; }
    if (!await confirmBox(`Supprimer l'onglet « ${c.name} » ?`, 'L’onglet est vide, rien d’autre ne sera supprimé.')) return;
    await store.deleteCategory(c.id);
    state.categories = state.categories.filter(x => x.id !== c.id);
    go('#/');
  },
  'add-artist': async () => openAddArtist(state.view.id),
  'fetch-cat': async () => {
    await runFetch(viewArtists(state.view).filter(a => !a.excluded));
  },
  'playlists-cat': async () => {
    const list = viewArtists(state.view).filter(a => !a.excluded && tracksOf(a.id).length);
    if (!list.length) { toast('Aucun artiste avec des chansons dans cet onglet.', 'error'); return; }
    await runPlaylists(list);
  },
  'fetch-artist': async el => runFetch([artistById(el.dataset.id)], { full: el.dataset.full === '1' }),
  'playlist-artist': async el => runPlaylists([artistById(el.dataset.id)]),
  'delete-artist': async el => deleteArtist(el.dataset.id),
  'spotify-login': async () => sp.login(),
  'spotify-logout': async () => { sp.logout(); state.spotifyUser = null; render(); toast('Déconnecté de Spotify.'); },
  'sb-logout': async () => { await store.signOut(); location.reload(); },
  'cancel-job': async () => { if (state.job) state.job.cancel = true; },
  'close-progress': async () => hideProgress(),
  'close-player': async () => { const p = $('#player'); p.hidden = true; p.innerHTML = ''; document.body.classList.remove('has-player'); decorSig = ''; renderDecor(); },
  'modal-close': async () => closeModal(),
  'export': async () => exportJson(),
  'more-songs': async () => { state.songFilters.limit += PAGE_SIZE; render(); },
  'members': async el => openMembers(el.dataset.id),
  'origin-del': async el => {
    const a = artistById(el.dataset.id);
    await saveOrigins(a, originParts(a).filter((_, i) => i !== Number(el.dataset.i)));
  },
  'org-toggle': async () => { state.organize = !state.organize; state.orgPick.clear(); render(); },
  'org-all': async el => { el.dataset.ids.split(',').filter(Boolean).forEach(id => state.orgPick.add(id)); render(); },
  'org-none': async () => { state.orgPick.clear(); render(); },
  'org-move': async el => {
    // Échange avec la carte voisine affichée (dans la même grille / section).
    const card = el.closest('.artist-card');
    const dir = Number(el.dataset.dir);
    const other = dir < 0 ? card.previousElementSibling : card.nextElementSibling;
    if (!other?.dataset.id) return;
    await placeArtist(el.dataset.id, other.dataset.id, dir > 0);
    render();
    document.querySelector(`.artist-card[data-id="${CSS.escape(el.dataset.id)}"] [data-act="org-move"][data-dir="${dir}"]`)?.focus();
  },
  'org-apply': async () => {
    const ids = [...state.orgPick].filter(artistById);
    if (!ids.length) return;
    const catId = $('#org-cat').value;
    const sub = $('#org-sub')?.value ?? '__keep';
    let end = catList(catId).length;
    const moved = [];
    for (const id of ids) {
      const a = artistById(id);
      if (a.category_id !== catId) { a.category_id = catId; a.position = end++; moved.push(a); }
    }
    await Promise.all(moved.map(a => store.saveArtist(a)));
    if (sub !== '__keep') await setSub(ids, sub);
    state.orgPick.clear();
    const where = `${categoryById(catId)?.name || ''}${sub !== '__keep' ? ` · ${sub || 'sans sous-catégorie'}` : ''}`;
    toast(`${plural(ids.length, 'artiste déplacé', 'artistes déplacés')} vers ${where}.`);
    render();
  },
  'member-del': async el => {
    const id = state.membersModal;
    const list = [...(state.members.get(id) || [])];
    list.splice(Number(el.dataset.i), 1);
    state.membersOpen.clear();
    await saveMembers(id, list);
  },
  'member-photo-del': async el => {
    const id = state.membersModal;
    const i = Number(el.dataset.i), j = Number(el.dataset.j);
    const list = (state.members.get(id) || []).map((m, k) => k === i ? { ...m, photos: m.photos.filter((_, x) => x !== j) } : m);
    await saveMembers(id, list);
  },
  'member-toggle': async el => {
    const i = Number(el.dataset.i);
    if (state.membersOpen.has(i)) state.membersOpen.delete(i); else state.membersOpen.add(i);
    refreshMembersModal();
  },
  'member-url': async () => {
    const id = state.membersModal;
    const url = $('#member-url')?.value.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) { toast('Colle un lien qui commence par https://', 'error'); return; }
    await saveMembers(id, [...(state.members.get(id) || []), { name: '', photos: [url] }].slice(0, MAX_MEMBERS));
  },

  // Lignes de chansons
  'play': async (el, key) => play(state.tracks.get(key).id),
  'rate': async (el, key) => {
    const v = Number(el.dataset.v);
    await patchTrack(key, { rating: state.tracks.get(key).rating === v ? 0 : v });
  },
  'fav': async (el, key) => patchTrack(key, { favorite: !state.tracks.get(key).favorite }),
  'hide': async (el, key) => patchTrack(key, { hidden: !state.tracks.get(key).hidden }),
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.tagName === 'INPUT' || el.tagName === 'SELECT') return;
  const fn = actions[el.dataset.act];
  if (!fn) return;
  if (el.tagName === 'A') return;
  e.preventDefault();
  el.closest('details')?.removeAttribute('open');
  const key = el.closest('.track')?.dataset.key;
  guard(fn)(el, key);
});

document.addEventListener('change', guard(async e => {
  const el = e.target;
  const act = el.dataset.act;
  const key = el.closest('.track')?.dataset.key;
  if (act === 'rank') {
    const n = parseInt(el.value, 10);
    await patchTrack(key, { rank: Number.isFinite(n) && n > 0 ? n : null }, { rerow: false });
  } else if (act === 'note') {
    await patchTrack(key, { note: el.value.trim() || null }, { rerow: false });
  } else if (act === 'toggle-exclude') {
    const a = artistById(el.dataset.id); a.excluded = el.checked; await saveArtist(a);
    el.closest('.artist-card')?.classList.toggle('excluded', el.checked);
  } else if (act === 'org-pick') {
    if (el.checked) state.orgPick.add(el.dataset.id); else state.orgPick.delete(el.dataset.id);
    el.closest('.artist-card')?.classList.toggle('picked', el.checked);
    const bar = document.querySelector('.org-bar');
    if (bar) {
      const n = state.orgPick.size;
      bar.querySelector('.org-count').textContent = n ? plural(n, 'artiste sélectionné', 'artistes sélectionnés') : 'Aucun artiste sélectionné';
      bar.querySelector('[data-act="org-apply"]').disabled = !n;
    }
  } else if (act === 'artist-sort') {
    state.settings = { ...state.settings, artistSort: el.value };
    render();
    await store.saveSettings(state.settings);
  } else if (act === 'origin-add') {
    await addOrigins(el);
  } else if (act === 'artist-sub') {
    const a = artistById(el.dataset.id);
    await setSub([a.id], el.value);
    toast(el.value ? `${a.name} → ${el.value}` : `${a.name} : sans sous-catégorie`);
    if (state.view.type === 'cat') render();
  } else if (act === 'artist-category') {
    const a = artistById(el.dataset.id); a.category_id = el.value; a.position = artistsOf(el.value).length;
    await saveArtist(a); toast(`${a.name} déplacé dans « ${categoryById(el.value)?.name} ».`); render();
  } else if (act === 'member-files') {
    // Chaque photo choisie = un nouveau membre.
    const id = state.membersModal;
    const files = imageFiles(el.files).slice(0, MAX_MEMBERS - (state.members.get(id) || []).length);
    el.value = '';
    const srcs = await compressAll(files);
    if (srcs.length) await saveMembers(id, [...(state.members.get(id) || []), ...srcs.map(src => ({ name: '', photos: [src] }))]);
  } else if (act === 'member-photos') {
    // Photos (ou dossier) ajoutées à un membre existant.
    const id = state.membersModal;
    const i = Number(el.dataset.i);
    const cur = state.members.get(id)?.[i];
    const all = imageFiles(el.files);
    el.value = '';
    if (!cur) return;
    if (!all.length) { toast('Aucune image trouvée dans cette sélection.', 'error'); return; }
    const room = MAX_PHOTOS - cur.photos.length;
    if (all.length > room) toast(`Seules les ${room} premières images sont gardées (maximum ${MAX_PHOTOS} par membre).`, 'info', 6000);
    const srcs = await compressAll(all.slice(0, room));
    const list = state.members.get(id).map((m, k) => k === i ? { ...m, photos: [...m.photos, ...srcs] } : m);
    if (srcs.length) { state.membersOpen.add(i); warnIfHeavy(list); await saveMembers(id, list); }
  } else if (act === 'group-folder') {
    // Dossier du groupe : un sous-dossier par membre ; les images posées à la racine = un membre chacune.
    const id = state.membersModal;
    const all = imageFiles(el.files);
    el.value = '';
    if (!all.length) { toast('Aucune image trouvée dans ce dossier.', 'error'); return; }
    const groups = new Map();
    const loose = [];
    for (const f of all) {
      const parts = (f.webkitRelativePath || f.name).split('/');
      if (parts.length >= 3) {
        const name = parts[1].trim();
        if (!groups.has(name)) groups.set(name, []);
        groups.get(name).push(f);
      } else loose.push(f);
    }
    const list = (state.members.get(id) || []).map(m => ({ ...m, photos: [...m.photos] }));
    let skipped = 0;
    for (const [name, files] of groups) {
      let m = list.find(x => x.name.toLowerCase() === name.toLowerCase());
      if (!m) {
        if (list.length >= MAX_MEMBERS) { skipped++; continue; }
        m = { name: name.slice(0, 30), photos: [] };
        list.push(m);
      }
      m.photos.push(...await compressAll(files.slice(0, MAX_PHOTOS - m.photos.length)));
    }
    for (const src of await compressAll(loose.slice(0, Math.max(0, MAX_MEMBERS - list.length)))) list.push({ name: '', photos: [src] });
    if (skipped) toast(`${plural(skipped, 'sous-dossier ignoré', 'sous-dossiers ignorés')} (maximum ${MAX_MEMBERS} membres).`, 'info', 6000);
    const cleaned = list.filter(m => m.photos.length);
    warnIfHeavy(cleaned);
    await saveMembers(id, cleaned);
    toast(`${plural(groups.size, 'membre importé', 'membres importés')}${loose.length ? ` · ${plural(Math.min(loose.length, MAX_MEMBERS), 'photo seule', 'photos seules')}` : ''}.`);
  } else if (act === 'member-name') {
    const id = state.membersModal;
    const list = (state.members.get(id) || []).map((m, i) => i === Number(el.dataset.i) ? { ...m, name: el.value.trim() } : m);
    state.members.set(id, list);
    await store.saveMembers(id, list);
    if (state.view.type === 'artist' && state.view.id === id) { decorSig = ''; renderDecor(); }
  } else if (act === 'import') {
    if (el.files[0]) await importJson(el.files[0]);
    el.value = '';
  } else if (el.dataset.filter && el.type !== 'search') {
    applyFilter(el);
  }
}));

document.addEventListener('input', e => {
  const el = e.target;
  // Suggestion choisie dans la liste : on l'ajoute tout de suite.
  if (el.dataset?.act === 'origin-add' && (e.inputType === 'insertReplacementText' || !e.inputType)
    && [...(el.list?.options || [])].some(o => o.value === el.value)) { guard(addOrigins)(el); return; }
  if (el.dataset.filter && el.type === 'search') {
    clearTimeout(el._t);
    el._t = setTimeout(() => {
      applyFilter(el);
      const again = document.querySelector(`[data-filter="${el.dataset.filter}"][data-key="q"]`);
      if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
    }, 250);
  }
});

function applyFilter(el) {
  const target = el.dataset.filter === 'songs' ? state.songFilters : state.artistFilters;
  const k = el.dataset.key;
  if (el.type === 'checkbox') target[k] = el.checked;
  else if (k === 'minRating') target[k] = Number(el.value);
  else target[k] = el.value;
  if (el.dataset.filter === 'songs') target.limit = PAGE_SIZE;
  render();
}

// Entrée dans « + Ajouter un groupe » : valide (l'événement change s'en charge).
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.dataset?.act === 'origin-add') {
    e.preventDefault();
    const el = e.target;
    guard(addOrigins)(el).then(() => (document.querySelector(`[data-act="origin-add"][data-id="${CSS.escape(el.dataset.id)}"]`) || el).focus());
  }
});

// Enter dans un champ rang/note : valide et passe à la ligne suivante.
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || !['rank', 'note'].includes(e.target.dataset.act)) return;
  e.preventDefault();
  const row = e.target.closest('.track');
  const next = row?.nextElementSibling?.querySelector(`[data-act="${e.target.dataset.act}"]`);
  e.target.blur();
  next?.focus();
});

document.addEventListener('submit', guard(async e => {
  if (e.target.id === 'settings-form') {
    e.preventDefault();
    const f = new FormData(e.target);
    state.settings = {
      ...state.settings,
      subcategories: [...new Set(String(f.get('subcategories') || '').split(/[\n,]/).map(x => x.trim().slice(0, 20)).filter(Boolean))],
      keywords: String(f.get('keywords') || '').split(/[\n,]/).map(s => s.trim()).filter(Boolean),
      includeCompilations: f.get('includeCompilations') === 'on',
      dedupeMode: ['base', 'exact', 'none'].includes(f.get('dedupeMode')) ? f.get('dedupeMode') : 'base',
      playlistName: String(f.get('playlistName') || '').trim() || DEFAULT_SETTINGS.playlistName,
      playlistMode: f.get('playlistMode'),
      playlistMinRating: Number(f.get('playlistMinRating')),
    };
    await store.saveSettings(state.settings);
    toast('Réglages enregistrés.');
  } else if (e.target.id === 'login-form') {
    e.preventDefault();
    const f = new FormData(e.target);
    await store.signIn(String(f.get('email')), String(f.get('password')));
    await start();
  }
}));

// Glisser-déposer des cartes en mode Organiser (ordinateur ; sur téléphone : flèches).
let dragId = null;
document.addEventListener('dragstart', e => {
  const card = e.target.closest?.('.artist-card.org');
  if (!card) return;
  dragId = card.dataset.id;
  card.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragId);
});
document.addEventListener('dragend', () => {
  dragId = null;
  document.querySelectorAll('.dragging, .drop-before, .drop-after').forEach(x => x.classList.remove('dragging', 'drop-before', 'drop-after'));
});
const dropSide = (card, e) => { const r = card.getBoundingClientRect(); return e.clientX > r.left + r.width / 2; };
document.addEventListener('dragover', e => {
  const card = dragId && e.target.closest?.('.artist-card.org');
  if (!card || card.dataset.id === dragId) return;
  e.preventDefault();
  const after = dropSide(card, e);
  document.querySelectorAll('.drop-before, .drop-after').forEach(x => x !== card && x.classList.remove('drop-before', 'drop-after'));
  card.classList.toggle('drop-after', after);
  card.classList.toggle('drop-before', !after);
});
document.addEventListener('drop', guard(async e => {
  const card = dragId && e.target.closest?.('.artist-card.org');
  if (!card || card.dataset.id === dragId) return;
  e.preventDefault();
  const id = dragId, target = artistById(card.dataset.id), a = artistById(id);
  await placeArtist(id, target.id, dropSide(card, e));
  // Déposé dans une autre section de « Tout » : prend sa sous-catégorie.
  if (card.closest('.sub-section') && bucketOf(a) !== bucketOf(target)) {
    const b = bucketOf(target);
    await setSub([id], b === SUB_NONE ? '' : b);
    toast(`${a.name} → ${subLabel(b)}`);
  }
  render();
}));

window.addEventListener('hashchange', route);
sp.setRateLimitListener(s => toast(`Spotify demande une pause de ${s} s… la récupération reprendra toute seule.`, 'info', Math.max(3000, s * 1000)));

// ───────────────────────── Démarrage ─────────────────────────
async function start() {
  await loadData();
  renderBanner();
  route();
  if (sp.isConfigured() && sp.isLoggedIn()) {
    sp.me().then(u => { state.spotifyUser = u; renderAccount(); if (state.view.type === 'settings') render(); })
      .catch(e => { if (e instanceof sp.SpotifyAuthError) renderAccount(); });
  }
}

(async function boot() {
  try {
    if (sp.isConfigured() && await sp.handleRedirect()) toast('Connecté à Spotify !');
  } catch (e) { toast(e.message, 'error', 7000); }
  try {
    const info = await store.init();
    if (store.mode === 'supabase' && !info.ready) {
      renderAccount();
      $('#main').innerHTML = viewLogin();
      return;
    }
    await start();
  } catch (e) {
    console.error(e);
    $('#main').innerHTML = `<div class="empty"><h2>Impossible de charger les données</h2><p>${esc(e.message)}</p></div>`;
  }
})();
