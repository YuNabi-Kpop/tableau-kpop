// Stockage des données : Supabase (en ligne) si configuré, sinon ce navigateur (mode local).
import { CONFIG } from './config.js';

export const trackKey = t => `${t.artist_id}:${t.id}`;

const TRACK_FIELDS = ['artist_id', 'id', 'name', 'album_id', 'album_name', 'album_type', 'album_image',
  'release_date', 'duration_ms', 'disc_number', 'track_number', 'rating', 'rank', 'favorite', 'hidden', 'note'];
const ARTIST_FIELDS = ['id', 'category_id', 'spotify_id', 'name', 'image', 'excluded', 'playlist_id',
  'album_ids', 'last_fetched_at', 'note', 'position'];
const CATEGORY_FIELDS = ['id', 'name', 'position'];
const pick = (o, fields) => Object.fromEntries(fields.filter(f => f in o).map(f => [f, o[f]]));
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

export function trackDefaults(t) {
  return { rating: 0, rank: null, favorite: false, hidden: false, note: null, ...t };
}

// ───────────────────────── Mode local (IndexedDB) ─────────────────────────
class LocalStore {
  mode = 'local';
  async init() {
    this.db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('tableau-kpop', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('categories', { keyPath: 'id' });
        db.createObjectStore('artists', { keyPath: 'id' });
        db.createObjectStore('tracks', { keyPath: 'key' });
        db.createObjectStore('settings', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return { ready: true };
  }
  _tx(store, mode, fn) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(store, mode);
      const os = tx.objectStore(store);
      let out;
      const r = fn(os);
      if (r && 'onsuccess' in r) r.onsuccess = () => { out = r.result; };
      tx.oncomplete = () => resolve(out);
      tx.onerror = () => reject(tx.error);
    });
  }
  _all(store) { return this._tx(store, 'readonly', os => os.getAll()); }
  async load() {
    const [categories, artists, tracks, settings] = await Promise.all(
      ['categories', 'artists', 'tracks', 'settings'].map(s => this._all(s)));
    return {
      categories, artists,
      tracks: tracks.map(({ key, ...t }) => t),
      settings: settings.find(s => s.id === 'main')?.data || {},
    };
  }
  saveCategory(c) { return this._tx('categories', 'readwrite', os => os.put(pick(c, CATEGORY_FIELDS))); }
  deleteCategory(id) { return this._tx('categories', 'readwrite', os => os.delete(id)); }
  saveArtist(a) { return this._tx('artists', 'readwrite', os => os.put(pick(a, ARTIST_FIELDS))); }
  async deleteArtist(id) {
    await this._tx('tracks', 'readwrite', os => {
      const req = os.openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return;
        if (cur.value.artist_id === id) cur.delete();
        cur.continue();
      };
    });
    return this._tx('artists', 'readwrite', os => os.delete(id));
  }
  insertTracks(tracks) {
    return this._tx('tracks', 'readwrite', os => {
      for (const t of tracks) {
        const req = os.add({ ...pick(trackDefaults(t), TRACK_FIELDS), key: trackKey(t) });
        // Déjà présente : on ignore sans annuler toute la transaction.
        req.onerror = e => { e.preventDefault(); e.stopPropagation(); };
      }
    });
  }
  async updateTrack(t, patch) {
    const key = trackKey(t);
    return this._tx('tracks', 'readwrite', os => {
      const req = os.get(key);
      req.onsuccess = () => { if (req.result) os.put({ ...req.result, ...patch }); };
    });
  }
  saveSettings(data) { return this._tx('settings', 'readwrite', os => os.put({ id: 'main', data })); }
  async importAll({ categories = [], artists = [], tracks = [], settings = {} }) {
    for (const s of ['categories', 'artists', 'tracks']) await this._tx(s, 'readwrite', os => os.clear());
    for (const c of categories) await this.saveCategory(c);
    for (const a of artists) await this.saveArtist(a);
    await this.insertTracks(tracks);
    await this.saveSettings(settings);
  }
}

