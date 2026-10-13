import { $, esc, fmtDate, fmtTime, toast } from '../dom.js';
import { view, setChrome, renderNotFound } from '../shell.js';
import { pickExercise } from '../components.js';
import { startTimer, stopTimer } from '../timer.js';
import {
  getSession, getProgram, updateSet, toggleSet, addSet, setEntryNote, swapEntryExercise, addEntry,
  finishSession, countDoneSets, discardSession, deleteSession, requestSync,
} from '../../core/store.js';
import { lastPerformance, lastNote, planFor } from '../../core/queries.js';
import { getExercise, exerciseName, plannedName, imageUrl } from '../../core/exercises.js';

function entryCard(s, e, ei, readOnly) {
  const x = planFor(s, e);
  const ex = getExercise(e.exerciseId);
  const last = lastPerformance(e.exerciseId, s.id);
  const prevNote = lastNote(e.exerciseId, s.id);
  const swapped = x.exerciseId && x.exerciseId !== e.exerciseId;
  const dis = readOnly ? 'disabled' : '';
  return `
    <div class="card">
      <a class="row" href="#/exercise/${encodeURIComponent(e.exerciseId)}" style="color:inherit">
        ${ex ? `<img class="thumb" loading="lazy" src="${imageUrl(ex)}" alt="">` : ''}
        <div class="grow">
          <h3>${esc(e.name || exerciseName(e.exerciseId))}</h3>
          ${swapped ? `<p class="muted small">al posto di ${esc(plannedName(x))}</p>` : ''}
          <div class="target">
            <span>Obiettivo <b>${esc(x.sets ?? e.sets.length)} × ${esc(x.reps ?? '—')}</b></span>
            ${x.restSec ? `<span>⏱ ${fmtTime(x.restSec)}</span>` : ''}
            ${x.rpe ? `<span>RPE ${esc(x.rpe)}</span>` : ''}
          </div>
        </div>
      </a>
      ${x.notes ? `<div class="notes">${esc(x.notes)}</div>` : ''}
      <table class="sets">
        <thead><tr><th>#</th><th>Prec.</th><th>kg</th><th>Reps</th><th></th></tr></thead>
        <tbody>
          ${e.sets.map((st, si) => `
            <tr class="${st.done ? 'done' : ''}">
              <td>${si + 1}</td>
              <td class="prev">${last?.sets[si] ? `${esc(last.sets[si].weight)}×${esc(last.sets[si].reps)}` : '—'}</td>
              <td><input inputmode="decimal" data-e="${ei}" data-s="${si}" data-f="weight" value="${esc(st.weight)}" ${dis}></td>
              <td><input inputmode="numeric" data-e="${ei}" data-s="${si}" data-f="reps" value="${esc(st.reps)}" placeholder="${esc(String(x.reps ?? '').split('-').pop())}" ${dis}></td>
              <td><button class="set-check ${st.done ? 'done' : ''}" data-e="${ei}" data-s="${si}" ${dis}>✓</button></td>
            </tr>`).join('')}
        </tbody>
      </table>
      ${prevNote && !readOnly ? `<p class="muted small" style="margin-top:8px">📝 ${fmtDate(prevNote.date)}: ${esc(prevNote.note)}</p>` : ''}
      <textarea class="ex-note" data-note="${ei}" rows="2" placeholder="Note (es. sedile 4, presa stretta, dolore spalla…)">${esc(e.note || '')}</textarea>
      ${readOnly ? '' : `<div class="btn-row" style="margin:6px 0 0">
        <button class="btn secondary" data-addset="${ei}">+ Serie</button>
        <button class="btn secondary" data-swap="${ei}">⇄ Sostituisci</button>
      </div>`}
    </div>`;
}

export function renderWorkout(sid) {
  const s = getSession(sid);
  if (!s) return renderNotFound();
  const readOnly = !!s.finishedAt;
  setChrome(s.dayName, { back: true, tab: readOnly ? 'history' : 'home' });
  const rerender = () => renderWorkout(sid);

  view.innerHTML = `
    <p class="muted">${esc(s.programName || getProgram(s.programId)?.name || '')} · ${fmtDate(s.startedAt)}</p>
    ${s.entries.map((e, ei) => entryCard(s, e, ei, readOnly)).join('')}
    ${readOnly ? '' : '<div class="btn-row"><button class="btn secondary block" id="add-ex">+ Aggiungi esercizio</button></div>'}
    ${readOnly ? `
      <div class="btn-row"><button class="btn danger block" id="delete">Elimina allenamento</button></div>
    ` : `
      <div class="btn-row">
        <button class="btn danger" id="discard">Scarta</button>
        <button class="btn ok" id="finish">Termina</button>
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
    toast(`Allenamento salvato: ${doneSets} serie${records.length ? ` · 🏆 record: ${records.join(', ')}` : ''}`, records.length ? 5000 : 2500);
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
