l// =================================================================
// Defuse Duo - script.js (Updated with New Stage 3)
// PART 1 OF 3
// =================================================================

// -----------------------------------------------------------------
// SECTION 1: MAIN CONTROL, LOBBY, AND FIREBASE SETUP
// -----------------------------------------------------------------

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, onSnapshot, updateDoc, arrayUnion, arrayRemove, serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDceng5cmITvUqqTuMFSja0y4PSkhFmrmg",
  authDomain: "gemini-co-op-game.firebaseapp.com",
  projectId: "gemini-co-op-game",
  storageBucket: "gemini-co-op-game.firebasestorage.app",
  messagingSenderId: "387010923200",
  appId: "1:387010923200:web:082a20a7b94a59aea9bb25"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- UI Refs ---
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const joinArea = document.getElementById('joinArea');
const joinConfirmBtn = document.getElementById('joinConfirmBtn');
const roomIdInput = document.getElementById('roomIdInput');
const roomInfo = document.getElementById('roomInfo');
const roomIdLabel = document.getElementById('roomIdLabel');
const roomStatus = document.getElementById('roomStatus');
const playersList = document.getElementById('playersList');
const startGameBtn = document.getElementById('startGameBtn');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');
const displayNameInput = document.getElementById('displayName');
const ownerHint = document.getElementById('ownerHint');
const mainLobby = document.getElementById('lobby');
const sectionGame = document.getElementById('game');
const roleTitle = document.getElementById('roleTitle');
const gameArea = document.getElementById('gameArea');
const timerText = document.getElementById('timerText');
const hintText = document.getElementById('hintText');
const backToLobbyBtn = document.getElementById('backToLobbyBtn');

// --- Game State ---
let me = null;
let currentRoomId = null;
let roomUnsubscribe = null;
let localRole = null;
let ownerUid = null;
let countdownInterval = null;
let isGameUIShown = false;
let renderedStage = 0;

// --- Helper ---
function makeRoomId(len = 6){
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i=0;i<len;i++) out += chars.charAt(Math.floor(Math.random()*chars.length));
  return out;
}

// --- Auth Handling ---
createRoomBtn.disabled = true;
createRoomBtn.textContent = 'ตรวจสอบสัญญาณ...';
joinRoomBtn.disabled = true;

signInAnonymously(auth).catch((err)=>{
  console.error('Auth error', err);
  createRoomBtn.textContent = 'การเชื่อมต่อล้มเหลว';
  joinRoomBtn.textContent = 'การเชื่อมต่อล้มเหลว';
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    me = { uid: user.uid };
    createRoomBtn.disabled = false;
    createRoomBtn.textContent = 'สร้างภารกิจใหม่';
    joinRoomBtn.disabled = false;
  } else {
    me = null;
    createRoomBtn.disabled = true;
    joinRoomBtn.disabled = true;
    createRoomBtn.textContent = 'โปรดรีเฟรช';
  }
});

// --- Lobby Event Listeners ---
createRoomBtn.addEventListener('click', async ()=>{
  if (!me) return alert('ยังไม่เชื่อมต่อศูนย์บัญชาการ (รอสักครู่แล้วลองใหม่)');
  me.name = displayNameInput.value || ('CONTROL-' + me.uid.slice(0,4));
  
  try {
    const roomId = makeRoomId(6);
    const roomRef = doc(db, 'rooms', roomId);
    const puzzle = generateFullPuzzle(roomId);
    const initial = {
      createdAt: serverTimestamp(),
      owner: me.uid,
      players: [{ uid: me.uid, name: me.name }],
      status: 'waiting',
      state: {
        puzzle: puzzle,
        currentStage: 1,
        logicGrid_playerPresses: [],
        defused: false,
        timeLeft: 300, // 5 minutes
        strikes: 0
      }
    };
    await setDoc(roomRef, initial);
    enterRoom(roomId);
  } catch (error) {
    console.error("Error creating room:", error);
    alert("เกิดข้อผิดพลาดในการสร้างห้อง! กรุณาตรวจสอบ Console");
  }
});

joinRoomBtn.addEventListener('click', ()=>{
  joinArea.classList.toggle('hidden');
});

