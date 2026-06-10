/* ============================================================
 * AI 대전 상대 — KeyboardController 와 같은 poll() 인터페이스
 * 난이도: easy / normal / hard
 * ============================================================ */

const AI_LEVELS = {
  easy:   { label: '쉬움',   interval: 28, aggression: 0.35, blockProb: 0.12, special: 0.04, juggle: false, jumpIn: 0.10, grabber: 0.05 },
  normal: { label: '보통',   interval: 15, aggression: 0.55, blockProb: 0.40, special: 0.16, juggle: true,  jumpIn: 0.18, grabber: 0.14 },
  hard:   { label: '어려움', interval: 8,  aggression: 0.80, blockProb: 0.70, special: 0.30, juggle: true,  jumpIn: 0.22, grabber: 0.22 }
};

class AIController {
  constructor(level) {
    this.cfg = AI_LEVELS[level] || AI_LEVELS.normal;
    this.level = level;
    this.frame = 0;
    this.plan = { action: 'wait', ttl: 10 };
    this.self = null;
    this.opp = null;
  }
  attach(self, opp) { this.self = self; this.opp = opp; }
  clearBuffer() { this.plan = { action: 'wait', ttl: 10 }; }

  neutral() {
    return { dirX: 0, up: false, upPressed: false, down: false, lp: false, hp: false, kick: false, grab: false, qcf: false };
  }

  decide() {
    const c = this.cfg, s = this.self, o = this.opp;
    const dist = Math.abs(o.x - s.x);
    const r = Math.random();

    // 상대가 다운 상태: 거리 조절하며 대기
    if (['knockdown', 'getup', 'ko'].includes(o.state)) {
      this.plan = dist < 60 ? { action: 'retreat', ttl: 14 } : { action: 'wait', ttl: 12 };
      return;
    }
    // 저글링: 상대가 떠 있으면 추격해서 공중 콤보
    if (c.juggle && o.state === 'launched' && o.y > 6) {
      this.plan = { action: 'juggle', ttl: 30 };
      return;
    }
    // 상대 공격 감지 → 가드 (홀드백)
    const oppThreat = (o.state === 'attack' || o.state === 'special') && dist < 56;
    if (oppThreat && r < c.blockProb) {
      this.plan = { action: 'defend', ttl: 18 + Math.random() * 12 };
      return;
    }
    // 상대가 가드만 함 → 잡기
    const oppTurtling = o.isGrounded() && o.inputs && o.inputs.dirX !== 0 &&
      ((o.x < s.x && o.inputs.dirX < 0) || (o.x > s.x && o.inputs.dirX > 0));
    if (oppTurtling && dist < 26 && r < c.grabber) {
      this.plan = { action: 'grab', ttl: 6 };
      return;
    }

    if (dist < 30) {
      // 근거리
      if (r < c.aggression) {
        const roll = Math.random();
        if (roll < c.special) this.plan = { action: 'special', ttl: 6 };
        else if (roll < c.special + 0.2 && c.juggle) this.plan = { action: 'launcher', ttl: 6 };
        else if (roll < 0.55) this.plan = { action: 'press', move: 'lp', ttl: 6 };
        else if (roll < 0.8) this.plan = { action: 'press', move: 'hp', ttl: 6 };
        else this.plan = { action: 'press', move: 'kick', ttl: 6 };
      } else {
        this.plan = r < 0.5 ? { action: 'retreat', ttl: 12 } : { action: 'wait', ttl: 8 };
      }
    } else if (dist < 60) {
      // 중거리
      if (r < c.aggression * 0.8) {
        this.plan = Math.random() < 0.4
          ? { action: 'press', move: 'kick', ttl: 6 }
          : { action: 'approach', ttl: 14 };
      } else if (r < c.aggression * 0.8 + c.jumpIn) {
        this.plan = { action: 'jumpin', ttl: 40, jumped: false };
      } else {
        this.plan = { action: 'wait', ttl: 10 };
      }
    } else {
      // 원거리: 접근 (가끔 점프 접근)
      this.plan = Math.random() < c.jumpIn
        ? { action: 'jumpin', ttl: 45, jumped: false }
        : { action: 'approach', ttl: 20 };
    }
  }

  poll() {
    this.frame++;
    const inp = this.neutral();
    const s = this.self, o = this.opp;
    if (!s || !o) return inp;

    this.plan.ttl--;
    if (this.plan.ttl <= 0) this.decide();
    // 위급 상황 즉시 재판단 (어려움일수록 빠른 반응)
    if (this.frame % this.cfg.interval === 0) this.decide();

    const toward = o.x > s.x ? 1 : -1;
    const dist = Math.abs(o.x - s.x);
    const p = this.plan;

    switch (p.action) {
      case 'approach': inp.dirX = toward; break;
      case 'retreat':
      case 'defend':   inp.dirX = -toward; break;
      case 'wait': break;
      case 'press':
        if (s.isNeutral() && s.isGrounded()) { inp[p.move] = true; p.ttl = 0; }
        else inp.dirX = toward;
        break;
      case 'launcher':
        if (s.isNeutral() && s.isGrounded()) { inp.kick = true; inp.qcf = true; p.ttl = 0; }
        break;
      case 'special':
        if (s.isNeutral() && s.isGrounded()) { inp.hp = true; inp.qcf = true; p.ttl = 0; }
        break;
      case 'grab':
        if (s.isNeutral() && s.isGrounded()) { inp.grab = true; p.ttl = 0; }
        else inp.dirX = toward;
        break;
      case 'jumpin':
        if (!p.jumped && s.isGrounded() && s.isNeutral()) {
          inp.upPressed = true; inp.up = true; inp.dirX = toward; p.jumped = true;
        } else if (p.jumped && !s.isGrounded() && dist < 44 && !s.airAttackUsed) {
          inp.kick = true;
        } else {
          inp.dirX = toward;
        }
        if (p.jumped && s.isGrounded() && p.ttl < 30) p.ttl = 0;
        break;
      case 'juggle':
        if (o.state !== 'launched' || o.y <= 2) { p.ttl = 0; break; }
        if (dist > 24) inp.dirX = toward;
        else if (s.isNeutral() && s.isGrounded()) {
          // 공중 콤보: 가볍게 띄워 올리기, 가끔 강공 마무리
          if (Math.random() < 0.3 && this.level === 'hard') inp.hp = true;
          else inp.lp = true;
        }
        break;
    }
    // 가끔 실수로 잡기 풀기 시도 (잡혔을 때)
    if (s.state === 'grabbed' && Math.random() < (this.level === 'hard' ? 0.25 : 0.06)) {
      inp.grab = true;
    }
    return inp;
  }
}
