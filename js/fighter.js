/* ============================================================
 * Fighter — 상태머신 + 경량 물리 (중력/넉백/저글링/벽꽝)
 * ============================================================ */

const GRAV = 0.42;

// 캐릭터 필살기 → 런타임 프레임데이터
function buildSpecialDef(char) {
  const sp = char.special;
  if (sp.type === 'uppercut') {
    return {
      kind: 'uppercut', name: sp.name, dmg: sp.dmg,
      startup: 9, active: 6, recovery: 24,
      reach: 28, hitY: 30, hbH: 36,
      kb: 2.2, kbUp: 7.2, hitstun: 40, blockstun: 14,
      lunge: 1.6, fx: 'flame'
    };
  }
  if (sp.type === 'rushKick') {
    return {
      kind: 'rushKick', name: sp.name, dmg: sp.dmg,
      startup: 8, active: 21, recovery: 16,
      reach: 32, hitY: 24, hbH: 22,
      hitTimes: [8, 15, 22], hitWindow: 4,
      kb: 1.0, lastKb: 4.6, kbUp: 0, hitstun: 15, blockstun: 9,
      lunge: 1.5, fx: 'bolt', wallSplat: true
    };
  }
  // quake
  return {
    kind: 'quake', name: sp.name, dmg: sp.dmg,
    startup: 20, active: 4, recovery: 28,
    range: 78, unblockable: true,
    kb: 5, kbUp: 4.2, hitstun: 50, blockstun: 0,
    lunge: 0, fx: 'dust', hardKD: true
  };
}

class Fighter {
  constructor(char, playerIndex) {
    this.char = char;
    this.playerIndex = playerIndex;
    this.specialDef = buildSpecialDef(char);
    this.controller = null;   // KeyboardController 또는 AIController
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
    this.hitstunT = 0;
    this.flashT = 0;
    this.invulnT = 0;
    this.spin = 0;
    this.comboTaken = 0;      // 현재 콤보로 맞은 횟수 (피격자 기준)
    this.maxCombo = 0;
    this.wallSplatUsed = false;
    this.airAttackUsed = false;
    this.hardKD = false;
    this.dead = false;
    this.lastGrabPressT = -999;
    this.grabPartnerLock = 0;
    this.inputs = this.neutralInputs();
    if (this.controller && this.controller.clearBuffer) this.controller.clearBuffer();
  }

  neutralInputs() {
    return { dirX: 0, up: false, upPressed: false, down: false, lp: false, hp: false, kick: false, grab: false, qcf: false };
  }

  setState(s) {
    this.state = s;
    this.stateFrame = 0;
    if (s === 'idle' || s === 'walk' || s === 'crouch') {
      this.comboTaken = 0;
      this.wallSplatUsed = false;
    }
  }

  isGrounded() { return this.y <= 0.01; }

  isNeutral() {
    return ['idle', 'walk', 'crouch', 'jump'].includes(this.state);
  }

  // 피격 가능 여부
  isVulnerable() {
    if (this.invulnT > 0) return false;
    return !['knockdown', 'getup', 'ko', 'grabbed', 'grabbing', 'win', 'intro'].includes(this.state);
  }

  hurtbox() {
    const crouching = ['crouch', 'crouchblock'].includes(this.state);
    const lying = ['knockdown', 'ko'].includes(this.state);
    const h = lying ? 10 : crouching ? 26 : 42;
    return { x1: this.x - 7, x2: this.x + 7, y1: this.y, y2: this.y + h };
  }

  /* ============ 메인 업데이트 ============ */
  update(stage, active) {
    this.animT++;
    if (this.flashT > 0) this.flashT--;
    if (this.invulnT > 0) this.invulnT--;

    // 입력 (라운드 진행 중에만)
    this.inputs = (active && this.controller) ? this.controller.poll(this.facing) : this.neutralInputs();
    if (this.inputs.grab) this.lastGrabPressT = this.animT;

    // 자동 방향 전환 (지상 중립 상태에서만)
    if (this.opponent && this.isGrounded() &&
        ['idle', 'walk', 'crouch'].includes(this.state)) {
      const d = this.opponent.x - this.x;
      if (d !== 0) this.facing = d > 0 ? 1 : -1;
    }

    this.stateFrame++;
    const S = this.state;

    if (S === 'idle' || S === 'walk' || S === 'crouch') this.updateNeutral();
    else if (S === 'jump') this.updateJump();
    else if (S === 'attack') this.updateAttack();
    else if (S === 'special') this.updateSpecial();
    else if (S === 'grab') this.updateGrabAttempt();
    else if (S === 'grabbing') this.updateGrabbing();
    else if (S === 'grabbed') { /* 잡은 쪽이 제어 */ }
    else if (S === 'hit') this.updateHit();
    else if (S === 'block' || S === 'crouchblock') this.updateBlockstun();
    else if (S === 'launched') this.updateLaunched();
    else if (S === 'knockdown') this.updateKnockdown();
    else if (S === 'getup') this.updateGetup();
    // ko / win / intro: 포즈 유지

    this.physics(stage);
  }

