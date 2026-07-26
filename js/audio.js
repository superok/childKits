/* 音效（WebAudio 合成，無外部檔案）＋ 語音朗讀（SpeechSynthesis） */

const Sfx = (() => {
  let ctx = null;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, start, dur, type = 'sine', gain = 0.25) {
    const c = ensure();
    if (!c) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(gain, c.currentTime + start);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + start + dur);
    o.connect(g).connect(c.destination);
    o.start(c.currentTime + start);
    o.stop(c.currentTime + start + dur + 0.05);
  }

  return {
    unlock: ensure,
    tap() { tone(520, 0, 0.08, 'sine', 0.12); },
    correct() { tone(660, 0, 0.15); tone(880, 0.13, 0.22); },
    wrong() { tone(220, 0, 0.3, 'sawtooth', 0.12); },
    turn() { tone(523, 0, 0.12); tone(659, 0.12, 0.12); tone(784, 0.24, 0.2); },
    fanfare() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.15, i === 3 ? 0.5 : 0.16)); },
  };
})();

/* 預錄語音庫：情境題與共用句的高品質音檔，播不了時由呼叫端退回裝置 TTS */
const AudioBank = (() => {
  let files = null; // Set<路徑>；null = 沒有音檔庫
  let current = null;
  let playbackRate = 1;
  let gen = 0; // 世代標記：每次播放/停止都 +1，舊序列的回呼一律失效

  /** 設定播放速度（語速設定用，音檔已是 -10% 錄製，故 1 = 正常） */
  function setRate(r) { playbackRate = r; }

  async function init() {
    try {
      const r = await fetch('audio/manifest.json');
      if (r.ok) {
        const m = await r.json();
        if (Array.isArray(m.files) && m.files.length) files = new Set(m.files);
      }
    } catch (e) { /* 沒有音檔庫就全用裝置 TTS */ }
  }

  const has = p => !!files && files.has(p);
  const hasAll = paths => paths.every(has);

  function stopCurrent() {
    if (current) {
      current.onended = null;
      current.onerror = null;
      try { current.pause(); } catch (e) { /* noop */ }
      current = null;
    }
  }

  function stop() {
    gen++; // 讓進行中的序列立刻失效
    stopCurrent();
  }

  /**
   * 依序播放多個音檔，resolve：
   *   'done'    全部播完
   *   'failed'  播不出來（呼叫端可退回 TTS）
   *   'aborted' 被新的播放或 stop() 中止（呼叫端什麼都不該做）
   */
  function playSeq(paths) {
    const token = ++gen; // 開始新序列，同時作廢上一個
    stopCurrent();
    return new Promise(resolve => {
      let i = 0;
      const finish = status => {
        if (token === gen) current = null;
        resolve(status);
      };
      const next = () => {
        if (token !== gen) { finish('aborted'); return; }
        if (i >= paths.length) { finish('done'); return; }
        const a = new Audio(paths[i++]);
        a.playbackRate = playbackRate;
        // 變速不變調，避免慢速時聲音變低沉
        a.preservesPitch = true;
        a.webkitPreservesPitch = true;
        current = a;
        a.onended = () => { if (token === gen) next(); };
        a.onerror = () => { if (token === gen) finish('failed'); };
        a.play().then(() => {
          // 音檔還在下載時被中止的話，play() 會晚一步才成功；這裡把這個孤兒立刻停掉
          if (token !== gen) { try { a.pause(); } catch (e) { /* noop */ } }
        }).catch(() => { if (token === gen) finish('failed'); });
      };
      next();
    });
  }

  return { init, has, hasAll, playSeq, stop, setRate };
})();

