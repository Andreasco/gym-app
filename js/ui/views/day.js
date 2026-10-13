import { $, esc, icon } from '../dom.js';
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
    <p class="muted"><a href="#/program/${encodeURIComponent(p.id)}">${esc(p.name)}</a> · ${d.exercises.length} esercizi · ~${estMinutes(d)} min</p>
    ${d.notes ? `<div class="notes">${esc(d.notes)}</div>` : ''}
    ${d.exercises.map(x => exerciseRow(x)).join('')}
    <div class="action-bar"><button class="btn" id="start">${icon('play')}Inizia allenamento</button></div>
  `;
  $('#start').onclick = () => startWorkout(p.id, d.id);
}
