// Application state and every mutation of it. Views never modify state directly:
// they read through the getters/queries and change it through the actions below.
import { STORE_KEY, DEFAULT_REST_SEC } from './config.js';
import { queueDelete } from './sync.js';
import { lastPerformance, bestSet, e1rm, planFor } from './queries.js';
import { exerciseName } from './exercises.js';

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
const listeners = new Set();

export const getState = () => state;
export const getProgram = id => state.programs.find(p => p.id === id);
export const getSession = id => state.sessions.find(s => s.id === id);
export const getActiveSession = () => getSession(state.activeSessionId);

// Listeners receive { type: 'saved', sync } after each change, or { type: 'error', error }.
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = event => listeners.forEach(fn => fn(event));

export function saveState() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    emit({ type: 'error', error });
    return false;
  }
}
function commit({ sync = false } = {}) {
  if (saveState()) emit({ type: 'saved', sync });
}
// Ask for a sync without changing anything (e.g. after a text field loses focus).
export const requestSync = () => emit({ type: 'saved', sync: true });

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const now = () => new Date().toISOString();
// Mark a synced item as locally modified so the next sync uploads it.
const markDirty = item => { item._dirty = true; item.updatedAt = now(); };

// Initial sets for an exercise, prefilled with the weights used last time.
function initialSets(exerciseId, count, { excludeSessionId, fallbackWeight = '' } = {}) {
  const last = lastPerformance(exerciseId, excludeSessionId);
  return Array.from({ length: count }, (_, i) => ({
    weight: last?.sets[i]?.weight ?? last?.sets.at(-1)?.weight ?? fallbackWeight,
    reps: '',
    done: false,
  }));
}

// ---------- programs ----------

export function importProgram(p, { activate = true, sync = true } = {}) {
  const copy = structuredClone(p);
  copy.id = copy.id && !getProgram(copy.id) ? copy.id : uid();
  copy.importedAt = now();
  copy.days.forEach((d, i) => { d.id ||= `d${i + 1}`; });
  state.programs.push(copy);
  if (activate) state.activeProgramId = copy.id;
  commit({ sync });
  return copy;
}

export function setActiveProgram(id) {
  state.activeProgramId = id;
  commit();
}

export function duplicateProgram(id) {
  const { _path, _sha, _dirty, ...rest } = structuredClone(getProgram(id));
  const copy = { ...rest, id: uid(), name: `${rest.name} (copia)`, importedAt: now() };
  state.programs.push(copy);
  commit({ sync: true });
  return copy;
}

// Replace a program with an edited copy (keeps sync metadata from the copy).
export function updateProgram(id, data) {
  const i = state.programs.findIndex(x => x.id === id);
  markDirty(data);
  state.programs[i] = data;
  commit({ sync: true });
}

export function deleteProgram(id) {
  const p = getProgram(id);
  state.programs = state.programs.filter(x => x.id !== id);
  queueDelete(state, p);
  if (state.activeProgramId === id) state.activeProgramId = state.programs[0]?.id ?? null;
  commit({ sync: true });
}

export const newDayId = uid;

// ---------- workout sessions ----------

export function startSession(programId, dayId) {
  const p = getProgram(programId);
  const d = p.days.find(x => x.id === dayId);
  if (state.activeSessionId) state.sessions = state.sessions.filter(s => s.id !== state.activeSessionId);
  const s = {
    id: uid(), programId: p.id, programName: p.name, dayId: d.id, dayName: d.name,
    startedAt: now(), finishedAt: null,
    entries: d.exercises.map(x => ({
      exerciseId: x.exerciseId,
      planId: x.exerciseId,
      ...(x.name ? { name: x.name } : {}),
      note: '',
      sets: initialSets(x.exerciseId, x.sets, { fallbackWeight: x.weightKg ?? '' }),
    })),
  };
  state.sessions.push(s);
  state.activeSessionId = s.id;
  commit();
  return s;
}

export function updateSet(sessionId, entryIndex, setIndex, field, value) {
  getSession(sessionId).entries[entryIndex].sets[setIndex][field] = value;
  commit();
}

