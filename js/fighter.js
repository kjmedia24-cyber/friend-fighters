/* ============================================================
 * Fighter — 철권식 상태머신 + 경량 물리
 *
 * 핵심 규칙:
 *  - 상단(high): 앉으면 통째로 휘피 / 중단(mid): 앉아가드 뚫음 /
 *    하단(low): 앉아 가드만 가능
 *  - 캐릭터별 스트링(연속기): 공격 후딜을 다음 타로 캔슬,
 *    마지막 타 상/하단 분기로 가드 이지선다
 *  - 띄우기(↓→킥, 기상어퍼) → 공중 콤보 (저글링 중력 보정)
 *  - 카운터 히트: 시동 중인 상대를 때리면 1.4배 + 긴 휘청
 *  - 잡기 = 왼손+오른손 동시입력, 잡힌 직후 펀치로 풀기
 *  - 특수기 타입: commandGrab / projectile / counterStance /
 *                 uppercut(콤보 시동) / rushKick / quake + 각성 패시브
 * ============================================================ */

const GRAV = 0.34;        // 낙하가 너무 빠르지 않게
const GRAV_AIR = 0.30;    // 띄워진 상태 (저글링용 가벼운 중력)
const JUMP_VY = 4.9;      // 철권식 낮은 호핑
const JUMP_CD = 14;       // 착지 후 재점프 딜레이 (~0.23초)
const WS_CHARGE = 22;     // (AI 전용) 기상 어퍼
const DASH_CD = 26;       // 대시 재사용 딜레이

// 특수기 설정 → 런타임 프레임데이터
function buildSpecialDef(sp) {
  if (!sp) return null;
  const base = { name: sp.name, dmg: sp.dmg, kind: sp.type };
  switch (sp.type) {
    case 'uppercut': return {
      ...base, level: 'mid',
      startup: 13, active: 6, recovery: 17,   // 콤보 시동기는 후딜이 짧아야 저글링이 된다
      reach: 34, hitY: 30, hbH: 38,
      kb: 2.0, kbUp: 7.6, hitstun: 40, blockstun: 14,
      lunge: 0.5, fx: 'flame', comboStarter: !!sp.comboStarter
    };
    case 'commandGrab': return {
      ...base,
      startup: 18, active: 5, recovery: 32, reach: 34
    };
    case 'projectile': return {
      ...base, level: 'mid',
      startup: 16, active: 2, recovery: 26,
      speed: 3.4, style: sp.style
    };
    case 'counterStance': return {
      ...base,
      startup: 4, active: 24, recovery: 18
    };
    case 'rushKick': return {
      ...base, level: 'mid',
      startup: 9, active: 21, recovery: 18,
      reach: 32, hitY: 24, hbH: 22,
      hitTimes: [9, 16, 23], hitWindow: 4,
      kb: 1.0, lastKb: 4.6, kbUp: 0, hitstun: 15, blockstun: 9,
      lunge: 1.5, fx: 'bolt', wallSplat: true
    };
    case 'quake': default: return {
      ...base, level: 'low',
      startup: 22, active: 4, recovery: 30,
      range: 78, unblockable: true,
      kb: 5, kbUp: 4.2, hitstun: 50, blockstun: 0,
      fx: 'dust', hardKD: true
    };
  }
}

class Fighter {
  constructor(char, playerIndex) {
    this.char = char;
    this.playerIndex = playerIndex;
    this.specialDef = buildSpecialDef(char.special);
    this.special2Def = buildSpecialDef(char.special2);
    this.controller = null;
    this.opponent = null;
    this.reset(0, 1);
  }

  reset(x, facing) {
    this.maxHp = this.char.stats.hp;
    this.hp = this.maxHp;
    this.x = x; this.y = 0;
    this.vx = 0; this.vy = 0;
    this.facing = facing;
    this.state = 'idle';
    this.stateFrame = 0;
    this.animT = Math.random() * 100;
    this.moveKey = null; this.moveDef = null;
    this.hitDone = false;
    this.multiIdx = 0;
    this.stringCands = [];
    this.hitstunT = 0;
    this.hitLevel = 'mid';
    this.flashT = 0;
    this.invulnT = 0;
    this.spin = 0;
    this.comboTaken = 0;
    this.maxCombo = 0;
    this.juggleLight = 0;      // 콤보 시동 버프 (저글링 보너스 잔여 타수)
    this.wallSplatUsed = false;
    this.airAttackUsed = false;
    this.airborneAttack = false;
    this.hardKD = false;
    this.dead = false;
    this.awakened = false;
    this.rage = false;
    this.jumpCdT = 0;
    this.stayDownT = 0;
    this.cmdGrab = false;
    this.projActive = false;
    this.lastGrabPressT = -999;
    this.grabPartnerLock = 0;
    this.trail = [];           // 잔상 (대시/특수기 고스트)
    this.guardGauge = 100;     // 가드 게이지 (0 = 가드 브레이크)
    this.sealT = 0;            // 퍼펙트 가드 당함 → 공격/가드 봉인 시간
    this.dashCdT = 0;
    this.bufQ = null;          // 입력 버퍼 (후딜 중 누른 키 기억)
    this.guardHoldT = 0;
    this.guardReGrabT = 0;     // 가드 뗐다 재진입 쿨다운 (퍼펙트 연타 방지)
    this.walkBack = false;
    this.cmdNormT = 0;         // 방향 커맨드 노멀 연타 방지 쿨다운
    this.lastCmdNorm = null;
    this.recentDirX = 0;       // 방향 유예 (버튼이 살짝 늦어도 커맨드 인정)
    this.recentDirT = 0;
    this.swingSfxT = null;     // 휘두름 소리 예약 (스냅 시점)
    this.inputs = this.neutralInputs();
    if (this.controller && this.controller.clearBuffer) this.controller.clearBuffer();
  }

