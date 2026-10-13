// Reusable UI fragments (HTML strings) and the exercise picker overlay.
import { esc, fmtTime, icon } from './dom.js';
import { IT, tr } from '../core/i18n.js';
import { getExercise, plannedName, imageUrl, searchExercises } from '../core/exercises.js';
import { getProgram, getActiveSession, startSession } from '../core/store.js';

// Planned sets × reps, rest and RPE of a program exercise.
export function targetLine(x, label = '') {
  return `
    <div class="target">
      <span>${label}<b>${esc(x.sets ?? '—')} × ${esc(x.reps ?? '—')}</b></span>
      ${x.restSec ? `<span>${icon('timer')}${fmtTime(x.restSec)}</span>` : ''}
      ${x.rpe ? `<span>RPE ${esc(x.rpe)}</span>` : ''}
    </div>`;
}

export function exerciseRow(x) {
  const ex = getExercise(x.exerciseId);
  const inner = `
    <div class="row">
      ${ex ? `<img class="thumb" loading="lazy" src="${imageUrl(ex)}" alt="">` : '<div class="thumb"></div>'}
      <div class="grow">
        <h3 class="ellipsis">${esc(plannedName(x))}</h3>
        ${targetLine(x)}
      </div>
      ${ex ? icon('chevron-right', 'muted') : ''}
    </div>`;
  return ex ? `<a class="card" href="#/exercise/${encodeURIComponent(x.exerciseId)}">${inner}</a>` : `<div class="card">${inner}</div>`;
}

export function exerciseListItem(e, { tag = 'a' } = {}) {
  const body = `
    <img class="thumb" loading="lazy" src="${imageUrl(e)}" alt="">
    <div class="grow"><h3 class="ellipsis">${esc(e.name)}</h3>
    <p class="muted small ellipsis">${e.primaryMuscles.map(m => tr('muscles', m)).join(', ')} · ${tr('equipment', e.equipment)}</p></div>`;
  return tag === 'a'
    ? `<a class="card row" href="#/exercise/${encodeURIComponent(e.id)}">${body}${icon('chevron-right', 'muted')}</a>`
    : `<button class="card row pick" data-id="${esc(e.id)}">${body}</button>`;
}

export function runningCard() {
  const running = getActiveSession();
  return running ? `
    <a class="card ok" href="#/workout/${running.id}">
      <div class="row"><div class="grow"><h3>Allenamento in corso</h3>
      <p class="muted">${esc(getProgram(running.programId)?.name || running.programName || '')} · ${esc(running.dayName)}</p></div>
      <span class="badge ok">Riprendi</span></div>
    </a>` : '';
}

// Optional program metadata (goal, level, weeks) as chip labels.
export function programMetaChips(p) {
  return [
    p.goal && esc(p.goal),
    p.level && esc(tr('level', p.level)),
    p.weeks && `${esc(p.weeks)} sett.`,
  ].filter(Boolean).map(m => `<span class="chip">${m}</span>`).join('');
}

// Position in the block for a program and its programStats().
export const blockLabel = (p, st) => (st.blockDone ? 'Blocco completato' : `Settimana ${st.week}${p.weeks ? ` di ${esc(p.weeks)}` : ''}`);

// Row of summary tiles from [value, label] pairs.
export const statTiles = items =>
  `<div class="stats">${items.map(([value, label]) => `<div class="stat"><b>${esc(value)}</b><span>${esc(label)}</span></div>`).join('')}</div>`;

export const emptyState = (iconName, title, text = '') =>
  `<div class="empty">${icon(iconName)}<h2>${esc(title)}</h2>${text ? `<p>${esc(text)}</p>` : ''}</div>`;

export const equipmentOptions = selected =>
  Object.keys(IT.equipment).map(m => `<option value="${m}" ${selected === m ? 'selected' : ''}>${tr('equipment', m)}</option>`).join('');

// Horizontal single-choice muscle filter; wire it with bindMuscleChips.
export const muscleChips = selected => `
  <div class="chip-scroll" role="group" aria-label="Filtra per muscolo">
    ${[['', 'Tutti'], ...Object.entries(IT.muscles)].map(([key, label]) =>
      `<button type="button" class="chip-btn" data-muscle="${key}" aria-pressed="${selected === key}">${label}</button>`).join('')}
  </div>`;

export function bindMuscleChips(root, onPick) {
  root.querySelector('.chip-scroll').onclick = ev => {
    const chip = ev.target.closest('[data-muscle]');
    if (!chip) return;
    root.querySelectorAll('[data-muscle]').forEach(b => b.setAttribute('aria-pressed', b === chip));
    onPick(chip.dataset.muscle);
  };
}

// Starts a workout for a program day and opens it; asks first when one is already running.
export function startWorkout(programId, dayId) {
  if (getActiveSession() && !confirm('C\'è già un allenamento in corso. Lo scarto e ne inizio uno nuovo?')) return;
  location.hash = `#/workout/${startSession(programId, dayId).id}`;
}

// Full-screen searchable exercise picker. Resolves with the chosen exercise id, or null.
export function pickExercise(title = 'Scegli esercizio') {
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'picker';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', title);
    el.innerHTML = `
      <div class="picker-head">
        <h1>${esc(title)}</h1>
        <button class="icon-btn" data-close aria-label="Chiudi">${icon('x')}</button>
      </div>
      <div class="picker-filters">
        <input type="search" placeholder="Cerca esercizio" aria-label="Cerca esercizio" autocapitalize="off" autocorrect="off">
        ${muscleChips('')}
      </div>
      <div class="picker-list"></div>`;
    document.body.appendChild(el);
    const [q, list] = [el.querySelector('input'), el.querySelector('.picker-list')];
    let muscle = '';
    const close = id => { el.remove(); resolve(id); };
    const draw = () => {
      const found = searchExercises({ q: q.value, muscle });
      list.innerHTML = found.slice(0, 100).map(e => exerciseListItem(e, { tag: 'button' })).join('') || '<p class="muted">Nessun risultato.</p>';
    };
    q.oninput = draw;
    bindMuscleChips(el, m => { muscle = m; draw(); });
    list.onclick = ev => { const b = ev.target.closest('[data-id]'); if (b) close(b.dataset.id); };
    el.querySelector('[data-close]').onclick = () => close(null);
    draw();
    setTimeout(() => q.focus(), 50);
  });
}
