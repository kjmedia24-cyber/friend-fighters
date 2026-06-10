/* ============================================================
 * AI 대전 상대 — KeyboardController 와 같은 poll() 인터페이스
 * 난이도: easy / normal / hard
 * 철권식: 스트링 사용, 하단/중단 이지선다, 대시 인, 저글링,
 *         타입별 특수기 (커맨드잡기/장풍/받아치기/콤보시동)
 * ============================================================ */

const AI_LEVELS = {
  easy:   { label: '쉬움',   interval: 28, aggression: 0.35, blockProb: 0.12, lowBlock: 0.1,  special: 0.05, juggle: false, jumpIn: 0.10, grabber: 0.05, dash: 0.05, stringP: 0.2 },
  normal: { label: '보통',   interval: 15, aggression: 0.55, blockProb: 0.40, lowBlock: 0.3,  special: 0.16, juggle: true,  jumpIn: 0.15, grabber: 0.14, dash: 0.15, stringP: 0.5 },
  hard:   { label: '어려움', interval: 8,  aggression: 0.80, blockProb: 0.70, lowBlock: 0.55, special: 0.28, juggle: true,  jumpIn: 0.18, grabber: 0.22, dash: 0.3,  stringP: 0.8 }
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
    return {
      dirX: 0, up: false, upPressed: false, down: false,
      lp: false, rp: false, lk: false, rk: false,
      grab: false, qcf: false, qcb: false, dashF: false, dashB: false, ws: false
    };
  }

  decide() {
    const c = this.cfg, s = this.self, o = this.opp;
    const dist = Math.abs(o.x - s.x);
    const r = Math.random();
    const arch = s.char.archetype;

    // 상대가 다운: 거리 조절
    if (['knockdown', 'getup', 'ko'].includes(o.state)) {
      this.plan = dist < 60 ? { action: 'retreat', ttl: 14 } : { action: 'wait', ttl: 12 };
      return;
    }
    // 저글링: 떠 있는 상대 추격 → 공중 콤보
    if (c.juggle && o.state === 'launched' && o.y > 6) {
      this.plan = { action: 'juggle', ttl: 36 };
      return;
    }
    // 상대 공격 감지 → 가드 (어려움은 하단도 종종 막음)
    const oppThreat = (o.state === 'attack' || o.state === 'special') && dist < 56;
    if (oppThreat) {
      // 트릭스터: 가끔 받아치기로 응수
      if (arch === 'trickster' && s.special2Def && r < c.special * 0.8 && dist < 40) {
        this.plan = { action: 'counter', ttl: 6 };
        return;
      }
      if (r < c.blockProb) {
        const oppLow = o.moveDef && o.moveDef.level === 'low';
        this.plan = {
          action: 'defend', ttl: 18 + Math.random() * 12,
          low: oppLow ? Math.random() < 0.85 : Math.random() < c.lowBlock * 0.4
        };
        return;
      }
    }
    // 상대가 거북이(가드만) → 잡기 or 하단
    const oppTurtling = o.isGrounded() && o.inputs && o.inputs.dirX !== 0 &&
      ((o.x < s.x && o.inputs.dirX < 0) || (o.x > s.x && o.inputs.dirX > 0));
    if (oppTurtling && dist < 30 && r < c.grabber) {
      this.plan = Math.random() < 0.5
        ? { action: 'grab', ttl: 6 }
        : { action: 'low', ttl: 6 };
      return;
    }

    if (dist < 30) {
      // 근거리
      if (r < c.aggression) {
        const roll = Math.random();
        if (roll < c.special) {
          // 타입별 주력기 (발동까지 좀 기다려준다)
          if (arch === 'trickster') this.plan = { action: 'launcher', ttl: 16 };
          else this.plan = { action: 'special', ttl: 16 };     // 커맨드 잡기 / 콤보 시동 어퍼
        } else if (roll < c.special + 0.18 && c.juggle) {
          this.plan = { action: 'launcher', ttl: 16 };
        } else if (roll < c.special + 0.18 + c.stringP * 0.4 && s.char.strings) {
          // 스트링! (마지막 타 상/하단 랜덤)
          const str = s.char.strings[Math.floor(Math.random() * s.char.strings.length)];
          this.plan = { action: 'string', seq: str.steps.map(st => st.btn), i: 0, cd: 0, ttl: 60 };
        } else if (roll < 0.6) {
          this.plan = { action: 'press', move: Math.random() < 0.5 ? 'lp' : 'rp', ttl: 6 };
        } else if (roll < 0.8) {
          this.plan = { action: 'low', ttl: 6 };       // 짠발로 갉아먹기
        } else {
          this.plan = { action: 'press', move: 'lk', ttl: 6 };
        }
      } else {
        this.plan = r < 0.5 ? { action: 'retreat', ttl: 12 } : { action: 'wait', ttl: 8 };
      }
    } else if (dist < 60) {
      // 중거리
      if (arch === 'trickster' && r < c.special && !s.projActive) {
        this.plan = { action: 'special', ttl: 8 };     // 장풍
      } else if (r < c.aggression * 0.7) {
        if (Math.random() < c.dash) this.plan = { action: 'dashin', ttl: 24, dashed: false };
        else if (Math.random() < 0.35) this.plan = { action: 'press', move: 'lk', ttl: 6 };
        else if (Math.random() < 0.25) this.plan = { action: 'sweep', ttl: 6 };
        else this.plan = { action: 'approach', ttl: 14 };
      } else if (r < c.aggression * 0.7 + c.jumpIn) {
        this.plan = { action: 'jumpin', ttl: 40, jumped: false };
      } else {
        this.plan = { action: 'wait', ttl: 10 };
      }
    } else {
      // 원거리
      if (arch === 'trickster' && r < c.special * 1.6 && !s.projActive) {
        this.plan = { action: 'special', ttl: 8 };     // 장풍 견제
      } else if (Math.random() < c.dash) {
        this.plan = { action: 'dashin', ttl: 26, dashed: false };
      } else if (Math.random() < c.jumpIn) {
        this.plan = { action: 'jumpin', ttl: 45, jumped: false };
      } else {
        this.plan = { action: 'approach', ttl: 20 };
      }
    }
  }

  poll() {
    this.frame++;
    const inp = this.neutral();
    const s = this.self, o = this.opp;
    if (!s || !o) return inp;

    this.plan.ttl--;
    if (this.plan.ttl <= 0) this.decide();
    if (this.frame % this.cfg.interval === 0 && this.plan.action !== 'string') this.decide();

    const toward = o.x > s.x ? 1 : -1;
    const dist = Math.abs(o.x - s.x);
    const p = this.plan;

    switch (p.action) {
      case 'approach': inp.dirX = toward; break;
      case 'retreat': inp.dirX = -toward; break;
      case 'defend':
        inp.dirX = -toward;
        if (p.low) inp.down = true;        // 하단 가드
        break;
      case 'wait': break;
      case 'press':
        if (s.isNeutral() && s.isGrounded()) { inp[p.move] = true; p.ttl = 0; }
        else inp.dirX = toward;
        break;
      case 'string':
        // 스트링 입력: 8프레임 간격으로 다음 버튼
        if (p.cd > 0) { p.cd--; break; }
        if (p.i === 0) {
          if (s.isNeutral() && s.isGrounded()) { inp[p.seq[0]] = true; p.i++; p.cd = 9; }
          else inp.dirX = toward;
        } else if (p.i < p.seq.length) {
          if (s.state === 'attack') { inp[p.seq[p.i]] = true; p.i++; p.cd = 9; }
          else p.ttl = 0;   // 끊김
        } else p.ttl = 0;
        break;
      case 'low':
        if (s.isNeutral() && s.isGrounded()) { inp.down = true; inp.lk = true; p.ttl = 0; }
        else inp.dirX = toward;
        break;
      case 'sweep':
        if (s.isNeutral() && s.isGrounded()) { inp.down = true; inp.rk = true; p.ttl = 0; }
        break;
      case 'launcher':
        if (s.isNeutral() && s.isGrounded()) {
          if (Math.random() < 0.25) inp.ws = true;   // 가끔 기상 어퍼로
          else { inp.lk = true; inp.qcf = true; }
          p.ttl = 0;
        } else if (dist > 30) inp.dirX = toward;
        break;
      case 'special':
        if (s.isNeutral() && s.isGrounded()) { inp.rp = true; inp.qcf = true; p.ttl = 0; }
        else if (dist > 30) inp.dirX = toward;
        break;
      case 'counter':
        if (s.isNeutral() && s.isGrounded()) { inp.rp = true; inp.qcb = true; p.ttl = 0; }
        break;
      case 'grab':
        if (s.isNeutral() && s.isGrounded()) { inp.grab = true; p.ttl = 0; }
        else inp.dirX = toward;
        break;
      case 'dashin':
        if (!p.dashed && s.isNeutral() && s.isGrounded()) { inp.dashF = true; p.dashed = true; }
        else if (p.dashed && (s.state === 'dash' || dist < 32)) {
          if (s.stateFrame >= 4 || s.isNeutral()) {
            inp[Math.random() < 0.5 ? 'rp' : 'lp'] = true;
            p.ttl = 0;
          }
        } else inp.dirX = toward;
        break;
      case 'jumpin':
        if (!p.jumped && s.isGrounded() && s.isNeutral()) {
          inp.upPressed = true; inp.up = true; inp.dirX = toward; p.jumped = true;
        } else if (p.jumped && !s.isGrounded() && dist < 44 && !s.airAttackUsed) {
          inp.lk = true;
        } else {
          inp.dirX = toward;
        }
        if (p.jumped && s.isGrounded() && p.ttl < 30) p.ttl = 0;
        break;
      case 'juggle':
        if (o.state !== 'launched' || o.y <= 2) { p.ttl = 0; break; }
        if (dist > 26) {
          inp.dirX = toward;
          if (dist > 50 && this.level === 'hard' && s.isNeutral()) inp.dashF = true;
        } else if (s.isNeutral() && s.isGrounded()) {
          // 공중 콤보: 잽으로 계속 띄우고, 가끔 강타 마무리
          if (Math.random() < 0.3 && this.level === 'hard') inp.rp = true;
          else inp.lp = true;
        }
        break;
    }
    // 잡혔을 때 풀기 시도
    if (s.state === 'grabbed' && Math.random() < (this.level === 'hard' ? 0.2 : 0.05)) {
      inp.lp = true;
    }
    return inp;
  }
}
