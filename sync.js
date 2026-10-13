// Sync programs and finished workouts with a private GitHub repository (Contents/Git Data REST API).
// Layout in the data repo:
//   programs/<id>.json                    one file per program (Claude can add/edit these)
//   sessions/<yyyy>/<yyyy-mm-dd>-<id>.json  one file per finished workout (append-only)
// Local items remember the remote file via _path/_sha; deletions are queued in state.pendingDeletes.

const CFG_KEY = 'gymapp.github';
const API = 'https://api.github.com';

export function loadConfig() {
  try { return JSON.parse(localStorage.getItem(CFG_KEY)) || null; } catch { return null; }
}
export function saveConfig(cfg) {
  if (cfg) localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  else localStorage.removeItem(CFG_KEY);
}

const enc = new TextEncoder();
const dec = new TextDecoder();
const toB64 = str => {
  const bytes = enc.encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const fromB64 = b64 => dec.decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), c => c.charCodeAt(0)));

const slug = s => String(s).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'item';
const programPath = p => `programs/${slug(p.id)}.json`;
const sessionPath = s => `sessions/${s.startedAt.slice(0, 4)}/${s.startedAt.slice(0, 10)}-${slug(s.id)}.json`;
const strip = ({ _path, _sha, ...rest }) => rest;
const serialize = item => JSON.stringify(strip(item), null, 2) + '\n';

export class GitHubError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function client(cfg) {
  const repoUrl = `${API}/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`;
  return async function gh(method, path, body) {
    const res = await fetch(repoUrl + path, {
      method,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new GitHubError(res.status, data.message || res.statusText);
    return data;
  };
}

export async function testConnection(cfg) {
  const gh = client(cfg);
  const repo = await gh('GET', '');
  if (!repo.private) throw new Error('La repository è pubblica: usa una repository privata per i tuoi dati.');
  if (repo.permissions && !repo.permissions.push) throw new Error('Il token non ha il permesso di scrittura (Contents: Read and write).');
  return repo.default_branch;
}

// Two-way sync. `state` is mutated in place; returns a summary of what changed.
export async function sync(state, cfg) {
  const gh = client(cfg);
  const branch = cfg.branch || 'main';
  const summary = { pulled: 0, pushed: 0, deleted: 0 };

  let tree = [];
  try {
    tree = (await gh('GET', `/git/trees/${encodeURIComponent(branch)}?recursive=1`)).tree;
  } catch (e) {
    if (!(e.status === 409 || e.status === 404)) throw e; // empty repository
  }
  const remote = new Map(tree.filter(t => t.type === 'blob' && t.path.endsWith('.json')).map(t => [t.path, t.sha]));
  const readBlob = async sha => JSON.parse(fromB64((await gh('GET', `/git/blobs/${sha}`)).content));
  const put = async (path, item, message) => {
    const res = await gh('PUT', `/contents/${path}`, {
      message, branch, content: toB64(serialize(item)), ...(remote.has(path) ? { sha: remote.get(path) } : {}),
    });
    item._path = path;
    item._sha = res.content.sha;
    remote.set(path, item._sha);
    summary.pushed++;
  };

  // 1. Deletions made on this device.
  for (const d of [...(state.pendingDeletes || [])]) {
    if (remote.has(d.path)) {
      await gh('DELETE', `/contents/${d.path}`, { message: `Delete ${d.path}`, branch, sha: remote.get(d.path) });
      remote.delete(d.path);
      summary.deleted++;
    }
    state.pendingDeletes = state.pendingDeletes.filter(x => x.path !== d.path);
  }

  // 2. Programs and finished sessions share the same reconcile logic.
  const reconcile = async ({ list, prefix, pathOf, label, normalize }) => {
    const known = new Set();
    for (const item of [...list]) {
      if (item._path) {
        known.add(item._path);
        if (!remote.has(item._path)) {
          list.splice(list.indexOf(item), 1); // removed remotely
          summary.pulled++;
        } else if (remote.get(item._path) !== item._sha) {
          const fresh = normalize(await readBlob(remote.get(item._path)), item._path);
          Object.assign(fresh, { _path: item._path, _sha: remote.get(item._path) });
          list.splice(list.indexOf(item), 1, fresh);
          summary.pulled++;
        }
      } else {
        const path = pathOf(item);
        known.add(path);
        await put(path, item, `Add ${label(item)}`);
      }
    }
    for (const [path, sha] of remote) {
      if (!path.startsWith(prefix) || known.has(path)) continue;
      const fresh = normalize(await readBlob(sha), path);
      if (list.some(x => x.id === fresh.id)) continue;
      list.push(Object.assign(fresh, { _path: path, _sha: sha }));
      summary.pulled++;
    }
  };

  await reconcile({
    list: state.programs,
    prefix: 'programs/',
    pathOf: programPath,
    label: p => `program "${p.name}"`,
    normalize: (p, path) => {
      p.id ||= path.replace(/^programs\/|\.json$/g, '');
      p.importedAt ||= new Date().toISOString();
      (p.days || []).forEach((d, i) => { d.id ||= `d${i + 1}`; });
      return p;
    },
  });

  const finished = state.sessions.filter(s => s.finishedAt);
  const open = state.sessions.filter(s => !s.finishedAt);
  await reconcile({
    list: finished,
    prefix: 'sessions/',
    pathOf: sessionPath,
    label: s => `workout ${s.startedAt.slice(0, 10)} ${s.dayName}`,
    normalize: s => s,
  });
  state.sessions = [...finished, ...open];

  if (!state.programs.some(p => p.id === state.activeProgramId)) {
    state.activeProgramId = state.programs[0]?.id ?? null;
  }
  return summary;
}

// Call when removing a synced item locally so the file is deleted on the next sync.
export function queueDelete(state, item) {
  if (!item?._path) return;
  state.pendingDeletes = [...(state.pendingDeletes || []).filter(d => d.path !== item._path), { path: item._path }];
}
