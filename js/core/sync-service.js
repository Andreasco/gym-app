// Runs the GitHub sync against the store and reports progress to subscribers (no DOM access).
import { loadConfig, saveConfig, sync, testConnection } from './sync.js';
import { getState, saveState } from './store.js';

export const syncStatus = { running: false, lastError: null, lastSync: null };
const listeners = new Set();
let again = false;

// Events: { type: 'start' } | { type: 'done', summary, quiet } | { type: 'error', message, status, quiet }
export function onSyncEvent(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = e => listeners.forEach(fn => fn(e));

export const isSyncConfigured = () => !!loadConfig();
export const syncTarget = () => {
  const cfg = loadConfig();
  return cfg ? `${cfg.owner}/${cfg.repo}` : null;
};

export async function runSync({ quiet = true } = {}) {
  const cfg = loadConfig();
  if (!cfg || !navigator.onLine) return;
  if (syncStatus.running) { again = true; return; }
  syncStatus.running = true;
  emit({ type: 'start' });
  try {
    const summary = await sync(getState(), cfg);
    saveState();
    syncStatus.lastError = null;
    syncStatus.lastSync = new Date();
    syncStatus.running = false;
    emit({ type: 'done', summary, quiet });
  } catch (e) {
    syncStatus.lastError = e.status === 401 ? 'Token non valido o scaduto' : e.message;
    syncStatus.running = false;
    emit({ type: 'error', message: syncStatus.lastError, status: e.status, quiet });
  } finally {
    syncStatus.running = false;
    if (again) { again = false; runSync(); }
  }
}

// Verifies repository and token, stores the configuration and runs a first sync.
export async function connectSync({ owner, repo, token }) {
  const branch = await testConnection({ owner, repo, token });
  saveConfig({ owner, repo, token, branch });
  await runSync({ quiet: false });
}

export const disconnectSync = () => saveConfig(null);