  // 잔상 스냅샷 (드로잉에 필요한 필드만)
  snapshot() {
    return {
      char: this.char, x: this.x, y: this.y, facing: this.facing,
      state: this.state, stateFrame: this.stateFrame, animT: this.animT,
      moveKey: this.moveKey, moveDef: this.moveDef, hitLevel: this.hitLevel,
      spin: this.spin, flashT: 0, ghost: true
    };
  }

  neutralInputs() {
    return {
      dirX: 0, up: false, upPressed: false, down: false,
      lp: false, rp: false, lk: false, rk: false,
      grab: false, guard: false, qcf: false, qcb: false, dashF: false, dashB: false, ws: false
    };
  }

  setState(s) {
    this.state = s;
    this.stateFrame = 0;
    if (s === 'idle' || s === 'walk' || s === 'crouch') {
      this.comboTaken = 0;
      this.juggleLight = 0;
      this.wallSplatUsed = false;
    }
  }

  powerMul() {
    return this.char.stats.power *
      (this.awakened ? this.char.awaken.mul : 1) *
      (this.rage ? 1.12 : 1);
  }

  isGrounded() { return this.y <= 0.01; }
  isNeutral() { return ['idle', 'walk', 'crouch', 'jump'].includes(this.state); }

  isCrouched() {
    if (this.state === 'crouch' || this.state === 'crouchblock') return true;
    if (this.state === 'attack' && this.moveDef && this.moveDef.crouch) return true;
    return false;
  }

  isVulnerable() {
    if (this.invulnT > 0) return false;
    return !['knockdown', 'getup', 'ko', 'grabbed', 'grabbing', 'win', 'intro'].includes(this.state);
  }

  hurtbox() {
    const lying = ['knockdown', 'ko'].includes(this.state);
    const h = lying ? 10 : this.isCrouched() ? 26 : 42;
    return { x1: this.x - 7, x2: this.x + 7, y1: this.y, y2: this.y + h };
  }

  /* ============ 메인 업데이트 ============ */
  update(stage, active) {
    this.animT++;
    if (this.flashT > 0) this.flashT--;
    if (this.invulnT > 0) this.invulnT--;

    this.inputs = (active && this.controller) ? this.controller.poll(this.facing) : this.neutralInputs();
    if (this.inputs.grab) this.lastGrabPressT = this.animT;
    // 방향 유예: 방향키를 뗀 직후 ~6프레임 내 버튼도 커맨드 노멀로 인정
    // (펀치는 잡기 판별 pend 3프레임 뒤에 발동되므로 그만큼 넉넉히)
    if (this.inputs.dirX !== 0) { this.recentDirX = this.inputs.dirX; this.recentDirT = 6; }
    else if (this.recentDirT > 0) this.recentDirT--;
    else this.recentDirX = 0;

    // 각성 (밸런스 콤보형 패시브)
    if (this.char.awaken && !this.awakened && this.hp > 0 &&
        this.hp / this.maxHp <= this.char.awaken.ratio) {
      this.awakened = true;
      FX.addText(this.x, Stages.GROUND_Y - 72,
        this.char.awaken.quote || (this.char.awaken.label || '각성') + '!!',
        this.char.colors.accent, true);
      FX.flame(this.x, Stages.GROUND_Y - 20, 16);
      FX.shake(3);
      FX.sfx.special();
    }
    if (this.awakened && this.hp > 0 && this.animT % 5 < 1 && !['knockdown', 'ko'].includes(this.state)) {
      FX.flame(this.x - this.facing * 4, Stages.GROUND_Y - this.y - 6 - Math.random() * 24, 1);
    }
    // 레이지 (전 캐릭터 공통 — 각성 보유자는 각성이 대신함)
    if (!this.char.awaken && !this.rage && this.hp > 0 && this.hp / this.maxHp <= 0.25) {
      this.rage = true;
      FX.addText(this.x, Stages.GROUND_Y - 72, '레이지!!', '#ff3c3c', true);
      FX.hitSpark(this.x, Stages.GROUND_Y - 26, 4, '#ff3c3c');
      FX.sfx.special();
    }
    if (this.rage && this.hp > 0 && this.animT % 7 < 1 && !['knockdown', 'ko'].includes(this.state)) {
      FX.bolt(this.x - this.facing * 3, Stages.GROUND_Y - this.y - 10 - Math.random() * 20, 1);
    }
    if (this.jumpCdT > 0) this.jumpCdT--;
    if (this.dashCdT > 0) this.dashCdT--;
    if (this.cmdNormT > 0) this.cmdNormT--;
    if (this.sealT > 0) this.sealT--;
    // 퍼펙트 가드 연타 방지: 뗐다가 10프레임 내 다시 잡으면 저스트 윈도우 없음
    if (this.inputs.guard) {
      if (this.guardHoldT === 0 && this.guardReGrabT > 0) this.guardHoldT = 99;
      this.guardHoldT++;
    } else {
      if (this.guardHoldT > 0) this.guardReGrabT = 11;
      this.guardHoldT = 0;
    }
    if (this.guardReGrabT > 0) this.guardReGrabT--;
    if (this.bufQ && ++this.bufQ.age > 8) this.bufQ = null;
    // 가드 게이지 회복 (가드/경직 중이 아닐 때)
    if (!['block', 'crouchblock', 'guard', 'dizzy'].includes(this.state)) {
      this.guardGauge = Math.min(100, this.guardGauge + 0.4);
    }

    // 잔상: 대시/특수기/회전기/날아갈 때 고스트를 남긴다
    const spinning = this.state === 'attack' && this.moveDef &&
      ['blp', 'brk'].includes(this.moveKey) &&
      this.stateFrame >= this.moveDef.startup * 0.4 &&
      this.stateFrame <= this.moveDef.startup + this.moveDef.active + 3;
    if (this.animT % 2 < 1) {    // animT는 소수 초기화(호흡 디싱크)라 === 0 비교 불가
      if (spinning ||
          ['dash', 'backdash', 'special', 'launched'].includes(this.state) || Math.abs(this.vx) > 3) {
        this.trail.push(this.snapshot());
        if (this.trail.length > 3) this.trail.shift();
      } else if (this.trail.length) {
        this.trail.shift();
      }
    }

    // 자동 방향 전환 (지상 중립 상태에서만)
    if (this.opponent && this.isGrounded() &&
        ['idle', 'walk', 'crouch'].includes(this.state)) {
      const d = this.opponent.x - this.x;
      if (d !== 0) this.facing = d > 0 ? 1 : -1;
    }

    this.stateFrame++;
    const S = this.state;

    if (S === 'idle' || S === 'walk' || S === 'crouch') this.updateNeutral();
    else if (S === 'land') { if (this.stateFrame >= 8) this.setState('idle'); }
    else if (S === 'rise') { if (this.stateFrame >= 6) this.setState('idle'); }
    else if (S === 'jump') this.updateJump();
    else if (S === 'attack') this.updateAttack();
    else if (S === 'special') this.updateSpecial();
    else if (S === 'guard') this.updateGuard();
    else if (S === 'dizzy') this.updateDizzy();
    else if (S === 'dash' || S === 'backdash') this.updateDash();
    else if (S === 'grab') this.updateGrabAttempt();
    else if (S === 'grabbing') this.updateGrabbing();
    else if (S === 'grabbed') { /* 잡은 쪽이 제어 */ }
    else if (S === 'hit') this.updateHit();
    else if (S === 'block' || S === 'crouchblock') this.updateBlockstun();
    else if (S === 'launched') this.updateLaunched();
    else if (S === 'knockdown') this.updateKnockdown();
    else if (S === 'getup') this.updateGetup();

    this.physics(stage);
  }

