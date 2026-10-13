import { $, esc, plural, icon } from '../dom.js';
import { view, setChrome, renderNotFound } from '../shell.js';
import { exerciseRow, startWorkout } from '../components.js';
import { getProgram } from '../../core/store.js';
import { estMinutes } from '../../core/queries.js';

export function renderDay(pid, did) {
  const p = getProgram(pid);
  const d = p?.days.find(x => x.id === did);
  if (!d) return renderNotFound();
  setChrome(d.name, { back: true, tab: 'home' });
  view.innerHTML = `
    <div class="row">
      <p class="muted grow"><a href="#/program/${encodeURIComponent(p.id)}">${esc(p.name)}</a> · ${plural(d.exercises.length, 'esercizio', 'esercizi')} · ~${estMinutes(d)} min</p>
      <a class="btn secondary small" href="#/edit/${encodeURIComponent(p.id)}/${encodeURIComponent(d.id)}">${icon('pencil')}Modifica</a>
    </div>
    ${d.notes ? `<div class="notes">${esc(d.notes)}</div>` : ''}
    ${d.exercises.map(x => exerciseRow(x)).join('')}
    <div class="action-bar"><button class="btn" id="start">${icon('play')}Inizia allenamento</button></div>
  `;
  $('#start').onclick = () => startWorkout(p.id, d.id);
}
