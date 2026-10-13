import { esc, fmtDate, plural } from '../dom.js';
import { view, setChrome } from '../shell.js';
import { runningCard, programMetaChips } from '../components.js';
import { getState } from '../../core/store.js';
import { programStats, sortedPrograms } from '../../core/queries.js';

export function renderHome() {
  setChrome('Schede', { tab: 'home' });
  const { activeProgramId } = getState();
  const list = sortedPrograms();
  view.innerHTML = `
    ${runningCard()}
    ${list.length ? list.map(p => {
      const st = programStats(p);
      const active = p.id === activeProgramId;
      return `
      <a class="card" href="#/program/${encodeURIComponent(p.id)}" ${active ? 'style="border-color:var(--accent)"' : ''}>
        <div class="row">
          <div class="grow">
            <h3>${esc(p.name)} ${active ? '<span class="badge">Attiva</span>' : ''}</h3>
            ${p.description ? `<p class="muted small clamp-2">${esc(p.description)}</p>` : ''}
          </div>
          <span class="muted">›</span>
        </div>
        <div class="chips">
          ${programMetaChips(p)}
          <span class="chip">${st.days} giorni</span>
          <span class="chip">${st.exercises} esercizi</span>
          <span class="chip">${st.weeklySets} serie/sett.</span>
        </div>
        <p class="muted small" style="margin-top:8px">
          ${st.sessions ? `${plural(st.sessions, 'allenamento', 'allenamenti')} · ultimo ${fmtDate(st.last.startedAt)} · prossimo <b style="color:var(--text)">${esc(st.next.name)}</b>` : 'Mai iniziata'}
          · importata ${fmtDate(p.importedAt)}
        </p>
      </a>`;
    }).join('') : `
      <div class="empty">
        <p style="font-size:40px;margin:0">🏋️</p>
        <p>Nessuna scheda.</p>
        <p class="small">Chiedi a Claude una scheda in JSON e importala.</p>
      </div>`}
    <div class="btn-row"><a class="btn" href="#/import">Importa scheda</a></div>
  `;
}
