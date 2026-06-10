/* ============================================================
 * 캐릭터 스프라이트 — 절차 생성 픽셀아트 (2-bone IK 스켈레톤)
 * 로컬 좌표: 발밑 원점, +x = 바라보는 방향, +y = 위
 * ============================================================ */

const Sprites = (() => {

  // 2-bone IK: 시작점(ox,oy) → 목표(tx,ty), 길이 l1/l2, bend = 관절 굽힘 방향(±1)
  // 관절 돌출(h)을 캡해서 가드 자세에서 팔꿈치가 닭날개처럼 튀어나오는 것 방지
  function solveIK(ox, oy, tx, ty, l1, l2, bend) {
    let dx = tx - ox, dy = ty - oy;
    let d = Math.hypot(dx, dy);
    const maxD = l1 + l2 - 0.05;
    if (d > maxD) { const s = maxD / d; dx *= s; dy *= s; d = maxD; tx = ox + dx; ty = oy + dy; }
    if (d < 0.05) { d = 0.05; dx = 0.05; dy = 0; tx = ox + dx; ty = oy; }
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
    let h2 = l1 * l1 - a * a; if (h2 < 0) h2 = 0;
    const h = Math.min(Math.sqrt(h2), 5.2);
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

  // 윗면 하이라이트만 (어두운 줄은 줄무늬처럼 보여서 제거)
  function liteSeg(ctx, x1, y1, x2, y2, w, lite) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    let px = -dy / len, py = dx / len;
    if (py < 0) { px = -px; py = -py; }
    const o = w * 0.24;
    seg(ctx, x1 + px * o, y1 + py * o, x2 + px * o, y2 + py * o, w * 0.28, lite);
  }

  // 2관절 사지: 은은한 외곽선(부위색 -30) + 테이퍼 + 윗면 광. [끝x, 끝y, 관절x, 관절y] 반환
  function limb(ctx, ox, oy, tx, ty, l1, l2, bend, w, c1, c2) {
    const [jx, jy, ex, ey] = solveIK(ox, oy, tx, ty, l1, l2, bend);
    const o1 = shade(c1, -30), o2 = shade(c2, -30);
    segT(ctx, ox, oy, jx, jy, w + 1.2, w * 0.86 + 1.2, o1);
    segT(ctx, jx, jy, ex, ey, w * 0.86 + 1.2, w * 0.72 + 1.2, o2);
    // 본체
    segT(ctx, ox, oy, jx, jy, w, w * 0.86, c1);
    segT(ctx, jx, jy, ex, ey, w * 0.86, w * 0.72, c2);
    // 윗면 광만 살짝
    liteSeg(ctx, ox, oy, jx, jy, w, TONES(c1).lite);
    liteSeg(ctx, jx, jy, ex, ey, w * 0.82, TONES(c2).lite);
    return [ex, ey, jx, jy];
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
      const k = (p - 0.4) / 0.6;
      return -0.35 + 1.35 * (1 - Math.pow(1 - k, 2.2));   // 팍! 하고 스냅
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
        // 복싱 스탠스: 다리는 거의 편 자연스러운 자세, 가드는 앞으로 여유있게
        const br = Math.round(Math.sin(t * 0.07) * 1.3);       // 픽셀 단위 호흡
        const sway = Math.round(Math.sin(t * 0.045) * 1.2);
        p.hip = [sway * 0.5, 20 + br * 0.5];                   // 무릎 살짝만
        p.lean = 2;
        p.footF = [7, 0]; p.footB = [-7, 0];
        p.handF = [13 + sway * 0.4, 28 + br];                  // 앞손 리드 가드 (앞으로)
        p.handB = [6, 30 + br];                                // 뒷손 턱 옆
        break;
      }

      case 'walk': {
        // 보행 사이클 = 이동거리 동기 (발이 안 미끄러짐)
        const c = f.walkPhase !== undefined ? f.walkPhase : t * 0.12;
        const s = Math.sin(c), s2 = Math.sin(c + Math.PI);
        p.hip[1] = 20 + Math.abs(Math.cos(c)) * 0.9;
        p.footF = [s * 7 + 1, Math.max(0, Math.sin(c + 0.5)) * 2.4];
        p.footB = [s2 * 7 - 1, Math.max(0, Math.sin(c + Math.PI + 0.5)) * 2.4];
        p.lean = 2;
        p.handF = [12 + s * 1, 28]; p.handB = [5 - s * 1, 30];
        break;
      }

      case 'jump':
        if (f.vy > 1.2) {           // 상승: 무릎 끌어올려 웅크림
          p.hip[1] = 17;
          p.footF = [5, 10]; p.footB = [-2, 7];
          p.handF = [9, 31]; p.handB = [1, 33];
          p.lean = 4;
        } else if (f.vy > -1.2) {   // 정점: 몸이 펴짐
          p.hip[1] = 19;
          p.footF = [6, 5]; p.footB = [-4, 3];
          p.handF = [11, 30]; p.handB = [3, 32];
          p.lean = 1;
        } else {                    // 하강: 다리 내려 착지 준비
          p.hip[1] = 18;
          p.footF = [7, 3]; p.footB = [-5, 1];
          p.handF = [12, 28]; p.handB = [4, 30];
          p.lean = -1;
        }
        break;

      case 'crouch': {
        const charged = f.stateFrame >= 22;   // 기상기 충전 완료 → 더 깊이 웅크림
        p.hip = [0, charged ? 9.5 : 11]; p.lean = 3;
        p.footF = [7, 0]; p.footB = [-6, 0];
        p.handF = [8, charged ? 16 : 18]; p.handB = [3, charged ? 19 : 21];
        break;
      }

      case 'dash':
        // 가드를 유지한 채 미끄러지듯 전진 (팔 접힘 X)
        p.hip = [1, 19]; p.lean = 6;
        p.footF = [10, 1]; p.footB = [-4, 2];
        p.handF = [14, 28]; p.handB = [7, 30];
        break;

      case 'backdash':
        p.hip = [-1, 19.5]; p.lean = -5;
        p.footF = [3, 1.5]; p.footB = [-9, 0];
        p.handF = [13, 28]; p.handB = [6, 30];
        break;

      case 'block': {
        // 가드: 막는 순간 팔이 충격으로 몸쪽으로 밀렸다가 복귀
        const push = Math.max(0, 1 - f.stateFrame / 6) * 3;
        p.hip[1] = 19; p.lean = -2 - push * 0.5;
        p.handF = [10 - push, 30]; p.handB = [7 - push * 0.7, 26];
        break;
      }

      case 'crouchblock': {
        const push = Math.max(0, 1 - f.stateFrame / 6) * 2.5;
        p.hip = [0, 11]; p.lean = -1 - push * 0.5;
        p.footF = [7, 0]; p.footB = [-6, 0];
        p.handF = [8 - push, 21]; p.handB = [6 - push * 0.7, 17];
        break;
      }

      case 'attack': {
        const v = attackExt(f);
        const ex = Math.max(0, v);              // 뻗기
        const wu = Math.max(0, -v) / 0.35;      // 백스윙 (예비동작)
        const mk = f.moveKey;
        // 다리를 쫙 편 채 호를 그리는 킥 (반경 고정 → 무릎이 꺾이지 않음)
        const LEGR = LEG1 + LEG2 - 0.5;
        const legArc = (hip, a) => [hip[0] + LEGR * Math.sin(a), Math.max(0, hip[1] - LEGR * Math.cos(a))];
        if (mk === 'lp') {
          // 잽: 제자리에서 턱 높이로 스냅, 뒷손은 가드 유지
          p.handF = [12 - 4 * wu + 16 * ex, 29 + 4 * ex];   // 얼굴 높이로
          p.handB = [6, 30];
          p.lean = 1 + 3 * ex - 2 * wu;
          p.headDX = 1 - 0.8 * ex;                          // 턱 살짝 당기고
          p.footF = [7, 0]; p.footB = [-7, 0];
        } else if (mk === 'rp') {
          // 스트레이트: 어깨 회전으로 리치를 살리고, 자세는 무너지지 않게
          p.lean = 1 - 2 * wu + 5 * ex;                     // 상체 기울기 절제
          p.hip = [2 * ex, 19.5];
          p.shBX = -2 + 5 * ex;                             // 뒷어깨가 앞으로 돌아 나옴 (리치+)
          p.handB = [7 - 6 * wu + 27 * ex, 30 + 3 * ex];    // 턱 높이로, 더 길게
          p.handF = [13, 29.5];                             // 앞손은 기본 가드 그대로
          p.footF = [8, 0];                                 // 앞다리 쭉 펴고 고정
          p.footB = [-7 - 1 * ex, 2 * ex];                  // 뒷발 뒤꿈치 들림
        } else if (mk === 'lk') {
          // 앞발 미들킥: 무게중심을 뒤로 보내고 끝까지 쭉 뻗는다
          p.hip = [-1 - 2.5 * ex, 19.5];                               // 골반 뒤로
          p.lean = 1 - 2 * wu - 6 * ex;                                // 상체도 뒤로
          if (v < 0) { p.footF = [0, 9 + 4 * wu]; p.kneeF = 1; }       // 무릎 접어 들고
          else p.footF = [-1 + 23.5 * ex, 9 + 9.5 * ex];               // 명치 높이로 완전 신전
          p.handF = [9 - 2 * ex, 29]; p.handB = [4, 30];
          p.footB = [-5 - 1.5 * ex, 0];
        } else if (mk === 'rk') {
          // 뒷발 하이킥: 챔버에서 턱 높이로 곧장 후려침 (골반 회전 동반)
          p.hip = [3.5 * ex, 19.5];
          p.lean = 1 - 2 * wu - 8 * ex;                              // 상체를 확실히 눕히고
          if (v < 0) { p.footB = [-8, 5 + 4 * wu]; p.kneeB = 1; }      // 뒤에서 접어 들고
          else p.footB = [-8 + 33 * ex, 6 + 22.5 * ex];                // 턱으로 더 길게 쭉
          p.handF = [12 - 9 * ex, 28]; p.handB = [5 + 2 * ex, 30];
          p.footF = [6, 0];
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
          // 띄우기: 제자리 챔버 → 위로 곧장 차올림
          p.hip = [-2 * ex, 19.5]; p.lean = -7 * ex;
          if (v < 0) { p.footF = [0, 8 + 4 * wu]; p.kneeF = 1; }       // 챔버
          else p.footF = [13 * ex, 8 + 26 * ex];                       // 턱 위로 쭉
          p.handF = [8, 28]; p.handB = [-3 * ex, 27];
          p.footB = [-6, 0];
        } else if (mk === 'wakeKick') {
          // 기상킥: 낮은 자세에서 일어나며 곧장 앞차기
          p.hip = [0, 8 + 8 * ex]; p.lean = -2 - 2 * ex;
          if (v < 0) { p.footF = [2, 3 + 2 * wu]; p.kneeF = 1; }
          else p.footF = [2 + 18 * ex, 3 + 15 * ex];
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
        // 맞은 부위별 + 강도별 리액션 (잽은 머리만 톡, 강타는 크게)
        const amp = Math.min(1, (f.hitPower || 8) / 10);
        const wob = Math.max(0, 1 - f.stateFrame / 14) * amp;
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
        const wp = f.char.winPose;
        if (wp === 'cross') {
          // 림준범: 팔짱 끼고 미동도 없음
          p.hip = [0, 20]; p.lean = 0;
          p.footF = [6, 0]; p.footB = [-6, 0];
          p.handF = [1, 27]; p.handB = [4, 26];
          p.elbF = -1; p.elbB = 1;
          p.headDX = Math.sin(t * 0.04) > 0 ? 1 : 0;   // 고개만 까딱
        } else if (wp === 'glasses') {
          // 리동이: 안경 슥 올리기
          const up = Math.sin(t * 0.06) * 0.8;
          p.hip = [0, 20]; p.lean = 1;
          p.handF = [4, 37 + up];                       // 손이 안경으로
          p.elbF = 1;
          p.handB = [1, 24];
          p.headDY = up * 0.5;
        } else {
          // 림준(기본): 포효 — 양팔 들고 고개 젖힘
          const hop = Math.abs(Math.sin(t * 0.12));
          p.hip[1] = 20 + hop * 2;
          p.handF = [6 + Math.sin(t * 0.2) * 2, 44];
          p.handB = [-3, 43];
          p.elbF = 1; p.elbB = 1;
          p.headDX = -1; p.headDY = 1;
          p.lean = -2;
        }
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
      // 눈썹 (화난 캐릭터: 앞(눈쪽)이 내려가고 뒤가 올라간 굵은 사선)
      ctx.fillStyle = shade(c.hair, -8);
      if (body.brow === 'angry') {
        ctx.fillRect(Math.round(hx + 2.2), Math.round(hy + 4.0), 2.2, 1.8);   // 앞쪽 낮게
        ctx.fillRect(Math.round(hx + 0.4), Math.round(hy + 5.0), 2.2, 1.8);   // 뒤쪽 높게
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
    const shW = 4 + (body.shoulder || 0);       // 어깨 폭 (흉통 슬림)
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

    let p = poseFor(f);

    // ----- 포즈 보간: 상태 전환 시 5프레임 블렌딩 (자세 점프 방지) -----
    if (!f.ghost) {
      if (f._lastState !== f.state) {
        f._poseSnap = f._lastP || null;
        f._lastState = f.state;
      }
      const blendable = ['idle', 'walk', 'crouch', 'land', 'rise', 'jump', 'dash', 'backdash'];
      if (f._poseSnap && blendable.includes(f.state) && f.stateFrame <= 5 && !p.lying && !f._poseSnap.lying) {
        const k = Math.min(1, f.stateFrame / 5);
        const L = (a, b) => a + (b - a) * k;
        const LV = (a, b) => [L(a[0], b[0]), L(a[1], b[1])];
        const s = f._poseSnap;
        p = {
          ...p,
          hip: LV(s.hip, p.hip), lean: L(s.lean, p.lean),
          footF: LV(s.footF, p.footF), footB: LV(s.footB, p.footB),
          handF: LV(s.handF, p.handF), handB: LV(s.handB, p.handB),
          headDX: L(s.headDX, p.headDX), headDY: L(s.headDY || 0, p.headDY || 0)
        };
      } else if (f.stateFrame > 5) {
        f._poseSnap = null;
      }
      f._lastP = p;
    }

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
    const hb = limb(ctx, shX + (p.shBX !== undefined ? p.shBX : -2), shY - 1, p.handB[0], p.handB[1], ARM1, ARM2, p.elbB, 3.6,
      shade(armC1, -14), shade(col('skin'), -14));
    fist(ctx, hb[0], hb[1], flash ? '#fff' : shade(cfg.skin, -14));
    // 뒷다리 (신발은 IK로 실제 닿은 발끝에 — 다리에서 분리되지 않게)
    const fB = limb(ctx, hipX - 1.5, hipY, p.footB[0], p.footB[1] + 1, LEG1, LEG2, p.kneeB, 4.8,
      shade(col('pants'), -14), shade(col('pants'), -14));
    shoe(ctx, fB, flash ? '#fff' : shade(cfg.shoes, -14), f.y > 0.5);

    // ---- 몸통: 둥근 어깨 실루엣 + 3톤 명암 ----
    const tT = TONES(col('top'));
    const torsoPath = () => {
      ctx.beginPath();
      ctx.moveTo(hipX - 4, hipY - 1.5);
      ctx.lineTo(shX - shW + 0.5, shY - 2.5);
      ctx.quadraticCurveTo(shX - shW - 0.8, shY + 1.8, shX - shW + 2.6, shY + 2);    // 둥근 왼어깨
      ctx.lineTo(shX + shW - 2.6, shY + 2);
      ctx.quadraticCurveTo(shX + shW + 0.8, shY + 1.8, shX + shW - 0.5, shY - 2.5);  // 둥근 오른어깨
      ctx.lineTo(hipX + 4, hipY - 1.5);
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
      ctx.fillRect(Math.round(shX - shW + 1), Math.round(shY), shW * 2 - 2, 2);
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
    shoe(ctx, fF, col('shoes'), f.y > 0.5);

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

  // 신발: limb 결과([끝,관절])를 받아 그린다.
  // 차는 중이면 '밟을 때의 발 모양 그대로' 발목에서 90° 가깝게 젖혀
  // 발바닥이 상대를 향한다 (밀어차기 폼 — 발레처럼 눕히지 않음).
  function shoe(ctx, leg, color, airborne) {
    const T = TONES(color);
    const fx2 = leg[0], fy2 = leg[1] - 1;
    const kicking = fy2 > 3.5 || airborne;
    ctx.save();
    ctx.translate(Math.round(fx2), Math.round(fy2));
    if (kicking) {
      const shin = Math.atan2(leg[1] - leg[3], leg[0] - leg[2]);
      ctx.rotate(shin + 1.35);   // 정강이에서 ~78° 젖힘 = 발등 빡 보임
    }
    ctx.fillStyle = T.out;
    ctx.fillRect(-2.4, -1.6, 7.2, 3.4);
    ctx.fillRect(4.2, -1.2, 1.2, 2.6);              // 둥근 앞코
    ctx.fillStyle = color;
    ctx.fillRect(-1.8, -1, 6.4, 2.3);
    ctx.fillStyle = T.lite;
    ctx.fillRect(-1.4, 0.7, 5, 0.8);                // 윗면 광
    ctx.fillStyle = T.dark;
    ctx.fillRect(-1.8, -1, 6.4, 0.7);               // 밑창 그림자
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

  /* ---------- 초상화 (정면 얼굴 — 선택/HUD/승리 화면) ---------- */
  function drawPortrait(ctx, char, x, y, scale, flip) {
    const c = char.colors, body = char.body || {};
    const face = body.face || 'mixed';   // 'square' 각짐 | 'oval' 계란형 | 'mixed' 중간
    const sk = TONES(c.skin);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    // 목 + 어깨 (상의)
    ctx.fillStyle = TONES(c.top).out;
    ctx.fillRect(-9, 9, 18, 6);
    ctx.fillStyle = c.top;
    ctx.fillRect(-8, 10, 16, 5);
    ctx.fillStyle = sk.dark;
    ctx.fillRect(-2.5, 6.5, 5, 4.5);

    // ----- 얼굴 윤곽 (형태별) -----
    let fw, fh, jaw;                    // 폭, 높이, 턱 둥글기
    if (face === 'square') { fw = 12.5; fh = 13; jaw = 0.5; }
    else if (face === 'oval') { fw = 10.5; fh = 14.5; jaw = 2.2; }
    else { fw = 11.5; fh = 13.5; jaw = 1.3; }
    const hw = fw / 2, top = -fh + 6, bot = 6;
    // 외곽선
    ctx.fillStyle = sk.out;
    ctx.fillRect(-hw - 0.8, top + 1, fw + 1.6, fh - 2);
    ctx.fillRect(-hw + jaw - 0.8, top - 0.8, fw - jaw * 2 + 1.6, fh + 1.6);
    // 피부
    ctx.fillStyle = c.skin;
    ctx.fillRect(-hw, top + 1, fw, fh - 2);
    ctx.fillRect(-hw + jaw, top, fw - jaw * 2, fh);
    // 볼/턱 음영 (아래 그림자)
    ctx.fillStyle = sk.dark;
    ctx.fillRect(-hw + jaw, bot - 1.4, fw - jaw * 2, 1.4);
    ctx.fillRect(-hw, 2, 1.2, 3);
    ctx.fillRect(hw - 1.2, 2, 1.2, 3);
    // 귀
    ctx.fillStyle = c.skin;
    ctx.fillRect(-hw - 1.6, -1.5, 1.8, 3.5);
    ctx.fillRect(hw - 0.2, -1.5, 1.8, 3.5);

    // ----- 머리 (정면) -----
    ctx.fillStyle = c.hair;
    const hairTop = top - 2;
    if (char.hairStyle === 'parted') {
      // 가르마: 한쪽으로 쓸어넘긴 앞머리
      ctx.fillRect(-hw - 0.8, hairTop, fw + 1.6, 4.5);
      ctx.fillRect(-hw - 0.8, hairTop + 4, 2, 4);
      ctx.fillRect(hw - 1.2, hairTop + 4, 2, 4);
      ctx.fillRect(-hw + 1, hairTop + 4, fw * 0.55, 2.2);     // 프린지 사선
      ctx.fillRect(-hw + 3, hairTop + 5.5, fw * 0.3, 1.4);
      ctx.fillStyle = shade(c.hair, 32);
      ctx.fillRect(-hw + 1, hairTop + 1, fw - 3, 1.2);        // 윤기
    } else if (char.hairStyle === 'bowl') {
      // 내림머리: 일자 앞머리
      ctx.fillRect(-hw - 0.8, hairTop, fw + 1.6, 5.5);
      ctx.fillRect(-hw - 0.8, hairTop + 5, 1.8, 4);
      ctx.fillRect(hw - 1, hairTop + 5, 1.8, 4);
      ctx.fillStyle = shade(c.hair, 32);
      ctx.fillRect(-hw + 1.5, hairTop + 1, fw - 4, 1.2);
    } else if (char.hairStyle === 'cap') {
      // 거꾸로 쓴 볼캡 (정면: 챙이 뒤라 안 보임, 스냅백 밴드)
      ctx.fillRect(-hw - 0.5, hairTop + 3.5, fw + 1, 2);      // 머리카락 라인
      ctx.fillStyle = TONES(c.hair).out;
      ctx.fillRect(-hw - 1, hairTop - 1, fw + 2, 5);
      ctx.fillStyle = shade(c.hair, 22);
      ctx.fillRect(-hw - 0.5, hairTop - 0.5, fw + 1, 4);
      ctx.fillStyle = c.accent;
      ctx.fillRect(-1.5, hairTop + 0.5, 3, 2.2);              // 정면 로고
    } else if (char.hairStyle === 'spiky') {
      ctx.fillRect(-hw - 0.8, hairTop, fw + 1.6, 4);
      for (let i = 0; i < 5; i++) ctx.fillRect(-hw + i * (fw / 5), hairTop - 1.8, 2, 3);
    } else {
      ctx.fillRect(-hw - 0.8, hairTop, fw + 1.6, 4.5);
    }

    // ----- 눈썹 + 눈 (정면 두 개) -----
    const eyeY = -1.5, eyeDX = 2.6;
    if (body.brow === 'angry') {
      // 화난 눈썹: 안쪽(콧대)이 내려가고 바깥이 올라간 굵은 사선
      ctx.fillStyle = shade(c.hair, -6);
      for (const s of [-1, 1]) {
        ctx.fillRect(s * eyeDX - 1.6 + (s < 0 ? 0.4 : 0), eyeY - 2.2, 2, 1.6);   // 바깥 높게
        ctx.fillRect(s * eyeDX - 0.4 + (s < 0 ? 0.6 : -0.6), eyeY - 1.4, 1.8, 1.6); // 안쪽 낮게
      }
    } else {
      ctx.fillStyle = shade(c.hair, -6);
      ctx.fillRect(-eyeDX - 1.6, eyeY - 1.8, 3.2, 1.2);
      ctx.fillRect(eyeDX - 1.6, eyeY - 1.8, 3.2, 1.2);
    }
    if (body.glasses) {
      // 검정 뿔테 (정면: 두 렌즈 + 브릿지)
      ctx.fillStyle = body.glasses;
      ctx.fillRect(-eyeDX - 2.4, eyeY - 0.8, 4.8, 3.6);
      ctx.fillRect(eyeDX - 2.4, eyeY - 0.8, 4.8, 3.6);
      ctx.fillRect(-1, eyeY + 0.2, 2, 1);
      ctx.fillStyle = 'rgba(216,228,240,0.92)';
      ctx.fillRect(-eyeDX - 1.7, eyeY - 0.1, 3.4, 2.2);
      ctx.fillRect(eyeDX - 1.7, eyeY - 0.1, 3.4, 2.2);
      ctx.fillStyle = '#23232e';
      ctx.fillRect(-eyeDX - 0.6, eyeY + 0.3, 1.2, 1.6);
      ctx.fillRect(eyeDX - 0.6, eyeY + 0.3, 1.2, 1.6);
    } else {
      for (const s of [-1, 1]) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(s * eyeDX - 1.4, eyeY, 2.8, 2);
        ctx.fillStyle = '#23232e';
        ctx.fillRect(s * eyeDX - 0.6, eyeY, 1.2, 2);
        ctx.fillStyle = sk.dark;
        ctx.fillRect(s * eyeDX - 1.4, eyeY + 1.8, 2.8, 0.6);
      }
    }
    // 코 + 입
    ctx.fillStyle = sk.dark;
    ctx.fillRect(-0.6, 1.2, 1.2, 1.6);
    ctx.fillStyle = '#5a2c28';
    ctx.fillRect(-1.6, 3.8, 3.2, 1);

    ctx.restore();
  }

  return { drawFighter, drawPortrait, shade };
})();
