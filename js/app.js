// Tableau K-pop — interface principale.
import { CONFIG } from './config.js';
import * as sp from './spotify.js';
import { createStore, trackKey, trackDefaults } from './store.js';
import { DEFAULT_KEYWORDS, processDiscography, normalizeKey, playlistTracks, rankCompare, pickImage } from './fetcher.js';

const DEFAULT_SETTINGS = {
  keywords: DEFAULT_KEYWORDS,
  includeCompilations: false,
  playlistMode: 'all',          // all | rated | favorites
  playlistMinRating: 3,
  playlistName: '{artiste} · Tableau K-pop',
};
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
  songFilters: { q: '', category: '', minRating: 0, fav: false, showHidden: false, sort: 'rating', limit: PAGE_SIZE },
  artistFilters: { q: '', showHidden: false, sort: 'rank' },
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
function closeModal() { const r = $('#modal-root'); r.classList.remove('open'); r.innerHTML = ''; }
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
    `<a class="tab ${v.type === 'cat' && v.id === c.id ? 'active' : ''}" href="#/cat/${c.id}">${esc(c.name)}</a>`);
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
  if (v.type === 'cat') main.innerHTML = viewCategory(v.id);
  else if (v.type === 'artist') main.innerHTML = viewArtist(v.id);
  else if (v.type === 'songs') main.innerHTML = viewSongs();
  else if (v.type === 'settings') main.innerHTML = viewSettings();
  else main.innerHTML = viewHome();
}

/** Re-rendu qui n'interrompt pas une saisie en cours (note, rang, recherche). */
function softRender() {
  const a = document.activeElement;
  if (a && a.closest('#main') && ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName)) { renderTabs(); return; }
  render();
}

function viewHome() {
  return `<section class="empty hero">
    <span class="logo big" aria-hidden="true"></span>
    <h1>Bienvenue dans ton Tableau K-pop</h1>
    <p>Commence par créer tes onglets (par génération, par type de groupe…), puis ajoute tes artistes.</p>
    <div class="chips">${QUICK_CATEGORIES.map(n => `<button class="chip" data-act="quick-cat" data-name="${esc(n)}">${ICON.plus}${esc(n)}</button>`).join('')}</div>
    <button class="primary" data-act="add-category">${ICON.plus}Autre onglet…</button>
    ${!sp.isConfigured() ? `<p class="muted small">Pour récupérer les chansons, il faudra aussi configurer Spotify — tout est expliqué dans le guide.</p>` : ''}
  </section>`;
}

