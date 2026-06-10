/* ============================================================
 * 연출/이펙트 — 히트스파크, 파티클, 화면 흔들림, 히트스톱,
 *               슬로우모션, 플로팅 텍스트, WebAudio 효과음
 * ============================================================ */

const FX = (() => {
  let particles = [];
  let texts = [];
  let shakeMag = 0;
  let hitstop = 0;        // 양쪽 정지 프레임
  let timescale = 1;      // KO 슬로우모션용
  let flashAlpha = 0;     // 전체 화면 플래시

  function reset() {
    particles = []; texts = []; shakeMag = 0; hitstop = 0; timescale = 1; flashAlpha = 0;
  }

  /* ---------- 파티클 ---------- */
  function spawn(n, fn) { for (let i = 0; i < n; i++) particles.push(fn(i)); }

  function hitSpark(x, y, power, color) {
    spawn(8 + power * 2, () => {
      const a = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * (1.5 + power * 0.5);
      return {
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.8,
        life: 10 + Math.random() * 8, maxLife: 18,
        size: 1 + Math.random() * 2, color: color || '#ffe26b', g: 0.05, type: 'spark'
      };
    });
    particles.push({ x, y, life: 6, maxLife: 6, size: 6 + power * 2, color: '#fff', type: 'flash' });
  }

  function blockSpark(x, y) {
    spawn(5, () => {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      return {
        x, y, vx: Math.cos(a) * 1.5, vy: Math.sin(a) * 1.5,
        life: 8 + Math.random() * 5, maxLife: 13,
        size: 1.5, color: '#9ecfff', g: 0, type: 'spark'
      };
    });
  }

  function flame(x, y, n) {
    spawn(n || 10, () => ({
      x: x + (Math.random() - 0.5) * 8, y,
      vx: (Math.random() - 0.5) * 0.8, vy: -(1 + Math.random() * 2.2),
      life: 12 + Math.random() * 10, maxLife: 22,
      size: 2 + Math.random() * 2.5,
      color: ['#ff8c1a', '#ffd24a', '#ff4d2b'][Math.floor(Math.random() * 3)],
      g: -0.02, type: 'flame'
    }));
  }

  function bolt(x, y, n) {
    spawn(n || 8, () => ({
      x: x + (Math.random() - 0.5) * 14, y: y + (Math.random() - 0.5) * 16,
      vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3,
      life: 5 + Math.random() * 5, maxLife: 10,
      size: 1 + Math.random() * 1.5, color: Math.random() < 0.5 ? '#7ee0ff' : '#ffffff',
      g: 0, type: 'bolt'
    }));
  }

  function dust(x, y, n, dir) {
    spawn(n || 8, () => ({
      x: x + (Math.random() - 0.5) * 10, y,
      vx: (dir || (Math.random() < 0.5 ? -1 : 1)) * (0.5 + Math.random() * 2.2),
      vy: -(0.4 + Math.random() * 1.4),
      life: 14 + Math.random() * 12, maxLife: 26,
      size: 1.5 + Math.random() * 2, color: '#b9a98c', g: 0.06, type: 'dust'
    }));
  }

  function koBurst(x, y) {
    spawn(26, () => {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 3.5;
      return {
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 20 + Math.random() * 20, maxLife: 40,
        size: 1.5 + Math.random() * 2.5,
        color: ['#fff', '#ffd24a', '#ff6b6b'][Math.floor(Math.random() * 3)],
        g: 0.04, type: 'spark'
      };
    });
    flashAlpha = 0.85;
  }

  /* ---------- 텍스트 (콤보/WALL!/COUNTER 등) ---------- */
  function addText(x, y, str, color, big) {
    texts.push({ x, y, str, color: color || '#ffd24a', life: 40, maxLife: 40, big: !!big, vy: -0.5 });
  }

  /* ---------- 화면 효과 ---------- */
  let slowmoT = 0;
  function shake(mag) { shakeMag = Math.max(shakeMag, mag); }
  function stop(frames) { hitstop = Math.max(hitstop, frames); }
  function setTimescale(s) { timescale = s; slowmoT = 0; }
  // 일시 슬로우모션 (띄우기 성공 연출 등) — frames 후 자동 복귀
  function slowmo(frames, scale) { slowmoT = frames; timescale = scale; }

  function update() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life--;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      if (p.vx !== undefined) {
        p.x += p.vx; p.y += p.vy;
        p.vy += p.g || 0;
        p.vx *= 0.96;
      }
    }
    for (let i = texts.length - 1; i >= 0; i--) {
      const t = texts[i];
      t.life--; t.y += t.vy;
      if (t.life <= 0) texts.splice(i, 1);
    }
    shakeMag *= 0.85;
    if (shakeMag < 0.3) shakeMag = 0;
    flashAlpha *= 0.88;
    if (slowmoT > 0 && --slowmoT === 0) timescale = 1;
  }

  function tickHitstop() {
    if (hitstop > 0) { hitstop--; return true; }
    return false;
  }

  /* ---------- 그리기 (월드 좌표, 카메라 변환 적용된 ctx) ---------- */
  function drawWorld(ctx) {
    for (const p of particles) {
      const a = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = a;
      if (p.type === 'flash') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'bolt') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x - p.vx * 2, p.y - p.vy * 2);
        ctx.lineTo(p.x + p.vx * 2, p.y + p.vy * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
    for (const t of texts) {
      const a = Math.min(1, t.life / 14);
      ctx.globalAlpha = a;
      ctx.font = t.big ? 'bold 14px monospace' : 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#1a1020';
      ctx.fillText(t.str, t.x + 1, t.y + 1);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawScreen(ctx, W, H) {
    if (flashAlpha > 0.02) {
      ctx.globalAlpha = flashAlpha;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  function getShake() {
    if (shakeMag <= 0) return [0, 0];
    return [(Math.random() - 0.5) * 2 * shakeMag, (Math.random() - 0.5) * 2 * shakeMag];
  }

  /* ---------- 사운드 (WebAudio 신디사이저) ---------- */
  let actx = null, muted = false;
  function audio() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  function toggleMute() { muted = !muted; return muted; }

  function tone(freq, dur, type, vol, slide) {
    const ac = audio();
    if (!ac || muted) return;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, ac.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), ac.currentTime + dur);
    g.gain.setValueAtTime(vol || 0.08, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    o.connect(g); g.connect(ac.destination);
    o.start(); o.stop(ac.currentTime + dur);
  }
  function noise(dur, vol) {
    const ac = audio();
    if (!ac || muted) return;
    const len = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource(); src.buffer = buf;
    const g = ac.createGain(); g.gain.value = vol || 0.1;
    src.connect(g); g.connect(ac.destination);
    src.start();
  }

  const sfx = {
    hit:    () => { tone(160, 0.1, 'square', 0.1, -100); noise(0.06, 0.08); },
    heavy:  () => { tone(90, 0.18, 'square', 0.13, -60); noise(0.12, 0.12); },
    block:  () => { tone(420, 0.06, 'triangle', 0.07, -150); },
    whiff:  () => { noise(0.05, 0.04); },
    launch: () => { tone(220, 0.25, 'sawtooth', 0.1, 300); },
    grab:   () => { tone(70, 0.2, 'square', 0.12, -30); noise(0.1, 0.1); },
    ko:     () => { tone(60, 0.7, 'sawtooth', 0.16, -40); noise(0.4, 0.15); },
    wall:   () => { tone(50, 0.3, 'square', 0.15, -20); noise(0.2, 0.13); },
    select: () => { tone(660, 0.08, 'square', 0.06, 200); },
    confirm:() => { tone(520, 0.12, 'square', 0.07, 300); },
    round:  () => { tone(330, 0.3, 'square', 0.08, 110); },
    special:() => { tone(180, 0.3, 'sawtooth', 0.12, 400); }
  };

  return {
    reset, update, tickHitstop,
    hitSpark, blockSpark, flame, bolt, dust, koBurst, addText,
    shake, stop, setTimescale, slowmo,
    get timescale() { return timescale; },
    get hitstop() { return hitstop; },
    drawWorld, drawScreen, getShake,
    sfx, toggleMute, audio
  };
})();
