/* ============================================================
 * FRIEND FIGHTERS — 캐릭터 / 스테이지 데이터
 * ============================================================
 * ★ 친구들 정보로 바꾸려면 이 파일만 수정하면 됩니다! ★
 *
 * 각 캐릭터 항목:
 *  - name/title/catch : 이름 / 별명 / 말버릇
 *  - colors, hairStyle('spiky'|'ponytail'|'buzz'|'bowl'), headband
 *  - stats     : hp / speed / power / weight
 *  - archetype : 'grappler'(파워 그래플러) | 'trickster'(리치 트릭스터) |
 *                'balance'(밸런스 콤보형)
 *  - special   : ↓→+펀치 필살기. type:
 *      'commandGrab'  커맨드 잡기 (가드 불가 메치기 한 방)     — 그래플러
 *      'projectile'   장풍 (날아가는 견제기)                  — 트릭스터
 *      'uppercut'     콤보 시동 어퍼 (띄우기+저글링 버프)      — 밸런스
 *      'rushKick' / 'quake' 도 프레임워크에 남아있음 (자유 사용)
 *  - special2  : ↓←+펀치 보조 특수기 (↓→+킥 띄우기는 전 캐릭터 공통).
 *      'counterStance' 가드 반격기 (받아치기)                 — 트릭스터
 *  - awaken    : { ratio, mul } 체력이 ratio 이하면 각성(공격력 x mul) — 밸런스
 *  - strings   : 연속기. steps: [{btn:'lp|rp|lk|rk', base:기본기키, mod:{덮어쓰기}}]
 *                같은 시작 버튼으로 마지막 타가 상단/하단 갈리게 만들면 이지선다!
 *  - quotes / rivals : 대사
 * ============================================================ */

/*  - body : 체격. scale(전체 크기 배율), shoulder(어깨 폭 추가),
 *           sleeveless(민소매), suit(수트 깃), glasses(선글라스 색), brow('angry')
 *  - quotes.lose : 패배 대사 (승리 화면에 패자 한 줄)
 *  - 승리 대사를 배열의 배열로 주면 순차 출력 (예: ㅋㅋ x5 → 연습하라고)
 */
