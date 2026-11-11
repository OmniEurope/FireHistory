# Decisions

- 2026-11-11 : stack : calquee sur Cvfiller (Firefox MV3, TypeScript strict, Vite, vanilla DOM, zero dependance runtime)
- 2026-11-11 : recherche contenu : indexation locale (titre, meta description, texte principal tronque a 4000 caracteres) en IndexedDB ; une page sans contenu indexe est cherchee sur titre et URL
- 2026-11-11 : ouverture : bouton de barre d'outils + raccourci Alt+Shift+H (Ctrl+Shift+H est reserve par Firefox)
- 2026-11-11 : suppression en mode "chaque visite" : supprime l'URL entiere (Firefox ne sait pas supprimer une visite isolee), avec avertissement explicite
