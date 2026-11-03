import { $, esc, toast, icon, plural } from '../dom.js';
import { view, setChrome } from '../shell.js';
import { IT, tr } from '../../core/i18n.js';
import { allExercises, exerciseName } from '../../core/exercises.js';
import { getState, getProgram, importProgram } from '../../core/store.js';
import { validateProgram } from '../../core/validate.js';
import { sortedPrograms, programSessions } from '../../core/queries.js';

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
  return `Devi scrivere una scheda di allenamento in palestra per l'app "GymApp" e restituirla in formato JSON.

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
- "notes" di un esercizio: una riga al massimo, compare a ogni allenamento. Il riscaldamento va nelle "notes" del giorno, che compaiono in cima alla pagina del giorno e all'allenamento.
- L'app non ha superserie né prescrizioni diverse per settimana. Una superserie si scrive come due esercizi consecutivi con una nota che lo dice e un recupero breve sul primo (mai 0). La progressione nelle settimane si spiega in "description".
- L'app suggerisce di salire di carico quando tutte le serie arrivano in cima all'intervallo di "reps": usa intervalli come "6-8" dove vuoi questa progressione.
- Per stimare la durata di una seduta conta circa 45 secondi per serie più il recupero.
- Tutti i testi sono in italiano. Non aggiungere campi che non sono nel formato.

ESERCIZI DISPONIBILI (id e attrezzatura, raggruppati per muscolo principale)

${catalog}`;
}

const day = iso => iso.slice(0, 10);
const fmtSets = sets => sets.map(st => (st.weight ? `${st.weight}kg×${st.reps}` : `${st.reps} rip.`)).join(', ');

// What the user did with a program: per exercise, first and last workout and last note,
// plus the exercises swapped or added during the workouts.
function programHistory(p) {
  const sessions = programSessions(p.id).reverse();
  if (!sessions.length) return 'Nessun allenamento registrato con questa scheda.';
  const rows = new Map();
  const changes = new Map();
  const count = key => changes.set(key, (changes.get(key) || 0) + 1);
  for (const s of sessions) {
    for (const e of s.entries) {
      const name = `${e.name || exerciseName(e.exerciseId)} (${e.exerciseId})`;
      if (e.planId === null) count(`Aggiunto ${name}`);
      else if (e.planId && e.planId !== e.exerciseId) count(`Sostituito ${exerciseName(e.planId)} (${e.planId}) con ${name}`);
      if (!e.sets.length && !e.note) continue;
      const r = rows.get(e.exerciseId) || { name, times: 0 };
      if (e.sets.length) {
        r.last = `${day(s.startedAt)}: ${fmtSets(e.sets)}`;
        r.first ||= r.last;
        r.times++;
      }
      if (e.note) r.note = `${day(s.startedAt)}: ${e.note}`;
      rows.set(e.exerciseId, r);
    }
  }
  return [
    `${plural(sessions.length, 'allenamento', 'allenamenti')} dal ${day(sessions[0].startedAt)} al ${day(sessions.at(-1).startedAt)}.`,
    ...[...rows.values()].map(r => [
      `- ${r.name}, ${plural(r.times, 'volta', 'volte')}`,
      r.first && r.first !== r.last ? `  prima: ${r.first}` : '',
      r.last ? `  ultima: ${r.last}` : '',
      r.note ? `  ultima nota: ${r.note}` : '',
    ].filter(Boolean).join('\n')),
    ...[...changes].map(([k, n]) => `- ${k}, ${plural(n, 'volta', 'volte')}`),
  ].join('\n');
}

const APP_FIELDS = new Set(['archived', 'importedAt', 'updatedAt']);

// Same instructions as assistantPrompt, plus the chosen programs and what was done with them.
export function followUpPrompt(programs) {
  const sources = programs.map(p => `### ${p.name}

JSON della scheda:
${JSON.stringify(p, (k, v) => (k.startsWith('_') || APP_FIELDS.has(k) ? undefined : v), 2)}

Storico (serie completate, peso×ripetizioni):
${programHistory(p)}`).join('\n\n');
  const intro = `Ho già seguito ${programs.length > 1 ? 'le schede riportate' : 'la scheda riportata'} più sotto, con lo storico dei miei allenamenti. La nuova scheda deve partire da qui: tieni conto dei carichi raggiunti, delle mie note e degli esercizi che ho cambiato.

PRIMA fammi le domande che ti servono: cosa è cambiato (obiettivo, giorni a settimana, durata di una seduta, dolori o infortuni), cosa mi è piaciuto e cosa no, esercizi che voglio o che non voglio. Non scrivere la scheda finché non ho risposto. Usa un "id" nuovo, diverso da quelli delle schede di partenza.`;
  return assistantPrompt()
    .replace(/^PRIMA .*$/m, () => intro)
    .replace('\nESERCIZI DISPONIBILI', () => `\nSCHEDE DI PARTENZA\n\n${sources}\n\nESERCIZI DISPONIBILI`);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Istruzioni copiate: incollale nel tuo assistente', 4000);
  } catch {
    // Clipboard not available: fall back to the share sheet.
    try { await navigator.share({ text }); }
    catch (e) { if (e.name !== 'AbortError') toast('Copia non riuscita'); }
  }
}

// The assistant's answer may come with text or code fences around the JSON.
const extractJson = text => text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1) || text;

export function renderImport() {
  setChrome('Importa scheda', { back: true, tab: 'home' });
  const { activeProgramId } = getState();
  const programs = sortedPrograms().sort((a, b) => !!a.archived - !!b.archived);
  view.innerHTML = `
    <section class="card">
      <h3>Fatti scrivere la scheda</h3>
      <p class="muted">Copia le istruzioni, incollale in Claude o in un altro assistente e rispondi alle sue domande. Poi copia il JSON che ti restituisce e incollalo qui sotto.</p>
      <button class="btn secondary block" id="copy-prompt" style="margin-top:12px">${icon('copy')}Copia istruzioni per Claude</button>
    </section>
    ${programs.length ? `<section class="card">
      <h3>Parti dalle tue schede</h3>
      <p class="muted">Le istruzioni includono le schede scelte e i tuoi allenamenti, così la nuova scheda tiene conto dei progressi.</p>
      ${programs.map(p => `<label class="check-row"><input type="checkbox" value="${esc(p.id)}" ${p.id === activeProgramId ? 'checked' : ''}>
        <span class="grow ellipsis">${esc(p.name)}</span>${p.archived ? '<span class="muted small">Archiviata</span>' : ''}</label>`).join('')}
      <button class="btn secondary block" id="copy-followup" style="margin-top:12px">${icon('copy')}Copia istruzioni per Claude</button>
    </section>` : ''}
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
  $('#copy-prompt').onclick = () => copyText(assistantPrompt());
  $('#copy-followup')?.addEventListener('click', () => {
    const picked = [...view.querySelectorAll('.check-row input:checked')].map(i => getProgram(i.value));
    if (!picked.length) return toast('Scegli almeno una scheda');
    copyText(followUpPrompt(picked));
  });
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
