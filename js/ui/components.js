// Reusable UI fragments (HTML strings) and the exercise picker overlay.
import { esc, fmtTime, fmtDay, fmtNum, icon } from './dom.js';
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

// ---------- charts (inline SVG, single series, no dependencies) ----------

const CHART_W = 328;

// Columns with the value on the cap and a label under the baseline.
// items: [{ value, text, label }]
export function columnChart(items, title) {
  const H = 148, base = 120, top = 18, r = 4;
  const slot = CHART_W / items.length;
  const bar = Math.min(24, slot - 8);
  const max = Math.max(1, ...items.map(it => it.value));
  return `
    <svg class="chart" viewBox="0 0 ${CHART_W} ${H}" role="img" aria-label="${esc(title)}: ${esc(items.map(it => `${it.label} ${it.text}`).join(', '))}">
      <line class="axis" x1="0" x2="${CHART_W}" y1="${base}" y2="${base}"/>
      ${items.map((it, i) => {
        const h = Math.round(it.value / max * (base - top));
        const x = i * slot + (slot - bar) / 2;
        const column = h > r
          ? `<path class="bar" d="M${x},${base}v${r - h}a${r},${r} 0 0 1 ${r},${-r}h${bar - 2 * r}a${r},${r} 0 0 1 ${r},${r}v${h - r}z"/>`
          : h > 0 ? `<rect class="bar" x="${x}" y="${base - h}" width="${bar}" height="${h}"/>` : '';
        return `${column}
          <text ${it.value ? 'class="val"' : ''} x="${x + bar / 2}" y="${base - h - 6}" text-anchor="middle">${esc(it.text)}</text>
          <text x="${x + bar / 2}" y="${H - 10}" text-anchor="middle">${esc(it.label)}</text>`;
      }).join('')}
    </svg>`;
}

// Small trend line with a dot on the latest value. values: at least two numbers.
export function sparkline(values) {
  const W = 72, H = 28, pad = 5;
  const min = Math.min(...values), max = Math.max(...values);
  const y = v => (max === min ? H / 2 : H - pad - (v - min) / (max - min) * (H - 2 * pad));
  const pts = values.map((v, i) => `${(pad + i * (W - 2 * pad) / (values.length - 1)).toFixed(1)},${y(v).toFixed(1)}`);
  const [cx, cy] = pts.at(-1).split(',');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline class="line" points="${pts.join(' ')}"/><circle class="dot" cx="${cx}" cy="${cy}" r="4"/></svg>`;
}

// Line over time on round horizontal ticks, with the latest value written at the end of the line.
// points: [{ date, value }], oldest first, at least two.
export function lineChart(points, title) {
  const H = 170, left = 34, right = CHART_W - 44, top = 14, base = 140;
  const values = points.map(p => p.value);
  const min = Math.min(...values), max = Math.max(...values);
  const step = [1, 2.5, 5, 10, 25, 50].find(s => (max - min) / s <= 3) || 100;
  const lo = Math.floor(min / step) * step;
  const hi = Math.max(lo + step, Math.ceil(max / step) * step);
  const t0 = new Date(points[0].date).getTime();
  const span = (new Date(points.at(-1).date) - t0) || 1;
  const x = p => left + (new Date(p.date) - t0) / span * (right - left);
  const y = v => base - (v - lo) / (hi - lo) * (base - top);
  const pts = points.map(p => `${x(p).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const last = points.at(-1);
  const ticks = Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, i) => lo + i * step);
  return `
    <svg class="chart" viewBox="0 0 ${CHART_W} ${H}" role="img" aria-label="${esc(title)}: da ${fmtNum(values[0])} a ${fmtNum(last.value)} kg in ${points.length} allenamenti">
      ${ticks.map(v => `<line class="grid" x1="${left}" x2="${CHART_W}" y1="${y(v)}" y2="${y(v)}"/><text x="${left - 6}" y="${y(v) + 4}" text-anchor="end">${fmtNum(v)}</text>`).join('')}
      <polygon class="area" points="${left},${base} ${pts} ${right},${base}"/>
      <polyline class="line" points="${pts}"/>
      <circle class="dot" cx="${x(last).toFixed(1)}" cy="${y(last.value).toFixed(1)}" r="4"/>
      <text class="val" x="${right + 8}" y="${y(last.value) + 4}">${fmtNum(last.value)}</text>
      <text x="${left}" y="${H - 8}">${fmtDay(points[0].date)}</text>
      <text x="${right}" y="${H - 8}" text-anchor="end">${fmtDay(last.date)}</text>
    </svg>`;
}