  /* ---------- 지상 중립 ---------- */
  updateNeutral() {
    // 입력 버퍼 소화: 후딜 중 눌렀던 키가 즉시 발동 (키 씹힘 방지)
    const inp = Object.assign({}, this.inputs);
    if (this.bufQ) { inp[this.bufQ.btn] = true; this.bufQ = null; }
    const spd = this.char.stats.speed;
    const sealed = this.sealT > 0;          // 퍼펙트 가드 당함: 공격/가드 불가

    // 가드 버튼 (스페이스/E/O 홀드)
    if (inp.guard && !sealed) { this.vx *= 0.5; return this.setState('guard'); }

    if (!sealed) {
      if (inp.grab) return this.startGrab();
      // ↓←+펀치 = 보조 특수기 / ↓→+펀치 = 필살기 / ↓→+킥 = 띄우기
      if (inp.qcb && (inp.lp || inp.rp) && this.special2Def) return this.startSpecial(this.special2Def);
      if (inp.qcf && (inp.lp || inp.rp)) return this.startSpecial(this.specialDef);
      if (inp.qcf && (inp.lk || inp.rk)) return this.startAttack('launcher');
      if (inp.ws) return this.startAttack('ws');   // AI 전용
    }

    // 앉았다 일어서기 (자동 기상어퍼는 제거됨)
    if (this.state === 'crouch' && !inp.down) {
      return this.setState('rise');
    }

    if (inp.dashF && this.dashCdT <= 0 && !sealed) return this.startDash(1);
    if (inp.dashB && this.dashCdT <= 0) return this.startDash(-1);

    // 앉기 + 앉아 공격
    if (inp.down) {
      if (this.state !== 'crouch') this.setState('crouch');
      this.vx *= 0.7;
      if (!sealed) {
        if (inp.lk) return this.startAttack('dlk');   // 짠발
        if (inp.rk) return this.startAttack('drk');   // 스윕
        if (inp.lp) return this.startAttack('dlp');
        if (inp.rp) return this.startAttack('drp');
      }
      return;
    }

    if (!sealed) {
      // 방향 커맨드 기본기 (←/→ + 버튼) — 누른 순간의 방향 + 방향 유예 포함
      // 상대가 공중(저글링 중)이면 봉인: 전진하며 치는 잽이 오버핸드로 둔갑해 콤보가 끊기지 않게
      const oppAir = this.opponent && this.opponent.state === 'launched';
      const dirHeld = oppAir ? 0 : (inp.dirX !== 0 ? inp.dirX
        : (inp.pressDirX || (this.recentDirT > 0 ? this.recentDirX : 0)));
      const holdB = dirHeld === -this.facing && dirHeld !== 0;
      const holdF = dirHeld === this.facing && dirHeld !== 0;
      if (holdB) {
        if (inp.lp) return this.startAttack('blp');   // 백스핀 훅
        if (inp.rp) return this.startAttack('brp');   // 어퍼컷 (미니 띄우기)
        if (inp.rk) return this.startAttack('brk');   // 뒤돌려차기
      }
      if (holdF) {
        if (inp.lp) return this.startAttack('flp');   // 오버핸드 왼손
        if (inp.rp) return this.startAttack('frp');   // 오버핸드 오른손
        if (inp.rk) return this.startAttack('frk');   // 앞차기 (푸시킥)
      }
      // 서서 기본기
      if (inp.rp) return this.startAttack('rp');
      if (inp.lp) return this.startAttack('lp');
      if (inp.rk) return this.startAttack('rk');
      if (inp.lk) return this.startAttack('lk');
    }

    // 점프 (이동거리 절제)
    if (inp.upPressed && this.jumpCdT <= 0) {
      this.vy = JUMP_VY;
      this.vx = inp.dirX * 1.2 * spd;
      this.airAttackUsed = false;
      this.setState('jump');
      return;
    }

    // 이동
    if (inp.dirX !== 0) {
      const forward = inp.dirX === this.facing;
      this.walkBack = !forward;
      this.vx = inp.dirX * (forward ? 1.45 : 1.1) * spd;
      this.walkPhase = (this.walkPhase || 0) + Math.abs(this.vx) * 0.115;
      if (this.state !== 'walk') this.setState('walk');
    } else {
      this.vx *= 0.75;
      if (this.state !== 'idle') this.setState('idle');
    }
  }

