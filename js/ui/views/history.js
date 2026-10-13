import { esc, fmtDate, fmtNum, fmtCompact, fmtSigned, icon } from '../dom.js';
import { view, setChrome } from '../shell.js';
import { statTiles, emptyState, columnChart, sparkline } from '../components.js';
import { historySessions, sessionSummary, weeklyTotals, strengthTrends } from '../../core/queries.js';

const DAY_MS = 864e5;
const WEEKS = 8;

// Which half of the screen is open: the workout list or the progress charts.
let tab = 'list';

function workoutList(done) {
  const since = days => done.filter(s => Date.now() - new Date(s.startedAt) < days * DAY_MS).length;
  return statTiles([[since(7), 'ultimi 7 giorni'], [since(30), 'ultimi 30 giorni'], [done.length, 'totali']]) +
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

function progress() {
  const weeks = weeklyTotals(WEEKS);
  const label = w => `${w.start.getDate()}/${w.start.getMonth() + 1}`;
  const trends = strengthTrends();
  return `
    <h2>Costanza</h2>
    <p class="muted">Allenamenti per settimana nelle ultime ${WEEKS} settimane. La data è il lunedì.</p>
    <div class="card">${columnChart(weeks.map(w => ({ value: w.workouts, text: String(w.workouts), label: label(w) })), 'Allenamenti per settimana')}</div>
    <h2>Volume</h2>
    <p class="muted">Chili sollevati per settimana (peso × ripetizioni).</p>
    <div class="card">${columnChart(weeks.map(w => ({ value: w.volume, text: fmtCompact(w.volume), label: label(w) })), 'Chili sollevati per settimana')}</div>
    <h2>Forza</h2>
    <p class="muted">Massimale stimato per esercizio e variazione dal primo allenamento registrato.</p>
    ${trends.map(t => {
      const last = t.series.at(-1).value;
      const change = last - t.series[0].value;
      return `
      <a class="card row" href="#/exercise/${encodeURIComponent(t.exerciseId)}">
        <div class="grow">
          <h3 class="ellipsis">${esc(t.name)}</h3>
          <p class="muted small"><b class="num">${fmtNum(last)} kg</b> · <span class="delta ${change > 0 ? 'up' : ''}">${fmtSigned(change)} kg</span> in ${t.series.length} allenamenti</p>
        </div>
        ${sparkline(t.series.map(p => p.value))}
        ${icon('chevron-right', 'muted')}
      </a>`;
    }).join('') || '<p class="muted">Servono almeno due allenamenti con lo stesso esercizio e un carico.</p>'}
  `;
}

export function renderHistory() {
  setChrome('Storico', { tab: 'history' });
  const done = historySessions();
  if (!done.length) {
    view.innerHTML = emptyState('chart', 'Nessun allenamento', 'Gli allenamenti terminati compaiono qui.');
    return;
  }
  const option = (key, text) => `<button role="tab" data-tab="${key}" aria-selected="${tab === key}">${text}</button>`;
  view.innerHTML = `
    <div class="segmented" role="tablist">${option('list', 'Allenamenti')}${option('progress', 'Progressi')}</div>
    ${tab === 'list' ? workoutList(done) : progress()}
  `;
  view.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => {
    tab = b.dataset.tab;
    renderHistory();
    view.scrollTop = 0;
  });
}
