# Feedback IA persistant — Lot B

## Contexte

Aujourd'hui, à la fin d'une séance, un appel à l'API Claude produit un feedback écrit en français (progression / forces-faiblesses / conseils). Le résultat est affiché dans un modal une seule fois, puis perdu. L'utilisateur veut pouvoir retrouver ce feedback plus tard, depuis l'historique.

## Objectif

Persister le feedback généré et le rendre accessible dans le modal de détail d'une séance. Sur les séances qui n'ont pas encore de feedback (anciennes, ou générées sans clé API), offrir un bouton pour en générer un à la demande.

## Conception

### 1. Stockage

Ajouter une colonne à la table `public.sessions` :

```sql
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS feedback_ia text;
```

Sémantique :
- `NULL` = pas de feedback (séance sans analyse, ou API key absente au moment de finir)
- Chaîne non vide = feedback brut renvoyé par Claude (même format markdown-ish qui est déjà formaté à l'affichage via `formatFeedback`)

Une seule colonne : pas de versioning, pas de timestamp séparé — la date de l'analyse est implicitement celle de la séance.

### 2. Écriture

Dans `showPostSessionFeedback` (`app.js` ~2193), après réception réussie de la réponse Claude :
1. On continue d'afficher le feedback dans le modal (inchangé).
2. On appelle `updateSessionFeedbackDB(session.id, feedback)` (nouvelle fonction dans `supabase.js`).
3. On ne bloque pas l'UI sur la sauvegarde (`.catch(() => {})`).

`updateSessionFeedbackDB(id, feedback)` dans `supabase.js` :

```js
async function updateSessionFeedbackDB(id, feedback) {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return;
  const { error } = await db.from('sessions')
    .update({ feedback_ia: feedback })
    .eq('id', id)
    .eq('client_id', user.id);
  if (error) console.error('updateSessionFeedbackDB error:', error);
}
```

`loadSessionsDB` (`supabase.js:26`) doit aussi inclure le nouveau champ dans son mapping, pour que le feedback soit dispo côté client.

### 3. Lecture dans le modal de détail de séance

Dans `openModal(session)` (`app.js` ~2104), après le tableau des exercices, avant les boutons d'action :

- Si `session.feedback_ia` est une chaîne non vide :
  - Render un bloc final reprenant les classes `feedback-ia-card` / `feedback-ia-title` / `feedback-ia-content` déjà stylées (zone actuellement utilisée en post-séance).
  - Pas de re-génération possible — éviter les appels API redondants.
- Sinon :
  - Afficher un bouton `Générer l'analyse IA`.
  - Au clic, appeler la même logique que `showPostSessionFeedback` (mais dans le modal de détail, pas un autre modal) : loading spinner → appel Claude → remplacement par le bloc feedback + sauvegarde en DB.
  - Si pas de clé API configurée → désactiver le bouton avec un message court `Configurez votre clé API Claude dans Profil pour activer cette fonctionnalité`.

Le bouton disparaît après génération réussie (remplacé par le bloc feedback).

### 4. Flux post-séance (inchangé)

`showPostSessionFeedback` continue d'être déclenché à la fin d'une séance (`finishSession`), ouvre son propre modal, génère, puis sauvegarde. L'utilisateur ne voit aucune différence d'UX post-séance — la persistance est transparente.

## Hors scope

- Régénération manuelle d'une analyse existante (éviter le coût API).
- Suppression manuelle d'une analyse (si vraiment nécessaire, passer par un DELETE SQL direct).
- Historique de plusieurs versions d'analyse pour une même séance.
- Notifications / badge "nouvelle analyse disponible".
- Partage coach → client de l'analyse.

## Fichiers concernés (estimation)

- Migration Supabase : `ALTER TABLE public.sessions ADD COLUMN feedback_ia text;`
- `supabase.js` : ajout `updateSessionFeedbackDB`, mapping dans `loadSessionsDB`.
- `app.js` :
  - `showPostSessionFeedback` : appel de `updateSessionFeedbackDB` après succès.
  - `openModal` : rendu conditionnel du bloc feedback ou du bouton "Générer".
  - Nouvelle fonction `generateFeedbackForSession(session, containerEl)` factorisant la logique d'appel Claude entre post-séance et modal historique (DRY — la fonction actuelle duplique déjà pas mal de choses). On passe le conteneur DOM en paramètre pour pouvoir injecter dans le modal courant ou le modal historique.

## Critères d'acceptation

- Une séance terminée avec une clé API Claude valide voit son feedback persisté en DB (colonne `feedback_ia` non-null).
- Ouvrir le détail d'une séance avec un feedback sauvegardé affiche le bloc "🤖 Feedback IA" en bas du modal, sans aucun appel API.
- Ouvrir le détail d'une séance sans feedback affiche un bouton "Générer l'analyse IA". Au clic, l'analyse est générée, affichée, et sauvegardée (à la prochaine ouverture, le bouton est remplacé par le feedback).
- Ouvrir le détail d'une séance sans feedback ET sans clé API affiche un message désactivé invitant à configurer la clé.
- Le flux post-séance reste inchangé visuellement.
- Le backoffice coach (qui lit aussi `sessions`) peut lire la colonne sans erreur RLS.