  /* ---------- 가드 (버튼 홀드) ---------- */
  updateGuard() {
    // 가드 무빙: 가드를 유지한 채 천천히 이동 가능
    if (this.inputs.dirX !== 0 && !this.inputs.down) {
      this.vx = this.inputs.dirX * 0.8 * this.char.stats.speed;
      this.walkPhase = (this.walkPhase || 0) + Math.abs(this.vx) * 0.115;
    } else {
      this.vx *= 0.7;
    }
    if (!this.inputs.guard || this.sealT > 0) this.setState('idle');
  }

  /* ---------- 가드 브레이크: 블랙아웃 그로기 ---------- */
  updateDizzy() {
    this.vx *= 0.9;
    if (this.animT % 6 < 1) {
      FX.bolt(this.x + Math.sin(this.animT * 0.22) * 9, Stages.GROUND_Y - 50, 1);
    }
    if (this.stateFrame >= 90) {
      this.guardGauge = 55;
      this.setState('idle');
    }
  }

  /* ---------- 스텝 (→→ / ←←) ---------- */
  startDash(dir) {
    this.dashCdT = DASH_CD;
    this.setState(dir > 0 ? 'dash' : 'backdash');
    this.vx = this.facing * dir * (dir > 0 ? 4.2 : 3.9);
    FX.dust(this.x - this.facing * dir * 6, Stages.GROUND_Y, 4, -this.facing * dir);
  }

  updateDash() {
    const inp = this.inputs;
    this.vx *= 0.87;
    // 앞스텝 중 공격 캔슬 (관성 유지 = 치고 들어가기)
    if (this.state === 'dash' && this.stateFrame >= 3) {
      if (inp.grab) return this.startGrab(true);
      if (inp.qcf && (inp.lp || inp.rp)) return this.startSpecial(this.specialDef);
      if (inp.rp) return this.startAttack('rp', { keepVx: true });
      if (inp.lp) return this.startAttack('lp', { keepVx: true });
      if (inp.rk) return this.startAttack('rk', { keepVx: true });
      if (inp.lk) return this.startAttack('lk', { keepVx: true });
    }
    if (this.stateFrame >= (this.state === 'dash' ? 13 : 12)) this.setState('idle');
  }

  /* ---------- 점프 ---------- */
  updateJump() {
    const inp = this.inputs;
    this.vx += inp.dirX * 0.05;
    if (!this.airAttackUsed) {
      if (inp.lk || inp.rk) { this.airAttackUsed = true; this.startAttack('airKick', { air: true }); }
      else if (inp.lp || inp.rp) { this.airAttackUsed = true; this.startAttack('airPunch', { air: true }); }
    }
  }

  /* ---------- 일반 공격 + 스트링 ---------- */
  startAttack(key, opts) {
    opts = opts || {};
    // 방향 커맨드 노멀: 같은 기술 연타 금지 (앞차기 무한 연타 방지)
    if (['flp', 'frp', 'frk', 'blp', 'brp', 'brk'].includes(key)) {
      if (key === this.lastCmdNorm && this.cmdNormT > 0) return;
      this.lastCmdNorm = key;
      this.cmdNormT = 55;
    }
    // 공격 시작 시 상대를 향해 재조준 (저글링 중 밑을 지나쳐도 뒤로 안 빗나가게)
    if (this.isGrounded() && this.opponent) {
      const d = this.opponent.x - this.x;
      if (d !== 0) this.facing = d > 0 ? 1 : -1;
    }
    this.moveKey = key;
    // 캐릭터별 기술 오버라이드 (data.js cmdMods — 같은 기술도 캐릭터마다 성격이 다르게)
    const cm = this.char.cmdMods && this.char.cmdMods[key];
    this.moveDef = cm ? { ...MOVES[key], ...cm } : MOVES[key];
    this.hitDone = false;
    this.setState('attack');
    this.airborneAttack = !!opts.air;
    if (!opts.air && !opts.keepVx) this.vx *= 0.18;  // 걷던 관성 거의 끊기 (제자리 타격)
    // 스트링 후보 등록 (서서 기본기로 시작할 때)
    this.stringCands = [];
    if (!opts.air && ['lp', 'rp', 'lk', 'rk'].includes(key) && this.char.strings) {
      this.stringCands = this.char.strings
        .filter(s => s.steps[0].btn === key && s.steps.length > 1)
        .map(s => ({ s, idx: 1 }));
    }
    // 기술별 휘두름 소리 — 백스윙이 끝나고 팔다리가 뻗기 시작하는 순간에 울린다
    this.swingSfxT = this.moveDef ? Math.max(1, Math.floor(this.moveDef.startup * 0.45)) : 1;
  }

  resolveStringStep(step) {
    const base = step.base || step.btn;
    return { ...MOVES[base], ...(step.mod || {}) };
  }

