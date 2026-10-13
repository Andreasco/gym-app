// Gym – personal workout PWA. Vanilla JS, no build step.
// Data: free-exercise-db (public domain), programs imported as JSON, state in localStorage.

import { loadConfig, saveConfig, sync, testConnection, queueDelete } from './sync.js';

const IMG_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';
const STORE_KEY = 'gymapp.v1';
const SCHEMA_VERSION = 1;
const APP_VERSION = '2026-10-13.4';

const IT = {
  muscles: {
    abdominals: 'Addominali', abductors: 'Abduttori', adductors: 'Adduttori', biceps: 'Bicipiti',
    calves: 'Polpacci', chest: 'Petto', forearms: 'Avambracci', glutes: 'Glutei',
    hamstrings: 'Femorali', lats: 'Dorsali', 'lower back': 'Lombari', 'middle back': 'Dorso medio',
    neck: 'Collo', quadriceps: 'Quadricipiti', shoulders: 'Spalle', traps: 'Trapezio', triceps: 'Tricipiti',
  },
  equipment: {
    bands: 'Elastici', barbell: 'Bilanciere', 'body only': 'Corpo libero', cable: 'Cavi',
    dumbbell: 'Manubri', 'e-z curl bar': 'Bilanciere EZ', 'exercise ball': 'Fitball',
    'foam roll': 'Foam roller', kettlebells: 'Kettlebell', machine: 'Macchina',
    'medicine ball': 'Palla medica', other: 'Altro',
  },
  level: { beginner: 'Principiante', intermediate: 'Intermedio', expert: 'Avanzato' },
};
const tr = (group, key) => (key && IT[group][key]) || key || '—';

// ---------- state ----------

const defaultState = () => ({ programs: [], sessions: [], activeProgramId: null, activeSessionId: null, pendingDeletes: [] });

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? { ...defaultState(), ...JSON.parse(raw) } : defaultState();
  } catch {
    return defaultState();
  }
}
let state = loadState();
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (e) { toast('Errore nel salvataggio: ' + e.message); }
}

// ---------- GitHub sync ----------

const syncState = { running: false, again: false, lastError: null, lastSync: null };
async function runSync({ quiet = true } = {}) {
  const cfg = loadConfig();
  if (!cfg || !navigator.onLine) return;
  if (syncState.running) { syncState.again = true; return; }
  syncState.running = true;
  try {
    const r = await sync(state, cfg);
    save();
    syncState.lastError = null;
    syncState.lastSync = new Date();
    if (!quiet) toast(`Sincronizzato: ${r.pulled} ricevuti, ${r.pushed} inviati, ${r.deleted} eliminati`);
    // Refresh the view with pulled data, but never under the user's fingers during a workout.
    if (r.pulled && !location.hash.startsWith('#/workout') && !location.hash.startsWith('#/import')) route();
  } catch (e) {
    syncState.lastError = e.status === 401 ? 'Token non valido o scaduto' : e.message;
    if (!quiet || e.status === 401) toast('Sync non riuscito: ' + syncState.lastError, 4000);
  } finally {
    syncState.running = false;
    if (location.hash === '#/settings') renderSyncStatus();
    if (syncState.again) { syncState.again = false; runSync(); }
  }
}

let exercises = [];
let exById = new Map();

async function loadExercises() {
  const res = await fetch('data/exercises.json');
  exercises = await res.json();
  exById = new Map(exercises.map(e => [e.id, e]));
}

// ---------- helpers ----------

const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const img = (ex, i = 0) => ex?.images?.[i] ? IMG_BASE + ex.images[i] : '';
const fmtDate = iso => new Date(iso).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtTime = sec => `${Math.floor(sec / 60)}:${String(Math.max(0, sec) % 60).padStart(2, '0')}`;
const exName = id => exById.get(id)?.name || id;

function toast(msg, ms = 2500) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

