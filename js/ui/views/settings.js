import { $, esc, fmtClock, toast, shareOrDownload, fileSlug, icon } from '../dom.js';
import { view, setChrome } from '../shell.js';
import { APP_VERSION, SCHEMA_VERSION } from '../../core/config.js';
import { allExercises } from '../../core/exercises.js';
import {
  getState, getProgram, deleteProgram, exportState, restoreState, resetState, pendingChanges,
} from '../../core/store.js';
import { syncStatus, isSyncConfigured, syncTarget, runSync, connectSync, disconnectSync } from '../../core/sync-service.js';

const DEFAULT_DATA_REPO = 'Andreasco/gym-app-data';

// Updates the sync status line if the settings view is on screen.
export function renderSyncStatus() {
  const el = $('#sync-status');
  if (!el) return;
  const pending = pendingChanges();
  el.innerHTML = [
    syncStatus.running ? 'Sincronizzazione in corso…'
      : syncStatus.lastError ? `<span class="danger-text">Errore: ${esc(syncStatus.lastError)}</span>`
      : syncStatus.lastSync ? `Ultimo sync: ${fmtClock(syncStatus.lastSync)}`
      : 'Non ancora sincronizzato in questa sessione',
    pending ? `${pending} modifiche da inviare` : '',
  ].filter(Boolean).join(' · ');
}

function syncSection() {
  return isSyncConfigured() ? `
    <p><span class="badge ok">Collegata</span> <b>${esc(syncTarget())}</b></p>
    <p class="muted">Schede e allenamenti si sincronizzano da soli.</p>
    <p id="sync-status" class="muted small" role="status"></p>
    <div class="btn-row" style="margin-bottom:0">
      <button class="btn" id="sync-now">${icon('refresh')}Sincronizza ora</button>
      <button class="btn danger" id="sync-off">Disconnetti</button>
    </div>
  ` : `
    <p class="muted">Collega una repository GitHub <b>privata</b> per avere backup automatico e schede pubblicate da Claude. Serve un token fine-grained con accesso solo a quella repository (Contents: Read and write).</p>
    <label class="field"><span>Repository</span>
      <input id="gh-repo" placeholder="owner/repo" value="${DEFAULT_DATA_REPO}" autocapitalize="off" autocorrect="off" spellcheck="false"></label>
    <label class="field"><span>Token</span>
      <input id="gh-token" type="password" placeholder="github_pat_…" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
    <div class="btn-row" style="margin-bottom:0"><button class="btn" id="sync-connect">Collega</button></div>
  `;
}

function bindSync() {
  if (isSyncConfigured()) {
    renderSyncStatus();
    $('#sync-now').onclick = () => { $('#sync-status').textContent = 'Sincronizzazione…'; runSync({ quiet: false }); };
    $('#sync-off').onclick = () => {
      if (!confirm('Scollegare GitHub da questo telefono? I dati restano sia qui sia su GitHub.')) return;
      disconnectSync();
      renderSettings();
    };
    return;
  }
  $('#sync-connect').onclick = async () => {
    const [owner, repo] = $('#gh-repo').value.trim().split('/');
    const token = $('#gh-token').value.trim();
    if (!owner || !repo || !token) return toast('Inserisci repository e token');
    const btn = $('#sync-connect');
    btn.disabled = true;
    btn.textContent = 'Verifica…';
    try {
      await connectSync({ owner, repo, token });
      renderSettings();
    } catch (e) {
      toast(e.status === 401 ? 'Token non valido' : e.status === 404 ? 'Repository non trovata o token senza accesso' : e.message, 4000);
      btn.disabled = false;
      btn.textContent = 'Collega';
    }
  };
}

export function renderSettings() {
  setChrome('Dati', { tab: 'settings' });
  const state = getState();
  const done = state.sessions.filter(s => s.finishedAt).length;
  const synced = isSyncConfigured();
  view.innerHTML = `
    <h2>Sincronizzazione GitHub</h2>
    <section class="card">${syncSection()}</section>

    <h2>Backup</h2>
    <section class="card">
      <p><b>${state.programs.length}</b> ${state.programs.length === 1 ? 'scheda' : 'schede'} · <b>${done}</b> ${done === 1 ? 'allenamento' : 'allenamenti'}</p>
      <p class="muted">${synced ? 'Backup manuale opzionale: i dati sono già su GitHub.' : 'I dati sono salvati solo su questo telefono. Esporta un backup ogni tanto.'}</p>
      <div class="btn-row" style="margin-bottom:0">
        <button class="btn secondary" id="export">${icon('share')}Esporta</button>
        <label class="btn secondary">Ripristina…<input id="restore" type="file" accept="application/json,.json" hidden></label>
      </div>
    </section>

    <h2>Schede</h2>
    ${state.programs.map(p => `
      <div class="card row">
        <div class="grow"><h3 class="ellipsis">${esc(p.name)}</h3>
        <p class="muted">${p.id === state.activeProgramId ? 'Attiva · ' : ''}${p.days.length} giorni</p></div>
        <button class="btn secondary small" data-export="${esc(p.id)}" aria-label="Esporta ${esc(p.name)}">${icon('share')}</button>
        <button class="btn danger small" data-del="${esc(p.id)}" aria-label="Elimina ${esc(p.name)}">${icon('trash')}</button>
      </div>`).join('') || '<p class="muted">Nessuna scheda.</p>'}

    <h2>Info</h2>
    <p class="muted small">Versione app: ${APP_VERSION}</p>
    <p class="muted small">Esercizi: <a href="https://github.com/yuhonas/free-exercise-db" target="_blank" rel="noopener">free-exercise-db</a> (public domain), ${allExercises().length} esercizi.</p>
    <details><summary>Cancella tutti i dati</summary>
      <button class="btn danger block" id="wipe">${icon('trash')}Cancella tutto</button>
    </details>
  `;
  bindSync();
  $('#export').onclick = () => shareOrDownload(`gym-backup-${new Date().toISOString().slice(0, 10)}.json`,
    { app: 'gym-app', schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), ...exportState() });
  $('#restore').onchange = async ev => {
    const f = ev.target.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!Array.isArray(data.programs) || !Array.isArray(data.sessions)) throw new Error('formato non riconosciuto');
      if (!confirm('Sostituire tutti i dati attuali con il backup?')) return;
      restoreState(data);
      toast('Backup ripristinato');
      renderSettings();
    } catch (e) { toast('Backup non valido: ' + e.message); }
  };
  view.querySelectorAll('[data-export]').forEach(b => b.onclick = () => {
    const p = getProgram(b.dataset.export);
    shareOrDownload(`${fileSlug(p.name)}.json`, p);
  });
  view.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    const p = getProgram(b.dataset.del);
    if (!confirm(`Eliminare la scheda "${p.name}"? Lo storico degli allenamenti resta.`)) return;
    deleteProgram(p.id);
    renderSettings();
  });
  $('#wipe').onclick = () => {
    if (!confirm(synced
      ? 'Cancellare i dati da questo telefono? Quelli su GitHub restano e verranno riscaricati al prossimo sync.'
      : 'Cancellare TUTTI i dati (schede e storico)?')) return;
    resetState();
    renderSettings();
  };
}
