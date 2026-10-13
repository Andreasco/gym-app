import { $, esc, toast, icon, fmtTime, plural } from '../dom.js';
import { view, setChrome, renderNotFound } from '../shell.js';
import { pickExercise } from '../components.js';
import { IT } from '../../core/i18n.js';
import { getProgram, updateProgram, newDayId } from '../../core/store.js';
import { validateProgram } from '../../core/validate.js';
import { getExercise, exerciseName, plannedName, imageUrl } from '../../core/exercises.js';

// Two editors, each with its own draft and its own "Salva":
// the program (details and day order) and a single day (name, notes, exercises).
let programDraft = null;
let dayDraft = null;

const NEW_DAY = 'new';

const move = (arr, i, delta) => arr.splice(i + delta, 0, arr.splice(i, 1)[0]);

function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => o[k], obj);
  if (value === '' || value === null) delete target[last]; else target[last] = value;
}

const numField = (path, val, lbl, mode = 'numeric') =>
  `<label class="field"><span>${lbl}</span><input inputmode="${mode}" data-bind="${path}" data-num value="${esc(val ?? '')}"></label>`;

// Copies every [data-bind] field into the draft as the user types.
function bindFields(draft, onChange) {
  view.querySelectorAll('[data-bind]').forEach(inp => {
    inp.oninput = inp.onchange = () => {
      const raw = inp.value.trim();
      setPath(draft, inp.dataset.bind, 'num' in inp.dataset ? (raw === '' ? '' : Number(raw.replace(',', '.'))) : inp.value);
      onChange?.(inp);
    };
  });
}

function rerenderInPlace(render) {
  const y = view.scrollTop;
  render();
  view.scrollTop = y;
}

// Back to the screen the editor was opened from.
const leave = pid => (history.length > 1 ? history.back() : location.replace(`#/program/${encodeURIComponent(pid)}`));

const actionBar = () => `
  <div class="action-bar">
    <button class="btn secondary" id="cancel">Annulla</button>
    <button class="btn" id="save">${icon('check')}Salva</button>
  </div>`;

// ---------- program: details and day order ----------

function dayRow(d, di, count) {
  return `
    <div class="card row">
      <div class="grow">
        <h3 class="ellipsis">${di + 1}. ${esc(d.name)}</h3>
        <p class="muted small">${plural(d.exercises.length, 'esercizio', 'esercizi')}</p>
      </div>
      <div class="mini">
        <button data-act="day-up" data-d="${di}" aria-label="Sposta giorno su" ${di ? '' : 'disabled'}>${icon('arrow-up')}</button>
        <button data-act="day-down" data-d="${di}" aria-label="Sposta giorno giù" ${di < count - 1 ? '' : 'disabled'}>${icon('arrow-down')}</button>
        <button data-act="day-del" data-d="${di}" aria-label="Elimina giorno" class="danger">${icon('trash')}</button>
      </div>
    </div>`;
}

