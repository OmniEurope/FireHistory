# Handoff - 2026-11-11

## State
Branch: develop · Last commit: 5fbff6a feat: single-page visits view, search clear button, progressive visit loading, AMO signing scripts
Arbre propre. Aucun fichier `.claude/auditsession.md` ni `.claude/challenge-session.md` (0 suivi d'audit, 0 finding de challenge). Rien n'est poussé (pas de remote configuré).

## Mission
Créer FireHistory, une extension Firefox d'historique façon Chrome, sur la base de Cvfiller : liste par date, regroupements, timeline, filtre de dates et d'heures, recherche (titre, URL, contenu), sélection et suppression, performance. Puis : vue d'une page via son nombre de visites, croix de recherche, Ctrl+H, installation permanente, diagnostic du « 20 février ». Tout est livré et prouvé ; il ne reste que la signature, à faire par l'utilisateur.

## Decisions
- Stack calquée sur Cvfiller : MV3, TypeScript strict, Vite, vanilla DOM, zéro dépendance runtime.
- Recherche dans le contenu : indexation locale en IndexedDB (titre, meta description, texte tronqué à 4000 caractères) ; une page non indexée est cherchée sur titre et URL.
- Ouverture : bouton de barre d'outils + `Alt+Shift+H` ; Ctrl+H impossible (testé, Firefox garde la priorité).
- Suppression en mode « Chaque visite » : supprime l'URL entière, avec avertissement (Firefox ne sait pas supprimer une visite isolée).
- Clic sur le nombre de visites : vue de cette seule page avec toutes ses visites, filtres ignorés.
- Installation permanente : signature AMO en canal « unlisted » (non publique) via `npm run sign`.
- Tout est dans `.claude/decisions.md`.

## Done in this session
- Extension complète (page d'historique virtualisée, filtres, groupes, timeline, sélection Maj+clic, suppression) : `npm run e2e`, 18/18 PASS dans un vrai Firefox 160 sans fenêtre (Marionette, profil jetable).
- Logique pure (dates, filtres, groupes, timeline) : `npm test`, 17 tests verts.
- Recherche dans le contenu seul, description affichée, suppression réelle dans l'historique Firefox : couverts par l'e2e (vérification via Places).
- Vue d'une page + croix de recherche : e2e PASS + capture d'écran Marionette relue.
- « 20 février » : diagnostic sur une copie locale de `places.sqlite` : comportement normal, en mode « Dernière visite » la timeline commence à la plus ancienne dernière visite, pas à la plus ancienne visite.
- Performance sur une copie d'un historique réel (plus de 50 000 pages) avec `tests/e2e/perf.mjs` : dernière visite 1,3 s ; chaque visite, premières lignes en 1,05 s, tout en 9 s ; recherche 0,2 s.
- Ctrl+H : sonde Marionette, l'extension enregistre la touche mais le panneau d'historique de Firefox s'ouvre.
- `web-ext lint` : 0 erreur, 4 avertissements (innerHTML avec valeurs échappées, version Android).

### Annoncé, non prouvé
- `npm run sign` : jamais exécuté (il faut les clés AMO de l'utilisateur).

## In progress
Rien. Lots du contrat tous `[x]`.

## Next step
Attendre le retour de l'utilisateur après sa signature et son installation permanente.

## Key files
- `public/manifest.json` → manifeste (id `firehistory@local`, raccourci, data_collection_permissions).
- `src/history/main.ts` → état, liste virtualisée, filtres, vue d'une page, suppression, timeline.
- `src/history/layout.ts`, `src/history/styles.css` → structure et style de la page.
- `src/shared/query.ts`, `dates.ts`, `text.ts` → logique pure testée.
- `src/shared/db.ts`, `src/background/index.ts`, `src/content/index.ts` → capture et index du contenu.
- `tests/e2e/firefox.mjs`, `tests/e2e/marionette.mjs`, `tests/e2e/perf.mjs` → preuves dans un vrai Firefox.
- `dev/mock-browser.ts` → FAUX `browser.*` pour l'aperçu dev uniquement.

## Pitfalls
- WebDriver BiDi (puppeteer) refuse d'ouvrir les pages `moz-extension://` : l'e2e passe par Marionette en contexte chrome avec `MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1` (Firefox de test uniquement).
- Le Bash de l'outil abîme les heredocs contenant des backslashes ou des backticks imbriqués : passer par l'outil Write.
- Le navigateur intégré ne fait pas de captures quand la fenêtre est cachée : utiliser `WebDriver:TakeScreenshot` (variable `E2E_SCREENSHOT`).
- 3 vulnérabilités « low » dans les dépendances de développement de web-ext (outil de dev uniquement).

## Open questions
- Aucune.
