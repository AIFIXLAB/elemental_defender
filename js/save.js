/* ELEMENTAL DEFENDERS — browser save (localStorage). เซฟอยู่ในเบราว์เซอร์ของผู้เล่นแต่ละคน ไม่ต้องใช้รหัส */
'use strict';
(function () {
  const KEY = 'elemental_defenders_save_v1';
  const fresh = () => ({ v: 1, created: Date.now(), highest: 1, stars: {}, discovered: {}, seen: {}, seeds: {}, current: null, totals: { kills: 0, merges: 0, wins: 0, losses: 0, playTime: 0 } });
  const S = ED.save = { data: fresh(), available: true };
  ED.settings = { sound: true, vol: 0.6, music: true, mvol: 0.45, quality: 1, shake: 1, speed: 1 };
  S.load = function () {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const d = JSON.parse(raw); if (d && d.v === 1) S.data = Object.assign(fresh(), d); }
      const st = localStorage.getItem(KEY + '_settings'); if (st) Object.assign(ED.settings, JSON.parse(st));
    } catch (e) { S.available = false; }
  };
  S.persist = function () { try { localStorage.setItem(KEY, JSON.stringify(S.data)); } catch (e) { S.available = false; } };
  S.saveSettings = function () { try { localStorage.setItem(KEY + '_settings', JSON.stringify(ED.settings)); } catch (e) { } };
  S.hasProgress = function () { try { return !!localStorage.getItem(KEY); } catch (e) { return false; } };
  S.newGame = function () { S.data = fresh(); S.persist(); };
  S.wipe = function () { try { localStorage.removeItem(KEY); } catch (e) { } S.data = fresh(); };
  S.seedFor = function (stage) {
    if (!S.data.seeds[stage]) S.data.seeds[stage] = (Math.random() * 0x7fffffff) | 0;
    return S.data.seeds[stage];
  };
  S.autosave = function (game) {
    S.data.current = { stage: game.stage, seed: game.seed, snap: game.snapshot, at: Date.now() };
    S.persist();
  };
  S.clearCurrent = function () { S.data.current = null; S.persist(); };
  S.stageEnd = function (game, win, stars) {
    const d = S.data;
    d.totals.kills += game.stats.kills; d.totals.merges += game.stats.merges;
    if (win) {
      d.totals.wins++;
      d.stars[game.stage] = Math.max(d.stars[game.stage] || 0, stars);
      d.highest = Math.max(d.highest, game.stage + 1);
      delete d.seeds[game.stage];            // ผ่านด่าน → ครั้งหน้าจะเจนแผนที่ใหม่
    } else d.totals.losses++;
    d.current = null;
    S.persist();
  };
  S.totalStars = () => Object.values(S.data.stars).reduce((a, b) => a + b, 0);
})();