  updateAttack() {
    const m = this.moveDef;
    const t = this.stateFrame;
    const inp = this.inputs;

    // 휘두름 소리: 스냅 시작 시점 (모션과 동기)
    if (this.swingSfxT != null && t >= this.swingSfxT) {
      this.swingSfxT = null;
      const foot = m.limb && String(m.limb).startsWith('foot');
      if (this.moveKey === 'lp' || this.moveKey === 'dlp') FX.sfx.jabWhiff();
      else if (foot) FX.sfx.kickWhiff();
      else FX.sfx.whiff();
    }

    // 전진 관성 — 실제 무술 기준: 잽/띄우기/앉아기술은 제자리,
    // 스트레이트는 반 발짝, 킥은 아주 살짝. 거리는 스텝(→→)으로 좁히는 것.
    const lunges = { rp: 0.15, lk: 0.12, rk: 0.18, ws: 0.15, wakeKick: 0.3 };
    if (lunges[this.moveKey] && t < m.startup + m.active && this.isGrounded()) {
      this.vx += this.facing * lunges[this.moveKey] * 0.5;
      this.vx *= 0.9;
    }

    // 판정
    if (t >= m.startup && t < m.startup + m.active && !this.hitDone) {
      this.tryHit(m, m.kbUp > 0);
    }

    // ----- 스트링 캔슬 (후딜을 다음 타로, 이어지는 타는 시동 가속) -----
    if (this.stringCands.length > 0 &&
        t >= m.startup + m.active && t < m.startup + m.active + 14) {
      for (const btn of ['lp', 'rp', 'lk', 'rk']) {
        if (!inp[btn]) continue;
        const adv = this.stringCands.filter(c => c.s.steps[c.idx] && c.s.steps[c.idx].btn === btn);
        if (adv.length === 0) continue;
        const cand = adv[0];
        const step = cand.s.steps[cand.idx];
        const isFinisher = cand.idx === cand.s.steps.length - 1;
        // 스트링 연결 시에도 상대 방향 재조준
        if (this.isGrounded() && this.opponent) {
          const d = this.opponent.x - this.x;
          if (d !== 0) this.facing = d > 0 ? 1 : -1;
        }
        const resolved = this.resolveStringStep(step);
        this.moveDef = { ...resolved, startup: Math.max(6, resolved.startup - 4) };
        this.moveKey = step.base || step.btn;
        this.hitDone = false;
        this.stateFrame = 0;
        this.vx = this.facing * 1.0;
        this.stringCands = adv.map(c => ({ s: c.s, idx: c.idx + 1 }))
          .filter(c => c.s.steps[c.idx]);
        if (isFinisher && (step.mod && step.mod.name)) {
          FX.addText(this.x, Stages.GROUND_Y - 64, step.mod.name + '!', this.char.colors.accent);
        }
        FX.sfx.whiff();
        return;
      }
    }

    // 입력 버퍼: 후딜 중 누른 기본기 키를 기억해 뒀다가 즉시 발동
    if (t >= m.startup + m.active && !this.bufQ) {
      for (const btn of ['lp', 'rp', 'lk', 'rk']) {
        if (inp[btn]) { this.bufQ = { btn, age: 0 }; break; }
      }
    }

    // 공중 공격: 착지하면 캔슬
    if (this.airborneAttack && this.isGrounded() && this.vy <= 0 && t > 2) {
      this.airborneAttack = false;
      this.setState('idle');
      return;
    }
    if (t >= m.startup + m.active + m.recovery) {
      // 앉아 기술은 ↓ 유지 중이면 앉은 자세로 복귀 (한 프레임 서기 방지)
      if (m.crouch && inp.down) this.setState('crouch');
      else this.setState(this.airborneAttack ? 'jump' : 'idle');
      this.airborneAttack = false;
    }
  }

  /* ---------- 특수기 ---------- */
  startSpecial(def) {
    if (!def) return;
    if (def.kind === 'projectile' && this.projActive) return; // 장풍은 화면에 1개만
    this.moveKey = 'special';
    this.moveDef = def;
    this.hitDone = false;
    this.multiIdx = 0;
    this.stringCands = [];
    this.vx = 0;
    this.setState('special');
    FX.sfx.special();
    FX.addText(this.x, Stages.GROUND_Y - 60, def.name + '!', this.char.colors.accent);
  }

  updateSpecial() {
    const m = this.moveDef;
    const t = this.stateFrame;
    const gy = Stages.GROUND_Y;

    if (m.kind === 'uppercut') {
      if (t < m.startup + m.active) this.vx = this.facing * m.lunge;
      if (t >= m.startup && t < m.startup + m.active) {
        FX.flame(this.x + this.facing * 10, gy - this.y - 20 - (t - m.startup) * 4, 3);
        if (!this.hitDone) this.tryHit(m, true);
      }
    } else if (m.kind === 'commandGrab') {
      // 커맨드 잡기: 시동 중 한 걸음 들어가며 잡는다 (그래플러의 접근 수단)
      if (t < m.startup) this.vx = this.facing * 1.1;
      // 가드 위에서도 잡는다 (앉아도 잡힘). 풀기 불가!
      if (t >= m.startup && t < m.startup + m.active && !this.hitDone) {
        const o = this.opponent;
        const dist = Math.abs(o.x - this.x);
        const facingOk = (o.x - this.x) * this.facing >= 0 || dist < 10;
        const grabbable = o.isGrounded() && o.invulnT <= 0 &&
          !['jump', 'launched', 'knockdown', 'getup', 'ko', 'grabbed', 'grabbing', 'win', 'intro'].includes(o.state);
        if (grabbable && dist < m.reach && facingOk) {
          this.hitDone = true;
          this.cmdGrab = true;
          this.setState('grabbing');
          o.setState('grabbed');
          o.vx = 0; o.vy = 0; o.y = 0;
          this.grabPartnerLock = 34;
          FX.sfx.grab();
          FX.shake(2);
          return;
        }
      }
    } else if (m.kind === 'projectile') {
      if (t === m.startup && !this.projActive) {
        this.projActive = true;
        Game.addProjectile({
          owner: this,
          x: this.x + this.facing * 14, y: 26,
          vx: this.facing * m.speed,
          dmg: m.dmg, life: 150,
          style: m.style,
          color: this.char.colors.accent
        });
        FX.bolt(this.x + this.facing * 14, gy - 26, 5);
      }
    } else if (m.kind === 'counterStance') {
      // 받아치기 자세: applyHitTo 에서 가로챔. 자세 이펙트만.
      if (t % 5 === 0 && t < m.startup + m.active) {
        FX.bolt(this.x + this.facing * 8, gy - 24 - Math.random() * 10, 1);
      }
    } else if (m.kind === 'rushKick') {
      if (t >= m.startup && t < m.startup + m.active) {
        this.vx = this.facing * m.lunge;
        FX.bolt(this.x + this.facing * 14, gy - 24, 2);
        const ht = m.hitTimes[this.multiIdx];
        if (ht !== undefined) {
          if (t >= ht && t < ht + m.hitWindow) {
            if (!this.hitDone) {
              const last = this.multiIdx === m.hitTimes.length - 1;
              this.tryHit({
                ...m,
                kb: last ? m.lastKb : m.kb,
                hitstun: last ? 22 : m.hitstun,
                wallSplat: last
              }, false);
            }
          } else if (t >= ht + m.hitWindow) {
            this.multiIdx++;
            this.hitDone = false;
          }
        }
      }
    } else if (m.kind === 'quake') {
      if (t === m.startup) {
        FX.shake(7);
        FX.dust(this.x + this.facing * 20, gy, 14, this.facing);
        FX.dust(this.x, gy, 10);
        FX.sfx.wall();
        const o = this.opponent;
        if (o && o.isVulnerable() && o.isGrounded() &&
            Math.abs(o.x - this.x) < m.range &&
            !['jump'].includes(o.state)) {
          this.applyHitTo(o, m, { unblockable: true, launch: true });
        }
      }
    }

    if (t >= m.startup + m.active + m.recovery) this.setState('idle');
  }

