import { $, esc, fmtDate, plural, icon } from '../dom.js';
import { view, setChrome } from '../shell.js';
import { runningCard, programMetaChips, emptyState, startWorkout, blockLabel } from '../components.js';
import { getState, getProgram, getActiveSession } from '../../core/store.js';
import { programStats, sortedPrograms, estMinutes } from '../../core/queries.js';

// Next workout of the active program, hidden while a workout is running.
function nextWorkoutCard(p) {
  const st = p && programStats(p);
  if (!st?.next || getActiveSession()) return '';
  return `
    <section class="card hero-card">
      <p class="eyebrow">Prossimo allenamento · ${blockLabel(p, st)}</p>
      <a class="row" href="#/program/${encodeURIComponent(p.id)}/${encodeURIComponent(st.next.id)}">
        <h2 class="grow ellipsis">${esc(st.next.name)}</h2>${icon('chevron-right', 'muted')}
      </a>
      <p class="muted">${esc(p.name)} · ${plural(st.next.exercises.length, 'esercizio', 'esercizi')} · ~${estMinutes(st.next)} min</p>
      ${st.blockDone ? `<p class="notes">Hai completato questo blocco: <a href="#/import">chiedi a Claude la prossima scheda</a>.</p>` : ''}
      <button class="btn block" id="start-next">${icon('play')}Inizia allenamento</button>
    </section>`;
}

function programCard(p, activeProgramId) {
  const st = programStats(p);
  return `
      <a class="card" href="#/program/${encodeURIComponent(p.id)}">
        <div class="row">
          <div class="grow">
            <h3>${esc(p.name)} ${p.id === activeProgramId ? '<span class="badge">Attiva</span>' : ''}</h3>
            ${p.description ? `<p class="muted small clamp-2">${esc(p.description)}</p>` : ''}
          </div>
          ${icon('chevron-right', 'muted')}
        </div>
        <div class="chips">
          ${programMetaChips(p)}
          <span class="chip">${st.days} giorni</span>
          <span class="chip">${st.exercises} esercizi</span>
          <span class="chip">${st.weeklySets} serie/sett.</span>
        </div>
        <p class="muted small" style="margin-top:10px">
          ${st.sessions ? `${plural(st.sessions, 'allenamento', 'allenamenti')} · ultimo ${fmtDate(st.last.startedAt)}` : 'Mai iniziata'}
        </p>
      </a>`;
}

export function renderHome() {
  setChrome('Schede', { tab: 'home' });
  const { activeProgramId } = getState();
  const active = getProgram(activeProgramId);
  const all = sortedPrograms();
  const list = all.filter(p => !p.archived);
  const archived = all.filter(p => p.archived);
  view.innerHTML = `
    ${runningCard()}
    ${nextWorkoutCard(active)}
    ${list.length ? `<h2>Le tue schede</h2>${list.map(p => programCard(p, activeProgramId)).join('')}`
    : archived.length ? '' : emptyState('dumbbell', 'Nessuna scheda', 'Fattela scrivere da Claude e importala: le istruzioni sono in Importa scheda. Se hai già i tuoi dati su GitHub, collega la sincronizzazione.')}
    <div class="btn-row">
      <a class="btn ${all.length ? 'secondary' : ''}" href="#/import">${icon('plus')}Importa scheda</a>
      ${all.length ? '' : `<a class="btn secondary" href="#/settings">${icon('refresh')}Sincronizza</a>`}
    </div>
    ${archived.length ? `<details class="archive"><summary>Archiviate (${archived.length})</summary>
      ${archived.map(p => programCard(p, activeProgramId)).join('')}</details>` : ''}
  `;
  $('#start-next')?.addEventListener('click', () => {
    const p = getProgram(activeProgramId);
    startWorkout(p.id, programStats(p).next.id);
  });
}