joinConfirmBtn.addEventListener('click', async ()=>{
  const rid = (roomIdInput.value || '').trim().toUpperCase();
  if (!rid) return alert('กรุณาใส่รหัสภารกิจ');
  const ref = doc(db, 'rooms', rid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return alert('ไม่พบภารกิจนี้');
  const data = snap.data();
  if (data.players && data.players.length >= 2 && !data.players.find(p => p.uid === me.uid)) {
    return alert('ทีมเต็มแล้ว');
  }
  me.name = displayNameInput.value || ('AGENT-' + me.uid.slice(0,4));
  await updateDoc(ref, { players: arrayUnion({ uid: me.uid, name: me.name }) });
  enterRoom(rid);
});

leaveRoomBtn.addEventListener('click', async ()=>{
  if (!currentRoomId) return;
  const ref = doc(db, 'rooms', currentRoomId);
  await updateDoc(ref, { players: arrayRemove({ uid: me.uid, name: me.name }) }).catch(()=>{});
  cleanupRoom();
  showLobby();
});

startGameBtn.addEventListener('click', async ()=>{
  if (!currentRoomId) return;
  const ref = doc(db, 'rooms', currentRoomId);
  await updateDoc(ref, { status: 'playing' });
});

backToLobbyBtn.addEventListener('click', ()=>{
  if (currentRoomId) {
    leaveRoomBtn.click();
  } else {
    showLobby();
  }
});

// --- Room & Game State Management ---
async function enterRoom(roomId){
  currentRoomId = roomId;
  const ref = doc(db, 'rooms', roomId);

  roomUnsubscribe = onSnapshot(ref, (snap)=>{
    if (!snap.exists()){
      alert('ภารกิจถูกยกเลิก');
      cleanupRoom();
      showLobby();
      return;
    }
    const data = snap.data();
    renderRoomInfo(roomId, data);

    if (data.status === 'playing') {
      if (!isGameUIShown) {
        localRole = (data.owner === me.uid) ? 'Tech Expert' : 'Field Agent';
        ownerUid = data.owner;
        isGameUIShown = true;
      }
      showGame(data);
    } else if (data.status === 'finished') {
      if (isGameUIShown) {
        showFinishedScreen(data);
      }
    } else if (data.status === 'waiting') {
        showLobbyRoomView();
    }
  });

  showLobbyRoomView();
}

function renderRoomInfo(roomId, data){
  roomIdLabel.textContent = roomId;
  
  let statusText = data.status || 'รอเจ้าหน้าที่';
  if (data.state && data.state.strikes > 0 && data.status === 'playing') {
      statusText += ` (ความผิดพลาด: ${data.state.strikes})`;
  }
  roomStatus.textContent = statusText;

  playersList.innerHTML = '';
  (data.players || []).forEach(p => {
    const role = (p.uid === data.owner) ? '(ผู้เชี่ยวชาญ)' : '(เจ้าหน้าที่ภาคสนาม)';
    const li = document.createElement('li');
    li.textContent = `${p.name} ${role}`;
    playersList.appendChild(li);
  });
  if (me && me.uid === data.owner && (data.players || []).length >= 2 && data.status === 'waiting') {
    startGameBtn.classList.remove('hidden');
    ownerHint.textContent = 'คุณคือผู้เชี่ยวชาญ — กด "เริ่มภารกิจ" เมื่อพร้อม';
  } else {
    startGameBtn.classList.add('hidden');
    ownerHint.textContent = '';
  }
}

function showLobbyRoomView(){
  isGameUIShown = false;
  renderedStage = 0;
  clearInterval(countdownInterval);
  countdownInterval = null;
  mainLobby.classList.remove('hidden');
  roomInfo.classList.remove('hidden');
  sectionGame.classList.add('hidden');
  joinArea.classList.add('hidden');
}

function showLobby(){
  if (roomUnsubscribe) { roomUnsubscribe(); roomUnsubscribe = null; }
  currentRoomId = null;
  roomInfo.classList.add('hidden');
  startGameBtn.classList.add('hidden');
  showLobbyRoomView();
}

async function cleanupRoom(){
  if (!currentRoomId) return;
  const ref = doc(db, 'rooms', currentRoomId);
  try {
    if (me && me.name) {
      await updateDoc(ref, { players: arrayRemove({ uid: me.uid, name: me.name }) });
    }
  } catch (e) {}
  if (roomUnsubscribe) { roomUnsubscribe(); roomUnsubscribe = null; }
  currentRoomId = null;
  localRole = null;
  ownerUid = null;
  clearInterval(countdownInterval);
  countdownInterval = null;
  isGameUIShown = false;
  renderedStage = 0;
}

// --- Timer and Finish Screen Logic ---
function startTimer(roomData) {
  if (me.uid === roomData.owner && !countdownInterval) {
    countdownInterval = setInterval(async ()=>{
      const roomRef = doc(db, 'rooms', currentRoomId);
      const snap = await getDoc(roomRef);
      if (!snap.exists()) { clearInterval(countdownInterval); return; }
      const r = snap.data();
      if (!r.state || r.status !== 'playing') {
        clearInterval(countdownInterval);
        countdownInterval = null;
        return;
      }
      const newTime = (r.state.timeLeft || 0) - 1;
      if (newTime < 0) {
        clearInterval(countdownInterval);
        countdownInterval = null;
        await updateDoc(roomRef, { 'state.timeLeft': 0, status: 'finished', 'state.defused': false });
      } else {
        await updateDoc(roomRef, { 'state.timeLeft': newTime });
      }
    }, 1000);
  }
}

function updateTimer(timeLeft) {
  timerText.textContent = 'เวลา: ' + formatTime(timeLeft);
  if (timeLeft < 60 && timeLeft > 0) {
      timerText.classList.add('timer-critical');
  } else {
      timerText.classList.remove('timer-critical');
  }
}

function showFinishedScreen(roomData) {
    clearInterval(countdownInterval);
    countdownInterval = null;
    isGameUIShown = false;
    renderedStage = 0;
    gameArea.innerHTML = '';
    const state = roomData.state;

    const summary = document.createElement('div');
    summary.style.textAlign = 'center';

    const title = document.createElement('h3');
    if (state.defused) {
        title.textContent = '✅ ภารกิจสำเร็จ! ระเบิดถูกกู้แล้ว! ✅';
        title.style.color = 'var(--accent)';
    } else {
        title.textContent = '💥 ภารกิจล้มเหลว! 💥';
        title.style.color = 'var(--danger)';
    }
    summary.appendChild(title);

    const timeReport = document.createElement('p');
    timeReport.innerHTML = `เวลาที่เหลือ: ${formatTime(state.timeLeft)}`;
    summary.appendChild(timeReport);

    if (state.strikes > 0) {
        const strikeReport = document.createElement('p');
        strikeReport.textContent = `จำนวนความผิดพลาด: ${state.strikes}`;
        summary.appendChild(strikeReport);
    }

    gameArea.appendChild(summary);
    document.querySelectorAll('#game button').forEach(b => b.disabled = true);
    backToLobbyBtn.disabled = false;
}

function formatTime(sec){
  sec = Number(sec || 0);
  if (sec < 0) sec = 0;
  const m = Math.floor(sec/60).toString().padStart(2,'0');
  const s = (sec%60).toString().padStart(2,'0');
  return `${m}:${s}`;
}

window.addEventListener('beforeunload', async ()=>{
  if (currentRoomId && me) {
    cleanupRoom();
  }
});
// =================================================================
// Defuse Duo - script.js (Updated with New Stage 3)
// PART 2 OF 3
// =================================================================

// -----------------------------------------------------------------
// SECTION 2: PUZZLE GENERATION LOGIC
// -----------------------------------------------------------------

// --- Helper for puzzle generation ---
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// --- Rule Library for Stage 1 (Client-side logic) ---
const stage1RuleLibrary = {
    'MORE_THAN_ONE_RED': {
        condition: (wires) => wires.filter(w => w.color === 'red').length > 1,
        action: (wires) => wires.filter(w => w.color === 'red').pop(),
    },
    'NO_BLUE': {
        condition: (wires) => !wires.some(w => w.color === 'blue'),
        action: (wires) => wires[1],
    },
    'HAS_DIAMOND': {
        condition: (wires) => wires.some(w => w.symbol === '⟐'),
        action: (wires) => wires.find(w => w.symbol === '↟'),
    },
    'ONLY_ONE_YELLOW': {
        condition: (wires) => wires.filter(w => w.color === 'yellow').length === 1,
        action: (wires) => wires.find(w => w.color === 'yellow'),
    },
    'DEFAULT': {
        condition: () => true,
        action: (wires) => wires[0],
    }
};

// --- STAGE 3: New Puzzle Generation ---
function generateStage3Puzzle(roomId, stage1Data) {
    // --- Part 1: Switch Configuration ---
    const ledColors = ['red', 'green', 'blue', 'off'];
    const switchLabels = shuffleArray(['α', 'β', 'γ', 'δ']);
    const ledColorOnBomb = ledColors[getRandomInt(0, 3)];
    
    const switchRules = [
        { color: 'red', rule: `ถ้าหลอดไฟเป็น <b>สีแดง</b>: เปิดเฉพาะ <b>${switchLabels[0]}</b> และ <b>${switchLabels[2]}</b>`, correct: [true, false, true, false] },
        { color: 'green', rule: `ถ้าหลอดไฟเป็น <b>สีเขียว</b>: เปิดเฉพาะ <b>${switchLabels[1]}</b> และ <b>${switchLabels[3]}</b>`, correct: [false, true, false, true] },
        { color: 'blue', rule: `ถ้าหลอดไฟเป็น <b>สีน้ำเงิน</b>: เปิดสวิตช์ <b>ทั้งหมด</b>`, correct: [true, true, true, true] },
        { color: 'off', rule: `ถ้าหลอดไฟ <b>ไม่ติด</b>: ปิดสวิตช์ <b>ทั้งหมด</b>`, correct: [false, false, false, false] }
    ];
    const correctSwitchSetting = switchRules.find(r => r.color === ledColorOnBomb).correct;

    // --- Part 2: Pressure Levers ---
    const leverLabels = shuffleArray(['Fe', 'Cu', 'Au']);
    const numYellowWires = stage1Data.wiresOnBomb.filter(w => w.color === 'yellow').length;
    const hasNumberInRoomId = /\d/.test(roomId);

    const correctLeverValues = [
        2 + 1, // Fe: Players in team (2) + 1
        hasNumberInRoomId ? 5 : 2, // Cu: Depends on room ID
        numYellowWires + 1 // Au: Depends on stage 1
    ];

    const pressureFormulas = [
        `ระดับของ <b>${leverLabels[0]}</b> = จำนวนผู้เล่นในทีม + 1`,
        `ระดับของ <b>${leverLabels[1]}</b> = ถ้าในรหัสภารกิจมีตัวเลข ให้ตั้งเป็น 5, มิเช่นนั้นตั้งเป็น 2`,
        `ระดับของ <b>${leverLabels[2]}</b> = จำนวนสายไฟสีเหลืองในด่านที่ 1 + 1`
    ];

    // --- Part 3: Confirmation Code ---
    const sumOfLevers = correctLeverValues.reduce((a, b) => a + b, 0);
    const diffOfLevers = Math.max(...correctLeverValues) - Math.min(...correctLeverValues);
    const correctCode = hasNumberInRoomId ? sumOfLevers : diffOfLevers;

    const codeRules = [
        "<b>ถ้ารหัสภารกิจมีตัวเลข:</b> รหัสยืนยันคือ <b>ผลรวม</b> ของระดับคันโยกทั้งสาม",
        "<b>ถ้ารหัสภารกิจไม่มีตัวเลข:</b> รหัสยืนยันคือ <b>ผลต่าง</b> ระหว่างระดับคันโยกที่สูงที่สุดและต่ำที่สุด"
    ];

    return {
        // Data for Field Agent
        ledColor: ledColorOnBomb,
        switchLabels: switchLabels,
        leverLabels: leverLabels,
        // Data for Tech Expert
        manual: {
            switchRules: shuffleArray(switchRules.map(r => r.rule)),
            pressureFormulas: shuffleArray(pressureFormulas),
            codeRules: shuffleArray(codeRules)
        },
        // Correct answers for validation
        solution: {
            switches: correctSwitchSetting,
            levers: correctLeverValues,
            code: correctCode
        }
    };
}


// --- Master Puzzle Generation Function ---
function generateFullPuzzle(roomId) {
  // --- STAGE 1: CONDITIONAL WIRING ---
  const symbolPool = ['⍰','↟','⍼','⟐','⨳','⩻','⪢','⟁'];
  const colorPool = ['red', 'blue', 'yellow'];
  const wiresOnBomb = [];
  for (let i = 0; i < 4; i++) {
    wiresOnBomb.push({
      id: i,
      symbol: symbolPool[Math.floor(Math.random() * symbolPool.length)],
      color: colorPool[Math.floor(Math.random() * colorPool.length)]
    });
  }
  const ruleSet = [
    { id: 'MORE_THAN_ONE_RED', description: "ถ้ามีสายไฟสี <b>แดง</b> มากกว่า 1 เส้น", subDescription: "→ ให้ตัดสายไฟสี <b>แดง</b> เส้นสุดท้าย" },
    { id: 'NO_BLUE', description: "ถ้า <b>ไม่มี</b> สายไฟสี <b>น้ำเงิน</b> เลย", subDescription: "→ ให้ตัดสายไฟเส้นที่ <b>สอง</b>" },
    { id: 'HAS_DIAMOND', description: "ถ้ามีสายไฟสัญลักษณ์ <b>⟐</b>", subDescription: "→ ให้ตัดสายไฟสัญลักษณ์ <b>↟</b> (ถ้ามี)" },
    { id: 'ONLY_ONE_YELLOW', description: "ถ้ามีสายไฟสี <b>เหลือง</b> เพียงเส้นเดียว", subDescription: "→ ให้ตัดสายไฟสี <b>เหลือง</b> เส้นนั้น" }
  ];
  const stage1Rules = shuffleArray(ruleSet).slice(0, 3);
  stage1Rules.push({ id: 'DEFAULT', description: "มิเช่นนั้น (ถ้าไม่มีกฎข้อไหนตรงเลย)", subDescription: "→ ให้ตัดสายไฟเส้น <b>แรก</b>" });
  const stage1Data = { wiresOnBomb, rules: stage1Rules };

  // --- STAGE 2: POWER CALIBRATION ---
  const initialA = (Math.floor(Math.random() * 5) + 3) * 10;
  const initialB = (Math.floor(Math.random() * 5) + 3) * 10;
  const initialC = (Math.floor(Math.random() * 5) + 3) * 10;
  let targetA = initialA, targetB = initialB, targetC = initialC;
  for (let i = 0; i < 5; i++) {
      const pressType = Math.floor(Math.random() * 3);
      if (pressType === 0) { targetA += 10; targetB += 10; }
      else if (pressType === 1) { targetA -= 10; targetC -= 10; }
      else { targetB += 10; targetC -= 10; }
  }
  if (targetA <= targetC) targetA += 20;
  if (targetB % 20 !== 0) targetB += 10;
  if (targetA < 0 || targetB < 0 || targetC < 0) { return generateFullPuzzle(roomId); }
  const targetSum = targetA + targetB + targetC;
  const stage2Data = { initialA, initialB, initialC, targetSum };

  // --- STAGE 3: MANUAL DETONATOR OVERRIDE (NEW) ---
  const stage3Data = generateStage3Puzzle(roomId, stage1Data);

  // --- STAGE 4: LOGIC GRID ---
  const colors = ['red', 'blue', 'green', 'yellow'];
  const flashSequence = Array(5).fill(0).map(() => colors[Math.floor(Math.random() * 4)]);
  const colorMap = {};
  const shuffledColors = shuffleArray([...colors]);
  colors.forEach((color, i) => { colorMap[color] = shuffledColors[i]; });
  const hasNumberInRoomIdStage4 = /\d/.test(roomId);
  const stage4Data = { flashSequence, colorMap, hasNumberInRoomId: hasNumberInRoomIdStage4 };

  return { stage1: stage1Data, stage2: stage2Data, stage3: stage3Data, stage4: stage4Data };
}
// =================================================================
// Defuse Duo - script.js (Updated with New Stage 3)
// PART 3 OF 3
// =================================================================

// -----------------------------------------------------------------
// SECTION 3: PUZZLE RENDERING AND HANDLING
// -----------------------------------------------------------------

// --- Main Game Rendering Logic ---
function showGame(roomData){
  mainLobby.classList.add('hidden');
  sectionGame.classList.remove('hidden');
  roleTitle.textContent = `บทบาท: ${localRole}`;
  
  updateTimer(roomData.state.timeLeft);
  startTimer(roomData);

  if (roomData.state && roomData.state.puzzle) {
    if (renderedStage !== roomData.state.currentStage) {
      renderCurrentStage(roomData);
      renderedStage = roomData.state.currentStage;
    }
  } else {
    gameArea.innerHTML = '<p>กำลังโหลดข้อมูลภารกิจ...</p>';
  }
}

function renderCurrentStage(roomData) {
  gameArea.innerHTML = '';
  const state = roomData.state;
  
  const stageIndicator = document.createElement('div');
  stageIndicator.className = 'stage-indicator';
  for (let i = 1; i <= 4; i++) {
    const dot = document.createElement('div');
    dot.className = 'stage-dot';
    if (i < state.currentStage) dot.classList.add('completed');
    if (i === state.currentStage) dot.classList.add('active');
    stageIndicator.appendChild(dot);
  }
  gameArea.appendChild(stageIndicator);

  if (state.currentStage === 1) renderStage1(roomData);
  else if (state.currentStage === 2) renderStage2(roomData);
  else if (state.currentStage === 3) renderStage3(roomData);
  else if (state.currentStage === 4) renderStage4(roomData);
}

// --- STAGE 1: CONDITIONAL WIRING ---
function renderStage1(roomData) {
  const puzzleState = roomData.state.puzzle.stage1;
  if (localRole === 'Tech Expert') {
    const info = document.createElement('p');
    info.className = 'muted';
    info.innerHTML = '<b>คู่มือด่าน 1:</b> ตรวจสอบกฎตามลำดับ และทำตามกฎข้อแรกที่เป็นจริง';
    const manualList = document.createElement('ol');
    manualList.className = 'manual-list';
    puzzleState.rules.forEach(rule => {
        const li = document.createElement('li');
        li.innerHTML = `${rule.description}<div class="sub-rule">${rule.subDescription}</div>`;
        manualList.appendChild(li);
    });
    gameArea.append(info, manualList);
  } else { // Field Agent
    const info = document.createElement('p');
    info.className = 'muted';
    info.textContent = 'รายงานข้อมูลสายไฟทั้งหมดให้ผู้เชี่ยวชาญทราบ';
    const wireContainer = document.createElement('div');
    wireContainer.className = 'wire-container';
    puzzleState.wiresOnBomb.forEach(wire => {
        const wireEl = document.createElement('div');
        wireEl.className = 'wire';
        wireEl.dataset.wireId = wire.id;
        const symbolSpan = document.createElement('span');
        symbolSpan.textContent = wire.symbol;
        const colorIndicator = document.createElement('div');
        colorIndicator.className = `wire-color-indicator wire-color-${wire.color}`;
        wireEl.append(symbolSpan, colorIndicator);
        wireEl.addEventListener('click', () => handleWireCut(wire.id));
        wireContainer.appendChild(wireEl);
    });
    gameArea.append(info, wireContainer);
  }
}

async function handleWireCut(cutWireId) {
    const roomRef = doc(db, 'rooms', currentRoomId);
    const snap = await getDoc(roomRef);
    const data = snap.data();
    if (data.status !== 'playing' || !data.state.puzzle) return; 
    const wires = data.state.puzzle.stage1.wiresOnBomb;
    const rulesFromDB = data.state.puzzle.stage1.rules;
    if (!Array.isArray(rulesFromDB)) return; 
    let correctWireToCut = null;
    for (const ruleData of rulesFromDB) {
        const ruleLogic = stage1RuleLibrary[ruleData.id];
        if (ruleLogic && ruleLogic.condition(wires)) {
            correctWireToCut = ruleLogic.action(wires);
            break;
        }
    }
    if (!correctWireToCut || cutWireId !== correctWireToCut.id) {
        const newTime = Math.max(0, data.state.timeLeft - 30);
        const newStrikes = (data.state.strikes || 0) + 1;
        if (newStrikes >= 3) {
            await updateDoc(roomRef, { status: 'finished', 'state.defused': false, 'state.strikes': newStrikes, 'state.timeLeft': newTime });
        } else {
            await updateDoc(roomRef, { 'state.strikes': newStrikes, 'state.timeLeft': newTime });
        }
    } else {
        await updateDoc(roomRef, { 'state.currentStage': 2 });
    }
}

// --- STAGE 2: POWER CALIBRATION ---
function renderStage2(roomData) {
  const puzzleState = roomData.state.puzzle.stage2;
  if (localRole === 'Tech Expert') {
    const info = document.createElement('p');
    info.className = 'muted';
    info.innerHTML = '<b>คู่มือด่าน 2: การปรับเทียบพลังงาน</b>';
    const manual = document.createElement('div');
    manual.className = 'manual-list';
    manual.innerHTML = `<p>ค่าพลังงานเริ่มต้น: <b>A: ${puzzleState.initialA}, B: ${puzzleState.initialB}, C: ${puzzleState.initialC}</b></p>
                        <p>เป้าหมาย: ทำให้ <b>ผลรวมของ A+B+C</b> เท่ากับ <b>${puzzleState.targetSum}</b></p>
                        <b>เงื่อนไขพิเศษที่ต้องทำตาม:</b>
                        <ul>
                          <li>ค่าพลังงานของแกน <b>A</b> ต้องมากกว่าแกน <b>C</b></li>
                          <li>ค่าพลังงานของแกน <b>B</b> ต้องเป็นเลขคู่ (ลงท้ายด้วย 0)</li>
                          <li>ห้ามให้ค่าพลังงานของแกนใดแกนหนึ่งติดลบ</li>
                        </ul>`;
    gameArea.append(info, manual);
  } else { // Field Agent
    const info = document.createElement('p');
    info.className = 'muted';
    info.textContent = 'ปรับเทียบแกนพลังงานตามคำสั่งของผู้เชี่ยวชาญ';
    const displayContainer = document.createElement('div');
    displayContainer.className = 'reactor-display-container';
    // ... (rest of stage 2 rendering is unchanged)
    let currentA = puzzleState.initialA, currentB = puzzleState.initialB, currentC = puzzleState.initialC;
    // ...
  }
}

async function handleCalibrationConfirm() {
    const roomRef = doc(db, 'rooms', currentRoomId);
    const currentSnap = await getDoc(roomRef);
    if (currentSnap.data().status !== 'playing') return;
    await updateDoc(roomRef, { 'state.currentStage': 3 });
}

// --- STAGE 3: MANUAL DETONATOR OVERRIDE (NEW) ---
function renderStage3(roomData) {
    const puzzleData = roomData.state.puzzle.stage3;

    if (localRole === 'Tech Expert') {
        const info = document.createElement('p');
        info.className = 'muted';
        info.innerHTML = '<b>คู่มือด่าน 3: การปลดชนวนแบบแมนนวล</b>';
        
        const manualContainer = document.createElement('div');
        manualContainer.className = 'manual-list';
        manualContainer.innerHTML = `
            <p><b>1. ตารางตั้งค่าสวิตช์:</b></p>
            <ul>${puzzleData.manual.switchRules.map(rule => `<li>${rule}</li>`).join('')}</ul>
            <p><b>2. สูตรคำนวณแรงดัน:</b></p>
            <ul>${puzzleData.manual.pressureFormulas.map(rule => `<li>${rule}</li>`).join('')}</ul>
            <p><b>3. ตารางรหัสยืนยัน:</b></p>
            <ul>${puzzleData.manual.codeRules.map(rule => `<li>${rule}</li>`).join('')}</ul>
        `;
        gameArea.append(info, manualContainer);

    } else { // Field Agent
        const info = document.createElement('p');
        info.className = 'muted';
        info.textContent = 'ตั้งค่าแผงควบคุมตามคำสั่งของผู้เชี่ยวชาญ';
        
        const panel = document.createElement('div');
        panel.className = 'detonator-panel';

        // Part 1: Switches
        const switchBox = document.createElement('div');
        switchBox.className = 'detonator-section';
        switchBox.innerHTML = `<label>แผงสวิตช์จ่ายไฟ (สถานะ: <span class="led-light ${puzzleData.ledColor}">${puzzleData.ledColor.toUpperCase()}</span>)</label>`;
        const switchGrid = document.createElement('div');
        switchGrid.className = 'switch-grid';
        puzzleData.switchLabels.forEach((label, index) => {
            const switchEl = document.createElement('div');
            switchEl.className = 'switch-container';
            switchEl.innerHTML = `
                <label class="switch">
                    <input type="checkbox" id="switch-${index}">
                    <span class="slider"></span>
                </label>
                <span>${label}</span>`;
            switchGrid.appendChild(switchEl);
        });
        switchBox.appendChild(switchGrid);

        // Part 2: Levers
        const leverBox = document.createElement('div');
        leverBox.className = 'detonator-section';
        leverBox.innerHTML = `<label>คันโยกปรับแรงดัน</label>`;
        const leverGrid = document.createElement('div');
        leverGrid.className = 'lever-grid';
        puzzleData.leverLabels.forEach((label, index) => {
            const leverEl = document.createElement('div');
            leverEl.className = 'lever-container';
            leverEl.innerHTML = `
                <label for="lever-${index}">${label}</label>
                <input type="range" id="lever-${index}" min="1" max="5" value="1">
                <span id="lever-value-${index}">1</span>`;
            leverGrid.appendChild(leverEl);
            leverEl.querySelector('input').addEventListener('input', (e) => {
                document.getElementById(`lever-value-${index}`).textContent = e.target.value;
            });
        });
        leverBox.appendChild(leverGrid);

        // Part 3: Confirmation
        const confirmBox = document.createElement('div');
        confirmBox.className = 'detonator-section';
        confirmBox.innerHTML = `
            <label for="confirm-code">รหัสยืนยัน (2 หลัก)</label>
            <input type="text" id="confirm-code" maxlength="2" placeholder="00">
            <button id="arm-disarm-btn">ARM/DISARM</button>
        `;
        confirmBox.querySelector('#arm-disarm-btn').addEventListener('click', handleDetonatorConfirm);

        panel.append(switchBox, leverBox, confirmBox);
        gameArea.append(info, panel);
    }
}

async function handleDetonatorConfirm() {
    const roomRef = doc(db, 'rooms', currentRoomId);
    const snap = await getDoc(roomRef);
    const data = snap.data();
    if (data.status !== 'playing') return;

    // Collect player's inputs
    const playerSwitches = [
        document.getElementById('switch-0').checked,
        document.getElementById('switch-1').checked,
        document.getElementById('switch-2').checked,
        document.getElementById('switch-3').checked,
    ];
    const playerLevers = [
        parseInt(document.getElementById('lever-0').value),
        parseInt(document.getElementById('lever-1').value),
        parseInt(document.getElementById('lever-2').value),
    ];
    const playerCode = parseInt(document.getElementById('confirm-code').value);

    // Get correct solution from DB
    const solution = data.state.puzzle.stage3.solution;

    // Check for correctness
    const isSwitchesCorrect = JSON.stringify(playerSwitches) === JSON.stringify(solution.switches);
    const isLeversCorrect = JSON.stringify(playerLevers.sort()) === JSON.stringify(solution.levers.sort());
    const isCodeCorrect = playerCode === solution.code;

    if (isSwitchesCorrect && isLeversCorrect && isCodeCorrect) {
        // Success
        await updateDoc(roomRef, { 'state.currentStage': 4 });
    } else {
        // Failure - Apply penalty and reset puzzle
        const newTime = Math.max(0, data.state.timeLeft - 45);
        const newStrikes = (data.state.strikes || 0) + 1;

        if (newStrikes >= 3 || newTime <= 0) {
            await updateDoc(roomRef, { status: 'finished', 'state.defused': false, 'state.strikes': newStrikes, 'state.timeLeft': newTime });
        } else {
            // Regenerate just stage 3 puzzle
            const newStage3Puzzle = generateStage3Puzzle(currentRoomId, data.state.puzzle.stage1);
            await updateDoc(roomRef, {
                'state.strikes': newStrikes,
                'state.timeLeft': newTime,
                'state.puzzle.stage3': newStage3Puzzle
            });
            renderedStage = 0; // Force re-render
        }
    }
}


// --- STAGE 4: LOGIC GRID ---
function renderStage4(roomData) {
  const puzzleState = roomData.state.puzzle.stage4;
  if (localRole === 'Tech Expert') {
    const info = document.createElement('p');
    info.className = 'muted';
    info.innerHTML = '<b>คู่มือด่าน 4:</b> แปลงสัญญาณที่คู่หูเห็นให้เป็นลำดับการกดที่ถูกต้อง';
    const rule1 = document.createElement('div');
    rule1.innerHTML = '<b>กฎข้อที่ 1: การแมปสี</b>';
    const mapList = document.createElement('ul');
    for (const [seen, pressed] of Object.entries(puzzleState.colorMap)) {
        const li = document.createElement('li');
        li.innerHTML = `ถ้าเห็น <span style="color:${seen}; font-weight:bold;">${seen.toUpperCase()}</span>, ให้กด <span style="color:${pressed}; font-weight:bold;">${pressed.toUpperCase()}</span>`;
        mapList.appendChild(li);
    }
    rule1.appendChild(mapList);
    const rule2 = document.createElement('div');
    rule2.innerHTML = `<b>กฎข้อที่ 2: กฎพิเศษ</b><br>${puzzleState.hasNumberInRoomId ? 'รหัสภารกิจมีตัวเลข: ลำดับการกดทั้งหมดต้องย้อนกลับ (Reverse)' : 'รหัสภารกิจไม่มีตัวเลข: ไม่มีกฎพิเศษ'}`;
    gameArea.append(info, rule1, rule2);
  } else { // Field Agent
    // ... (rest of stage 4 rendering is unchanged)
  }
}

async function handleLogicGridPress(color) {
    const roomRef = doc(db, 'rooms', currentRoomId);
    const snap = await getDoc(roomRef);
    const data = snap.data();
    if (data.status !== 'playing') return;
    const state = data.state;
    const puzzle = state.puzzle.stage4;
    const playerPresses = state.logicGrid_playerPresses || [];
    let correctSequence = puzzle.flashSequence.map(seenColor => puzzle.colorMap[seenColor]);
    if (puzzle.hasNumberInRoomId) {
        correctSequence.reverse();
    }
    const nextCorrectColor = correctSequence[playerPresses.length];
    if (color === nextCorrectColor) {
        const newPresses = [...playerPresses, color];
        if (newPresses.length === correctSequence.length) {
            await updateDoc(roomRef, { status: 'finished', 'state.defused': true });
        } else {
            await updateDoc(roomRef, { 'state.logicGrid_playerPresses': newPresses });
        }
    } else {
        const newTime = Math.max(0, state.timeLeft - 45);
        const newStrikes = (state.strikes || 0) + 1;
        if (newStrikes >= 3 || newTime <= 0) {
             await updateDoc(roomRef, { status: 'finished', 'state.defused': false, 'state.strikes': newStrikes, 'state.timeLeft': newTime });
        } else {
            const newFlashSequence = Array(5).fill(0).map(() => ['red', 'blue', 'green', 'yellow'][Math.floor(Math.random() * 4)]);
            await updateDoc(roomRef, {
                'state.timeLeft': newTime,
                'state.strikes': newStrikes,
                'state.logicGrid_playerPresses': [],
                'state.puzzle.stage4.flashSequence': newFlashSequence
            });
            renderedStage = 0; 
        }
    }
}
