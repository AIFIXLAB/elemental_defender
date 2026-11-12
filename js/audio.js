/* ELEMENTAL DEFENDERS — audio: soundtrack (rendered mp3 loops) + synthesized SFX with reverb */
'use strict';
(function () {
  const A = ED.Audio = { ctx: null, vol: 0.5, last: {}, buffers: {}, track: null, cur: null, loading: {} };
  const TRACKS = { title: 'title', battle: 'battle', boss: 'boss', victory: 'victory', defeat: 'defeat' };
  const LOOP = { title: 1, battle: 1, boss: 1 };

  A.init = function () {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    try {
      const c = A.ctx = new (window.AudioContext || window.webkitAudioContext)();
      A.master = c.createGain(); A.master.gain.value = 1;
      const comp = c.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 3; comp.knee.value = 12; comp.attack.value = 0.003; comp.release.value = 0.2;
      A.master.connect(comp); comp.connect(c.destination);
      A.sfx = c.createGain(); A.sfx.connect(A.master);
      A.mus = c.createGain(); A.mus.connect(A.master);
      // reverb send
      A.verb = c.createConvolver(); A.verb.buffer = impulse(c, 2.2, 2.8);
      A.verbIn = c.createGain(); A.verbIn.gain.value = 0.35; A.verbIn.connect(A.verb); A.verb.connect(A.sfx);
      A.apply();
      if (A.pending) { const p = A.pending; A.pending = null; A.music(p); }
    } catch (e) { A.ctx = null; }
  };
  function impulse(c, dur, decay) {
    const len = Math.floor(c.sampleRate * dur), b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return b;
  }
  A.apply = function () {
    if (!A.ctx) return; const S = ED.settings || {};
    A.sfx.gain.value = S.sound === false ? 0 : (S.vol != null ? S.vol : 0.5);
    A.mus.gain.setTargetAtTime(S.music === false ? 0 : (S.mvol != null ? S.mvol : 0.45) * (A.duck ? 0.35 : 1), A.ctx.currentTime, 0.15);
  };
  A.setVol = function (v) { A.vol = v; A.apply(); };
  A.setDuck = function (d) { A.duck = d; A.apply(); };

  /* ---------------- music: เจนเนอเรตสดด้วย ED.Music ---------------- */
  A.preload = function () { };
  A.music = function (name) {
    if (!A.ctx) { A.pending = name; return; }
    if (A.cur === name) return;
    A.cur = name; ED.Music && ED.Music.play(name);
    if (name === 'victory' || name === 'defeat') A.cur = null;
  };
  A.stopMusic = function () { ED.Music && ED.Music.stop(); A.cur = null; };

  /* ---------------- SFX building blocks ---------------- */
  function out(wet) { const g = A.ctx.createGain(); g.connect(A.sfx); if (wet) { const s = A.ctx.createGain(); s.gain.value = wet; g.connect(s); s.connect(A.verbIn); } return g; }
  function tone(f, dur, type, vol, slide, delay, wet, dest) {
    const c = A.ctx; const t0 = c.currentTime + (delay || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t0); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest || out(wet)); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  let noiseBuf = null;
  function noise(dur, vol, type, freq, q, delay, wet, sweepTo) {
    const c = A.ctx; const t0 = c.currentTime + (delay || 0);
    if (!noiseBuf) { noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const s = c.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.setValueAtTime(freq || 1200, t0); f.Q.value = q || 0.8;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(out(wet)); s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
  }
  function boom(vol, low) {   // ระเบิดแบบสะอาด: sub thump + ลมกระแทก (ไม่มี distortion)
    tone(low || 90, 0.6, 'sine', 0.5 * vol, 0.4, 0, 0.15);
    tone((low || 90) * 2, 0.25, 'triangle', 0.12 * vol, 0.4, 0, 0.1);
    noise(0.7, 0.22 * vol, 'lowpass', 1200, 0.7, 0, 0.35, 150);
  }
  function whoosh(dur, from, to, vol, delay, wet, q) { noise(dur, vol, 'bandpass', from, q || 1.4, delay || 0, wet == null ? 0.5 : wet, to); }
  /* ---------------- SFX per element ---------------- */
  const SHOOT = {
    FIRE: () => { noise(0.25, 0.14, 'bandpass', 500, 0.8, 0, 0.15, 2200); tone(160, 0.18, 'sawtooth', 0.04, 0.5, 0, 0.1); },
    WIND: () => { noise(0.18, 0.12, 'bandpass', 1500, 4, 0, 0.1, 5000); },
    LIGHT: () => { tone(1568, 0.25, 'sine', 0.05, 1.3, 0, 0.5); tone(2349, 0.2, 'triangle', 0.03, 1.1, 0.03, 0.5); },
    DARK: () => { tone(110, 0.3, 'sawtooth', 0.05, 0.6, 0, 0.3); noise(0.25, 0.05, 'lowpass', 400, 1, 0, 0.3); },
    EARTH: () => { noise(0.3, 0.2, 'lowpass', 300, 0.8, 0, 0.1); tone(65, 0.3, 'sine', 0.22, 0.6); },
    WATER: () => { tone(900, 0.12, 'sine', 0.07, 0.35, 0, 0.2); tone(1400, 0.08, 'sine', 0.04, 0.5, 0.04, 0.2); },
  };
  A.play = function (name, el) {
    if (!A.ctx || (ED.settings && ED.settings.sound === false)) return;
    const now = performance.now(), k = name + (el || '');
    const gap = name === 'shoot' ? 60 : name === 'hit' ? 45 : name === 'die' ? 40 : 25;
    if (A.last[k] && now - A.last[k] < gap) return; A.last[k] = now;
    switch (name) {
      case 'shoot': SHOOT[el] && SHOOT[el](); break;
      case 'hit': noise(0.06, 0.06, 'bandpass', 2200, 1.5); tone(220, 0.06, 'square', 0.02, 0.5); break;
      case 'boom': boom(0.9, 80); break;
      case 'skill':
        whoosh(0.5, 400, 4500, 0.16, 0, 0.5, 1.2);
        tone(523, 0.45, 'triangle', 0.06, 1.5, 0, 0.6); tone(784, 0.45, 'triangle', 0.05, 1.5, 0.05, 0.6);
        boom(0.45, 110); break;
      case 'build': noise(0.15, 0.12, 'lowpass', 600, 1); tone(392, 0.15, 'triangle', 0.12, 1, 0.02, 0.3); tone(587, 0.25, 'triangle', 0.12, 1, 0.1, 0.4); break;
      case 'merge':
        [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => tone(f, 0.35, 'triangle', 0.09, 1, i * 0.06, 0.6));
        whoosh(0.9, 400, 6000, 0.14, 0.05, 0.6); boom(0.5, 70); break;
      case 'discover': [784, 988, 1175, 1568, 1976].forEach((f, i) => tone(f, 0.5, 'sine', 0.1, 1, i * 0.08, 0.7)); break;
      case 'coin': tone(1976, 0.1, 'square', 0.03, 1, 0, 0.2); tone(2637, 0.15, 'square', 0.03, 1, 0.06, 0.2); break;
      case 'sell': tone(1318, 0.1, 'square', 0.04, 1, 0, 0.2); tone(988, 0.15, 'square', 0.04, 1, 0.07, 0.2); break;
      case 'leak': tone(330, 0.3, 'triangle', 0.12, 0.6, 0, 0.3); tone(247, 0.35, 'triangle', 0.12, 0.6, 0.18, 0.3); boom(0.5, 60); break;
      case 'wave': // เริ่มเวฟ: ฟิ้ววว ไรเซอร์ + กระแทกเบาๆ + ประกายเสียง
        whoosh(0.7, 250, 6500, 0.22, 0, 0.5, 1.2);
        tone(220, 0.7, 'sine', 0.05, 2, 0, 0.6);
        boom(0.55, 70); [880, 1318, 1760].forEach((f, i) => tone(f, 0.6, 'sine', 0.035, 1, 0.65 + i * 0.05, 0.8));
        break;
      case 'waveclear': // จบเวฟ: ฟิ้วลงแบบเท่ + ระฆังวิบวับ
        whoosh(0.55, 7000, 300, 0.2, 0, 0.6, 1.1);
        [1046, 1318, 1568, 2093].forEach((f, i) => tone(f, 0.45, 'sine', 0.05, 1, 0.12 + i * 0.07, 0.8));
        break;
      case 'riser': whoosh(0.9, 200, 5000, 0.12, 0, 0.6, 2); break;
      case 'boss': // บอส: เสียงคำรามต่ำ (กรองแล้ว ไม่แตก) + ลมหวีด
        { const f = A.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700; f.connect(out(0.4));
          tone(110, 1.4, 'sawtooth', 0.22, 0.45, 0, 0, f); tone(82, 1.4, 'sawtooth', 0.18, 0.5, 0.05, 0, f); }
        whoosh(1.4, 1600, 120, 0.2, 0, 0.6, 0.9); boom(0.9, 50); break;
      case 'die': noise(0.15, 0.08, 'bandpass', 900, 1); tone(300, 0.15, 'triangle', 0.04, 0.4); break;
      case 'break': noise(0.4, 0.25, 'bandpass', 1500, 0.8, 0, 0.3, 300); tone(80, 0.3, 'sine', 0.3, 0.5); [1568, 2093, 2637].forEach((f, i) => tone(f, 0.25, 'square', 0.03, 1, 0.1 + i * 0.07, 0.4)); break;
      case 'win': case 'lose': break; // ใช้เพลง victory/defeat แทน
      case 'click': tone(1200, 0.04, 'triangle', 0.05); break;
      case 'error': tone(180, 0.12, 'square', 0.06); tone(150, 0.15, 'square', 0.06, 1, 0.08); break;
    }
  };
})();
