import { esc, fmtDate, icon } from '../dom.js';
import { view, setChrome } from '../shell.js';
import { statTiles, emptyState } from '../components.js';
import { historySessions, sessionSummary } from '../../core/queries.js';

const DAY_MS = 864e5;

export function renderHistory() {
  setChrome('Storico', { tab: 'history' });
  const done = historySessions();
  if (!done.length) {
    view.innerHTML = emptyState('chart', 'Nessun allenamento', 'Gli allenamenti terminati compaiono qui.');
    return;
  }
  const since = days => done.filter(s => Date.now() - new Date(s.startedAt) < days * DAY_MS).length;
  view.innerHTML = statTiles([[since(7), 'ultimi 7 giorni'], [since(30), 'ultimi 30 giorni'], [done.length, 'totali']]) +
    done.map(s => {
      const { sets, volume, minutes } = sessionSummary(s);
      return `
      <a class="card" href="#/workout/${s.id}">
        <div class="row"><div class="grow">
          <h3>${esc(s.dayName)}</h3>
          <p class="muted">${fmtDate(s.startedAt)}${s.programName ? ` · ${esc(s.programName)}` : ''}</p>
        </div>${icon('chevron-right', 'muted')}</div>
        <div class="chips">
          <span class="chip">${minutes} min</span>
          <span class="chip">${sets} serie</span>
          <span class="chip">${volume} kg</span>
        </div>
      </a>`;
    }).join('');
}
