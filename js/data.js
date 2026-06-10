/* ============================================================
 * FRIEND FIGHTERS — 캐릭터 / 스테이지 데이터
 * ============================================================
 * ★ 친구들 정보로 바꾸려면 이 파일만 수정하면 됩니다! ★
 *
 * 각 캐릭터 항목:
 *  - name      : 표시 이름
 *  - title     : 별명/수식어 (캐릭터 선택 화면에 표시)
 *  - catch     : 말버릇 (라운드 시작 시 가끔 외침)
 *  - colors    : 외형 색상 (hair 머리 / skin 피부 / top 상의 / pants 하의 /
 *                shoes 신발 / accent 포인트색 - 이펙트에도 사용)
 *  - hairStyle : 'spiky'(뾰족) | 'ponytail'(포니테일) | 'buzz'(짧은머리) | 'bowl'(바가지)
 *  - headband  : true 면 머리띠 착용
 *  - stats     : hp 체력 / speed 이동속도 배율 / power 공격력 배율 / weight 무게(1=보통)
 *  - special   : 필살기 (↓→+펀치) — type:
 *                'uppercut' 승룡권식 띄우기 / 'rushKick' 다단 연속차기 /
 *                'quake'    가드불능 지진 내려찍기
 *  - quotes    : intro 등장 대사 / win 승리 대사 (배열에서 랜덤)
 *  - rivals    : { 상대id: { intro: 등장 라이벌 대사, win: 승리 라이벌 대사 } }
 * ============================================================ */

const CHARACTERS = [
  {
    id: 'cheolsu',
    name: '김철수',            // ← 친구 이름으로 변경
    title: '불꽃의 주먹',
    catch: '가보자고!',
    colors: {
      hair: '#2b2018', skin: '#f0c49a', top: '#d9342b',
      pants: '#28304a', shoes: '#e8e4da', accent: '#ff8c1a'
    },
    hairStyle: 'spiky',
    headband: true,
    stats: { hp: 100, speed: 1.0, power: 1.05, weight: 1.0 },
    special: {
      type: 'uppercut',
      name: '플레임 어퍼',
      dmg: 16
    },
    quotes: {
      intro: [
        '오늘 매운맛 좀 보여줄게. 가보자고!',
        '준비됐지? 봐주는 거 없다!',
        '내 주먹, 오늘따라 뜨겁다?'
      ],
      win: [
        '캬~ 이게 바로 불꽃 주먹이지. 가보자고!',
        '아직 멀었어. 백 판 더 해도 똑같아!',
        '치킨은 진 사람이 사는 거다?'
      ]
    },
    rivals: {
      younghee: {
        intro: '영희! 저번 판은 인정 못 해. 오늘 끝장 보자!',
        win: '봤냐 영희! 이게 진짜 실력이라고! 가보자고!'
      }
    }
  },

  {
    id: 'younghee',
    name: '박영희',            // ← 친구 이름으로 변경
    title: '번개 발차기',
    catch: '시시하네.',
    colors: {
      hair: '#3a2a52', skin: '#f3d2b3', top: '#2e9bd6',
      pants: '#1d2233', shoes: '#cfd6e6', accent: '#7ee0ff'
    },
    hairStyle: 'ponytail',
    headband: false,
    stats: { hp: 92, speed: 1.18, power: 0.95, weight: 0.9 },
    special: {
      type: 'rushKick',
      name: '라이트닝 연격',
      dmg: 6,        // 1타당 (3타)
      hits: 3
    },
    quotes: {
      intro: [
        '3초 컷 예약이요.',
        '발 끝에 번개 달았거든. 따라올 수 있겠어?',
        '워밍업도 필요 없겠네. 시시하네.'
      ],
      win: [
        '응, 역시 시시하네.',
        '눈 깜빡였어? 그래서 진 거야.',
        '다음엔 두 배 빠르게 가줄게.'
      ]
    },
    rivals: {
      cheolsu: {
        intro: '철수, 너 주먹은 뜨거운데 발이 느려. 오늘도 내가 이겨.',
        win: '철수~ 이걸로 내가 3연승? 치킨 사 와.'
      }
    }
  },

  {
    id: 'minjun',
    name: '이민준',            // ← 친구 이름으로 변경
    title: '잠자는 거인',
    catch: '밥 먹고 하자~',
    colors: {
      hair: '#1c1c1c', skin: '#e6b98c', top: '#3da45a',
      pants: '#4a3a2a', shoes: '#2b2b2b', accent: '#b6ff66'
    },
    hairStyle: 'buzz',
    headband: false,
    stats: { hp: 115, speed: 0.85, power: 1.2, weight: 1.2 },
    special: {
      type: 'quake',
      name: '그라운드 퀘이크',
      dmg: 17
    },
    quotes: {
      intro: [
        '하암… 빨리 끝내고 밥 먹으러 가자~',
        '살살 할게. 진짜로. 아마도.',
        '귀찮은데… 한 대면 끝나려나.'
      ],
      win: [
        '끝? 그럼 이제 밥 먹고 하자~',
        '미안, 손이 좀 무거웠지?',
        '운동 끝~ 오늘 저녁은 곱빼기다.'
      ]
    },
    rivals: {
      cheolsu: {
        intro: '철수야, 너 또 아침 안 먹었지? 힘 못 쓸 텐데~',
        win: '거봐, 밥심이 최고라니까. 밥 먹고 하자~'
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

/* ---------- 공통 기술 프레임데이터 (60fps 기준 프레임) ----------
 * dmg는 캐릭터 power 배율이 곱해짐. kbUp > 0 이면 띄우기.
 * ------------------------------------------------------------ */
const MOVES = {
  lp:       { name: '약공',   dmg: 5,  startup: 4,  active: 3, recovery: 7,  reach: 24, hitY: 30, hbH: 14, kb: 1.6, kbUp: 0,   hitstun: 14, blockstun: 8 },
  hp:       { name: '강공',   dmg: 11, startup: 10, active: 4, recovery: 16, reach: 30, hitY: 29, hbH: 16, kb: 3.4, kbUp: 0,   hitstun: 22, blockstun: 12, wallSplat: true },
  kick:     { name: '킥',     dmg: 8,  startup: 8,  active: 4, recovery: 12, reach: 34, hitY: 22, hbH: 18, kb: 2.6, kbUp: 0,   hitstun: 18, blockstun: 10 },
  launcher: { name: '띄우기', dmg: 9,  startup: 11, active: 4, recovery: 20, reach: 26, hitY: 26, hbH: 30, kb: 1.2, kbUp: 6.6, hitstun: 40, blockstun: 12 },
  airKick:  { name: '점프킥', dmg: 7,  startup: 6,  active: 10, recovery: 8, reach: 26, hitY: 4, hbH: 20, kb: 2.0, kbUp: 0,   hitstun: 18, blockstun: 10 },
  grab:     { name: '잡기',   dmg: 14, startup: 7,  active: 3, recovery: 22, reach: 22 }
};

/* 콤보 데미지 보정: n번째 히트(1부터)의 배율 */
function comboScale(hitIndex) {
  const table = [1, 1, 0.85, 0.72, 0.6, 0.5, 0.42, 0.36, 0.32];
  return hitIndex < table.length ? table[hitIndex] : 0.3;
}

function charById(id) { return CHARACTERS.find(c => c.id === id); }
