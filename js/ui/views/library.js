import { $, esc } from '../dom.js';
import { view, setChrome } from '../shell.js';
import { exerciseListItem, muscleChips, bindMuscleChips, equipmentOptions } from '../components.js';
import { searchExercises } from '../../core/exercises.js';

const filter = { q: '', muscle: '', equipment: '' };
const MAX_RESULTS = 150;

export function renderLibrary() {
  setChrome('Esercizi', { tab: 'library' });
  view.innerHTML = `
    <input id="q" type="search" placeholder="Cerca (es. bench, curl, squat)" aria-label="Cerca esercizio" autocapitalize="off" autocorrect="off" value="${esc(filter.q)}">
    ${muscleChips(filter.muscle)}
    <select id="equipment" aria-label="Attrezzatura"><option value="">Tutta l'attrezzatura</option>${equipmentOptions(filter.equipment)}</select>
    <p class="muted" id="count" style="margin-top:14px"></p>
    <div id="results"></div>
  `;
  const draw = () => {
    const list = searchExercises(filter);
    $('#count').textContent = `${list.length} esercizi`;
    $('#results').innerHTML = list.slice(0, MAX_RESULTS).map(e => exerciseListItem(e)).join('') +
      (list.length > MAX_RESULTS ? '<p class="muted">Restringi la ricerca per vedere altri risultati.</p>' : '');
  };
  $('#q').oninput = e => { filter.q = e.target.value; draw(); };
  bindMuscleChips(view, m => { filter.muscle = m; draw(); });
  $('#equipment').onchange = e => { filter.equipment = e.target.value; draw(); };
  draw();
}
