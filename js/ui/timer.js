// Rest timer bar docked above the tab bar.
import { $, fmtTime } from './dom.js';

const timer = { end: 0, total: 0, handle: null };
let audioCtx;

function beep() {
  try {
    audioCtx ??= new AudioContext();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = 880;
    g.gain.value = 0.15;
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + 0.35);
  } catch { /* audio not available */ }
}

function tick() {
  const ms = timer.end - Date.now();
  const left = Math.round(ms / 1000);
  $('#timer-value').textContent = left >= 0 ? fmtTime(left) : '+' + fmtTime(-left);
  $('#timer-progress').style.transform = `scaleX(${Math.min(1, Math.max(0, ms / timer.total))})`;
  const over = left < 0;
  if (over && !$('#timer').classList.contains('over')) {
    $('#timer').classList.add('over');
    navigator.vibrate?.([200, 100, 200]);
    beep();
  }
  if (!over) $('#timer').classList.remove('over');
}

function adjust(ms) {
  timer.end += ms;
  timer.total = Math.max(timer.total, timer.end - Date.now());
  tick();
}

export function startTimer(seconds) {
  if (!seconds) return;
  timer.total = seconds * 1000;
  timer.end = Date.now() + timer.total;
  $('#timer').hidden = false;
  clearInterval(timer.handle);
  tick();
  timer.handle = setInterval(tick, 250);
}

export function stopTimer() {
  clearInterval(timer.handle);
  $('#timer').hidden = true;
  $('#timer').classList.remove('over');
}

export function initTimer() {
  $('#timer-stop').onclick = stopTimer;
  $('#timer-plus').onclick = () => adjust(15000);
  $('#timer-minus').onclick = () => adjust(-15000);
}