const CHARACTERS = [
  {
    id: 'limjun',
    name: '림준',
    title: '긍정의 왕',
    catch: 'OK MAN',
    colors: {
      hair: '#15120e', skin: '#f0c49a', top: '#16161d',    // 올블랙 수트코트
      pants: '#101016', shoes: '#0a0a0a', accent: '#ffd24a'
    },
    hairStyle: 'parted',       // 가르마 앞머리
    headband: false,
    body: { scale: 1.12, shoulder: 1, suit: true, face: 'mixed' },   // 184~185, 셋 중 가장 큼
    winPose: 'roar',           // 승리: 포효
    ending: '모든 상황을 타파하고 이겨내는 남자, 림준. 오늘 밤 전장은 의리로 불탔다. 크하하하! OK MAN.',
    stats: { hp: 102, speed: 1.05, power: 1.05, weight: 1.0 },
    archetype: 'balance',      // 밸런스 콤보형 주인공: 각성 + 콤보 시동기. 공중콤보 최강
    special: {
      type: 'uppercut',
      name: '빡오더',
      dmg: 14,
      comboStarter: true       // 이 기술로 띄우면 저글링이 더 쉬움
    },
    awaken: {
      ratio: 0.3, mul: 1.25, label: '긍정의 왕',
      quote: '하지만 나 림준, 긍정의 왕!!'
    },
    strings: [
      { name: '의리 원투',                                          // 마지막 중단
        steps: [{ btn: 'lp' }, { btn: 'lp' }, { btn: 'rp', mod: { dmg: 10, name: '의리 스트레이트' } }] },
      { name: '의리 로우',                                          // 마지막 하단!
        steps: [{ btn: 'lp' }, { btn: 'lp' }, { btn: 'rk', base: 'drk', mod: { dmg: 7, startup: 14, recovery: 18, name: '사나이 로우' } }] },
      { name: '오더 콤보',
        steps: [{ btn: 'rp' }, { btn: 'rp', base: 'drp', mod: { dmg: 9, name: '바디 오더' } }, { btn: 'rk', mod: { dmg: 12, name: '결재 하이킥' } }] },
      { name: '잽 하이킥',                                          // 잽 → 상단 마무리
        steps: [{ btn: 'lp' }, { btn: 'rk', mod: { dmg: 12, name: '의리 하이킥' } }] },
      { name: '더블 미들',
        steps: [{ btn: 'lk' }, { btn: 'lk', mod: { startup: 9, dmg: 8, name: '더블 미들' } }] }
    ],
    quotes: {
      intro: [
        '오늘 밤, 사나이들의 의리로 전장을 불태우노라',
        '하지만 나 림준, 모든 상황을 타파하고 이겨내는 남자'
      ],
      win: ['약하군', '크하하하! OK MAN', '뿌신다 그냥 ㅋ'],
      lose: '잣댓다 그냥 ㅋ'
    },
    rivals: {
      dongi: {
        intro: '동희 ㄱㄱ? 대답 없으면 형이 이기는 걸로',
        win: '크하하하! OK MAN. 동희는 형 못 이김'
      },
      junbeom: {
        intro: '범준씨, 오늘 형이 좀 진심임',
        win: '약하군. 주차비는 범준씨가 내는 걸로'
      }
    }
  },

  {
    id: 'dongi',
    name: '리동이',
    title: '쿠킹호일 현자',
    catch: 'ㅋㅅㅋㅅㅋㅅㅋ',
    colors: {
      hair: '#1f1f24', skin: '#ecc096', top: '#3da45a',    // 초록 반팔
      pants: '#cbb68f', shoes: '#f0f0f0', accent: '#6ba8ff' // 베이지 긴바지 + 흰 신발
    },
    hairStyle: 'bowl',         // 대충 내림 머리
    headband: false,
    body: { scale: 1.08, shoulder: 2, glasses: '#1a1a20', face: 'oval' }, // 벌크 + 검정 뿔테, 계란형 얼굴
    winPose: 'glasses',        // 승리: 안경 올리기
    ending: 'ㅋㅅㅋㅅㅋㅅㅋ 쿠킹호일의 시대가 왔다. 내 졸업장은 제미나이 줘야 함 𓂻𓂭𓂾',
    stats: { hp: 114, speed: 0.96, power: 1.0, weight: 1.1 },
    reachMul: 1.15,            // 팔다리가 길다 (리치형)
    archetype: 'trickster',    // 리치 트릭스터: 장풍 + 가드 반격. 거리 견제형
    special: {
      type: 'projectile',
      name: '제미나이 소환',
      dmg: 10,
      style: 'drone'           // 드론 모양 장풍
    },
    special2: {
      type: 'counterStance',
      name: '쿠킹호일 실드',
      dmg: 14
    },
    strings: [
      { name: '잽잽',
        steps: [{ btn: 'lp' }, { btn: 'lp' }] },
      { name: '롱리치 트리플',                                      // 마지막 상단 (앉으면 휘피)
        steps: [{ btn: 'lk' }, { btn: 'lk', mod: { startup: 8 } }, { btn: 'rk', mod: { dmg: 13, name: '풀스윙 하이킥' } }] },
      { name: '바닥 긁기',                                          // 마지막 하단!
        steps: [{ btn: 'lk' }, { btn: 'lk', mod: { startup: 8 } }, { btn: 'lk', base: 'dlk', mod: { dmg: 6, name: '호일 짠발' } }] },
      { name: '드론 펀치 러시',                                     // 마지막 벽꽝
        steps: [{ btn: 'rp' }, { btn: 'rp', mod: { startup: 10, dmg: 7 } }, { btn: 'rp', mod: { dmg: 11, name: '풀차지 스트레이트', wallSplat: true } }] },
      { name: '잽잽 로우',                                          // 잽 2 → 하단
        steps: [{ btn: 'lp' }, { btn: 'lp' }, { btn: 'lk', base: 'dlk', mod: { dmg: 6, name: '기습 짠발' } }] }
    ],
    quotes: {
      intro: ['ㅋㅅㅋㅅㅋㅅㅋ 형이 봐줄게'],
      win: [
        '리발 너무 약한 거 아니냐 𓂻𓂭𓂾',
        'ㅋㅅㅋㅅㅋㅅㅋ 형이 또 다른 애 데려올게 𓂻𓂭𓂾'
      ],
      lose: '아 개 리발'
    },
    rivals: {
      limjun: {
        intro: 'ㅋㅅㅋㅅㅋㅅㅋ 형이 한 수 가르쳐줄게 짜식아',
        win: '리발 림준 너무 약한 거 아니냐 𓂻𓂭𓂾'
      },
      junbeom: {
        intro: '범준아 형이 살살 할게 𓂻𓂭𓂾',
        win: 'ㅋㅅㅋㅅㅋㅅㅋ 범준이 오늘도 정산 실패'
      }
    }
  },

  {
    id: 'junbeom',
    name: '림준범',
    title: '주차장의 지배자',
    catch: '…',
    colors: {
      hair: '#1a1a1a', skin: '#e2b48c', top: '#1d1d22',    // 검은 민소매
      pants: '#23232b', shoes: '#3a3a42', accent: '#ff5b3c'
    },
    hairStyle: 'cap',          // 볼캡
    headband: false,
    // 174cm — 살짝 작고, 어깨는 제일 넓고 단단하게 (닌자거북이)
    body: { scale: 0.99, shoulder: 2.5, sleeveless: true, brow: 'angry', capBack: true, face: 'square' },
    winPose: 'cross',          // 승리: 팔짱
    ending: '… (주차장에 평화가 찾아왔다. 주차비는 진 사람이 낸다.)',
    stats: { hp: 118, speed: 0.82, power: 1.35, weight: 1.25 },
    archetype: 'grappler',     // 파워 그래플러: 느리지만 한 방 최강, 잡기 특화
    special: {
      type: 'commandGrab',
      name: '주차비 정산',     // 커맨드 잡기: 가드 위에서도 잡는다. 풀기 불가
      dmg: 26
    },
    special2: {
      type: 'counterStance',
      name: '다이렉트 시술',   // 카운터 한 방
      dmg: 20
    },
    strings: [
      { name: '잽잽',
        steps: [{ btn: 'lp' }, { btn: 'lp' }] },
      { name: '시술 러시',                                          // 마지막 상단 큰 거
        steps: [{ btn: 'rp' }, { btn: 'rp', mod: { startup: 9, dmg: 8 } }, { btn: 'rk', mod: { dmg: 14, name: '마무리 시술' } }] },
      { name: '정산 로우',                                          // 마지막 하단!
        steps: [{ btn: 'rp' }, { btn: 'rp', mod: { startup: 9, dmg: 8 } }, { btn: 'rk', base: 'drk', mod: { dmg: 11, name: '발목 정산' } }] },
      { name: '원투 해머',
        steps: [{ btn: 'lp' }, { btn: 'rp', mod: { dmg: 11, name: '해머 스트레이트', wallSplat: true } }] },
      { name: '로킥 훅',                                            // 하단 → 상단 역이지선다
        steps: [{ btn: 'lk', base: 'dlk' }, { btn: 'rp', mod: { dmg: 10, name: '카운터 훅' } }] }
    ],
    quotes: {
      intro: ['?'],
      win: [['ㅋㅋ', 'ㅋㅋ', 'ㅋㅋ', 'ㅋㅋ', 'ㅋㅋ', '연습하라고']],  // 순차 출력
      lose: '주차비 너가 내라'
    },
    rivals: {
      limjun: {
        intro: '죽었겠냐. 형인데',
        win: ['ㅋㅋ', 'ㅋㅋ', 'ㅋㅋ', 'ㅋㅋ', 'ㅋㅋ', '연습하라고']
      },
      dongi: {
        intro: '들어오셈. 재미없을텐데',
        win: ['ㅋㅋ', 'ㅋㅋ', '동이 주차비 2배']
      }
    }
  }
];

