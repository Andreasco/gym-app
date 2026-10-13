// App chrome: top bar, tab bar and the scrolling <main> every view renders into.
import { $, icon } from './dom.js';

export const view = $('#view');

// Tab roots (no back button) get the large title.
export function setChrome(title, { back = false, tab = null } = {}) {
  $('#title').textContent = title;
  $('#back').hidden = !back;
  $('.topbar').classList.toggle('root', !back);
  document.querySelectorAll('.tabbar a').forEach(a => {
    const active = a.dataset.tab === tab;
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}

export function initShell() {
  document.querySelectorAll('[data-icon]').forEach(el => el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)));
  $('#back').onclick = () => (history.length > 1 ? history.back() : (location.hash = '#/'));
  // iOS Safari applies :active styles only when a touch listener exists.
  document.addEventListener('touchstart', () => {}, { passive: true });
}

export function renderNotFound() {
  setChrome('Non trovato', { back: true });
  view.innerHTML = '<div class="empty"><h2>Elemento non trovato</h2><p><a href="#/">Torna alle schede</a></p></div>';
}
