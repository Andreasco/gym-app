import { $, esc, toast, icon } from '../dom.js';
import { view, setChrome, renderNotFound } from '../shell.js';
import { pickExercise } from '../components.js';
import { IT } from '../../core/i18n.js';
import { getProgram, updateProgram, newDayId } from '../../core/store.js';
import { validateProgram } from '../../core/validate.js';
import { getExercise, exerciseName, imageUrl } from '../../core/exercises.js';

// The editor works on a draft copy; the program changes only on "Salva".
let draft = null;

const move = (arr, i, delta) => arr.splice(i + delta, 0, arr.splice(i, 1)[0]);

function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => o[k], obj);
  if (value === '' || value === null) delete target[last]; else target[last] = value;
}

const numField = (path, val, lbl, mode = 'numeric') =>
  `<label class="field"><span>${lbl}</span><input inputmode="${mode}" data-bind="${path}" data-num value="${esc(val ?? '')}"></label>`;

function exerciseEditor(x, di, xi, count) {
  const ex = getExercise(x.exerciseId);
  const base = `days.${di}.exercises.${xi}`;
  return `
    <div class="ex-edit">
      <div class="row">
        ${ex ? `<img class="thumb small" src="${imageUrl(ex)}" alt="">` : ''}
        <div class="grow">
          <input data-bind="${base}.name" aria-label="Nome esercizio" value="${esc(x.name || '')}" placeholder="${esc(exerciseName(x.exerciseId))}">
          <p class="muted small ellipsis">${esc(exerciseName(x.exerciseId))}</p>
        </div>
      </div>
      <div class="grid5">
        ${numField(`${base}.sets`, x.sets, 'Serie')}
        <label class="field"><span>Reps</span><input data-bind="${base}.reps" value="${esc(x.reps ?? '')}"></label>
        ${numField(`${base}.restSec`, x.restSec, 'Rec. s')}
        ${numField(`${base}.rpe`, x.rpe, 'RPE', 'decimal')}
        ${numField(`${base}.weightKg`, x.weightKg, 'Kg', 'decimal')}
      </div>
      <input data-bind="${base}.notes" aria-label="Note tecniche" value="${esc(x.notes || '')}" placeholder="Note tecniche">
      <div class="mini" style="margin-top:8px">
        <button data-act="ex-up" data-d="${di}" data-x="${xi}" aria-label="Sposta su" ${xi ? '' : 'disabled'}>${icon('arrow-up')}</button>
        <button data-act="ex-down" data-d="${di}" data-x="${xi}" aria-label="Sposta giù" ${xi < count - 1 ? '' : 'disabled'}>${icon('arrow-down')}</button>
        <button data-act="ex-swap" data-d="${di}" data-x="${xi}">${icon('swap')}Cambia</button>
        <button data-act="ex-del" data-d="${di}" data-x="${xi}" aria-label="Elimina esercizio" class="danger">${icon('trash')}</button>
      </div>
    </div>`;
}

function dayEditor(d, di, count) {
  return `
    <div class="card day-edit">
      <div class="row">
        <label class="field grow"><span>Giorno ${di + 1}</span><input data-bind="days.${di}.name" value="${esc(d.name)}"></label>
        <div class="mini">
          <button data-act="day-up" data-d="${di}" aria-label="Sposta giorno su" ${di ? '' : 'disabled'}>${icon('arrow-up')}</button>
          <button data-act="day-down" data-d="${di}" aria-label="Sposta giorno giù" ${di < count - 1 ? '' : 'disabled'}>${icon('arrow-down')}</button>
          <button data-act="day-del" data-d="${di}" aria-label="Elimina giorno" class="danger">${icon('trash')}</button>
        </div>
      </div>
      <label class="field"><span>Note del giorno</span><input data-bind="days.${di}.notes" value="${esc(d.notes || '')}"></label>
      ${d.exercises.map((x, xi) => exerciseEditor(x, di, xi, d.exercises.length)).join('')}
      <button class="btn secondary block" data-act="ex-add" data-d="${di}">${icon('plus')}Esercizio</button>
    </div>`;
}

