import { $, esc, fmtDate, fmtNum, fmtCompact, fmtSigned, toast, icon } from '../dom.js';
import { view, setChrome, renderNotFound } from '../shell.js';
import { pickExercise, targetLine, statTiles } from '../components.js';
import { startTimer, stopTimer } from '../timer.js';
import {
  getSession, getProgram, updateSet, toggleSet, addSet, setEntryNote, swapEntryExercise, addEntry,
  finishSession, countDoneSets, discardSession, deleteSession, requestSync,
} from '../../core/store.js';
import { lastPerformance, lastNote, planFor, sessionReport, progressionHint } from '../../core/queries.js';
import { getExercise, exerciseName, plannedName, imageUrl } from '../../core/exercises.js';

const kg = n => `${fmtNum(n)} kg`;
const delta = (n, unit, good = n > 0) => `<span class="delta ${good ? 'up' : ''}">${n ? fmtSigned(n) + unit : 'uguale'}</span>`;

// One line telling whether to add load or repeat it, from the last time the exercise was done.
function hintLine(plan, last) {
  const h = progressionHint(plan, last);
  if (!h) return '';
  const text = h.up
    ? (h.weight ? `Sali a ${kg(h.next)}: l'ultima volta hai chiuso tutte le serie a ${h.top}.` : `Hai chiuso tutte le serie a ${h.top}: aggiungi zavorra.`)
    : (h.weight ? `Ripeti ${kg(h.weight)} e punta a ${h.top} ripetizioni per serie.` : `Punta a ${h.top} ripetizioni per serie.`);
  return `<p class="hint ${h.up ? 'up' : ''}">${icon(h.up ? 'arrow-up' : 'refresh')}<span>${text}</span></p>`;
}

// Top set of an exercise in a finished workout and how it compares with the time before.
function reportLine(r) {
  if (!r) return '';
  const weight = st => Number(st.weight) || 0;
  const reps = st => Number(st.reps) || 0;
  const best = weight(r.best) ? `${kg(weight(r.best))} × ${reps(r.best)}` : `${reps(r.best)} ripetizioni`;
  const p = r.previousBest;
  const dw = p ? weight(r.best) - weight(p) : 0;
  const dr = p ? reps(r.best) - reps(p) : 0;
  const change = !p ? '' : dw ? delta(dw, ' kg') : dr ? delta(dr, ' rip.') : 'come la volta prima';
  return `<p class="hint">${icon('chart')}<span>Serie migliore <b>${best}</b>${change ? ` · ${change}` : ''}</span></p>`;
}

function entryCard(s, e, ei, readOnly, report) {
  const x = planFor(s, e);
  const ex = getExercise(e.exerciseId);
  const last = lastPerformance(e.exerciseId, s.id);
  const prevNote = lastNote(e.exerciseId, s.id);
  const swapped = x.exerciseId && x.exerciseId !== e.exerciseId;
  const dis = readOnly ? 'disabled' : '';
  return `
    <section class="card">
      <a class="row" href="#/exercise/${encodeURIComponent(e.exerciseId)}">
        ${ex ? `<img class="thumb" loading="lazy" src="${imageUrl(ex)}" alt="">` : ''}
        <div class="grow">
          <h3>${esc(e.name || exerciseName(e.exerciseId))} ${report?.record ? '<span class="badge ok">Record</span>' : ''}</h3>
          ${swapped ? `<p class="muted small">al posto di ${esc(plannedName(x))}</p>` : ''}
          ${targetLine({ ...x, sets: x.sets ?? e.sets.length }, 'Obiettivo ')}
        </div>
        ${icon('chevron-right', 'muted')}
      </a>
      ${x.notes ? `<div class="notes">${esc(x.notes)}</div>` : ''}
      ${readOnly ? reportLine(report) : hintLine(x, last)}
      <div class="sets" ${e.sets.length ? '' : 'hidden'}>
        <div class="set-head" aria-hidden="true"><span>#</span><span>Prec.</span><span>kg</span><span>Reps</span><span></span></div>
        ${e.sets.map((st, si) => `
          <div class="set-row ${st.done ? 'done' : ''}">
            <span class="set-n">${si + 1}</span>
            <span class="prev">${last?.sets[si] ? `${esc(last.sets[si].weight)}×${esc(last.sets[si].reps)}` : '—'}</span>
            <input inputmode="decimal" aria-label="Peso serie ${si + 1}" data-e="${ei}" data-s="${si}" data-f="weight" value="${esc(st.weight)}" ${dis}>
            <input inputmode="numeric" aria-label="Ripetizioni serie ${si + 1}" data-e="${ei}" data-s="${si}" data-f="reps" value="${esc(st.reps)}" placeholder="${esc(String(x.reps ?? '').split('-').pop())}" ${dis}>
            <button class="set-check" aria-label="Serie ${si + 1} completata" aria-pressed="${!!st.done}" data-e="${ei}" data-s="${si}" ${dis}>${icon('check')}</button>
          </div>`).join('')}
      </div>
      ${prevNote && !readOnly ? `<p class="muted small" style="margin-top:10px">Nota del ${fmtDate(prevNote.date)}: ${esc(prevNote.note)}</p>` : ''}
      <textarea class="ex-note" data-note="${ei}" rows="2" aria-label="Note" placeholder="Note (es. sedile 4, presa stretta, dolore spalla…)">${esc(e.note || '')}</textarea>
      ${readOnly ? '' : `<div class="btn-row" style="margin-bottom:0">
        <button class="btn secondary small" data-addset="${ei}">${icon('plus')}Serie</button>
        <button class="btn secondary small" data-swap="${ei}">${icon('swap')}Sostituisci</button>
      </div>`}
    </section>`;
}

