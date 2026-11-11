/** Static page skeleton. Dynamic parts (list, timeline, status) are filled by main.ts. */
export const LAYOUT = /* html */ `
<header class="top">
  <div class="brand">
    <svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="28" fill="url(#fhg)"/><defs><linearGradient id="fhg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff9500"/><stop offset="1" stop-color="#e0245e"/></linearGradient></defs><circle cx="32" cy="32" r="19" fill="none" stroke="#fff" stroke-width="5"/><path d="M32 20v13l9 6" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <h1>Historique</h1>
  </div>
  <label class="search">
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
    <input id="search" type="text" role="searchbox" autocomplete="off" spellcheck="false"
      placeholder="Rechercher dans les titres, les adresses et le contenu des pages  (site:exemple.com, &quot;expression exacte&quot;)" />
    <button type="button" id="clearSearch" class="clear-search" title="Effacer la recherche (Échap)" aria-label="Effacer la recherche" hidden>✕</button>
  </label>
</header>

<section class="filters" aria-label="Filtres">
  <div class="field-group">
    <span class="field-label">Du</span>
    <input id="fromDate" type="date" />
    <input id="fromTime" type="time" title="Heure de début (facultative)" />
    <span class="field-label">au</span>
    <input id="toDate" type="date" />
    <input id="toTime" type="time" title="Heure de fin (facultative)" />
  </div>
  <div class="chips" id="quick">
    <button type="button" data-quick="today">Aujourd'hui</button>
    <button type="button" data-quick="yesterday">Hier</button>
    <button type="button" data-quick="7">7 jours</button>
    <button type="button" data-quick="30">30 jours</button>
    <button type="button" data-quick="all">Tout</button>
  </div>
  <div class="field-group">
    <div class="segmented" role="radiogroup" aria-label="Affichage">
      <button type="button" role="radio" data-mode="urls" title="Une ligne par page, datée de sa dernière visite">Dernière visite</button>
      <button type="button" role="radio" data-mode="visits" title="Une ligne par visite">Chaque visite</button>
    </div>
    <label class="select">Regrouper
      <select id="group">
        <option value="date">par date</option>
        <option value="site">par site</option>
        <option value="visits">par nombre de visites</option>
        <option value="none">sans regroupement</option>
      </select>
    </label>
    <label class="select">Trier
      <select id="sort">
        <option value="recent">plus récent</option>
        <option value="oldest">plus ancien</option>
        <option value="visits">plus visité</option>
        <option value="title">titre (A à Z)</option>
      </select>
    </label>
    <button type="button" id="timelineToggle" class="ghost" aria-pressed="true">Timeline</button>
    <button type="button" id="reset" class="ghost">Réinitialiser</button>
  </div>
</section>

<section id="focusBar" class="focus-bar" hidden>
  <span class="focus-label">Toutes les visites de</span>
  <strong id="focusTitle"></strong>
  <span class="spacer"></span>
  <button type="button" id="focusClose" class="ghost" title="Revenir à l'historique (Échap)">✕ Revenir à l'historique</button>
</section>

<section id="timeline" class="timeline" aria-label="Timeline"></section>

<section class="actions">
  <label class="check-all"><input id="selectAll" type="checkbox" /> <span id="count">Chargement…</span></label>
  <span id="progress" class="progress" hidden></span>
  <span class="spacer"></span>
  <span id="selInfo" class="sel-info"></span>
  <button type="button" id="clearSel" class="ghost" disabled>Désélectionner</button>
  <button type="button" id="delete" class="danger" disabled>Supprimer</button>
</section>

<main id="viewport" class="viewport" tabindex="0">
  <div id="spacer" class="spacer-box"></div>
  <div id="empty" class="empty" hidden></div>
</main>

<footer class="status">
  <label><input id="indexToggle" type="checkbox" /> Indexer le contenu des pages visitées</label>
  <span id="indexInfo"></span>
  <button type="button" id="grant" class="link" hidden>Autoriser l'accès aux pages</button>
  <button type="button" id="clearIndex" class="link">Vider l'index</button>
  <span class="spacer"></span>
  <span class="hint">Maj+clic : sélection d'une plage · Ctrl+A : tout · Suppr : supprimer · Échap : désélectionner</span>
</footer>

<dialog id="confirm">
  <form method="dialog">
    <h2 id="confirmTitle"></h2>
    <p id="confirmText"></p>
    <div class="dialog-actions">
      <button value="cancel" class="ghost">Annuler</button>
      <button value="ok" class="danger" id="confirmOk">Supprimer</button>
    </div>
  </form>
</dialog>
`;
