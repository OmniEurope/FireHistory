# Decisions

- 2026-11-11 : stack : calquee sur Cvfiller (Firefox MV3, TypeScript strict, Vite, vanilla DOM, zero dependance runtime)
- 2026-11-11 : recherche contenu : indexation locale (titre, meta description, texte principal tronque a 4000 caracteres) en IndexedDB ; une page sans contenu indexe est cherchee sur titre et URL
- 2026-11-11 : ouverture : bouton de barre d'outils + raccourci Alt+Shift+H (Ctrl+Shift+H est reserve par Firefox)
- 2026-11-11 : suppression en mode "chaque visite" : supprime l'URL entiere (Firefox ne sait pas supprimer une visite isolee), avec avertissement explicite
- 2026-11-11 : raccourci Ctrl+H : impossible, teste dans Firefox 160 (le Ctrl+H de Firefox, panneau d'historique, gagne sur celui de l'extension) ; on garde Alt+Shift+H, modifiable dans about:addons
- 2026-11-11 : clic sur le nombre de visites d'une page = vue de cette seule page avec toutes ses visites, filtres ignores, Echap ou bouton pour revenir
- 2026-11-11 : installation permanente : signature AMO en canal "unlisted" (non publique) via npm run sign
- 2026-11-11 : cache des visites : les visites de chaque URL sont gardees en IndexedDB (store `visits`) entre deux ouvertures ; une entree n'est reutilisee que si la derniere visite et le nombre de visites de l'URL sont inchanges
- 2026-11-11 : vue d'une page : bouton "Supprimer cette page" dans la barre de la vue, avec confirmation indiquant le nombre de visites
- 2026-11-11 : depot : GitHub OmniEurope/FireHistory, branches `main` (defaut) et `develop` uniquement ; travail sur develop, puis tout sur main
- 2026-11-11 : licence : EUPL-1.2 (meme texte que les paquets OmniEurope)