export function renderEditor(pid) {
  const p = getProgram(pid);
  if (!p) return renderNotFound();
  if (programDraft?.pid !== pid) programDraft = { pid, data: structuredClone(p) };
  const dr = programDraft.data;
  setChrome('Modifica scheda', { back: true, tab: 'home' });
  view.innerHTML = `
    <label class="field"><span>Nome scheda</span><input data-bind="name" value="${esc(dr.name)}"></label>
    <label class="field"><span>Descrizione</span><textarea class="short" data-bind="description" rows="2">${esc(dr.description || '')}</textarea></label>
    <div class="grid3">
      <label class="field"><span>Obiettivo</span><input data-bind="goal" value="${esc(dr.goal || '')}"></label>
      <label class="field"><span>Livello</span><select data-bind="level"><option value=""></option>${Object.keys(IT.level).map(l => `<option value="${l}" ${dr.level === l ? 'selected' : ''}>${IT.level[l]}</option>`).join('')}</select></label>
      ${numField('weeks', dr.weeks, 'Settimane')}
    </div>
    <h2>Giorni</h2>
    <p class="muted">Qui cambi l'ordine o elimini un giorno. Per nome ed esercizi apri il giorno dalla scheda e scegli Modifica.</p>
    ${dr.days.map((d, di) => dayRow(d, di, dr.days.length)).join('')}
    ${actionBar()}
  `;
  bindFields(dr);
  view.querySelectorAll('[data-act]').forEach(btn => btn.onclick = () => {
    const di = Number(btn.dataset.d);
    if (btn.dataset.act === 'day-del') {
      if (!confirm(`Eliminare il giorno "${dr.days[di].name}"?`)) return;
      dr.days.splice(di, 1);
    } else {
      move(dr.days, di, btn.dataset.act === 'day-up' ? -1 : 1);
    }
    rerenderInPlace(() => renderEditor(pid));
  });
  $('#cancel').onclick = () => { programDraft = null; leave(pid); };
  $('#save').onclick = () => {
    // Day contents always come from the stored program: this editor only reorders and removes days.
    const stored = getProgram(pid).days;
    const data = { ...dr, days: dr.days.map(d => stored.find(x => x.id === d.id)).filter(Boolean) };
    const { errors } = validateProgram(data);
    if (errors.length) return toast(errors[0], 4000);
    updateProgram(pid, data);
    programDraft = null;
    toast('Scheda salvata');
    leave(pid);
  };
}

// ---------- single day: name, notes, exercises ----------

const exerciseSummary = x => [
  `${esc(x.sets ?? '—')} × ${esc(x.reps ?? '—')}`,
  x.restSec && fmtTime(x.restSec),
  x.rpe && `RPE ${esc(x.rpe)}`,
  x.weightKg && `${esc(x.weightKg)} kg`,
].filter(Boolean).join(' · ');

function exerciseEditor(x, xi, count, open) {
  const ex = getExercise(x.exerciseId);
  const base = `exercises.${xi}`;
  return `
    <details class="card ex-edit" name="exercise" data-x="${xi}" ${open ? 'open' : ''}>
      <summary>
        ${ex ? `<img class="thumb small" loading="lazy" src="${imageUrl(ex)}" alt="">` : '<div class="thumb small"></div>'}
        <div class="grow">
          <h3 class="ellipsis" data-sum-name>${esc(plannedName(x))}</h3>
          <p class="muted small num" data-sum>${exerciseSummary(x)}</p>
        </div>
        ${icon('chevron-right', 'muted chev')}
      </summary>
      <div class="ex-body">
        <label class="field"><span>Nome personalizzato</span><input data-bind="${base}.name" value="${esc(x.name || '')}" placeholder="${esc(exerciseName(x.exerciseId))}"></label>
        <div class="grid5">
          ${numField(`${base}.sets`, x.sets, 'Serie')}
          <label class="field"><span>Reps</span><input data-bind="${base}.reps" value="${esc(x.reps ?? '')}"></label>
          ${numField(`${base}.restSec`, x.restSec, 'Rec. s')}
          ${numField(`${base}.rpe`, x.rpe, 'RPE', 'decimal')}
          ${numField(`${base}.weightKg`, x.weightKg, 'Kg', 'decimal')}
        </div>
        <label class="field"><span>Note tecniche</span><input data-bind="${base}.notes" value="${esc(x.notes || '')}"></label>
        <div class="mini">
          <button data-act="ex-up" data-x="${xi}" aria-label="Sposta su" ${xi ? '' : 'disabled'}>${icon('arrow-up')}</button>
          <button data-act="ex-down" data-x="${xi}" aria-label="Sposta giù" ${xi < count - 1 ? '' : 'disabled'}>${icon('arrow-down')}</button>
          <button data-act="ex-swap" data-x="${xi}">${icon('swap')}Cambia</button>
          <button data-act="ex-del" data-x="${xi}" aria-label="Elimina esercizio" class="danger">${icon('trash')}</button>
        </div>
      </div>
    </details>`;
}

