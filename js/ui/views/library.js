import { $, esc } from '../dom.js';
import { view, setChrome } from '../shell.js';
import { exerciseListItem, muscleOptions, equipmentOptions } from '../components.js';
import { searchExercises } from '../../core/exercises.js';

const filter = { q: '', muscle: '', equipment: '' };
const MAX_RESULTS = 150;

export function renderLibrary() {
  setChrome('Esercizi', { tab: 'library' });
  view.innerHTML = `
    <div class="filters">
      <input id="q" type="search" placeholder="Cerca (es. bench, curl, squat)" value="${esc(filter.q)}">
      <select id="muscle"><option value="">Tutti i muscoli</option>${muscleOptions(filter.muscle)}</select>
      <select id="equipment"><option value="">Tutta l'attrezzatura</option>${equipmentOptions(filter.equipment)}</select>
    </div>
    <p class="muted" id="count"></p>
    <div id="results"></div>
  `;
  const draw = () => {
    const list = searchExercises(filter);
    $('#count').textContent = `${list.length} esercizi`;
    $('#results').innerHTML = list.slice(0, MAX_RESULTS).map(e => exerciseListItem(e)).join('') +
      (list.length > MAX_RESULTS ? '<p class="muted">Restringi la ricerca per vedere altri risultati.</p>' : '');
  };
  $('#q').oninput = e => { filter.q = e.target.value; draw(); };
  $('#muscle').onchange = e => { filter.muscle = e.target.value; draw(); };
  $('#equipment').onchange = e => { filter.equipment = e.target.value; draw(); };
  draw();
}
