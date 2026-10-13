// App chrome: top bar, tab bar and the scrolling <main> every view renders into.
import { $ } from './dom.js';

export const view = $('#view');

export function setChrome(title, { back = false, tab = null } = {}) {
  $('#title').textContent = title;
  $('#back').hidden = !back;
  document.querySelectorAll('.tabbar a').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
}

export function initShell() {
  $('#back').onclick = () => (history.length > 1 ? history.back() : (location.hash = '#/'));
}

export function renderNotFound() {
  setChrome('Non trovato', { back: true });
  view.innerHTML = '<div class="empty"><p>Elemento non trovato.</p><a href="#/">Torna alle schede</a></div>';
}
