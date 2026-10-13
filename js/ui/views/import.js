import { $, esc, toast } from '../dom.js';
import { view, setChrome } from '../shell.js';
import { importProgram } from '../../core/store.js';
import { validateProgram } from '../../core/validate.js';

const errorBox = html => `<div class="notes" style="border-color:var(--danger)">${html}</div>`;

export function renderImport() {
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
    catch (e) { $('#result').innerHTML = errorBox(`JSON non valido: ${esc(e.message)}`); return; }
    const { errors, warnings } = validateProgram(p);
    if (errors.length) {
      $('#result').innerHTML = errorBox(`<b>Errori</b><ul class="list-plain">${errors.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`);
      return;
    }
    if (warnings.length && !confirm(`Attenzione:\n${warnings.join('\n')}\n\nImportare comunque?`)) return;
    importProgram(p);
    toast('Scheda importata');
    location.hash = '#/';
  };
}