function viewCategory(catId) {
  const cat = catId === 'none' ? { id: 'none', name: 'Sans onglet' } : categoryById(catId);
  if (!cat) return viewHome();
  const artists = catId === 'none' ? orphanArtists() : artistsOf(catId);
  const stats = artistStats();
  const totals = artists.reduce((acc, a) => {
    const s = stats.get(a.id); if (s) { acc.t += s.total; acc.r += s.rated; } return acc;
  }, { t: 0, r: 0 });
  const active = artists.filter(a => !a.excluded).length;
  const cards = artists.map(a => {
    const s = stats.get(a.id) || { total: 0, rated: 0, fav: 0 };
    return `<article class="card artist-card ${a.excluded ? 'excluded' : ''}">
      <a class="art" href="#/artist/${a.id}">${cover(a.image, 'art-img')}</a>
      <div class="card-body">
        <a class="name" href="#/artist/${a.id}">${esc(a.name)}</a>
        <div class="meta">${a.last_fetched_at ? `${plural(s.total, 'chanson')}${s.rated ? ` · <span class="gold">★ ${s.rated}</span>` : ''}${s.fav ? ` · <span class="pink">♥ ${s.fav}</span>` : ''}` : '<span class="muted">Pas encore récupéré</span>'}</div>
        <label class="check small"><input type="checkbox" data-act="toggle-exclude" data-id="${a.id}" ${a.excluded ? 'checked' : ''}> Exclure</label>
      </div>
    </article>`;
  }).join('');
  const cats = sortedCategories();
  const idx = cats.findIndex(c => c.id === catId);
  return `<section class="view-head">
      <div>
        <h1>${esc(cat.name)}</h1>
        <p class="sub">${plural(artists.length, 'artiste')} · ${plural(totals.t, 'chanson')} · ${totals.r} notée${totals.r > 1 ? 's' : ''}</p>
      </div>
      <div class="actions">
        ${catId !== 'none' ? `<button class="primary" data-act="add-artist">${ICON.plus}Artiste</button>` : ''}
        <button data-act="fetch-cat" ${active ? '' : 'disabled'} title="Récupère les nouvelles sorties de tous les artistes non exclus">${ICON.refresh}Récupérer les chansons</button>
        <button data-act="playlists-cat" ${active ? '' : 'disabled'} title="Crée ou met à jour une playlist Spotify par artiste">${ICON.list}Playlists</button>
        ${catId !== 'none' ? `<details class="menu"><summary aria-label="Plus d'options">⋯</summary><div class="menu-list">
          <button data-act="rename-cat">Renommer l'onglet</button>
          ${idx > 0 ? `<button data-act="move-cat" data-dir="-1">Déplacer vers la gauche</button>` : ''}
          ${idx < cats.length - 1 ? `<button data-act="move-cat" data-dir="1">Déplacer vers la droite</button>` : ''}
          <button class="danger-text" data-act="delete-cat">Supprimer l'onglet</button></div></details>` : ''}
      </div>
    </section>
    ${artists.length ? `<div class="grid">${cards}</div>` : `<div class="empty">
      <p>Aucun artiste dans cet onglet pour l'instant.</p>
      <button class="primary" data-act="add-artist">${ICON.plus}Ajouter un artiste</button></div>`}`;
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
  const hay = `${t.name} ${t.album_name || ''} ${t.note || ''} ${artistById(t.artist_id)?.name || ''}`.toLowerCase();
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
      <div class="tsub">${a ? `<a href="#/artist/${a.id}">${esc(a.name)}</a> · ` : ''}${esc(t.album_name || '')}${year ? ` · ${year}` : ''}</div>
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
  return `<a class="back" href="#/cat/${cat ? cat.id : 'none'}">← ${esc(cat?.name || 'Sans onglet')}</a>
    <section class="artist-hero">
      ${cover(a.image, 'hero-img')}
      <div class="hero-body">
        <h1>${esc(a.name)}</h1>
        <p class="sub">${plural(all.length - hiddenCount, 'chanson')}${hiddenCount ? ` · ${hiddenCount} masquée${hiddenCount > 1 ? 's' : ''}` : ''}
          ${a.last_fetched_at ? ` · mis à jour le ${fmtDate(a.last_fetched_at)}` : ' · jamais récupéré'}</p>
        <div class="actions">
          <button class="primary" data-act="fetch-artist" data-id="${a.id}">${ICON.refresh}${a.last_fetched_at ? 'Nouvelles sorties' : 'Récupérer les chansons'}</button>
          ${a.last_fetched_at ? `<button data-act="fetch-artist" data-id="${a.id}" data-full="1" title="Revérifie toute la discographie (plus long)">Tout revérifier</button>` : ''}
          <button data-act="playlist-artist" data-id="${a.id}" ${all.length ? '' : 'disabled'}>${ICON.list}${a.playlist_id ? 'Mettre à jour la playlist' : 'Créer la playlist'}</button>
          ${a.playlist_id ? `<a class="btn" href="https://open.spotify.com/playlist/${esc(a.playlist_id)}" target="_blank" rel="noopener">${ICON.ext}Playlist</a>` : ''}
          <a class="btn" href="${spotifyUrl}" target="_blank" rel="noopener">${ICON.ext}Spotify</a>
        </div>
        <div class="row wrap small">
          <label class="inline">Onglet <select data-act="artist-category" data-id="${a.id}">${catOptions}</select></label>
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
      <h2>Récupération des chansons</h2>
      <label>Mots-clés à écarter <span class="muted small">(un par ligne — cherchés seulement entre parenthèses ou après « - »)</span>
        <textarea name="keywords" rows="7">${esc((s.keywords || []).join('\n'))}</textarea></label>
      <label class="check"><input type="checkbox" name="includeCompilations" ${s.includeCompilations ? 'checked' : ''}> Inclure les compilations</label>

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
    <span class="logo big" aria-hidden="true"></span>
    <h1>Connexion</h1>
    <p class="muted">Connecte-toi avec le compte créé dans Supabase.</p>
    <form class="form" id="login-form">
      <label>Courriel<input type="email" name="email" required autocomplete="email"></label>
      <label>Mot de passe<input type="password" name="password" required autocomplete="current-password"></label>
      <button class="primary">Se connecter</button>
    </form>
  </section>`;
}

// ───────────────────────── Navigation ─────────────────────────
function route() {
  const [, type, id] = (location.hash || '#/').split('/');
  if (type === 'cat' && (id === 'none' || categoryById(id))) state.view = { type: 'cat', id };
  else if (type === 'artist' && artistById(id)) {
    if (state.view.type !== 'artist' || state.view.id !== id) state.artistFilters = { q: '', showHidden: false, sort: 'rank' };
    state.view = { type: 'artist', id };
  } else if (type === 'songs') state.view = { type: 'songs' };
  else if (type === 'settings') state.view = { type: 'settings' };
  else {
    const first = sortedCategories()[0];
    state.view = first ? { type: 'cat', id: first.id } : { type: 'home' };
  }
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
      <label class="check small"><input type="checkbox" id="artist-fetch" checked> Récupérer ses chansons tout de suite</label>
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
          await addArtist(it, catId, m.querySelector('#artist-fetch').checked);
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

async function addArtist(it, catId, fetchNow) {
  const a = {
    id: uuid(), category_id: catId, spotify_id: it.id, name: it.name, image: pickImage(it.images),
    excluded: false, playlist_id: null, album_ids: [], last_fetched_at: null, note: null,
    position: artistsOf(catId).length,
  };
  await store.saveArtist(a);
  state.artists.push(a);
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
  for (const [k, t] of state.tracks) if (t.artist_id === id) state.tracks.delete(k);
  go(`#/cat/${a.category_id || 'none'}`);
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
  const res = processDiscography(artist.spotify_id, done, state.settings.keywords, new Set(existing.map(t => normalizeKey(t.name))));
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
}

