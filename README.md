# FireHistory

Extension Firefox qui affiche tout l'historique de navigation dans une page complète.

- Liste par date (Aujourd'hui, Hier, puis jour par jour), ou regroupée par site, par nombre de visites, ou sans regroupement.
- Affichage « Dernière visite » (une ligne par page) ou « Chaque visite » (une ligne par visite).
- Filtre de dates : « Du » seul = la journée entière ; « Du » + « au » = la plage ; heures facultatives. Raccourcis Aujourd'hui, Hier, 7 jours, 30 jours.
- Timeline des visites (par heure, jour ou mois selon la période) ; un clic sur une barre zoome sur cette période.
- Recherche sur le titre, l'adresse et le contenu des pages visitées depuis l'installation (`site:exemple.com`, `"expression exacte"`). Sans contenu indexé, la recherche porte sur le titre et l'adresse.
- Sélection multiple (Maj+clic pour une plage, Ctrl+A pour tout) et suppression (Suppr).

## Installation (développement)

```bash
npm install
npm run build
```

Puis dans Firefox : `about:debugging#/runtime/this-firefox`, « Charger un module complémentaire temporaire », choisir `dist/manifest.json`. Ouvrir avec le bouton de la barre d'outils ou `Alt+Shift+H`.

## Limites de Firefox

- Une visite isolée ne peut pas être supprimée : la suppression retire la page avec toutes ses visites.
- `about:history` ne peut pas être remplacé par une extension.
- Le contenu des pages n'est capturé qu'à partir de l'installation, jamais en navigation privée, et reste local.
