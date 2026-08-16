/* 主程式：畫面流程與遊戲邏輯 */
(() => {
  const $ = id => document.getElementById(id);

  const APP_VERSION = 'v21';

  const SOLO_COUNTS = [10, 20, 30];
  const VS_COUNTS = [5, 10, 15]; // 對戰為「每人題數」
  const CAT_ICONS = { cognition: '🐶', colors: '🎨', shapes: '🔺', counting: '🔢', arithmetic: '➕', english: '🔤', oddone: '🔍', situations: '🚸' };

  const AVATARS = ['🦁','🐰','🐯','🐼','🐸','🐵','🦊','🐻','🐨','🐷','🦄','🐙','🦖','🐳','🚀','🌟','🍓','🎈','⚽','🎀','🤖','👑','🦋','🐥'];
  const COLORS = ['#e63946','#1d6fd6','#2a9d3f','#f4802c','#8144c4','#f27fb2','#00a8a8','#8b5a2b','#5b6ee1','#d4a017'];
  const PRAISES = ['答對了，你好棒！','太厲害了！','答對囉，繼續加油！','哇，好聰明！'];

  let session = null;        // 進行中的一輪
  let versusSelection = [];  // 對戰模式選到的玩家 id（依點選順序）
  let editingId = null;      // 編輯中的玩家 id（null = 新增）
  let editState = null;
  let setup = null;          // 選題設定 {mode, profileIds, category, count}

  /**
   * 名字的語音段落：有設定唸法用唸法；英文名自動切英文語音唸名字段；
   * 中文名直接併進整句。回傳給 Speech.speakSeq 的段落陣列。
   */
  function nameSegments(profile, before, after) {
    const spoken = (profile.nameSpeech || '').trim();
    if (spoken) return [{ text: `${before}${spoken}${after}`, lang: 'zh-TW' }];
    if (/[A-Za-z]/.test(profile.name)) {
      return [
        { text: before, lang: 'zh-TW' },
        { text: profile.name, lang: 'en-US' },
        { text: after, lang: 'zh-TW' },
      ];
    }
    return [{ text: `${before}${profile.name}${after}`, lang: 'zh-TW' }];
  }

  /** 偵測 flex gap 支援（iOS 14.1 以前沒有），不支援就讓 CSS 改用 margin 排版 */
  function detectFlexGap() {
    const probe = document.createElement('div');
    probe.style.cssText = 'display:flex;gap:10px;position:absolute;visibility:hidden';
    probe.appendChild(document.createElement('div'));
    probe.appendChild(document.createElement('div'));
    document.body.appendChild(probe);
    const supported = probe.scrollWidth === 10;
    probe.remove();
    if (!supported) document.documentElement.classList.add('no-flex-gap');
  }

  function stopAllAudio() {
    Speech.stop();
    AudioBank.stop();
  }

  /** 這一題有沒有完整的預錄音檔可用（家長選「裝置語音」時一律不用） */
  const hasQuestionAudio = q =>
    Speech.prefs().mode !== 'device' && !!q.audioSeq && AudioBank.hasAll(q.audioSeq);

  /** 唸出題目：優先用預錄音檔（依畫面上的選項順序），失敗退回裝置 TTS */
  function speakQuestion(question) {
    stopAllAudio();
    if (hasQuestionAudio(question)) {
      AudioBank.playSeq(question.audioSeq).then(st => {
        // 只有真的播不出來才退回 TTS；被中止（已進到下個動作）就什麼都不做
        if (st === 'failed') Speech.speak(question.speech.text, question.speech.lang);
      });
      return;
    }
    Speech.speak(question.speech.text, question.speech.lang);
  }

  /* ===== 畫面切換 ===== */
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $(id).classList.add('active');
  }

  function setTheme(el, color) {
    el.style.setProperty('--pc', color);
    el.style.setProperty('--pc-soft', color + '18');
  }

  /* ===== 首頁 ===== */
  function profileCard(p, { selectable = false } = {}) {
    const card = document.createElement('button');
    card.className = 'profile-card' + (selectable ? ' selectable' : '');
    card.style.setProperty('--pc', p.color);
    const best = Store.bestScore(p.id);
    card.innerHTML = `
      <span class="sel-mark">✓</span>
      <div class="profile-avatar">${p.avatar}</div>
      <div class="profile-name">${escapeHtml(p.name)}</div>
      <div class="profile-best">${best === null ? '還沒玩過' : `最高分 ⭐ ${best}`}</div>`;
    return card;
  }

  function renderHome() {
    const grid = $('profile-grid');
    grid.innerHTML = '';
    for (const p of Store.getProfiles()) {
      const card = profileCard(p);
      card.addEventListener('click', () => { Sfx.unlock(); Sfx.tap(); openSetup('solo', [p.id]); });

      const edit = document.createElement('button');
      edit.className = 'profile-edit';
      edit.textContent = '✏️';
      edit.setAttribute('aria-label', '編輯玩家');
      edit.addEventListener('click', e => { e.stopPropagation(); openEdit(p.id); });
      card.appendChild(edit);
      grid.appendChild(card);
    }
    const add = document.createElement('button');
    add.className = 'profile-card add-card';
    add.innerHTML = '<div class="add-plus">＋</div><div>新增玩家</div>';
    add.addEventListener('click', () => openEdit(null));
    grid.appendChild(add);
  }

  function goHome() {
    stopAllAudio();
    session = null;
    renderHome();
    showScreen('screen-home');
  }

  /* ===== 編輯玩家 ===== */
  function openEdit(id) {
    editingId = id;
    const p = id ? Store.getProfile(id) : null;
    const usedAvatars = Store.getProfiles().map(x => x.avatar);
    const usedColors = Store.getProfiles().map(x => x.color);
    editState = p ? {
      name: p.name, nameSpeech: p.nameSpeech || '', avatar: p.avatar, color: p.color,
      difficulty: p.difficulty, types: p.types.slice(),
    } : {
      name: '',
      nameSpeech: '',
      avatar: AVATARS.find(a => !usedAvatars.includes(a)) || AVATARS[0],
      color: COLORS.find(c => !usedColors.includes(c)) || COLORS[0],
      difficulty: 1,
      types: Store.ALL_TYPES.slice(),
    };
    $('edit-title').textContent = id ? '編輯玩家' : '新增玩家';
    $('edit-name').value = editState.name;
    $('edit-namespeech').value = editState.nameSpeech;
    $('btn-edit-delete').classList.toggle('hidden', !id || Store.getProfiles().length <= 1);
    renderEditPickers();
    $('modal-edit').classList.remove('hidden');
  }

  function renderEditPickers() {
    const av = $('edit-avatars');
    av.innerHTML = '';
    for (const a of AVATARS) {
      const b = document.createElement('button');
      b.className = 'picker-item' + (a === editState.avatar ? ' selected' : '');
      b.textContent = a;
      b.addEventListener('click', () => { editState.avatar = a; renderEditPickers(); });
      av.appendChild(b);
    }
    const co = $('edit-colors');
    co.innerHTML = '';
    for (const c of COLORS) {
      const b = document.createElement('button');
      b.className = 'picker-item' + (c === editState.color ? ' selected' : '');
      b.style.background = c;
      b.addEventListener('click', () => { editState.color = c; renderEditPickers(); });
      co.appendChild(b);
    }
    const df = $('edit-diff');
    df.innerHTML = '';
    for (const [level, info] of Object.entries(Gen.DIFF)) {
      const b = document.createElement('button');
      b.className = 'seg-btn' + (Number(level) === editState.difficulty ? ' selected' : '');
      b.textContent = info.label;
      b.addEventListener('click', () => { editState.difficulty = Number(level); renderEditPickers(); });
      df.appendChild(b);
    }
    const tg = $('edit-types');
    tg.innerHTML = '';
    for (const t of Store.ALL_TYPES) {
      const on = editState.types.includes(t);
      const b = document.createElement('button');
      b.className = 'type-btn' + (on ? ' selected' : '');
      b.textContent = (on ? '✅ ' : '⬜ ') + Gen.TYPE_INFO[t].label;
      b.addEventListener('click', () => {
        if (on) {
          if (editState.types.length > 1) editState.types = editState.types.filter(x => x !== t);
        } else {
          editState.types.push(t);
        }
        renderEditPickers();
      });
      tg.appendChild(b);
    }
  }

  function saveEdit() {
    const name = $('edit-name').value.trim() || '小寶貝';
    const profile = {
      id: editingId || ('p' + Date.now()),
      name,
      nameSpeech: $('edit-namespeech').value.trim(),
      avatar: editState.avatar,
      color: editState.color,
      difficulty: editState.difficulty,
      types: editState.types.slice(),
    };
    Store.upsertProfile(profile);
    $('modal-edit').classList.add('hidden');
    renderHome();
  }

  /* ===== 語音設定 ===== */
  // [TTS 語速, 標籤, 預錄音檔播放倍率]——兩者校準到相近聽感
  const RATES = [[0.8, '慢慢說 🐢', 0.85], [0.95, '正常 🙂', 1], [1.1, '快一點 🐇', 1.2]];
  const MODES = [['recorded', '🎧 高品質錄音', '題目與回饋用內建錄音（推薦）'], ['device', '📱 裝置語音', '全部改用 iPad 的語音，可自選聲音']];
  const VOICE_SAMPLE = { zh: '你好，我是說故事的聲音！', en: 'Hello! Find the apple!' };
  const SAMPLE_CLIP = 'audio/frag/tie.mp3'; // 切換設定時用來試聽錄音的句子

  /** 把語速偏好同步到預錄音檔的播放速度 */
  function applyRate() {
    const r = Speech.prefs().rate;
    const row = RATES.find(x => Math.abs(x[0] - r) < 0.01) || RATES[1];
    AudioBank.setRate(row[2]);
  }

  /** 試聽：依目前模式播錄音或裝置語音 */
  function previewVoice(primary = 'zh') {
    stopAllAudio();
    const prefs = Speech.prefs();
    if (prefs.mode !== 'device' && primary === 'zh' && AudioBank.has(SAMPLE_CLIP)) {
      AudioBank.playSeq([SAMPLE_CLIP]).then(st => { if (st === 'failed') Speech.speak(VOICE_SAMPLE.zh, 'zh-TW'); });
    } else {
      Speech.speak(VOICE_SAMPLE[primary], primary === 'zh' ? 'zh-TW' : 'en-US');
    }
  }

  function renderVoiceModal() {
    const prefs = Speech.prefs();
    const deviceMode = prefs.mode === 'device';

    const modeRow = $('voice-mode');
    modeRow.innerHTML = '';
    for (const [mode, label, desc] of MODES) {
      const b = document.createElement('button');
      b.className = 'mode-btn' + (prefs.mode === mode ? ' selected' : '');
      b.innerHTML = `<span class="mode-title">${label}</span><span class="mode-desc">${desc}</span>`;
      b.addEventListener('click', () => {
        Speech.savePrefs({ mode });
        renderVoiceModal();
        previewVoice('zh');
      });
      modeRow.appendChild(b);
    }

    // 裝置語音細項只在「裝置語音」模式下出現，避免多一層無用的選擇
    $('voice-device-section').classList.toggle('hidden', !deviceMode);

    const rateRow = $('voice-rate');
    rateRow.innerHTML = '';
    for (const [rate, label] of RATES) {
      const b = document.createElement('button');
      b.className = 'seg-btn' + (Math.abs(prefs.rate - rate) < 0.01 ? ' selected' : '');
      b.textContent = label;
      b.addEventListener('click', () => {
        Speech.savePrefs({ rate });
        applyRate();
        renderVoiceModal();
        previewVoice('zh');
      });
      rateRow.appendChild(b);
    }

    const REGION = {
      'zh-tw': '台灣 🇹🇼', 'zh-cn': '中國', 'zh-hk': '香港粵語',
      'en-us': '美式', 'en-gb': '英式', 'en-au': '澳洲', 'en-in': '印度', 'en-ie': '愛爾蘭', 'en-za': '南非',
    };
    const regionOf = v => {
      const lang = (v.lang || '').replace('_', '-').toLowerCase();
      return REGION[lang] || v.lang || '';
    };

    for (const primary of ['zh', 'en']) {
      const listEl = $('voice-' + primary);
      listEl.innerHTML = '';
      // 台灣國語（zh-TW）／美式英文排最前面，方便挑
      const preferred = primary === 'zh' ? 'zh-tw' : 'en-us';
      const options = Speech.listVoices(primary).sort((a, b) => {
        const al = (a.lang || '').replace('_', '-').toLowerCase() === preferred ? 0 : 1;
        const bl = (b.lang || '').replace('_', '-').toLowerCase() === preferred ? 0 : 1;
        return al - bl || a.name.localeCompare(b.name);
      });
      if (!options.length) {
        listEl.innerHTML = '<div class="board-empty">這台裝置沒有可用的語音</div>';
        continue;
      }
      const entries = [{ voiceURI: null, name: '自動（系統預設）', lang: '' }, ...options];
      for (const v of entries) {
        const b = document.createElement('button');
        b.className = 'type-btn voice-item' + (prefs[primary] === v.voiceURI ? ' selected' : '');
        const region = v.voiceURI === null ? '' : regionOf(v);
        b.textContent = (prefs[primary] === v.voiceURI ? '✅ ' : '') + v.name + (region ? `（${region}）` : '');
        b.addEventListener('click', () => {
          Speech.savePrefs({ [primary]: v.voiceURI });
          renderVoiceModal();
          Speech.speak(VOICE_SAMPLE[primary], primary === 'zh' ? 'zh-TW' : 'en-US'); // 點了立刻試聽（一定用裝置語音）
        });
        listEl.appendChild(b);
      }
    }
  }

  /* ===== 對戰設定 ===== */
  function openVersusSetup() {
    versusSelection = [];
    const grid = $('versus-grid');
    grid.innerHTML = '';
    for (const p of Store.getProfiles()) {
      const card = profileCard(p, { selectable: true });
      card.addEventListener('click', () => {
        Sfx.unlock(); Sfx.tap();
        if (versusSelection.includes(p.id)) {
          versusSelection = versusSelection.filter(x => x !== p.id);
          card.classList.remove('selected');
        } else {
          versusSelection.push(p.id);
          card.classList.add('selected');
        }
        $('btn-versus-start').disabled = versusSelection.length < 2;
      });
      grid.appendChild(card);
    }
    $('btn-versus-start').disabled = true;
    showScreen('screen-versus-setup');
  }

  /* ===== 選題庫與題數 ===== */
  function openSetup(mode, profileIds) {
    setup = { mode, profileIds, category: 'mixed', count: (mode === 'versus' ? VS_COUNTS : SOLO_COUNTS)[0] };
    renderSetup();
    showScreen('screen-setup');
  }

  function renderSetup() {
    const players = setup.profileIds.map(id => Store.getProfile(id)).filter(Boolean);

    const chipRow = $('setup-players');
    chipRow.innerHTML = '';
    for (const p of players) {
      const chip = document.createElement('span');
      chip.className = 'setup-player-chip';
      chip.style.setProperty('--pc', p.color);
      chip.innerHTML = `<span class="chip-avatar">${p.avatar}</span>${escapeHtml(p.name)}`;
      chipRow.appendChild(chip);
    }

    const cats = $('setup-cats');
    cats.innerHTML = '';
    const entries = [
      { key: 'mixed', emoji: '🎲', label: '綜合題' },
      ...Store.ALL_TYPES.map(t => ({
        key: t, emoji: CAT_ICONS[t] || '❓',
        label: Gen.TYPE_INFO[t].label.replace(/^\S+\s*/, ''),
      })),
    ];
    for (const c of entries) {
      const b = document.createElement('button');
      b.className = 'cat-card' + (setup.category === c.key ? ' selected' : '');
      b.innerHTML = `<span class="cat-emoji">${c.emoji}</span><span>${c.label}</span>`;
      b.addEventListener('click', () => { Sfx.tap(); setup.category = c.key; renderSetup(); });
      cats.appendChild(b);
    }

    $('setup-count-title').textContent = setup.mode === 'versus' ? '每人要答幾題？' : '要玩幾題？';
    const counts = $('setup-counts');
    counts.innerHTML = '';
    for (const n of (setup.mode === 'versus' ? VS_COUNTS : SOLO_COUNTS)) {
      const b = document.createElement('button');
      b.className = 'count-btn' + (setup.count === n ? ' selected' : '');
      b.textContent = `${n} 題`;
      b.addEventListener('click', () => { Sfx.tap(); setup.count = n; renderSetup(); });
      counts.appendChild(b);
    }
  }

  /* ===== 建立一輪 ===== */
  function beginRound() {
    if (!setup) return;
    const players = setup.profileIds.map(id => Store.getProfile(id)).filter(Boolean);
    if (!players.length) { goHome(); return; }
    const typesOverride = setup.category === 'mixed' ? null : [setup.category];

    if (setup.mode === 'solo' || players.length === 1) {
      const questions = Gen.buildRound(players[0], setup.count, new Set(), typesOverride);
      session = {
        mode: 'solo',
        players: [players[0]],
        queue: questions.map(q => ({ playerIdx: 0, question: q })),
        pos: 0,
        scores: [0],
        corrects: [0],
      };
      showScreen('screen-quiz');
      renderQuestion();
    } else {
      const used = new Set(); // 同一場不出重複題
      const perPlayer = players.map(p => Gen.buildRound(p, setup.count, used, typesOverride));
      const queue = [];
      for (let round = 0; round < setup.count; round++) {
        players.forEach((p, i) => {
          if (perPlayer[i][round]) queue.push({ playerIdx: i, question: perPlayer[i][round] });
        });
      }
      session = {
        mode: 'versus',
        players,
        queue,
        pos: 0,
        scores: players.map(() => 0),
        corrects: players.map(() => 0),
      };
      showScreen('screen-quiz');
      showTurnOverlay();
    }
  }

  /* ===== 換人過場（對戰） ===== */
  function showTurnOverlay() {
    const { playerIdx } = session.queue[session.pos];
    const p = session.players[playerIdx];
    const overlay = $('overlay-turn');
    setTheme(overlay, p.color);
    $('turn-avatar').textContent = p.avatar;
    $('turn-text').textContent = `換 ${p.name} 囉！`;
    overlay.classList.remove('hidden');
    Sfx.turn();
    stopAllAudio();
    Speech.speakSeq(nameSegments(p, '換', '囉！'));
  }

  /* ===== 出題 ===== */
  function renderQuestion() {
    const { playerIdx, question } = session.queue[session.pos];
    const p = session.players[playerIdx];
    const screen = $('screen-quiz');
    setTheme(screen, p.color);

    // 頂部資訊
    $('quiz-player-chip').querySelector('.chip-avatar').textContent = p.avatar;
    $('quiz-player-chip').querySelector('.chip-name').textContent = p.name;
    $('quiz-progress').textContent = `第 ${session.pos + 1} / ${session.queue.length} 題`;

    const scoresEl = $('quiz-scores');
    scoresEl.innerHTML = '';
    session.players.forEach((pl, i) => {
      const chip = document.createElement('span');
      chip.className = 'score-chip' + (i === playerIdx ? ' current' : '');
      chip.textContent = session.mode === 'versus'
        ? `${pl.avatar} ${session.scores[i]}`
        : `⭐ ${session.scores[i]}`;
      scoresEl.appendChild(chip);
    });

    // 圖像區
    const imgEl = $('q-image');
    imgEl.innerHTML = '';
    imgEl.classList.remove('many');
    const img = question.image;
    // 圖示很多時縮小尺寸，確保全部看得到（數數題不能有圖被裁掉）
    const itemCount = img ? (img.kind === 'grid' ? img.count : img.kind === 'mixedGrid' ? img.items.length : 0) : 0;
    if (itemCount > 12) imgEl.classList.add('many');
    if (img) {
      if (img.kind === 'emoji') {
        imgEl.textContent = img.value;
      } else if (img.kind === 'grid') {
        for (let i = 0; i < img.count; i++) {
          const s = document.createElement('span');
          s.textContent = img.emoji;
          imgEl.appendChild(s);
        }
      } else if (img.kind === 'mixedGrid') {
        for (const e of img.items) {
          const s = document.createElement('span');
          s.textContent = e;
          imgEl.appendChild(s);
        }
      } else if (img.kind === 'math') {
        const left = document.createElement('span');
        left.textContent = img.emoji.repeat(img.a);
        const op = document.createElement('span');
        op.className = 'math-op';
        op.textContent = img.op;
        const right = document.createElement('span');
        right.textContent = img.emoji.repeat(img.b);
        imgEl.append(left, op, right);
      }
    }

    // 題目文字
    $('q-prompt').textContent = question.prompt;

    // 選項
    const optsEl = $('q-options');
    optsEl.innerHTML = '';
    optsEl.classList.toggle('text-mode', question.options.some(o => o.kind === 'text'));
    question.options.forEach(opt => {
      const b = document.createElement('button');
      b.className = 'opt-btn';
      if (opt.kind === 'emoji') b.innerHTML = `<span class="opt-emoji">${opt.emoji}</span>`;
      else if (opt.kind === 'number') b.innerHTML = `<span class="opt-num">${opt.label}</span>`;
      else if (opt.kind === 'color') b.innerHTML = `<span class="opt-swatch" style="background:${opt.hex}"></span>`;
      else if (opt.kind === 'shape') b.innerHTML = opt.svg;
      else b.innerHTML = `<span class="opt-emoji">${opt.emoji}</span><span>${escapeHtml(opt.label)}</span>`;
      b.addEventListener('click', () => answer(opt, b));
      optsEl.appendChild(b);
    });

    $('feedback').classList.add('hidden');

    // 剛換題的短暫鎖定：避免按「下一題」的手指殘影誤觸同位置的選項
    optsEl.classList.add('locked');
    setTimeout(() => optsEl.classList.remove('locked'), 500);

    speakQuestion(question);
  }

  /* ===== 作答 ===== */
  function answer(opt, btn) {
    const { playerIdx, question } = session.queue[session.pos];
    const buttons = [...$('q-options').querySelectorAll('.opt-btn')];
    buttons.forEach(b => b.classList.add('disabled'));

    let fbEmoji, fbText, speechText;
    let audioPaths = null; // 有預錄音檔時優先播放
    if (opt.correct) {
      session.scores[playerIdx] += 10;
      session.corrects[playerIdx] += 1;
      btn.classList.add('correct');
      buttons.filter(b => b !== btn).forEach(b => b.classList.add('dimmed'));
      Sfx.correct();
      fbEmoji = '🎉';
      const praiseIdx = Math.floor(Math.random() * PRAISES.length);
      fbText = speechText = PRAISES[praiseIdx];
      const praisePath = `audio/common/praise-${praiseIdx}.mp3`;
      if (hasQuestionAudio(question) && AudioBank.has(praisePath)) audioPaths = [praisePath];
      $('feedback-explain').textContent = '';
    } else {
      btn.classList.add('wrong');
      const correctIdx = question.options.findIndex(o => o.correct);
      buttons[correctIdx].classList.add('correct');
      buttons.forEach((b, i) => {
        if (b !== btn && i !== correctIdx) b.classList.add('dimmed');
      });
      Sfx.wrong();
      fbEmoji = '💪';
      fbText = `正確答案是「${question.correctLabel}」`;
      speechText = `答錯了喔，正確答案是，${question.correctLabel}。${question.explanation || ''}`;
      $('feedback-explain').textContent = question.explanation || '';
      if (question.answerAudio && Speech.prefs().mode !== 'device') {
        const paths = ['audio/common/wrong-intro.mp3', question.answerAudio];
        if (question.explainAudio) paths.push(question.explainAudio);
        if (AudioBank.hasAll(paths)) audioPaths = paths;
      }
    }

    $('feedback-emoji').textContent = fbEmoji;
    $('feedback-text').textContent = fbText;
    $('btn-next').textContent = session.pos + 1 >= session.queue.length ? '看成績 🏁' : '下一題 ▶';
    $('feedback').classList.remove('hidden');
    stopAllAudio();
    if (audioPaths) {
      AudioBank.playSeq(audioPaths).then(st => { if (st === 'failed') Speech.speak(speechText, 'zh-TW'); });
    } else {
      Speech.speak(speechText, 'zh-TW');
    }
  }

  function nextQuestion() {
    stopAllAudio();
    session.pos += 1;
    if (session.pos >= session.queue.length) {
      finishRound();
    } else if (session.mode === 'versus') {
      showTurnOverlay();
    } else {
      renderQuestion();
    }
  }

  /* ===== 結果 ===== */
  function finishRound() {
    const box = $('results-box');
    box.innerHTML = '';
    const today = new Date().toISOString().slice(0, 10);

    if (session.mode === 'solo') {
      const p = session.players[0];
      const score = session.scores[0];
      const correct = session.corrects[0];
      const total = session.queue.length;
      const prevBest = Store.bestScore(p.id);
      Store.addScore(p.id, { score, correct, total, date: today });
      const isRecord = prevBest === null ? score > 0 : score > prevBest;
      const ratio = correct / total;
      const stars = ratio >= 0.9 ? '⭐⭐⭐' : ratio >= 0.6 ? '⭐⭐☆' : ratio >= 0.3 ? '⭐☆☆' : '☆☆☆';

      box.innerHTML = `
        <div class="turn-avatar" style="background:${p.color}33; margin-bottom:8px;">${p.avatar}</div>
        <div class="results-title">${escapeHtml(p.name)} 完成了！</div>
        <div class="results-stars">${stars}</div>
        <div class="results-score">${score} 分</div>
        <div class="results-sub">答對 ${correct} / ${total} 題</div>
        ${isRecord ? '<div class="new-record">🎊 新紀錄！</div>' : ''}`;

      Sfx.fanfare();
      if (ratio >= 0.6) confetti();
      stopAllAudio();
      Speech.speakSeq(nameSegments(p, '', `，你答對${correct}題，得到${score}分${isRecord ? '，是新紀錄喔' : ''}！`));
    } else {
      const ranked = session.players
        .map((p, i) => ({ p, score: session.scores[i], correct: session.corrects[i] }))
        .sort((a, b) => b.score - a.score);
      const topScore = ranked[0].score;
      const winners = ranked.filter(r => r.score === topScore);
      const isTie = winners.length > 1;

      box.innerHTML = `<div class="results-title">${isTie ? '🤝 平手！大家都好棒！' : `🏆 ${escapeHtml(winners[0].p.name)} 獲勝！`}</div>`;
      for (const r of ranked) {
        const row = document.createElement('div');
        row.className = 'vs-result-row';
        row.style.setProperty('--pc', r.p.color);
        row.innerHTML = `
          <span class="vs-crown">${!isTie && r.score === topScore ? '👑' : ''}</span>
          <span class="vs-avatar">${r.p.avatar}</span>
          <span>${escapeHtml(r.p.name)}</span>
          <span class="vs-score">${r.score} 分</span>`;
        box.appendChild(row);
      }

      Store.addBattle({
        date: today,
        players: session.players.map((p, i) => ({ id: p.id, name: p.name, avatar: p.avatar, score: session.scores[i] })),
        winner: isTie ? null : winners[0].p.name,
      });

      Sfx.fanfare();
      confetti();
      stopAllAudio();
      if (isTie) {
        const tie = 'audio/frag/tie.mp3';
        if (Speech.prefs().mode !== 'device' && AudioBank.has(tie)) AudioBank.playSeq([tie]).then(st => { if (st === 'failed') Speech.speak('平手！大家都好棒！'); });
        else Speech.speak('平手！大家都好棒！');
      }
      else Speech.speakSeq(nameSegments(winners[0].p, '恭喜', '獲勝！'));
    }

    showScreen('screen-results');
  }

  function playAgain() {
    if (!setup) { goHome(); return; }
    beginRound(); // 用同一組設定（同玩家、同題庫、同題數）再玩一輪
  }

  function confetti() {
    const pieces = ['🎉','🎊','⭐','🎈','✨'];
    for (let i = 0; i < 24; i++) {
      const el = document.createElement('div');
      el.className = 'confetti';
      el.textContent = pieces[Math.floor(Math.random() * pieces.length)];
      el.style.left = Math.random() * 100 + 'vw';
      el.style.animationDuration = 1.8 + Math.random() * 1.6 + 's';
      el.style.animationDelay = Math.random() * 0.8 + 's';
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 4500);
    }
  }

  /* ===== 排行榜 ===== */
  function renderBoard() {
    const el = $('board-content');
    el.innerHTML = '';

    // 所有玩家同榜競爭，依「一輪題數」分群（10 題榜、20 題榜、30 題榜）
    const groups = new Map();
    for (const p of Store.getProfiles()) {
      for (const s of Store.getScores(p.id)) {
        const total = s.total || 10;
        if (!groups.has(total)) groups.set(total, []);
        groups.get(total).push({ p, ...s });
      }
    }

    if (!groups.size) {
      const sec = document.createElement('section');
      sec.className = 'board-section';
      sec.innerHTML = '<h2>🏅 排行榜</h2><div class="board-empty">還沒有紀錄，快去玩一輪吧！</div>';
      el.appendChild(sec);
    }

    for (const total of [...groups.keys()].sort((a, b) => a - b)) {
      const entries = groups.get(total)
        .sort((a, b) => b.score - a.score || (b.date || '').localeCompare(a.date || ''))
        .slice(0, 10);
      const sec = document.createElement('section');
      sec.className = 'board-section';
      const rows = entries.map((s, i) => `
        <div class="board-row">
          <span class="board-rank">${['🥇','🥈','🥉'][i] || (i + 1) + '.'}</span>
          <span class="board-player" style="--pc:${s.p.color}"><span class="board-avatar">${s.p.avatar}</span>${escapeHtml(s.p.name)}</span>
          <span class="board-detail">答對 ${s.correct} / ${s.total}</span>
          <span class="board-date">${formatDate(s.date)}</span>
          <span class="board-score">${s.score} 分</span>
        </div>`).join('');
      sec.innerHTML = `<h2>🎯 ${total} 題排行榜</h2>${rows}`;
      el.appendChild(sec);
    }

    const battles = Store.getBattles().slice(0, 10);
    const sec = document.createElement('section');
    sec.className = 'board-section';
    let rows = battles.map(b => {
      const parts = b.players.map(pl => `${pl.avatar} ${escapeHtml(pl.name)} ${pl.score}分`).join('　vs　');
      return `
        <div class="board-row">
          <span>${parts}</span>
          <span class="board-date">${formatDate(b.date)}</span>
          <span class="board-score">${b.winner ? '👑 ' + escapeHtml(b.winner) : '🤝 平手'}</span>
        </div>`;
    }).join('');
    if (!rows) rows = '<div class="board-empty">還沒有對戰紀錄</div>';
    sec.innerHTML = `<h2>⚔️ 對戰紀錄</h2>${rows}`;
    el.appendChild(sec);

    showScreen('screen-board');
  }

  function formatDate(iso) {
    if (!iso) return '';
    const [, m, d] = iso.split('-');
    return `${Number(m)}/${Number(d)}`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  /* ===== 事件綁定 ===== */
  function bindEvents() {
    $('btn-versus').addEventListener('click', () => { Sfx.unlock(); openVersusSetup(); });
    $('btn-board').addEventListener('click', renderBoard);
    $('btn-voice').addEventListener('click', () => {
      Sfx.unlock();
      renderVoiceModal();
      $('modal-voice').classList.remove('hidden');
      // iOS 的語音清單常在第一次 speak 後才載入，稍後重畫一次
      setTimeout(renderVoiceModal, 600);
    });
    $('btn-voice-done').addEventListener('click', () => {
      Speech.stop();
      $('modal-voice').classList.add('hidden');
    });
    $('btn-versus-start').addEventListener('click', () => {
      if (versusSelection.length < 2) return;
      Sfx.tap();
      openSetup('versus', versusSelection.slice());
    });
    $('btn-setup-start').addEventListener('click', () => { Sfx.tap(); beginRound(); });
    document.querySelectorAll('.btn-go-home').forEach(b => b.addEventListener('click', goHome));
    document.querySelectorAll('.btn-go-board').forEach(b => b.addEventListener('click', renderBoard));

    $('btn-turn-go').addEventListener('click', () => {
      $('overlay-turn').classList.add('hidden');
      stopAllAudio(); // 名字還在唸就直接切掉，不要跟題目疊在一起
      Sfx.tap();
      renderQuestion();
    });

    $('btn-replay').addEventListener('click', () => {
      if (!session) return;
      speakQuestion(session.queue[session.pos].question);
    });

    $('btn-next').addEventListener('click', nextQuestion);

    $('btn-quit').addEventListener('click', () => $('overlay-quit').classList.remove('hidden'));
    $('btn-quit-stay').addEventListener('click', () => $('overlay-quit').classList.add('hidden'));
    $('btn-quit-leave').addEventListener('click', () => {
      $('overlay-quit').classList.add('hidden');
      goHome();
    });

    $('btn-again').addEventListener('click', playAgain);

    $('btn-edit-save').addEventListener('click', saveEdit);
    $('btn-edit-cancel').addEventListener('click', () => $('modal-edit').classList.add('hidden'));
    $('btn-edit-delete').addEventListener('click', () => {
      const p = Store.getProfile(editingId);
      if (p && window.confirm(`確定要刪除「${p.name}」嗎？成績也會一起刪除。`)) {
        Store.deleteProfile(editingId);
        $('modal-edit').classList.add('hidden');
        renderHome();
      }
    });
  }

  /* ===== 啟動 ===== */
  async function init() {
    detectFlexGap();
    $('app-version').textContent = APP_VERSION;
    bindEvents();
    try {
      const [vocab, situations] = await Promise.all([
        fetch('data/vocab.json').then(r => r.json()),
        fetch('data/situations.json').then(r => r.json()),
        AudioBank.init(), // 音檔清單載不到就全程用裝置 TTS
      ]);
      // 手機（短邊 < 600px）限制數數圖示總數，讓每個圖示維持大尺寸
      const isSmallDevice = Math.min(window.screen.width, window.screen.height) < 600;
      Gen.init(vocab, situations, { maxGridItems: isSmallDevice ? 12 : 26 });
      applyRate();
    } catch (e) {
      $('screen-loading').querySelector('.loading-box').innerHTML =
        '<div class="loading-emoji">😢</div><div>題庫載入失敗。<br>請用網頁伺服器開啟（不能直接開檔案），<br>或檢查網路後重新整理。</div>';
      return;
    }
    goHome();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* 離線快取失敗不影響遊戲 */ });
    }
  }

  init();
})();