// ───────────────────────── Import / export ─────────────────────────
function exportJson() {
  const data = {
    app: 'tableau-kpop', version: 1, exported_at: new Date().toISOString(),
    categories: state.categories, artists: state.artists, tracks: [...state.tracks.values()], settings: state.settings,
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
    const list = (state.view.id === 'none' ? orphanArtists() : artistsOf(state.view.id)).filter(a => !a.excluded);
    await runFetch(list);
  },
  'playlists-cat': async () => {
    const list = (state.view.id === 'none' ? orphanArtists() : artistsOf(state.view.id)).filter(a => !a.excluded && tracksOf(a.id).length);
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
  'close-player': async () => { const p = $('#player'); p.hidden = true; p.innerHTML = ''; document.body.classList.remove('has-player'); },
  'modal-close': async () => closeModal(),
  'export': async () => exportJson(),
  'more-songs': async () => { state.songFilters.limit += PAGE_SIZE; render(); },
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
  } else if (act === 'artist-category') {
    const a = artistById(el.dataset.id); a.category_id = el.value; a.position = artistsOf(el.value).length;
    await saveArtist(a); toast(`${a.name} déplacé dans « ${categoryById(el.value)?.name} ».`); render();
  } else if (act === 'import') {
    if (el.files[0]) await importJson(el.files[0]);
    el.value = '';
  } else if (el.dataset.filter && el.type !== 'search') {
    applyFilter(el);
  }
}));

document.addEventListener('input', e => {
  const el = e.target;
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
      keywords: String(f.get('keywords') || '').split(/[\n,]/).map(s => s.trim()).filter(Boolean),
      includeCompilations: f.get('includeCompilations') === 'on',
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
