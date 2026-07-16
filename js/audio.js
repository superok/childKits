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

const Speech = (() => {
  let voices = [];

  function loadVoices() {
    try { voices = speechSynthesis.getVoices() || []; } catch (e) { voices = []; }
  }
  if ('speechSynthesis' in window) {
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
  }

  function pickVoice(lang) {
    if (!voices.length) loadVoices();
    const norm = v => (v.lang || '').replace('_', '-').toLowerCase();
    const want = lang.toLowerCase();
    const primary = want.split('-')[0];
    return voices.find(v => norm(v) === want)
        || voices.find(v => norm(v).startsWith(primary))
        || null;
  }

  /** 朗讀文字，回傳 Promise（結束或失敗都會 resolve，不會卡住流程） */
  function speak(text, lang = 'zh-TW', rate = 0.95) {
    return new Promise(resolve => {
      if (!('speechSynthesis' in window) || !text) { resolve(); return; }
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      try {
        speechSynthesis.cancel();
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

  function stop() {
    try { speechSynthesis.cancel(); } catch (e) { /* noop */ }
  }

  return { speak, stop };
})();
