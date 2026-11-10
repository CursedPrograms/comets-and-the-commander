// Comets and the Commander - sound effects (Web Audio, synthesised) and Piper voice lines
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
    // comet warning: a rising two-tone alarm
    warning() {
      if (!allowed('warning', 1)) return;
      for (let i = 0; i < 3; i++) { tone('square', 660, 990, 0.16, 0.07, i * 0.36); tone('square', 990, 660, 0.16, 0.07, i * 0.36 + 0.18); }
    },
    // comet rushing past
    whoosh() {
      if (!allowed('whoosh', 0.5)) return;
      const t = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noise; s.loop = true;
      f.type = 'bandpass'; f.Q.value = 2;
      f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(2400, t + 1.2); f.frequency.exponentialRampToValueAtTime(200, t + 2.2);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 1.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
      s.connect(f); f.connect(g); g.connect(master);
      s.start(t); s.stop(t + 2.3);
    },
    shield() { if (allowed('shield', 0.08)) tone('sine', 1800, 900, 0.09, 0.03); }
  };

  // ---------- Voices (generated offline with Piper TTS) ----------
  const VOICE_COUNT = {
    fighter_select: 3, fighter_move: 3, fighter_attack: 3, fighter_built: 1,
    cruiser_select: 3, cruiser_move: 3, cruiser_attack: 3, cruiser_built: 1,
    harvester_select: 3, harvester_move: 3, harvester_harvest: 3, harvester_built: 1,
    announce_under_attack: 1, announce_base_attack: 1, announce_wave: 1, announce_no_resources: 1,
    announce_mined_out: 1, announce_ship_lost: 1, announce_upgrade: 1, announce_hive_destroyed: 1,
    announce_victory: 1, announce_defeat: 1, announce_start: 1, announce_comet: 2,
    announce_sector: 2, announce_enter: 2, announce_saved: 1, commander_move: 3, commander_select: 2
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

  // ---------- Music: the main theme on the menu, two tracks in game, crossfaded ----------
  const TRACKS = { theme: 'audio/music/main-theme.mp3', calm: 'audio/music/track-1.mp3', battle: 'audio/music/track-2.mp3' };
  const MUSIC_VOL = 0.45;
  const players = {};
  let wanted = null;          // the track that should be playing
  let unlocked = false;       // browsers only allow sound after a click or key
  function player(name) {
    if (!players[name]) {
      const a = new Audio(TRACKS[name]);
      a.loop = true; a.preload = 'auto'; a.volume = 0;
      players[name] = a;
    }
    return players[name];
  }
  function music(name) {
    wanted = name;
    if (!unlocked || muted) return;
    const a = player(name);
    if (a.paused) { const p = a.play(); if (p && p.catch) p.catch(() => {}); }
  }
  // fade every track towards its target volume
  setInterval(() => {
    for (const name in players) {
      const a = players[name];
      const target = !muted && name === wanted ? MUSIC_VOL : 0;
      const v = a.volume + Math.sign(target - a.volume) * 0.025;
      a.volume = Math.max(0, Math.min(1, Math.abs(target - a.volume) < 0.03 ? target : v));
      if (a.volume === 0 && name !== wanted && !a.paused) a.pause();
    }
  }, 60);
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    init();
    if (wanted) music(wanted);
  }
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });

  function setMuted(m) {
    muted = m;
    if (master) master.gain.value = m ? 0 : 0.5;
    if (m && speaking) speaking.pause();
    if (!m && wanted) music(wanted);
    try { localStorage.setItem('cc-muted', m ? '1' : '0'); } catch (e) { /* private mode */ }
  }
  try { muted = localStorage.getItem('cc-muted') === '1'; } catch (e) { /* private mode */ }

  CC.audio = { music: music, get musicTrack() { return wanted; }, init: init, sfx: sfx, say: say, setMuted: setMuted, get muted() { return muted; } };
})(window.CC);
