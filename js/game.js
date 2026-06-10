/* ============================================================
 * Game — 매치 진행 (라운드, 카메라/줌, KO 슬로우모션, HUD, 대사)
 * ============================================================ */

const Game = (() => {
  const W = Stages.W, H = Stages.H, GY = Stages.GROUND_Y;
  const ROUND_TIME = 60 * 60;     // 60초
  const WINS_NEEDED = 2;

  let stage = null;
  let fighters = [null, null];
  let dispHp = [1, 1];            // 데미지 트레일용 표시 체력
  let phase = 'intro';
  let phaseT = 0;
  let round = 1;
  let wins = [0, 0];
  let timer = ROUND_TIME;
  let mode = '2p';
  let introStep = 0;
  let introLines = ['', ''];
  let koVictimIdx = -1;
  let roundWinnerIdx = -1;
  let result = null;              // 매치 종료 결과
  let onMatchEnd = null;
  let cam = { x: 0, zoom: 1, zx: W / 2, zy: H / 2 };

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function lineFor(c, opp, kind) {
    if (c.rivals && c.rivals[opp.id] && c.rivals[opp.id][kind]) return c.rivals[opp.id][kind];
    return pick(c.quotes[kind]);
  }

  function start(charA, charB, stageId, vsMode, aiLevel, endCallback) {
    stage = Stages.get(stageId);
    mode = vsMode;
    onMatchEnd = endCallback;
    round = 1; wins = [0, 0]; result = null;

    const fA = new Fighter(charA, 0);
    const fB = new Fighter(charB, 1);
    fA.opponent = fB; fB.opponent = fA;
    fA.controller = new Input.KeyboardController(0);
    if (vsMode === 'ai') {
      const ai = new AIController(aiLevel);
      ai.attach(fB, fA);
      fB.controller = ai;
    } else {
      fB.controller = new Input.KeyboardController(1);
    }
    fighters = [fA, fB];

    introLines = [lineFor(charA, charB, 'intro'), lineFor(charB, charA, 'intro')];
    startRound(true);
  }

  function startRound(withIntro) {
    const cx = stage.width / 2;
    fighters[0].reset(cx - 58, 1);
    fighters[1].reset(cx + 58, -1);
    dispHp = [1, 1];
    timer = ROUND_TIME;
    koVictimIdx = -1; roundWinnerIdx = -1;
    FX.reset();
    phase = withIntro ? 'intro' : 'round';
    phaseT = 0;
    introStep = 0;
    fighters[0].setState(withIntro ? 'intro' : 'idle');
    fighters[1].setState(withIntro ? 'intro' : 'idle');
    cam.zoom = 1;
  }

  /* ---------- 업데이트 (게임 틱) ---------- */
  function update() {
    phaseT++;
    FX.update();

    const [f1, f2] = fighters;

    switch (phase) {
      case 'intro': {
        // 등장 대사: 키 입력으로 스킵
        if (phaseT > 10 && Input.anyPressed()) {
          Input.clearPressed();
          introStep++;
          phaseT = 1;
        }
        if (phaseT > 150) { introStep++; phaseT = 1; }
        if (introStep >= 2) {
          phase = 'round'; phaseT = 0;
          FX.sfx.round();
        }
        break;
      }
      case 'round':
        if (phaseT >= 55) {
          phase = 'fight'; phaseT = 0;
          f1.setState('idle'); f2.setState('idle');
          FX.sfx.confirm();
        }
        break;

      case 'fight': {
        if (FX.tickHitstop()) break;     // 히트스톱: 정지 프레임
        timer--;
        f1.update(stage, true);
        f2.update(stage, true);
        bodyPush(f1, f2);

        // KO 체크
        if (f1.dead || f2.dead) {
          koVictimIdx = f1.dead ? 0 : 1;
          if (f1.dead && f2.dead) koVictimIdx = dispHp[0] < dispHp[1] ? 0 : 1;
          phase = 'ko'; phaseT = 0;
          const vic = fighters[koVictimIdx];
          FX.setTimescale(0.22);          // 슬로우모션
          FX.koBurst(vic.x, GY - vic.y - 24);
          FX.sfx.ko();
          break;
        }
        // 타임 오버
        if (timer <= 0) {
          const r1 = f1.hp / f1.maxHp, r2 = f2.hp / f2.maxHp;
          roundWinnerIdx = r1 === r2 ? -1 : (r1 > r2 ? 0 : 1);
          if (roundWinnerIdx >= 0) wins[roundWinnerIdx]++;
          enterRoundEnd();
        }
        break;
      }

      case 'ko': {
        // 슬로우모션 + 줌인 (패자가 날아가 떨어질 때까지)
        f1.update(stage, false);
        f2.update(stage, false);
        if (phaseT === 30) FX.setTimescale(0.55);
        if (phaseT >= 46) {
          FX.setTimescale(1);
          roundWinnerIdx = 1 - koVictimIdx;
          if (!(f1.dead && f2.dead)) wins[roundWinnerIdx]++;
          const vic = fighters[koVictimIdx];
          vic.setState(vic.isGrounded() ? 'ko' : 'launched');
          vic.dead = true;
          enterRoundEnd();
        }
        break;
      }

      case 'roundend': {
        f1.update(stage, false);
        f2.update(stage, false);
        // 패자 눕히기
        for (const f of fighters) {
          if (f.dead && f.state === 'knockdown') f.setState('ko');
        }
        if (phaseT === 50 && roundWinnerIdx >= 0) {
          fighters[roundWinnerIdx].setState('win');
        }
        if (phaseT >= 150) {
          if (wins[0] >= WINS_NEEDED || wins[1] >= WINS_NEEDED) {
            const wIdx = wins[0] >= WINS_NEEDED ? 0 : 1;
            const wc = fighters[wIdx].char, lc = fighters[1 - wIdx].char;
            result = {
              winnerIdx: wIdx, winnerChar: wc, loserChar: lc,
              line: lineFor(wc, lc, 'win'),
              maxCombo: Math.max(fighters[0].maxCombo, fighters[1].maxCombo)
            };
            phase = 'done';
            if (onMatchEnd) onMatchEnd(result);
          } else {
            round++;
            startRound(false);
          }
        }
        break;
      }
    }

    updateCamera();
  }

  function enterRoundEnd() {
    phase = 'roundend'; phaseT = 0;
    FX.setTimescale(1);
  }

  /* ---------- 몸통 밀기 ---------- */
  function bodyPush(a, b) {
    const dx = b.x - a.x;
    if (Math.abs(dx) < 14 && Math.abs(a.y - b.y) < 30 &&
        !['knockdown', 'ko', 'grabbed', 'grabbing'].includes(a.state) &&
        !['knockdown', 'ko', 'grabbed', 'grabbing'].includes(b.state)) {
      const push = (14 - Math.abs(dx)) / 2;
      const dir = dx === 0 ? (a.playerIndex === 0 ? -1 : 1) : Math.sign(dx);
      const minX = stage.wallL + 9, maxX = stage.wallR - 9;
      a.x = Math.max(minX, Math.min(maxX, a.x - dir * push));
      b.x = Math.max(minX, Math.min(maxX, b.x + dir * push));
    }
  }

  /* ---------- 카메라 ---------- */
  function updateCamera() {
    const [f1, f2] = fighters;
    const mid = (f1.x + f2.x) / 2;
    const targetX = Math.max(0, Math.min(stage.width - W, mid - W / 2));
    cam.x += (targetX - cam.x) * 0.12;

    let targetZoom = 1, zx = W / 2, zy = H / 2;
    if (phase === 'ko' || (phase === 'roundend' && phaseT < 40 && koVictimIdx >= 0)) {
      const vic = fighters[koVictimIdx];
      targetZoom = 1.65;
      zx = Math.max(60, Math.min(W - 60, vic.x - cam.x));
      zy = Math.max(50, Math.min(H - 50, GY - vic.y - 22));
    }
    cam.zoom += (targetZoom - cam.zoom) * 0.1;
    cam.zx += (zx - cam.zx) * 0.15;
    cam.zy += (zy - cam.zy) * 0.15;
  }

  /* ---------- 그리기 ---------- */
  function draw(ctx, t) {
    const [sx, sy] = FX.getShake();

    ctx.save();
    // KO 줌 (2.5D 연출: 화면 전체를 패자 중심으로 줌)
    if (cam.zoom > 1.005) {
      ctx.translate(cam.zx, cam.zy);
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(-cam.zx, -cam.zy);
    }
    ctx.translate(Math.round(sx), Math.round(sy));

    // 배경 (패럴랙스)
    stage.draw(ctx, cam.x, t);

    // 월드 (파이터 + 이펙트)
    ctx.save();
    ctx.translate(-Math.round(cam.x), 0);
    // 뒤에 있는(맞고 있는) 쪽 먼저
    const order = fighters[0].y > fighters[1].y ? [1, 0] : [0, 1];
    for (const i of order) Sprites.drawFighter(ctx, fighters[i], GY);
    FX.drawWorld(ctx);
    ctx.restore();

    ctx.restore();

    // HUD / 연출 텍스트 (인트로는 시네마틱 — HUD 숨김)
    if (phase !== 'intro') drawHUD(ctx);
    drawPhaseOverlay(ctx);
    FX.drawScreen(ctx, W, H);
  }

  /* ---------- HUD ---------- */
  function drawHUD(ctx) {
    const [f1, f2] = fighters;
    // 표시 체력 이징 (데미지 트레일)
    dispHp[0] += (f1.hp / f1.maxHp - dispHp[0]) * 0.06;
    dispHp[1] += (f2.hp / f2.maxHp - dispHp[1]) * 0.06;

    const barW = 178, barH = 9, y = 12;
    for (let i = 0; i < 2; i++) {
      const f = fighters[i];
      const hpRatio = Math.max(0, f.hp / f.maxHp);
      const trail = Math.max(hpRatio, dispHp[i]);
      const x = i === 0 ? 14 : W - 14 - barW;
      // 프레임
      ctx.fillStyle = '#10101c';
      ctx.fillRect(x - 2, y - 2, barW + 4, barH + 4);
      // 트레일 (빨강)
      ctx.fillStyle = '#a92433';
      const tw = barW * trail;
      ctx.fillRect(i === 0 ? x + barW - tw : x, y, tw, barH);
      // 체력 (노랑→초록)
      const hw = barW * hpRatio;
      ctx.fillStyle = hpRatio > 0.5 ? '#ffd24a' : hpRatio > 0.25 ? '#ff9636' : '#ff4d4d';
      ctx.fillRect(i === 0 ? x + barW - hw : x, y, hw, barH);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(i === 0 ? x + barW - hw : x, y, hw, 2);
      // 이름
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = i === 0 ? 'left' : 'right';
      ctx.fillStyle = '#0a0a14';
      ctx.fillText(f.char.name, (i === 0 ? x + 1 : x + barW - 1) + 1, y + barH + 11);
      ctx.fillStyle = '#fff';
      ctx.fillText(f.char.name, i === 0 ? x + 1 : x + barW - 1, y + barH + 10);
      // 승리 표시 (라운드 pip)
      for (let p = 0; p < WINS_NEEDED; p++) {
        const px = i === 0 ? x + 50 + p * 10 : x + barW - 50 - p * 10;
        ctx.fillStyle = p < wins[i] ? '#ffd24a' : 'rgba(255,255,255,0.25)';
        ctx.beginPath();
        ctx.arc(px, y + barH + 8, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      // 콤보 카운터 (상대에게 넣는 중인 콤보)
      const oppCombo = fighters[1 - i].comboTaken;
      if (oppCombo >= 2 && phase === 'fight') {
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = i === 0 ? 'left' : 'right';
        ctx.fillStyle = '#0a0a14';
        ctx.fillText(oppCombo + ' COMBO', (i === 0 ? 16 : W - 16) + 1, 57);
        ctx.fillStyle = oppCombo >= 5 ? '#ff7a3c' : '#ffd24a';
        ctx.fillText(oppCombo + ' COMBO', i === 0 ? 16 : W - 16, 56);
      }
    }
    // 타이머
    const sec = Math.max(0, Math.ceil(timer / 60));
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#0a0a14';
    ctx.fillText(String(sec), W / 2 + 1, 25);
    ctx.fillStyle = sec <= 10 ? '#ff5b5b' : '#fff';
    ctx.fillText(String(sec), W / 2, 24);
    // 라운드 표시
    ctx.font = '8px monospace';
    ctx.fillStyle = '#9a9ab2';
    ctx.fillText('ROUND ' + round, W / 2, 34);
  }

  /* ---------- 단계별 오버레이 ---------- */
  function bigText(ctx, str, y, color, size) {
    ctx.font = 'bold ' + (size || 28) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#0a0a14';
    ctx.fillText(str, W / 2 + 2, y + 2);
    ctx.fillStyle = color;
    ctx.fillText(str, W / 2, y);
  }

  function speechBubble(ctx, x, y, w, text, align) {
    ctx.fillStyle = 'rgba(12,12,24,0.92)';
    ctx.strokeStyle = '#ffd24a';
    ctx.lineWidth = 1;
    const h = 30;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    // 2줄 줄바꿈
    const max = Math.floor((w - 12) / 9);
    if (text.length > max) {
      ctx.fillText(text.slice(0, max), x + 6, y + 12);
      ctx.fillText(text.slice(max), x + 6, y + 24);
    } else {
      ctx.fillText(text, x + 6, y + 18);
    }
  }

  function drawPhaseOverlay(ctx) {
    const [f1, f2] = fighters;
    if (phase === 'intro') {
      // 시네마 레터박스
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, W, 36);
      ctx.fillRect(0, H - 50, W, 50);
      bigText(ctx, 'VS', 70, '#ff5b5b', 22);
      const speaking = introStep === 0 ? 0 : 1;
      const ch = fighters[speaking].char;
      const px = speaking === 0 ? 40 : W - 40;
      Sprites.drawPortrait(ctx, ch, px, H - 26, 1.6, speaking === 1);
      speechBubble(ctx, speaking === 0 ? 64 : W - 64 - 230, H - 42, 230, introLines[speaking]);
      ctx.font = '8px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#8a8aa0';
      ctx.fillText('아무 키나 눌러 스킵', W / 2, H - 4);
      // 이름 표시
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffd24a';
      ctx.fillText(f1.char.name + ' — ' + f1.char.title, 14, 14);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#7ee0ff';
      ctx.fillText(f2.char.name + ' — ' + f2.char.title, W - 14, 26);
    } else if (phase === 'round') {
      const a = Math.min(1, phaseT / 10);
      ctx.globalAlpha = a;
      bigText(ctx, 'ROUND ' + round, H / 2 - 10, '#ffd24a');
      if (phaseT > 30) bigText(ctx, 'FIGHT!', H / 2 + 24, '#ff5b5b', 20);
      ctx.globalAlpha = 1;
    } else if (phase === 'fight' && phaseT < 28) {
      ctx.globalAlpha = 1 - phaseT / 28;
      bigText(ctx, 'FIGHT!', H / 2 - 6, '#ff5b5b', 30);
      ctx.globalAlpha = 1;
    } else if (phase === 'ko') {
      if (phaseT > 4) {
        const sc = Math.min(1, (phaseT - 4) / 8);
        bigText(ctx, 'K.O.', H / 2 - 8, '#ff3c3c', Math.round(46 * sc));
      }
    } else if (phase === 'roundend') {
      if (timer <= 0 && roundWinnerIdx === -1) {
        bigText(ctx, 'DRAW', H / 2 - 8, '#9ecfff');
      } else if (timer <= 0 && phaseT < 60) {
        bigText(ctx, 'TIME OVER', H / 2 - 8, '#9ecfff');
      } else if (roundWinnerIdx >= 0 && phaseT >= 50) {
        bigText(ctx, fighters[roundWinnerIdx].char.name + ' 승리!', H / 2 - 20, '#ffd24a', 20);
      }
    }
  }

  return {
    start, update, draw,
    get stage() { return stage; },
    get phase() { return phase; },
    get result() { return result; },
    get fighters() { return fighters; }
  };
})();