// Structural edits on the day draft; returns false to skip re-rendering.
// Keeps draft.open on the exercise the user is working on.
async function applyExerciseAction(draft, act, xi) {
  const list = draft.data.exercises;
  switch (act) {
    case 'ex-up': move(list, xi, -1); draft.open = xi - 1; break;
    case 'ex-down': move(list, xi, 1); draft.open = xi + 1; break;
    case 'ex-del': list.splice(xi, 1); draft.open = null; break;
    case 'ex-swap': {
      const id = await pickExercise('Cambia esercizio');
      if (!id) return false;
      list[xi].exerciseId = id;
      delete list[xi].name;
      break;
    }
    case 'ex-add': {
      const id = await pickExercise('Aggiungi esercizio');
      if (!id) return false;
      list.push({ exerciseId: id, sets: 3, reps: '8-12', restSec: 90 });
      draft.open = list.length - 1;
      break;
    }
  }
  return true;
}

// did is a day id, or NEW_DAY for a day that joins the program when saved.
export function renderDayEditor(pid, did) {
  const p = getProgram(pid);
  const stored = p?.days.find(d => d.id === did);
  const isNew = !stored && did === NEW_DAY;
  if (!p || (!stored && !isNew)) return renderNotFound();
  const key = `${pid}/${did}`;
  if (dayDraft?.key !== key) {
    dayDraft = {
      key, open: null,
      data: isNew ? { id: newDayId(), name: `Giorno ${p.days.length + 1}`, exercises: [] } : structuredClone(stored),
    };
  }
  const draft = dayDraft;
  const dr = draft.data;
  setChrome(isNew ? 'Nuovo giorno' : 'Modifica giorno', { back: true, tab: 'home' });
  view.innerHTML = `
    <label class="field"><span>Nome del giorno</span><input data-bind="name" value="${esc(dr.name || '')}"></label>
    <label class="field"><span>Note del giorno</span><input data-bind="notes" value="${esc(dr.notes || '')}"></label>
    <h2>Esercizi</h2>
    ${dr.exercises.map((x, xi) => exerciseEditor(x, xi, dr.exercises.length, draft.open === xi)).join('')
      || '<p class="muted">Nessun esercizio: aggiungine almeno uno per salvare.</p>'}
    <div class="btn-row"><button class="btn secondary block" data-act="ex-add">${icon('plus')}Esercizio</button></div>
    ${actionBar()}
  `;
  bindFields(dr, inp => {
    const row = inp.closest('.ex-edit');
    if (!row) return;
    const x = dr.exercises[Number(row.dataset.x)];
    row.querySelector('[data-sum-name]').textContent = plannedName(x);
    row.querySelector('[data-sum]').innerHTML = exerciseSummary(x);
  });
  view.querySelectorAll('.ex-edit').forEach(row => row.addEventListener('toggle', () => {
    const xi = Number(row.dataset.x);
    if (row.open) draft.open = xi; else if (draft.open === xi) draft.open = null;
  }));
  view.querySelectorAll('[data-act]').forEach(btn => btn.onclick = async () => {
    if (await applyExerciseAction(draft, btn.dataset.act, Number(btn.dataset.x))) rerenderInPlace(() => renderDayEditor(pid, did));
  });
  $('#cancel').onclick = () => { dayDraft = null; leave(pid); };
  $('#save').onclick = () => {
    const data = structuredClone(getProgram(pid));
    const i = data.days.findIndex(d => d.id === dr.id);
    if (i < 0) data.days.push(dr); else data.days[i] = dr;
    const { errors } = validateProgram(data);
    if (errors.length) return toast(errors[0], 4000);
    updateProgram(pid, data);
    // A program draft opened earlier would still list the days as they were.
    dayDraft = programDraft = null;
    toast('Giorno salvato');
    leave(pid);
  };
}
