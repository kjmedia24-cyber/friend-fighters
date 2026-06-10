/* ============================================================
 * main — 화면 상태머신 + 고정 60fps 루프 + 픽셀 업스케일
 * 타이틀 → 모드 → 캐릭터 선택 → 스테이지 선택 → 대전 → 승리
 * ============================================================ */

(() => {
  const canvas = document.getElementById('game');
  const mctx = canvas.getContext('2d');
  const W = Stages.W, H = Stages.H;

  // 내부 저해상도 캔버스 (픽셀아트)
  const internal = document.createElement('canvas');
  internal.width = W; internal.height = H;
  const ctx = internal.getContext('2d');
  mctx.imageSmoothingEnabled = false;

  let appState = 'title';
  let t = 0;                       // 전역 애니메이션 틱
  let menu = {
    modeIdx: 0,
    c1: 0, c2: 1, selPhase: 'p1', aiRollT: 0,
    stageIdx: 0,
    mode: '2p', aiLevel: 'normal'
  };
  let matchResult = null;
  let lastSetup = null;            // 재대결용

  const MODE_OPTS = [
    { label: '2인 대전 (로컬)', mode: '2p' },
    { label: 'AI 대전 — 쉬움', mode: 'ai', level: 'easy' },
    { label: 'AI 대전 — 보통', mode: 'ai', level: 'normal' },
    { label: 'AI 대전 — 어려움', mode: 'ai', level: 'hard' }
  ];

  const confirmP1 = () => Input.consume('Enter') || Input.consume('KeyF');
  const confirmP2 = () => Input.consume('Comma');
  const back = () => Input.consume('Escape');

  /* ---------- 메뉴용 더미 파이터 (전신 미리보기) ---------- */
  function dummy(char, x, facing, state) {
    return {
      char, x, y: 0, vx: 0, vy: 0, facing,
      state: state || 'idle', stateFrame: t % 1000, animT: t,
      flashT: 0, invulnT: 0, spin: 0, moveDef: null, moveKey: null,
      opponent: null
    };
  }

  function startMatch() {
    lastSetup = {
      c1: menu.c1, c2: menu.c2, stage: STAGE_LIST[menu.stageIdx].id,
      mode: menu.mode, aiLevel: menu.aiLevel
    };
    launch(lastSetup);
  }
  function launch(s) {
    matchResult = null;
    Input.clearPressed();
    Game.start(CHARACTERS[s.c1], CHARACTERS[s.c2], s.stage, s.mode, s.aiLevel,
      res => { matchResult = res; appState = 'victory'; Input.clearPressed(); });
    appState = 'match';
  }

  /* ============ 업데이트 ============ */
  function tick() {
    t++;
    if (Input.consume('KeyM')) FX.toggleMute();

    switch (appState) {
      case 'title':
        if (confirmP1() || confirmP2()) { FX.sfx.confirm(); appState = 'mode'; Input.clearPressed(); }
        break;

      case 'mode': {
        if (Input.consume('KeyW') || Input.consume('ArrowUp')) { menu.modeIdx = (menu.modeIdx + 3) % 4; FX.sfx.select(); }
        if (Input.consume('KeyS') || Input.consume('ArrowDown')) { menu.modeIdx = (menu.modeIdx + 1) % 4; FX.sfx.select(); }
        if (confirmP1() || confirmP2()) {
          const o = MODE_OPTS[menu.modeIdx];
          menu.mode = o.mode; menu.aiLevel = o.level || 'normal';
          menu.selPhase = 'p1'; menu.aiRollT = 0;
          appState = 'charselect';
          FX.sfx.confirm(); Input.clearPressed();
        }
        if (back()) appState = 'title';
        break;
      }

      case 'charselect': {
        const n = CHARACTERS.length;
        if (menu.selPhase === 'p1') {
          if (Input.consume('KeyA')) { menu.c1 = (menu.c1 + n - 1) % n; FX.sfx.select(); }
          if (Input.consume('KeyD')) { menu.c1 = (menu.c1 + 1) % n; FX.sfx.select(); }
          if (confirmP1()) {
            FX.sfx.confirm();
            menu.selPhase = menu.mode === 'ai' ? 'airoll' : 'p2';
            menu.aiRollT = 0;
            Input.clearPressed();
          }
        } else if (menu.selPhase === 'p2') {
          if (Input.consume('ArrowLeft')) { menu.c2 = (menu.c2 + n - 1) % n; FX.sfx.select(); }
          if (Input.consume('ArrowRight')) { menu.c2 = (menu.c2 + 1) % n; FX.sfx.select(); }
          if (confirmP2() || Input.consume('Enter')) {
            FX.sfx.confirm(); appState = 'stageselect'; Input.clearPressed();
          }
        } else { // AI 랜덤 선택 연출
          menu.aiRollT++;
          if (menu.aiRollT % 6 === 0 && menu.aiRollT < 40) {
            menu.c2 = Math.floor(Math.random() * n);
            FX.sfx.select();
          }
          if (menu.aiRollT >= 55) { FX.sfx.confirm(); appState = 'stageselect'; Input.clearPressed(); }
        }
        if (back()) appState = 'mode';
        break;
      }

      case 'stageselect': {
        const ns = STAGE_LIST.length;
        if (Input.consume('KeyA') || Input.consume('ArrowLeft')) { menu.stageIdx = (menu.stageIdx + ns - 1) % ns; FX.sfx.select(); }
        if (Input.consume('KeyD') || Input.consume('ArrowRight')) { menu.stageIdx = (menu.stageIdx + 1) % ns; FX.sfx.select(); }
        if (confirmP1() || confirmP2()) { FX.sfx.confirm(); startMatch(); }
        if (back()) appState = 'charselect';
        break;
      }

      case 'match':
        Game.update();
        if (back()) { FX.setTimescale(1); appState = 'title'; }
        break;

      case 'victory':
        if (Input.consume('KeyR')) { FX.sfx.confirm(); launch(lastSetup); }
        else if (Input.consume('Enter') || confirmP2()) {
          FX.sfx.confirm(); menu.selPhase = 'p1'; appState = 'charselect'; Input.clearPressed();
        }
        else if (back()) appState = 'title';
        break;
    }
  }

  /* ============ 그리기 ============ */
  function bigTitle(y) {
    ctx.textAlign = 'center';
    const wob = Math.sin(t * 0.05) * 2;
    ctx.font = 'bold 34px monospace';
    ctx.fillStyle = '#2a0f1a';
    ctx.fillText('FRIEND FIGHTERS', W / 2 + 3, y + 3 + wob);
    const g = ctx.createLinearGradient(0, y - 28, 0, y + 6);
    g.addColorStop(0, '#ffd24a'); g.addColorStop(0.55, '#ff8c3c'); g.addColorStop(1, '#ff4d6b');
    ctx.fillStyle = g;
    ctx.fillText('FRIEND FIGHTERS', W / 2, y + wob);
  }

  function menuBg() {
    Stages.get(STAGE_LIST[(Math.floor(t / 600)) % STAGE_LIST.length].id).draw(ctx, (t * 0.3) % 180, t);
    ctx.fillStyle = 'rgba(8,6,18,0.62)';
    ctx.fillRect(0, 0, W, H);
  }

  function drawTitle() {
    menuBg();
    bigTitle(96);
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = '#ffb1c1';
    ctx.fillText('— 친구 대전 격투 —', W / 2, 116);
    // 양옆 캐릭터
    Sprites.drawFighter(ctx, dummy(CHARACTERS[0], 92, 1, 'idle'), 226);
    Sprites.drawFighter(ctx, dummy(CHARACTERS[1], W - 92, -1, 'idle'), 226);
    if (Math.floor(t / 30) % 2 === 0) {
      ctx.font = 'bold 12px monospace';
      ctx.fillStyle = '#fff';
      ctx.fillText('PRESS ENTER', W / 2, 176);
    }
    ctx.font = '8px monospace';
    ctx.fillStyle = '#8a8aa0';
    ctx.fillText('M: 음소거  |  Esc: 뒤로', W / 2, H - 8);
  }

  function drawMode() {
    menuBg();
    bigTitle(64);
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#9ecfff';
    ctx.fillText('모드 선택', W / 2, 96);
    for (let i = 0; i < MODE_OPTS.length; i++) {
      const sel = i === menu.modeIdx;
      const y = 124 + i * 24;
      if (sel) {
        ctx.fillStyle = 'rgba(255,210,74,0.16)';
        ctx.fillRect(W / 2 - 110, y - 13, 220, 19);
      }
      ctx.font = sel ? 'bold 12px monospace' : '11px monospace';
      ctx.fillStyle = sel ? '#ffd24a' : '#b9b9cc';
      ctx.fillText((sel ? '▶ ' : '') + MODE_OPTS[i].label, W / 2, y);
    }
    ctx.font = '8px monospace';
    ctx.fillStyle = '#8a8aa0';
    ctx.fillText('W/S 또는 ↑↓: 이동   Enter/F: 결정', W / 2, H - 14);
  }

  function charBox(i, x, y, w, h, cursor1, cursor2) {
    const c = CHARACTERS[i];
    ctx.fillStyle = 'rgba(14,12,30,0.9)';
    ctx.fillRect(x, y, w, h);
    let border = '#3a3a55';
    if (cursor1 && cursor2) border = '#c08aff';
    else if (cursor1) border = '#ff5b5b';
    else if (cursor2) border = '#7ee0ff';
    ctx.strokeStyle = border;
    ctx.lineWidth = cursor1 || cursor2 ? 2 : 1;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    Sprites.drawPortrait(ctx, c, x + w / 2, y + 34, 2.6);
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.fillText(c.name, x + w / 2, y + h - 22);
    ctx.font = '8px monospace';
    ctx.fillStyle = c.colors.accent;
    ctx.fillText(c.title, x + w / 2, y + h - 10);
    if (cursor1) {
      ctx.fillStyle = '#ff5b5b'; ctx.font = 'bold 9px monospace';
      ctx.fillText('1P', x + 12, y + 12);
    }
    if (cursor2) {
      ctx.fillStyle = '#7ee0ff'; ctx.font = 'bold 9px monospace';
      ctx.fillText(menu.mode === 'ai' ? 'CPU' : '2P', x + w - 16, y + 12);
    }
  }

  function drawCharSelect() {
    menuBg();
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd24a';
    ctx.fillText('캐릭터 선택', W / 2, 24);

    const bw = 92, bh = 96, gap = 14;
    const total = CHARACTERS.length * bw + (CHARACTERS.length - 1) * gap;
    const x0 = (W - total) / 2;
    for (let i = 0; i < CHARACTERS.length; i++) {
      charBox(i, x0 + i * (bw + gap), 40, bw, bh, i === menu.c1, i === menu.c2 && menu.selPhase !== 'p1');
    }
    // 전신 미리보기
    const gy = H - 18;
    Sprites.drawFighter(ctx, dummy(CHARACTERS[menu.c1], 70, 1, 'walk'), gy);
    if (menu.selPhase !== 'p1') {
      Sprites.drawFighter(ctx, dummy(CHARACTERS[menu.c2], W - 70, -1, 'walk'), gy);
    }
    // 필살기 안내
    const c1 = CHARACTERS[menu.c1];
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffb1c1';
    ctx.fillText('필살기: ' + c1.special.name + ' (↓→+강공)', 116, H - 36);
    ctx.fillStyle = '#8a8aa0';
    ctx.fillText('"' + c1.catch + '"', 116, H - 24);

    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = menu.selPhase === 'p1' ? '#ff5b5b' : '#7ee0ff';
    const msg = menu.selPhase === 'p1' ? '1P: A/D 이동, F 결정'
      : menu.selPhase === 'p2' ? '2P: ←/→ 이동, , (쉼표) 결정'
      : 'CPU 선택 중...';
    ctx.fillText(msg, W / 2, H - 6);
  }

  function drawStageSelect() {
    menuBg();
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd24a';
    ctx.fillText('스테이지 선택', W / 2, 24);
    const bw = 132, bh = 92, gap = 14;
    const x0 = (W - (bw * 3 + gap * 2)) / 2;
    for (let i = 0; i < STAGE_LIST.length; i++) {
      const x = x0 + i * (bw + gap), y = 48;
      // 미니 프리뷰 (클리핑해서 실제 스테이지 그리기)
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, bw, bh); ctx.clip();
      ctx.translate(x, y);
      ctx.scale(bw / W, bh / H);
      Stages.get(STAGE_LIST[i].id).draw(ctx, 90, t);
      ctx.restore();
      const sel = i === menu.stageIdx;
      ctx.strokeStyle = sel ? '#ffd24a' : '#3a3a55';
      ctx.lineWidth = sel ? 2 : 1;
      ctx.strokeRect(x + 1, y + 1, bw - 2, bh - 2);
      ctx.font = sel ? 'bold 10px monospace' : '9px monospace';
      ctx.fillStyle = sel ? '#ffd24a' : '#b9b9cc';
      ctx.fillText(STAGE_LIST[i].name, x + bw / 2, y + bh + 14);
      ctx.font = '8px monospace';
      ctx.fillStyle = '#8a8aa0';
      ctx.fillText(STAGE_LIST[i].desc, x + bw / 2, y + bh + 26);
    }
    ctx.font = '8px monospace';
    ctx.fillStyle = '#8a8aa0';
    ctx.fillText('A/D 또는 ←/→: 이동   Enter/F: 시작!', W / 2, H - 10);
  }

  function drawVictory() {
    menuBg();
    const r = matchResult;
    if (!r) return;
    ctx.textAlign = 'center';
    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = '#0a0a14';
    ctx.fillText('WINNER', W / 2 + 2, 44 + 2);
    ctx.fillStyle = '#ffd24a';
    ctx.fillText('WINNER', W / 2, 44);

    Sprites.drawPortrait(ctx, r.winnerChar, W / 2, 100, 4.2);
    Sprites.drawFighter(ctx, dummy(r.winnerChar, W / 2 - 130, 1, 'win'), 190);

    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = '#fff';
    ctx.fillText(r.winnerChar.name, W / 2, 152);
    ctx.font = '9px monospace';
    ctx.fillStyle = r.winnerChar.colors.accent;
    ctx.fillText(r.winnerChar.title, W / 2, 165);

    // 승리 대사
    ctx.fillStyle = 'rgba(12,12,24,0.92)';
    ctx.strokeStyle = '#ffd24a';
    const bw = 300, bx = W / 2 - bw / 2, by = 178;
    ctx.fillRect(bx, by, bw, 26);
    ctx.strokeRect(bx + 0.5, by + 0.5, bw, 26);
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#ffe9b0';
    ctx.fillText('"' + r.line + '"', W / 2, by + 17);

    ctx.font = '9px monospace';
    ctx.fillStyle = '#9ecfff';
    ctx.fillText('최대 콤보: ' + r.maxCombo + ' HIT', W / 2, 220);
    ctx.font = '9px monospace';
    ctx.fillStyle = '#b9b9cc';
    ctx.fillText('R: 재대결   Enter: 캐릭터 선택   Esc: 타이틀', W / 2, H - 16);
  }

  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    switch (appState) {
      case 'title': drawTitle(); break;
      case 'mode': drawMode(); break;
      case 'charselect': drawCharSelect(); break;
      case 'stageselect': drawStageSelect(); break;
      case 'match': Game.draw(ctx, t); break;
      case 'victory': drawVictory(); break;
    }
    mctx.imageSmoothingEnabled = false;
    mctx.clearRect(0, 0, canvas.width, canvas.height);
    mctx.drawImage(internal, 0, 0, canvas.width, canvas.height);
  }

  /* ---------- 고정 60fps 루프 (슬로우모션 = timescale) ---------- */
  let acc = 0, last = performance.now();
  function loop(now) {
    let dt = Math.min(100, now - last);
    last = now;
    const scale = appState === 'match' ? FX.timescale : 1;
    acc += dt * 0.06 * scale;          // 60fps: 16.67ms당 1틱
    let guard = 0;
    while (acc >= 1 && guard < 5) { tick(); acc -= 1; guard++; }
    if (guard >= 5) acc = 0;
    render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
