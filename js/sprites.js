/* ============================================================
 * 캐릭터 스프라이트 — 절차 생성 픽셀아트 (2-bone IK 스켈레톤)
 * 로컬 좌표: 발밑 원점, +x = 바라보는 방향, +y = 위
 * ============================================================ */

const Sprites = (() => {

  // 2-bone IK: 시작점(ox,oy) → 목표(tx,ty), 길이 l1/l2, bend = 관절 굽힘 방향(±1)
  function solveIK(ox, oy, tx, ty, l1, l2, bend) {
    let dx = tx - ox, dy = ty - oy;
    let d = Math.hypot(dx, dy);
    const maxD = l1 + l2 - 0.05;
    if (d > maxD) { const s = maxD / d; dx *= s; dy *= s; d = maxD; tx = ox + dx; ty = oy + dy; }
    if (d < 0.05) { d = 0.05; dx = 0.05; dy = 0; tx = ox + dx; ty = oy; }
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
    let h2 = l1 * l1 - a * a; if (h2 < 0) h2 = 0;
    const h = Math.sqrt(h2);
    const mx = ox + dx * (a / d), my = oy + dy * (a / d);
    const px = -dy / d, py = dx / d;
    return [mx + px * h * bend, my + py * h * bend, tx, ty];
  }

  const LEG1 = 10, LEG2 = 11, ARM1 = 8, ARM2 = 8, TORSO = 13;

  function seg(ctx, x1, y1, x2, y2, w, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(Math.round(x1), Math.round(y1));
    ctx.lineTo(Math.round(x2), Math.round(y2));
    ctx.stroke();
  }

  function limb(ctx, ox, oy, tx, ty, l1, l2, bend, w, c1, c2) {
    const [jx, jy, ex, ey] = solveIK(ox, oy, tx, ty, l1, l2, bend);
    seg(ctx, ox, oy, jx, jy, w, c1);
    seg(ctx, jx, jy, ex, ey, w, c2);
    return [ex, ey];
  }

  /* ---------- 포즈 계산 ---------- */
  // 반환: hip[x,y], lean, footF/footB/handF/handB [x,y],
  //       kneeF/kneeB/elbF/elbB(±1), headDX/headDY, rot, lying
  function basePose() {
    return {
      hip: [0, 20], lean: 1,
      footF: [5, 0], footB: [-5, 0],
      handF: [9, 27], handB: [3, 30],
      kneeF: 1, kneeB: 1, elbF: -1, elbB: -1,
      headDX: 1, headDY: 0, rot: 0, lying: false
    };
  }

  // 공격 진행도: 준비(0→1 빠르게), 액티브(1), 후딜(1→0)
  function attackExt(f) {
    const m = f.moveDef;
    if (!m) return 0;
    const t = f.stateFrame;
    if (t < m.startup) return Math.pow(t / m.startup, 1.6);
    if (t < m.startup + m.active) return 1;
    const r = (t - m.startup - m.active) / Math.max(1, m.recovery);
    return Math.max(0, 1 - r * 1.2);
  }

  function poseFor(f) {
    const p = basePose();
    const t = f.animT;
    const breathe = Math.sin(t * 0.09);

    switch (f.state) {
      case 'idle':
      case 'intro':
        p.hip[1] = 20 + breathe * 0.7;
        p.handF = [9, 27 + breathe * 0.8];
        p.handB = [3, 30 + breathe * 0.8];
        break;

      case 'walk': {
        const c = t * 0.22;
        const s = Math.sin(c), s2 = Math.sin(c + Math.PI);
        p.hip[1] = 19.5 + Math.abs(Math.cos(c)) * 1.2;
        p.footF = [s * 7 + 1, Math.max(0, Math.sin(c + 0.5)) * 3];
        p.footB = [s2 * 7 - 1, Math.max(0, Math.sin(c + Math.PI + 0.5)) * 3];
        p.lean = 2;
        p.handF = [9 + s * 1.5, 27]; p.handB = [3 - s * 1.5, 30];
        break;
      }

      case 'jump':
        p.hip[1] = 18;
        p.footF = [4, 9]; p.footB = [-2, 6];
        p.handF = [9, 31]; p.handB = [1, 33];
        p.lean = f.vy > 0 ? 3 : -1;
        break;

      case 'crouch':
        p.hip = [0, 11]; p.lean = 3;
        p.footF = [7, 0]; p.footB = [-6, 0];
        p.handF = [8, 18]; p.handB = [3, 21];
        break;

      case 'block':
        p.hip[1] = 19; p.lean = -2;
        p.handF = [7, 30]; p.handB = [6, 25];
        break;

      case 'crouchblock':
        p.hip = [0, 11]; p.lean = -1;
        p.footF = [7, 0]; p.footB = [-6, 0];
        p.handF = [6, 21]; p.handB = [5, 16];
        break;

      case 'attack': {
        const ext = attackExt(f);
        const mk = f.moveKey;
        if (mk === 'lp') {
          p.handF = [9 + 14 * ext, 28];
          p.lean = 1 + 2 * ext;
          p.footF = [5 + 2 * ext, 0];
        } else if (mk === 'hp') {
          p.handF = [9 + 19 * ext, 27];
          p.lean = 1 + 5 * ext; p.hip = [2 * ext, 19];
          p.footB = [-5 - 3 * ext, 0];
          p.handB = [1 - 3 * ext, 28];
        } else if (mk === 'kick') {
          p.footF = [5 + 19 * ext, 14 * ext + 1];
          p.hip = [-1, 19]; p.lean = 1 - 4 * ext;
          p.handF = [10 - 4 * ext, 26]; p.handB = [-1 - 4 * ext, 29];
          p.footB = [-4, 0];
        } else if (mk === 'launcher') {
          p.footF = [4 + 9 * ext, 6 + 24 * ext];
          p.kneeF = -1;
          p.hip = [-2 * ext, 19]; p.lean = -6 * ext;
          p.handF = [7, 28]; p.handB = [-2 - 3 * ext, 26];
          p.footB = [-4, 0];
        } else if (mk === 'airKick') {
          p.hip[1] = 17;
          p.footF = [4 + 13 * ext, 6 - 5 * ext];
          p.footB = [-3, 9];
          p.handF = [8, 30]; p.handB = [-3, 32];
          p.lean = 4 * ext;
        }
        break;
      }

      case 'special': {
        const sp = f.char.special.type;
        const ext = attackExt(f);
        if (sp === 'uppercut') {
          p.handF = [10 + 6 * ext, 20 + 25 * ext];
          p.elbF = 1;
          p.hip = [2 * ext, 19 + 2 * ext]; p.lean = 3;
          p.footB = [-7, 0]; p.footF = [5, 3 * ext];
          p.handB = [-2, 26];
        } else if (sp === 'rushKick') {
          const k = Math.floor(f.stateFrame / 7) % 2;
          const kickExt = f.stateFrame < f.moveDef.startup ? 0 : 1;
          if (k === 0) {
            p.footF = [5 + 19 * kickExt, 15]; p.footB = [-4, 0];
          } else {
            p.footB = [5 + 19 * kickExt, 18]; p.footF = [-3, 0];
            p.kneeB = -1;
          }
          p.hip = [0, 19]; p.lean = -3;
          p.handF = [6, 27]; p.handB = [-3, 29];
        } else if (sp === 'quake') {
          if (ext < 1 && f.stateFrame < f.moveDef.startup) {
            p.handF = [3, 28 + 16 * ext]; p.handB = [-1, 28 + 16 * ext];
            p.elbF = 1; p.elbB = 1;
            p.hip[1] = 20 + 2 * ext; p.lean = -3;
          } else {
            p.hip = [1, 13]; p.lean = 6;
            p.handF = [11, 4]; p.handB = [7, 4];
            p.footF = [8, 0]; p.footB = [-7, 0];
          }
        }
        break;
      }

      case 'grab':
      case 'grabbing':
        p.handF = [16, 28]; p.handB = [15, 24];
        p.lean = 4; p.hip = [1, 19];
        break;

      case 'hit':
        p.hip = [-1, 18]; p.lean = -5;
        p.handF = [11, 22]; p.handB = [-4, 26];
        p.headDX = -2;
        break;

      case 'grabbed':
        p.hip = [0, 19]; p.lean = -7;
        p.handF = [10, 33]; p.handB = [-6, 30];
        p.headDX = -2;
        break;

      case 'launched':
        p.rot = f.spin || -0.9;
        p.hip = [0, 14];
        p.footF = [3, 3]; p.footB = [-8, 6];
        p.handF = [9, 20]; p.handB = [-7, 17];
        p.headDX = -1;
        break;

      case 'knockdown':
      case 'ko':
        p.lying = true;
        break;

      case 'getup':
        p.hip = [0, 9 + (f.stateFrame / 20) * 10]; p.lean = 4;
        p.footF = [7, 0]; p.footB = [-5, 0];
        p.handF = [8, p.hip[1] + 6]; p.handB = [2, p.hip[1] + 8];
        break;

      case 'win': {
        const hop = Math.abs(Math.sin(t * 0.12));
        p.hip[1] = 20 + hop * 2;
        p.handF = [5 + Math.sin(t * 0.2) * 2, 44];
        p.elbF = 1;
        p.handB = [2, 24];
        break;
      }
    }
    return p;
  }

  /* ---------- 머리 그리기 (y-up 로컬, 목 위치 nx,ny) ---------- */
  function drawHead(ctx, nx, ny, c, p, t, flash) {
    const col = k => flash ? '#ffffff' : c[k];
    const hx = nx + p.headDX, hy = ny + 2 + (p.headDY || 0);
    // 얼굴
    ctx.fillStyle = col('skin');
    ctx.fillRect(Math.round(hx - 3), Math.round(hy), 7, 7);
    // 머리카락
    ctx.fillStyle = col('hair');
    const style = c.hairStyle;
    if (style === 'spiky') {
      ctx.fillRect(Math.round(hx - 4), Math.round(hy + 4), 9, 3);
      for (let i = 0; i < 4; i++) {
        const sx = hx - 4 + i * 2.4;
        ctx.fillRect(Math.round(sx), Math.round(hy + 6 + (i % 2)), 2, 3);
      }
      ctx.fillRect(Math.round(hx - 4), Math.round(hy + 1), 2, 4); // 구레나룻
    } else if (style === 'ponytail') {
      ctx.fillRect(Math.round(hx - 4), Math.round(hy + 4), 9, 3);
      ctx.fillRect(Math.round(hx - 5), Math.round(hy + 1), 2, 5);
      const sway = Math.sin(t * 0.1) * 1.5;
      ctx.fillRect(Math.round(hx - 7 + sway), Math.round(hy - 3), 3, 8); // 포니테일
      ctx.fillRect(Math.round(hx - 6 + sway), Math.round(hy + 4), 3, 3);
    } else if (style === 'buzz') {
      ctx.fillRect(Math.round(hx - 3.5), Math.round(hy + 5), 8, 2);
    } else { // bowl
      ctx.fillRect(Math.round(hx - 4), Math.round(hy + 3), 9, 4);
      ctx.fillRect(Math.round(hx - 4), Math.round(hy + 1), 2, 3);
    }
    // 머리띠
    if (c.headband) {
      ctx.fillStyle = flash ? '#fff' : c.accent;
      ctx.fillRect(Math.round(hx - 4), Math.round(hy + 3.5), 9, 1.6);
      const fl = Math.sin(t * 0.15) * 2;
      ctx.fillRect(Math.round(hx - 8), Math.round(hy + 2 + fl * 0.4), 4, 1.4);
    }
    // 눈
    if (!flash) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(Math.round(hx + 1), Math.round(hy + 2.6), 2, 1.6);
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(Math.round(hx + 2), Math.round(hy + 2.6), 1, 1.6);
    }
  }

  /* ---------- 누운 자세 (KO / 다운) ---------- */
  function drawLying(ctx, c, flash, t) {
    const col = k => flash ? '#ffffff' : c[k];
    // 몸통 (뒤쪽으로 누움: 머리가 -x)
    ctx.fillStyle = col('top');
    ctx.fillRect(-14, -5, 14, 5);
    // 다리
    ctx.strokeStyle = col('pants'); ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-2, -3); ctx.lineTo(8, -4); ctx.lineTo(13, -2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-2, -3); ctx.lineTo(6, -2); ctx.stroke();
    // 팔
    ctx.strokeStyle = col('top'); ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-11, -4); ctx.lineTo(-6, -1); ctx.stroke();
    // 머리
    ctx.fillStyle = col('skin');
    ctx.fillRect(-20, -6, 6, 6);
    ctx.fillStyle = col('hair');
    ctx.fillRect(-21, -6, 3, 6);
    // 신발
    ctx.fillStyle = col('shoes');
    ctx.fillRect(12, -3, 3, 2);
  }

  /* ---------- 캐릭터 본체 그리기 ----------
   * ctx: 카메라 변환이 적용된 내부 캔버스 컨텍스트
   * f: Fighter 인스턴스, groundY: 지면 스크린 y
   */
  function drawFighter(ctx, f, groundY) {
    const c = f.char.colors;
    const cfg = {
      ...c, hairStyle: f.char.hairStyle, headband: f.char.headband
    };
    const flash = f.flashT > 0;
    const fx = Math.round(f.x), fy = Math.round(groundY - f.y);

    // 그림자
    const shScale = Math.max(0.35, 1 - f.y / 120);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(fx, groundY + 2, 11 * shScale, 3 * shScale, 0, 0, Math.PI * 2);
    ctx.fill();

    const p = poseFor(f);

    ctx.save();
    ctx.translate(fx, fy);
    ctx.scale(f.facing, -1);   // 이후 y-up 좌표계
    if (p.rot) ctx.rotate(p.rot);

    if (p.lying) {
      drawLying(ctx, cfg, flash, f.animT);
      ctx.restore();
      return;
    }

    const col = k => flash ? '#ffffff' : cfg[k];
    const hipX = p.hip[0], hipY = p.hip[1];
    const shX = hipX + p.lean, shY = hipY + TORSO;

    // 뒷팔
    limb(ctx, shX - 1, shY - 1, p.handB[0], p.handB[1], ARM1, ARM2, p.elbB, 2.5,
      shade(col('top'), -25), shade(col('skin'), -25));
    // 뒷다리
    limb(ctx, hipX - 1, hipY, p.footB[0], p.footB[1] + 1, LEG1, LEG2, p.kneeB, 3.5,
      shade(col('pants'), -25), shade(col('pants'), -25));
    ctx.fillStyle = flash ? '#fff' : shade(cfg.shoes, -25);
    ctx.fillRect(Math.round(p.footB[0] - 1), Math.round(p.footB[1]), 5, 2);

    // 몸통
    ctx.fillStyle = col('top');
    ctx.beginPath();
    ctx.moveTo(Math.round(hipX - 3.5), Math.round(hipY - 1));
    ctx.lineTo(Math.round(hipX + 3.5), Math.round(hipY - 1));
    ctx.lineTo(Math.round(shX + 4), Math.round(shY));
    ctx.lineTo(Math.round(shX - 4), Math.round(shY));
    ctx.closePath();
    ctx.fill();
    // 벨트
    ctx.fillStyle = flash ? '#fff' : cfg.accent;
    ctx.fillRect(Math.round(hipX - 3.5), Math.round(hipY - 1), 7, 1.6);

    // 앞다리
    limb(ctx, hipX + 1, hipY, p.footF[0], p.footF[1] + 1, LEG1, LEG2, p.kneeF, 3.5,
      col('pants'), col('pants'));
    ctx.fillStyle = col('shoes');
    ctx.fillRect(Math.round(p.footF[0] - 1), Math.round(p.footF[1]), 5, 2);

    // 머리
    drawHead(ctx, shX, shY, cfg, p, f.animT, flash);

    // 앞팔
    const hf = limb(ctx, shX + 1, shY - 1, p.handF[0], p.handF[1], ARM1, ARM2, p.elbF, 2.5,
      col('top'), col('skin'));
    // 주먹
    ctx.fillStyle = col('skin');
    ctx.fillRect(Math.round(hf[0] - 1.5), Math.round(hf[1] - 1.5), 3.5, 3.5);

    ctx.restore();
  }

  /* ---------- 색 보정 ---------- */
  const shadeCache = {};
  function shade(hex, amt) {
    const key = hex + amt;
    if (shadeCache[key]) return shadeCache[key];
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) + amt, g = ((n >> 8) & 255) + amt, b = (n & 255) + amt;
    r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
    const out = `rgb(${r},${g},${b})`;
    shadeCache[key] = out;
    return out;
  }

  /* ---------- 초상화 (선택/HUD/승리 화면) ---------- */
  function drawPortrait(ctx, char, x, y, scale, flip) {
    const c = char.colors;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale * (flip ? -1 : 1), scale);
    // 목/어깨
    ctx.fillStyle = c.top;
    ctx.fillRect(-7, 9, 14, 5);
    ctx.fillStyle = c.skin;
    ctx.fillRect(-2, 7, 4, 3);
    // 얼굴
    ctx.fillStyle = c.skin;
    ctx.fillRect(-5, -6, 10, 13);
    // 머리카락
    ctx.fillStyle = c.hair;
    if (char.hairStyle === 'spiky') {
      ctx.fillRect(-6, -8, 12, 4);
      for (let i = 0; i < 5; i++) ctx.fillRect(-6 + i * 2.5, -10 - (i % 2) * 1.5, 2, 4);
      ctx.fillRect(-6, -6, 2, 7);
    } else if (char.hairStyle === 'ponytail') {
      ctx.fillRect(-6, -8, 12, 4);
      ctx.fillRect(-7, -6, 2, 8);
      ctx.fillRect(-10, -9, 4, 12);
    } else if (char.hairStyle === 'buzz') {
      ctx.fillRect(-5.5, -8, 11, 3.5);
    } else {
      ctx.fillRect(-6, -8, 12, 5);
      ctx.fillRect(-6, -4, 2, 4);
    }
    if (char.headband) {
      ctx.fillStyle = c.accent;
      ctx.fillRect(-6, -5, 12, 2);
    }
    // 눈썹/눈
    ctx.fillStyle = c.hair;
    ctx.fillRect(0, -2.5, 3, 1.2);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0.5, -1, 3, 2);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(2, -1, 1.4, 2);
    // 입
    ctx.fillStyle = '#a05540';
    ctx.fillRect(1, 4, 2.5, 1);
    ctx.restore();
  }

  return { drawFighter, drawPortrait, shade };
})();
