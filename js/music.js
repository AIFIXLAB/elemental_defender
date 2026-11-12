/* ELEMENTAL DEFENDERS — Generative soundtrack (real-time WebAudio)
   แต่งเพลงสดตลอดเวลา: สุ่มคีย์/โหมด/เทมโป ทางคอร์ด (Markov) ทำนอง โมทีฟ และการเรียบเรียง
   เปลี่ยนทุกท่อน (8 บาร์) จึงไม่วนซ้ำเดิม · อารมณ์: title / battle / boss + เพลงสั้น victory / defeat  */
'use strict';
(function () {
  const M = ED.Music = { mood: null, playing: false, step: 0, nextT: 0, timer: null, intensity: 0.5 };
  const SCALES = {
    minor: [0, 2, 3, 5, 7, 8, 10], harm: [0, 2, 3, 5, 7, 8, 11], dorian: [0, 2, 3, 5, 7, 9, 10],
    phryg: [0, 1, 3, 5, 7, 8, 10], major: [0, 2, 4, 5, 7, 9, 11],
  };
  // ตาราง Markov ของดีกรีคอร์ด (0 = i)
  const NEXT = { 0: [5, 3, 6, 4, 5, 2], 1: [4, 6], 2: [5, 3, 6], 3: [4, 0, 6, 1], 4: [0, 5, 0], 5: [6, 3, 2, 4], 6: [0, 2, 4, 5] };
  const MOODS = {
    title:  { bpm: [86, 100], scales: ['minor', 'dorian'], root: [50, 52, 53, 55], drums: 'soft', bass: 'long', chug: false, arp: 'bell', lead: 'slow', pad: 'strings' },
    battle: { bpm: [140, 158], scales: ['minor', 'harm', 'dorian'], root: [40, 42, 43, 45], drums: 'rock', bass: 'gallop', chug: true, arp: 'synth', lead: 'fast', pad: 'strings' },
    boss:   { bpm: [164, 178], scales: ['phryg', 'harm'], root: [37, 38, 40, 41], drums: 'blast', bass: 'sixteen', chug: true, arp: 'synth', lead: 'fast', pad: 'choir' },
  };
  const R = Math.random, pick = a => a[Math.floor(R() * a.length)];
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  let ctx, bus, verbSend, noiseBuf;
  function setup() {
    const A = ED.Audio; if (!A.ctx) return false;
    ctx = A.ctx;
    if (!bus) {
      bus = ctx.createGain(); bus.gain.value = 0.72; bus.connect(A.mus);
      verbSend = ctx.createGain(); verbSend.gain.value = 0.28; verbSend.connect(A.verbIn);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = R() * 2 - 1;
    }
    return true;
  }
  /* ---------- voices (สะอาด ไม่มี distortion) ---------- */
  function vca(t, a, peak, dec, sus, rel, dur, wet) {
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setTargetAtTime(peak * sus, t + a, dec);
    g.gain.setTargetAtTime(0.0001, t + dur, rel);
    g.connect(bus); if (wet) { const s = ctx.createGain(); s.gain.value = wet; g.connect(s); s.connect(verbSend); }
    return g;
  }
  function osc(type, f, t, end, dest, detune) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; if (detune) o.detune.value = detune; o.connect(dest); o.start(t); o.stop(end); return o; }
  function filt(type, f, q, dest) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q || 0.7; b.connect(dest); return b; }
  function noise(t, dur, dest) { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.connect(dest); s.start(t, R() * 0.5); s.stop(t + dur); }
  const V = {
    kick(t, v) { const g = vca(t, 0.002, 0.9 * v, 0.08, 0.3, 0.06, 0.12, 0); const o = osc('sine', 150, t, t + 0.4, g); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); },
    snare(t, v) { const g = vca(t, 0.002, 0.42 * v, 0.06, 0.2, 0.05, 0.08, 0.3); noise(t, 0.25, filt('bandpass', 1900, 0.8, g)); const g2 = vca(t, 0.002, 0.25 * v, 0.04, 0.1, 0.03, 0.05, 0); osc('triangle', 190, t, t + 0.15, g2); },
    hat(t, v, open) { const g = vca(t, 0.001, 0.13 * v, open ? 0.08 : 0.018, 0.01, 0.03, open ? 0.12 : 0.03, 0.05); noise(t, open ? 0.3 : 0.08, filt('highpass', 7500, 0.7, g)); },
    tom(t, m, v) { const g = vca(t, 0.002, 0.5 * v, 0.12, 0.2, 0.08, 0.2, 0.2); const o = osc('sine', mtof(m) * 1.6, t, t + 0.5, g); o.frequency.exponentialRampToValueAtTime(mtof(m), t + 0.15); },
    crash(t, v) { const g = vca(t, 0.002, 0.12 * v, 0.6, 0.2, 0.6, 0.8, 0.3); noise(t, 2, filt('highpass', 5000, 0.5, g)); },
    timp(t, m, v) { const g = vca(t, 0.005, 0.55 * v, 0.4, 0.3, 0.4, 0.6, 0.4); const o = osc('sine', mtof(m) * 1.05, t, t + 1.6, filt('lowpass', 400, 0.7, g)); o.frequency.exponentialRampToValueAtTime(mtof(m), t + 0.2); },
    bass(t, m, d, v) { const g = vca(t, 0.004, 0.32 * v, 0.1, 0.6, 0.04, d, 0); const f = filt('lowpass', 520 + 500 * M.intensity, 1.2, g); osc('sawtooth', mtof(m), t, t + d + 0.2, f); osc('sine', mtof(m - 12), t, t + d + 0.2, g); },
    chug(t, m, d, v) { const g = vca(t, 0.002, 0.11 * v, 0.05, 0.25, 0.03, d, 0.08); const f = filt('lowpass', 950 + 600 * M.intensity, 1.4, g); osc('sawtooth', mtof(m), t, t + d + 0.1, f, -7); osc('sawtooth', mtof(m + 7), t, t + d + 0.1, f, 7); osc('square', mtof(m - 12), t, t + d + 0.1, f); },
    pad(t, ms, d, v, choir) {
      const g = vca(t, 0.35, 0.07 * v, 0.6, 0.85, 0.5, d, 0.6);
      const f = choir ? filt('bandpass', 900, 1.6, g) : filt('lowpass', 1700, 0.6, g);
      ms.forEach(m => { osc('sawtooth', mtof(m), t, t + d + 1.5, f, -9); osc('sawtooth', mtof(m), t, t + d + 1.5, f, 9); });
      if (choir) { const f2 = filt('bandpass', 2600, 3, g); ms.forEach(m => osc('sawtooth', mtof(m), t, t + d + 1.5, f2)); }
    },
    lead(t, m, d, v) {
      const g = vca(t, 0.015, 0.1 * v, 0.15, 0.75, 0.08, d, 0.35);
      const f = filt('lowpass', 2600 + 1200 * M.intensity, 1, g);
      const o1 = osc('sawtooth', mtof(m), t, t + d + 0.4, f), o2 = osc('square', mtof(m), t, t + d + 0.4, f, 6);
      if (d > 0.25) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 5.5; lg.gain.value = 9; l.connect(lg); lg.connect(o1.detune); lg.connect(o2.detune); l.start(t + 0.15); l.stop(t + d + 0.4); }
    },
    horn(t, m, d, v) { const g = vca(t, 0.06, 0.11 * v, 0.3, 0.8, 0.15, d, 0.5); const f = filt('lowpass', 1300, 0.8, g); osc('sawtooth', mtof(m), t, t + d + 0.6, f, -4); osc('sawtooth', mtof(m), t, t + d + 0.6, f, 4); },
    pluck(t, m, v) { const g = vca(t, 0.002, 0.06 * v, 0.06, 0.05, 0.05, 0.08, 0.35); osc('square', mtof(m), t, t + 0.3, filt('lowpass', 2800, 1, g)); },
    bell(t, m, v) {
      const g = vca(t, 0.002, 0.08 * v, 0.4, 0.05, 0.4, 0.3, 0.6);
      const car = osc('sine', mtof(m), t, t + 1.5, g); const mod = ctx.createOscillator(), mg = ctx.createGain();
      mod.frequency.value = mtof(m) * 3.5; mg.gain.setValueAtTime(mtof(m) * 2, t); mg.gain.exponentialRampToValueAtTime(1, t + 1); mod.connect(mg); mg.connect(car.frequency); mod.start(t); mod.stop(t + 1.5);
    },
  };

  /* ---------- composition state ---------- */
  let S = null;
  function newSong(mood) {
    const cfg = MOODS[mood];
    S = { mood, cfg, bpm: cfg.bpm[0] + R() * (cfg.bpm[1] - cfg.bpm[0]), scale: SCALES[pick(cfg.scales)], root: pick(cfg.root), bar: 0, section: -1 };
    newSection();
  }
  function degreeNote(deg, oct) { const sc = S.scale; const o = Math.floor(deg / 7); const d = ((deg % 7) + 7) % 7; return S.root + 12 * (oct + o) + sc[d]; }
  function chordTones(deg, oct) { return [degreeNote(deg, oct), degreeNote(deg + 2, oct), degreeNote(deg + 4, oct)]; }
  function newSection() {
    S.section++;
    // ทางคอร์ด 4 คอร์ด (Markov) เริ่มที่ i เสมอเพื่อความหนักแน่น
    const prog = [0]; while (prog.length < 4) prog.push(pick(NEXT[prog[prog.length - 1]]));
    S.prog = prog;
    // โมทีฟทำนอง: จังหวะ + การเดินโน้ต
    const rhythms = S.mood === 'title'
      ? [[0, 2, 3], [0, 1.5, 2, 3], [0, 3], [0, 1, 2]]
      : [[0, .5, 1, 1.5, 2, 3], [0, .75, 1.5, 2, 2.5, 3, 3.5], [0, 1, 1.5, 2.5, 3], [0, .5, .75, 1, 2, 3], [0, 1.5, 2, 2.5, 3.5]];
    const rh = pick(rhythms), rh2 = pick(rhythms);
    let deg = pick([0, 2, 4, 7]);
    const mk = (r) => r.map((b, i) => { if (i) deg += pick([-2, -1, -1, 1, 1, 2, 3, -3, 0]); deg = Math.max(-2, Math.min(11, deg)); return { b, deg, d: ((r[i + 1] != null ? r[i + 1] : 4) - b) }; });
    S.motifA = mk(rh); S.motifB = mk(rh2);
    // การเรียบเรียง: สุ่มเปิด/ปิดเลเยอร์ทุกท่อน แต่ค่อยๆ เข้มขึ้น
    const k = S.section % 6;
    S.layers = {
      drums: S.mood !== 'title' ? (k === 0 && R() < 0.5 ? 'half' : 'full') : (S.section > 0 ? 'soft' : 'none'),
      lead: k !== 0 || S.mood === 'title', arp: R() < 0.6 || k >= 3, pad: true, chug: S.cfg.chug && k !== 4,
      octave: R() < 0.35 ? 1 : 0, fill: true,
    };
    // เปลี่ยนคีย์บ้าง (ขึ้นครึ่งเสียง/หนึ่งเสียง) เพื่อความสด
    if (S.section > 0 && R() < 0.25) S.root += pick([1, 2, -2, 3]);
    if (S.root > S.cfg.root[3] + 4) S.root -= 12;
  }

  /* ---------- scheduler (16th steps) ---------- */
  function scheduleStep(t) {
    const st = M.step % 16, bar = Math.floor(M.step / 16), spb = 60 / S.bpm, s16 = spb / 4;
    if (st === 0) { S.bar = bar; if (bar > 0 && bar % 8 === 0) newSection(); }
    const barInSec = bar % 8, chordDeg = S.prog[Math.floor(barInSec / 2) % 4], L = S.layers, cfg = S.cfg;
    const ch = chordTones(chordDeg, 1);
    const inten = M.intensity, beatPos = st / 4;
    // ---- drums
    if (L.drums !== 'none') {
      if (cfg.drums === 'soft') {
        if (st === 0) V.timp(t, ch[0] - 12, 0.8); if (st === 10) V.timp(t, ch[0] - 12, 0.5);
        if (L.drums === 'soft' && (st === 8)) V.snare(t, 0.35);
        if (st % 4 === 2) V.hat(t, 0.4);
      } else {
        const blast = cfg.drums === 'blast' && L.drums === 'full';
        if (blast ? st % 2 === 0 : (st % 4 === 0 || (inten > 0.55 && st % 8 === 6) || (L.drums === 'full' && st === 14 && R() < 0.5))) V.kick(t, st % 4 === 0 ? 1 : 0.75);
        if ((L.drums === 'half' ? st === 8 : st % 8 === 4)) V.snare(t, 1);
        if (blast && st % 4 === 2) V.snare(t, 0.55);
        if (st % 2 === 0) V.hat(t, st % 4 === 2 ? 0.9 : 0.6, inten > 0.7 && st % 8 === 6);
        if (st === 0 && barInSec % 4 === 0) V.crash(t, 1);
        if (L.fill && barInSec === 7 && st >= 8 && st % 2 === 0) V.tom(t, 50 - (st - 8), 0.9);
      }
    }
    // ---- bass
    const root = ch[0] - 12;
    if (cfg.bass === 'long') { if (st === 0) V.bass(t, root, spb * 4, 0.7); }
    else if (cfg.bass === 'gallop') { if (st % 4 === 0) V.bass(t, root, s16 * 1.8, 1); else if (st % 4 === 2 || st % 4 === 3) V.bass(t, root, s16 * 0.9, 0.8); }
    else if (cfg.bass === 'sixteen') V.bass(t, root + (st === 14 ? 1 : 0), s16 * 0.9, st % 4 === 0 ? 1 : 0.75);
    // ---- chugs (power chords)
    if (L.chug) {
      const accent = [0, 3, 6, 10, 12].includes(st);
      if (cfg.bass === 'sixteen' || st % 2 === 0 || accent) V.chug(t, root + 12, accent ? s16 * 1.6 : s16 * 0.8, accent ? 1 : 0.6);
    }
    // ---- pad
    if (L.pad && st === 0 && barInSec % 2 === 0) V.pad(t, chordTones(chordDeg, 1).map(m => m + 12), spb * 8 - 0.1, 0.9, cfg.pad === 'choir');
    // ---- arp
    if (L.arp) {
      const arpN = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[0] + 24];
      if (cfg.arp === 'bell') { if (st % 2 === 0) V.bell(t, arpN[(st / 2) % 4] + 12, 0.8); }
      else V.pluck(t, arpN[st % 4] + (st >= 8 ? 12 : 0), 0.8 + inten * 0.3);
    }
    // ---- melody (motif A/B แบบถาม-ตอบ ปรับตามคอร์ด)
    if (L.lead) {
      const motif = (barInSec % 4) < 2 ? S.motifA : S.motifB;
      const half = barInSec % 2; // บาร์ที่สองของโมทีฟ = ตอบ (เลื่อนดีกรีตามคอร์ด)
      for (const n of motif) {
        if (Math.abs(n.b - beatPos) > 1e-6) continue;
        let deg = n.deg + chordDeg * (half ? 1 : 0) - (half ? 0 : 0);
        if (half && n === motif[motif.length - 1]) deg = chordDeg + pick([0, 2, 4]); // จบประโยคบนโน้ตคอร์ด
        const m = degreeNote(deg, 2 + L.octave) + (S.mood === 'title' ? 0 : 0);
        const dur = Math.max(0.12, n.d * spb * 0.95);
        if (cfg.lead === 'slow') V.horn(t, m - 12, dur, 1); else V.lead(t, m, dur, 0.9 + inten * 0.2);
        if (S.mood === 'boss' && R() < 0.4) V.horn(t, m - 12, dur, 0.6);
      }
    }
  }
  function tick() {
    if (!M.playing || !ctx) return;
    while (M.nextT < ctx.currentTime + 0.15) {
      scheduleStep(M.nextT);
      M.nextT += (60 / S.bpm) / 4; M.step++;
      if (M.pendingMood && M.step % 16 === 0) { const m = M.pendingMood; M.pendingMood = null; newSong(m); M.step = 0; }
    }
  }
  M.play = function (mood) {
    if (!setup()) return;
    if (mood === 'victory' || mood === 'defeat') { M.stop(); stinger(mood); return; }
    if (M.playing && S && S.mood === mood) return;
    if (M.playing) { M.pendingMood = mood; ED.Audio.play('riser'); return; } // เปลี่ยนที่ต้นบาร์ถัดไป
    newSong(mood); M.step = 0; M.nextT = ctx.currentTime + 0.1; M.playing = true;
    bus.gain.cancelScheduledValues(ctx.currentTime); bus.gain.setValueAtTime(0.0001, ctx.currentTime); bus.gain.linearRampToValueAtTime(0.72, ctx.currentTime + 1.5);
    clearInterval(M.timer); M.timer = setInterval(tick, 25);
  };
  M.stop = function () {
    if (!ctx || !bus) return; M.playing = false; clearInterval(M.timer); M.pendingMood = null;
    const t = ctx.currentTime; bus.gain.cancelScheduledValues(t); bus.gain.setValueAtTime(bus.gain.value, t); bus.gain.linearRampToValueAtTime(0.0001, t + 0.6);
    setTimeout(() => { if (!M.playing && bus) bus.gain.value = 0.72; }, 1300);
    S = null;
  };
  function stinger(kind) {
    setTimeout(() => {
      const t = ctx.currentTime + 0.05; bus.gain.cancelScheduledValues(t); bus.gain.setValueAtTime(0.72, t);
      if (kind === 'victory') {
        const r = 60 + Math.floor(R() * 5); const maj = [0, 4, 7, 12, 16, 19, 24];
        maj.forEach((iv, i) => V.lead(t + i * 0.09, r + iv, 0.18, 0.9));
        [0, 4, 7].forEach(iv => V.horn(t + 0.7, r + iv - 12, 1.8, 1));
        V.pad(t + 0.7, [r, r + 4, r + 7, r + 12], 2.2, 1.2, false);
        for (let i = 0; i < 6; i++) V.timp(t + i * 0.1, r - 24, 0.5 + i * 0.08);
        V.crash(t + 0.7, 1); V.timp(t + 0.7, r - 24, 1);
        [12, 16, 19, 24, 28].forEach((iv, i) => V.bell(t + 0.8 + i * 0.12, r + iv, 0.9));
      } else {
        const r = 57; [0, -1, -4, -7].forEach((iv, i) => V.horn(t + i * 0.55, r + iv - 12, 0.6, 1));
        V.pad(t, [r - 12, r - 9, r - 5], 3, 1, true); V.timp(t + 1.65, r - 24, 1); V.crash(t + 1.65, 0.5);
      }
    }, 700);
  }
  M.setIntensity = function (v) { M.intensity = Math.max(0, Math.min(1, v)); };
})();
