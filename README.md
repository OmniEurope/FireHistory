# FireHistory

Extension Firefox qui affiche tout l'historique de navigation dans une page complète.

- Liste par date (Aujourd'hui, Hier, puis jour par jour), ou regroupée par site, par nombre de visites, ou sans regroupement.
- Affichage « Dernière visite » (une ligne par page) ou « Chaque visite » (une ligne par visite).
- Filtre de dates : « Du » seul = la journée entière ; « Du » + « au » = la plage ; heures facultatives. Raccourcis Aujourd'hui, Hier, 7 jours, 30 jours.
- Timeline des visites (par heure, jour ou mois selon la période) ; un clic sur une barre zoome sur cette période.
- Recherche sur le titre, l'adresse et le contenu des pages visitées depuis l'installation (`site:exemple.com`, `"expression exacte"`). Sans contenu indexé, la recherche porte sur le titre et l'adresse.
- Un clic sur le nombre de visites d'une page affiche cette seule page avec toutes ses visites (Échap pour revenir).
- Croix dans la recherche (ou Échap) pour l'effacer.
- Sélection multiple (Maj+clic pour une plage, Ctrl+A pour tout) et suppression (Suppr).

## Installation (développement)

```bash
npm install
npm run build
```

Puis dans Firefox : `about:debugging#/runtime/this-firefox`, « Charger un module complémentaire temporaire », choisir `dist/manifest.json`. Ouvrir avec le bouton de la barre d'outils ou `Alt+Shift+H`.

## Installation permanente

Firefox (version normale) n'accepte que les extensions signées par Mozilla. La signature se fait en canal « unlisted » : l'extension n'est **pas publiée** sur le site des modules, Mozilla la signe automatiquement et rend un fichier `.xpi` installable définitivement.

1. Créer des clés d'API sur https://addons.mozilla.org/developers/addon/api/key/ (compte Mozilla).
2. Lancer, avec les clés dans l'environnement :

   ```bash
   WEB_EXT_API_KEY=... WEB_EXT_API_SECRET=... npm run sign
   ```

3. Ouvrir le `.xpi` produit dans `web-ext-artifacts/` avec Firefox (glisser-déposer) et accepter l'installation.

Nouvelle version : augmenter `version` dans `public/manifest.json`, puis relancer `npm run sign`. L'identifiant `firehistory@local` ne change pas, l'index du contenu est donc conservé.

Sans signature, seules Firefox Developer Edition, Nightly ou ESR acceptent `xpinstall.signatures.required = false`.

## Raccourci

`Alt+Shift+H` par défaut, modifiable dans `about:addons`, roue dentée, « Gérer les raccourcis d'extensions ». `Ctrl+H` ne fonctionne pas : Firefox garde la priorité et ouvre son panneau d'historique (vérifié sur Firefox 160).

## Limites de Firefox

- Le premier affichage de « Chaque visite » demande un appel par page (environ 9 s pour 54 000 pages ; les visites récentes s'affichent dès la première seconde), ensuite c'est en cache.

- Une visite isolée ne peut pas être supprimée : la suppression retire la page avec toutes ses visites.
- `about:history` ne peut pas être remplacé par une extension.
- Le contenu des pages n'est capturé qu'à partir de l'installation, jamais en navigation privée, et reste local.
