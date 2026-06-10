/* ============================================================
 * 입력 처리 — 철권식 4버튼 (왼손/오른손/왼발/오른발)
 *
 * AI 대전(1인): 방향키 이동 + A(왼손) S(오른손) Z(왼발) X(오른발)
 * 2인 대전:    P1 = WASD + R(왼손) T(오른손) F(왼발) G(오른발)
 *              P2 = 방향키 + U(왼손) I(오른손) J(왼발) K(오른발)
 *
 * 커맨드: →→ 앞스텝 / ←← 백대시 / ↓→+버튼 / 잡기 = 왼손+오른손 동시
 * ============================================================ */

const Input = (() => {
  const down = {};        // code -> bool
  const pressed = {};     // code -> 이번 프레임에 눌림 (소비형)

  window.addEventListener('keydown', e => {
    if (!down[e.code]) pressed[e.code] = true;
    down[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Slash'].includes(e.code)) {
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', e => { down[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in down) down[k] = false; });

  const MAPS = {
    solo: { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown',
            lp: 'KeyA', rp: 'KeyS', lk: 'KeyZ', rk: 'KeyX', guard: 'Space' },
    p1:   { left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS',
            lp: 'KeyR', rp: 'KeyT', lk: 'KeyF', rk: 'KeyG', guard: 'KeyE' },
    p2:   { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown',
            lp: 'KeyU', rp: 'KeyI', lk: 'KeyJ', rk: 'KeyK', guard: 'KeyO' }
  };

  function isDown(code) { return !!down[code]; }
  function consume(code) {
    if (pressed[code]) { pressed[code] = false; return true; }
    return false;
  }
  function anyPressed() {
    for (const k in pressed) if (pressed[k]) { return true; }
    return false;
  }
  function clearPressed() { for (const k in pressed) pressed[k] = false; }

  /* ---------- 플레이어 컨트롤러 ---------- */
  class KeyboardController {
    constructor(mapName) {
      this.map = MAPS[mapName];
      this.buffer = [];     // 방향 변화 기록 {dir: 2|4|5|6, t}
      this.frame = 0;
      this.lpPend = 0;      // 잡기(동시입력) 판정용 지연 버퍼
      this.rpPend = 0;
    }

    poll(facing) {
      this.frame++;
      const m = this.map;
      const dirX = (isDown(m.right) ? 1 : 0) - (isDown(m.left) ? 1 : 0);
      const dDown = isDown(m.down);

      // 방향 버퍼 (넘패드 표기, facing 기준 6 = 전방, 3 = 전방+아래 대각)
      let dir = 5;
      if (dDown && dirX === facing && dirX !== 0) dir = 3;
      else if (dDown) dir = 2;
      else if (dirX === facing && dirX !== 0) dir = 6;
      else if (dirX === -facing && dirX !== 0) dir = 4;
      const last = this.buffer[this.buffer.length - 1];
      if (!last || last.dir !== dir) this.buffer.push({ dir, t: this.frame });
      if (this.buffer.length > 16) this.buffer.shift();

      // 왼손+오른손 동시입력 = 잡기 (2프레임 유예)
      // 펀치는 pend 지연 후 발동되므로 '눌렀던 순간'의 방향을 스냅샷해 같이 넘긴다
      const rawLp = consume(m.lp), rawRp = consume(m.rp);
      let lp = false, rp = false, grab = false, pressDirX = 0;
      if (rawLp && rawRp) grab = true;
      else if (rawLp) {
        if (this.rpPend > 0) { grab = true; this.rpPend = 0; }
        else { this.lpPend = 3; this.lpDir = dirX; }
      } else if (rawRp) {
        if (this.lpPend > 0) { grab = true; this.lpPend = 0; }
        else { this.rpPend = 3; this.rpDir = dirX; }
      }
      if (!grab) {
        if (this.lpPend > 0 && --this.lpPend === 0) { lp = true; pressDirX = this.lpDir || 0; }
        if (this.rpPend > 0 && --this.rpPend === 0) { rp = true; pressDirX = this.rpDir || 0; }
      } else { this.lpPend = 0; this.rpPend = 0; }

      return {
        dirX,
        pressDirX,              // 펀치를 눌렀던 순간의 방향 (커맨드 노멀 판정용)
        up: isDown(m.up),
        upPressed: consume(m.up),
        down: dDown,
        lp, rp,
        lk: consume(m.lk),
        rk: consume(m.rk),
        grab,
        guard: isDown(m.guard),
        qcf: this.checkQC(6),
        qcb: this.checkQC(4),
        dashF: this.checkDoubleTap(6),
        dashB: this.checkDoubleTap(4),
        ws: false               // AI 전용 플래그 (사람은 ↓ 홀드 후 릴리즈)
      };
    }

    // 최근 22프레임 내 ↓ 다음 전방(6) 또는 후방(4) 입력
    // ↓ → ↘ → → 처럼 대각(3)을 거쳐도 인정 (입력 여유)
    checkQC(endDir) {
      const now = this.frame, win = 22;
      const diag = endDir === 6 ? 3 : 1;
      let sawDownT = -1;
      for (const e of this.buffer) {
        if (now - e.t > win) continue;
        if (e.dir === 2) sawDownT = e.t;
        else if ((e.dir === endDir || e.dir === diag) && sawDownT >= 0 && e.t > sawDownT) return true;
      }
      return false;
    }

    // 같은 방향 두 번 톡톡 (→→ 또는 ←←), 16프레임 이내
    checkDoubleTap(d) {
      const b = this.buffer;
      if (b.length < 3) return false;
      const lastE = b[b.length - 1];
      if (lastE.dir !== d || lastE.t !== this.frame) return false; // 이번 프레임 전환만
      for (let i = b.length - 2; i >= 0; i--) {
        const e = b[i];
        if (this.frame - e.t > 16) return false;
        if (e.dir === d) return true;
        if (e.dir !== 5) return false;  // 사이에 다른 방향이 끼면 무효
      }
      return false;
    }

    clearBuffer() { this.buffer.length = 0; this.lpPend = 0; this.rpPend = 0; }
  }

  // 터치 가상패드 등에서 합성 키 입력
  function press(code) {
    if (!down[code]) pressed[code] = true;
    down[code] = true;
  }
  function release(code) { down[code] = false; }

  return { isDown, consume, anyPressed, clearPressed, press, release, KeyboardController, MAPS };
})();
