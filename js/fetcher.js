// Logique de filtrage et de dédoublonnage des chansons (fonctions pures, testables).

export const DEFAULT_KEYWORDS = [
  'remix', 'instrumental', 'inst', 'live', 'sped up', 'slowed', 'acapella', 'a cappella',
  'karaoke', 'mr removed', 'ver', 'version',
];

/**
 * Sépare le titre « de base » de ses décorations :
 * "Imaginary Friend (Live) - Remix" → base "Imaginary Friend", décorations ["Live", "Remix"].
 * Les mots-clés ne sont cherchés QUE dans les décorations, pour ne pas écarter
 * une vraie chanson comme « LIVE MY LIFE ».
 */
export function splitTitle(title) {
  const decos = [];
  let base = String(title || '').replace(/[([（【]([^)\]）】]*)[)\]）】]/g, (_, inner) => { decos.push(inner); return ' '; });
  const parts = base.split(/\s+[-–—]\s+/);
  if (parts.length > 1) { decos.push(...parts.slice(1)); base = parts[0]; }
  return { base: base.replace(/\s+/g, ' ').trim(), decos: decos.map(d => d.trim()).filter(Boolean) };
}

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function compileKeywords(keywords) {
  return (keywords || [])
    .map(k => String(k).trim().replace(/\.$/, ''))
    .filter(Boolean)
    .map(k => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(k)}($|[^\\p{L}\\p{N}])`, 'iu'));
}

/** Retourne le mot-clé qui écarte la chanson, ou null si elle est gardée. */
export function filterReason(title, compiled) {
  const { decos } = splitTitle(title);
  for (const d of decos) for (const re of compiled) if (re.test(d)) return d;
  return null;
}

export function normalizeKey(title) {
  const { base } = splitTitle(title);
  const src = base || String(title || '');
  return src.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/**
 * Clé de dédoublonnage selon le mode choisi dans les Réglages :
 *  - 'base'  : titre sans décorations → « CRUSH - KR » et « CRUSH - Japanese ver. » = même chanson (une seule gardée)
 *  - 'exact' : titre complet → seules les copies identiques (même titre sur le single et l'album) sont écartées
 *  - 'none'  : aucun dédoublonnage (null)
 */
export function dedupeKey(title, mode = 'base') {
  if (mode === 'none') return null;
  if (mode === 'exact') {
    return String(title || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  }
  return normalizeKey(title);
}

/**
 * albums : [{ id, name, album_type, release_date, images, tracks: [...] }]
 * existingKeys : Set de dedupeKey(titre, mode) des chansons déjà enregistrées pour cet artiste.
 * mode : 'base' | 'exact' | 'none' (voir dedupeKey).
 * Retourne { kept: [enregistrements], filtered: n, duplicates: n, foreign: n }
 */
export function processDiscography(artistSpotifyId, albums, keywords, existingKeys = new Set(), mode = 'base') {
  const compiled = compileKeywords(keywords);
  const seen = new Set(existingKeys);
  const kept = [];
  let filtered = 0, duplicates = 0, foreign = 0;
  const sorted = [...albums].sort((a, b) =>
    String(a.release_date || '').localeCompare(String(b.release_date || '')) ||
    (a.album_type === 'album' ? -1 : 0) - (b.album_type === 'album' ? -1 : 0));
  for (const album of sorted) {
    for (const t of album.tracks || []) {
      if (!t?.id) continue;
      if (!(t.artists || []).some(a => a.id === artistSpotifyId)) { foreign++; continue; }
      if (filterReason(t.name, compiled)) { filtered++; continue; }
      const key = dedupeKey(t.name, mode);
      if (key !== null) {
        if (seen.has(key)) { duplicates++; continue; }
        seen.add(key);
      }
      kept.push({
        id: t.id,
        name: t.name,
        album_id: album.id,
        album_name: album.name,
        album_type: album.album_type,
        album_image: pickImage(album.images),
        release_date: album.release_date || null,
        duration_ms: t.duration_ms ?? null,
        disc_number: t.disc_number ?? null,
        track_number: t.track_number ?? null,
      });
    }
  }
  return { kept, filtered, duplicates, foreign };
}

export function pickImage(images, target = 300) {
  if (!images?.length) return null;
  const sorted = [...images].sort((a, b) => Math.abs((a.width || target) - target) - Math.abs((b.width || target) - target));
  return sorted[0].url;
}

/** Ordre des chansons dans une playlist / un classement. */
export function rankCompare(a, b) {
  const ra = a.rank ?? Infinity, rb = b.rank ?? Infinity;
  if (ra !== rb) return ra - rb;
  if ((b.rating || 0) !== (a.rating || 0)) return (b.rating || 0) - (a.rating || 0);
  if (!!b.favorite !== !!a.favorite) return b.favorite ? 1 : -1;
  return String(a.release_date || '').localeCompare(String(b.release_date || '')) ||
    (a.disc_number || 0) - (b.disc_number || 0) || (a.track_number || 0) - (b.track_number || 0);
}

export function playlistTracks(tracks, settings) {
  const mode = settings.playlistMode || 'all';
  const min = settings.playlistMinRating || 3;
  return tracks
    .filter(t => !t.hidden)
    .filter(t => mode === 'all' || (mode === 'favorites' ? t.favorite : (t.rating || 0) >= min))
    .sort(rankCompare);
}