function download(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function shareOrDownload(filename, data) {
  const file = new File([JSON.stringify(data, null, 2)], filename, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  download(filename, data);
}

const program = id => state.programs.find(p => p.id === id);
const session = id => state.sessions.find(s => s.id === id);

// Most recent completed sets for an exercise, excluding a given session.
function lastPerformance(exerciseId, excludeSessionId) {
  const done = state.sessions
    .filter(s => s.finishedAt && s.id !== excludeSessionId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  for (const s of done) {
    const entry = s.entries.find(e => e.exerciseId === exerciseId);
    const sets = entry?.sets.filter(x => x.done);
    if (sets?.length) return { date: s.startedAt, sets };
  }
  return null;
}

// ---------- program import / validation ----------

function validateProgram(p) {
  const errors = [];
  const warnings = [];
  if (!p || typeof p !== 'object') return { errors: ['Il JSON non è un oggetto.'], warnings };
  if (!p.name) errors.push('Manca "name".');
  if (!Array.isArray(p.days) || !p.days.length) errors.push('Manca "days" (lista di giorni).');
  (p.days || []).forEach((d, i) => {
    if (!d.name) errors.push(`Giorno ${i + 1}: manca "name".`);
    if (!Array.isArray(d.exercises) || !d.exercises.length) errors.push(`Giorno ${i + 1}: nessun esercizio.`);
    (d.exercises || []).forEach((x, j) => {
      if (!x.exerciseId) errors.push(`Giorno ${i + 1}, esercizio ${j + 1}: manca "exerciseId".`);
      else if (!exById.has(x.exerciseId)) warnings.push(`"${x.exerciseId}" non è nel database (verrà mostrato senza immagine).`);
      if (!(x.sets > 0)) errors.push(`Giorno ${i + 1}, ${x.exerciseId || j + 1}: "sets" deve essere > 0.`);
    });
  });
  return { errors, warnings };
}

function importProgram(p, { activate = true } = {}) {
  const copy = structuredClone(p);
  copy.id = copy.id && !program(copy.id) ? copy.id : uid();
  copy.importedAt = new Date().toISOString();
  copy.days.forEach((d, i) => { d.id = d.id || `d${i + 1}`; });
  state.programs.push(copy);
  if (activate) state.activeProgramId = copy.id;
  save();
  return copy;
}

// ---------- rest timer ----------

const timer = { end: 0, handle: null };
function startTimer(seconds) {
  if (!seconds) return;
  timer.end = Date.now() + seconds * 1000;
  $('#timer').hidden = false;
  clearInterval(timer.handle);
  tickTimer();
  timer.handle = setInterval(tickTimer, 250);
}
function tickTimer() {
  const left = Math.round((timer.end - Date.now()) / 1000);
  $('#timer-value').textContent = left >= 0 ? fmtTime(left) : '+' + fmtTime(-left);
  const over = left < 0;
  if (over && !$('#timer').classList.contains('over')) {
    $('#timer').classList.add('over');
    navigator.vibrate?.([200, 100, 200]);
    beep();
  }
  if (!over) $('#timer').classList.remove('over');
}
function stopTimer() {
  clearInterval(timer.handle);
  $('#timer').hidden = true;
  $('#timer').classList.remove('over');
}
let audioCtx;
function beep() {
  try {
    audioCtx ??= new AudioContext();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = 880;
    g.gain.value = 0.15;
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + 0.35);
  } catch { /* audio not available */ }
}
$('#timer-stop').onclick = stopTimer;
$('#timer-plus').onclick = () => { timer.end += 15000; tickTimer(); };
$('#timer-minus').onclick = () => { timer.end -= 15000; tickTimer(); };

// ---------- views ----------

const view = $('#view');

function setChrome(title, { back = false, tab = null } = {}) {
  $('#title').textContent = title;
  $('#back').hidden = !back;
  document.querySelectorAll('.tabbar a').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
}
$('#back').onclick = () => history.length > 1 ? history.back() : (location.hash = '#/');

function exerciseRow(x, { link = true } = {}) {
  const ex = exById.get(x.exerciseId);
  const inner = `
    <div class="row">
      ${ex ? `<img class="thumb" loading="lazy" src="${img(ex)}" alt="">` : '<div class="thumb"></div>'}
      <div class="grow">
        <h3 class="ellipsis">${esc(exName(x.exerciseId))}</h3>
        <div class="target">
          <span><b>${esc(x.sets)}</b> × <b>${esc(x.reps ?? '—')}</b></span>
          ${x.restSec ? `<span>⏱ ${fmtTime(x.restSec)}</span>` : ''}
          ${x.rpe ? `<span>RPE ${esc(x.rpe)}</span>` : ''}
        </div>
      </div>
    </div>`;
  return link && ex ? `<a class="card" href="#/exercise/${encodeURIComponent(x.exerciseId)}">${inner}</a>` : `<div class="card">${inner}</div>`;
}

// Derived metadata shown on program/day cards.
const estMinutes = d => Math.round(d.exercises.reduce((t, x) => t + (Number(x.sets) || 0) * ((Number(x.restSec) || 90) + 45), 0) / 60);
const programSessions = pid => state.sessions.filter(s => s.programId === pid && s.finishedAt)
  .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
function programStats(p) {
  const done = programSessions(p.id);
  const last = done[0];
  const lastIdx = last ? p.days.findIndex(d => d.id === last.dayId) : -1;
  const muscles = new Set(p.days.flatMap(d => d.exercises.flatMap(x => exById.get(x.exerciseId)?.primaryMuscles || [])));
  return {
    days: p.days.length,
    exercises: p.days.reduce((n, d) => n + d.exercises.length, 0),
    weeklySets: p.days.reduce((n, d) => n + d.exercises.reduce((m, x) => m + (Number(x.sets) || 0), 0), 0),
    sessions: done.length,
    last,
    next: p.days[(lastIdx + 1) % p.days.length],
    muscles: muscles.size,
  };
}
const lastDone = (pid, did) => programSessions(pid).find(s => s.dayId === did);

function runningCard() {
  const running = session(state.activeSessionId);
  return running ? `
    <a class="card" href="#/workout/${running.id}" style="border-color:var(--ok)">
      <div class="row"><div class="grow"><h3>Allenamento in corso</h3>
      <p class="muted">${esc(program(running.programId)?.name || running.programName || '')} · ${esc(running.dayName)}</p></div>
      <span class="badge" style="background:var(--ok)">Riprendi</span></div>
    </a>` : '';
}

function programMeta(p) {
  return [
    p.goal && `🎯 ${esc(p.goal)}`,
    p.level && `📶 ${esc(tr('level', p.level))}`,
    p.weeks && `🗓 ${esc(p.weeks)} sett.`,
  ].filter(Boolean);
}

function renderHome() {
  setChrome('Schede', { tab: 'home' });
  const list = [...state.programs].sort((a, b) =>
    (b.id === state.activeProgramId) - (a.id === state.activeProgramId) || b.importedAt.localeCompare(a.importedAt));

  view.innerHTML = `
    ${runningCard()}
    ${list.length ? list.map(p => {
      const st = programStats(p);
      const meta = programMeta(p);
      return `
      <a class="card" href="#/program/${encodeURIComponent(p.id)}" ${p.id === state.activeProgramId ? 'style="border-color:var(--accent)"' : ''}>
        <div class="row">
          <div class="grow">
            <h3>${esc(p.name)} ${p.id === state.activeProgramId ? '<span class="badge">Attiva</span>' : ''}</h3>
            ${p.description ? `<p class="muted small" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(p.description)}</p>` : ''}
          </div>
          <span class="muted">›</span>
        </div>
        <div class="chips">
          ${meta.map(m => `<span class="chip">${m}</span>`).join('')}
          <span class="chip">${st.days} giorni</span>
          <span class="chip">${st.exercises} esercizi</span>
          <span class="chip">${st.weeklySets} serie/sett.</span>
        </div>
        <p class="muted small" style="margin-top:8px">
          ${st.sessions ? `${st.sessions === 1 ? "1 allenamento" : st.sessions + " allenamenti"} · ultimo ${fmtDate(st.last.startedAt)} · prossimo <b style="color:var(--text)">${esc(st.next.name)}</b>` : 'Mai iniziata'}
          · importata ${fmtDate(p.importedAt)}
        </p>
      </a>`;
    }).join('') : `
      <div class="empty">
        <p style="font-size:40px;margin:0">🏋️</p>
        <p>Nessuna scheda.</p>
        <p class="small">Chiedi a Claude una scheda in JSON e importala.</p>
      </div>`}
    <div class="btn-row"><a class="btn" href="#/import">Importa scheda</a></div>
  `;
}

function renderProgram(pid) {
  const p = program(pid);
  if (!p) return notFound();
  setChrome(p.name, { back: true, tab: 'home' });
  const st = programStats(p);
  const meta = programMeta(p);
  const isActive = p.id === state.activeProgramId;
  view.innerHTML = `
    ${runningCard()}
    ${p.description ? `<p class="muted">${esc(p.description)}</p>` : ''}
    <div class="chips">
      ${meta.map(m => `<span class="chip">${m}</span>`).join('')}
      <span class="chip">${st.days} giorni</span>
      <span class="chip">${st.weeklySets} serie/sett.</span>
      <span class="chip">${st.muscles} gruppi muscolari</span>
      <span class="chip">${st.sessions === 1 ? "1 allenamento" : st.sessions + " allenamenti"}</span>
    </div>
    <h2>Giorni</h2>
    ${p.days.map((d, i) => {
      const last = lastDone(p.id, d.id);
      const isNext = st.sessions && st.next.id === d.id;
      return `
      <a class="card" href="#/program/${encodeURIComponent(p.id)}/${encodeURIComponent(d.id)}" ${isNext ? 'style="border-color:var(--ok)"' : ''}>
        <div class="row"><div class="grow">
          <h3>${i + 1}. ${esc(d.name)} ${isNext ? '<span class="badge" style="background:var(--ok)">Prossimo</span>' : ''}</h3>
          <p class="muted small">${d.exercises.length} esercizi · ~${estMinutes(d)} min${last ? ` · ultimo ${fmtDate(last.startedAt)}` : ''}</p>
          <p class="muted ellipsis small">${d.exercises.map(x => esc(exName(x.exerciseId))).join(' · ')}</p>
        </div><span class="muted">›</span></div>
      </a>`;
    }).join('')}
    <div class="btn-row">
      ${isActive ? '' : '<button class="btn secondary" id="activate">Imposta come attiva</button>'}
      <button class="btn secondary" id="export">Esporta JSON</button>
    </div>
  `;
  $('#activate')?.addEventListener('click', () => {
    state.activeProgramId = p.id;
    save();
    toast('Scheda attiva');
    renderProgram(pid);
  });
  $('#export').onclick = () => shareOrDownload(`${p.name.replace(/\W+/g, '-').toLowerCase()}.json`, p);
}

function renderDay(pid, did) {
  const p = program(pid);
  const d = p?.days.find(x => x.id === did);
  if (!d) return notFound();
  setChrome(d.name, { back: true, tab: 'home' });
  view.innerHTML = `
    <p class="muted"><a href="#/program/${encodeURIComponent(p.id)}">${esc(p.name)}</a> · ${d.exercises.length} esercizi · ~${estMinutes(d)} min</p>
    ${d.notes ? `<div class="notes">${esc(d.notes)}</div>` : ''}
    ${d.exercises.map(x => exerciseRow(x)).join('')}
    <div class="btn-row"><button class="btn ok block" id="start">Inizia allenamento</button></div>
  `;
  $('#start').onclick = () => {
    if (state.activeSessionId && session(state.activeSessionId) && !confirm('C\'è già un allenamento in corso. Lo scarto e ne inizio uno nuovo?')) return;
    if (state.activeSessionId) state.sessions = state.sessions.filter(s => s.id !== state.activeSessionId);
    const s = {
      id: uid(), programId: p.id, programName: p.name, dayId: d.id, dayName: d.name,
      startedAt: new Date().toISOString(), finishedAt: null,
      entries: d.exercises.map(x => {
        const last = lastPerformance(x.exerciseId);
        return {
          exerciseId: x.exerciseId,
          sets: Array.from({ length: x.sets }, (_, i) => ({
            weight: last?.sets[i]?.weight ?? last?.sets.at(-1)?.weight ?? x.weightKg ?? '',
            reps: '', done: false,
          })),
        };
      }),
    };
    state.sessions.push(s);
    state.activeSessionId = s.id;
    save();
    location.hash = `#/workout/${s.id}`;
  };
}

function renderWorkout(sid) {
  const s = session(sid);
  if (!s) return notFound();
  const p = program(s.programId);
  const d = p?.days.find(x => x.id === s.dayId);
  const plan = id => d?.exercises.find(x => x.exerciseId === id) || {};
  const readOnly = !!s.finishedAt;
  setChrome(s.dayName, { back: true, tab: readOnly ? 'history' : 'home' });

  view.innerHTML = `
    <p class="muted">${esc(s.programName || p?.name || '')} · ${fmtDate(s.startedAt)}</p>
    ${s.entries.map((e, ei) => {
      const x = plan(e.exerciseId);
      const ex = exById.get(e.exerciseId);
      const last = lastPerformance(e.exerciseId, s.id);
      return `
      <div class="card">
        <a class="row" href="#/exercise/${encodeURIComponent(e.exerciseId)}" style="color:inherit">
          ${ex ? `<img class="thumb" loading="lazy" src="${img(ex)}" alt="">` : ''}
          <div class="grow">
            <h3>${esc(exName(e.exerciseId))}</h3>
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
                <td><input inputmode="decimal" data-e="${ei}" data-s="${si}" data-f="weight" value="${esc(st.weight)}" ${readOnly ? 'disabled' : ''}></td>
                <td><input inputmode="numeric" data-e="${ei}" data-s="${si}" data-f="reps" value="${esc(st.reps)}" placeholder="${esc(String(x.reps ?? '').split('-').pop())}" ${readOnly ? 'disabled' : ''}></td>
                <td><button class="set-check ${st.done ? 'done' : ''}" data-e="${ei}" data-s="${si}" ${readOnly ? 'disabled' : ''}>✓</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
        ${readOnly ? '' : `<div class="btn-row" style="margin:6px 0 0"><button class="btn secondary" data-addset="${ei}">+ Serie</button></div>`}
      </div>`;
    }).join('')}
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
    s.entries[inp.dataset.e].sets[inp.dataset.s][inp.dataset.f] = v === '' ? '' : Number(v);
    save();
  });
  view.querySelectorAll('.set-check').forEach(btn => btn.onclick = () => {
    const e = s.entries[btn.dataset.e];
    const st = e.sets[btn.dataset.s];
    if (!st.done && st.reps === '') {
      const target = String(plan(e.exerciseId).reps ?? '').split('-').pop();
      st.reps = Number(target) || '';
    }
    st.done = !st.done;
    const next = e.sets[Number(btn.dataset.s) + 1];
    if (st.done && next && next.weight === '') next.weight = st.weight;
    save();
    if (st.done) startTimer(plan(e.exerciseId).restSec);
    renderWorkout(sid);
  });
  view.querySelectorAll('[data-addset]').forEach(btn => btn.onclick = () => {
    const sets = s.entries[btn.dataset.addset].sets;
    sets.push({ weight: sets.at(-1)?.weight ?? '', reps: '', done: false });
    save();
    renderWorkout(sid);
  });
  $('#finish')?.addEventListener('click', () => {
    const done = s.entries.reduce((n, e) => n + e.sets.filter(x => x.done).length, 0);
    if (!done && !confirm('Nessuna serie completata. Terminare comunque?')) return;
    s.finishedAt = new Date().toISOString();
    s.entries.forEach(e => { e.sets = e.sets.filter(x => x.done); });
    state.activeSessionId = null;
    save();
    stopTimer();
    toast(`Allenamento salvato: ${done} serie`);
    location.hash = '#/history';
    runSync();
  });
  $('#discard')?.addEventListener('click', () => {
    if (!confirm('Scartare questo allenamento?')) return;
    state.sessions = state.sessions.filter(x => x.id !== s.id);
    state.activeSessionId = null;
    save();
    stopTimer();
    location.hash = '#/';
  });
  $('#delete')?.addEventListener('click', () => {
    if (!confirm('Eliminare definitivamente questo allenamento dallo storico?')) return;
    state.sessions = state.sessions.filter(x => x.id !== s.id);
    queueDelete(state, s);
    save();
    runSync();
    location.hash = '#/history';
  });
}

function renderHistory() {
  setChrome('Storico', { tab: 'history' });
  const done = state.sessions.filter(s => s.finishedAt).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  if (!done.length) {
    view.innerHTML = '<div class="empty"><p style="font-size:40px;margin:0">📈</p><p>Nessun allenamento completato.</p></div>';
    return;
  }
  view.innerHTML = done.map(s => {
    const sets = s.entries.reduce((n, e) => n + e.sets.length, 0);
    const volume = s.entries.reduce((n, e) => n + e.sets.reduce((m, x) => m + (Number(x.weight) || 0) * (Number(x.reps) || 0), 0), 0);
    const mins = Math.round((new Date(s.finishedAt) - new Date(s.startedAt)) / 60000);
    return `
      <a class="card" href="#/workout/${s.id}">
        <div class="row"><div class="grow">
          <h3>${esc(s.dayName)}</h3>
          <p class="muted">${fmtDate(s.startedAt)} · ${mins} min · ${sets} serie · ${Math.round(volume)} kg</p>
        </div><span class="muted">›</span></div>
      </a>`;
  }).join('');
}

const libFilter = { q: '', muscle: '', equipment: '' };
function renderLibrary() {
  setChrome('Esercizi', { tab: 'library' });
  const muscles = Object.keys(IT.muscles);
  const equip = Object.keys(IT.equipment);
  view.innerHTML = `
    <div class="filters">
      <input id="q" type="search" placeholder="Cerca (es. bench, curl, squat)" value="${esc(libFilter.q)}">
      <select id="muscle"><option value="">Tutti i muscoli</option>${muscles.map(m => `<option value="${m}" ${libFilter.muscle === m ? 'selected' : ''}>${tr('muscles', m)}</option>`).join('')}</select>
      <select id="equipment"><option value="">Tutta l'attrezzatura</option>${equip.map(m => `<option value="${m}" ${libFilter.equipment === m ? 'selected' : ''}>${tr('equipment', m)}</option>`).join('')}</select>
    </div>
    <p class="muted" id="count"></p>
    <div id="results"></div>
  `;
  const draw = () => {
    const q = libFilter.q.trim().toLowerCase();
    const list = exercises.filter(e =>
      (!q || e.name.toLowerCase().includes(q)) &&
      (!libFilter.muscle || e.primaryMuscles.includes(libFilter.muscle)) &&
      (!libFilter.equipment || e.equipment === libFilter.equipment));
    $('#count').textContent = `${list.length} esercizi`;
    $('#results').innerHTML = list.slice(0, 150).map(e => `
      <a class="card" href="#/exercise/${encodeURIComponent(e.id)}">
        <div class="row">
          <img class="thumb" loading="lazy" src="${img(e)}" alt="">
          <div class="grow"><h3 class="ellipsis">${esc(e.name)}</h3>
          <p class="muted ellipsis">${e.primaryMuscles.map(m => tr('muscles', m)).join(', ')} · ${tr('equipment', e.equipment)}</p></div>
        </div>
      </a>`).join('') + (list.length > 150 ? '<p class="muted">Restringi la ricerca per vedere altri risultati.</p>' : '');
  };
  $('#q').oninput = e => { libFilter.q = e.target.value; draw(); };
  $('#muscle').onchange = e => { libFilter.muscle = e.target.value; draw(); };
  $('#equipment').onchange = e => { libFilter.equipment = e.target.value; draw(); };
  draw();
}

function renderExercise(id) {
  const e = exById.get(id);
  if (!e) return notFound();
  setChrome(e.name, { back: true });
  const hist = state.sessions
    .filter(s => s.finishedAt)
    .flatMap(s => s.entries.filter(x => x.exerciseId === id && x.sets.length).map(x => ({ date: s.startedAt, sets: x.sets })))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10);
  view.innerHTML = `
    <div class="gallery">${e.images.map((_, i) => `<img class="hero" loading="lazy" src="${img(e, i)}" alt="">`).join('')}</div>
    <div class="chips">
      ${e.primaryMuscles.map(m => `<span class="chip" style="border-color:var(--accent)">${tr('muscles', m)}</span>`).join('')}
      ${e.secondaryMuscles.map(m => `<span class="chip">${tr('muscles', m)}</span>`).join('')}
    </div>
    <p class="muted" style="margin-top:10px">${tr('equipment', e.equipment)} · ${tr('level', e.level)}${e.mechanic ? ' · ' + esc(e.mechanic) : ''}</p>
    ${hist.length ? `<h2>Ultime volte</h2>${hist.map(h => `
      <p><span class="muted">${fmtDate(h.date)}</span> · ${h.sets.map(x => `${esc(x.weight)}×${esc(x.reps)}`).join(', ')}</p>`).join('')}` : ''}
    <h2>Esecuzione</h2>
    <ol class="list-plain">${e.instructions.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
    <p class="muted small">ID: <code>${esc(e.id)}</code></p>
  `;
}

function renderImport() {
  setChrome('Importa scheda', { back: true, tab: 'home' });
  view.innerHTML = `
    <p class="muted">Incolla qui il JSON della scheda generata da Claude, oppure scegli un file.</p>
    <textarea id="json" placeholder='{ "name": "...", "days": [ ... ] }' autocapitalize="off" autocorrect="off" spellcheck="false"></textarea>
    <div class="btn-row">
      <button class="btn secondary" id="paste">Incolla</button>
      <label class="btn secondary">File…<input id="file" type="file" accept="application/json,.json" hidden></label>
    </div>
    <div id="result"></div>
    <div class="btn-row"><button class="btn block" id="go">Importa e attiva</button></div>
  `;
  $('#paste').onclick = async () => {
    try { $('#json').value = await navigator.clipboard.readText(); }
    catch { toast('Tieni premuto nel riquadro e scegli Incolla'); }
  };
  $('#file').onchange = async ev => {
    const f = ev.target.files[0];
    if (f) $('#json').value = await f.text();
  };
  $('#go').onclick = () => {
    let p;
    try { p = JSON.parse($('#json').value); }
    catch (e) { $('#result').innerHTML = `<div class="notes" style="border-color:var(--danger)">JSON non valido: ${esc(e.message)}</div>`; return; }
    const { errors, warnings } = validateProgram(p);
    if (errors.length) {
      $('#result').innerHTML = `<div class="notes" style="border-color:var(--danger)"><b>Errori</b><ul class="list-plain">${errors.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
      return;
    }
    if (warnings.length && !confirm(`Attenzione:\n${warnings.join('\n')}\n\nImportare comunque?`)) return;
    importProgram(p);
    toast('Scheda importata');
    runSync();
    location.hash = '#/';
  };
}

function renderSettings() {
  setChrome('Dati', { tab: 'settings' });
  const done = state.sessions.filter(s => s.finishedAt).length;
  const cfg = loadConfig();
  view.innerHTML = `
    <h2>Sincronizzazione GitHub</h2>
    ${cfg ? `
      <p class="muted">Repository privata <b style="color:var(--text)">${esc(cfg.owner)}/${esc(cfg.repo)}</b>. Schede e allenamenti si sincronizzano da soli.</p>
      <p id="sync-status" class="muted small"></p>
      <div class="btn-row">
        <button class="btn" id="sync-now">Sincronizza ora</button>
        <button class="btn danger" id="sync-off">Disconnetti</button>
      </div>
    ` : `
      <p class="muted">Collega una repository GitHub <b>privata</b> per avere backup automatico e schede pubblicate da Claude. Serve un token fine-grained con accesso solo a quella repository (Contents: Read and write).</p>
      <div class="filters">
        <input id="gh-repo" placeholder="owner/repo" value="Andreasco/gym-data" autocapitalize="off" autocorrect="off" spellcheck="false">
        <input id="gh-token" type="password" placeholder="Token (github_pat_…)" autocomplete="off" autocapitalize="off" spellcheck="false">
      </div>
      <div class="btn-row"><button class="btn" id="sync-connect">Collega</button></div>
    `}

    <h2>Backup</h2>
    <p class="muted">${cfg ? 'Backup manuale opzionale: i dati sono già su GitHub.' : 'I dati sono salvati solo su questo telefono. Esporta un backup ogni tanto.'}</p>
    <p>${state.programs.length} schede · ${done} allenamenti</p>
    <div class="btn-row">
      <button class="btn" id="export">Esporta backup</button>
      <label class="btn secondary">Ripristina…<input id="restore" type="file" accept="application/json,.json" hidden></label>
    </div>

    <h2>Schede</h2>
    ${state.programs.map(p => `
      <div class="card row">
        <div class="grow"><h3 class="ellipsis">${esc(p.name)}</h3>
        <p class="muted">${p.id === state.activeProgramId ? 'Attiva · ' : ''}${p.days.length} giorni</p></div>
        <button class="btn secondary" data-export="${p.id}">JSON</button>
        <button class="btn danger" data-del="${p.id}">✕</button>
      </div>`).join('') || '<p class="muted">Nessuna scheda.</p>'}

    <h2>Info</h2>
    <p class="muted small">Versione app: ${APP_VERSION}</p>
    <p class="muted small">Esercizi: <a href="https://github.com/yuhonas/free-exercise-db" target="_blank" rel="noopener">free-exercise-db</a> (public domain), ${exercises.length} esercizi.</p>
    <details><summary>Cancella tutti i dati</summary>
      <button class="btn danger block" id="wipe">Cancella tutto</button>
    </details>
  `;
  if (cfg) {
    renderSyncStatus();
    $('#sync-now').onclick = () => { $('#sync-status').textContent = 'Sincronizzazione…'; runSync({ quiet: false }); };
    $('#sync-off').onclick = () => {
      if (!confirm('Scollegare GitHub da questo telefono? I dati restano sia qui sia su GitHub.')) return;
      saveConfig(null);
      renderSettings();
    };
  } else {
    $('#sync-connect').onclick = async () => {
      const [owner, repo] = $('#gh-repo').value.trim().split('/');
      const token = $('#gh-token').value.trim();
      if (!owner || !repo || !token) return toast('Inserisci repository e token');
      const btn = $('#sync-connect');
      btn.disabled = true;
      btn.textContent = 'Verifica…';
      try {
        const branch = await testConnection({ owner, repo, token });
        saveConfig({ owner, repo, token, branch });
        await runSync({ quiet: false });
        renderSettings();
      } catch (e) {
        toast(e.status === 401 ? 'Token non valido' : e.status === 404 ? 'Repository non trovata o token senza accesso' : e.message, 4000);
        btn.disabled = false;
        btn.textContent = 'Collega';
      }
    };
  }
  $('#export').onclick = () => shareOrDownload(`gym-backup-${new Date().toISOString().slice(0, 10)}.json`,
    { app: 'gym-app', schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), ...state });
  $('#restore').onchange = async ev => {
    const f = ev.target.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!Array.isArray(data.programs) || !Array.isArray(data.sessions)) throw new Error('formato non riconosciuto');
      if (!confirm('Sostituire tutti i dati attuali con il backup?')) return;
      const { programs, sessions, activeProgramId = null, activeSessionId = null, pendingDeletes = [] } = data;
      state = { programs, sessions, activeProgramId, activeSessionId, pendingDeletes };
      save();
      toast('Backup ripristinato');
      renderSettings();
    } catch (e) { toast('Backup non valido: ' + e.message); }
  };
  view.querySelectorAll('[data-export]').forEach(b => b.onclick = () => {
    const p = program(b.dataset.export);
    shareOrDownload(`${p.name.replace(/\W+/g, '-').toLowerCase()}.json`, p);
  });
  view.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    const p = program(b.dataset.del);
    if (!confirm(`Eliminare la scheda "${p.name}"? Lo storico degli allenamenti resta.`)) return;
    state.programs = state.programs.filter(x => x.id !== p.id);
    queueDelete(state, p);
    if (state.activeProgramId === p.id) state.activeProgramId = state.programs[0]?.id ?? null;
    save();
    renderSettings();
    runSync();
  });
  $('#wipe').onclick = () => {
    if (!confirm(loadConfig()
      ? 'Cancellare i dati da questo telefono? Quelli su GitHub restano e verranno riscaricati al prossimo sync.'
      : 'Cancellare TUTTI i dati (schede e storico)?')) return;
    state = defaultState();
    save();
    renderSettings();
  };
}

