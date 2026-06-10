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

  // 외곽선 포함 2관절 사지 — 픽셀 덩어리 느낌의 핵심
  function limb(ctx, ox, oy, tx, ty, l1, l2, bend, w, c1, c2) {
    const [jx, jy, ex, ey] = solveIK(ox, oy, tx, ty, l1, l2, bend);
    seg(ctx, ox, oy, jx, jy, w + 2.2, OUTLINE);
    seg(ctx, jx, jy, ex, ey, w + 2.2, OUTLINE);
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
        // 격투 스탠스: 낮고 넓게, 체중 이동
        const sway = Math.sin(t * 0.045) * 1.2;
        p.hip = [sway * 0.5, 19 + breathe * 0.7];
        p.lean = 2;
        p.footF = [7, 0]; p.footB = [-7, 0];
        p.handF = [10 + sway * 0.4, 28 + breathe * 0.9];
        p.handB = [2, 31 + breathe * 0.9];
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
        if (mk === 'lp') {
          // 왼손 잽 (앞손)
          p.handF = [10 - 3 * wu + 13 * ex, 29];
          p.lean = 1 + 2 * ex;
          p.footF = [6 + 2 * ex, 0];
        } else if (mk === 'rp') {
          // 오른손 스트레이트 (뒷손, 허리 회전을 실어서)
          p.handB = [2 - 5 * wu + 24 * ex, 28];
          p.handF = [10 - 4 * ex, 29];
          p.lean = 1 - 3 * wu + 7 * ex;
          p.hip = [2.5 * ex, 19];
          p.footB = [-7 - 2 * ex, 0];
        } else if (mk === 'lk') {
          // 왼발 미들킥 (앞발)
          p.footF = [6 - 3 * wu + 20 * ex, 1 + 16 * ex];
          p.hip = [-1, 19]; p.lean = 1 - 3 * ex - 2 * wu;
          p.handF = [10 - 4 * ex, 26]; p.handB = [-1 - 4 * ex, 29];
          p.footB = [-5, 0];
        } else if (mk === 'rk') {
          // 오른발 하이킥 (뒷발 돌려차기 — 발이 호를 그림)
          p.footB = [-7 - 4 * wu + 30 * ex, 2 + 30 * Math.sin(ex * 1.8)];
          if (ex > 0.3) p.kneeB = -1;
          p.lean = 1 - 2 * wu - 4 * ex;
          p.hip = [2 * ex, 19];
          p.handF = [12 - 10 * ex, 27]; p.handB = [4 * ex, 30];
          p.footF = [5, 0];
        } else if (mk === 'dlp') {
          // 앉아 잽
          p.hip = [0, 11]; p.lean = 3;
          p.footF = [7, 0]; p.footB = [-6, 0];
          p.handF = [7 - 2 * wu + 13 * ex, 21]; p.handB = [3, 19];
        } else if (mk === 'drp') {
          // 앉아 어퍼 (뒷손이 위로)
          p.hip = [0, 11 + 2 * ex]; p.lean = 3 - 2 * ex;
          p.footF = [7, 0]; p.footB = [-6, 0];
          p.handB = [3 - 3 * wu + 12 * ex, 16 + 12 * ex]; p.elbB = 1;
          p.handF = [7, 19];
        } else if (mk === 'dlk') {
          // 짠발 (앉아 하단 톡)
          p.hip = [0, 10]; p.lean = 3;
          p.footF = [6 - 2 * wu + 19 * ex, 1];
          p.footB = [-6, 0];
          p.handF = [7, 18]; p.handB = [2, 20];
        } else if (mk === 'drk') {
          // 스윕 (뒷발로 바닥을 쓸며 회전)
          p.hip = [1, 8]; p.lean = 5 + 4 * ex;
          p.footB = [-6 - 3 * wu + 31 * ex, 1];
          p.kneeB = -1;
          p.footF = [7, 0];
          p.handF = [7, 13]; p.handB = [0, 11];
        } else if (mk === 'ws') {
          // 기상 어퍼 (앉은 자세에서 일어나며 뒷손 어퍼)
          p.hip = [0, 11 + 9 * ex]; p.lean = 2 - 4 * ex;
          p.footF = [6, 1 * ex]; p.footB = [-6, 0];
          p.handB = [4 - 2 * wu + 7 * ex, 13 + 27 * ex]; p.elbB = 1;
          p.handF = [8, 18 + 8 * ex];
        } else if (mk === 'launcher') {
          // 띄우기 (솟아오르는 무릎)
          p.footF = [4 - 2 * wu + 9 * ex, 5 + 26 * ex];
          p.kneeF = -1;
          p.hip = [-2 * ex, 19]; p.lean = -6 * ex;
          p.handF = [7, 28]; p.handB = [-2 - 3 * ex, 26];
          p.footB = [-5, 0];
        } else if (mk === 'airKick') {
          p.hip[1] = 17;
          p.footF = [4 + 13 * ex, 6 - 5 * ex];
          p.footB = [-3, 9];
          p.handF = [8, 30]; p.handB = [-3, 32];
          p.lean = 4 * ex;
        } else if (mk === 'airPunch') {
          p.hip[1] = 17;
          p.handF = [8 + 13 * ex, 26 - 3 * ex];
          p.footF = [3, 8]; p.footB = [-3, 6];
          p.handB = [-2, 31];
          p.lean = 3 * ex;
        }
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
          // 커맨드 잡기: 크게 벌린 양손으로 달려듦
          p.handF = [8 + 10 * ext, 30]; p.handB = [6 + 11 * ext, 22];
          p.lean = 2 + 5 * ext; p.hip = [2 * ext, 18];
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
    // 외곽선 + 얼굴 (8x8 큰 머리)
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(Math.round(hx - 4.5), Math.round(hy - 1), 10, 10);
    ctx.fillStyle = col('skin');
    ctx.fillRect(Math.round(hx - 3.5), Math.round(hy), 8, 8);
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
      // 볼캡: 크라운 + 앞챙
      ctx.fillRect(Math.round(hx - 4.5), Math.round(hy + 5), 10, 4);
      ctx.fillStyle = flash ? '#fff' : shade(c.hair, 18);
      ctx.fillRect(Math.round(hx + 2), Math.round(hy + 5), 7, 2);     // 앞챙
      ctx.fillStyle = flash ? '#fff' : c.accent;
      ctx.fillRect(Math.round(hx - 1), Math.round(hy + 6.5), 2.5, 2); // 로고
    } else if (style === 'hood') {
      // 후드: 머리 전체를 감쌈, 얼굴만 보임
      ctx.fillStyle = flash ? '#fff' : c.top;
      ctx.fillRect(Math.round(hx - 5), Math.round(hy - 1), 11, 10);
      ctx.fillStyle = flash ? '#fff' : shade(c.top, -25);
      ctx.fillRect(Math.round(hx - 5), Math.round(hy - 1), 11, 2);
      ctx.fillStyle = col('skin');
      ctx.fillRect(Math.round(hx - 1), Math.round(hy + 0.5), 6, 6.5); // 얼굴 구멍
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
    // 선글라스 또는 눈
    if (body.glasses && !flash) {
      ctx.fillStyle = body.glasses;
      ctx.fillRect(Math.round(hx - 1), Math.round(hy + 3), 6.5, 2.4);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(Math.round(hx + 2.5), Math.round(hy + 4.2), 1.4, 1);
    } else if (!flash) {
      // 화난 눈썹
      if (body.brow === 'angry') {
        ctx.fillStyle = col('hair');
        ctx.fillRect(Math.round(hx + 0.5), Math.round(hy + 4.6), 3.4, 1.3);
        ctx.fillRect(Math.round(hx + 2.6), Math.round(hy + 4.0), 1.6, 1.3);
      }
      ctx.fillStyle = '#fff';
      ctx.fillRect(Math.round(hx + 1), Math.round(hy + 2.8), 2.4, 1.8);
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(Math.round(hx + 2.2), Math.round(hy + 2.8), 1.2, 1.8);
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
    const flash = f.flashT > 0;
    const bs = body.scale || 1;                 // 체격 (캐릭터별 크기)
    const shW = 5 + (body.shoulder || 0);       // 어깨 폭
    const fx = Math.round(f.x), fy = Math.round(groundY - f.y);

    // 그림자
    const shScale = Math.max(0.35, 1 - f.y / 120) * bs;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(fx, groundY + 2, 12 * shScale, 3.2 * shScale, 0, 0, Math.PI * 2);
    ctx.fill();

    const p = poseFor(f);

    ctx.save();
    ctx.translate(fx, fy);
    ctx.scale(f.facing * bs, -bs);   // 이후 y-up 좌표계 + 체격 배율
    if (p.rot) ctx.rotate(p.rot);

    if (p.lying) {
      drawLying(ctx, cfg, flash, f.animT);
      ctx.restore();
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
    // 뒷다리
    limb(ctx, hipX - 1.5, hipY, p.footB[0], p.footB[1] + 1, LEG1, LEG2, p.kneeB, 4.8,
      shade(col('pants'), -30), shade(col('pants'), -30));
    shoe(ctx, p.footB, flash ? '#fff' : shade(cfg.shoes, -30));

    // 몸통 (넓은 어깨 + 외곽선)
    ctx.beginPath();
    ctx.moveTo(Math.round(hipX - 4.5), Math.round(hipY - 1.5));
    ctx.lineTo(Math.round(hipX + 4.5), Math.round(hipY - 1.5));
    ctx.lineTo(Math.round(shX + shW), Math.round(shY + 1));
    ctx.lineTo(Math.round(shX - shW), Math.round(shY + 1));
    ctx.closePath();
    ctx.fillStyle = OUTLINE;
    ctx.lineWidth = 3; ctx.strokeStyle = OUTLINE; ctx.stroke();
    ctx.fillStyle = col('top');
    ctx.fill();
    // 가슴 음영
    ctx.fillStyle = flash ? '#fff' : shade(c.top, 14);
    ctx.fillRect(Math.round(shX - shW + 2), Math.round(shY - 4), shW, 3);
    // 수트 깃 (V라인)
    if (body.suit && !flash) {
      ctx.strokeStyle = '#cfcfd8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(shX + 3), Math.round(shY - 0.5));
      ctx.lineTo(Math.round(hipX + 0.5), Math.round(hipY + 4));
      ctx.moveTo(Math.round(shX - 3), Math.round(shY - 0.5));
      ctx.lineTo(Math.round(hipX + 0.5), Math.round(hipY + 4));
      ctx.stroke();
    }
    // 벨트
    ctx.fillStyle = flash ? '#fff' : cfg.accent;
    ctx.fillRect(Math.round(hipX - 4), Math.round(hipY - 1.5), 8, 1.8);

    // 앞다리 + 신발
    limb(ctx, hipX + 1.5, hipY, p.footF[0], p.footF[1] + 1, LEG1, LEG2, p.kneeF, 4.8,
      col('pants'), col('pants'));
    shoe(ctx, p.footF, col('shoes'));

    // 머리
    drawHead(ctx, shX, shY, cfg, p, f.animT, flash);

    // 앞팔 + 큼직한 주먹
    const hf = limb(ctx, shX + 2, shY - 1, p.handF[0], p.handF[1], ARM1, ARM2, p.elbF, 3.6,
      armC1, col('skin'));
    fist(ctx, hf[0], hf[1], col('skin'));

    ctx.restore();
  }

  function fist(ctx, x, y, color) {
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(Math.round(x - 2.6), Math.round(y - 2.6), 5.4, 5.4);
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x - 2), Math.round(y - 2), 4.2, 4.2);
  }

  function shoe(ctx, foot, color) {
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(Math.round(foot[0] - 2), Math.round(foot[1] - 0.5), 7, 3.4);
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(foot[0] - 1.4), Math.round(foot[1]), 6, 2.4);
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
    // 선글라스 또는 눈썹/눈
    if (body.glasses) {
      ctx.fillStyle = body.glasses;
      ctx.fillRect(-2.5, -1.8, 8.5, 3.2);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(2.6, -0.8, 1.8, 1.2);
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
