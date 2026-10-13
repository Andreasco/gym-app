import { hasExercise } from './exercises.js';

// Returns { errors, warnings } for a program object (schema v1, see README).
export function validateProgram(p) {
  const errors = [];
  const warnings = [];
  if (!p || typeof p !== 'object') return { errors: ['Il JSON non è un oggetto.'], warnings };
  if (!p.name?.trim?.()) errors.push('Manca "name".');
  if (!Array.isArray(p.days) || !p.days.length) errors.push('Manca "days" (lista di giorni).');
  (p.days || []).forEach((d, i) => {
    if (!d.name) errors.push(`Giorno ${i + 1}: manca "name".`);
    if (!Array.isArray(d.exercises) || !d.exercises.length) errors.push(`Giorno ${i + 1}: nessun esercizio.`);
    (d.exercises || []).forEach((x, j) => {
      if (!x.exerciseId) errors.push(`Giorno ${i + 1}, esercizio ${j + 1}: manca "exerciseId".`);
      else if (!hasExercise(x.exerciseId)) warnings.push(`"${x.exerciseId}" non è nel database (verrà mostrato senza immagine).`);
      if (!(x.sets > 0)) errors.push(`Giorno ${i + 1}, ${x.exerciseId || j + 1}: "sets" deve essere > 0.`);
    });
  });
  return { errors, warnings };
}
