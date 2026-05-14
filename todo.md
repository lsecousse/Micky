# Migration vers Design Direction A — Athlete dense

État au 2026-05-13. Branch: `devLionel`.

## Direction validée

`./designs/explorations/v2/A-athlete-dense.html` = source de vérité visuelle.

Tokens lockés dans `CLAUDE.md` + `tailwind.config.js`:
- Base: `ink #0A0A0A` / `inkAlt #141414` / `paper #F5F4F0` / `muted #888` / `border #2A2A2A` / `todo #444`
- Sémantique:
  - `cyan #06B6D4` — mesure neutre (Volume, Tonnage, Reps, RPE, Σ)
  - `acid #84CC16` — validé / accompli (checkbox done, progress, "REPOS 1:45" terminé, `&` du titre)
  - `racing #FACC15` — action en cours / focus (une seule ligne à la fois, tab actif)
  - `blood #DC2626` — événement marquant (PR, RPE ≥ 9, échec). Ponctuel uniquement.
- Typo: **Fraunces** (display, variable 400-900) + **DM Sans** (body). Jamais Manrope.
- Eyebrow tracking: `0.28em` (eyebrow), `0.40em` (eyebrow-wide).

## Phases livrées

- [x] **A1** — Tokens A dans CLAUDE.md + tailwind.config.js + src/input.css + fonts URL index.html. `dist/output.css` rebuilt (15.2K).
- [x] **A2** — Home retokenisé (index.html + app.js renderHome / renderHomeSection / buildUserDropdown).
- [x] **A3** — Séance: scaffold header index.html + renderProgrammeSelection + renderLiveSession (sticky header + stats strip cyan + barre progression acid) + renderExerciseList (border-left status acid/racing) + renderActivityFocus (mega Fraunces racing + valider acid) + renderRestSplit (countdown 88px racing + recap acid).
  - **Hors scope ce tour**: renderLiveCardio, vue table whole-exercise du mock (suivi: A3b).
- [x] **A3b** — Cardio (renderLiveCardio tokens A: numero racing + 3 inputs cyan + state btn acid) + redesign live en `renderExerciseDetail` (table 3-cols Charge/Reps/Repos, border-left acid/racing/transparent, Σ cyan, Suite list). Suppressions : `renderActivityFocus`, `renderRestSplit`, `nextExerciseFirst`. Le repos vit dans la sticky `#countdown-bar` (plus de page dédiée).

## À faire — ordre proposé
- [x] **A4** — Historique (`renderHistory`): sticky header tokens A + masthead H1 split acid + groupement par mois avec sous-total tonnage cyan + cards séances border-l acid (fini) / racing (en cours) + volume cyan kg + reps muted. Modal détail (`openModal`): masthead H1 + stats 3-cols cyan (Volume/Tonnage/Reps) + table séries par exo border-l acid + repos acid + feedback IA card inkAlt + CTAs (Reprendre racing / Supprimer blood). Modal scaffold override `.modal-content` → bg-ink rounded-none.
- [x] **A5** — Stats (`renderStats` + `buildStatsProgression`): scaffold tokens A, masthead "Tes · progrès." split. Pills programme (racing actif, border-border + paper sinon). Metric toggle segmented (acid bg-acid/6% + bord-top 2px acid). Cards exo : delta acid (up) / blood (down) / muted (=). Chart.js palette Direction A `[cyan, acid, racing, paper, blood]` rotation. Axes/gridlines/border en `#2A2A2A`. Tooltip bg ink + border border + titleColor paper.
- [x] **A6** — Alimentation (`renderAlimentation`): scaffold sticky tokens A, masthead "Tes · apports." split. Date input border focus acid. Bilan : strip 4 cols cyan (Apports/Métabolisme/Dépenses/Net) + macros P/G/L sous-ligne + net coloré (acid négatif/blood positif/cyan neutre). Preset rows (petit-dej avant/après) border-border. CTAs : Ajouter repas (acid full) / Conseil / Question (border). Timeline ul : meal border-l-acid + kcal acid · session_burn border-l-racing bg-racing/4% + kcal racing. Empty state italic muted.
- [x] **A7** — Formulaires migrés tokens A:
  - **Login** (index.html): masthead "Coach · Mike." split acid + inputs border-b + CTA acid.
  - **Profil** (`renderProfil`): masthead "Tes · infos." + helpers `makeField` / `makeSegment` / `makeOptionList`. Sexe segmented, Activité option-list.
  - **Claude API** (`renderClaudeApi`): masthead "Clé · Claude." + input password border-b avec toggle 👁 border + CTA acid.
  - **Corps** (`renderCorps`): masthead "Ton · corps." + grid 2 cols champs num avec border-b + diff acid/blood. Trend strip 2x2 cyan avec badge IMG. Charts ineline + historique cards inline.
  - **Params** (`renderParams`): masthead "Tes · programmes." + liste avec ↑↓ reorder border + Modifier/Suppr inline + Nouveau programme border.
- [ ] **A8** — Modals & overlays: loading screen + dialog + modal détail + live-edit-modal + meal modals + chrono / minuterie / countdown fullscreen.
- [ ] **A9** — Cleanup `style.css`: purger règles orphelines (`.home-*`, `.btn-*`, `.screen-*`, `.live-*`, `.dialog-*`, `.modal-*`, `.programme-*`, `.section-title`, `.empty-msg`, etc.). Conserver routing (`.screen` / `.screen.active`) et resets globaux.

## Commandes utiles

```bash
npm run css:watch                # build Tailwind incrémental pendant dev
python3 -m http.server 8080      # serveur statique local
# → http://localhost:8080
```

## Fichiers clés modifiés

- `.claude/CLAUDE.md` — section "Design system — Direction A — LOCKED"
- `tailwind.config.js` — tokens A
- `src/input.css` — vars CSS + utilitaires `num-set` / `num-set-hot` / `accent-line` / `h-display`
- `index.html` — fonts URL, scaffold #screen-home + #screen-seance migrés
- `app.js` — renderHome, renderHomeSection, buildUserDropdown, renderProgrammeSelection, renderLiveSession, renderExerciseList, renderActivityFocus, renderRestSplit
- `dist/output.css` — généré, à committer

## État git

- Branch `devLionel`
- Pas encore committed depuis le démarrage de la migration A
- Suggestion: commit avant A4 pour avoir un point de retour clair

## Notes

- Cardio (`renderLiveCardio`) **non migré** — utilise encore classes style.css. À traiter en A3b.
- Edit modal (`openEditModalForActivity`) utilise encore `.live-edit-modal-*` de style.css. À traiter en A8.
- `style.css` (44K) contient encore tout le legacy. Cleanup final en A9 quand toutes les screens auront migré.
- Le mock A `./designs/explorations/v2/A-athlete-dense.html` reste la référence canonique — toute divergence code/mock → revenir au mock.
