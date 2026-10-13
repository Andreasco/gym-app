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
      ${st.blockDone ? `<p class="notes">Hai completato questo blocco: chiedi a Claude la prossima scheda.</p>` : ''}
      <button class="btn block" id="start-next">${icon('play')}Inizia allenamento</button>
    </section>`;
}

export function renderHome() {
  setChrome('Schede', { tab: 'home' });
  const { activeProgramId } = getState();
  const active = getProgram(activeProgramId);
  const list = sortedPrograms();
  view.innerHTML = `
    ${runningCard()}
    ${nextWorkoutCard(active)}
    ${list.length ? `<h2>Le tue schede</h2>${list.map(p => {
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
    }).join('')}` : emptyState('dumbbell', 'Nessuna scheda', 'Importa una scheda in formato JSON, oppure collega la sincronizzazione se hai già i tuoi dati su GitHub.')}
    <div class="btn-row">
      <a class="btn ${list.length ? 'secondary' : ''}" href="#/import">${icon('plus')}Importa scheda</a>
      ${list.length ? '' : `<a class="btn secondary" href="#/settings">${icon('refresh')}Sincronizza</a>`}
    </div>
  `;
  $('#start-next')?.addEventListener('click', () => {
    const p = getProgram(activeProgramId);
    startWorkout(p.id, programStats(p).next.id);
  });
}