// Toggles a set as done. Returns the rest time to start, or 0 when the set was unticked.
export function toggleSet(sessionId, entryIndex, setIndex) {
  const s = getSession(sessionId);
  const e = s.entries[entryIndex];
  const st = e.sets[setIndex];
  const plan = planFor(s, e);
  if (!st.done && st.reps === '') st.reps = Number(String(plan.reps ?? '').split('-').pop()) || '';
  st.done = !st.done;
  const next = e.sets[setIndex + 1];
  if (st.done && next && next.weight === '') next.weight = st.weight;
  commit();
  return st.done ? plan.restSec || DEFAULT_REST_SEC : 0;
}

export function addSet(sessionId, entryIndex) {
  const sets = getSession(sessionId).entries[entryIndex].sets;
  sets.push({ weight: sets.at(-1)?.weight ?? '', reps: '', done: false });
  commit();
}

export function setEntryNote(sessionId, entryIndex, note) {
  const s = getSession(sessionId);
  s.entries[entryIndex].note = note;
  if (s.finishedAt) markDirty(s);
  commit();
}

// Replace the exercise of one entry for this session only (the program is unchanged).
export function swapEntryExercise(sessionId, entryIndex, exerciseId) {
  const s = getSession(sessionId);
  const e = s.entries[entryIndex];
  if (exerciseId === e.exerciseId) return;
  e.planId ??= e.exerciseId;
  e.exerciseId = exerciseId;
  delete e.name;
  const done = e.sets.filter(x => x.done);
  e.sets = [...done, ...initialSets(exerciseId, Math.max(1, e.sets.length - done.length), { excludeSessionId: s.id })];
  commit();
}

export function addEntry(sessionId, exerciseId) {
  const s = getSession(sessionId);
  s.entries.push({ exerciseId, planId: null, note: '', sets: initialSets(exerciseId, 3, { excludeSessionId: s.id }) });
  commit();
}

// Finishes the active workout. Returns { doneSets, records } (names of exercises with a new best set).
export function finishSession(sessionId) {
  const s = getSession(sessionId);
  const doneSets = s.entries.reduce((n, e) => n + e.sets.filter(x => x.done).length, 0);
  s.finishedAt = now();
  s.entries.forEach(e => { e.sets = e.sets.filter(x => x.done); });
  const records = s.entries.filter(e => {
    const top = e.sets.reduce((b, x) => (!b || e1rm(x) > e1rm(b) ? x : b), null);
    const prev = bestSet(e.exerciseId, s.id);
    return top && e1rm(top) > 0 && prev && e1rm(top) > e1rm(prev.set);
  }).map(e => e.name || exerciseName(e.exerciseId));
  state.activeSessionId = null;
  commit({ sync: true });
  return { doneSets, records };
}

export const countDoneSets = sessionId =>
  getSession(sessionId).entries.reduce((n, e) => n + e.sets.filter(x => x.done).length, 0);

export function discardSession(sessionId) {
  state.sessions = state.sessions.filter(x => x.id !== sessionId);
  if (state.activeSessionId === sessionId) state.activeSessionId = null;
  commit();
}

export function deleteSession(sessionId) {
  const s = getSession(sessionId);
  state.sessions = state.sessions.filter(x => x.id !== sessionId);
  queueDelete(state, s);
  commit({ sync: true });
}

// ---------- whole-state operations ----------

export const exportState = () => structuredClone(state);

export function restoreState(data) {
  if (!Array.isArray(data.programs) || !Array.isArray(data.sessions)) throw new Error('formato non riconosciuto');
  const { programs, sessions, activeProgramId = null, activeSessionId = null, pendingDeletes = [] } = data;
  state = { programs, sessions, activeProgramId, activeSessionId, pendingDeletes };
  commit();
}

export function resetState() {
  state = defaultState();
  commit();
}

// Number of local changes not yet uploaded by the sync.
export const pendingChanges = () =>
  state.programs.filter(p => !p._path || p._dirty).length +
  state.sessions.filter(s => s.finishedAt && (!s._path || s._dirty)).length +
  (state.pendingDeletes?.length || 0);
