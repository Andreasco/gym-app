import { esc, fmtDate } from '../dom.js';
import { view, setChrome } from '../shell.js';
import { historySessions, sessionSummary } from '../../core/queries.js';

export function renderHistory() {
  setChrome('Storico', { tab: 'history' });
  const done = historySessions();
  if (!done.length) {
    view.innerHTML = '<div class="empty"><p style="font-size:40px;margin:0">📈</p><p>Nessun allenamento completato.</p></div>';
    return;
  }
  view.innerHTML = done.map(s => {
    const { sets, volume, minutes } = sessionSummary(s);
    return `
      <a class="card" href="#/workout/${s.id}">
        <div class="row"><div class="grow">
          <h3>${esc(s.dayName)}</h3>
          <p class="muted">${fmtDate(s.startedAt)} · ${minutes} min · ${sets} serie · ${volume} kg</p>
        </div><span class="muted">›</span></div>
      </a>`;
  }).join('');
}
