/* 本機儲存：玩家檔案、成績、對戰紀錄（localStorage，無後端） */
const Store = (() => {
  const KEYS = {
    profiles: 'quizkids.profiles.v1',
    scores: 'quizkids.scores.v1',
    battles: 'quizkids.battles.v1',
    seen: 'quizkids.seen.v1',
  };

  // 每位玩家記得最近出過的題目，避免連續幾輪一直遇到同樣的題
  const SEEN_CAP = 400;

  const mem = {}; // localStorage 不可用時的備援

  function get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return key in mem ? mem[key] : fallback;
    }
  }

  function set(key, val) {
    mem[key] = val;
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* 私密模式等 */ }
  }

  const ALL_TYPES = ['cognition', 'colors', 'shapes', 'counting', 'arithmetic', 'english', 'oddone', 'situations'];

  function defaultProfiles() {
    return [
      { id: 'p1', name: '玩家一', avatar: '🦁', color: '#1d6fd6', difficulty: 1, types: ALL_TYPES.slice() },
      { id: 'p2', name: '玩家二', avatar: '🐰', color: '#f4802c', difficulty: 1, types: ALL_TYPES.slice() },
    ];
  }

  function getProfiles() {
    let list = get(KEYS.profiles, null);
    if (!list || !list.length) {
      list = defaultProfiles();
      set(KEYS.profiles, list);
    }
    return list;
  }

  function saveProfiles(list) { set(KEYS.profiles, list); }

  function getProfile(id) { return getProfiles().find(p => p.id === id) || null; }

  function upsertProfile(profile) {
    const list = getProfiles();
    const i = list.findIndex(p => p.id === profile.id);
    if (i >= 0) list[i] = profile; else list.push(profile);
    saveProfiles(list);
  }

  function deleteProfile(id) {
    saveProfiles(getProfiles().filter(p => p.id !== id));
    const scores = get(KEYS.scores, {});
    delete scores[id];
    set(KEYS.scores, scores);
    const seen = get(KEYS.seen, {});
    delete seen[id];
    set(KEYS.seen, seen);
  }

  function getScores(profileId) {
    const scores = get(KEYS.scores, {});
    return scores[profileId] || [];
  }

  function addScore(profileId, entry) {
    const scores = get(KEYS.scores, {});
    const list = scores[profileId] || [];
    list.push(entry);
    list.sort((a, b) => b.score - a.score);
    scores[profileId] = list.slice(0, 100);
    set(KEYS.scores, scores);
  }

  function bestScore(profileId) {
    const list = getScores(profileId);
    return list.length ? list[0].score : null;
  }

  /** 這位玩家最近出過的題目 signature（越後面越新） */
  function getSeen(profileId) {
    return get(KEYS.seen, {})[profileId] || [];
  }

  /** 記錄剛出過的題目；超過上限時淘汰最舊的 */
  function addSeen(profileId, sigs) {
    if (!sigs || !sigs.length) return;
    const all = get(KEYS.seen, {});
    const fresh = new Set(sigs);
    const list = (all[profileId] || []).filter(s => !fresh.has(s)).concat(sigs);
    all[profileId] = list.slice(-SEEN_CAP);
    set(KEYS.seen, all);
  }

  function getBattles() { return get(KEYS.battles, []); }

  function addBattle(entry) {
    const list = getBattles();
    list.unshift(entry);
    set(KEYS.battles, list.slice(0, 50));
  }

  return {
    ALL_TYPES,
    getProfiles, saveProfiles, getProfile, upsertProfile, deleteProfile,
    getScores, addScore, bestScore,
    getSeen, addSeen,
    getBattles, addBattle,
  };
})();
