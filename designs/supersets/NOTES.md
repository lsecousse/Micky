# Super sets : notes de maquette

> **Maquette faite à la main, pas un export AIDesigner.** Le 2026-10-18, le connecteur AIDesigner n'était pas autorisé dans la session. Lionel a tranché : « Fais-la à la main dans le Direction A (comme live v3), sans AIDesigner ».

Fichiers :
- `supersets.html` : la maquette validée, 7 écrans + variante 02b, look **Carnet**. Version publiée pour relecture au téléphone : https://claude.ai/artifact/MtBSQE6eQRyoArNoDsffeo
- `pistes-look.html` : les 3 pistes de look proposées sur l'écran de séance (Carnet, Graphite aéré, Tableau de salle). Version publiée : https://claude.ai/artifact/RZaeXa4CMMYgXLTL9ykXRh

## Historique de la décision (2026-10-18)

1. v1 dessinée dans la Direction A (noir dense, Fraunces + DM Sans). Avis de Lionel : « On peut en profiter pour revoir completement le loook ? »
2. 3 pistes proposées sur l'écran 01 (`pistes-look.html`). Choix de Lionel : « Piste 1 · Carnet »
3. v2 refaite en Carnet. Avis de Lionel : « Validée »

**Conséquence à traiter à part** : `.claude/CLAUDE.md` décrit toujours la Direction A comme LOCKED, et l'app est en Direction A. Le passage de toute l'app au Carnet (tokens, polices, CLAUDE.md, écrans existants) est un chantier séparé, non fait ici.

## Règles métier (réponses de Lionel, 2026-10-18)

| Sujet | Réponse |
|---|---|
| Taille d'un groupe | « 2 à 4 exercices (super set, tri-set, circuit court) » |
| Repos | « Un petit repos réglable entre exercices (ex. 15 s pour changer de poste) + un repos après le tour (ex. 90 s) » |
| Où se crée un groupe | « Éditeur de programme + en séance live (grouper à la volée) » |
| Écrans | « Mobile + back-office PC » |
| Séries | « Oui, imposé : le groupe a un nombre de tours unique (réglé une fois pour le groupe) » |
| Grouper en séance et programme | « On demande à chaque fois (case « Garder dans le programme » dans le tiroir) » |
| Exercice déjà commencé | « Non, seulement les exercices pas commencés » |
| Tours par défaut | « Le plus grand : 4 tours » (plus grand nombre de séries des exercices groupés) |
| Transition à 0 s | « Non, toujours un court écran « Va au poste suivant » à valider » |

Vocabulaire de l'interface : **tour** (un passage A → B → …), **transition** (repos court entre deux exercices du tour), **repos de tour** (après le dernier exercice du tour).

## Look Carnet (tel que dessiné ici)

| Token | Valeur | Rôle |
|---|---|---|
| `paper` | `#EEEDE8` | fond de page |
| `sheet` | `#F7F6F2` | cartes, tiroir, série en préparation |
| `ink` | `#1B1C1F` | texte, filets forts, boutons pleins |
| `mut` | `#6F6C64` | texte secondaire, à venir |
| `rule` | `#D6D3C9` | lignes du carnet |
| `hl` (surligneur) | `#FFE45C` | **la seule chose à faire maintenant** : série en cours, ou décompte pendant transition / repos, groupe en cours dans la liste, cible de dépôt au back-office |
| `done` (sapin) | `#1E6B4A` | fait : « fait », temps réellement pris, compteur de séries finies |

Polices : Newsreader (titres, noms d'exercices en italique, lettres A/B), IBM Plex Sans (texte), IBM Plex Mono (chiffres : charges, reps, décomptes). Rayon 6 px. Aucun texte sous 12 px dans les écrans de séance.

## Écrans

| # | Écran | Points clés |
|---|---|---|
| 01 | Séance · tour 2, A en cours | Le groupe s'écrit comme une page de carnet, une ligne par passage, la lettre remplace le numéro de série. Colonne « puis » : transition après A, repos de tour après le dernier. Le CTA annonce la suite (« puis B · Rowing barre »). |
| 02 | Séance · transition | Le décompte est surligné dans le dock, B attend dans un cadre, modifiable. « +15 s », « Je suis prêt ». |
| 02b | Transition à 0 s | Pas de décompte, arrêt « Va au poste suivant · B · Rowing barre », bouton « J'y suis ». |
| 03 | Séance · repos de tour | Décompte surligné, −15 / +15 s, « Passer le repos ». Les tours finis tiennent sur une ligne. |
| 04 | Liste | Un groupe = une entrée avec trait d'accolade, compteur en tours, groupe en cours surligné. Bouton « Grouper des exercices ». |
| 05 | Grouper à la volée | Tiroir : on touche 2 à 4 exercices non commencés dans l'ordre voulu (A, B…). Tours / transition / repos de tour, case « Garder dans le programme ». Dégrouper : appui long sur l'entrée du groupe. |
| 06 | Éditeur mobile (Réglages) | « Lier au suivant » entre deux cartes ; carte groupe avec tours / transition / repos de tour, ↑↓ dans le groupe, « Lier le suivant », « Dégrouper ». Le groupe se déplace d'un bloc. |
| 07 | Back-office coach (PC) | Déposer un exercice **sur** un autre forme ou agrandit le groupe ; **entre** deux, il s'insère comme aujourd'hui. Réglages du groupe sur sa ligne de titre. |

## Pistes techniques (pour l'implémentation, pas tranchées ici)

- Aujourd'hui, un exercice peut porter plusieurs activités que la séance fait alterner série par série (`nextUndoneActivity`, app.js) : c'est déjà un super set **à l'intérieur** d'un exercice. Le super set **entre exercices** demande un lien de groupe sur l'exercice du programme (jsonb `programmes.exercises`) et sur `session_exercises`, avec tours, transition et repos de tour portés par le groupe.
- `nextUndoneActivity` et `completeFocusedActivity` doivent traverser les exercices du groupe (A puis B du même tour) et choisir transition ou repos de tour.
- Historique, PR et `prevSeries` restent indexés par exercice : chaque exercice du groupe garde son historique.
