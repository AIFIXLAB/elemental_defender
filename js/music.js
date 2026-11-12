/* ELEMENTAL DEFENDERS — Generative orchestral soundtrack v2
   1) ตอนเริ่มเกมจะ "สังเคราะห์เสียงเครื่องดนตรี" ด้วย OfflineAudioContext (เครื่องสาย/สตาคคาโต/เครื่องเป่า/คอรัส/ฮาร์ป/ฟลุต/ไทโกะ/ทิมปานี/สแนร์/ฉาบ)
   2) คอมโพสเซอร์แต่งสดตลอด: คีย์/โหมด/ทางคอร์ด Markov/โมทีฟพัฒนาแบบ AABA/เคาน์เตอร์เมโลดี/ไดนามิก — ไม่วนซ้ำ
   3) ปรับได้: สไตล์, ความหนาแน่นทำนอง, ความเร็ว, ปุ่มสุ่มทำนองใหม่ (ED.settings.mStyle/mDensity/mTempo) */
'use strict';
(function () {
  const M = ED.Music = { mood: null, playing: false, step: 0, nextT: 0, timer: null, intensity: 0.5, ready: false };
  const R = Math.random, pick = a => a[Math.floor(R() * a.length)];
  const SCALES = { minor: [0, 2, 3, 5, 7, 8, 10], harm: [0, 2, 3, 5, 7, 8, 11], dorian: [0, 2, 3, 5, 7, 9, 10], phryg: [0, 1, 3, 5, 7, 8, 10], major: [0, 2, 4, 5, 7, 9, 11], lydian: [0, 2, 4, 6, 7, 9, 11] };
  const NEXT = { 0: [5, 3, 6, 4, 5, 2, 3], 1: [4, 6], 2: [5, 3, 6], 3: [4, 0, 6, 1], 4: [0, 5, 0, 3], 5: [6, 3, 2, 4], 6: [0, 2, 4, 5] };
  const STYLES = {
    epic:   { th: 'มหากาพย์ออร์เคสตรา' },
    calm:   { th: 'แฟนตาซีนุ่มนวล' },
    heroic: { th: 'ฮีโร่ดุดัน' },
  };
  M.STYLES = STYLES;
  const MOODS = {
    title:  { bpm: [80, 94], scales: ['minor', 'dorian', 'lydian'], root: [50, 52, 53, 55] },
    battle: { bpm: [132, 150], scales: ['minor', 'harm', 'dorian'], root: [45, 47, 48, 50] },
    boss:   { bpm: [150, 166], scales: ['phryg', 'harm'], root: [45, 46, 47, 48] },
  };

  let ctx, bus, rev, revIn, S = null, SMP = null;
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  /* ============ 1) สังเคราะห์ตัวอย่างเสียงเครื่องดนตรี (offline) ============ */
  function off(sec) { const O = window.OfflineAudioContext || window.webkitOfflineAudioContext; return new O(1, Math.ceil(44100 * sec), 44100); }
  function adsrOn(g, c, a, d, s, peak, end, rel) { g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(peak, a); g.gain.linearRampToValueAtTime(peak * s, a + d); g.gain.setValueAtTime(peak * s, end); g.gain.linearRampToValueAtTime(0, end + rel); }
  function ensemble(root, sec, opt) {     // เครื่องสาย/เครื่องเป่า/คอรัส
    const c = off(sec); const out = c.createGain(); out.connect(c.destination);
    adsrOn(out, c, opt.a, opt.d, opt.s, 0.5, sec - opt.r - 0.02, opt.r);
    let dest = out;
    if (opt.formants) {   // "อา" ของคอรัส
      const sum = c.createGain(); sum.gain.value = 1;
      opt.formants.forEach(([f, q, g]) => { const b = c.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = q; const gg = c.createGain(); gg.gain.value = g; sum.connect(b); b.connect(gg); gg.connect(out); });
      dest = sum;
    } else {
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.6;
      lp.frequency.setValueAtTime(opt.f0 || opt.fc, 0); lp.frequency.linearRampToValueAtTime(opt.fc, opt.fa || 0.01);
      const body = c.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = opt.body || 450; body.gain.value = 4; body.Q.value = 0.8;
      lp.connect(body); body.connect(out); dest = lp;
    }
    for (let i = 0; i < opt.voices; i++) {
      const o = c.createOscillator(); o.type = opt.wave || 'sawtooth';
      o.frequency.value = mtof(root); o.detune.value = (i - (opt.voices - 1) / 2) * opt.spread + (R() - 0.5) * 4;
      const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 4.6 + R() * 1.6; lg.gain.value = opt.vib; lfo.connect(lg); lg.connect(o.detune);
      const vg = c.createGain(); vg.gain.value = 1 / opt.voices;
      o.connect(vg); vg.connect(dest); o.start(R() * 0.02); lfo.start(0);
    }
    if (opt.breath) { const n = noiseNode(c, sec); const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = mtof(root) * 2; bp.Q.value = 2; const ng = c.createGain(); ng.gain.value = opt.breath; n.connect(bp); bp.connect(ng); ng.connect(out); }
    return c.startRendering();
  }
  function noiseNode(c, sec) { const b = c.createBuffer(1, Math.ceil(c.sampleRate * sec), c.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = R() * 2 - 1; const s = c.createBufferSource(); s.buffer = b; s.start(0); return s; }
  function karplus(root, sec) {          // ฮาร์ป: Karplus-Strong
    const sr = 44100, n = Math.ceil(sr * sec), out = new Float32Array(n); const N = Math.round(sr / mtof(root));
    const buf = new Float32Array(N); for (let i = 0; i < N; i++) buf[i] = (R() * 2 - 1) * (0.6 + 0.4 * Math.sin(i / N * Math.PI));
    let idx = 0, prev = 0; const damp = 0.996 - Math.max(0, root - 60) * 0.0003;
    for (let i = 0; i < n; i++) { const v = buf[idx]; const nv = damp * 0.5 * (v + prev); prev = v; buf[idx] = nv; out[i] = v; idx = (idx + 1) % N; }
    let lp = 0; for (let i = 0; i < n; i++) { lp += (out[i] - lp) * 0.35; out[i] = lp * 0.8 * Math.min(1, i / 40); }
    const ab = ctx.createBuffer(1, n, sr); ab.copyToChannel ? ab.copyToChannel(out, 0) : ab.getChannelData(0).set(out); return Promise.resolve(ab);
  }
  function perc(kind) {
    const sec = { taiko: 1.6, timp: 2.2, snare: 0.6, cym: 3, swell: 2.4 }[kind];
    const c = off(sec), out = c.createGain(); out.connect(c.destination);
    if (kind === 'taiko' || kind === 'timp') {
      const o = c.createOscillator(); o.type = 'sine'; const base = kind === 'taiko' ? 62 : 73;
      o.frequency.setValueAtTime(base * 1.9, 0); o.frequency.exponentialRampToValueAtTime(base, 0.08);
      const g = c.createGain(); g.gain.setValueAtTime(0.9, 0); g.gain.exponentialRampToValueAtTime(0.001, kind === 'taiko' ? 1.2 : 2);
      o.connect(g); g.connect(out); o.start(0);
      const o2 = c.createOscillator(); o2.frequency.value = base * 1.52; const g2 = c.createGain(); g2.gain.setValueAtTime(0.25, 0); g2.gain.exponentialRampToValueAtTime(0.001, 0.6); o2.connect(g2); g2.connect(out); o2.start(0);
      const n = noiseNode(c, 0.3), lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = kind === 'taiko' ? 900 : 500; const ng = c.createGain(); ng.gain.setValueAtTime(0.6, 0); ng.gain.exponentialRampToValueAtTime(0.001, 0.12); n.connect(lp); lp.connect(ng); ng.connect(out);
    } else if (kind === 'snare') {
      const n = noiseNode(c, sec), bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 0.6; const g = c.createGain(); g.gain.setValueAtTime(0.7, 0); g.gain.exponentialRampToValueAtTime(0.001, 0.35); n.connect(bp); bp.connect(g); g.connect(out);
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(240, 0); o.frequency.exponentialRampToValueAtTime(170, 0.05); const og = c.createGain(); og.gain.setValueAtTime(0.5, 0); og.gain.exponentialRampToValueAtTime(0.001, 0.15); o.connect(og); og.connect(out); o.start(0);
    } else if (kind === 'cym' || kind === 'swell') {
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5200; const g = c.createGain(); hp.connect(g); g.connect(out);
      [263, 400, 421, 474, 587, 845].forEach(f => { const o = c.createOscillator(); o.type = 'square'; o.frequency.value = f * 2.4; o.connect(hp); o.start(0); });
      const n = noiseNode(c, sec), nh = c.createBiquadFilter(); nh.type = 'highpass'; nh.frequency.value = 7000; n.connect(nh); nh.connect(g);
      if (kind === 'cym') { g.gain.setValueAtTime(0.25, 0); g.gain.exponentialRampToValueAtTime(0.001, sec); }
      else { g.gain.setValueAtTime(0.001, 0); g.gain.exponentialRampToValueAtTime(0.22, sec - 0.05); g.gain.linearRampToValueAtTime(0, sec); }
    }
    return c.startRendering();
  }
  M.build = function () {
    if (M.building || M.ready) return M.building;
    const set = (roots, fn) => Promise.all(roots.map(r => fn(r).then(b => [r, b]))).then(a => a);
    M.building = Promise.all([
      set([36, 48, 60, 72, 84], r => ensemble(r, 6, { voices: 7, spread: 9, vib: 7, a: 0.3, d: 0.4, s: 0.85, r: 0.4, fc: 2600, body: 420 })),
      set([36, 48, 60, 72], r => ensemble(r, 0.7, { voices: 5, spread: 8, vib: 3, a: 0.006, d: 0.18, s: 0.15, r: 0.2, fc: 3400, body: 500 })),
      set([36, 48, 60, 72], r => ensemble(r, 4, { voices: 4, spread: 6, vib: 5, a: 0.06, d: 0.3, s: 0.8, r: 0.3, f0: 380, fc: 2200, fa: 0.18, body: 600 })),
      set([48, 60, 72], r => ensemble(r, 6, { voices: 6, spread: 10, vib: 9, a: 0.45, d: 0.5, s: 0.9, r: 0.6, formants: [[730, 6, 1], [1150, 7, 0.55], [2600, 9, 0.3]] })),
      set([48, 60, 72, 84], r => karplus(r, 3)),
      set([72, 84], r => ensemble(r, 4, { voices: 1, spread: 0, vib: 10, a: 0.08, d: 0.2, s: 0.85, r: 0.25, wave: 'sine', fc: 6000, breath: 0.05 })),
      Promise.all(['taiko', 'timp', 'snare', 'cym', 'swell'].map(k => perc(k).then(b => [k, b]))),
    ]).then(([str, spic, brass, choir, harp, flute, pc]) => {
      SMP = { str, spic, brass, choir, harp, flute, perc: Object.fromEntries(pc) };
      M.ready = true; if (M.wantMood) { const m = M.wantMood; M.wantMood = null; M.play(m); }
    }).catch(() => { M.failed = true; });
    return M.building;
  };

  /* ============ 2) เครือข่ายเสียง: bus + reverb ห้องคอนเสิร์ต ============ */
  function setup() {
    const A = ED.Audio; if (!A.ctx) return false;
    if (ctx) return true;
    ctx = A.ctx;
    bus = ctx.createGain(); bus.gain.value = 0.0001;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 2.5; comp.knee.value = 10; comp.attack.value = 0.01; comp.release.value = 0.3;
    const makeup = ctx.createGain(); makeup.gain.value = 2.0;
    bus.connect(comp); comp.connect(makeup); makeup.connect(A.mus);
    rev = ctx.createConvolver(); const len = Math.floor(ctx.sampleRate * 3.4), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); const pre = Math.floor(ctx.sampleRate * 0.025); for (let i = pre; i < len; i++) d[i] = (R() * 2 - 1) * Math.pow(1 - (i - pre) / (len - pre), 3.2); }
    rev.buffer = ir; revIn = ctx.createGain(); revIn.gain.value = 0.42; const rlp = ctx.createBiquadFilter(); rlp.type = 'lowpass'; rlp.frequency.value = 5200;
    revIn.connect(rev); rev.connect(rlp); rlp.connect(comp);
    return true;
  }
  /* เล่นตัวอย่างเสียงที่ปรับระดับเสียงแล้ว */
  function note(set, m, t, dur, vel, pan, wet, rel) {
    if (!SMP) return; const arr = SMP[set]; let best = arr[0];
    for (const p of arr) if (Math.abs(p[0] - m) < Math.abs(best[0] - m)) best = p;
    const src = ctx.createBufferSource(); src.buffer = best[1]; src.playbackRate.value = Math.pow(2, (m - best[0]) / 12);
    const g = ctx.createGain(); const len = best[1].duration / src.playbackRate.value;
    const end = Math.min(t + dur, t + len - 0.05); rel = rel || 0.25;
    g.gain.setValueAtTime(vel, t); g.gain.setValueAtTime(vel, Math.max(t, end)); g.gain.linearRampToValueAtTime(0.0001, Math.max(t, end) + rel);
    src.connect(g); let o = g;
    if (ctx.createStereoPanner && pan) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); o = p; }
    o.connect(bus); if (wet) { const w = ctx.createGain(); w.gain.value = wet; o.connect(w); w.connect(revIn); }
    src.start(t); src.stop(Math.max(t, end) + rel + 0.05);
  }
  function hit(kind, t, vel, pan, wet, rate) {
    if (!SMP) return; const src = ctx.createBufferSource(); src.buffer = SMP.perc[kind]; if (rate) src.playbackRate.value = rate;
    const g = ctx.createGain(); g.gain.value = vel; src.connect(g); let o = g;
    if (ctx.createStereoPanner && pan) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); o = p; }
    o.connect(bus); if (wet) { const w = ctx.createGain(); w.gain.value = wet; o.connect(w); w.connect(revIn); }
    src.start(t);
  }

  /* ============ 3) คอมโพสเซอร์ ============ */
  const opt = () => { const s = ED.settings || {}; return { style: s.mStyle || 'epic', dens: s.mDensity != null ? s.mDensity : 1, tempo: s.mTempo != null ? s.mTempo : 1 }; };
  function newSong(mood) {
    const cfg = MOODS[mood], o = opt();
    let scales = cfg.scales;
    if (o.style === 'calm' && mood !== 'boss') scales = ['dorian', 'lydian', 'major'];
    if (o.style === 'heroic' && mood !== 'boss') scales = ['harm', 'minor'];
    const tempoMul = o.tempo * (o.style === 'calm' ? 0.88 : o.style === 'heroic' ? 1.06 : 1);
    S = { mood, cfg, o, bpm: (cfg.bpm[0] + R() * (cfg.bpm[1] - cfg.bpm[0])) * tempoMul, scale: SCALES[pick(scales)], root: pick(cfg.root), section: -1 };
    newSection();
  }
  const dn = (deg, oct) => { const sc = S.scale, o = Math.floor(deg / 7), d = ((deg % 7) + 7) % 7; return S.root + 12 * (oct + o) + sc[d]; };
  const triad = (deg, oct) => [dn(deg, oct), dn(deg + 2, oct), dn(deg + 4, oct)];
  function makeMotif(len) {   // โมทีฟ: จังหวะ + การเคลื่อนที่ทีละขั้น จบที่โน้ตคอร์ด
    const dens = S.o.dens;
    const pools = S.mood === 'title' || S.o.style === 'calm'
      ? [[0, 1.5, 2, 3], [0, 2, 3], [0, 1, 2], [0, 0.5, 1, 2, 3], [0, 3]]
      : [[0, 0.5, 1, 1.5, 2, 3], [0, 0.75, 1.5, 2, 3], [0, 1, 1.5, 2.5, 3], [0, 0.5, 0.75, 1, 2, 3], [0, 1.5, 2, 2.5, 3, 3.5]];
    let rh = pick(pools);
    if (dens < 0.8) rh = rh.filter((b, i) => i === 0 || b % 1 === 0);
    if (dens > 1.2 && S.mood !== 'title') rh = [...new Set(rh.concat([pick([0.5, 1.5, 2.5, 3.5])]))].sort((a, b) => a - b);
    let deg = pick([0, 2, 4, 4, 7]); const notes = [];
    for (let bar = 0; bar < len; bar++) rh.forEach((b, i) => {
      if (bar || i) { const step = pick([-1, -1, 1, 1, 2, -2, 0, 3, -3]); deg = Math.max(-1, Math.min(9, deg + step)); }
      const nb = rh[i + 1] != null ? rh[i + 1] : 4; notes.push({ beat: bar * 4 + b, deg, d: nb - b });
    });
    return notes;
  }
  function newSection() {
    S.section++;
    const prog = [0]; while (prog.length < 4) prog.push(pick(NEXT[prog[prog.length - 1]]));
    if (R() < 0.5) prog[3] = pick([4, 6]);   // ปิดท่อนด้วย V หรือ VII ให้อยากไปต่อ
    S.prog = prog;
    S.motifA = makeMotif(2);
    S.motifB = R() < 0.5 ? S.motifA.map(n => ({ ...n, deg: n.deg + pick([1, 2, -1]) })) : makeMotif(2);   // ท่อน B = sequence ของ A หรือโมทีฟใหม่
    const k = S.section % 4;
    S.L = {
      drums: S.mood === 'title' ? (S.section > 0 ? 'soft' : 'none') : (k === 0 && R() < 0.4 ? 'half' : 'full'),
      ost: S.mood !== 'title' && !(S.o.style === 'calm' && k === 0),
      harp: S.mood === 'title' || S.o.style === 'calm' || R() < 0.35,
      lead: k !== 0 || S.mood === 'title',
      counter: S.section > 0 && R() < 0.55,
      choir: S.mood === 'boss' || k >= 2 || S.o.style === 'heroic',
      flute: (S.mood === 'title' || S.o.style === 'calm') && R() < 0.5,
      octave: R() < 0.3 ? 1 : 0,
    };
    if (S.section > 0 && R() < 0.22) S.root += pick([2, -2, 3, 5]);
    if (S.root > S.cfg.root[3] + 5) S.root -= 12; if (S.root < S.cfg.root[0] - 5) S.root += 12;
    S.swellNext = true;
  }
  function scheduleStep(t) {
    const st = M.step % 16, bar = Math.floor(M.step / 16);
    if (st === 0 && bar > 0 && bar % 8 === 0) newSection();
    const spb = 60 / S.bpm, s16 = spb / 4, bis = bar % 8, cd = S.prog[Math.floor(bis / 2) % 4], L = S.L, o = S.o, mood = S.mood;
    const inten = M.intensity, heroic = o.style === 'heroic', calm = o.style === 'calm';
    const ch = triad(cd, 0), bass = ch[0] - 12;
    const vol = (calm ? 0.8 : 1) * (0.75 + 0.35 * inten) * (mood === 'title' ? 1.5 : 1);
    // ---- กลอง ----
    if (L.drums !== 'none') {
      if (L.drums === 'soft') { if (st === 0) hit('timp', t, 0.5, -0.2, 0.4); if (st === 8 && bis % 2 === 1) hit('taiko', t, 0.35, 0.2, 0.4); }
      else {
        const boss = mood === 'boss';
        const taikoPat = boss ? [0, 3, 6, 8, 11, 14] : heroic ? [0, 3, 8, 10] : [0, 8, 11];
        if (taikoPat.includes(st) && (L.drums === 'full' || st === 0)) hit('taiko', t, (st === 0 ? 0.95 : 0.7) * vol, (st % 3 - 1) * 0.25, 0.3);
        if (!calm && (st === 4 || st === 12) && L.drums === 'full') hit('snare', t, 0.55 * vol, 0.15, 0.35);
        if (boss && st % 2 === 0 && st !== 0 && L.drums === 'full' && inten > 0.5) hit('snare', t, 0.18, -0.2, 0.2);
        if (st === 0 && bis % 4 === 0) hit('cym', t, 0.5 * vol, 0.3, 0.5);
        if (bis === 7 && st >= 12) hit('taiko', t, 0.6, 0.4 - (st - 12) * 0.2, 0.3, 1 + (st - 12) * 0.08);
      }
    }
    if (bis === 6 && st === 8 && S.mood !== 'title') hit('swell', t, 0.6 * vol, 0, 0.5);   // ฉาบซ่าเข้าท่อนใหม่
    // ---- เบส (สตาคคาโตต่ำ / เครื่องสายยาว) ----
    if (L.ost) {
      const pat = mood === 'boss' ? [1, 1, 1, 1] : heroic ? [1, 0, 1, 1] : [1, 0, 1, 0];
      if (pat[st % 4]) note('spic', (st % 8 === 6 && R() < 0.4 ? ch[2] - 12 : bass), t, s16 * 0.9, 0.55 * vol, -0.3, 0.15);
      if (st % 4 === 0) note('spic', bass + 12, t, s16, 0.3 * vol, 0.3, 0.15);
    }
    if (st === 0 && bis % 2 === 0) {
      note('str', bass, t, spb * 8, 0.32 * vol, -0.15, 0.35, 0.6);
      note('str', ch[0] + 12, t, spb * 8, 0.18 * vol, -0.35, 0.5, 0.7); note('str', ch[1] + 12, t, spb * 8, 0.16 * vol, 0.35, 0.5, 0.7); note('str', ch[2] + 12, t, spb * 8, 0.14 * vol, 0, 0.5, 0.7);
      if (L.choir) triad(cd, 1).forEach((m, i) => note('choir', m, t, spb * 8, (mood === 'boss' ? 0.22 : 0.15) * vol, (i - 1) * 0.4, 0.6, 0.8));
    }
    // ---- เครื่องเป่าแทงจังหวะ ----
    if (mood !== 'title' && !calm && (st === 0 || (heroic && st === 10)) && (bis % 2 === 0 || inten > 0.6)) triad(cd, 0).forEach((m, i) => note('brass', m, t, spb * (st === 0 ? 1.5 : 0.5), 0.2 * vol, (i - 1) * 0.3, 0.35));
    // ---- ฮาร์ปอาร์เปจโจ ----
    if (L.harp) {
      const arp = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[0] + 24, ch[2] + 12, ch[1] + 12];
      if (mood === 'title' ? st % 2 === 0 : st % 2 === 0 && inten < 0.85) note('harp', arp[(st / 2) % 6] + (mood === 'title' ? 0 : 12), t, 1.5, 0.32 * (calm ? 1.1 : 0.8), (st % 4 ? 0.4 : -0.4), 0.45, 0.6);
    }
    // ---- ทำนองหลัก (AABA) ----
    if (L.lead) {
      const phrase = Math.floor(bis / 2), motif = phrase === 2 ? S.motifB : S.motifA, beatInPhrase = (bis % 2) * 4 + st / 4;
      for (let i = 0; i < motif.length; i++) {
        const n = motif[i]; if (Math.abs(n.beat - beatInPhrase) > 1e-6) continue;
        let deg = n.deg + (phrase === 1 ? 1 : 0);
        if (i === motif.length - 1 && phrase === 3) deg = 7;  // จบประโยคที่โทนิก
        const m = dn(deg, 1 + L.octave + (mood === 'title' ? 1 : 1)), dur = Math.max(0.15, n.d * spb * 0.97);
        if (L.flute && mood !== 'boss') note('flute', m + 12, t, dur, 0.28, 0.1, 0.5, 0.3);
        else if (mood === 'title' || calm) note('brass', m - 12, t, dur, 0.24, 0, 0.5, 0.35);
        else { note('str', m, t, dur, 0.34 * vol, 0.05, 0.4, 0.2); if (heroic || mood === 'boss') note('brass', m - 12, t, dur, 0.2 * vol, -0.05, 0.4, 0.25); }
      }
    }
    // ---- เคาน์เตอร์เมโลดี (เครื่องสายเสียงสูงเดินช้าๆ) ----
    if (L.counter && (st === 0 || st === 8)) note('str', dn(cd + (st ? 4 : 2) + 7, 1), t, spb * 2, 0.14 * vol, 0.45, 0.6, 0.4);
  }
  function tick() {
    if (!M.playing || !ctx || !S) return;
    if (M.nextT < ctx.currentTime - 0.25) M.nextT = ctx.currentTime + 0.05;   // แก้บั๊ก: แท็บถูกพักแล้วโน้ตทะลักพร้อมกัน
    while (M.nextT < ctx.currentTime + 0.18) {
      scheduleStep(M.nextT); M.nextT += (60 / S.bpm) / 4; M.step++;
      if (M.pendingMood && M.step % 16 === 0) { const m = M.pendingMood; M.pendingMood = null; newSong(m); M.step = 0; }
      if (M.reroll && M.step % 16 === 0) { M.reroll = false; newSong(S.mood); M.step = 0; }
    }
  }
  M.play = function (mood) {
    if (!setup()) return;
    if (!M.ready) { M.wantMood = mood; M.build(); return; }
    if (mood === 'victory' || mood === 'defeat') { M.stop(); setTimeout(() => stinger(mood), 650); return; }
    if (M.playing && S && S.mood === mood) return;
    if (M.playing) { M.pendingMood = mood; ED.Audio.play('riser'); return; }
    newSong(mood); M.step = 0; M.nextT = ctx.currentTime + 0.12; M.playing = true;
    const now = ctx.currentTime; bus.gain.cancelScheduledValues(now); bus.gain.setValueAtTime(0.0001, now); bus.gain.linearRampToValueAtTime(0.9, now + 1.8);
    clearInterval(M.timer); M.timer = setInterval(tick, 30);
  };
  M.stop = function () {
    if (!ctx) return; M.playing = false; clearInterval(M.timer); M.pendingMood = null; M.wantMood = null; S = null;
    const now = ctx.currentTime; bus.gain.cancelScheduledValues(now); bus.gain.setValueAtTime(Math.max(0.0001, bus.gain.value), now); bus.gain.linearRampToValueAtTime(0.0001, now + 0.7);
  };
  M.rerollMelody = function () { if (M.playing && S) M.reroll = true; };
  M.restyle = function () { if (M.playing && S) M.reroll = true; };
  function stinger(kind) {
    if (!SMP) return; const now = ctx.currentTime; bus.gain.cancelScheduledValues(now); bus.gain.setValueAtTime(0.9, now);
    const t = now + 0.05;
    if (kind === 'victory') {
      const r = 60 + Math.floor(R() * 5);
      [0, 4, 7, 12].forEach((iv, i) => note('brass', r + iv - 12, t + i * 0.12, 0.3, 0.3, (i - 1.5) * 0.2, 0.4));
      [0, 4, 7].forEach((iv, i) => { note('brass', r + iv - 12, t + 0.55, 2.2, 0.32, (i - 1) * 0.3, 0.5, 0.8); note('str', r + iv, t + 0.55, 2.4, 0.25, (i - 1) * 0.4, 0.6, 0.9); });
      note('choir', r, t + 0.55, 2.4, 0.2, 0, 0.7, 1); note('str', r - 24, t + 0.55, 2.4, 0.3, 0, 0.4, 0.8);
      for (let i = 0; i < 5; i++) hit('timp', t + i * 0.09, 0.3 + i * 0.1, 0, 0.4);
      hit('cym', t + 0.55, 0.6, 0, 0.6); hit('taiko', t + 0.55, 0.9, 0, 0.4);
      [12, 16, 19, 24].forEach((iv, i) => note('harp', r + iv, t + 0.7 + i * 0.1, 1.5, 0.35, 0.3, 0.6));
    } else {
      const r = 57; [0, -1, -4, -7].forEach((iv, i) => note('brass', r + iv - 12, t + i * 0.55, 0.65, 0.26, 0, 0.6, 0.4));
      [r - 12, r - 9, r - 5].forEach((m, i) => note('choir', m, t, 3.2, 0.18, (i - 1) * 0.4, 0.8, 1)); note('str', r - 24, t, 3.2, 0.3, 0, 0.5, 1);
      hit('timp', t + 1.65, 0.8, 0, 0.6); hit('cym', t + 1.65, 0.3, 0, 0.7);
    }
  }
  M.prepare = function () { if (setup()) M.build(); };
  M.setIntensity = function (v) { M.intensity = Math.max(0, Math.min(1, v)); };
})();