  /* ---------- 잡기 ---------- */
  startGrab(keepVx) {
    this.moveKey = 'grab';
    this.moveDef = MOVES.grab;
    this.hitDone = false;
    this.stringCands = [];
    if (!keepVx) this.vx = 0;
    this.setState('grab');
  }

  updateGrabAttempt() {
    const m = MOVES.grab;
    const t = this.stateFrame;
    if (t >= m.startup && t < m.startup + m.active && !this.hitDone) {
      const o = this.opponent;
      const dist = Math.abs(o.x - this.x);
      const facingOk = (o.x - this.x) * this.facing >= 0 || dist < 10;
      if (o.isVulnerable() && o.isGrounded() && o.state !== 'jump' &&
          o.state !== 'launched' && !o.isCrouched() && dist < m.reach && facingOk) {
        this.hitDone = true;
        this.cmdGrab = false;
        this.setState('grabbing');
        o.setState('grabbed');
        o.vx = 0; o.vy = 0; o.y = 0;
        this.grabPartnerLock = 30;
        FX.sfx.grab();
        return;
      }
    }
    if (t >= m.startup + m.active + m.recovery) this.setState('idle');
  }

  updateGrabbing() {
    const o = this.opponent;
    o.x = this.x + this.facing * 16;
    o.facing = -this.facing;
    this.grabPartnerLock--;

    // 잡기 풀기: 잡힌 직후 펀치 입력 (커맨드 잡기는 풀 수 없다!)
    if (!this.cmdGrab && this.grabPartnerLock > 16 &&
        (o.inputs.lp || o.inputs.rp || o.inputs.grab ||
         o.animT - o.lastGrabPressT < 9)) {
      FX.addText((this.x + o.x) / 2, Stages.GROUND_Y - 56, '잡기 풀기!', '#9ecfff', true);
      FX.sfx.block();
      FX.blockSpark((this.x + o.x) / 2, Stages.GROUND_Y - 28);
      this.vx = -this.facing * 3; o.vx = this.facing * 3;
      this.setState('idle'); o.setState('idle');
      return;
    }

    if (this.grabPartnerLock <= 0) {
      const dmgBase = this.cmdGrab ? this.moveDef.dmg : MOVES.grab.dmg;
      const dmg = Math.round(dmgBase * this.powerMul());
      o.hp -= dmg;
      o.comboTaken = 1;
      o.hardKD = true;
      o.setState('launched');
      o.vy = (this.cmdGrab ? 6.6 : 5.2);
      o.vx = this.facing * (this.cmdGrab ? 3.4 : 4.8) / o.char.stats.weight;
      o.spin = 0;
      o.flashT = 6;
      FX.hitSpark(o.x, Stages.GROUND_Y - 30, this.cmdGrab ? 5 : 3, '#ffd24a');
      FX.shake(this.cmdGrab ? 7 : 4);
      FX.stop(this.cmdGrab ? 12 : 8);
      FX.sfx.heavy();
      this.cmdGrab = false;
      this.setState('idle');
      if (o.hp <= 0) o.dead = true;
    }
  }

  /* ---------- 피격/경직 ---------- */
  updateHit() {
    this.vx *= 0.86;
    if (this.stateFrame >= this.hitstunT) this.setState('idle');
  }

  updateBlockstun() {
    this.vx *= 0.8;
    if (this.stateFrame >= this.hitstunT) this.setState('idle');
  }

  updateLaunched() {
    this.spin += (-1.5 - this.spin) * 0.08;
    if (this.isGrounded() && this.vy <= 0 && this.stateFrame > 3) {
      this.vx *= 0.4;
      FX.dust(this.x, Stages.GROUND_Y, 8);
      this.spin = 0;
      this.setState('knockdown');
      this.invulnT = 999;
    }
  }

  updateKnockdown() {
    this.vx *= 0.85;
    const downTime = this.hardKD ? 55 : 38;
    if (this.dead) return;
    const inp = this.inputs;
    // ----- 기상 심리전 -----
    const canChoose = this.stateFrame >= downTime * 0.6;
    if (canChoose && (inp.lk || inp.rk)) {
      // 기상킥: 무적으로 일어나며 미들킥
      this.hardKD = false;
      this.invulnT = 18;
      this.startAttack('wakeKick');
      FX.dust(this.x, Stages.GROUND_Y, 5);
      return;
    }
    if (canChoose && inp.dirX === -this.facing) {
      // 백롤: 뒤로 구르며 기상
      this.hardKD = false;
      this.setState('getup');
      this.invulnT = 28;
      this.vx = -this.facing * 2.6;
      FX.dust(this.x, Stages.GROUND_Y, 6, -this.facing);
      return;
    }
    if (inp.down && this.stateFrame >= downTime - 1 && this.stayDownT < 50) {
      // 계속 누워 있기 (타이밍 흔들기)
      this.stateFrame = downTime - 1;
      this.stayDownT++;
      return;
    }
    if (this.stateFrame >= downTime) {
      this.hardKD = false;
      this.stayDownT = 0;
      this.setState('getup');
      this.invulnT = 22;
    }
  }

