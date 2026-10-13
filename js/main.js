// Entry point: wires the core (state, sync) to the UI (router, views) and starts the app.
// Layers:
//   js/core/*  state, domain logic, data access, GitHub sync — no DOM access
//   js/ui/*    rendering and event handling — changes state only through core/store.js actions
import { loadExercises } from './core/exercises.js';
import { subscribe } from './core/store.js';
import { runSync, onSyncEvent } from './core/sync-service.js';
import { toast } from './ui/dom.js';
import { view, initShell } from './ui/shell.js';
import { initTimer } from './ui/timer.js';
import { route, currentRoute } from './ui/router.js';
import { renderSyncStatus } from './ui/views/settings.js';

// Store events: persist errors and sync requests.
subscribe(event => {
  if (event.type === 'error') toast('Errore nel salvataggio: ' + event.error.message);
  if (event.type === 'saved' && event.sync) runSync();
});

// Sync events: user feedback and refresh with pulled data
// (never re-render under the user's fingers during a workout or an import).
onSyncEvent(event => {
  if (event.type === 'done') {
    const { pulled, pushed, deleted } = event.summary;
    if (!event.quiet) toast(`Sincronizzato: ${pulled} ricevuti, ${pushed} inviati, ${deleted} eliminati`);
    if (pulled && !['workout', 'import', 'edit'].includes(currentRoute())) route();
  }
  if (event.type === 'error' && (!event.quiet || event.status === 401)) toast('Sync non riuscito: ' + event.message, 4000);
  renderSyncStatus();
});

// iOS keeps a home-screen PWA suspended in memory, so "reopening" it does not reload the page.
// Check for a new version whenever the app comes back to the foreground and reload once it is installed.
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
    // The first install (no previous controller) needs no reload; any later replacement does.
    let hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) { hadController = true; return; }
      if (reloading) return;
      reloading = true;
      location.reload();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  } catch { /* offline or unsupported */ }
}

async function boot() {
  initShell();
  initTimer();
  view.innerHTML = '<div class="empty">Caricamento…</div>';
  await loadExercises();

  window.addEventListener('hashchange', route);
  route();
  navigator.storage?.persist?.();
  registerServiceWorker();
  runSync();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') runSync(); });
  window.addEventListener('online', () => runSync());
}

boot();
