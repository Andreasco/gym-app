// Exercise catalog (free-exercise-db), loaded once at boot.
import { IMG_BASE } from './config.js';

let list = [];
let byId = new Map();

export async function loadExercises(url = 'data/exercises.json') {
  list = await (await fetch(url)).json();
  byId = new Map(list.map(e => [e.id, e]));
}

export const allExercises = () => list;
export const getExercise = id => byId.get(id);
export const hasExercise = id => byId.has(id);
export const exerciseName = id => byId.get(id)?.name || id;
// Display name of a planned exercise: custom name from the program, else the database name.
export const plannedName = x => x?.name || exerciseName(x?.exerciseId);
export const imageUrl = (ex, i = 0) => (ex?.images?.[i] ? IMG_BASE + ex.images[i] : '');

export function searchExercises({ q = '', muscle = '', equipment = '' } = {}) {
  const term = q.trim().toLowerCase();
  return list.filter(e =>
    (!term || e.name.toLowerCase().includes(term)) &&
    (!muscle || e.primaryMuscles.includes(muscle)) &&
    (!equipment || e.equipment === equipment));
}
