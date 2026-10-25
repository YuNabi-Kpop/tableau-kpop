# Tableau K-pop

Ton tableau de chansons K-pop sous forme de site web : des onglets par génération, tes artistes, leur discographie récupérée sur Spotify (sans remix, instrumentales ni live), tes notes ★, tes coups de cœur ♥, ton classement, et une playlist Spotify par artiste.

- **Hébergement** : GitHub Pages (gratuit)
- **Données** : Supabase (gratuit), ou ce navigateur seulement si Supabase n'est pas configuré (pratique pour essayer)
- **Spotify** : connexion « PKCE », donc aucune clé secrète dans le code

---

## Installation (environ 30 minutes, une seule fois)

### 1. Mettre le site sur GitHub Pages

1. Crée un compte sur **github.com** (le nom d'utilisateur fera partie de l'adresse du site).
2. En haut à droite : **+ → New repository**.
   - Nom : `tableau-kpop`
   - Visibilité : **Public** (obligatoire pour GitHub Pages gratuit)
   - Clique sur **Create repository**.
3. Sur la page du dépôt, clique sur **uploading an existing file**, puis glisse **le contenu** du dossier décompressé (`index.html`, `css`, `js`, `supabase`, `README.md`), pas le dossier lui-même. Clique sur **Commit changes**.
4. **Settings → Pages** : sous « Build and deployment », Source = **Deploy from a branch**, Branch = **main** / **(root)**, puis **Save**.
5. Après une à deux minutes, ton site est en ligne à :
   `https://TON-NOM-GITHUB.github.io/tableau-kpop/`

Tu peux déjà l'ouvrir : il fonctionne en **mode local** (données dans ce navigateur seulement).

### 2. Spotify

Tu peux réutiliser l'app Spotify de ton Google Sheets, ou en créer une nouvelle.

1. Va sur **developer.spotify.com/dashboard** et connecte-toi.
2. Ouvre ton app (ou **Create app** : nom libre, API = **Web API**).
3. **Settings → Edit → Redirect URIs** : ajoute l'adresse **exacte** de ton site, avec le `/` final :
   `https://TON-NOM-GITHUB.github.io/tableau-kpop/`
   (elle est aussi affichée dans l'onglet ⚙ Réglages du site). Clique sur **Save**.
4. Copie le **Client ID** (le « Client secret » ne sert pas ici et ne doit jamais aller sur GitHub).

> Depuis 2026, une app Spotify en « Development Mode » ne fonctionne que si son propriétaire a **Spotify Premium**, et elle est limitée à quelques utilisateurs. Pour un site perso, c'est parfait.

### 3. Supabase (sauvegarde en ligne)

1. Crée un compte sur **supabase.com** (tu peux te connecter avec GitHub).
2. **New project** : nom `tableau-kpop`, un mot de passe de base de données (garde-le quelque part), région **Canada (Central)**.
3. Quand le projet est prêt : **SQL Editor → New query**, colle tout le contenu de `supabase/schema.sql`, puis **Run**. Le message attendu est « Success. No rows returned ».
4. **Authentication → Users → Add user → Create new user** : ton courriel et un mot de passe, coche **Auto Confirm User**. C'est ce compte qui te servira à te connecter au site.
5. **Authentication → Sign In / Providers** : désactive **Allow new users to sign up**, pour que personne d'autre ne puisse se créer un compte.
6. **Project Settings → API Keys** (ou **Data API**) : copie l'**URL du projet** (`https://xxxx.supabase.co`) et la clé publique (**publishable**, ou **anon** dans l'ancien affichage). N'utilise **jamais** la clé `service_role` ni la clé `secret`.

### 4. Remplir la configuration

Sur GitHub, ouvre `js/config.js`, clique sur le crayon ✏️ et remplis :

