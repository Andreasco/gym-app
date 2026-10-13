// Hash router: #/<view>/<params>. Add new screens here.
import { view, renderNotFound } from './shell.js';
import { renderHome } from './views/home.js';
import { renderProgram } from './views/program.js';
import { renderDay } from './views/day.js';
import { renderWorkout } from './views/workout.js';
import { renderHistory } from './views/history.js';
import { renderLibrary } from './views/library.js';
import { renderExercise } from './views/exercise.js';
import { renderImport } from './views/import.js';
import { renderEditor, renderDayEditor } from './views/editor.js';
import { renderSettings } from './views/settings.js';

const routes = {
  '': renderHome,
  program: (pid, did) => (did ? renderDay(pid, did) : renderProgram(pid)),
  workout: renderWorkout,
  history: renderHistory,
  library: renderLibrary,
  exercise: renderExercise,
  import: renderImport,
  edit: (pid, did) => (did ? renderDayEditor(pid, did) : renderEditor(pid)),
  settings: renderSettings,
};

export const currentRoute = () => location.hash.replace(/^#\/?/, '').split('/')[0];

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

export function route() {
  const [name, ...params] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  view.scrollTop = 0;
  (routes[name] || renderNotFound)(...params);
  if (!reducedMotion.matches) view.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 180, easing: 'ease-out' });
}
