// Comet & Commander - sound effects (Web Audio, synthesised) and Piper voice lines
window.CC = window.CC || {};
(function (CC) {
  'use strict';

  let ctx = null, master = null, noise = null;
  let muted = false;
  const last = {};          // throttles per effect name

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  // limit how often an effect can fire (seconds)
  function allowed(name, gap) {
    if (!ctx || muted) return false;
    const t = ctx.currentTime;
    if (last[name] && t - last[name] < gap) return false;
    last[name] = t;
    return true;
  }

  function tone(type, f0, f1, dur, vol, delay) {
    const t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function burst(dur, vol, freq, q) {
    const t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(60, t + dur);
    f.Q.value = q || 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  const sfx = {
    laser(kind) {
      if (!allowed('laser', 0.06)) return;
      if (kind === 'heavy') tone('sawtooth', 420, 90, 0.22, 0.08);
      else if (kind === 'enemy') tone('square', 700, 160, 0.12, 0.035);
      else tone('triangle', 1500, 300, 0.1, 0.07);
    },
    hit() { if (allowed('hit', 0.05)) burst(0.08, 0.06, 3000, 2); },
    explosion(big) {
      if (!allowed(big ? 'boomBig' : 'boom', big ? 0.1 : 0.05)) return;
      burst(big ? 1.6 : 0.7, big ? 0.6 : 0.35, big ? 1600 : 2400);
      tone('sine', big ? 90 : 140, 30, big ? 1.2 : 0.5, big ? 0.35 : 0.2);
    },
    select() { if (allowed('select', 0.05)) tone('sine', 880, 1320, 0.06, 0.08); },
    order() { if (allowed('order', 0.05)) { tone('sine', 660, 440, 0.07, 0.08); tone('sine', 990, 660, 0.07, 0.05, 0.05); } },
    build() { if (allowed('build', 0.1)) { tone('triangle', 523, 523, 0.12, 0.1); tone('triangle', 784, 784, 0.18, 0.1, 0.1); } },
    queue() { if (allowed('queue', 0.05)) tone('square', 330, 495, 0.06, 0.04); },
    denied() { if (allowed('denied', 0.2)) tone('square', 160, 120, 0.18, 0.06); },
    mine() { if (allowed('mine', 0.35)) tone('sine', 220 + Math.random() * 80, 180, 0.08, 0.025); },
    deposit() { if (allowed('deposit', 0.2)) { tone('sine', 1046, 1046, 0.08, 0.05); tone('sine', 1318, 1318, 0.1, 0.05, 0.07); } },
    upgrade() { if (allowed('upgrade', 0.2)) [523, 659, 784, 1046].forEach((f, i) => tone('triangle', f, f, 0.15, 0.08, i * 0.08)); },
    shield() { if (allowed('shield', 0.08)) tone('sine', 1800, 900, 0.09, 0.03); }
  };

  // ---------- Voices (generated offline with Piper TTS) ----------
  const VOICE_COUNT = {
    fighter_select: 3, fighter_move: 3, fighter_attack: 3, fighter_built: 1,
    cruiser_select: 3, cruiser_move: 3, cruiser_attack: 3, cruiser_built: 1,
    harvester_select: 3, harvester_move: 3, harvester_harvest: 3, harvester_built: 1,
    announce_under_attack: 1, announce_base_attack: 1, announce_wave: 1, announce_no_resources: 1,
    announce_mined_out: 1, announce_ship_lost: 1, announce_upgrade: 1, announce_hive_destroyed: 1,
    announce_victory: 1, announce_defeat: 1, announce_start: 1
  };
  const cache = {};
  let speaking = null;
  const voiceLast = {};

  // key: e.g. 'fighter_select'; gap: minimum seconds before the same key may play again
  function say(key, gap, important) {
    if (muted || !VOICE_COUNT[key]) return;
    const now = performance.now() / 1000;
    if (voiceLast[key] && now - voiceLast[key] < (gap || 0)) return;
    if (speaking && !speaking.ended && !speaking.paused) {
      if (!important) return;
      speaking.pause();
    }
    voiceLast[key] = now;
    const file = 'audio/voice/' + key + '_' + (1 + Math.floor(Math.random() * VOICE_COUNT[key])) + '.mp3';
    let a = cache[file];
    if (!a) { a = new Audio(file); a.preload = 'auto'; cache[file] = a; }
    a.currentTime = 0;
    a.volume = 0.9;
    speaking = a;
    const p = a.play();
    if (p && p.catch) p.catch(() => {});
  }

  function setMuted(m) {
    muted = m;
    if (master) master.gain.value = m ? 0 : 0.5;
    if (m && speaking) speaking.pause();
  }

  CC.audio = { init: init, sfx: sfx, say: say, setMuted: setMuted, get muted() { return muted; } };
})(window.CC);