  updateGetup() {
    if (this.stateFrame >= 16) {
      this.setState('idle');
    }
  }

  /* ---------- 히트 판정 ---------- */
  tryHit(def, launch) {
    const o = this.opponent;
    if (!o || !o.isVulnerable()) return;
    // 상단은 앉은 상대 머리 위로 빗나감
    if (def.level === 'high' && o.isGrounded() && o.isCrouched() && o.state !== 'launched') {
      return;
    }
    const reach = def.reach * (this.char.reachMul || 1);   // 리치형 보정
    const x1 = this.x + this.facing * 4;
    const x2 = this.x + this.facing * reach;
    const hx1 = Math.min(x1, x2), hx2 = Math.max(x1, x2);
    const hy = this.y + def.hitY;
    let hy1 = hy - def.hbH / 2, hy2 = hy + def.hbH / 2;
    // 공중 콤보는 너그럽게 (저글링 유지가 재미의 핵심)
    if (o.state === 'launched') { hy1 -= 8; hy2 += 20; }
    const hb = o.hurtbox();
    if (hx1 < hb.x2 && hx2 > hb.x1 && hy1 < hb.y2 && hy2 > hb.y1) {
      this.hitDone = true;
      this.applyHitTo(o, def, { launch: launch || def.kbUp > 0 });
    }
  }

  applyHitTo(vic, def, opts) {
    opts = opts || {};
    const gy = Stages.GROUND_Y;
    const contactX = opts.cx !== undefined ? opts.cx
      : (this.x + this.facing * (def.reach || 20) * 0.8 + vic.x) / 2;
    const contactY = opts.cy !== undefined ? opts.cy
      : gy - (this.y + (def.hitY || 26));
    const lv = def.level || 'mid';

    // ----- 받아치기 (카운터 스탠스 가로채기) -----
    if (!opts.unblockable && !opts.projectile &&
        vic.state === 'special' && vic.moveDef && vic.moveDef.kind === 'counterStance' &&
        vic.stateFrame >= vic.moveDef.startup &&
        vic.stateFrame < vic.moveDef.startup + vic.moveDef.active &&
        lv !== 'low' && this.isGrounded()) {
      const cDef = vic.moveDef;
      FX.addText((this.x + vic.x) / 2, gy - 64, '받아치기!!', '#7ee0ff', true);
      FX.bolt(contactX, contactY, 12);
      FX.stop(10);
      FX.shake(5);
      FX.sfx.special();
      vic.startAttack('ws');
      vic.hitDone = true;    // 모션만 (데미지는 아래에서 직접)
      vic.applyHitTo(this, {
        level: 'mid', dmg: cDef.dmg, kb: 2.4, kbUp: 7.0,
        hitstun: 40, blockstun: 0, hitY: 28, reach: 16, fx: 'bolt'
      }, { launch: true, unblockable: true });
      return;
    }

    // ----- 가드 (뒤홀드 또는 가드 버튼) -----
    const holdingAway = vic.inputs.dirX !== 0 &&
      ((vic.opponent.x > vic.x && vic.inputs.dirX < 0) ||
       (vic.opponent.x < vic.x && vic.inputs.dirX > 0));
    const guardBtn = (vic.inputs.guard || vic.state === 'guard') && vic.sealT <= 0;
    const guardable = vic.isGrounded() && (holdingAway || guardBtn) &&
      ['idle', 'walk', 'crouch', 'block', 'crouchblock', 'guard'].includes(vic.state);
    if (!opts.unblockable && guardable) {
      const crouching = vic.inputs.down;
      const blocked =
        lv === 'low' ? crouching :     // 하단: 앉아 가드만
        lv === 'mid' ? !crouching :    // 중단: 서서 가드만
        true;                          // 상단: 서서 가드 (앉으면 휘피)
      if (blocked) {
        // ★ 퍼펙트 가드: 가드 버튼을 막 누른 직후(7프레임 내)에 막으면
        //    노칩 + 공격자는 2초간 공격/가드 봉인 (이동은 가능)
        if (guardBtn && vic.guardHoldT > 0 && vic.guardHoldT <= 7) {
          this.sealT = 120;
          vic.guardHoldT = 99;                       // 연속 퍼펙트 방지
          vic.hitstunT = 5;
          vic.setState(crouching ? 'crouchblock' : 'block');
          this.vx = -this.facing * 2.6;              // 공격자 튕겨남
          FX.addText((this.x + vic.x) / 2, gy - 66, 'PERFECT GUARD!', '#7ee0ff', true);
          FX.addText(this.x, gy - 80, '공격 봉인!', '#7ee0ff');
          FX.blockSpark(contactX, contactY);
          FX.hitSpark(contactX, contactY, 3, '#7ee0ff');
          FX.stop(9);
          FX.shake(3);
          FX.sfx.perfect();
          return;
        }
        // 일반 가드: 게이지 소모 → 0이면 가드 브레이크 (블랙아웃 그로기)
        vic.guardGauge -= def.dmg * 2.4;
        if (vic.guardGauge <= 0) {
          vic.guardGauge = 0;
          vic.setState('dizzy');
          vic.vx = this.facing * 1.5;
          FX.addText(vic.x, gy - 72, '가드 브레이크!!', '#ff3c3c', true);
          FX.blackout(22);
          FX.shake(6);
          FX.stop(10);
          FX.sfx.heavy();
          return;
        }
        vic.hitstunT = def.blockstun || 10;
        vic.setState(crouching ? 'crouchblock' : 'block');
        vic.vx = this.facing * (def.kb || 2) * 0.8;
        FX.blockSpark(contactX, contactY);
        FX.sfx.block();
        FX.stop(3);
        return;
      }
    }

    // ----- 히트 -----
    vic.comboTaken++;
    vic.maxCombo = Math.max(vic.maxCombo, vic.comboTaken);
    vic.hitLevel = lv;
    const scale = comboScale(vic.comboTaken);
    let dmg = def.dmg * this.powerMul() * scale;

    // 카운터 히트: 시동 중에 맞히면 1.4배 + 긴 휘청
    let counter = false;
    if ((vic.state === 'attack' || vic.state === 'special') &&
        vic.stateFrame < (vic.moveDef ? vic.moveDef.startup : 0)) {
      dmg *= 1.4;
      counter = true;
    }
    dmg = Math.max(1, Math.round(dmg));
    vic.hp -= dmg;
    vic.flashT = counter ? 8 : 5;
    vic.hitPower = dmg;                       // 피격 리액션 강도 (모션용)
    // 콤보 누적 데미지 (연습 모드 표시용)
    if (vic.comboTaken === 1) vic.comboDmgAcc = 0;
    vic.comboDmgAcc = (vic.comboDmgAcc || 0) + dmg;
    vic.lastComboDmg = vic.comboDmgAcc;
    vic.lastComboHits = vic.comboTaken;

    // 연출
    const power = Math.min(5, Math.ceil(dmg / 4));
    FX.hitSpark(contactX, contactY, power + (counter ? 2 : 0), counter ? '#ff5b5b' : this.char.colors.accent);
    FX.shake(1.5 + power * 0.9 + (counter ? 2 : 0));
    FX.stop(4 + Math.min(7, power * 1.4) + (counter ? 4 : 0));
    const footHit = def.limb && String(def.limb).startsWith('foot');
    if (dmg >= 8) FX.camPunch(this.facing * 2.4);   // 카메라가 타격 방향으로 튕김
    if (dmg >= 10 || counter) FX.sfx.heavy();
    else if (footHit) FX.sfx.kickHit();       // 킥은 채찍 같은 둔탁음
    else FX.sfx.hit();
    if (counter) FX.addText(contactX, contactY - 20, '카운터!!', '#ff5b5b', true);
    if (def.fx === 'flame') FX.flame(contactX, contactY, 8);
    if (def.fx === 'bolt') FX.bolt(contactX, contactY, 6);

    if (vic.hp <= 0) {
      vic.hp = 0;
      vic.dead = true;
    }

    // 넉백/띄우기/다운
    const wt = vic.char.stats.weight;
    if (opts.launch || vic.state === 'launched' || !vic.isGrounded()) {
      // 띄우기 또는 공중 콤보 (무게 영향은 절반만 — 무거운 캐릭터도 콤보 가능하게)
      const wEff = 1 + (wt - 1) * 0.5;
      const inAir = vic.state === 'launched';
      const decay = Math.max(0.5, 1 - vic.comboTaken * 0.06);
      let pop = (def.kbUp > 0 ? def.kbUp : 4.8) * decay / wEff;
      if (inAir) pop = Math.max(3.6, pop * 0.62);
      else pop = Math.min(pop, 5.9);   // 너무 높이 뜨면 지상 기본기가 닿지 않는다
      if (vic.juggleLight > 0) { pop += 0.8; vic.juggleLight--; }   // 콤보 시동 버프
      if (counter && def.kbUp > 0) pop += 1.2;                      // 카운터 띄우기는 더 높이
      vic.vy = pop;
      // 철권식: 거의 수직으로 띄운다 (수평으로 밀리면 콤보가 끊김)
      vic.vx = this.facing * (inAir ? 0.45 : Math.min(1.3, Math.max(0.7, def.kb * 0.6))) / wEff;
      if (vic.state !== 'launched') {
        vic.spin = -0.2;
        // 띄우기 성공 — 살짝 슬로우모션 (임팩트 연출)
        if (def.kbUp >= 5 && !vic.dead) FX.slowmo(14, 0.45);
      }
      vic.setState('launched');
      if (def.comboStarter) vic.juggleLight = 3;
      if (def.hardKD) vic.hardKD = true;
      if (def.kbUp >= 5) FX.sfx.launch();
    } else if (def.trip) {
      // 스윕: 다리를 걸어 넘어뜨림
      vic.setState('launched');
      vic.vy = 2.6 / wt;
      vic.vx = this.facing * 1.8 / wt;
      vic.spin = -0.1;
      FX.dust(vic.x, gy, 5);
    } else {
      // 지상 히트 (카운터는 길게 휘청)
      vic.hitstunT = Math.round(def.hitstun * (counter ? 1.6 : 1));
      vic.setState('hit');
      vic.vx = this.facing * def.kb / wt;
    }
    if (vic.dead) {
      vic.setState('launched');
      vic.vy = Math.max(vic.vy, 5.5);
      vic.vx = this.facing * 5 / wt;
      vic.hardKD = true;
    }
  }

