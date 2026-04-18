# Analyse corps bienveillante — Plan d'implémentation (Lot D)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Checkbox syntax.

**Goal:** Ajouter en bas de l'écran Données corporelles une card "🌱 Ton évolution" générée par Claude, avec un ton bienveillant, basée sur la 1ʳᵉ mesure et les N=5 dernières mesures de l'utilisateur.

**Architecture:** Frontend only, aucune colonne DB nouvelle. Un helper `generateBodyAnalysis(measurements)` appelle Claude avec un prompt dédié. Le résultat est caché en mémoire (`bodyAnalysisCache`), invalidé lors de l'enregistrement d'une nouvelle mesure.

**Tech Stack:** vanilla JS, API Anthropic Claude, CSS custom.

---

### Task 1 — CSS de la card analyse corps

**Files:**
- Modify: `style.css`

- [ ] **Step 1 : Ajouter les règles**

Append au fichier `/home/lsecousse/WebstormProjects/Micky/style.css` :

```css
/* Analyse bienveillante des données corporelles */
.corps-analysis {
  margin-top: 20px;
  border-radius: var(--radius);
  border: 1px solid rgba(90, 190, 120, 0.4);
  background: rgba(90, 190, 120, 0.08);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.corps-analysis.hidden { display: none; }
.corps-analysis-title {
  font-size: 14px;
  font-weight: 600;
  color: #5abe78;
}
.corps-analysis-content {
  font-size: 13px;
  color: var(--text);
  line-height: 1.5;
}
.corps-analysis-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);
  font-size: 13px;
}
.corps-analysis-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(90, 190, 120, 0.3);
  border-top-color: #5abe78;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}
```

L'animation `@keyframes spin` existe déjà (utilisée par Lot B et C) — ne pas redéclarer.

- [ ] **Step 2 : Commit**

```bash
git add style.css
git commit -m "feat(analyse-corps): styles pour la card d'analyse bienveillante"
```

---

### Task 2 — JS : prompt, fonction de génération, intégration dans renderCorps

**Files:**
- Modify: `app.js`

- [ ] **Step 1 : Ajouter le prompt, le cache et la fonction de génération**

Dans `/home/lsecousse/WebstormProjects/Micky/app.js`, localiser la constante `SUGGESTION_PROMPT` (introduite dans Lot C, vers ligne 2269). Juste APRÈS cette constante et la `suggestionCache` Map + `generateWeightSuggestion` qui la suivent, ajouter :

```js
const BODY_ANALYSIS_PROMPT = `Coach bienveillant et non jugeant. L'utilisateur partage son évolution de composition corporelle (poids, graisse, eau, muscle, IMG, os, tour de ventre). Écris 2-3 phrases courtes en français :
- Célèbre les tendances positives sur la durée (depuis la première mesure).
- Mets les petites variations récentes en perspective (un poids fluctue au quotidien).
- Encourage, jamais de jugement ni de pression, aucun conseil diététique ou médical, pas d'objectif chiffré.
- Ton chaleureux, deuxième personne du singulier (tu).`;

let bodyAnalysisCache = null;

function cleanMeasurement(m) {
  const out = { date: m.date };
  if (m.poids != null)          out.poids = m.poids;
  if (m.graisse_kg != null)     out.graisseKg = m.graisse_kg;
  if (m.eau != null)            out.eau = m.eau;
  if (m.muscle != null)         out.muscle = m.muscle;
  if (m.img != null)            out.img = m.img;
  if (m.os != null)             out.os = m.os;
  if (m.tour_de_ventre != null) out.tourDeVentre = m.tour_de_ventre;
  return out;
}

async function generateBodyAnalysis(measurements) {
  if (bodyAnalysisCache !== null) return bodyAnalysisCache;
  if (!measurements || measurements.length < 2) return null;

  const apiKey = await getClaudeApiKeyDB();
  if (!apiKey) return null;

  const sorted = [...measurements].sort((a, b) => a.date.localeCompare(b.date));
  const first = cleanMeasurement(sorted[0]);
  const recent = sorted.slice(-5).filter(m => m !== sorted[0]).map(cleanMeasurement);

  const payload = { first, recent };

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 180,
        messages: [{ role: 'user', content: JSON.stringify(payload) }],
        system: BODY_ANALYSIS_PROMPT,
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const text = data.content?.[0]?.text || null;
    bodyAnalysisCache = text;
    return text;
  } catch {
    return null;
  }
}
```

