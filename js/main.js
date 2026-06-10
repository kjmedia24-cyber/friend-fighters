/* ============================================================
 * main — 화면 상태머신 + 고정 60fps 루프 + 픽셀 업스케일
 * 타이틀 → 모드 → 캐릭터 선택 → 스테이지 선택 → 대전 → 승리
 * ============================================================ */

(() => {
  const canvas = document.getElementById('game');
  const mctx = canvas.getContext('2d');
  const W = Stages.W, H = Stages.H;

  // 내부 캔버스: 논리 좌표는 480x270, 실제 픽셀은 2배(960x540)로 렌더 → 선명한 화질
  const RES = 3;   // 1440x810 — 줌인 시에도 선명
  const internal = document.createElement('canvas');
  internal.width = W * RES; internal.height = H * RES;
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
  let arcade = null;               // 아케이드 진행 상태 {queue, step}

  const MODE_OPTS = [
    { label: '2인 대전 (로컬)', mode: '2p' },
    { label: 'AI 대전 — 쉬움', mode: 'ai', level: 'easy' },
    { label: 'AI 대전 — 보통', mode: 'ai', level: 'normal' },
    { label: 'AI 대전 — 어려움', mode: 'ai', level: 'hard' },
    { label: '연습 모드 (무한 체력)', mode: 'practice' },
    { label: '아케이드 (라이벌 연전)', mode: 'arcade' }
  ];
  const NMODE = MODE_OPTS.length;

  // 결정 키: 1인 모드 = A / 2인 모드 P1 = R, P2 = U (Enter는 공용)
  const confirmP1 = () => Input.consume('Enter') ||
    (menu.mode === '2p' ? Input.consume('KeyR') : Input.consume('KeyA'));
  const confirmP2 = () => Input.consume('KeyU');
  const confirmAny = () => Input.consume('Enter') || Input.consume('KeyA') || Input.consume('KeyR');
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
    if (menu.mode === 'arcade') {
      // 아케이드: 나를 제외한 라이벌들과 연전 (보통 → 어려움)
      arcade = {
        queue: CHARACTERS.map((c, i) => i).filter(i => i !== menu.c1),
        step: 0
      };
      arcadeNext();
      return;
    }
    arcade = null;
    lastSetup = {
      c1: menu.c1, c2: menu.c2, stage: STAGE_LIST[menu.stageIdx].id,
      mode: menu.mode, aiLevel: menu.aiLevel
    };
    launch(lastSetup);
  }

  function arcadeNext() {
    matchResult = null;
    Input.clearPressed();
    const oppIdx = arcade.queue[arcade.step];
    const diff = arcade.step === 0 ? 'normal' : 'hard';
    const stageId = STAGE_LIST[(menu.stageIdx + arcade.step) % STAGE_LIST.length].id;
    Game.start(CHARACTERS[menu.c1], CHARACTERS[oppIdx], stageId, 'ai', diff,
      res => { matchResult = res; appState = 'victory'; victoryStart = t; FX.stopMusic(); Input.clearPressed(); });
    appState = 'match';
  }
  let victoryStart = 0;
  function launch(s) {
    matchResult = null;
    Input.clearPressed();
    Game.start(CHARACTERS[s.c1], CHARACTERS[s.c2], s.stage, s.mode, s.aiLevel,
      res => { matchResult = res; appState = 'victory'; victoryStart = t; FX.stopMusic(); Input.clearPressed(); });
    appState = 'match';
  }

  /* ---------- 터치 가상패드 (모바일) ---------- */
  (function setupTouch() {
    const pad = document.getElementById('touch');
    if (!pad) return;
    if (!('ontouchstart' in window)) return;   // 터치 기기에서만 표시
    pad.style.display = 'block';
    for (const el of pad.querySelectorAll('[data-key]')) {
      const codes = el.dataset.key.split(' ');
      const on = e => { e.preventDefault(); codes.forEach(Input.press); el.classList.add('on'); };
      const off = e => { e.preventDefault(); codes.forEach(Input.release); el.classList.remove('on'); };
      el.addEventListener('touchstart', on, { passive: false });
      el.addEventListener('touchend', off, { passive: false });
      el.addEventListener('touchcancel', off, { passive: false });
    }
  })();

  /* ============ 업데이트 ============ */
  function tick() {
    t++;
    if (Input.consume('KeyM')) FX.toggleMute();
    if (Input.consume('KeyB')) FX.toggleMusic();

    switch (appState) {
      case 'title':
        if (confirmAny()) { FX.sfx.confirm(); appState = 'mode'; Input.clearPressed(); }
        break;

      case 'mode': {
        if (Input.consume('KeyW') || Input.consume('ArrowUp')) { menu.modeIdx = (menu.modeIdx + NMODE - 1) % NMODE; FX.sfx.select(); }
        if (Input.consume('KeyS') || Input.consume('ArrowDown')) { menu.modeIdx = (menu.modeIdx + 1) % NMODE; FX.sfx.select(); }
        if (confirmAny()) {
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
        const solo = menu.mode !== '2p';   // AI전/연습 모두 1인 조작 (방향키 + A)
        if (menu.selPhase === 'p1') {
          const leftK = solo ? 'ArrowLeft' : 'KeyA';
          const rightK = solo ? 'ArrowRight' : 'KeyD';
          if (Input.consume(leftK)) { menu.c1 = (menu.c1 + n - 1) % n; FX.sfx.select(); }
          if (Input.consume(rightK)) { menu.c1 = (menu.c1 + 1) % n; FX.sfx.select(); }
          if (confirmP1()) {
            FX.sfx.confirm();
            if (menu.mode === 'arcade') { appState = 'stageselect'; }   // 상대는 자동 (라이벌 연전)
            else menu.selPhase = menu.mode === 'ai' ? 'airoll' : 'p2';  // 연습은 더미를 직접 고름
            menu.aiRollT = 0;
            Input.clearPressed();
          }
        } else if (menu.selPhase === 'p2') {
          if (Input.consume('ArrowLeft')) { menu.c2 = (menu.c2 + n - 1) % n; FX.sfx.select(); }
          if (Input.consume('ArrowRight')) { menu.c2 = (menu.c2 + 1) % n; FX.sfx.select(); }
          if (confirmP2() || Input.consume('Enter') ||
              (menu.mode === 'practice' && Input.consume('KeyA'))) {
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
        if (Input.consume('Enter') || Input.consume('KeyR') || Input.consume('KeyU') ||
            (menu.mode === 'ai' && Input.consume('KeyA'))) {
          FX.sfx.confirm(); startMatch();
        }
        if (back()) appState = 'charselect';
        break;
      }

      case 'match':
        Game.update();
        if (back()) { appState = 'paused'; Input.clearPressed(); }   // 일시정지
        break;

      case 'paused':
        if (Input.consume('Escape') || Input.consume('Enter')) { appState = 'match'; Input.clearPressed(); }
        else if (Input.consume('KeyQ')) { FX.setTimescale(1); FX.stopMusic(); appState = 'title'; }
        break;

      case 'victory':
        if (arcade) {
          const won = matchResult && matchResult.winnerIdx === 0;
          const last = arcade.step >= arcade.queue.length - 1;
          if (won && !last) {
            if (Input.consume('Enter') || Input.consume('KeyA')) { FX.sfx.confirm(); arcade.step++; arcadeNext(); }
          } else if (won && last) {
            if (Input.consume('Enter') || Input.consume('KeyA') || back()) { arcade = null; appState = 'title'; }
          } else {
            if (Input.consume('KeyR')) { FX.sfx.confirm(); arcadeNext(); }              // 같은 상대 재도전
            else if (Input.consume('Enter') || Input.consume('KeyA')) { arcade = null; menu.selPhase = 'p1'; appState = 'charselect'; Input.clearPressed(); }
            else if (back()) { arcade = null; appState = 'title'; }
          }
          break;
        }
        if (Input.consume('KeyR')) { FX.sfx.confirm(); launch(lastSetup); }
        else if (Input.consume('Enter') || Input.consume('KeyU') || Input.consume('KeyA')) {
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
    ctx.font = 'bold 34px Galmuri11, monospace';
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
    ctx.font = 'bold 11px Galmuri11, monospace';
    ctx.fillStyle = '#ffb1c1';
    ctx.fillText('— 친구 대전 격투 —', W / 2, 116);
    // 양옆 캐릭터
    Sprites.drawFighter(ctx, dummy(CHARACTERS[0], 92, 1, 'idle'), Stages.GROUND_Y);
    Sprites.drawFighter(ctx, dummy(CHARACTERS[1], W - 92, -1, 'idle'), Stages.GROUND_Y);
    if (Math.floor(t / 30) % 2 === 0) {
      ctx.font = 'bold 12px Galmuri11, monospace';
      ctx.fillStyle = '#fff';
      ctx.fillText('PRESS ENTER', W / 2, 176);
    }
    ctx.font = '8px Galmuri11, monospace';
    ctx.fillStyle = '#8a8aa0';
    ctx.fillText('M: 음소거  |  Esc: 뒤로', W / 2, H - 8);
  }

  function drawMode() {
    menuBg();
    bigTitle(64);
    ctx.font = 'bold 12px Galmuri11, monospace';
    ctx.fillStyle = '#9ecfff';
    ctx.fillText('모드 선택', W / 2, 96);
    for (let i = 0; i < MODE_OPTS.length; i++) {
      const sel = i === menu.modeIdx;
      const y = 124 + i * 24;
      if (sel) {
        ctx.fillStyle = 'rgba(255,210,74,0.16)';
        ctx.fillRect(W / 2 - 110, y - 13, 220, 19);
      }
      ctx.font = sel ? 'bold 12px Galmuri11, monospace' : '11px Galmuri11, monospace';
      ctx.fillStyle = sel ? '#ffd24a' : '#b9b9cc';
      ctx.fillText((sel ? '▶ ' : '') + MODE_OPTS[i].label, W / 2, y);
    }
    ctx.font = '8px Galmuri11, monospace';
    ctx.fillStyle = '#8a8aa0';
    ctx.fillText('W/S 또는 ↑↓: 이동   Enter: 결정', W / 2, H - 14);
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
    ctx.font = 'bold 10px Galmuri11, monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.fillText(c.name, x + w / 2, y + h - 22);
    ctx.font = '8px Galmuri11, monospace';
    ctx.fillStyle = c.colors.accent;
    ctx.fillText(c.title, x + w / 2, y + h - 10);
    if (cursor1) {
      ctx.fillStyle = '#ff5b5b'; ctx.font = 'bold 9px Galmuri11, monospace';
      ctx.fillText('1P', x + 12, y + 12);
    }
    if (cursor2) {
      ctx.fillStyle = '#7ee0ff'; ctx.font = 'bold 9px Galmuri11, monospace';
      ctx.fillText(menu.mode === 'ai' ? 'CPU' : '2P', x + w - 16, y + 12);
    }
  }

  function drawCharSelect() {
    menuBg();
    ctx.font = 'bold 14px Galmuri11, monospace';
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
    const gy = Stages.GROUND_Y;   // 배경 지면 위에 정확히 서기
    Sprites.drawFighter(ctx, dummy(CHARACTERS[menu.c1], 70, 1, 'walk'), gy);
    if (menu.selPhase !== 'p1') {
      Sprites.drawFighter(ctx, dummy(CHARACTERS[menu.c2], W - 70, -1, 'walk'), gy);
    }
    // 기술 안내
    const c1 = CHARACTERS[menu.c1];
    const ARCH_LABEL = { grappler: '파워 그래플러', trickster: '리치 트릭스터', balance: '밸런스 콤보형' };
    ctx.font = '9px Galmuri11, monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = c1.colors.accent;
    ctx.fillText('[' + (ARCH_LABEL[c1.archetype] || '') + ']', 116, H - 46);
    ctx.fillStyle = '#ffb1c1';
    ctx.fillText('↓→+펀치: ' + c1.special.name, 116, H - 35);
    ctx.fillText(c1.special2 ? '↓←+펀치: ' + c1.special2.name : '↓→+킥: 띄우기', 116, H - 24);
    ctx.fillStyle = '#8a8aa0';
    ctx.fillText('"' + c1.catch + '"', 222, H - 35);
    if (c1.awaken) {
      ctx.fillStyle = '#ffd24a';
      ctx.fillText('각성: 체력 30%↓', 222, H - 24);
    }
    // 연속기 목록 (솔로 키 기준: A/S/Z/X)
    if (c1.strings) {
      const KEYN = { lp: 'A', rp: 'S', lk: 'Z', rk: 'X' };
      ctx.font = '7px Galmuri11, monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#7ee0ff';
      ctx.fillText('[연속기]', 334, H - 56);
      c1.strings.slice(0, 5).forEach((s, i) => {
        ctx.fillStyle = '#b9c4d6';
        ctx.fillText(s.steps.map(st => KEYN[st.btn]).join('-') + '  ' + s.name, 334, H - 46 + i * 9);
      });
    }

    ctx.font = '8px Galmuri11, monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = menu.selPhase === 'p1' ? '#ff5b5b' : '#7ee0ff';
    const msg = menu.selPhase === 'p1'
      ? (menu.mode === 'ai' ? '←/→ 이동, A 또는 Enter 결정' : '1P: A/D 이동, R 또는 Enter 결정')
      : menu.selPhase === 'p2' ? '2P: ←/→ 이동, U 결정'
      : 'CPU 선택 중...';
    ctx.fillText(msg, W / 2, H - 6);
  }

  function drawStageSelect() {
    menuBg();
    ctx.font = 'bold 14px Galmuri11, monospace';
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
      ctx.font = sel ? 'bold 10px Galmuri11, monospace' : '9px Galmuri11, monospace';
      ctx.fillStyle = sel ? '#ffd24a' : '#b9b9cc';
      ctx.fillText(STAGE_LIST[i].name, x + bw / 2, y + bh + 14);
      ctx.font = '8px Galmuri11, monospace';
      ctx.fillStyle = '#8a8aa0';
      ctx.fillText(STAGE_LIST[i].desc, x + bw / 2, y + bh + 26);
    }
    ctx.font = '8px Galmuri11, monospace';
    ctx.fillStyle = '#8a8aa0';
    ctx.fillText('A/D 또는 ←/→: 이동   Enter: 시작!', W / 2, H - 10);
  }

  function drawVictory() {
    menuBg();
    const r = matchResult;
    if (!r) return;
    ctx.textAlign = 'center';
    ctx.font = 'bold 22px Galmuri11, monospace';
    ctx.fillStyle = '#0a0a14';
    ctx.fillText('WINNER', W / 2 + 2, 44 + 2);
    ctx.fillStyle = '#ffd24a';
    ctx.fillText('WINNER', W / 2, 44);

    Sprites.drawPortrait(ctx, r.winnerChar, W / 2, 100, 4.2);
    Sprites.drawFighter(ctx, dummy(r.winnerChar, W / 2 - 130, 1, 'win'), Stages.GROUND_Y);

    ctx.font = 'bold 14px Galmuri11, monospace';
    ctx.fillStyle = '#fff';
    ctx.fillText(r.winnerChar.name, W / 2, 152);
    ctx.font = '9px Galmuri11, monospace';
    ctx.fillStyle = r.winnerChar.colors.accent;
    ctx.fillText(r.winnerChar.title, W / 2, 165);

    // 승리 대사 (배열이면 순차 출력: "ㅋㅋ" → "ㅋㅋ" → ... → "연습하라고")
    let lineText;
    if (Array.isArray(r.line)) {
      const reveal = Math.min(r.line.length, Math.floor((t - victoryStart) / 18) + 1);
      lineText = r.line.slice(0, reveal).join(' ');
    } else {
      lineText = r.line;
    }
    ctx.fillStyle = 'rgba(12,12,24,0.92)';
    ctx.strokeStyle = '#ffd24a';
    const bw = 300, bx = W / 2 - bw / 2, by = 178;
    ctx.fillRect(bx, by, bw, 26);
    ctx.strokeRect(bx + 0.5, by + 0.5, bw, 26);
    ctx.font = '10px Galmuri11, sans-serif';
    ctx.fillStyle = '#ffe9b0';
    ctx.fillText('"' + lineText + '"', W / 2, by + 17);

    // 패자의 한 마디
    if (r.loseLine) {
      ctx.font = '9px Galmuri11, sans-serif';
      ctx.fillStyle = '#7a7a92';
      ctx.fillText(r.loserChar.name + ': "' + r.loseLine + '"', W / 2, by + 38);
    }
    ctx.font = '9px Galmuri11, monospace';
    ctx.fillStyle = '#9ecfff';
    ctx.fillText('최대 콤보: ' + r.maxCombo + ' HIT', W / 2, by + 52);

    ctx.font = '9px Galmuri11, monospace';
    if (arcade) {
      const won = r.winnerIdx === 0;
      const last = arcade.step >= arcade.queue.length - 1;
      if (won && !last) {
        const next = CHARACTERS[arcade.queue[arcade.step + 1]];
        ctx.fillStyle = '#ffd24a';
        ctx.font = 'bold 11px Galmuri11, monospace';
        ctx.fillText('NEXT ▶ ' + next.name + ' — ' + next.title, W / 2, H - 30);
        ctx.font = '9px Galmuri11, monospace';
        ctx.fillStyle = '#b9b9cc';
        ctx.fillText('Enter: 다음 대전   Esc: 타이틀', W / 2, H - 14);
      } else if (won && last) {
        // 아케이드 클리어 + 엔딩
        ctx.font = 'bold 16px Galmuri11, monospace';
        ctx.fillStyle = '#0a0a14';
        ctx.fillText('★ ARCADE CLEAR! ★', W / 2 + 1, H - 41);
        ctx.fillStyle = '#ffd24a';
        ctx.fillText('★ ARCADE CLEAR! ★', W / 2, H - 42);
        const end = r.winnerChar.ending || '';
        ctx.font = '9px Galmuri11, sans-serif';
        ctx.fillStyle = '#ffe9b0';
        if (end.length > 36) {
          ctx.fillText(end.slice(0, 36), W / 2, H - 28);
          ctx.fillText(end.slice(36), W / 2, H - 17);
        } else {
          ctx.fillText(end, W / 2, H - 24);
        }
        ctx.fillStyle = '#b9b9cc';
        ctx.fillText('Enter: 타이틀', W / 2, H - 5);
      } else {
        ctx.font = 'bold 13px Galmuri11, monospace';
        ctx.fillStyle = '#ff5b5b';
        ctx.fillText('패배...', W / 2, H - 28);
        ctx.font = '9px Galmuri11, monospace';
        ctx.fillStyle = '#b9b9cc';
        ctx.fillText('R: 재도전   Enter: 캐릭터 선택   Esc: 타이틀', W / 2, H - 14);
      }
    } else {
      ctx.fillStyle = '#b9b9cc';
      ctx.fillText('R: 재대결   Enter: 캐릭터 선택   Esc: 타이틀', W / 2, H - 16);
    }
  }

  function render() {
    ctx.setTransform(RES, 0, 0, RES, 0, 0);
    ctx.clearRect(0, 0, W, H);
    switch (appState) {
      case 'title': drawTitle(); break;
      case 'mode': drawMode(); break;
      case 'charselect': drawCharSelect(); break;
      case 'stageselect': drawStageSelect(); break;
      case 'match': Game.draw(ctx, t); break;
      case 'paused': {
        Game.draw(ctx, t);
        ctx.fillStyle = 'rgba(5,4,14,0.62)';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.font = 'bold 22px Galmuri11, monospace';
        ctx.fillStyle = '#ffd24a';
        ctx.fillText('일시정지', W / 2, H / 2 - 14);
        ctx.font = '10px Galmuri11, monospace';
        ctx.fillStyle = '#cfd6e6';
        ctx.fillText('Esc/Enter: 계속   Q: 타이틀로', W / 2, H / 2 + 10);
        break;
      }
      case 'victory': drawVictory(); break;
    }
    drawOverlay();
    mctx.imageSmoothingEnabled = false;
    mctx.clearRect(0, 0, canvas.width, canvas.height);
    mctx.drawImage(internal, 0, 0, canvas.width, canvas.height);
  }

  /* ---------- 시네마틱 오버레이: 비네팅 + 필름 그레인 ---------- */
  let vign = null, noiseCv;
  function drawOverlay() {
    if (!vign) {
      vign = ctx.createRadialGradient(W / 2, H / 2 + 12, H * 0.52, W / 2, H / 2, H * 1.08);
      if (vign && vign.addColorStop) {
        vign.addColorStop(0, 'rgba(0,0,0,0)');
        vign.addColorStop(1, 'rgba(8,5,18,0.48)');
      }
    }
    if (vign) { ctx.fillStyle = vign; ctx.fillRect(0, 0, W, H); }
    if (noiseCv === undefined) {
      try {
        noiseCv = document.createElement('canvas');
        noiseCv.width = 160; noiseCv.height = 160;
        const nc = noiseCv.getContext('2d');
        const id = nc.createImageData(160, 160);
        for (let i = 0; i < id.data.length; i += 4) {
          const v = (Math.random() * 255) | 0;
          id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
          id.data[i + 3] = 255;
        }
        nc.putImageData(id, 0, 0);
      } catch (e) { noiseCv = null; }
    }
    if (noiseCv) {
      ctx.globalAlpha = 0.035;
      const ox = (Math.random() * 160) | 0, oy = (Math.random() * 160) | 0;
      for (let x = -ox; x < W; x += 160) {
        for (let y = -oy; y < H; y += 160) ctx.drawImage(noiseCv, x, y);
      }
      ctx.globalAlpha = 1;
    }
  }

  // 한글 픽셀 폰트 프리로드
  try {
    if (document.fonts && document.fonts.load) {
      document.fonts.load('bold 16px Galmuri11');
      document.fonts.load('16px Galmuri11');
    }
  } catch (e) { /* 폰트 없으면 monospace 폴백 */ }

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
