# Menu utilisateur — Design spec

## Contexte

L'app mobile n'a pas de menu utilisateur dédié. La déconnexion et le pairing montre sont enfouis dans l'onglet Programmes. On ajoute un point d'entrée clair en haut à droite de l'accueil.

## Composants

### 1. Icône utilisateur (header accueil)

- Icône user (SVG inline ou emoji) positionnée en haut à droite du `.home-header`
- Le header passe de `flex-direction: column; align-items: center` à une disposition qui permet un élément à droite (position absolute ou restructuration flex)
- Clic → ouvre le dropdown

### 2. Dropdown overlay

Menu overlay qui apparaît sous l'icône. 4 items :

| Item | Action |
|------|--------|
| Profil | Navigue vers écran `screen-profil` |
| Claude API | Navigue vers écran `screen-claude-api` |
| Connecter la montre | Logique existante (code 4 chiffres, même UX) |
| Déconnexion | `showConfirm` → `db.auth.signOut()` → `showScreen('login')` |

Fermeture : clic en dehors du dropdown.

### 3. Écran Profil

Nouvel écran `screen-profil` :
- Header avec bouton retour ← et titre "Profil"
- Email (lecture seule, affiché en gris)
- Champs éditables : nom, prénom
- Bouton "Enregistrer" → `db.from('profiles').update({ nom, prenom })`
- Toast de confirmation

### 4. Écran Claude API

Nouvel écran `screen-claude-api` :
- Header avec bouton retour ← et titre "Clé API Claude"
- Champ input type password (clé masquée par défaut)
- Bouton toggle visibilité (oeil)
- Bouton "Enregistrer" → `db.from('profiles').update({ claude_api_key })`
- Toast de confirmation

### 5. Migration DB

- Ajout colonne `claude_api_key text` dans table `profiles`

### 6. Suppression

- Retirer la section Compte entière de `renderParams()` (email, déconnexion, montre)
- La section Programmes reste intacte dans l'onglet Programmes

## Fichiers impactés

| Fichier | Changement |
|---------|-----------|
| `index.html` | Icône dans home-header + 2 nouveaux écrans (profil, claude-api) |
| `app.js` | Dropdown, renderProfil, renderClaudeApi, suppression section Compte de renderParams |
| `style.css` | Styles dropdown, icône user, écrans profil/api |
| `supabase.js` | Fonctions update profil et clé API |
| Migration Supabase | Colonne `claude_api_key` |