const Speech = (() => {
  let voices = [];

  // 家長可選的語音偏好（聲音與語速），存本機
  const PREF_KEY = 'quizkids.speech.v1';
  // zh/en 存 voiceURI（null = 自動）；mode：recorded = 用預錄音檔，device = 全部用裝置語音
  const prefs = { zh: null, en: null, rate: 0.95, mode: 'recorded' };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREF_KEY) || '{}')); } catch (e) { /* noop */ }

  function savePrefs(p) {
    Object.assign(prefs, p);
    try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* noop */ }
  }

  function loadVoices() {
    try { voices = speechSynthesis.getVoices() || []; } catch (e) { voices = []; }
  }
  if ('speechSynthesis' in window) {
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
  }

  const norm = v => (v.lang || '').replace('_', '-').toLowerCase();

  /** 列出某語言可用的語音（zh / en） */
  function listVoices(primary) {
    if (!voices.length) loadVoices();
    return voices.filter(v => norm(v).startsWith(primary));
  }

  function pickVoice(lang) {
    if (!voices.length) loadVoices();
    const want = lang.toLowerCase();
    const primary = want.split('-')[0];
    const prefURI = prefs[primary];
    if (prefURI) {
      const chosen = voices.find(v => v.voiceURI === prefURI);
      if (chosen) return chosen;
    }
    return voices.find(v => norm(v) === want)
        || voices.find(v => norm(v).startsWith(primary))
        || null;
  }

  /** 朗讀文字，回傳 Promise（結束或失敗都會 resolve，不會卡住流程） */
  let speechGen = 0;

  /** iOS 的 cancel() 在暫停狀態下會失效，先 resume 再 cancel 比較可靠 */
  function hardCancel() {
    try {
      if (speechSynthesis.paused) speechSynthesis.resume();
      speechSynthesis.cancel();
    } catch (e) { /* noop */ }
  }

  function speak(text, lang = 'zh-TW', rate = null) {
    if (rate === null) rate = prefs.rate;
    const token = ++speechGen;
    return new Promise(resolve => {
      if (!('speechSynthesis' in window) || !text) { resolve(); return; }
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      try {
        hardCancel();
        if (token !== speechGen) { finish(); return; }
        const u = new SpeechSynthesisUtterance(text);
        u.lang = lang;
        u.rate = rate;
        const v = pickVoice(lang);
        if (v) u.voice = v;
        u.onend = finish;
        u.onerror = finish;
        speechSynthesis.speak(u);
        // 安全網：某些環境不會觸發 onend
        setTimeout(finish, Math.max(4000, text.length * 350));
      } catch (e) {
        finish();
      }
    });
  }

  /**
   * 連續唸多段（可各自指定語言），用於中英夾雜的句子
   * （例：「換」zh →「Jen」en →「囉！」zh），段落間不會互相取消。
   */
  function speakSeq(segments) {
    const token = ++speechGen;
    return new Promise(resolve => {
      if (!('speechSynthesis' in window)) { resolve(); return; }
      const list = segments.filter(s => s && s.text);
      if (!list.length) { resolve(); return; }
      let finished = false;
      const finish = () => { if (!finished) { finished = true; resolve(); } };
      hardCancel();

      // 一段唸完才排下一段：任何時候佇列裡最多一句，中止後續段落就不會再被排入
      let i = 0;
      const next = () => {
        if (finished) return;
        if (token !== speechGen || i >= list.length) { finish(); return; }
        const s = list[i++];
        try {
          const u = new SpeechSynthesisUtterance(s.text);
          u.lang = s.lang || 'zh-TW';
          u.rate = prefs.rate;
          const v = pickVoice(u.lang);
          if (v) u.voice = v;
          u.onend = () => { if (token === speechGen) next(); else finish(); };
          u.onerror = () => { if (token === speechGen) next(); else finish(); };
          speechSynthesis.speak(u);
        } catch (e) {
          finish();
        }
      };
      next();
      setTimeout(finish, 20000); // 安全網
    });
  }

  function stop() {
    speechGen++; // 讓進行中的接力立刻停止排下一段
    hardCancel();
  }

  return { speak, speakSeq, stop, listVoices, savePrefs, prefs: () => ({ ...prefs }) };
})();
