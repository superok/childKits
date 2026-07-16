/* 題目產生器：依玩家難度與題型設定產生一輪題目 */
const Gen = (() => {
  let vocab = null;
  let situationBank = null;

  const DIFF = {
    1: { label: '簡單 🌱', options: 3, countMax: 5, addMax: 5, sub: false },
    2: { label: '中等 🌿', options: 3, countMax: 10, addMax: 10, sub: true },
    3: { label: '挑戰 🌳', options: 4, countMax: 12, addMax: 20, sub: true },
  };

  const TYPE_INFO = {
    cognition:  { label: '🐶 認知圖像' },
    colors:     { label: '🎨 顏色' },
    shapes:     { label: '🔺 形狀' },
    counting:   { label: '🔢 數數' },
    arithmetic: { label: '➕ 加減' },
    english:    { label: '🔤 英文單字' },
    situations: { label: '🚸 生活情境' },
  };

  const COG_CATS = ['animals', 'fruits', 'foods', 'vehicles', 'body'];
  const COUNT_CATS = ['animals', 'fruits', 'foods', 'vehicles'];
  const MEASURE = { animals: '隻', fruits: '顆', foods: '個', vehicles: '台' };
  const SHAPE_COLORS = ['#e63946', '#1d6fd6', '#2a9d3f', '#f4802c', '#8144c4'];

  function init(vocabData, situationsData) {
    vocab = vocabData;
    situationBank = situationsData;
  }

  const rand = n => Math.floor(Math.random() * n);
  const pick = arr => arr[rand(arr.length)];
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = rand(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function sample(arr, n) { return shuffle(arr).slice(0, n); }

  /** 產生 answer 附近的數字干擾項 */
  function numberOptions(answer, total, min, max) {
    const set = new Set([answer]);
    let spread = 3;
    let guard = 0;
    while (set.size < total && guard++ < 200) {
      let cand = answer + (rand(spread * 2 + 1) - spread);
      cand = Math.max(min, Math.min(max, cand));
      if (cand !== answer) set.add(cand);
      if (guard % 20 === 0) spread += 2;
    }
    return shuffle([...set]).map(n => ({ kind: 'number', label: String(n), correct: n === answer }));
  }

  function shapeSVG(kind, color) {
    const s = `fill="${color}"`;
    const shapes = {
      circle: `<circle cx="50" cy="50" r="40" ${s}/>`,
      triangle: `<polygon points="50,10 92,88 8,88" ${s}/>`,
      square: `<rect x="12" y="12" width="76" height="76" rx="6" ${s}/>`,
      rectangle: `<rect x="6" y="26" width="88" height="48" rx="6" ${s}/>`,
      star: `<polygon points="50,5 61,38 96,38 68,59 79,92 50,72 21,92 32,59 4,38 39,38" ${s}/>`,
      heart: `<path d="M50 88 C 20 62, 2 40, 12 22 C 20 8, 40 10, 50 26 C 60 10, 80 8, 88 22 C 98 40, 80 62, 50 88 Z" ${s}/>`,
      diamond: `<polygon points="50,6 90,50 50,94 10,50" ${s}/>`,
      oval: `<ellipse cx="50" cy="50" rx="44" ry="30" ${s}/>`,
    };
    return `<svg viewBox="0 0 100 100" aria-hidden="true">${shapes[kind] || shapes.circle}</svg>`;
  }

  /* ===== 各題型產生器（回傳 null 表示暫時出不了題，會換別的題型） ===== */

  function genCognition(diff, used) {
    const cat = pick(COG_CATS);
    const pool = vocab[cat];
    const fresh = pool.filter(it => !used.has(`cog:${cat}:${it.en}`));
    if (!fresh.length) return null;
    const target = pick(fresh);
    used.add(`cog:${cat}:${target.en}`);
    const others = sample(pool.filter(it => it !== target), diff.options - 1);
    if (others.length < diff.options - 1) return null;
    return {
      type: 'cognition',
      prompt: `哪一個是${target.zh}？`,
      speech: { text: `哪一個是${target.zh}？`, lang: 'zh-TW' },
      image: null,
      options: shuffle([target, ...others].map(it => ({ kind: 'emoji', emoji: it.emoji, correct: it === target }))),
      correctLabel: target.zh,
      explanation: null,
    };
  }

  function genColors(diff, used) {
    const pool = vocab.colors;
    const fresh = pool.filter(c => !used.has(`color:${c.en}`));
    if (!fresh.length) return null;
    const target = pick(fresh);
    used.add(`color:${target.en}`);
    const others = sample(pool.filter(c => c !== target), diff.options - 1);
    return {
      type: 'colors',
      prompt: `哪一個是${target.zh}？`,
      speech: { text: `哪一個是${target.zh}？`, lang: 'zh-TW' },
      image: null,
      options: shuffle([target, ...others].map(c => ({ kind: 'color', hex: c.hex, correct: c === target }))),
      correctLabel: target.zh,
      explanation: null,
    };
  }

  function genShapes(diff, used) {
    const pool = vocab.shapes;
    const fresh = pool.filter(sh => !used.has(`shape:${sh.en}`));
    if (!fresh.length) return null;
    const target = pick(fresh);
    used.add(`shape:${target.en}`);
    const others = sample(pool.filter(sh => sh !== target), diff.options - 1);
    const color = pick(SHAPE_COLORS);
    return {
      type: 'shapes',
      prompt: `哪一個是${target.zh}？`,
      speech: { text: `哪一個是${target.zh}？`, lang: 'zh-TW' },
      image: null,
      options: shuffle([target, ...others].map(sh => ({ kind: 'shape', svg: shapeSVG(sh.svg, color), correct: sh === target }))),
      correctLabel: target.zh,
      explanation: null,
    };
  }

  function genCounting(diff, used) {
    const cat = pick(COUNT_CATS);
    const item = pick(vocab[cat]);
    const n = 1 + rand(diff.countMax);
    const sig = `count:${item.en}:${n}`;
    if (used.has(sig)) return null;
    used.add(sig);
    const m = MEASURE[cat];
    return {
      type: 'counting',
      prompt: `數一數，有幾${m}${item.zh}？`,
      speech: { text: `數一數，圖裡有幾${m}${item.zh}？`, lang: 'zh-TW' },
      image: { kind: 'grid', emoji: item.emoji, count: n },
      options: numberOptions(n, diff.options, 1, diff.countMax + 3),
      correctLabel: `${n}`,
      explanation: null,
    };
  }

  function genArithmetic(diff, used) {
    const isSub = diff.sub && Math.random() < 0.4;
    let a, b, answer, opChar, opWord;
    if (isSub) {
      a = 2 + rand(diff.addMax - 1);
      b = 1 + rand(a - 1);
      answer = a - b;
      opChar = '−'; opWord = '減';
    } else {
      a = 1 + rand(diff.addMax - 1);
      b = 1 + rand(diff.addMax - a);
      answer = a + b;
      opChar = '+'; opWord = '加';
    }
    const sig = `math:${a}${opChar}${b}`;
    if (used.has(sig)) return null;
    used.add(sig);
    const item = pick(vocab.fruits);
    const image = (a <= 6 && b <= 6)
      ? { kind: 'math', emoji: item.emoji, a, b, op: opChar }
      : null;
    return {
      type: 'arithmetic',
      prompt: `${a} ${opChar} ${b} = ?`,
      speech: { text: `${a}，${opWord}${b}，等於多少？`, lang: 'zh-TW' },
      image,
      options: numberOptions(answer, diff.options, 0, diff.addMax + 5),
      correctLabel: `${answer}`,
      explanation: null,
    };
  }

  function genEnglish(diff, used) {
    const cat = pick(COUNT_CATS);
    const pool = vocab[cat];
    const fresh = pool.filter(it => !used.has(`en:${it.en}`));
    if (!fresh.length) return null;
    const target = pick(fresh);
    used.add(`en:${target.en}`);
    const others = sample(pool.filter(it => it !== target), diff.options - 1);
    return {
      type: 'english',
      prompt: `Find the ${target.en}!`,
      speech: { text: `Find the ${target.en}!`, lang: 'en-US' },
      image: null,
      options: shuffle([target, ...others].map(it => ({ kind: 'emoji', emoji: it.emoji, correct: it === target }))),
      correctLabel: target.en,
      explanation: null,
    };
  }

  function genSituation(diff, used) {
    const fresh = situationBank.questions.filter(q => !used.has(`sit:${q.id}`));
    if (!fresh.length) return null;
    const q = pick(fresh);
    used.add(`sit:${q.id}`);
    const options = shuffle(q.options.map(o => ({
      kind: 'text', label: o.text, emoji: o.emoji || '', correct: !!o.correct,
    })));
    const optionSpeech = options.map(o => o.label).join('，還是');
    return {
      type: 'situations',
      prompt: q.question,
      speech: { text: `${q.question.replace(/？$/, '')}？${optionSpeech}？`, lang: 'zh-TW' },
      image: q.image ? { kind: 'emoji', value: q.image } : null,
      options,
      correctLabel: q.options.find(o => o.correct).text,
      explanation: q.explanation || null,
    };
  }

  const GENERATORS = {
    cognition: genCognition,
    colors: genColors,
    shapes: genShapes,
    counting: genCounting,
    arithmetic: genArithmetic,
    english: genEnglish,
    situations: genSituation,
  };

  /**
   * 依玩家設定產生一輪題目。
   * @param profile 玩家（difficulty、types）
   * @param count 題數
   * @param used 已出過題的 signature（對戰時多位玩家共用，避免同場重複）
   */
  function buildRound(profile, count, used = new Set()) {
    const diff = DIFF[profile.difficulty] || DIFF[1];
    let enabled = (profile.types || []).filter(t => GENERATORS[t]);
    if (!enabled.length) enabled = Object.keys(GENERATORS);

    // 平均分配題型再打亂順序
    let seq = [];
    while (seq.length < count) seq = seq.concat(shuffle(enabled));
    seq = seq.slice(0, count);

    const questions = [];
    for (const type of seq) {
      let q = null;
      const candidates = [type, ...shuffle(enabled.filter(t => t !== type)), ...shuffle(Object.keys(GENERATORS))];
      for (const t of candidates) {
        for (let attempt = 0; attempt < 12 && !q; attempt++) {
          q = GENERATORS[t](diff, used);
        }
        if (q) break;
      }
      if (q) questions.push(q);
    }
    return questions;
  }

  return { init, buildRound, DIFF, TYPE_INFO };
})();