// Report on top of a finished workout: totals, comparison with the previous time, records.
function summary(s, report, meta) {
  const justFinished = Date.now() - new Date(s.finishedAt) < 2 * 60 * 1000;
  const prev = report.previous;
  const records = report.exercises.filter(x => x.record);
  return `
    <p class="eyebrow">${justFinished ? 'Allenamento completato' : 'Riepilogo'}</p>
    <p class="muted">${meta}</p>
    ${statTiles([[report.minutes, 'minuti'], [report.sets, 'serie'], [report.reps, 'ripetizioni'], [fmtCompact(report.volume), 'kg totali']])}
    ${prev ? `
      <div class="card">
        <p class="muted small">Rispetto a ${fmtDate(prev.date)}</p>
        <div class="chips">
          ${prev.volume ? `<span class="chip">Volume ${delta(Math.round((report.volume - prev.volume) / prev.volume * 100), '%')}</span>` : ''}
          <span class="chip">Ripetizioni ${delta(report.reps - prev.reps, '')}</span>
          <span class="chip">Serie ${delta(report.sets - prev.sets, '')}</span>
          <span class="chip">Durata ${delta(report.minutes - prev.minutes, ' min', false)}</span>
        </div>
      </div>` : ''}
    ${records.length ? `
      <div class="card ok row">
        ${icon('trophy')}
        <div class="grow">
          <h3>${records.length === 1 ? 'Record battuto' : `${records.length} record battuti`}</h3>
          <p class="muted">${records.map(x => esc(x.name)).join(', ')}</p>
        </div>
      </div>` : ''}`;
}

function header(s, report) {
  const meta = `${esc(s.programName || getProgram(s.programId)?.name || '')} · ${fmtDate(s.startedAt)}`;
  if (report) return summary(s, report, meta);
  const total = s.entries.reduce((n, e) => n + e.sets.length, 0);
  const done = countDoneSets(s.id);
  return `
    <div class="workout-progress">
      <p class="muted"><span class="ellipsis">${meta}</span><span><b>${done}</b> / ${total} serie</span></p>
      <div class="progress" role="progressbar" aria-label="Serie completate" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}">
        <span style="transform:scaleX(${total ? done / total : 0})"></span>
      </div>
    </div>`;
}

export function renderWorkout(sid) {
  const s = getSession(sid);
  if (!s) return renderNotFound();
  const readOnly = !!s.finishedAt;
  setChrome(s.dayName, { back: true, tab: readOnly ? 'history' : 'home' });
  const report = readOnly ? sessionReport(s) : null;
  const rerender = () => renderWorkout(sid);

  view.innerHTML = `
    ${header(s, report)}
    ${s.entries.map((e, ei) => entryCard(s, e, ei, readOnly, report?.exercises.find(x => x.exerciseId === e.exerciseId))).join('')}
    ${readOnly ? `
      <div class="btn-row"><button class="btn danger block" id="delete">${icon('trash')}Elimina allenamento</button></div>
    ` : `
      <div class="btn-row"><button class="btn secondary block" id="add-ex">${icon('plus')}Aggiungi esercizio</button></div>
      <div class="btn-row">
        <button class="btn danger" id="discard">Scarta</button>
        <button class="btn ok" id="finish">${icon('check')}Termina</button>
      </div>`}
  `;

  view.querySelectorAll('input[data-f]').forEach(inp => inp.oninput = () => {
    const v = inp.value.replace(',', '.');
    updateSet(sid, Number(inp.dataset.e), Number(inp.dataset.s), inp.dataset.f, v === '' ? '' : Number(v));
  });
  view.querySelectorAll('.set-check').forEach(btn => btn.onclick = () => {
    const rest = toggleSet(sid, Number(btn.dataset.e), Number(btn.dataset.s));
    if (rest) startTimer(rest);
    rerender();
  });
  view.querySelectorAll('[data-note]').forEach(t => {
    t.oninput = () => setEntryNote(sid, Number(t.dataset.note), t.value);
    t.onchange = () => { if (s.finishedAt) requestSync(); };
  });
  view.querySelectorAll('[data-swap]').forEach(btn => btn.onclick = async () => {
    const id = await pickExercise('Sostituisci esercizio');
    if (!id) return;
    swapEntryExercise(sid, Number(btn.dataset.swap), id);
    rerender();
  });
  $('#add-ex')?.addEventListener('click', async () => {
    const id = await pickExercise('Aggiungi esercizio');
    if (!id) return;
    addEntry(sid, id);
    rerender();
  });
  view.querySelectorAll('[data-addset]').forEach(btn => btn.onclick = () => {
    addSet(sid, Number(btn.dataset.addset));
    rerender();
  });
  $('#finish')?.addEventListener('click', () => {
    if (!countDoneSets(sid) && !confirm('Nessuna serie completata. Terminare comunque?')) return;
    finishSession(sid);
    stopTimer();
    toast('Allenamento salvato');
    // Same route: show the report in place instead of navigating.
    rerender();
    view.scrollTop = 0;
  });
  $('#discard')?.addEventListener('click', () => {
    if (!confirm('Scartare questo allenamento?')) return;
    discardSession(sid);
    stopTimer();
    location.hash = '#/';
  });
  $('#delete')?.addEventListener('click', () => {
    if (!confirm('Eliminare definitivamente questo allenamento dallo storico?')) return;
    deleteSession(sid);
    location.hash = '#/history';
  });
}
