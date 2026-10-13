import { $, esc } from '../dom.js';
import { view, setChrome, renderNotFound } from '../shell.js';
import { exerciseRow } from '../components.js';
import { getProgram, getActiveSession, startSession } from '../../core/store.js';
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
    <div class="btn-row"><button class="btn ok block" id="start">Inizia allenamento</button></div>
  `;
  $('#start').onclick = () => {
    if (getActiveSession() && !confirm('C\'è già un allenamento in corso. Lo scarto e ne inizio uno nuovo?')) return;
    const s = startSession(p.id, d.id);
    location.hash = `#/workout/${s.id}`;
  };
}
