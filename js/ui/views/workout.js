import { $, esc, fmtDate, toast, icon } from '../dom.js';
import { view, setChrome, renderNotFound } from '../shell.js';
import { pickExercise, targetLine, statTiles } from '../components.js';
import { startTimer, stopTimer } from '../timer.js';
import {
  getSession, getProgram, updateSet, toggleSet, addSet, setEntryNote, swapEntryExercise, addEntry,
  finishSession, countDoneSets, discardSession, deleteSession, requestSync,
} from '../../core/store.js';
import { lastPerformance, lastNote, planFor, sessionSummary } from '../../core/queries.js';
import { getExercise, exerciseName, plannedName, imageUrl } from '../../core/exercises.js';

function entryCard(s, e, ei, readOnly) {
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
          <h3>${esc(e.name || exerciseName(e.exerciseId))}</h3>
          ${swapped ? `<p class="muted small">al posto di ${esc(plannedName(x))}</p>` : ''}
          ${targetLine({ ...x, sets: x.sets ?? e.sets.length }, 'Obiettivo ')}
        </div>
        ${icon('chevron-right', 'muted')}
      </a>
      ${x.notes ? `<div class="notes">${esc(x.notes)}</div>` : ''}
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

function header(s, readOnly) {
  const meta = `${esc(s.programName || getProgram(s.programId)?.name || '')} · ${fmtDate(s.startedAt)}`;
  if (readOnly) {
    const { sets, volume, minutes } = sessionSummary(s);
    return `<p class="muted">${meta}</p>${statTiles([[minutes, 'minuti'], [sets, 'serie'], [volume, 'kg totali']])}`;
  }
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
  const rerender = () => renderWorkout(sid);

  view.innerHTML = `
    ${header(s, readOnly)}
    ${s.entries.map((e, ei) => entryCard(s, e, ei, readOnly)).join('')}
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
    const { doneSets, records } = finishSession(sid);
    stopTimer();
    toast(`Allenamento salvato: ${doneSets} serie${records.length ? ` · Nuovo record: ${records.join(', ')}` : ''}`, records.length ? 5000 : 2500);
    location.hash = '#/history';
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
