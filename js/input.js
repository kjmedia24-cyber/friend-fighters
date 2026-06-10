/* ============================================================
 * 입력 처리 — 키보드 상태 + 커맨드(↓→) 버퍼
 * P1: WASD + F(약공) G(강공) H(킥) T(잡기)
 * P2: 방향키 + ,(약공) .(강공) /(킥) 오른쪽Shift(잡기)
 * ============================================================ */

const Input = (() => {
  const down = {};        // code -> bool
  const pressed = {};     // code -> 이번 프레임에 눌림 (소비형)

  window.addEventListener('keydown', e => {
    if (!down[e.code]) pressed[e.code] = true;
    down[e.code] = true;
    // 게임 키 스크롤 방지
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Slash'].includes(e.code)) {
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', e => { down[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in down) down[k] = false; });

  const MAPS = [
    { // P1
      left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS',
      lp: 'KeyF', hp: 'KeyG', kick: 'KeyH', grab: 'KeyT'
    },
    { // P2
      left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown',
      lp: 'Comma', hp: 'Period', kick: 'Slash', grab: 'ShiftRight'
    }
  ];

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
  // facing(+1/-1)을 받아 ↓→(상대 방향) 커맨드를 감지
  class KeyboardController {
    constructor(playerIndex) {
      this.map = MAPS[playerIndex];
      this.buffer = [];   // {dir: 2|4|6|8, t: frame}
      this.frame = 0;
    }
    poll(facing) {
      this.frame++;
      const m = this.map;
      const dirX = (isDown(m.right) ? 1 : 0) - (isDown(m.left) ? 1 : 0);
      const dDown = isDown(m.down);
      // 방향 버퍼 기록 (넘패드 표기, facing 기준 6=전방)
      let dir = 5;
      if (dDown) dir = 2;
      else if (dirX === facing && dirX !== 0) dir = 6;
      else if (dirX === -facing && dirX !== 0) dir = 4;
      const last = this.buffer[this.buffer.length - 1];
      if (!last || last.dir !== dir) this.buffer.push({ dir, t: this.frame });
      if (this.buffer.length > 16) this.buffer.shift();

      return {
        dirX,
        up: isDown(m.up),
        upPressed: consume(m.up),
        down: dDown,
        lp: consume(m.lp),
        hp: consume(m.hp),
        kick: consume(m.kick),
        grab: consume(m.grab),
        qcf: this.checkQCF()
      };
    }
    // 최근 22프레임 내 ↓ 다음 → 입력이 있었는가
    checkQCF() {
      const now = this.frame, win = 22;
      let sawDown = -1;
      for (const e of this.buffer) {
        if (now - e.t > win) continue;
        if (e.dir === 2) sawDown = e.t;
        else if (e.dir === 6 && sawDown >= 0 && e.t >= sawDown) return true;
      }
      return false;
    }
    clearBuffer() { this.buffer.length = 0; }
  }

  return { isDown, consume, anyPressed, clearPressed, KeyboardController, MAPS };
})();