```js
SPOTIFY_CLIENT_ID: 'ton client id',
SPOTIFY_REDIRECT_URI: '',
SUPABASE_URL: 'https://xxxx.supabase.co',
SUPABASE_ANON_KEY: 'ta clé publique',
```

Clique sur **Commit changes**, attends environ une minute, puis recharge le site.

Ces valeurs peuvent être publiques : la sécurité vient de la connexion PKCE de Spotify et des règles RLS de Supabase (chaque ligne n'est lisible que par ton compte).

---

## Utilisation

1. Connecte-toi avec ton compte Supabase, puis clique sur **Se connecter à Spotify** en haut à droite.
2. Crée tes onglets (2GG, 3GG, 4GG…) avec le bouton **+**.
3. Dans un onglet : **+ Artiste**, puis cherche par nom ou colle un lien Spotify d'artiste.
4. **Récupérer les chansons** va chercher les albums et les singles de tous les artistes non exclus de l'onglet. Les fois suivantes, seules les **nouvelles sorties** sont téléchargées, ce qui est beaucoup plus rapide.
5. Pour chaque chanson :
   - ▶ l'écouter dans le lecteur en bas
   - ★ la noter (recliquer sur la même étoile remet la note à zéro)
   - ♥ en faire un coup de cœur
   - **#** lui donner un rang (son ordre dans la playlist)
   - lui ajouter une note texte
   - 👁 la masquer
6. **Playlists** crée ou met à jour une playlist Spotify privée par artiste. Son contenu se règle dans ⚙ Réglages : toutes les chansons, seulement celles notées, ou seulement les coups de cœur.
7. **Toutes mes chansons** affiche ton classement global, avec des filtres par onglet, par note, par coups de cœur et par recherche.

### Filtrage automatique

Les mots-clés (remix, inst, live, ver., sped up…) sont cherchés **seulement entre parenthèses ou après « - »**. Ainsi, « LIVE MY LIFE » est gardée, mais « Psycho (Live) » est écartée. Les doublons (même titre sur un single puis sur un album) sont fusionnés en gardant la première sortie. La liste des mots-clés se modifie dans ⚙ Réglages ; après un changement, utilise **Tout revérifier** sur un artiste.

### Sauvegarde

⚙ Réglages → **Exporter (JSON)** télécharge une copie complète de tes données. **Importer** remplace tout : c'est aussi le moyen de passer du mode local à Supabase.

> Un projet Supabase gratuit peut être mis en pause après environ une semaine sans utilisation. Il suffit de cliquer sur « Restore » dans le tableau de bord Supabase, et les données sont conservées.

---

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Page du site |
| `css/style.css` | Apparence (thème clair/sombre automatique, mobile) |
| `js/config.js` | **Ta configuration** : le seul fichier à modifier |
| `js/app.js` | Interface |
| `js/spotify.js` | Connexion et appels Spotify (file d'attente, gestion des erreurs 429 avec `Retry-After`) |
| `js/fetcher.js` | Filtrage et dédoublonnage des chansons |
| `js/store.js` | Sauvegarde : Supabase, ou IndexedDB en mode local |
| `js/vendor/supabase.js` | Bibliothèque supabase-js 2.117.2 (MIT), incluse pour ne dépendre d'aucun CDN |
| `supabase/schema.sql` | Tables et règles de sécurité à exécuter une fois dans Supabase |

## Dépannage

- **« INVALID_CLIENT: Invalid redirect URI »** : l'adresse dans Spotify doit être identique à celle affichée dans ⚙ Réglages, y compris le `/` final.
- **Erreur 403 de Spotify** : vérifie que ton abonnement Premium est actif et que ton compte est bien le propriétaire de l'app.
- **« Supabase : permission denied »** : le script `schema.sql` n'a pas été exécuté en entier. Relance-le : il peut être exécuté plusieurs fois sans danger.
- **Les modifications ne s'affichent pas** : GitHub Pages met environ une minute à se mettre à jour. Recharge ensuite la page avec Ctrl+F5.
