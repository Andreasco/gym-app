// Read-only derived data (history, records, program statistics). No DOM access.
import { getState, getProgram } from './store.js';
import { getExercise, exerciseName } from './exercises.js';
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

// What to do today, from the last time the exercise was done (double progression):
// every planned set at the top of the rep range means more load, otherwise the same load again.
// Returns null without history or when reps are not a number or a range (e.g. "45s").
export function progressionHint(plan, last) {
  const range = /^\s*(\d+)(?:\s*-\s*(\d+))?\s*$/.exec(plan.reps ?? '');
  if (!range || !last?.sets.length) return null;
  const top = Number(range[2] ?? range[1]);
  const weight = Math.max(...last.sets.map(st => Number(st.weight) || 0));
  const up = last.sets.length >= (Number(plan.sets) || 1) && last.sets.every(st => Number(st.reps) >= top);
  return { up, top, weight, next: up && weight ? weight + (weight < 20 ? 1 : 2.5) : weight };
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
  // A "week" of the block is one completed round of all the program's days.
  const rounds = p.days.length ? Math.min(...p.days.map(d => done.filter(s => s.dayId === d.id).length)) : 0;
  return {
    days: p.days.length,
    exercises: p.days.reduce((n, d) => n + d.exercises.length, 0),
    weeklySets: p.days.reduce((n, d) => n + d.exercises.reduce((m, x) => m + (Number(x.sets) || 0), 0), 0),
    sessions: done.length,
    last,
    next: p.days[(lastIdx + 1) % p.days.length],
    muscles: muscles.size,
    week: rounds + 1,
    blockDone: Number(p.weeks) > 0 && rounds >= Number(p.weeks),
  };
}

export function sessionSummary(s) {
  return {
    sets: s.entries.reduce((n, e) => n + e.sets.length, 0),
    reps: s.entries.reduce((n, e) => n + e.sets.reduce((m, x) => m + (Number(x.reps) || 0), 0), 0),
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

// ---------- reports and statistics ----------

const topSet = sets => sets.reduce((best, x) => (!best || e1rm(x) > e1rm(best) ? x : best), null);

// Report of a finished workout, judged against the workouts that came before it:
// totals, the previous time the same day was done, and for each exercise the top set,
// the top set of the time before and whether it was a record when it happened.
export function sessionReport(s) {
  const earlier = finishedSessions().filter(x => x.startedAt < s.startedAt);
  const previous = earlier.find(x => x.programId === s.programId && x.dayId === s.dayId);
  const exercises = s.entries.filter(e => e.sets.length).map(e => {
    const past = earlier.flatMap(x => x.entries.filter(y => y.exerciseId === e.exerciseId && y.sets.length));
    const best = topSet(e.sets);
    return {
      exerciseId: e.exerciseId,
      name: e.name || exerciseName(e.exerciseId),
      best,
      previousBest: past.length ? topSet(past[0].sets) : null,
      record: e1rm(best) > 0 && past.length > 0 && e1rm(best) > Math.max(...past.flatMap(y => y.sets.map(e1rm))),
    };
  });
  return {
    ...sessionSummary(s),
    previous: previous ? { date: previous.startedAt, ...sessionSummary(previous) } : null,
    exercises,
  };
}

// Monday 00:00 (local time) of the week a date falls in.
function weekStart(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

// Workouts and lifted volume for each of the last `count` calendar weeks, oldest first.
export function weeklyTotals(count = 8) {
  const first = weekStart(Date.now());
  first.setDate(first.getDate() - 7 * (count - 1));
  const weeks = Array.from({ length: count }, (_, i) => {
    const start = new Date(first);
    start.setDate(start.getDate() + 7 * i);
    return { start, workouts: 0, volume: 0 };
  });
  for (const s of finishedSessions()) {
    const week = weeks[Math.round((weekStart(s.startedAt) - first) / (7 * 864e5))];
    if (!week) continue;
    week.workouts++;
    week.volume += sessionSummary(s).volume;
  }
  return weeks;
}

// Best estimated 1RM per workout for every exercise done with a load, oldest first.
function strengthByExercise() {
  const byId = new Map();
  for (const s of [...finishedSessions()].reverse()) {
    for (const e of s.entries) {
      const value = Math.max(0, ...e.sets.map(e1rm));
      if (!value) continue;
      if (!byId.has(e.exerciseId)) byId.set(e.exerciseId, { exerciseId: e.exerciseId, series: [] });
      const trend = byId.get(e.exerciseId);
      trend.name = e.name || exerciseName(e.exerciseId);
      trend.series.push({ date: s.startedAt, value });
    }
  }
  return byId;
}

export const strengthSeries = exerciseId => strengthByExercise().get(exerciseId)?.series || [];

// Exercises with at least two data points, most trained first.
export const strengthTrends = () => [...strengthByExercise().values()]
  .filter(t => t.series.length >= 2)
  .sort((a, b) => b.series.length - a.series.length);
