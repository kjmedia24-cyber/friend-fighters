/* 헤드리스 스모크 테스트: 캔버스/DOM 스텁으로 풀매치 시뮬레이션
 *  1) 2인 대전 메뉴 흐름 + KO까지 풀매치
 *  2) 띄우기 → 공중 콤보가 3히트 이상 실제로 들어가는지
 *  3) AI(어려움)가 방치된 P1에게 데미지 + 콤보를 내는지
 * 실행: node tests/smoke.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeCtxStub() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return () => gradient;
      }
      return () => undefined;
    },
    set(target, prop, val) { target[prop] = val; return true; }
  });
}

const listeners = {};
let rafCb = null;
let simNow = 0;

const sandbox = {
  console, Math, JSON, performance: { now: () => simNow },
  requestAnimationFrame: cb => { rafCb = cb; },
  document: {
    getElementById: () => ({ width: 960, height: 540, getContext: () => makeCtxStub() }),
    createElement: () => ({ width: 0, height: 0, getContext: () => makeCtxStub() })
  }
};
sandbox.window = sandbox;
sandbox.window.addEventListener = (type, fn) => {
  (listeners[type] = listeners[type] || []).push(fn);
};
vm.createContext(sandbox);

const files = ['data.js', 'input.js', 'sprites.js', 'fx.js', 'stages.js', 'fighter.js', 'ai.js', 'game.js', 'main.js'];
const src = files.map(f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8')).join('\n;\n');
vm.runInContext(src, sandbox, { filename: 'bundle.js' });

function key(code, type) {
  for (const fn of listeners[type] || []) fn({ code, preventDefault() {} });
}
function tap(code) { key(code, 'keydown'); key(code, 'keyup'); }
function frames(n) {
  for (let i = 0; i < n; i++) { simNow += 16.7; rafCb(simNow); }
}
const get = expr => vm.runInContext(expr, sandbox);
function getState() {
  return get('({phase: Game.phase, f: Game.fighters.map(f=>f&&({hp:f.hp,state:f.state,x:Math.round(f.x),mc:f.maxCombo}))})');
}

/* ========== 시나리오 1: 2인 대전 풀매치 ========== */
frames(10);
tap('Enter'); frames(5);                 // 타이틀 → 모드
tap('Enter'); frames(5);                 // 2인 대전 → 캐릭터 선택
tap('KeyR'); frames(5);                  // P1 = 림준 (밸런스 콤보형, ↓→+킥 띄우기 보유)
tap('ArrowRight'); frames(2);
tap('KeyU'); frames(5);                  // P2 = 림준범 (무거움 — 저글링 최악 케이스 검증)
tap('KeyD'); frames(2);
tap('Enter'); frames(5);                 // 매치 시작

let st = getState();
console.log('매치 시작 후 phase:', st.phase);
if (!['intro', 'round', 'fight'].includes(st.phase)) throw new Error('매치 시작 실패: ' + st.phase);

tap('KeyR'); frames(10); tap('KeyR'); frames(10);   // 인트로 스킵
frames(80);
st = getState();
console.log('전투 단계:', st.phase, st.f);
if (st.phase !== 'fight') throw new Error('fight 진입 실패: ' + st.phase);

/* ---- 1-a) 띄우기 → 공중 콤보 검증 ---- */
// P1을 P2 앞까지 전진
key('KeyD', 'keydown');
for (let i = 0; i < 90; i++) {
  frames(1);
  const d = get('Math.abs(Game.fighters[0].x - Game.fighters[1].x)');
  if (d < 26) break;
}
key('KeyD', 'keyup'); frames(3);
// ↓→+킥(F) = 띄우기
key('KeyS', 'keydown'); frames(4); key('KeyS', 'keyup');
key('KeyD', 'keydown'); frames(2);
tap('KeyF'); key('KeyD', 'keyup');
// 떠 있는 동안 전진하며 잽(R) 연타로 저글링
// (방향키를 누른 채 잽을 치면 →+R 커맨드 노멀이 나가므로, 잽 칠 땐 잠깐 뗀다)
for (let i = 0; i < 130; i++) {
  if (i % 8 === 0) { key('KeyD', 'keyup'); tap('KeyR'); }
  if (i % 8 === 2) key('KeyD', 'keydown');
  frames(1);
}
key('KeyD', 'keyup');
st = getState();
console.log('저글링 후 P2 maxCombo:', st.f[1].mc);
if (st.f[1].mc < 3) throw new Error('공중 콤보가 이어지지 않음 (maxCombo=' + st.f[1].mc + ')');

