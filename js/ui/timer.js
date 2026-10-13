// Rest timer bar shown above the tab bar.
import { $, fmtTime } from './dom.js';

const timer = { end: 0, handle: null };
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
  const left = Math.round((timer.end - Date.now()) / 1000);
  $('#timer-value').textContent = left >= 0 ? fmtTime(left) : '+' + fmtTime(-left);
  const over = left < 0;
  if (over && !$('#timer').classList.contains('over')) {
    $('#timer').classList.add('over');
    navigator.vibrate?.([200, 100, 200]);
    beep();
  }
  if (!over) $('#timer').classList.remove('over');
}

export function startTimer(seconds) {
  if (!seconds) return;
  timer.end = Date.now() + seconds * 1000;
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
  $('#timer-plus').onclick = () => { timer.end += 15000; tick(); };
  $('#timer-minus').onclick = () => { timer.end -= 15000; tick(); };
}