function renderSyncStatus() {
  const el = $('#sync-status');
  if (!el) return;
  const pending = state.programs.filter(p => !p._path).length + state.sessions.filter(s => s.finishedAt && !s._path).length + (state.pendingDeletes?.length || 0);
  el.innerHTML = [
    syncState.running ? 'Sincronizzazione in corso…'
      : syncState.lastError ? `<span style="color:var(--danger)">Errore: ${esc(syncState.lastError)}</span>`
      : syncState.lastSync ? `Ultimo sync: ${syncState.lastSync.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`
      : 'Non ancora sincronizzato in questa sessione',
    pending ? `${pending} modifiche da inviare` : '',
  ].filter(Boolean).join(' · ');
}

function notFound() {
  setChrome('Non trovato', { back: true });
  view.innerHTML = '<div class="empty"><p>Elemento non trovato.</p><a href="#/">Torna alle schede</a></div>';
}

// ---------- router ----------

function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  view.scrollTop = 0;
  switch (parts[0]) {
    case '': return renderHome();
    case 'program': return parts[2] ? renderDay(parts[1], parts[2]) : renderProgram(parts[1]);
    case 'workout': return renderWorkout(parts[1]);
    case 'history': return renderHistory();
    case 'library': return renderLibrary();
    case 'exercise': return renderExercise(parts[1]);
    case 'import': return renderImport();
    case 'settings': return renderSettings();
    default: return notFound();
  }
}

// ---------- boot ----------

async function boot() {
  view.innerHTML = '<div class="empty">Caricamento…</div>';
  await loadExercises();

  // First run: load the bundled starter program so the app is usable immediately.
  if (!state.programs.length && !localStorage.getItem(STORE_KEY + '.seeded')) {
    try {
      const p = await (await fetch('programs/starter.json')).json();
      importProgram(p);
    } catch { /* no starter program */ }
    localStorage.setItem(STORE_KEY + '.seeded', '1');
  }

  window.addEventListener('hashchange', route);
  route();
  navigator.storage?.persist?.();
  registerServiceWorker();
  runSync();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') runSync(); });
  window.addEventListener('online', () => runSync());
}

// iOS keeps a home-screen PWA suspended in memory, so "reopening" it does not reload the page.
// Check for a new version whenever the app comes back to the foreground and reload once it is installed.
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
    // The first install (no previous controller) needs no reload; any later replacement does.
    let hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) { hadController = true; return; }
      if (reloading) return;
      reloading = true;
      location.reload();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  } catch { /* offline or unsupported */ }
}

boot();
