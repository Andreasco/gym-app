// Read-only derived data (history, records, program statistics). No DOM access.
import { getState, getProgram } from './store.js';
import { getExercise } from './exercises.js';
import { DEFAULT_REST_SEC } from './config.js';

export const e1rm = st => (Number(st.weight) || 0) * (1 + (Number(st.reps) || 0) / 30); // Epley

const finishedSessions = () => getState().sessions
  .filter(s => s.finishedAt)
  .sort((a, b) => b.startedAt.localeCompare(a.startedAt));

export const historySessions = finishedSessions;

// Most recent completed sets for an exercise, excluding a given session.
export function lastPerformance(exerciseId, excludeSessionId) {
  for (const s of finishedSessions()) {
    if (s.id === excludeSessionId) continue;
    const sets = s.entries.find(e => e.exerciseId === exerciseId)?.sets.filter(x => x.done);
    if (sets?.length) return { date: s.startedAt, sets };
  }
  return null;
}

export function lastNote(exerciseId, excludeSessionId) {
  for (const s of finishedSessions()) {
    if (s.id === excludeSessionId) continue;
    const e = s.entries.find(x => x.exerciseId === exerciseId && x.note);
    if (e) return { date: s.startedAt, note: e.note };
  }
  return null;
}

export function bestSet(exerciseId, excludeSessionId) {
  let best = null;
  for (const s of getState().sessions) {
    if (!s.finishedAt || s.id === excludeSessionId) continue;
    for (const e of s.entries) {
      if (e.exerciseId !== exerciseId) continue;
      for (const st of e.sets) if (st.done !== false && (!best || e1rm(st) > e1rm(best.set))) best = { set: st, date: s.startedAt };
    }
  }
  return best;
}

// Last 10 workouts that include an exercise (sets and note).
export const exerciseHistory = exerciseId => finishedSessions()
  .flatMap(s => s.entries.filter(x => x.exerciseId === exerciseId && (x.sets.length || x.note))
    .map(x => ({ date: s.startedAt, sets: x.sets, note: x.note })))
  .slice(0, 10);

// The planned exercise (sets/reps/rest/notes) behind a session entry; {} for exercises added on the fly.
export function planFor(session, entry) {
  if (entry.planId === null) return {};
  const day = getProgram(session.programId)?.days.find(d => d.id === session.dayId);
  return day?.exercises.find(x => x.exerciseId === (entry.planId || entry.exerciseId)) || {};
}

export const estMinutes = day =>
  Math.round(day.exercises.reduce((t, x) => t + (Number(x.sets) || 0) * ((Number(x.restSec) || DEFAULT_REST_SEC) + 45), 0) / 60);

const programSessions = pid => finishedSessions().filter(s => s.programId === pid);
export const lastSessionOfDay = (pid, did) => programSessions(pid).find(s => s.dayId === did);

export function programStats(p) {
  const done = programSessions(p.id);
  const last = done[0];
  const lastIdx = last ? p.days.findIndex(d => d.id === last.dayId) : -1;
  const muscles = new Set(p.days.flatMap(d => d.exercises.flatMap(x => getExercise(x.exerciseId)?.primaryMuscles || [])));
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

export function sessionSummary(s) {
  return {
    sets: s.entries.reduce((n, e) => n + e.sets.length, 0),
    volume: Math.round(s.entries.reduce((n, e) => n + e.sets.reduce((m, x) => m + (Number(x.weight) || 0) * (Number(x.reps) || 0), 0), 0)),
    minutes: Math.round((new Date(s.finishedAt) - new Date(s.startedAt)) / 60000),
  };
}

// Programs for the home list: active first, then most recently imported.
export const sortedPrograms = () => {
  const { programs, activeProgramId } = getState();
  return [...programs].sort((a, b) =>
    (b.id === activeProgramId) - (a.id === activeProgramId) || b.importedAt.localeCompare(a.importedAt));
};
