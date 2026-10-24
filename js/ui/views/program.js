import { $, esc, fmtDate, plural, toast, shareOrDownload, fileSlug, icon } from '../dom.js';
import { view, setChrome, renderNotFound } from '../shell.js';
import { runningCard, programMetaChips, statTiles, blockLabel } from '../components.js';
import { getState, getProgram, setActiveProgram, duplicateProgram, setArchived, deleteProgram } from '../../core/store.js';
import { programStats, estMinutes, lastSessionOfDay, programSessions } from '../../core/queries.js';
import { plannedName } from '../../core/exercises.js';

export function renderProgram(pid) {
  const p = getProgram(pid);
  if (!p) return renderNotFound();
  setChrome(p.name, { back: true, tab: 'home' });
  const st = programStats(p);
  const isActive = p.id === getState().activeProgramId;
  const chips = (isActive ? '<span class="chip accent">Attiva</span>' : '')
    + (p.archived ? '<span class="chip">Archiviata</span>' : '')
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
      ${isActive || p.archived ? '' : `<button class="btn" id="activate">${icon('check')}Imposta come attiva</button>`}
    </div>
    <div class="btn-row">
      <button class="btn secondary" id="duplicate">${icon('copy')}Duplica</button>
      <button class="btn secondary" id="export">${icon('share')}Esporta JSON</button>
    </div>
    <div class="btn-row">
      ${p.archived ? `<button class="btn secondary" id="archive">${icon('refresh')}Ripristina</button>`
      : isActive ? '' : `<button class="btn secondary" id="archive">${icon('archive')}Archivia</button>`}
      <button class="btn danger" id="delete">${icon('trash')}Elimina</button>
    </div>
  `;
  $('#archive')?.addEventListener('click', () => {
    setArchived(p.id, !p.archived);
    toast(p.archived ? 'Scheda archiviata' : 'Scheda ripristinata');
    renderProgram(pid);
  });
  $('#delete').onclick = () => {
    if (!confirm(`Eliminare la scheda "${p.name}"?`)) return;
    const done = programSessions(p.id).length;
    const withSessions = done > 0 && confirm(`Eliminare anche lo storico (${plural(done, 'allenamento', 'allenamenti')}) di questa scheda?\n\nAnnulla per tenerli nello storico.`);
    deleteProgram(p.id, { withSessions });
    toast('Scheda eliminata');
    location.hash = '#/';
  };
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
