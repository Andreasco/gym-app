// Reusable UI fragments (HTML strings) and the exercise picker overlay.
import { esc, fmtTime } from './dom.js';
import { IT, tr } from '../core/i18n.js';
import { getExercise, plannedName, imageUrl, searchExercises } from '../core/exercises.js';
import { getProgram, getActiveSession } from '../core/store.js';

export function exerciseRow(x) {
  const ex = getExercise(x.exerciseId);
  const inner = `
    <div class="row">
      ${ex ? `<img class="thumb" loading="lazy" src="${imageUrl(ex)}" alt="">` : '<div class="thumb"></div>'}
      <div class="grow">
        <h3 class="ellipsis">${esc(plannedName(x))}</h3>
        <div class="target">
          <span><b>${esc(x.sets)}</b> × <b>${esc(x.reps ?? '—')}</b></span>
          ${x.restSec ? `<span>⏱ ${fmtTime(x.restSec)}</span>` : ''}
          ${x.rpe ? `<span>RPE ${esc(x.rpe)}</span>` : ''}
        </div>
      </div>
    </div>`;
  return ex ? `<a class="card" href="#/exercise/${encodeURIComponent(x.exerciseId)}">${inner}</a>` : `<div class="card">${inner}</div>`;
}

export function exerciseListItem(e, { tag = 'a', small = false } = {}) {
  const attrs = tag === 'a' ? `class="card" href="#/exercise/${encodeURIComponent(e.id)}"` : `class="card row pick" data-id="${esc(e.id)}"`;
  const body = `
    <img class="thumb" loading="lazy" src="${imageUrl(e)}" alt="">
    <div class="grow"><h3 class="ellipsis">${esc(e.name)}</h3>
    <p class="muted ellipsis${small ? ' small' : ''}">${e.primaryMuscles.map(m => tr('muscles', m)).join(', ')} · ${tr('equipment', e.equipment)}</p></div>`;
  return tag === 'a' ? `<a ${attrs}><div class="row">${body}</div></a>` : `<button ${attrs}>${body}</button>`;
}

export function runningCard() {
  const running = getActiveSession();
  return running ? `
    <a class="card" href="#/workout/${running.id}" style="border-color:var(--ok)">
      <div class="row"><div class="grow"><h3>Allenamento in corso</h3>
      <p class="muted">${esc(getProgram(running.programId)?.name || running.programName || '')} · ${esc(running.dayName)}</p></div>
      <span class="badge" style="background:var(--ok)">Riprendi</span></div>
    </a>` : '';
}

// Optional program metadata (goal, level, weeks) as chip labels.
export function programMetaChips(p) {
  return [
    p.goal && `🎯 ${esc(p.goal)}`,
    p.level && `📶 ${esc(tr('level', p.level))}`,
    p.weeks && `🗓 ${esc(p.weeks)} sett.`,
  ].filter(Boolean).map(m => `<span class="chip">${m}</span>`).join('');
}

export const muscleOptions = selected =>
  Object.keys(IT.muscles).map(m => `<option value="${m}" ${selected === m ? 'selected' : ''}>${tr('muscles', m)}</option>`).join('');
export const equipmentOptions = selected =>
  Object.keys(IT.equipment).map(m => `<option value="${m}" ${selected === m ? 'selected' : ''}>${tr('equipment', m)}</option>`).join('');

// Full-screen searchable exercise picker. Resolves with the chosen exercise id, or null.
export function pickExercise(title = 'Scegli esercizio') {
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'picker';
    el.innerHTML = `
      <div class="picker-head">
        <button class="icon-btn" data-close aria-label="Chiudi">‹</button>
        <h1>${esc(title)}</h1>
      </div>
      <div class="picker-filters">
        <input type="search" placeholder="Cerca esercizio" autocapitalize="off" autocorrect="off">
        <select><option value="">Tutti i muscoli</option>${muscleOptions('')}</select>
      </div>
      <div class="picker-list"></div>`;
    document.body.appendChild(el);
    const [q, muscle, list] = [el.querySelector('input'), el.querySelector('select'), el.querySelector('.picker-list')];
    const close = id => { el.remove(); resolve(id); };
    const draw = () => {
      const found = searchExercises({ q: q.value, muscle: muscle.value });
      list.innerHTML = found.slice(0, 100).map(e => exerciseListItem(e, { tag: 'button', small: true })).join('') || '<p class="muted">Nessun risultato.</p>';
    };
    q.oninput = draw;
    muscle.onchange = draw;
    list.onclick = ev => { const b = ev.target.closest('[data-id]'); if (b) close(b.dataset.id); };
    el.querySelector('[data-close]').onclick = () => close(null);
    draw();
    setTimeout(() => q.focus(), 50);
  });
}
