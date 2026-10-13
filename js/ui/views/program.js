import { $, esc, fmtDate, plural, toast, shareOrDownload, fileSlug } from '../dom.js';
import { view, setChrome, renderNotFound } from '../shell.js';
import { runningCard, programMetaChips } from '../components.js';
import { getState, getProgram, setActiveProgram, duplicateProgram } from '../../core/store.js';
import { programStats, estMinutes, lastSessionOfDay } from '../../core/queries.js';
import { plannedName } from '../../core/exercises.js';

export function renderProgram(pid) {
  const p = getProgram(pid);
  if (!p) return renderNotFound();
  setChrome(p.name, { back: true, tab: 'home' });
  const st = programStats(p);
  const isActive = p.id === getState().activeProgramId;
  view.innerHTML = `
    ${runningCard()}
    ${p.description ? `<p class="muted">${esc(p.description)}</p>` : ''}
    <div class="chips">
      ${programMetaChips(p)}
      <span class="chip">${st.days} giorni</span>
      <span class="chip">${st.weeklySets} serie/sett.</span>
      <span class="chip">${st.muscles} gruppi muscolari</span>
      <span class="chip">${plural(st.sessions, 'allenamento', 'allenamenti')}</span>
    </div>
    <h2>Giorni</h2>
    ${p.days.map((d, i) => {
      const last = lastSessionOfDay(p.id, d.id);
      const isNext = st.sessions && st.next.id === d.id;
      return `
      <a class="card" href="#/program/${encodeURIComponent(p.id)}/${encodeURIComponent(d.id)}" ${isNext ? 'style="border-color:var(--ok)"' : ''}>
        <div class="row"><div class="grow">
          <h3>${i + 1}. ${esc(d.name)} ${isNext ? '<span class="badge" style="background:var(--ok)">Prossimo</span>' : ''}</h3>
          <p class="muted small">${d.exercises.length} esercizi · ~${estMinutes(d)} min${last ? ` · ultimo ${fmtDate(last.startedAt)}` : ''}</p>
          <p class="muted ellipsis small">${d.exercises.map(x => esc(plannedName(x))).join(' · ')}</p>
        </div><span class="muted">›</span></div>
      </a>`;
    }).join('')}
    <div class="btn-row">
      <a class="btn" href="#/edit/${encodeURIComponent(p.id)}">Modifica</a>
      ${isActive ? '' : '<button class="btn secondary" id="activate">Imposta come attiva</button>'}
    </div>
    <div class="btn-row">
      <button class="btn secondary" id="duplicate">Duplica</button>
      <button class="btn secondary" id="export">Esporta JSON</button>
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