Note : `loadBodyMeasurementsDB` retourne les mesures en format "DB" (snake_case : `graisse_kg`, `tour_de_ventre`). Le helper `cleanMeasurement` convertit vers camelCase et filtre les nulls pour garder le payload compact.

- [ ] **Step 2 : Intégrer dans `renderCorps`**

Dans `renderCorps()` (`app.js:1663`), à la FIN de la fonction (juste avant la dernière `}` qui ferme la fonction), ajouter :

```js
  // Analyse bienveillante en bas
  const analysisCard = document.createElement('div');
  analysisCard.className = 'corps-analysis';
  analysisCard.innerHTML = `
    <div class="corps-analysis-loading">
      <div class="corps-analysis-spinner"></div>
      <span>Analyse en cours…</span>
    </div>
  `;
  body.appendChild(analysisCard);

  generateBodyAnalysis(measurements).then(text => {
    if (!text) { analysisCard.classList.add('hidden'); return; }
    analysisCard.innerHTML = `
      <div class="corps-analysis-title">🌱 Ton évolution</div>
      <div class="corps-analysis-content">${formatFeedback(text)}</div>
    `;
  }).catch(() => analysisCard.classList.add('hidden'));
```

Placer ces lignes au tout dernier moment de `renderCorps` (après les éventuelles règles de graphique / autres sections).

- [ ] **Step 3 : Invalider le cache au save**

Toujours dans `renderCorps`, localiser le handler du bouton "Enregistrer" — plus précisément la ligne `await pushBodyMeasurementDB(m);` (vers ligne 1812). Juste AVANT cette ligne, ajouter :

```js
    bodyAnalysisCache = null;
```

Ainsi, après un save, la prochaine ouverture de l'écran régénère l'analyse.

- [ ] **Step 4 : Syntax check**

```bash
node -c /home/lsecousse/WebstormProjects/Micky/app.js
```

Exit 0.

- [ ] **Step 5 : Vérification grep**

```bash
grep -n "BODY_ANALYSIS_PROMPT\|bodyAnalysisCache\|generateBodyAnalysis\|corps-analysis" /home/lsecousse/WebstormProjects/Micky/app.js
```

Attendu :
- `BODY_ANALYSIS_PROMPT` — 2 hits (définition + fetch body)
- `bodyAnalysisCache` — 3 hits (declaration, check early return, assignment after success, reset in save handler) — 3 ou 4
- `generateBodyAnalysis` — 2 hits (définition + appel dans renderCorps)
- `corps-analysis` — 2-3 hits (className + innerHTML éléments)

- [ ] **Step 6 : Validation manuelle**

Démarrer le serveur, ouvrir l'écran Données corporelles. Vérifier :
1. Au moins 2 mesures en DB + clé API → card "🌱 Ton évolution" apparaît avec spinner puis texte en 2-3s.
2. Fermer et rouvrir l'écran → card instantanée (cache).
3. Enregistrer une nouvelle mesure → reload de l'écran, nouvelle analyse générée.
4. <2 mesures → card cachée.
5. Clé API absente → card cachée.

- [ ] **Step 7 : Commit**

```bash
git add app.js
git commit -m "feat(analyse-corps): analyse bienveillante IA sur l'écran Données corporelles"
```

(Hook bumpe `service-worker.js`.)

---

## Auto-check

- [ ] Card visible + tonalité bienveillante
- [ ] Cache fonctionne (pas d'appel API répété)
- [ ] Cache invalidé après save
- [ ] Conditions silencieuses respectées (<2 mesures, pas de clé API, erreur)
