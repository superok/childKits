/* 題目產生器：依玩家難度與題型設定產生一輪題目 */
const Gen = (() => {
  let vocab = null;
  let situationBank = null;

  /**
   * 難度分級：
   * - options：選項數
   * - countMax / addMax / sub：數數上限、加減數字範圍、是否出減法
   * - mixedCount：數數題混入干擾圖示的機率（要從一堆裡只數目標物）
   * - missing / threeTerm：加減題出「填空（3+?=8）」與「三個數連加」的機率
   * - hardWords：認知／英文題是否納入進階詞彙（vocab 裡標 hard 的詞）
   * - sitLevel2：情境題抽到進階題（level 2）的偏好機率（0 = 完全不出）
   */
  const DIFF = {
    1: { label: '簡單 🌱', options: 3, countMax: 5,  addMax: 8,  sub: false, mixedCount: 0,    missing: 0,    threeTerm: 0,   hardWords: false, sitLevel2: 0 },
    2: { label: '中等 🌿', options: 3, countMax: 10, addMax: 10, sub: true,  mixedCount: 0,    missing: 0,    threeTerm: 0,   hardWords: false, sitLevel2: 0 },
    3: { label: '挑戰 🌳', options: 4, countMax: 12, addMax: 20, sub: true,  mixedCount: 0.35, missing: 0.25, threeTerm: 0.2, hardWords: true,  sitLevel2: 0.5 },
    4: { label: '大師 🔥', options: 4, countMax: 15, addMax: 50, sub: true,  mixedCount: 0.6,  missing: 0.35, threeTerm: 0.3, hardWords: true,  sitLevel2: 0.75 },
  };

  // 找不同類：目標類別 → 可安全當干擾項的類別（避免語意重疊，例如水果也是食物）
  const ODD_CATS = {
    animals:   { label: '動物',     others: ['fruits', 'vehicles', 'household', 'clothes'] },
    fruits:    { label: '水果',     others: ['animals', 'vehicles', 'household', 'clothes'] },
    vehicles:  { label: '交通工具', others: ['animals', 'fruits', 'foods', 'household', 'clothes'] },
    // 食物的干擾項不用動物：魚、雞也可以是食物，對小孩來說會有爭議
    foods:     { label: '食物',     others: ['vehicles', 'household', 'clothes'] },
    // 衣服與生活用品互相重疊（衣服本來就是生活用品），所以彼此不當干擾項
    clothes:   { label: '衣服',     others: ['animals', 'fruits', 'foods', 'vehicles'] },
    household: { label: '生活用品', others: ['animals', 'fruits', 'foods', 'vehicles'] },
  };

  const TYPE_INFO = {
    cognition:  { label: '🐶 認知圖像' },
    colors:     { label: '🎨 顏色' },
    shapes:     { label: '🔺 形狀' },
    counting:   { label: '🔢 數數' },
    arithmetic: { label: '➕ 加減' },
    english:    { label: '🔤 英文單字' },
    oddone:     { label: '🔍 找不同類' },
    situations: { label: '🚸 生活情境' },
  };

  const COG_CATS_PREF = ['animals', 'fruits', 'foods', 'vehicles', 'body', 'nature', 'household', 'clothes'];
  const COUNT_CATS = ['animals', 'fruits', 'foods', 'vehicles'];
  const MEASURE = { animals: '隻', fruits: '顆', foods: '個', vehicles: '台' };
  const SHAPE_COLORS = ['#e63946', '#1d6fd6', '#2a9d3f', '#f4802c', '#8144c4'];
  // 各題型的 signature 前綴：單一題型出完整庫時，用它清除紀錄讓題目可重複
  const SIG_PREFIX = {
    cognition: 'cog:', colors: 'color:', shapes: 'shape:',
    counting: 'count:', arithmetic: 'math:', english: 'en:', situations: 'sit:',
    oddone: 'odd:',
  };

  let cogCats = [];
  let maxGridItems = 26; // 數數圖示總數上限（小螢幕由 app 降到 12，換取大圖示）

  function init(vocabData, situationsData, opts = {}) {
    vocab = vocabData;
    situationBank = situationsData;
    if (opts.maxGridItems) maxGridItems = opts.maxGridItems;
    // 詞彙庫實際有的類別才拿來出題（類別要夠 4 個詞才夠出干擾項）
    cogCats = COG_CATS_PREF.filter(c => Array.isArray(vocab[c]) && vocab[c].length >= 4);
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
      pentagon: `<polygon points="50,6 94,38 77,90 23,90 6,38" ${s}/>`,
      hexagon: `<polygon points="50,5 89,27 89,73 50,95 11,73 11,27" ${s}/>`,
      cross: `<polygon points="35,8 65,8 65,35 92,35 92,65 65,65 65,92 35,92 35,65 8,65 8,35 35,35" ${s}/>`,
      arrow: `<polygon points="8,38 55,38 55,14 94,50 55,86 55,62 8,62" ${s}/>`,
      trapezoid: `<polygon points="26,20 74,20 94,80 6,80" ${s}/>`,
      semicircle: `<path d="M6 72 A 44 44 0 0 1 94 72 Z" ${s}/>`,
      ring: `<path d="M50 8 A 42 42 0 1 1 49.9 8 Z M50 30 A 20 20 0 1 0 50.1 30 Z" fill-rule="evenodd" ${s}/>`,
      crescent: `<path d="M62 8 A 42 42 0 1 0 62 92 A 34 34 0 1 1 62 8 Z" ${s}/>`,
    };
    return `<svg viewBox="0 0 100 100" aria-hidden="true">${shapes[kind] || shapes.circle}</svg>`;
  }

  /* ===== 各題型產生器（回傳 null 表示暫時出不了題，會換別的題型） ===== */

  function genCognition(diff, used) {
    const cat = pick(cogCats);
    const pool = wordPool(cat, diff);
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
      sig: `cog:${cat}:${target.en}`,
      audioSeq: [A.wordQ(cat, target)],
      answerAudio: A.wordW(cat, target),
      explanation: null,
    };
  }

  function genColors(diff, used) {
    const pool = wordPool('colors', diff);
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
      sig: `color:${target.en}`,
      audioSeq: [A.wordQ('colors', target)],
      answerAudio: A.wordW('colors', target),
      explanation: null,
    };
  }

  function genShapes(diff, used) {
    const pool = wordPool('shapes', diff);
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
      sig: `shape:${target.en}`,
      audioSeq: [A.wordQ('shapes', target)],
      answerAudio: A.wordW('shapes', target),
      explanation: null,
    };
  }

  /* ===== 預錄音檔路徑 ===== */
  const wordKey = (cat, item) => `${cat}-${item.en.replace(/ /g, '_')}`;
  const A = {
    wordQ: (cat, it) => `audio/word/${wordKey(cat, it)}-q.mp3`,   // 哪一個是X？
    wordW: (cat, it) => `audio/word/${wordKey(cat, it)}-w.mp3`,   // X（單念）
    wordEQ: (cat, it) => `audio/word/${wordKey(cat, it)}-eq.mp3`, // Find the X!
    wordEW: (cat, it) => `audio/word/${wordKey(cat, it)}-ew.mp3`, // X（英文單念）
    count: (cat, it) => `audio/count/${wordKey(cat, it)}.mp3`,
    num: n => `audio/num/${n}.mp3`,
    frag: name => `audio/frag/${name}.mp3`,
    odd: cat => `audio/odd/${cat}.mp3`,
  };

  // 依難度取詞：進階詞（hard: true）只在高難度出現
  const wordPool = (cat, diff) => vocab[cat].filter(it => diff.hardWords || !it.hard);

  // 這些詞的 emoji 一張圖就是一堆（一串葡萄、一把薯條、兩顆櫻桃），不能拿來數數
  const NOT_COUNTABLE = new Set(['grapes', 'cherry', 'fries', 'popcorn', 'noodles', 'rice', 'milk', 'sushi']);
  const countablePool = (cat, diff) => wordPool(cat, diff).filter(it => !NOT_COUNTABLE.has(it.en));

  function genCounting(diff, used) {
    const cat = pick(COUNT_CATS);
    const pool = countablePool(cat, diff);
    const item = pick(pool);
    const n = 1 + rand(Math.min(diff.countMax, maxGridItems));
    const sig = `count:${item.en}:${n}`;
    if (used.has(sig)) return null;
    used.add(sig);
    const m = MEASURE[cat] || '個';

    // 高難度：混入別種圖示當干擾，小孩要從一堆裡只數目標物
    let image = { kind: 'grid', emoji: item.emoji, count: n };
    const room = maxGridItems - n;
    if (diff.mixedCount && n >= 3 && room >= 2 && Math.random() < diff.mixedCount) {
      const other = pick(pool.filter(it => it !== item && it.emoji !== item.emoji));
      if (other) {
        const extra = Math.min(2 + rand(Math.min(6, n)), room);
        image = {
          kind: 'mixedGrid',
          target: item.emoji,
          items: shuffle([...Array(n).fill(item.emoji), ...Array(extra).fill(other.emoji)]),
        };
      }
    }

    return {
      type: 'counting',
      prompt: `數一數，有幾${m}${item.zh}？`,
      speech: { text: `數一數，圖裡有幾${m}${item.zh}？`, lang: 'zh-TW' },
      image,
      options: numberOptions(n, diff.options, 1, diff.countMax + 3),
      correctLabel: `${n}`,
      sig,
      audioSeq: [A.count(cat, item)],
      answerAudio: A.num(n),
      explanation: null,
    };
  }

  function genArithmetic(diff, used) {
    const r = Math.random();
    const variant = r < diff.threeTerm ? 'three'
      : r < diff.threeTerm + diff.missing ? 'missing'
      : 'standard';

    let prompt, speechText, answer, sig, audioSeq, image = null;

    if (variant === 'three') {
      // 三個數連加（例：2 + 5 + 3 = ?）
      const m = Math.max(3, Math.floor(diff.addMax / 3));
      const a = 1 + rand(m), b = 1 + rand(m), c = 1 + rand(m);
      answer = a + b + c;
      prompt = `${a} + ${b} + ${c} = ?`;
      speechText = `${a}，加${b}，加${c}，等於多少？`;
      sig = `math:3t:${a}+${b}+${c}`;
      audioSeq = [A.num(a), A.frag('plus'), A.num(b), A.frag('plus'), A.num(c), A.frag('equals-what')];
    } else if (variant === 'missing') {
      // 填空（例：3 + ? = 8、9 − ? = 4）
      if (diff.sub && Math.random() < 0.4) {
        const a = 2 + rand(diff.addMax - 1);
        answer = 1 + rand(a - 1);
        const d = a - answer;
        prompt = `${a} − ? = ${d}`;
        speechText = `${a}，減多少，會等於${d}？`;
        sig = `math:m:${a}-?=${d}`;
        audioSeq = [A.num(a), A.frag('minus-what-equals'), A.num(d)];
      } else {
        answer = 1 + rand(diff.addMax - 1);
        const a = 1 + rand(diff.addMax - answer);
        prompt = `${a} + ? = ${a + answer}`;
        speechText = `${a}，加多少，會等於${a + answer}？`;
        sig = `math:m:${a}+?=${a + answer}`;
        audioSeq = [A.num(a), A.frag('plus-what-equals'), A.num(a + answer)];
      }
    } else {
      const isSub = diff.sub && Math.random() < 0.4;
      let a, b, opChar, opWord;
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
      prompt = `${a} ${opChar} ${b} = ?`;
      speechText = `${a}，${opWord}${b}，等於多少？`;
      sig = `math:${a}${opChar}${b}`;
      audioSeq = [A.num(a), A.frag(isSub ? 'minus' : 'plus'), A.num(b), A.frag('equals-what')];
      if (a <= 6 && b <= 6) {
        const item = pick(countablePool('fruits', diff));
        image = { kind: 'math', emoji: item.emoji, a, b, op: opChar };
      }
    }

    if (used.has(sig)) return null;
    used.add(sig);
    return {
      type: 'arithmetic',
      prompt,
      speech: { text: speechText, lang: 'zh-TW' },
      image,
      options: numberOptions(answer, diff.options, 0, diff.addMax + 5),
      correctLabel: `${answer}`,
      sig,
      audioSeq,
      answerAudio: A.num(answer),
      explanation: null,
    };
  }

  function genEnglish(diff, used) {
    const cat = pick(cogCats);
    const pool = wordPool(cat, diff);
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
      sig: `en:${target.en}`,
      audioSeq: [A.wordEQ(cat, target)],
      answerAudio: A.wordEW(cat, target),
      explanation: null,
    };
  }

  /** 找不同類：N-1 個同類 + 1 個異類，問「哪一個不是○○？」 */
  function genOddOne(diff, used) {
    const cat = pick(Object.keys(ODD_CATS).filter(c => cogCats.includes(c)));
    if (!cat) return null;
    const info = ODD_CATS[cat];
    // 同類成員要能代表該類別，否則題目會說不通（例：把氣球當成「生活用品」）
    const sameAll = wordPool(cat, diff).filter(it => !it.notTypical);
    if (sameAll.length < diff.options) return null;
    const otherCats = info.others.filter(c => cogCats.includes(c) && wordPool(c, diff).length);
    if (!otherCats.length) return null;

    const same = sample(sameAll, diff.options - 1);
    const otherCat = pick(otherCats);
    const odd = pick(wordPool(otherCat, diff));
    const sig = `odd:${cat}:${odd.en}:${same.map(i => i.en).sort().join(',')}`;
    if (used.has(sig)) return null;
    used.add(sig);

    return {
      type: 'oddone',
      prompt: `哪一個不是${info.label}？`,
      speech: { text: `哪一個不是${info.label}？`, lang: 'zh-TW' },
      image: null,
      options: shuffle([
        { kind: 'emoji', emoji: odd.emoji, correct: true },
        ...same.map(it => ({ kind: 'emoji', emoji: it.emoji, correct: false })),
      ]),
      correctLabel: odd.zh,
      sig,
      audioSeq: [A.odd(cat)],
      answerAudio: A.wordW(otherCat, odd),
      explanation: null,
    };
  }

  function genSituation(diff, used) {
    const lvl = q => q.level || 1;
    // 低難度只出基本題；高難度依機率偏好進階題（level 2）
    const pool = situationBank.questions.filter(q => diff.sitLevel2 > 0 || lvl(q) === 1);
    let fresh = pool.filter(q => !used.has(`sit:${q.id}`));
    if (!fresh.length) return null;
    if (diff.sitLevel2 > 0 && Math.random() < diff.sitLevel2) {
      const hard = fresh.filter(q => lvl(q) === 2);
      if (hard.length) fresh = hard;
    }
    const q = pick(fresh);
    used.add(`sit:${q.id}`);
    // origIdx 對應題庫 JSON 裡的選項順序，預錄音檔以此命名（{id}-o{origIdx}.mp3）
    const options = shuffle(q.options.map((o, i) => ({
      kind: 'text', label: o.text, emoji: o.emoji || '', correct: !!o.correct, origIdx: i,
    })));
    const optionSpeech = options.map(o => o.label).join('，還是');
    const correct = options.find(o => o.correct);
    return {
      type: 'situations',
      prompt: q.question,
      speech: { text: `${q.question.replace(/？$/, '')}？${optionSpeech}？`, lang: 'zh-TW' },
      image: q.image ? { kind: 'emoji', value: q.image } : null,
      options,
      correctLabel: correct.label,
      sig: `sit:${q.id}`,
      audioSeq: [`audio/sit/${q.id}-q.mp3`, ...options.map(o => `audio/sit/${q.id}-o${o.origIdx}.mp3`)],
      answerAudio: `audio/sit/${q.id}-o${correct.origIdx}.mp3`,
      explainAudio: `audio/sit/${q.id}-e.mp3`,
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
    oddone: genOddOne,
    situations: genSituation,
  };

  /** 清掉指定題型的出題紀錄（題庫出完時讓題目可以重複再出） */
  function clearTypeSigs(used, types) {
    const prefixes = types.map(t => SIG_PREFIX[t]).filter(Boolean);
    for (const sig of [...used]) {
      if (prefixes.some(p => sig.startsWith(p))) used.delete(sig);
    }
  }

  /**
   * 依玩家設定產生一輪題目。
   * @param profile 玩家（difficulty、types）
   * @param count 題數
   * @param used 已出過題的 signature（對戰時多位玩家共用，避免同場重複）
   * @param typesOverride 指定題型（單一題型模式傳 ['colors'] 之類；null = 用玩家設定）
   */
  function buildRound(profile, count, used = new Set(), typesOverride = null) {
    const diff = DIFF[profile.difficulty] || DIFF[1];
    let enabled = (typesOverride || profile.types || []).filter(t => GENERATORS[t]);
    if (!enabled.length) enabled = Object.keys(GENERATORS);

    // 平均分配題型再打亂順序
    let seq = [];
    while (seq.length < count) seq = seq.concat(shuffle(enabled));
    seq = seq.slice(0, count);

    const questions = [];
    // 同一輪不出現相同的問句：不同題目可能共用同一句話
    //（例：「哪一個不是動物？」選項不同、「數一數，有幾隻貓？」數量不同），
    // 對小孩來說那仍然是「又是這題」。
    const prompts = new Set();

    for (const type of seq) {
      let q = null;
      let dupPrompt = null; // 真的湊不出新問句時的備案，確保題數不會短少
      // 只在啟用的題型內出題；全部出完就清紀錄重來（例：只玩顏色但選 30 題）
      for (let pass = 0; pass < 2 && !q; pass++) {
        const candidates = [type, ...shuffle(enabled.filter(t => t !== type))];
        for (const t of candidates) {
          for (let attempt = 0; attempt < 12 && !q; attempt++) {
            const cand = GENERATORS[t](diff, used);
            if (!cand) continue;
            if (prompts.has(cand.prompt)) { dupPrompt = dupPrompt || cand; continue; }
            q = cand;
          }
          if (q) break;
        }
        if (!q && pass === 0) clearTypeSigs(used, enabled);
      }
      q = q || dupPrompt;
      if (q) { prompts.add(q.prompt); questions.push(q); }
    }
    return questions;
  }

  return { init, buildRound, DIFF, TYPE_INFO };
})();