/* ---------- 스테이지 메타 (그리기는 stages.js) ---------- */
const STAGE_LIST = [
  { id: 'rooftop', name: '노을 옥상',  desc: '도심 빌딩 옥상 · 석양' },
  { id: 'neon',    name: '네온 거리',  desc: '밤거리 · 네온사인' },
  { id: 'river',   name: '한강 둔치',  desc: '강변 · 다리와 노을' }
];

/* ---------- 공통 기술 프레임데이터 (60fps 기준, 철권식) ----------
 * level: 'high'(상단 - 앉으면 휘피) / 'mid'(중단 - 앉아가드 뚫음) /
 *        'low'(하단 - 앉아 가드만 가능)
 * limb: 사용하는 팔다리 (모션용), crouch: 앉은 자세로 발동
 * dmg는 캐릭터 power 배율이 곱해짐. kbUp > 0 이면 띄우기, trip은 다리 걸어 다운.
 * ------------------------------------------------------------ */
const MOVES = {
  // ----- 서서 (철권 템포: 잽 i9, 큰 기술은 확실히 느리게) -----
  lp:  { name: '왼손 잽',          limb: 'handF', level: 'high', dmg: 4,  startup: 9,  active: 2, recovery: 10, reach: 28, hitY: 35, hbH: 12, kb: 1.2, kbUp: 0, hitstun: 18, blockstun: 10 },
  rp:  { name: '오른손 스트레이트', limb: 'handB', level: 'high', dmg: 9,  startup: 14, active: 3, recovery: 17, reach: 32, hitY: 32, hbH: 14, kb: 3.0, kbUp: 0, hitstun: 24, blockstun: 13, wallSplat: true },
  lk:  { name: '왼발 미들킥',      limb: 'footF', level: 'mid',  dmg: 7,  startup: 13, active: 3, recovery: 15, reach: 34, hitY: 24, hbH: 16, kb: 2.2, kbUp: 0, hitstun: 21, blockstun: 12 },
  rk:  { name: '오른발 하이킥',    limb: 'footB', level: 'high', dmg: 11, startup: 17, active: 3, recovery: 19, reach: 36, hitY: 33, hbH: 16, kb: 3.8, kbUp: 0, hitstun: 27, blockstun: 14, wallSplat: true },
  // ----- 앉아 (↓ + 버튼) -----
  dlp: { name: '앉아 잽',    crouch: true, level: 'mid', dmg: 3,  startup: 10, active: 2, recovery: 12, reach: 25, hitY: 22, hbH: 12, kb: 1.0, kbUp: 0, hitstun: 15, blockstun: 9 },
  drp: { name: '앉아 어퍼',  crouch: true, level: 'mid', dmg: 8,  startup: 14, active: 3, recovery: 18, reach: 27, hitY: 28, hbH: 20, kb: 2.0, kbUp: 0, hitstun: 20, blockstun: 11 },
  dlk: { name: '짠발',       limb: 'footF', crouch: true, level: 'low', dmg: 4,  startup: 12, active: 2, recovery: 14, reach: 30, hitY: 7,  hbH: 10, kb: 1.2, kbUp: 0, hitstun: 16, blockstun: 9 },
  drk: { name: '스윕',       limb: 'footB', crouch: true, level: 'low', dmg: 10, startup: 19, active: 4, recovery: 26, reach: 34, hitY: 6,  hbH: 10, kb: 1.6, kbUp: 0, hitstun: 30, blockstun: 13, trip: true },
  // ----- 기상기 (↓ 꾹 유지 후 떼는 순간) — 띄우기! -----
  ws:  { name: '기상 어퍼',  limb: 'handB', level: 'mid', dmg: 10, startup: 14, active: 4, recovery: 18, reach: 28, hitY: 28, hbH: 34, kb: 1.2, kbUp: 7.0, hitstun: 40, blockstun: 13 },
  // ----- 커맨드 띄우기 (↓→ + 발, 전 캐릭터 공통) — 콤보 시동! -----
  launcher: { name: '띄우기', limb: 'footF', level: 'mid', dmg: 9, startup: 14, active: 4, recovery: 16, reach: 30, hitY: 26, hbH: 34, kb: 1.0, kbUp: 7.2, hitstun: 40, blockstun: 13 },
  // ----- 기상 발차기 (다운 상태에서 발 버튼) -----
  wakeKick: { name: '기상킥', limb: 'footF', level: 'mid', dmg: 8, startup: 12, active: 4, recovery: 22, reach: 30, hitY: 22, hbH: 22, kb: 3.2, kbUp: 0, hitstun: 22, blockstun: 12 },
  // ----- 공중 -----
  airKick:  { name: '점프킥',    limb: 'footF', level: 'mid', dmg: 7, startup: 7, active: 10, recovery: 8, reach: 30, hitY: 4, hbH: 20, kb: 2.0, kbUp: 0, hitstun: 20, blockstun: 11 },
  airPunch: { name: '점프 펀치', level: 'mid', dmg: 5, startup: 6, active: 8,  recovery: 6, reach: 26, hitY: 8, hbH: 16, kb: 1.6, kbUp: 0, hitstun: 16, blockstun: 9 },
  // ----- 방향 커맨드 기본기 (←/→ + 버튼) -----
  flp: { name: '오버핸드 레프트',  limb: 'handF', level: 'mid',  dmg: 7,  startup: 12, active: 3, recovery: 14, reach: 26, hitY: 31, hbH: 14, kb: 2.0, kbUp: 0, hitstun: 19, blockstun: 11 },
  frp: { name: '오버핸드 라이트',  limb: 'handB', level: 'mid',  dmg: 10, startup: 15, active: 3, recovery: 18, reach: 28, hitY: 31, hbH: 14, kb: 2.6, kbUp: 0, hitstun: 23, blockstun: 13 },
  frk: { name: '앞차기',           limb: 'footF', level: 'mid',  dmg: 9,  startup: 14, active: 3, recovery: 17, reach: 34, hitY: 26, hbH: 16, kb: 4.6, kbUp: 0, hitstun: 22, blockstun: 13 },
  blp: { name: '백스핀 훅',        limb: 'handF', level: 'high', dmg: 8,  startup: 13, active: 3, recovery: 16, reach: 28, hitY: 33, hbH: 13, kb: 3.0, kbUp: 0, hitstun: 21, blockstun: 12 },
  brp: { name: '어퍼컷',           limb: 'handB', level: 'mid',  dmg: 9,  startup: 14, active: 3, recovery: 19, reach: 22, hitY: 30, hbH: 26, kb: 1.4, kbUp: 5.4, hitstun: 36, blockstun: 13 },
  brk: { name: '뒤돌려차기',       limb: 'footB', level: 'high', dmg: 13, startup: 20, active: 3, recovery: 23, reach: 36, hitY: 33, hbH: 16, kb: 4.4, kbUp: 0, hitstun: 28, blockstun: 14 },
  // ----- 잡기 (왼손+오른손 동시입력 / 잡힌 직후 펀치로 풀기) -----
  grab: { name: '잡기', dmg: 14, startup: 9, active: 3, recovery: 24, reach: 26 }
};

/* 콤보 데미지 보정: n번째 히트(1부터)의 배율 */
function comboScale(hitIndex) {
  const table = [1, 1, 0.85, 0.72, 0.6, 0.5, 0.42, 0.36, 0.32];
  return hitIndex < table.length ? table[hitIndex] : 0.3;
}

function charById(id) { return CHARACTERS.find(c => c.id === id); }