// Structural edits on the draft; return false to skip re-rendering.
async function applyAction(dr, act, di, xi) {
  const day = dr.days[di];
  switch (act) {
    case 'day-up': move(dr.days, di, -1); break;
    case 'day-down': move(dr.days, di, 1); break;
    case 'day-del':
      if (!confirm(`Eliminare il giorno "${day.name}"?`)) return false;
      dr.days.splice(di, 1); break;
    case 'day-add': dr.days.push({ id: newDayId(), name: `Giorno ${dr.days.length + 1}`, exercises: [] }); break;
    case 'ex-up': move(day.exercises, xi, -1); break;
    case 'ex-down': move(day.exercises, xi, 1); break;
    case 'ex-del': day.exercises.splice(xi, 1); break;
    case 'ex-swap': {
      const id = await pickExercise('Cambia esercizio');
      if (!id) return false;
      day.exercises[xi].exerciseId = id;
      delete day.exercises[xi].name;
      break;
    }
    case 'ex-add': {
      const id = await pickExercise('Aggiungi esercizio');
      if (!id) return false;
      day.exercises.push({ exerciseId: id, sets: 3, reps: '8-12', restSec: 90 });
      break;
    }
  }
  return true;
}

export function renderEditor(pid) {
  const p = getProgram(pid);
  if (!p) return renderNotFound();
  if (draft?.pid !== pid) draft = { pid, data: structuredClone(p) };
  const dr = draft.data;
  setChrome('Modifica scheda', { back: true, tab: 'home' });
  view.innerHTML = `
    <label class="field"><span>Nome scheda</span><input data-bind="name" value="${esc(dr.name)}"></label>
    <label class="field"><span>Descrizione</span><textarea class="short" data-bind="description" rows="2">${esc(dr.description || '')}</textarea></label>
    <div class="grid3">
      <label class="field"><span>Obiettivo</span><input data-bind="goal" value="${esc(dr.goal || '')}"></label>
      <label class="field"><span>Livello</span><select data-bind="level"><option value=""></option>${Object.keys(IT.level).map(l => `<option value="${l}" ${dr.level === l ? 'selected' : ''}>${IT.level[l]}</option>`).join('')}</select></label>
      ${numField('weeks', dr.weeks, 'Settimane')}
    </div>
    ${dr.days.map((d, di) => dayEditor(d, di, dr.days.length)).join('')}
    <div class="btn-row"><button class="btn secondary block" data-act="day-add">${icon('plus')}Giorno</button></div>
    <div class="action-bar">
      <button class="btn secondary" id="cancel">Annulla</button>
      <button class="btn" id="save">${icon('check')}Salva</button>
    </div>
  `;
  view.querySelectorAll('[data-bind]').forEach(inp => {
    inp.oninput = inp.onchange = () => {
      const raw = inp.value.trim();
      setPath(dr, inp.dataset.bind, 'num' in inp.dataset ? (raw === '' ? '' : Number(raw.replace(',', '.'))) : inp.value);
    };
  });
  view.querySelectorAll('[data-act]').forEach(btn => btn.onclick = async () => {
    if (!await applyAction(dr, btn.dataset.act, Number(btn.dataset.d), Number(btn.dataset.x))) return;
    const y = view.scrollTop;
    renderEditor(pid);
    view.scrollTop = y;
  });
  $('#cancel').onclick = () => { draft = null; history.back(); };
  $('#save').onclick = () => {
    const { errors } = validateProgram(dr);
    if (errors.length) return toast(errors[0], 4000);
    updateProgram(pid, dr);
    draft = null;
    toast('Scheda salvata');
    location.replace(`#/program/${encodeURIComponent(pid)}`);
  };
}
