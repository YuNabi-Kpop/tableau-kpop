// ─────────────────────────────────────────────────────────────
//  Configuration — c'est le SEUL fichier à modifier.
//  Ces valeurs ne sont pas secrètes : elles peuvent être publiques
//  sur GitHub (la sécurité vient de la connexion Spotify PKCE et
//  des règles RLS de Supabase).
// ─────────────────────────────────────────────────────────────
export const CONFIG = {
  // Spotify Developer Dashboard > ton app > Settings > Client ID
  SPOTIFY_CLIENT_ID: '856be2ef892c421f8f2553bf8d65e43b',

  // Laisse vide : le site utilise automatiquement sa propre adresse.
  // Cette adresse exacte doit être ajoutée dans « Redirect URIs » sur Spotify
  // (elle est affichée dans l'onglet Réglages du site).
  SPOTIFY_REDIRECT_URI: '',

  // Supabase > Project Settings > API (ou Data API) :
  //   « Project URL » et la clé publique « anon » / « publishable »
  // Laisse vide pour essayer le site en mode local (données dans ce navigateur seulement).
  SUPABASE_URL: 'https://fioybdjlxfubzyzzneut.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_XrgyL8QDpVni3O20WQXdAA_dxqLofCd',
};