  /* ---------- 지상 중립 ---------- */
  updateNeutral() {
    const inp = this.inputs;
    const spd = this.char.stats.speed;

    // 커맨드 기술
    if (inp.qcf && (inp.lp || inp.hp)) return this.startSpecial();
    if (inp.qcf && inp.kick) return this.startAttack('launcher');
    // 일반기
    if (inp.grab) return this.startGrab();
    if (inp.hp) return this.startAttack('hp');
    if (inp.lp) return this.startAttack('lp');
    if (inp.kick) return this.startAttack('kick');
    // 점프
    if (inp.upPressed) {
      this.vy = 7.4;
      this.vx = inp.dirX * 2.3 * spd;
      this.airAttackUsed = false;
      this.setState('jump');
      return;
    }
    // 앉기
    if (inp.down) {
      if (this.state !== 'crouch') this.setState('crouch');
      this.vx *= 0.7;
      return;
    }
    // 이동
    if (inp.dirX !== 0) {
      const forward = inp.dirX === this.facing;
      this.vx = inp.dirX * (forward ? 1.55 : 1.15) * spd;
      if (this.state !== 'walk') this.setState('walk');
    } else {
      this.vx *= 0.75;
      if (this.state !== 'idle') this.setState('idle');
    }
  }

  /* ---------- 점프 ---------- */
  updateJump() {
    const inp = this.inputs;
    this.vx += inp.dirX * 0.08;  // 약간의 공중 제어
    if (inp.kick && !this.airAttackUsed) {
      this.airAttackUsed = true;
      this.startAttack('airKick', true);
    }
  }

  /* ---------- 일반 공격 ---------- */
  startAttack(key, keepAir) {
    this.moveKey = key;
    this.moveDef = MOVES[key];
    this.hitDone = false;
    this.setState('attack');
    this.airborneAttack = !!keepAir;
    if (!keepAir) this.vx = 0;
    if (key !== 'lp') FX.sfx.whiff();
  }

  updateAttack() {
    const m = this.moveDef;
    const t = this.stateFrame;
    // 전진 관성
    const lunges = { hp: 1.0, kick: 0.7, launcher: 0.9 };
    if (lunges[this.moveKey] && t < m.startup + m.active && this.isGrounded()) {
      this.vx = this.facing * lunges[this.moveKey];
    }
    // 판정
    if (t >= m.startup && t < m.startup + m.active && !this.hitDone) {
      this.tryHit(m, this.moveKey === 'launcher');
    }
    // 공중 공격: 착지하면 캔슬
    if (this.airborneAttack && this.isGrounded() && this.vy <= 0 && t > 2) {
      this.airborneAttack = false;
      this.setState('idle');
      return;
    }
    if (t >= m.startup + m.active + m.recovery) {
      this.setState(this.airborneAttack ? 'jump' : 'idle');
      this.airborneAttack = false;
    }
  }

