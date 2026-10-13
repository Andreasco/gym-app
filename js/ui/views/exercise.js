import { esc, fmtDate } from '../dom.js';
import { view, setChrome, renderNotFound } from '../shell.js';
import { statTiles, lineChart } from '../components.js';
import { tr } from '../../core/i18n.js';
import { getExercise, imageUrl } from '../../core/exercises.js';
import { bestSet, exerciseHistory, e1rm, strengthSeries } from '../../core/queries.js';

export function renderExercise(id) {
  const e = getExercise(id);
  if (!e) return renderNotFound();
  setChrome(e.name, { back: true });
  const hist = exerciseHistory(id);
  const best = bestSet(id);
  const series = strengthSeries(id);
  view.innerHTML = `
    <div class="gallery">${e.images.map((_, i) => `<img class="hero" loading="lazy" src="${imageUrl(e, i)}" alt="">`).join('')}</div>
    <div class="chips">
      ${e.primaryMuscles.map(m => `<span class="chip accent">${tr('muscles', m)}</span>`).join('')}
      ${e.secondaryMuscles.map(m => `<span class="chip">${tr('muscles', m)}</span>`).join('')}
    </div>
    <p class="muted" style="margin-top:10px">${tr('equipment', e.equipment)} · ${tr('level', e.level)}${e.mechanic ? ' · ' + esc(e.mechanic) : ''}</p>
    ${best ? `<h2>Record</h2>
      ${statTiles([[`${best.set.weight} × ${best.set.reps}`, `miglior serie · ${fmtDate(best.date)}`], [`${Math.round(e1rm(best.set) * 2) / 2} kg`, '1RM stimato']])}` : ''}
    ${series.length > 1 ? `<h2>Andamento</h2>
      <p class="muted">Massimale stimato in kg, un punto per allenamento.</p>
      <div class="card">${lineChart(series, 'Massimale stimato')}</div>` : ''}
    ${hist.length ? `<h2>Ultime volte</h2><div class="card">${hist.map(h => `
      <div class="log-row"><span class="muted">${fmtDate(h.date)}</span>
      <div class="num">${h.sets.map(x => `${esc(x.weight)}×${esc(x.reps)}`).join('  ·  ') || '—'}</div>
      ${h.note ? `<div class="muted small">${esc(h.note)}</div>` : ''}</div>`).join('')}</div>` : ''}
    <h2>Esecuzione</h2>
    <ol class="list-plain">${e.instructions.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
    <p class="muted small">ID: <code>${esc(e.id)}</code></p>
  `;
}
