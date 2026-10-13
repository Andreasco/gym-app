import { $, esc, fmtDate, plural, toast, shareOrDownload, fileSlug, icon } from '../dom.js';
import { view, setChrome, renderNotFound } from '../shell.js';
import { runningCard, programMetaChips, statTiles, blockLabel } from '../components.js';
import { getState, getProgram, setActiveProgram, duplicateProgram } from '../../core/store.js';
import { programStats, estMinutes, lastSessionOfDay } from '../../core/queries.js';
import { plannedName } from '../../core/exercises.js';

export function renderProgram(pid) {
  const p = getProgram(pid);
  if (!p) return renderNotFound();
  setChrome(p.name, { back: true, tab: 'home' });
  const st = programStats(p);
  const isActive = p.id === getState().activeProgramId;
  const chips = (isActive ? '<span class="chip accent">Attiva</span>' : '')
    + (st.sessions ? `<span class="chip accent">${blockLabel(p, st)}</span>` : '')
    + programMetaChips(p);
  view.innerHTML = `
    ${runningCard()}
    ${p.description ? `<p class="muted">${esc(p.description)}</p>` : ''}
    ${chips ? `<div class="chips">${chips}</div>` : ''}
    ${statTiles([[st.days, 'giorni'], [st.weeklySets, 'serie/sett.'], [st.muscles, 'muscoli'], [st.sessions, 'allenamenti']])}
    <h2>Giorni</h2>
    ${p.days.map((d, i) => {
      const last = lastSessionOfDay(p.id, d.id);
      const isNext = st.sessions && st.next.id === d.id;
      return `
      <a class="card ${isNext ? 'ok' : ''}" href="#/program/${encodeURIComponent(p.id)}/${encodeURIComponent(d.id)}">
        <div class="row"><div class="grow">
          <h3>${i + 1}. ${esc(d.name)} ${isNext ? '<span class="badge ok">Prossimo</span>' : ''}</h3>
          <p class="muted small">${plural(d.exercises.length, 'esercizio', 'esercizi')} · ~${estMinutes(d)} min${last ? ` · ultimo ${fmtDate(last.startedAt)}` : ''}</p>
          <p class="muted ellipsis small">${d.exercises.map(x => esc(plannedName(x))).join(' · ')}</p>
        </div>${icon('chevron-right', 'muted')}</div>
      </a>`;
    }).join('')}
    <div class="btn-row"><a class="btn secondary block" href="#/edit/${encodeURIComponent(p.id)}/new">${icon('plus')}Aggiungi giorno</a></div>
    <h2>Scheda</h2>
    <div class="btn-row">
      <a class="btn secondary" href="#/edit/${encodeURIComponent(p.id)}">${icon('pencil')}Modifica scheda</a>
      ${isActive ? '' : `<button class="btn" id="activate">${icon('check')}Imposta come attiva</button>`}
    </div>
    <div class="btn-row">
      <button class="btn secondary" id="duplicate">${icon('copy')}Duplica</button>
      <button class="btn secondary" id="export">${icon('share')}Esporta JSON</button>
    </div>
  `;
  $('#duplicate').onclick = () => {
    const copy = duplicateProgram(p.id);
    toast('Scheda duplicata');
    location.hash = `#/program/${encodeURIComponent(copy.id)}`;
  };
  $('#activate')?.addEventListener('click', () => {
    setActiveProgram(p.id);
    toast('Scheda attiva');
    renderProgram(pid);
  });
  $('#export').onclick = () => shareOrDownload(`${fileSlug(p.name)}.json`, p);
}