  /* ---------- 물리 ---------- */
  physics(stage) {
    this.x += this.vx;

    if (!this.isGrounded() || this.vy > 0) {
      this.y += this.vy;
      let g = GRAV;
      if (this.state === 'launched') {
        g = GRAV_AIR * (1 + this.comboTaken * 0.04);
        if (this.juggleLight > 0) g *= 0.85;
        this.vx *= 0.97;     // 공중 수평 감속
      }
      this.vy -= g;
      if (this.y <= 0) {
        this.y = 0;
        if (this.state === 'jump') {
          this.vy = 0; this.vx *= 0.3;
          FX.dust(this.x, Stages.GROUND_Y, 5);
          this.jumpCdT = JUMP_CD;          // 연속 점프 방지
          this.setState('land');           // 착지 모션 (8프레임)
        } else if (this.state === 'launched') {
          // updateLaunched 에서 착지 처리
        } else {
          this.vy = 0;
        }
      }
    } else {
      if (!['walk', 'jump', 'dash', 'backdash'].includes(this.state)) this.vx *= 0.88;
    }

    // 벽 처리 (벽꽝 제거 — 벽에서는 그냥 멈춤)
    const minX = stage.wallL + 9, maxX = stage.wallR - 9;
    if (this.x < minX || this.x > maxX) {
      this.x = this.x < minX ? minX : maxX;
      this.vx = 0;
    }
  }
}