// ───────────────────────── Mode Supabase ─────────────────────────
// Bibliothèque supabase-js 2.117.2 incluse dans le site (js/vendor/supabase.js), sans CDN.
function loadSupabaseLib() {
  if (window.supabase?.createClient) return Promise.resolve(window.supabase);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = new URL('./vendor/supabase.js', import.meta.url).href;
    s.onload = () => window.supabase?.createClient ? resolve(window.supabase) : reject(new Error('Supabase n\u2019a pas pu être chargé.'));
    s.onerror = () => reject(new Error('Supabase n\u2019a pas pu être chargé (js/vendor/supabase.js).'));
    document.head.append(s);
  });
}
class SupabaseStore {
  mode = 'supabase';
  async init() {
    const { createClient } = await loadSupabaseLib();
    this.sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
    const { data } = await this.sb.auth.getSession();
    this.user = data.session?.user || null;
    return { ready: !!this.user, email: this.user?.email };
  }
  async signIn(email, password) {
    const { data, error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Courriel ou mot de passe incorrect.' : error.message);
    this.user = data.user;
  }
  async signOut() { await this.sb.auth.signOut(); this.user = null; }
  _check({ error, data }) { if (error) throw new Error(`Supabase : ${error.message}`); return data; }
  async _all(table, order) {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      let q = this.sb.from(table).select('*').range(from, from + 999);
      if (order) q = q.order(order[0], { ascending: true }).order(order[1], { ascending: true });
      const data = this._check(await q);
      rows.push(...data);
      if (data.length < 1000) break;
    }
    return rows;
  }
  async load() {
    const [categories, artists, tracks, settingsRows] = await Promise.all([
      this._all('categories', ['position', 'id']),
      this._all('artists', ['position', 'id']),
      this._all('tracks', ['artist_id', 'id']),
      this._all('settings'),
    ]);
    const strip = rows => rows.map(({ user_id, created_at, ...r }) => r);
    return { categories: strip(categories), artists: strip(artists), tracks: strip(tracks), settings: settingsRows[0]?.data || {} };
  }
  _uid() { return this.user.id; }
  async saveCategory(c) { this._check(await this.sb.from('categories').upsert({ ...pick(c, CATEGORY_FIELDS), user_id: this._uid() })); }
  async deleteCategory(id) { this._check(await this.sb.from('categories').delete().eq('id', id)); }
  async saveArtist(a) { this._check(await this.sb.from('artists').upsert({ ...pick(a, ARTIST_FIELDS), user_id: this._uid() })); }
  async deleteArtist(id) { this._check(await this.sb.from('artists').delete().eq('id', id)); }
  async insertTracks(tracks) {
    const rows = tracks.map(t => ({ ...pick(trackDefaults(t), TRACK_FIELDS), user_id: this._uid() }));
    for (const part of chunk(rows, 500)) {
      this._check(await this.sb.from('tracks').upsert(part, { onConflict: 'user_id,artist_id,id', ignoreDuplicates: true }));
    }
  }
  async updateTrack(t, patch) {
    this._check(await this.sb.from('tracks').update(patch).eq('artist_id', t.artist_id).eq('id', t.id));
  }
  async saveSettings(data) { this._check(await this.sb.from('settings').upsert({ user_id: this._uid(), data })); }
  async importAll({ categories = [], artists = [], tracks = [], settings = {} }) {
    this._check(await this.sb.from('tracks').delete().eq('user_id', this._uid()));
    this._check(await this.sb.from('artists').delete().eq('user_id', this._uid()));
    this._check(await this.sb.from('categories').delete().eq('user_id', this._uid()));
    for (const part of chunk(categories, 500)) this._check(await this.sb.from('categories').insert(part.map(c => ({ ...pick(c, CATEGORY_FIELDS), user_id: this._uid() }))));
    for (const part of chunk(artists, 500)) this._check(await this.sb.from('artists').insert(part.map(a => ({ ...pick(a, ARTIST_FIELDS), user_id: this._uid() }))));
    await this.insertTracks(tracks);
    await this.saveSettings(settings);
  }
}

export function createStore() {
  return CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY ? new SupabaseStore() : new LocalStore();
}
