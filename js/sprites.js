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

  const OUTLINE = '#120e18';

  // ---- 3톤 팔레트 (부위색 기반: 외곽선/그림자/기본/하이라이트, 광원은 위) ----
  const toneCache = {};
  function TONES(c) {
    if (toneCache[c]) return toneCache[c];
    const t = { out: shade(c, -64), dark: shade(c, -26), base: c, lite: shade(c, 26) };
    toneCache[c] = t;
    return t;
  }

  // 테이퍼 세그먼트 (끝으로 갈수록 가늘게)
  function segT(ctx, x1, y1, x2, y2, wA, wB, color) {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    seg(ctx, x1, y1, mx, my, wA, color);
    seg(ctx, mx, my, x2, y2, wB, color);
  }

  // 2관절 사지: 부위색 외곽선 + 테이퍼 + 상부광 명암
  function limb(ctx, ox, oy, tx, ty, l1, l2, bend, w, c1, c2) {
    const [jx, jy, ex, ey] = solveIK(ox, oy, tx, ty, l1, l2, bend);
    const T1 = TONES(c1), T2 = TONES(c2);
    // 외곽선
    segT(ctx, ox, oy, jx, jy, w + 1.8, w * 0.86 + 1.8, T1.out);
    segT(ctx, jx, jy, ex, ey, w * 0.86 + 1.8, w * 0.72 + 1.8, T2.out);
    // 본체
    segT(ctx, ox, oy, jx, jy, w, w * 0.86, c1);
    segT(ctx, jx, jy, ex, ey, w * 0.86, w * 0.72, c2);
    // 명암 (윗면 밝게 / 아랫면 어둡게 — y-up 로컬)
    seg(ctx, ox, oy + 0.9, jx, jy + 0.9, w * 0.34, T1.lite);
    seg(ctx, ox, oy - 0.9, jx, jy - 0.9, w * 0.3, T1.dark);
    seg(ctx, jx, jy + 0.8, ex, ey + 0.8, w * 0.3, T2.lite);
    seg(ctx, jx, jy - 0.8, ex, ey - 0.8, w * 0.26, T2.dark);
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

  // 공격 진행도: 백스윙(0→-0.35) → 뻗기(→1) → 액티브(1) → 후딜(→0)
  // 음수 구간 = 예비동작 (모션 리얼리티의 핵심)
  function attackExt(f) {
    const m = f.moveDef;
    if (!m) return 0;
    const t = f.stateFrame;
    if (t < m.startup) {
      const p = t / m.startup;
      if (p < 0.4) return -(p / 0.4) * 0.35;
      return -0.35 + 1.35 * ((p - 0.4) / 0.6);
    }
    if (t < m.startup + m.active) return 1;
    const r = (t - m.startup - m.active) / Math.max(1, m.recovery);
    return Math.max(0, 1 - r * 1.3);
  }

  function poseFor(f) {
    const p = basePose();
    const t = f.animT;
    const breathe = Math.sin(t * 0.09);

    switch (f.state) {
      case 'idle':
      case 'intro': {
        // 격투 스탠스: 다리 어깨너비 + 무릎 굽힘(낮은 힙) + 주먹 올리고
        // 호흡은 픽셀 단위로 끊어서 (2프레임 들썩임)
        const br = Math.round(Math.sin(t * 0.07) * 1.3);       // -1 / 0 / +1 px
        const sway = Math.round(Math.sin(t * 0.045) * 1.4);
        p.hip = [sway * 0.5, 18 + br * 0.6];                   // 무릎 살짝 굽힌 높이
        p.lean = 2;
        p.footF = [8, 0]; p.footB = [-8, 0];
        p.handF = [10 + sway * 0.4, 29 + br];
        p.handB = [3, 31.5 + br];
        break;
      }

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

      case 'crouch': {
        const charged = f.stateFrame >= 22;   // 기상기 충전 완료 → 더 깊이 웅크림
        p.hip = [0, charged ? 9.5 : 11]; p.lean = 3;
        p.footF = [7, 0]; p.footB = [-6, 0];
        p.handF = [8, charged ? 16 : 18]; p.handB = [3, charged ? 19 : 21];
        break;
      }

      case 'dash':
        p.hip = [1, 18]; p.lean = 7;
        p.footF = [10, 1]; p.footB = [-3, 3];
        p.handF = [10, 27]; p.handB = [2, 30];
        break;

      case 'backdash':
        p.hip = [-1, 19]; p.lean = -6;
        p.footF = [3, 2]; p.footB = [-9, 0];
        p.handF = [8, 29]; p.handB = [1, 31];
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
        const v = attackExt(f);
        const ex = Math.max(0, v);              // 뻗기
        const wu = Math.max(0, -v) / 0.35;      // 백스윙 (예비동작)
        const mk = f.moveKey;
        // 다리를 쫙 편 채 호를 그리는 킥 (반경 고정 → 무릎이 꺾이지 않음)
        const LEGR = LEG1 + LEG2 - 0.5;
        const legArc = (hip, a) => [hip[0] + LEGR * Math.sin(a), Math.max(0, hip[1] - LEGR * Math.cos(a))];
        if (mk === 'lp') {
          // 왼손 잽 (앞손) — 끝까지 쫙
          p.handF = [11 - 4 * wu + 16 * ex, 29];
          p.lean = 1 + 3 * ex - 2 * wu;
          p.footF = [7 + 2 * ex, 0];
        } else if (mk === 'rp') {
          // 오른손 스트레이트 (뒷손, 허리 회전 + 완전 신전)
          p.handB = [2 - 6 * wu + 28 * ex, 28];
          p.handF = [11 - 5 * ex, 29];
          p.lean = 1 - 3 * wu + 8 * ex;
          p.hip = [3 * ex, 19];
          p.footB = [-7 - 3 * ex, 0];
        } else if (mk === 'lk') {
          // 왼발 미들킥: 챔버(접기) → 호를 그리며 쫙
          p.hip = [-1, 19]; p.lean = 1 - 3 * ex - 2 * wu;
          if (v < 0) { p.footF = [2, 5 + 5 * wu]; p.kneeF = 1; }      // 챔버
          else p.footF = legArc(p.hip, 0.55 + 1.05 * ex);             // 펴서 차기
          p.handF = [10 - 4 * ex, 26]; p.handB = [-1 - 4 * ex, 29];
          p.footB = [-5, 0];
        } else if (mk === 'rk') {
          // 오른발 하이킥 (뒷발 돌려차기, 반경 고정 호)
          p.hip = [2 * ex, 19];
          p.lean = 1 - 2 * wu - 5 * ex;
          if (v < 0) { p.footB = [-8 - 3 * wu, 2 + 4 * wu]; p.kneeB = 1; }
          else p.footB = legArc(p.hip, -0.5 + 2.5 * ex);              // 뒤→앞 위로 호
          p.handF = [12 - 10 * ex, 27]; p.handB = [4 * ex, 30];
          p.footF = [5, 0];
        } else if (mk === 'dlp') {
          p.hip = [0, 11]; p.lean = 3;
          p.footF = [7, 0]; p.footB = [-6, 0];
          p.handF = [8 - 3 * wu + 16 * ex, 21]; p.handB = [3, 19];
        } else if (mk === 'drp') {
          // 앉아 어퍼: 뒷손을 끝까지 뻗는다
          p.hip = [0, 11 + 2 * ex]; p.lean = 3 - 2 * ex;
          p.footF = [7, 0]; p.footB = [-6, 0];
          p.handB = [4 - 3 * wu + 18 * ex, 14 + 17 * ex]; p.elbB = 1;
          p.handF = [7, 19];
        } else if (mk === 'dlk') {
          // 짠발: 앉은 채 앞다리만 지면을 따라 쭉 (무릎 안 꺾임)
          p.hip = [0, 10]; p.lean = 3;
          p.footF = [7 + 21 * ex, 0.5]; p.kneeF = 1;
          p.footB = [-6, 0];
          p.handF = [7, 18]; p.handB = [2, 20];
        } else if (mk === 'drk') {
          // 스윕: 몸을 낮추고 뒷다리를 편 채 지면을 쓸기
          p.hip = [1, 7]; p.lean = 4 + 4 * ex;
          p.footB = [2 + 26 * ex, 0.5]; p.kneeB = 1;
          p.footF = [-5, 0]; p.kneeF = 1;
          p.handF = [7, 12]; p.handB = [0, 10];
        } else if (mk === 'ws') {
          p.hip = [0, 11 + 9 * ex]; p.lean = 2 - 4 * ex;
          p.footF = [6, 1 * ex]; p.footB = [-6, 0];
          p.handB = [4 - 2 * wu + 8 * ex, 13 + 29 * ex]; p.elbB = 1;
          p.handF = [8, 18 + 8 * ex];
        } else if (mk === 'launcher') {
          // 띄우기: 앞발을 편 채 위로 차올리는 라이징 킥
          p.hip = [-2 * ex, 19]; p.lean = -7 * ex;
          if (v < 0) { p.footF = [1, 4 + 5 * wu]; p.kneeF = 1; }      // 챔버
          else p.footF = legArc(p.hip, 0.4 + 1.75 * ex);              // 지면→머리 위로 쫙
          p.handF = [7, 28]; p.handB = [-2 - 3 * ex, 26];
          p.footB = [-5, 0];
        } else if (mk === 'wakeKick') {
          // 기상킥: 낮은 자세에서 일어나며 앞차기
          p.hip = [0, 8 + 8 * ex]; p.lean = -2 - 2 * ex;
          if (v < 0) { p.footF = [3, 2]; p.kneeF = 1; }
          else p.footF = legArc(p.hip, 0.6 + 0.9 * ex);
          p.footB = [-6, 0];
          p.handF = [6, p.hip[1] + 7]; p.handB = [-2, p.hip[1] + 5];
        } else if (mk === 'airKick') {
          p.hip[1] = 17;
          p.footF = [5 + 16 * ex, 6 - 7 * ex];
          p.footB = [-3, 9];
          p.handF = [8, 30]; p.handB = [-3, 32];
          p.lean = 4 * ex;
        } else if (mk === 'airPunch') {
          p.hip[1] = 17;
          p.handF = [8 + 16 * ex, 26 - 3 * ex];
          p.footF = [3, 8]; p.footB = [-3, 6];
          p.handB = [-2, 31];
          p.lean = 3 * ex;
        }
        break;
      }

      case 'land':
        // 착지: 무릎을 굽혀 충격 흡수
        p.hip = [0, 13 + (f.stateFrame / 8) * 6];
        p.lean = 4 - (f.stateFrame / 8) * 2;
        p.footF = [8, 0]; p.footB = [-7, 0];
        p.handF = [9, p.hip[1] + 7]; p.handB = [1, p.hip[1] + 9];
        break;

      case 'rise': {
        // 앉았다 일어서기 (6프레임)
        const k = f.stateFrame / 6;
        p.hip = [0, 11 + 8 * k]; p.lean = 3 - k;
        p.footF = [7, 0]; p.footB = [-7, 0];
        p.handF = [9, 18 + 11 * k]; p.handB = [3, 21 + 10 * k];
        break;
      }

      case 'special': {
        const sp = f.moveDef ? f.moveDef.kind : f.char.special.type;
        const ext = Math.max(0, attackExt(f));
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
        } else if (sp === 'commandGrab') {
          // 커맨드 잡기: 양팔을 끝까지 뻗어 덮친다
          p.handF = [9 + 15 * ext, 30]; p.handB = [7 + 16 * ext, 23];
          p.lean = 2 + 6 * ext; p.hip = [2 * ext, 18];
          p.footF = [6 + 3 * ext, 0]; p.footB = [-6, 0];
        } else if (sp === 'projectile') {
          // 장풍: 뒷손을 모았다가 앞으로 밀어냄
          const th = f.stateFrame < f.moveDef.startup ? 0 : 1;
          p.handB = th ? [16, 27] : [-4 - 3 * ext, 26 + 2 * ext];
          p.handF = th ? [13, 25] : [6, 28];
          p.lean = th ? 6 : -2;
          p.hip = [th ? 2 : -1, 19];
          p.footB = [-7, 0];
        } else if (sp === 'counterStance') {
          // 받아치기 자세: 손을 벌리고 반쯤 물러선 자세
          p.lean = -3; p.hip = [-1, 18.5];
          p.handF = [13, 27 + Math.sin(t * 0.3) * 1.2]; p.handB = [11, 22];
          p.elbF = 1;
          p.footF = [4, 0]; p.footB = [-8, 0];
        }
        break;
      }

      case 'grab':
      case 'grabbing':
        p.handF = [16, 28]; p.handB = [15, 24];
        p.lean = 4; p.hip = [1, 19];
        break;

      case 'hit': {
        // 맞은 부위별 리액션
        const wob = Math.max(0, 1 - f.stateFrame / 14);   // 처음에 크게 휘청
        if (f.hitLevel === 'high') {
          // 머리가 뒤로 젖혀짐
          p.hip = [-1, 18]; p.lean = -5 - 4 * wob;
          p.headDX = -2 - 2 * wob; p.headDY = 1 * wob;
          p.handF = [9, 31]; p.handB = [-4, 28];
        } else if (f.hitLevel === 'low') {
          // 다리가 꺾이며 휘청
          p.hip = [0, 14 + 2 * (1 - wob)]; p.lean = -3;
          p.footF = [4, 4 * wob]; p.footB = [-6, 0];
          p.handF = [9, 22]; p.handB = [-3, 20];
        } else {
          // 복부에 맞아 몸이 꺾임
          p.hip = [-1, 16]; p.lean = 3 + 3 * wob;
          p.headDY = -2 * wob;
          p.handF = [7, 18]; p.handB = [1, 16];
          p.footB = [-7, 0];
        }
        // 비틀거림 (히트 직후 흔들림)
        p.lean += Math.sin(f.stateFrame * 0.55) * wob * 2;
        break;
      }

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

  /* ---------- 머리 그리기 (y-up 로컬, 목 위치 nx,ny) — 큼직한 SD 머리 ---------- */
  function drawHead(ctx, nx, ny, c, p, t, flash) {
    const col = k => flash ? '#ffffff' : c[k];
    const hx = nx + p.headDX, hy = ny + 2 + (p.headDY || 0);
    const body = c.body || {};
    // 외곽선 + 얼굴 (둥근 모서리의 큰 머리)
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(Math.round(hx - 4.5), Math.round(hy), 10, 8);
    ctx.fillRect(Math.round(hx - 3.5), Math.round(hy - 1), 8, 10);
    ctx.fillStyle = col('skin');
    ctx.fillRect(Math.round(hx - 3.5), Math.round(hy + 0.5), 8, 7);
    ctx.fillRect(Math.round(hx - 2.5), Math.round(hy), 6, 8);
    // 턱/볼 음영
    if (!flash) {
      ctx.fillStyle = shade(c.skin, -22);
      ctx.fillRect(Math.round(hx - 2.5), Math.round(hy), 6, 1.2);
    }
    // 머리카락 / 모자
    ctx.fillStyle = col('hair');
    const style = c.hairStyle;
    if (style === 'spiky') {
      ctx.fillRect(Math.round(hx - 4.5), Math.round(hy + 5), 10, 3);
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(Math.round(hx - 4.5 + i * 2.6), Math.round(hy + 7 + (i % 2)), 2, 3);
      }
      ctx.fillRect(Math.round(hx - 4.5), Math.round(hy + 1), 2, 5);
    } else if (style === 'ponytail') {
      ctx.fillRect(Math.round(hx - 4.5), Math.round(hy + 5), 10, 3);
      ctx.fillRect(Math.round(hx - 5.5), Math.round(hy + 1), 2, 6);
      const sway = Math.sin(t * 0.1) * 1.5;
      ctx.fillRect(Math.round(hx - 8 + sway), Math.round(hy - 3), 3, 9);
    } else if (style === 'buzz') {
      ctx.fillRect(Math.round(hx - 4), Math.round(hy + 6), 9, 2.5);
    } else if (style === 'cap') {
      // 볼캡: 크라운 + 챙 (capBack이면 거꾸로 씀)
      ctx.fillRect(Math.round(hx - 4.5), Math.round(hy + 5), 10, 4);
      ctx.fillStyle = flash ? '#fff' : shade(c.hair, 18);
      if (body.capBack) {
        ctx.fillRect(Math.round(hx - 11), Math.round(hy + 5), 7, 2);  // 뒤로 챙
        ctx.fillStyle = flash ? '#fff' : c.accent;
        ctx.fillRect(Math.round(hx + 1), Math.round(hy + 6.5), 2.5, 2);
      } else {
        ctx.fillRect(Math.round(hx + 2), Math.round(hy + 5), 7, 2);   // 앞챙
        ctx.fillStyle = flash ? '#fff' : c.accent;
        ctx.fillRect(Math.round(hx - 1), Math.round(hy + 6.5), 2.5, 2);
      }
    } else if (style === 'hood') {
      // 후드: 둥근 돔 + 얼굴 구멍 + 조임끈 (갑옷처럼 보이지 않게 곡선 실루엣)
      const hc = flash ? '#fff' : c.top;
      ctx.fillStyle = hc;
      ctx.fillRect(Math.round(hx - 5), Math.round(hy + 0.5), 11, 6);   // 몸통부
      ctx.fillRect(Math.round(hx - 4), Math.round(hy + 6), 9, 2.4);    // 둥근 어깨선
      ctx.fillRect(Math.round(hx - 2.5), Math.round(hy + 8), 6, 1.4);  // 정수리
      ctx.fillStyle = flash ? '#fff' : shade(c.top, 16);
      ctx.fillRect(Math.round(hx - 4), Math.round(hy + 6.5), 9, 1);    // 하이라이트
      // 얼굴 구멍 (둥글게)
      ctx.fillStyle = col('skin');
      ctx.fillRect(Math.round(hx - 0.5), Math.round(hy + 1), 5.5, 6);
      ctx.fillRect(Math.round(hx + 0.5), Math.round(hy + 0.5), 4, 7);
      // 조임끈
      if (!flash) {
        ctx.fillStyle = c.accent;
        ctx.fillRect(Math.round(hx - 0.5), Math.round(hy - 1.5), 1, 3);
        ctx.fillRect(Math.round(hx + 1.5), Math.round(hy - 1.5), 1, 3);
      }
    } else if (style === 'parted') {
      // 가르마 앞머리: 옆으로 쓸어넘긴 프린지
      ctx.fillRect(Math.round(hx - 4.5), Math.round(hy + 5), 10, 3);
      ctx.fillRect(Math.round(hx - 4.5), Math.round(hy + 1), 2, 5);   // 옆머리
      ctx.fillRect(Math.round(hx + 0.5), Math.round(hy + 4), 5, 2.2); // 앞으로 내려온 프린지
      ctx.fillRect(Math.round(hx + 3), Math.round(hy + 3), 2.5, 2);
    } else { // bowl
      ctx.fillRect(Math.round(hx - 4.5), Math.round(hy + 3), 10, 5);
      ctx.fillRect(Math.round(hx - 4.5), Math.round(hy + 1), 2, 3);
    }
    // 머리띠
    if (c.headband) {
      ctx.fillStyle = flash ? '#fff' : c.accent;
      ctx.fillRect(Math.round(hx - 4.5), Math.round(hy + 4), 10, 1.8);
      const fl = Math.sin(t * 0.15) * 2;
      ctx.fillRect(Math.round(hx - 9), Math.round(hy + 2.5 + fl * 0.4), 4, 1.4);
    }
    if (!flash) {
      // 머리카락 2톤: 정수리 하이라이트 (후드 제외)
      if (style !== 'hood') {
        ctx.fillStyle = shade(c.hair, 30);
        ctx.fillRect(Math.round(hx - 3), Math.round(hy + 7.2), 6, 1);
      }
      // 얼굴 뒤쪽 측면 그림자 + 귀
      ctx.fillStyle = shade(c.skin, -20);
      if (style !== 'hood') {
        ctx.fillRect(Math.round(hx - 3.5), Math.round(hy + 0.5), 1.2, 6.5);
        ctx.fillRect(Math.round(hx - 3.2), Math.round(hy + 2.6), 2, 2.4);   // 귀
        ctx.fillStyle = shade(c.skin, -34);
        ctx.fillRect(Math.round(hx - 2.6), Math.round(hy + 3.2), 0.9, 1.2); // 귓구멍
      }
    }
    // 안경(뿔테) 또는 눈썹+눈
    if (body.glasses && !flash) {
      const gc = body.glasses;
      ctx.fillStyle = gc;
      ctx.fillRect(Math.round(hx - 1.2), Math.round(hy + 2.6), 6.6, 3.2);   // 두꺼운 림
      ctx.fillRect(Math.round(hx - 3.8), Math.round(hy + 3.8), 2.8, 1);     // 안경 다리
      ctx.fillStyle = 'rgba(216,228,240,0.9)';                              // 렌즈
      ctx.fillRect(Math.round(hx - 0.4), Math.round(hy + 3.2), 2.2, 1.9);
      ctx.fillRect(Math.round(hx + 2.6), Math.round(hy + 3.2), 2.2, 1.9);
      ctx.fillStyle = '#23232e';                                            // 렌즈 너머 눈
      ctx.fillRect(Math.round(hx + 0.4), Math.round(hy + 3.5), 1, 1.3);
      ctx.fillRect(Math.round(hx + 3.4), Math.round(hy + 3.5), 1, 1.3);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillRect(Math.round(hx + 4), Math.round(hy + 4.4), 0.8, 0.7);     // 글린트
    } else if (!flash) {
      // 눈썹 (화난 캐릭터는 사선)
      ctx.fillStyle = shade(c.hair, -8);
      if (body.brow === 'angry') {
        ctx.fillRect(Math.round(hx + 0.4), Math.round(hy + 4.4), 2.2, 1.1);
        ctx.fillRect(Math.round(hx + 2.4), Math.round(hy + 5.0), 1.8, 1.1);
      } else {
        ctx.fillRect(Math.round(hx + 0.8), Math.round(hy + 5.0), 3.2, 1);
      }
      // 눈: 흰자 + 동공 + 윗꺼풀
      ctx.fillStyle = '#fff';
      ctx.fillRect(Math.round(hx + 0.8), Math.round(hy + 2.8), 2.8, 1.9);
      ctx.fillStyle = '#23232e';
      ctx.fillRect(Math.round(hx + 2.4), Math.round(hy + 2.8), 1.3, 1.9);
      ctx.fillStyle = shade(c.skin, -26);
      ctx.fillRect(Math.round(hx + 0.8), Math.round(hy + 4.4), 2.8, 0.6);   // 꺼풀
    }
    if (!flash) {
      // 코 + 입
      ctx.fillStyle = shade(c.skin, -22);
      ctx.fillRect(Math.round(hx + 3.2), Math.round(hy + 2.2), 1, 1.4);
      ctx.fillStyle = '#5a2c28';
      ctx.fillRect(Math.round(hx + 1.2), Math.round(hy + 0.9), 2.2, 0.9);
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
    const body = f.char.body || {};
    const cfg = {
      ...c, hairStyle: f.char.hairStyle, headband: f.char.headband, body, top: c.top
    };
    const flash = f.flashT > 0 || f.ghost;      // 고스트(잔상)는 흰 실루엣
    const bs = body.scale || 1;                 // 체격 (캐릭터별 크기)
    const shW = 5 + (body.shoulder || 0);       // 어깨 폭
    const fx = Math.round(f.x), fy = Math.round(groundY - f.y);

    if (f.ghost) ctx.globalAlpha = 0.16;
    else {
      // 그림자
      const shScale = Math.max(0.35, 1 - f.y / 120) * bs;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(fx, groundY + 2, 12 * shScale, 3.2 * shScale, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const p = poseFor(f);

    ctx.save();
    ctx.translate(fx, fy);
    ctx.scale(f.facing * bs, -bs);   // 이후 y-up 좌표계 + 체격 배율
    if (p.rot) ctx.rotate(p.rot);

    if (p.lying) {
      drawLying(ctx, cfg, flash, f.animT);
      ctx.restore();
      if (f.ghost) ctx.globalAlpha = 1;
      return;
    }

    const col = k => flash ? '#ffffff' : cfg[k];
    const hipX = p.hip[0], hipY = p.hip[1];
    const shX = hipX + p.lean, shY = hipY + TORSO;
    // 민소매: 팔 전체가 피부색
    const armC1 = body.sleeveless ? col('skin') : col('top');

    // 뒷팔 + 뒷주먹
    const hb = limb(ctx, shX - 2, shY - 1, p.handB[0], p.handB[1], ARM1, ARM2, p.elbB, 3.6,
      shade(armC1, -30), shade(col('skin'), -30));
    fist(ctx, hb[0], hb[1], flash ? '#fff' : shade(cfg.skin, -30));
    // 뒷다리 (신발은 IK로 실제 닿은 발끝에 — 다리에서 분리되지 않게)
    const fB = limb(ctx, hipX - 1.5, hipY, p.footB[0], p.footB[1] + 1, LEG1, LEG2, p.kneeB, 4.8,
      shade(col('pants'), -30), shade(col('pants'), -30));
    shoe(ctx, [fB[0], fB[1] - 1], flash ? '#fff' : shade(cfg.shoes, -30));

    // ---- 몸통: 둥근 어깨 실루엣 + 3톤 명암 ----
    const tT = TONES(col('top'));
    const torsoPath = () => {
      ctx.beginPath();
      ctx.moveTo(hipX - 4.5, hipY - 1.5);
      ctx.lineTo(shX - shW + 0.5, shY - 2.5);
      ctx.quadraticCurveTo(shX - shW - 0.8, shY + 2.2, shX - shW + 2.8, shY + 2.4);  // 둥근 왼어깨
      ctx.lineTo(shX + shW - 2.8, shY + 2.4);
      ctx.quadraticCurveTo(shX + shW + 0.8, shY + 2.2, shX + shW - 0.5, shY - 2.5);  // 둥근 오른어깨
      ctx.lineTo(hipX + 4.5, hipY - 1.5);
      ctx.closePath();
    };
    torsoPath();
    ctx.strokeStyle = flash ? '#fff' : tT.out;
    ctx.lineWidth = 2.4;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.fillStyle = col('top');
    ctx.fill();
    // 명암: 가슴 상부 하이라이트 / 복부 그림자 (클리핑으로 실루엣 유지)
    if (!flash) {
      ctx.save();
      torsoPath(); ctx.clip();
      ctx.fillStyle = tT.lite;
      ctx.fillRect(Math.round(shX - shW + 1), Math.round(shY - 1), shW * 2 - 2, 3);
      ctx.fillStyle = tT.dark;
      ctx.fillRect(Math.round(hipX - 5), Math.round(hipY - 1.5), 11, 3);
      ctx.fillRect(Math.round(shX - shW), Math.round(hipY + 2), 3, shY - hipY - 3); // 옆구리 그림자
      ctx.restore();
    }
    // 수트: 흰 셔츠 V존 + 넥타이
    if (body.suit && !flash) {
      ctx.fillStyle = '#e8e8f0';
      ctx.beginPath();
      ctx.moveTo(Math.round(shX - 2.5), Math.round(shY - 0.5));
      ctx.lineTo(Math.round(shX + 2.5), Math.round(shY - 0.5));
      ctx.lineTo(Math.round(hipX + 0.5), Math.round(hipY + 4.5));
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = cfg.accent;
      ctx.fillRect(Math.round(shX - 0.7), Math.round(hipY + 4), 1.8, Math.max(2, shY - hipY - 5));
    }
    // 벨트
    ctx.fillStyle = flash ? '#fff' : cfg.accent;
    ctx.fillRect(Math.round(hipX - 4), Math.round(hipY - 1.5), 8, 1.8);

    // 앞다리 + 신발
    const fF = limb(ctx, hipX + 1.5, hipY, p.footF[0], p.footF[1] + 1, LEG1, LEG2, p.kneeF, 4.8,
      col('pants'), col('pants'));
    shoe(ctx, [fF[0], fF[1] - 1], col('shoes'));

    // 목 (머리가 몸통에 바로 붙지 않게)
    const headX = shX + p.headDX, neckSkin = flash ? '#fff' : shade(cfg.skin, -14);
    seg(ctx, shX, shY + 0.5, headX, shY + 3, 4.2, flash ? '#fff' : TONES(cfg.skin).out);
    seg(ctx, shX, shY + 0.5, headX, shY + 3, 2.8, neckSkin);

    // 머리
    drawHead(ctx, shX, shY, cfg, p, f.animT, flash);

    // 앞팔 + 큼직한 주먹
    const hf = limb(ctx, shX + 2, shY - 1, p.handF[0], p.handF[1], ARM1, ARM2, p.elbF, 3.6,
      armC1, col('skin'));
    fist(ctx, hf[0], hf[1], col('skin'));

    ctx.restore();
    if (f.ghost) ctx.globalAlpha = 1;
  }

  // 주먹: 둥근 덩어리 + 너클 능선 + 엄지 음영 (진짜 쥔 주먹처럼)
  function fist(ctx, x, y, color) {
    const T = TONES(color);
    ctx.fillStyle = T.out;
    ctx.beginPath(); ctx.arc(x, y, 3.0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, 2.35, 0, Math.PI * 2); ctx.fill();
    // 너클 능선 (윗면 광)
    ctx.fillStyle = T.lite;
    ctx.fillRect(Math.round(x - 0.4), Math.round(y + 1.0), 1.1, 1.1);
    ctx.fillRect(Math.round(x + 0.9), Math.round(y + 0.6), 1.1, 1.1);
    // 말아쥔 손가락 골 + 엄지 음영
    ctx.fillStyle = T.dark;
    ctx.fillRect(Math.round(x - 1.9), Math.round(y - 0.4), 1.4, 1.8);
    ctx.fillRect(Math.round(x + 0.2), Math.round(y - 1.7), 1.8, 0.9);
  }

  // 신발: 앞코가 둥근 형태 + 윗면 하이라이트
  function shoe(ctx, foot, color) {
    const T = TONES(color);
    const fx2 = Math.round(foot[0]), fy2 = Math.round(foot[1]);
    ctx.fillStyle = T.out;
    ctx.fillRect(fx2 - 2.4, fy2 - 0.6, 7.2, 3.4);
    ctx.fillRect(fx2 + 4.2, fy2 - 0.2, 1.2, 2.6);     // 둥근 앞코
    ctx.fillStyle = color;
    ctx.fillRect(fx2 - 1.8, fy2, 6.4, 2.3);
    ctx.fillStyle = T.lite;
    ctx.fillRect(fx2 - 1.4, fy2 + 1.7, 5, 0.8);       // 윗면 광
    ctx.fillStyle = T.dark;
    ctx.fillRect(fx2 - 1.8, fy2, 6.4, 0.7);           // 밑창 그림자
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
    // 머리카락 / 모자 / 후드
    const body = char.body || {};
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
    } else if (char.hairStyle === 'cap') {
      ctx.fillRect(-6, -9, 12, 5);
      ctx.fillRect(2, -5.5, 8, 2.2);                // 앞챙
      ctx.fillStyle = c.accent;
      ctx.fillRect(-1.5, -7.5, 3, 2.4);             // 로고
    } else if (char.hairStyle === 'hood') {
      ctx.fillStyle = c.top;
      ctx.fillRect(-7.5, -9, 15, 14);               // 후드
      ctx.fillStyle = c.skin;
      ctx.fillRect(-2, -4, 8, 10);                  // 얼굴 구멍
    } else if (char.hairStyle === 'parted') {
      ctx.fillRect(-6, -8, 12, 4);
      ctx.fillRect(-6, -5, 2, 6);
      ctx.fillRect(0.5, -5.5, 6, 2.6);              // 가르마 프린지
      ctx.fillRect(3.5, -3.5, 3, 2);
    } else {
      ctx.fillRect(-6, -8, 12, 5);
      ctx.fillRect(-6, -4, 2, 4);
    }
    if (char.headband) {
      ctx.fillStyle = c.accent;
      ctx.fillRect(-6, -5, 12, 2);
    }
    // 안경(뿔테) 또는 눈썹/눈
    if (body.glasses) {
      ctx.fillStyle = body.glasses;
      ctx.fillRect(-2.5, -2.2, 8.5, 4);
      ctx.fillRect(-5.5, -1, 3.5, 1.2);
      ctx.fillStyle = 'rgba(216,228,240,0.9)';
      ctx.fillRect(-1.5, -1.4, 3, 2.4);
      ctx.fillRect(2.4, -1.4, 3, 2.4);
      ctx.fillStyle = '#23232e';
      ctx.fillRect(-0.4, -1, 1.2, 1.7);
      ctx.fillRect(3.4, -1, 1.2, 1.7);
    } else {
      ctx.fillStyle = c.hair;
      if (body.brow === 'angry') {
        ctx.fillRect(-0.5, -3.2, 4, 1.4);
        ctx.fillRect(2.2, -4, 2, 1.4);
      } else {
        ctx.fillRect(0, -2.5, 3, 1.2);
      }
      ctx.fillStyle = '#fff';
      ctx.fillRect(0.5, -1, 3, 2);
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(2, -1, 1.4, 2);
    }
    // 입
    ctx.fillStyle = '#a05540';
    ctx.fillRect(1, 4, 2.5, 1);
    ctx.restore();
  }

  return { drawFighter, drawPortrait, shade };
})();
