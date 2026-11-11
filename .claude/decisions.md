# Decisions

- 2026-11-11 : stack : calquee sur Cvfiller (Firefox MV3, TypeScript strict, Vite, vanilla DOM, zero dependance runtime)
- 2026-11-11 : recherche contenu : indexation locale (titre, meta description, texte principal tronque a 4000 caracteres) en IndexedDB ; une page sans contenu indexe est cherchee sur titre et URL
- 2026-11-11 : ouverture : bouton de barre d'outils + raccourci Alt+Shift+H (Ctrl+Shift+H est reserve par Firefox)
- 2026-11-11 : suppression en mode "chaque visite" : supprime l'URL entiere (Firefox ne sait pas supprimer une visite isolee), avec avertissement explicite
- 2026-11-11 : raccourci Ctrl+H : impossible, teste dans Firefox 160 (le Ctrl+H de Firefox, panneau d'historique, gagne sur celui de l'extension) ; on garde Alt+Shift+H, modifiable dans about:addons
- 2026-11-11 : clic sur le nombre de visites d'une page = vue de cette seule page avec toutes ses visites, filtres ignores, Echap ou bouton pour revenir
- 2026-11-11 : installation permanente : signature AMO en canal "unlisted" (non publique) via npm run sign