/* ---- 1-b) 막싸움으로 매치 끝까지 ---- */
const p1Keys = ['KeyR', 'KeyT', 'KeyF', 'KeyG', 'KeyW'];
const p2Keys = ['KeyU', 'KeyI', 'KeyJ', 'KeyK', 'ArrowUp'];
let koSeen = false;
for (let i = 0; i < 18000; i++) {
  if (i % 7 === 0) { key('KeyD', 'keydown'); key('ArrowLeft', 'keydown'); }
  if (i % 13 === 0) { key('KeyD', 'keyup'); key('ArrowLeft', 'keyup'); }
  if (i % 5 === 0) tap(p1Keys[i % p1Keys.length]);
  if (i % 6 === 0) tap(p2Keys[(i + 2) % p2Keys.length]);
  frames(1);
  st = getState();
  if (st.phase === 'ko') koSeen = true;
  if (st.phase === 'done') break;
}
key('KeyD', 'keyup'); key('ArrowLeft', 'keyup');
st = getState();
console.log('시나리오1 종료 phase:', st.phase, 'KO 발생:', koSeen, st.f);
const result = get('Game.result && Game.result.winnerChar.name');
if (st.phase !== 'done' || !result) throw new Error('매치 미완료 (phase=' + st.phase + ')');
console.log('승자:', result);

/* ========== 시나리오 2: AI 대전 (어려움) ========== */
tap('Escape'); frames(5);                // 타이틀로
tap('Enter'); frames(5);                 // 모드
tap('KeyS'); frames(2); tap('KeyS'); frames(2); tap('KeyS'); frames(2);  // AI 어려움
tap('Enter'); frames(5);
tap('KeyA'); frames(70);                 // P1 결정 → CPU 롤 → 스테이지
tap('Enter'); frames(5);                 // 매치 시작
tap('KeyA'); frames(10); tap('KeyA'); frames(90);   // 인트로 스킵
st = getState();
console.log('AI전 전투 단계:', st.phase, st.f);
if (st.phase !== 'fight') throw new Error('AI전 fight 진입 실패: ' + st.phase);

// P1 방치 → AI가 데미지 + 콤보를 내는지 (라운드 중 최소 체력/최대 콤보 추적)
const p1MaxHp = get('Game.fighters[0].maxHp');
let p1MinHp = p1MaxHp, aiMaxCombo = 0;
for (let i = 0; i < 12000; i++) {
  frames(1);
  st = getState();
  if (st.phase === 'fight') {
    p1MinHp = Math.min(p1MinHp, st.f[0].hp);
    aiMaxCombo = Math.max(aiMaxCombo, st.f[0].mc);
  }
  if (st.phase === 'done') break;
}
st = getState();
console.log('AI전 결과 phase:', st.phase, 'P1 최소 체력:', p1MinHp, '/', p1MaxHp, 'AI 최대 콤보:', aiMaxCombo);
if (p1MinHp >= p1MaxHp) throw new Error('AI가 데미지를 전혀 입히지 못함');
if (st.phase !== 'done') throw new Error('AI전 미완료');
if (aiMaxCombo < 2) throw new Error('AI(어려움)가 콤보를 보여주지 못함 (max=' + aiMaxCombo + ')');

console.log('\n✅ 스모크 테스트 통과');