  /* ---------- 필살기 ---------- */
  startSpecial() {
    this.moveKey = 'special';
    this.moveDef = this.specialDef;
    this.hitDone = false;
    this.multiIdx = 0;
    this.vx = 0;
    this.setState('special');
    FX.sfx.special();
    FX.addText(this.x, Stages.GROUND_Y - 60, this.specialDef.name + '!', this.char.colors.accent);
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
    } else if (m.kind === 'rushKick') {
      if (t >= m.startup && t < m.startup + m.active) {
        this.vx = this.facing * m.lunge;
        FX.bolt(this.x + this.facing * 14, gy - 24, 2);
        // 다단 히트
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
        // 내려찍기: 지면 충격파 (가드 불능, 지상 한정)
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
  startGrab() {
    this.moveKey = 'grab';
    this.moveDef = MOVES.grab;
    this.hitDone = false;
    this.vx = 0;
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
          o.state !== 'launched' && dist < m.reach && facingOk) {
        this.hitDone = true;
        // 잡기 풀기: 상대가 직전에 잡기를 눌렀다면
        if (o.animT - o.lastGrabPressT < 9) {
          FX.addText((this.x + o.x) / 2, Stages.GROUND_Y - 56, '잡기 풀기!', '#9ecfff');
          FX.sfx.block();
          this.vx = -this.facing * 3; o.vx = this.facing * 3;
          this.setState('idle'); o.setState('idle');
          return;
        }
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
    if (this.grabPartnerLock <= 0) {
      // 던지기 발동
      const m = MOVES.grab;
      const dmg = Math.round(m.dmg * this.char.stats.power);
      o.hp -= dmg;
      o.comboTaken = 1;
      o.hardKD = true;
      o.setState('launched');
      o.vy = 5.2;
      o.vx = this.facing * 4.8 / o.char.stats.weight;
      o.spin = 0;
      o.flashT = 6;
      FX.hitSpark(o.x, Stages.GROUND_Y - 30, 3, '#ffd24a');
      FX.shake(4);
      FX.stop(8);
      FX.sfx.heavy();
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
    // 공중 회전
    this.spin += (-1.5 - this.spin) * 0.08;
    if (this.isGrounded() && this.vy <= 0 && this.stateFrame > 3) {
      this.vx *= 0.4;
      FX.dust(this.x, Stages.GROUND_Y, 8);
      this.spin = 0;
      this.setState('knockdown');
      this.invulnT = 999;  // 다운 중 무적 (getup에서 재설정)
    }
  }

  updateKnockdown() {
    this.vx *= 0.85;
    const downTime = this.hardKD ? 55 : 38;
    if (this.dead) return; // KO 시 누운 채 유지
    if (this.stateFrame >= downTime) {
      this.hardKD = false;
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
    // 히트박스 (공격자 기준 전방)
    const x1 = this.x + this.facing * 4;
    const x2 = this.x + this.facing * def.reach;
    const hx1 = Math.min(x1, x2), hx2 = Math.max(x1, x2);
    const hy = this.y + def.hitY;
    const hy1 = hy - def.hbH / 2, hy2 = hy + def.hbH / 2;
    const hb = o.hurtbox();
    if (hx1 < hb.x2 && hx2 > hb.x1 && hy1 < hb.y2 && hy2 > hb.y1) {
      this.hitDone = true;
      this.applyHitTo(o, def, { launch: launch || def.kbUp > 0 });
    }
  }

  applyHitTo(vic, def, opts) {
    opts = opts || {};
    const gy = Stages.GROUND_Y;
    const contactX = (this.x + this.facing * def.reach * 0.8 + vic.x) / 2;
    const contactY = gy - (this.y + (def.hitY || 26));

    // ----- 가드: 상대 반대 방향키를 누르고 있으면 가드 -----
    const holdingAway = vic.inputs.dirX !== 0 &&
      ((vic.opponent.x > vic.x && vic.inputs.dirX < 0) ||
       (vic.opponent.x < vic.x && vic.inputs.dirX > 0));
    if (!opts.unblockable && vic.isGrounded() && holdingAway &&
        ['idle', 'walk', 'crouch', 'block', 'crouchblock'].includes(vic.state)) {
      vic.hitstunT = def.blockstun || 10;
      vic.setState(vic.inputs.down ? 'crouchblock' : 'block');
      vic.vx = this.facing * (def.kb || 2) * 0.8;
      FX.blockSpark(contactX, contactY);
      FX.sfx.block();
      FX.stop(3);
      return;
    }

    // ----- 히트 -----
    vic.comboTaken++;
    vic.maxCombo = Math.max(vic.maxCombo, vic.comboTaken);
    const scale = comboScale(vic.comboTaken);
    let dmg = def.dmg * this.char.stats.power * scale;
    // 카운터 히트 (공격 준비 중에 맞음)
    let counter = false;
    if ((vic.state === 'attack' || vic.state === 'special') &&
        vic.stateFrame < (vic.moveDef ? vic.moveDef.startup : 0)) {
      dmg *= 1.25;
      counter = true;
    }
    dmg = Math.max(1, Math.round(dmg));
    vic.hp -= dmg;
    vic.flashT = 5;

    // 연출
    const power = Math.min(5, Math.ceil(dmg / 4));
    FX.hitSpark(contactX, contactY, power, this.char.colors.accent);
    FX.shake(1.5 + power * 0.9);
    FX.stop(4 + Math.min(7, power * 1.4));
    if (dmg >= 10) FX.sfx.heavy(); else FX.sfx.hit();
    if (counter) FX.addText(contactX, contactY - 18, 'COUNTER!', '#ff5b5b');
    if (def.fx === 'flame') FX.flame(contactX, contactY, 8);
    if (def.fx === 'bolt') FX.bolt(contactX, contactY, 6);

    // 콤보 카운터
    if (vic.comboTaken >= 2) {
      FX.addText(this.x - this.facing * 30, gy - 78,
        vic.comboTaken + ' COMBO!', '#ffd24a', vic.comboTaken >= 4);
    }

    // KO 체크
    if (vic.hp <= 0) {
      vic.hp = 0;
      vic.dead = true;
    }

    // 넉백/띄우기
    const wt = vic.char.stats.weight;
    if (opts.launch || vic.state === 'launched' || !vic.isGrounded()) {
      // 띄우기 또는 공중 콤보 (저글링: 콤보가 길어질수록 덜 뜸)
      const juggleDecay = Math.max(0.55, 1 - vic.comboTaken * 0.07);
      vic.vy = Math.max(3.0, (def.kbUp || 3.8)) * juggleDecay / wt;
      vic.vx = this.facing * Math.max(1.2, def.kb) / wt;
      if (vic.state !== 'launched') { vic.spin = -0.2; }
      vic.setState('launched');
      if (def.hardKD) vic.hardKD = true;
      if (def.kbUp >= 5) FX.sfx.launch();
    } else {
      // 지상 히트
      vic.hitstunT = def.hitstun;
      vic.setState('hit');
      vic.vx = this.facing * def.kb / wt;
      // 강공 벽꽝 유도: 벽 근처면 띄워서 벽으로
      if (def.wallSplat) {
        const stage = Game.stage;
        const nearWall = (this.facing > 0 && stage.wallR - vic.x < 46) ||
                         (this.facing < 0 && vic.x - stage.wallL < 46);
        if (nearWall) {
          vic.setState('launched');
          vic.vy = 3.4;
          vic.vx = this.facing * (def.kb + 1.5) / wt;
        }
      }
    }
    if (vic.dead) {
      // KO 피니시: 크게 날림
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
      const juggleG = this.state === 'launched' ? GRAV * (1 + this.comboTaken * 0.05) : GRAV;
      this.vy -= juggleG;
      if (this.y <= 0) {
        this.y = 0;
        if (this.state === 'jump') {
          this.vy = 0; this.vx *= 0.3;
          FX.dust(this.x, Stages.GROUND_Y, 4);
          this.setState('idle');
        } else if (this.state === 'launched') {
          // updateLaunched 에서 착지 처리
        } else {
          this.vy = 0;
        }
      }
    } else {
      // 지상 마찰
      if (!['walk', 'jump'].includes(this.state)) this.vx *= 0.88;
    }

    // 벽 처리 + 벽꽝
    const minX = stage.wallL + 9, maxX = stage.wallR - 9;
    if (this.x < minX || this.x > maxX) {
      const wallX = this.x < minX ? minX : maxX;
      // 벽꽝: 날아가는 중 빠른 속도로 벽에 닿으면 튕김 + 추가 콤보 기회
      if (this.state === 'launched' && Math.abs(this.vx) > 2.0 && !this.wallSplatUsed) {
        this.wallSplatUsed = true;
        this.vx = -Math.sign(this.vx) * Math.abs(this.vx) * 0.38;
        this.vy = Math.max(this.vy, 2.6);
        this.flashT = 4;
        FX.shake(6);
        FX.hitSpark(wallX, Stages.GROUND_Y - this.y - 24, 4, '#ffffff');
        FX.dust(wallX, Stages.GROUND_Y - this.y - 10, 8, -Math.sign(this.vx));
        FX.addText(wallX - Math.sign(this.x - wallX) * 0, Stages.GROUND_Y - this.y - 50, 'WALL!', '#ff8c5a', true);
        FX.sfx.wall();
      } else {
        this.vx = 0;
      }
      this.x = wallX;
    }
  }
}
