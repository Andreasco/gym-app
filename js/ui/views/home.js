import { $, esc, fmtDate, plural, icon } from '../dom.js';
import { view, setChrome } from '../shell.js';
import { runningCard, programMetaChips, emptyState, startWorkout } from '../components.js';
import { getState, getProgram, getActiveSession } from '../../core/store.js';
import { programStats, sortedPrograms, estMinutes } from '../../core/queries.js';

// Next workout of the active program, hidden while a workout is running.
function nextWorkoutCard(p) {
  const st = p && programStats(p);
  if (!st?.next || getActiveSession()) return '';
  return `
    <section class="card hero-card">
      <p class="eyebrow">Prossimo allenamento</p>
      <a class="row" href="#/program/${encodeURIComponent(p.id)}/${encodeURIComponent(st.next.id)}">
        <h2 class="grow ellipsis">${esc(st.next.name)}</h2>${icon('chevron-right', 'muted')}
      </a>
      <p class="muted">${esc(p.name)} · ${st.next.exercises.length} esercizi · ~${estMinutes(st.next)} min</p>
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
    }).join('')}` : emptyState('dumbbell', 'Nessuna scheda', 'Chiedi a Claude una scheda in JSON e importala.')}
    <div class="btn-row"><a class="btn secondary" href="#/import">${icon('plus')}Importa scheda</a></div>
  `;
  $('#start-next')?.addEventListener('click', () => {
    const p = getProgram(activeProgramId);
    startWorkout(p.id, programStats(p).next.id);
  });
}
