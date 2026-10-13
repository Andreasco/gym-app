import { esc, fmtDate } from '../dom.js';
import { view, setChrome, renderNotFound } from '../shell.js';
import { tr } from '../../core/i18n.js';
import { getExercise, imageUrl } from '../../core/exercises.js';
import { bestSet, exerciseHistory, e1rm } from '../../core/queries.js';

export function renderExercise(id) {
  const e = getExercise(id);
  if (!e) return renderNotFound();
  setChrome(e.name, { back: true });
  const hist = exerciseHistory(id);
  const best = bestSet(id);
  view.innerHTML = `
    <div class="gallery">${e.images.map((_, i) => `<img class="hero" loading="lazy" src="${imageUrl(e, i)}" alt="">`).join('')}</div>
    <div class="chips">
      ${e.primaryMuscles.map(m => `<span class="chip" style="border-color:var(--accent)">${tr('muscles', m)}</span>`).join('')}
      ${e.secondaryMuscles.map(m => `<span class="chip">${tr('muscles', m)}</span>`).join('')}
    </div>
    <p class="muted" style="margin-top:10px">${tr('equipment', e.equipment)} · ${tr('level', e.level)}${e.mechanic ? ' · ' + esc(e.mechanic) : ''}</p>
    ${best ? `<h2>Record</h2>
      <p>Miglior serie: <b>${esc(best.set.weight)} kg × ${esc(best.set.reps)}</b> <span class="muted">(${fmtDate(best.date)})</span></p>
      <p>1RM stimato: <b>${Math.round(e1rm(best.set) * 2) / 2} kg</b></p>` : ''}
    ${hist.length ? `<h2>Ultime volte</h2>${hist.map(h => `
      <p><span class="muted">${fmtDate(h.date)}</span> · ${h.sets.map(x => `${esc(x.weight)}×${esc(x.reps)}`).join(', ') || '—'}
      ${h.note ? `<br><span class="muted small">📝 ${esc(h.note)}</span>` : ''}</p>`).join('')}` : ''}
    <h2>Esecuzione</h2>
    <ol class="list-plain">${e.instructions.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
    <p class="muted small">ID: <code>${esc(e.id)}</code></p>
  `;
}
