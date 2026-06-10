/* 헤드리스 스모크 테스트: 캔버스/DOM을 스텁으로 대체하고
 * 메뉴 → 캐릭터/스테이지 선택 → 대전 풀매치를 시뮬레이션한다.
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

let simNow = 0;
vm.runInContext(src, sandbox, { filename: 'bundle.js' });

function key(code, type) {
  for (const fn of listeners[type] || []) fn({ code, preventDefault() {} });
}
function tap(code) { key(code, 'keydown'); key(code, 'keyup'); }
function frames(n) {
  for (let i = 0; i < n; i++) { simNow += 16.7; rafCb(simNow); }
}

function getState() {
  return vm.runInContext('({phase: Game.phase, f: Game.fighters.map(f=>f&&({hp:f.hp,state:f.state,x:Math.round(f.x)}))})', sandbox);
}

/* ---------- 시나리오 1: 2P 대전 ---------- */
frames(10);
tap('Enter'); frames(5);          // 타이틀 → 모드
tap('Enter'); frames(5);          // 2인 대전 → 캐릭터 선택
tap('KeyD'); frames(2);           // P1 커서 이동
tap('KeyF'); frames(5);           // P1 결정
tap('ArrowRight'); frames(2);
tap('Comma'); frames(5);          // P2 결정 → 스테이지
tap('KeyD'); frames(2);
tap('Enter'); frames(5);          // 매치 시작

let st = getState();
console.log('매치 시작 후 phase:', st.phase);
if (!['intro', 'round', 'fight'].includes(st.phase)) throw new Error('매치가 시작되지 않음: ' + st.phase);

tap('KeyF'); frames(10); tap('KeyF'); frames(10);   // 인트로 스킵
frames(80);                                          // ROUND/FIGHT 연출
st = getState();
console.log('전투 단계:', st.phase, st.f);
if (st.phase !== 'fight') throw new Error('fight 단계 진입 실패: ' + st.phase);

// 마구 싸우기: P1 전진+공격, P2 공격
const p1Keys = ['KeyF', 'KeyG', 'KeyH', 'KeyT', 'KeyW'];
const p2Keys = ['Comma', 'Period', 'Slash', 'ShiftRight', 'ArrowUp'];
let koSeen = false, prevHp = [null, null];
for (let i = 0; i < 6000; i++) {
  if (i % 7 === 0) { key('KeyD', 'keydown'); key('ArrowLeft', 'keydown'); }
  if (i % 13 === 0) { key('KeyD', 'keyup'); key('ArrowLeft', 'keyup'); }
  if (i % 5 === 0) tap(p1Keys[i % p1Keys.length]);
  if (i % 6 === 0) tap(p2Keys[(i + 2) % p2Keys.length]);
  // 커맨드 기술 흉내: ↓→+G
  if (i % 90 === 0) {
    key('KeyS', 'keydown'); frames(3); key('KeyS', 'keyup');
    key('KeyD', 'keydown'); frames(2); tap('KeyG'); key('KeyD', 'keyup');
  }
  frames(1);
  st = getState();
  if (st.phase === 'ko') koSeen = true;
  if (st.phase === 'done') break;
}
st = getState();
console.log('시나리오1 종료 phase:', st.phase, 'KO 발생:', koSeen, st.f);
const result = vm.runInContext('Game.result && Game.result.winnerChar.name', sandbox);
if (st.phase !== 'done' || !result) throw new Error('매치가 끝까지 진행되지 않음 (phase=' + st.phase + ')');
console.log('승자:', result);

/* ---------- 시나리오 2: AI 대전 (어려움) ---------- */
tap('Escape'); frames(5);         // 타이틀로
tap('Enter'); frames(5);          // 모드
tap('KeyS'); tap('KeyS'); tap('KeyS'); frames(2);  // AI 어려움
tap('Enter'); frames(5);
tap('KeyF'); frames(70);          // P1 결정 → CPU 롤 → 스테이지
tap('Enter'); frames(5);          // 매치 시작
tap('KeyF'); frames(10); tap('KeyF'); frames(90);  // 인트로 스킵 + 연출
st = getState();
console.log('AI전 전투 단계:', st.phase, st.f);
if (st.phase !== 'fight') throw new Error('AI전 fight 진입 실패: ' + st.phase);

// P1은 방치 → AI가 알아서 접근해 데미지를 입히는지 (라운드 중 최소 체력 추적)
const p1MaxHp = vm.runInContext('Game.fighters[0].maxHp', sandbox);
let p1MinHp = p1MaxHp;
for (let i = 0; i < 8000; i++) {
  frames(1);
  st = getState();
  if (st.phase === 'fight') p1MinHp = Math.min(p1MinHp, st.f[0].hp);
  if (st.phase === 'done') break;
}
st = getState();
console.log('AI전 결과 phase:', st.phase, 'P1 최소 체력:', p1MinHp, '/', p1MaxHp);
if (p1MinHp >= p1MaxHp) throw new Error('AI가 데미지를 전혀 입히지 못함');
if (st.phase !== 'done') throw new Error('AI전이 끝까지 진행되지 않음');

console.log('\n✅ 스모크 테스트 통과');
