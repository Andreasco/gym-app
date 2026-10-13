import { $, esc, toast, icon } from '../dom.js';
import { view, setChrome } from '../shell.js';
import { IT, tr } from '../../core/i18n.js';
import { allExercises } from '../../core/exercises.js';
import { importProgram } from '../../core/store.js';
import { validateProgram } from '../../core/validate.js';

const errorBox = html => `<div class="notes error" role="alert">${html}</div>`;

const EXAMPLE = `{
  "schemaVersion": 1,
  "id": "full-body-blocco-1",
  "name": "Full Body – Blocco 1",
  "description": "Come usare la scheda e come progredire nelle settimane.",
  "goal": "Ipertrofia",
  "level": "intermediate",
  "weeks": 4,
  "days": [
    {
      "id": "giorno-a",
      "name": "Giorno A",
      "notes": "Riscaldamento e indicazioni per la seduta.",
      "exercises": [
        { "exerciseId": "Barbell_Bench_Press_-_Medium_Grip", "name": "Panca piana bilanciere",
          "sets": 4, "reps": "6-8", "restSec": 150, "rpe": 8, "notes": "Una riga al massimo." }
      ]
    }
  ]
}`;

// Text to paste into an AI assistant so that it interviews the user and answers with a
// program the app can import. Built from the catalog, so the exercise ids are always valid.
export function assistantPrompt() {
  const catalog = Object.keys(IT.muscles).map(muscle => {
    const ids = allExercises().filter(e => e.primaryMuscles[0] === muscle).map(e => `${e.id} (${tr('equipment', e.equipment)})`);
    return ids.length ? `${tr('muscles', muscle)}:\n${ids.join('\n')}` : '';
  }).filter(Boolean).join('\n\n');
  return `Devi scrivere una scheda di allenamento in palestra per l'app "Gym" e restituirla in formato JSON.

PRIMA fammi le domande che ti servono: obiettivo, giorni a settimana, durata di una seduta, esperienza, attrezzatura disponibile, infortuni o dolori, esercizi che voglio o che non voglio. Non scrivere la scheda finché non ho risposto.

POI rispondi con un breve riepilogo della scheda e con un solo blocco di codice che contiene il JSON completo, pronto da copiare. Se ti chiedo modifiche, riscrivi sempre il JSON intero.

FORMATO

${EXAMPLE}

REGOLE

- "exerciseId" va copiato esattamente dall'elenco in fondo: non inventare id, non tradurli e non modificarli.
- "name" di ogni esercizio è il nome in italiano che vedrò nell'app.
- "sets" è un numero maggiore di 0. "reps" è una stringa: "8", "6-8", oppure una durata come "45s".
- "restSec" è il recupero in secondi. "rpe" (da 1 a 10) e "weightKg" (carico di partenza) sono facoltativi.
- "level" è beginner, intermediate oppure expert. "weeks" è la durata del blocco in settimane.
- Ogni giorno ha un "id" corto e stabile e almeno un esercizio. Non usare lo stesso "exerciseId" due volte nello stesso giorno.
- "notes" di un esercizio: una riga al massimo, compare a ogni allenamento. Il riscaldamento va nelle "notes" del giorno.
- L'app non ha superserie né prescrizioni diverse per settimana. Una superserie si scrive come due esercizi consecutivi con una nota che lo dice e un recupero breve sul primo (mai 0). La progressione nelle settimane si spiega in "description".
- L'app suggerisce di salire di carico quando tutte le serie arrivano in cima all'intervallo di "reps": usa intervalli come "6-8" dove vuoi questa progressione.
- Per stimare la durata di una seduta conta circa 45 secondi per serie più il recupero.
- Tutti i testi sono in italiano.

ESERCIZI DISPONIBILI (id e attrezzatura, raggruppati per muscolo principale)

${catalog}`;
}

// The assistant's answer may come with text or code fences around the JSON.
const extractJson = text => text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1) || text;

export function renderImport() {
  setChrome('Importa scheda', { back: true, tab: 'home' });
  view.innerHTML = `
    <section class="card">
      <h3>Fatti scrivere la scheda</h3>
      <p class="muted">Copia le istruzioni, incollale in Claude o in un altro assistente e rispondi alle sue domande. Poi copia il JSON che ti restituisce e incollalo qui sotto.</p>
      <button class="btn secondary block" id="copy-prompt" style="margin-top:12px">${icon('copy')}Copia istruzioni per Claude</button>
    </section>
    <label class="field"><span>JSON della scheda</span>
      <textarea id="json" placeholder='{ "name": "...", "days": [ ... ] }' autocapitalize="off" autocorrect="off" spellcheck="false"></textarea>
    </label>
    <div class="btn-row">
      <button class="btn secondary" id="paste">${icon('copy')}Incolla</button>
      <label class="btn secondary">File…<input id="file" type="file" accept="application/json,.json" hidden></label>
    </div>
    <div id="result"></div>
    <div class="btn-row"><button class="btn block" id="go">Importa e attiva</button></div>
  `;
  $('#copy-prompt').onclick = async () => {
    const text = assistantPrompt();
    try {
      await navigator.clipboard.writeText(text);
      toast('Istruzioni copiate: incollale nel tuo assistente', 4000);
    } catch {
      // Clipboard not available: fall back to the share sheet.
      try { await navigator.share({ text }); }
      catch (e) { if (e.name !== 'AbortError') toast('Copia non riuscita'); }
    }
  };
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
    try { p = JSON.parse(extractJson($('#json').value)); }
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
