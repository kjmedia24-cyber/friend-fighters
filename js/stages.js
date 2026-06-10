/* ============================================================
 * 스테이지 — 절차 생성 패럴랙스 배경 3종 + 좌우 벽
 * 내부 해상도 480x270, 지면 y = 232
 * ============================================================ */

const Stages = (() => {
  const W = 480, H = 270, GROUND_Y = 232;
  const STAGE_W = 660;             // 월드 폭
  const WALL_L = 26, WALL_R = STAGE_W - 26;

  // 시드 난수 (배경 요소 배치 고정용)
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function grad(ctx, stops, y0, y1) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    for (const [p, c] of stops) g.addColorStop(p, c);
    return g;
  }

  /* ---------- 1. 노을 옥상 ---------- */
  function drawRooftop(ctx, camX, t) {
    // 하늘
    ctx.fillStyle = grad(ctx, [[0, '#2c1b4d'], [0.45, '#b34a5e'], [0.8, '#ff9e54'], [1, '#ffd28a']], 0, GROUND_Y);
    ctx.fillRect(0, 0, W, GROUND_Y);
    // 태양
    ctx.fillStyle = '#ffe9b0';
    ctx.beginPath(); ctx.arc(330 - camX * 0.05, 150, 26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffb35e';
    ctx.beginPath(); ctx.arc(330 - camX * 0.05, 150, 20, 0, Math.PI * 2); ctx.fill();
    // 구름
    const r1 = rng(7);
    ctx.fillStyle = 'rgba(255,180,140,0.5)';
    for (let i = 0; i < 6; i++) {
      const cx = ((r1() * 700 - camX * 0.1 + t * 0.04 + i * 120) % 700) - 60;
      const cy = 40 + r1() * 70;
      ctx.fillRect(cx, cy, 50 + r1() * 40, 6);
      ctx.fillRect(cx + 10, cy - 4, 30, 4);
    }
    // 원경 빌딩
    const r2 = rng(42);
    ctx.fillStyle = '#4a2b50';
    for (let i = 0; i < 16; i++) {
      const bw = 30 + r2() * 40, bh = 50 + r2() * 80;
      const bx = i * 46 - camX * 0.18 - 20;
      ctx.fillRect(bx, GROUND_Y - bh - 28, bw, bh + 28);
    }
    // 중경 빌딩 + 불 켜진 창
    const r3 = rng(99);
    for (let i = 0; i < 10; i++) {
      const bw = 50 + r3() * 50, bh = 70 + r3() * 70;
      const bx = i * 78 - camX * 0.45 - 30;
      ctx.fillStyle = '#33203f';
      ctx.fillRect(bx, GROUND_Y - bh - 10, bw, bh + 10);
      ctx.fillStyle = '#ffca7a';
      for (let wy = 0; wy < bh - 14; wy += 9) {
        for (let wx = 4; wx < bw - 6; wx += 8) {
          if (r3() < 0.4) ctx.fillRect(bx + wx, GROUND_Y - bh - 4 + wy, 4, 5);
        }
      }
    }
    // 옥상 바닥
    ctx.fillStyle = '#5a4a52';
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ctx.fillStyle = '#6b5a60';
    ctx.fillRect(0, GROUND_Y, W, 3);
    ctx.fillStyle = '#4a3c46';
    for (let i = 0; i < 14; i++) {
      const lx = ((i * 60 - camX) % (STAGE_W + 60) + STAGE_W + 60) % (STAGE_W + 60) - 30;
      ctx.fillRect(lx, GROUND_Y + 4, 2, H - GROUND_Y);
    }
    // 옥상 구조물 (실루엣 소품, 월드 고정)
    const props = [[60, 18, 26], [560, 22, 30], [300, 10, 16]];
    for (const [px, ph, pw] of props) {
      const sx = px - camX;
      ctx.fillStyle = '#3c3038';
      ctx.fillRect(sx, GROUND_Y - ph, pw, ph);
      ctx.fillStyle = '#564650';
      ctx.fillRect(sx + 2, GROUND_Y - ph + 2, pw - 4, 3);
    }
    drawWalls(ctx, camX, '#3c3038', '#7a6a70');
  }

  /* ---------- 2. 네온 거리 ---------- */
  function drawNeon(ctx, camX, t) {
    ctx.fillStyle = grad(ctx, [[0, '#06060f'], [0.6, '#101230'], [1, '#1c1440']], 0, GROUND_Y);
    ctx.fillRect(0, 0, W, GROUND_Y);
    // 별
    const r1 = rng(11);
    ctx.fillStyle = '#cfd8ff';
    for (let i = 0; i < 40; i++) {
      const sx = (r1() * 700 - camX * 0.05) % 700;
      const sy = r1() * 120;
      if (r1() < 0.8 || Math.sin(t * 0.05 + i) > 0) ctx.fillRect(sx, sy, 1, 1);
    }
    // 달
    ctx.fillStyle = '#e8ecff';
    ctx.beginPath(); ctx.arc(90 - camX * 0.04, 50, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#06060f';
    ctx.beginPath(); ctx.arc(95 - camX * 0.04, 46, 11, 0, Math.PI * 2); ctx.fill();
    // 원경 스카이라인
    const r2 = rng(55);
    for (let i = 0; i < 14; i++) {
      const bw = 36 + r2() * 40, bh = 60 + r2() * 90;
      const bx = i * 52 - camX * 0.2 - 20;
      ctx.fillStyle = '#141228';
      ctx.fillRect(bx, GROUND_Y - bh - 20, bw, bh + 20);
      ctx.fillStyle = 'rgba(126,224,255,0.5)';
      for (let wy = 6; wy < bh; wy += 10) {
        if (r2() < 0.5) ctx.fillRect(bx + 4 + r2() * (bw - 10), GROUND_Y - bh - 14 + wy, 3, 4);
      }
    }
    // 중경 네온 간판 건물
    const signs = [
      [40, '#ff4da6', 'BAR'], [180, '#7ee0ff', '24H'], [330, '#b6ff66', 'PC방'],
      [470, '#ffd24a', '노래방'], [590, '#ff6b6b', 'GAME']
    ];
    for (const [px, color, txt] of signs) {
      const sx = px - camX * 0.55;
      ctx.fillStyle = '#1a1830';
      ctx.fillRect(sx - 8, GROUND_Y - 96, 70, 96);
      const on = Math.sin(t * 0.06 + px) > -0.7;
      ctx.fillStyle = on ? color : '#333';
      ctx.fillRect(sx, GROUND_Y - 86, 54, 16);
      ctx.fillStyle = '#0a0a14';
      ctx.fillRect(sx + 2, GROUND_Y - 84, 50, 12);
      if (on) {
        ctx.fillStyle = color;
        ctx.font = 'bold 9px Galmuri11, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(txt, sx + 27, GROUND_Y - 75);
        ctx.globalAlpha = 0.18;
        ctx.fillRect(sx - 6, GROUND_Y - 88, 66, 88);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = '#2a2845';
      for (let wy = GROUND_Y - 62; wy < GROUND_Y - 8; wy += 14) {
        ctx.fillRect(sx + 4, wy, 46, 9);
      }
    }
    // 거리 바닥
    ctx.fillStyle = '#23202e';
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ctx.fillStyle = '#312c40';
    ctx.fillRect(0, GROUND_Y, W, 3);
    // 네온 반사
    ctx.globalAlpha = 0.12;
    for (const [px, color] of signs) {
      const sx = px - camX * 0.55;
      ctx.fillStyle = color;
      ctx.fillRect(sx, GROUND_Y + 4, 54, 18);
    }
    ctx.globalAlpha = 1;
    // 가로등 (월드 고정)
    for (const lx of [110, 380, 600]) {
      const sx = lx - camX;
      ctx.fillStyle = '#3a3a4a';
      ctx.fillRect(sx, GROUND_Y - 70, 3, 70);
      ctx.fillRect(sx - 6, GROUND_Y - 70, 15, 3);
      ctx.fillStyle = '#ffe9a0';
      ctx.fillRect(sx + 6, GROUND_Y - 67, 4, 3);
      ctx.globalAlpha = 0.07;
      ctx.beginPath();
      ctx.moveTo(sx + 8, GROUND_Y - 65);
      ctx.lineTo(sx - 12, GROUND_Y); ctx.lineTo(sx + 28, GROUND_Y);
      ctx.closePath(); ctx.fillStyle = '#ffe9a0'; ctx.fill();
      ctx.globalAlpha = 1;
    }
    drawWalls(ctx, camX, '#1a1830', '#4a4668');
  }

  /* ---------- 3. 한강 둔치 ---------- */
  function drawRiver(ctx, camX, t) {
    ctx.fillStyle = grad(ctx, [[0, '#1d2a5e'], [0.5, '#5e4a8e'], [0.85, '#e88a6a'], [1, '#ffc890']], 0, 170);
    ctx.fillRect(0, 0, W, 170);
    // 별/노을
    const r1 = rng(31);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 20; i++) ctx.fillRect((r1() * 700 - camX * 0.04) % 700, r1() * 60, 1, 1);
    // 강 건너 스카이라인
    const r2 = rng(77);
    for (let i = 0; i < 18; i++) {
      const bw = 24 + r2() * 30, bh = 30 + r2() * 55;
      const bx = i * 40 - camX * 0.15 - 20;
      ctx.fillStyle = '#2a2350';
      ctx.fillRect(bx, 170 - bh, bw, bh);
      ctx.fillStyle = 'rgba(255,210,120,0.6)';
      for (let wy = 4; wy < bh - 4; wy += 8) {
        if (r2() < 0.45) ctx.fillRect(bx + 3 + r2() * (bw - 8), 170 - bh + wy, 2, 3);
      }
    }
    // 대교
    const bx0 = -camX * 0.3;
    ctx.fillStyle = '#1c1838';
    ctx.fillRect(0, 148, W, 5);
    for (let i = 0; i < 8; i++) {
      const px = ((bx0 + i * 110) % (W + 110) + W + 110) % (W + 110) - 55;
      ctx.fillRect(px, 100, 6, 53);
      ctx.strokeStyle = '#1c1838'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px - 52, 148);
      ctx.quadraticCurveTo(px + 3, 96, px + 58, 148);
      ctx.stroke();
      ctx.fillStyle = '#ff6464';
      ctx.fillRect(px + 1, 96, 3, 3);
      ctx.fillStyle = '#1c1838';
    }
    // 강물
    ctx.fillStyle = grad(ctx, [[0, '#3c3670'], [1, '#262450']], 153, GROUND_Y);
    ctx.fillRect(0, 153, W, GROUND_Y - 153);
    ctx.fillStyle = 'rgba(255,190,120,0.35)';
    for (let i = 0; i < 26; i++) {
      const wx = ((i * 37 + t * (0.3 + (i % 3) * 0.2) - camX * 0.4) % (W + 40) + W + 40) % (W + 40) - 20;
      ctx.fillRect(wx, 158 + (i * 13) % (GROUND_Y - 165), 12 + (i % 3) * 8, 1.5);
    }
    // 둔치 잔디
    ctx.fillStyle = '#3e5a36';
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ctx.fillStyle = '#4c6c40';
    ctx.fillRect(0, GROUND_Y, W, 3);
    const r3 = rng(123);
    ctx.fillStyle = '#5d7c4a';
    for (let i = 0; i < 40; i++) {
      const gx = ((r3() * STAGE_W - camX) % STAGE_W + STAGE_W) % STAGE_W;
      ctx.fillRect(gx, GROUND_Y + 5 + r3() * 28, 2, 2);
    }
    // 난간
    ctx.strokeStyle = '#6a6a7a'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y - 14 + 0.5); ctx.lineTo(W, GROUND_Y - 14 + 0.5);
    ctx.stroke();
    for (let i = 0; i < 24; i++) {
      const px = ((i * 34 - camX) % (STAGE_W + 34) + STAGE_W + 34) % (STAGE_W + 34) - 17;
      ctx.fillStyle = '#6a6a7a';
      ctx.fillRect(px, GROUND_Y - 14, 2, 14);
    }
    drawWalls(ctx, camX, '#2e3c2c', '#6c8c5a');
  }

  /* ---------- 좌우 벽 기둥 ---------- */
  function drawWalls(ctx, camX, dark, light) {
    for (const wx of [WALL_L, WALL_R]) {
      const sx = wx - camX + (wx === WALL_L ? -14 : 0);
      ctx.fillStyle = dark;
      ctx.fillRect(sx, GROUND_Y - 64, 14, 64);
      ctx.fillStyle = light;
      ctx.fillRect(sx + (wx === WALL_L ? 11 : 0), GROUND_Y - 64, 3, 64);
      ctx.fillRect(sx - 2, GROUND_Y - 68, 18, 5);
    }
  }

  const DRAW = { rooftop: drawRooftop, neon: drawNeon, river: drawRiver };

  function get(id) {
    return {
      id,
      width: STAGE_W,
      wallL: WALL_L,
      wallR: WALL_R,
      groundY: GROUND_Y,
      draw: DRAW[id] || drawRooftop
    };
  }

  return { get, W, H, GROUND_Y, STAGE_W, WALL_L, WALL_R };
})();
