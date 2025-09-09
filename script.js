// =================================================================
// Defuse Duo - script.js (Part 1 of 3) - GRAND OVERHAUL
// SECTION 1: MAIN CONTROL, LOBBY, AND FIREBASE SETUP
// =================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, onSnapshot, updateDoc, arrayUnion, arrayRemove, serverTimestamp, deleteDoc
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
let localStrikes = 0;

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
        strikes: 0,
        logicGrid_playerPresses: [],
        defused: false,
        timeLeft: 300 // 5 minutes
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
  cleanupAndShowLobby();
});

startGameBtn.addEventListener('click', async ()=>{
  if (!currentRoomId) return;
  const ref = doc(db, 'rooms', currentRoomId);
  await updateDoc(ref, { status: 'playing' });
});

backToLobbyBtn.addEventListener('click', ()=>{
    if (currentRoomId) {
        const roomRef = doc(db, 'rooms', currentRoomId);
        getDoc(roomRef).then(snap => {
            if (snap.exists() && snap.data().owner === me.uid) {
                deleteDoc(roomRef); // Owner deletes the room
            } else {
                leaveRoomBtn.click(); // Non-owner just leaves
            }
        });
    }
    cleanupAndShowLobby();
});


// --- Room & Game State Management ---
async function enterRoom(roomId){
  currentRoomId = roomId;
  const ref = doc(db, 'rooms', roomId);

  roomUnsubscribe = onSnapshot(ref, (snap)=>{
    if (!snap.exists()){
      alert('ภารกิจถูกยกเลิกโดยผู้สร้าง');
      cleanupAndShowLobby();
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
        showFinishedScreen(data);
    } else if (data.status === 'waiting') {
        showLobbyRoomView();
    }
    
    // Universal strike check
    if (data.state && data.state.strikes >= 3 && data.status === 'playing') {
        updateDoc(ref, { status: 'finished', 'state.defused': false });
    }
  });

  showLobbyRoomView();
}

function renderRoomInfo(roomId, data){
  roomIdLabel.textContent = roomId;
  roomStatus.textContent = data.status || 'รอเจ้าหน้าที่';
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
    ownerHint.textContent = (data.players.length < 2) ? 'รอเจ้าหน้าที่อีก 1 คน...' : 'รอผู้เชี่ยวชาญเริ่มภารกิจ...';
  }
}

function showLobbyRoomView(){
  document.body.classList.remove('game-active');
  isGameUIShown = false;
  renderedStage = 0;
  clearInterval(countdownInterval);
  countdownInterval = null;
  mainLobby.classList.remove('hidden');
  roomInfo.classList.remove('hidden');
  sectionGame.classList.add('hidden');
  joinArea.classList.add('hidden');
}

function cleanupAndShowLobby(){
  if (roomUnsubscribe) { roomUnsubscribe(); roomUnsubscribe = null; }
  currentRoomId = null;
  localRole = null;
  ownerUid = null;
  clearInterval(countdownInterval);
  countdownInterval = null;
  isGameUIShown = false;
  renderedStage = 0;
  localStrikes = 0;
  
  document.body.classList.remove('game-active');
  mainLobby.classList.remove('hidden');
  sectionGame.classList.add('hidden');
  roomInfo.classList.add('hidden');
  startGameBtn.classList.add('hidden');
}

// --- Timer and Finish Screen Logic ---
function startTimer(roomData) {
  if (me.uid === roomData.owner && !countdownInterval) {
    countdownInterval = setInterval(async ()=>{
      if (!currentRoomId) { clearInterval(countdownInterval); return; }
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
  const m = Math.floor(timeLeft/60).toString().padStart(2,'0');
  const s = (timeLeft%60).toString().padStart(2,'0');
  timerText.innerHTML = `เวลา:<div class="digits">${m}:${s}</div>`;
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
    summary.className = 'finish-screen';

    const title = document.createElement('h3');
    if (state.defused) {
        title.textContent = '✅ ภารกิจสำเร็จ! ✅';
        title.style.color = 'var(--accent)';
    } else {
        title.textContent = '💥 ภารกิจล้มเหลว! 💥';
        title.style.color = 'var(--danger)';
    }
    summary.appendChild(title);

    const report = document.createElement('p');
    report.innerHTML = `เวลาที่เหลือ: ${formatTime(state.timeLeft)}<br>Strikes: ${state.strikes}/3`;
    summary.appendChild(report);

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
  if (currentRoomId && me && me.name) {
    const roomRef = doc(db, 'rooms', currentRoomId);
    await updateDoc(roomRef, { players: arrayRemove({ uid: me.uid, name: me.name }) }).catch(()=>{});
  }
});
// =================================================================
// Defuse Duo - script.js (Part 2 of 3) - GRAND OVERHAUL
// SECTION 2: PUZZLE GENERATION LOGIC
// =================================================================

const ALL_COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'white', 'pink'];
const SYMBOL_POOL = ['⍰','↟','⍼','⟐','⨳','⩻','⪢','⟁'];

const stage1RuleLibrary = {
    'MORE_THAN_X_OF_COLOR': {
        condition: (wires, color, count) => wires.filter(w => w.color === color).length > count,
        action: (wires, color) => wires.filter(w => w.color === color).pop(),
    },
    'EXACTLY_X_OF_COLOR': {
        condition: (wires, color, count) => wires.filter(w => w.color === color).length === count,
        action: (wires, color) => wires.find(w => w.color === color),
    },
    'NO_COLOR': {
        condition: (wires, color) => !wires.some(w => w.color === color),
        action: (wires, wireIndex) => wires[wireIndex],
    },
    'HAS_SYMBOL': {
        condition: (wires, symbol) => wires.some(w => w.symbol === symbol),
        action: (wires, targetSymbol) => wires.find(w => w.symbol === targetSymbol),
    },
    'ALL_DIFFERENT_COLORS': {
        condition: (wires) => new Set(wires.map(w => w.color)).size === wires.length,
        action: (wires) => wires[wires.length - 1],
    },
    'TWO_PAIRS_OF_COLORS': {
        condition: (wires) => {
            const counts = wires.reduce((acc, wire) => { acc[wire.color] = (acc[wire.color] || 0) + 1; return acc; }, {});
            return Object.values(counts).filter(count => count === 2).length === 2;
        },
        action: (wires) => wires[2],
    },
    'ROOM_ID_HAS_NUMBER': {
        condition: (wires, roomId) => /\d/.test(roomId),
        action: (wires, wireIndex) => wires[wireIndex],
    },
    'DEFAULT': {
        condition: () => true,
        action: (wires) => wires[0],
    }
};

function shuffleArray(array) {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
}

function generateFullPuzzle(roomId) {
  // --- STAGE 1: CONDITIONAL WIRING (8-COLOR SYSTEM) ---
  const wiresOnBomb = [];
  for (let i = 0; i < 6; i++) {
    wiresOnBomb.push({
      id: i,
      symbol: SYMBOL_POOL[Math.floor(Math.random() * SYMBOL_POOL.length)],
      color: ALL_COLORS[Math.floor(Math.random() * ALL_COLORS.length)]
    });
  }
  const ruleSet = [
    { id: 'MORE_THAN_X_OF_COLOR', params: ['red', 2], description: "ถ้ามีสายไฟสี <b>แดง</b> มากกว่า 2 เส้น", subDescription: "→ ให้ตัดสายไฟสี <b>แดง</b> เส้นสุดท้าย" },
    { id: 'EXACTLY_X_OF_COLOR', params: ['yellow', 1], description: "ถ้ามีสายไฟสี <b>เหลือง</b> เพียงเส้นเดียว", subDescription: "→ ให้ตัดสายไฟสี <b>เหลือง</b> เส้นนั้น" },
    { id: 'NO_COLOR', params: ['blue', 1], description: "ถ้า <b>ไม่มี</b> สายไฟสี <b>น้ำเงิน</b> เลย", subDescription: "→ ให้ตัดสายไฟเส้นที่ <b>สอง</b>" },
    { id: 'HAS_SYMBOL', params: ['⟐', '↟'], description: "ถ้ามีสายไฟสัญลักษณ์ <b>⟐</b>", subDescription: "→ ให้ตัดสายไฟสัญลักษณ์ <b>↟</b> (ถ้ามี)" },
    { id: 'ALL_DIFFERENT_COLORS', params: [], description: "ถ้าสายไฟทุกเส้น <b>มีสีไม่ซ้ำกันเลย</b>", subDescription: "→ ให้ตัดสายไฟเส้น <b>สุดท้าย</b>" },
    { id: 'TWO_PAIRS_OF_COLORS', params: [], description: "ถ้ามีสายไฟ <b>สีซ้ำกัน 2 คู่</b> พอดี", subDescription: "→ ให้ตัดสายไฟเส้นที่ <b>สาม</b>" },
    { id: 'ROOM_ID_HAS_NUMBER', params: [roomId, 3], description: "<b>ถ้ารหัสภารกิจมีตัวเลข:</b>", subDescription: "→ ให้ตัดสายไฟเส้นที่ <b>สี่</b>" },
    { id: 'NO_COLOR', params: ['white', 0], description: "ถ้า <b>ไม่มี</b> สายไฟสี <b>ขาว</b> เลย", subDescription: "→ ให้ตัดสายไฟเส้นที่ <b>หนึ่ง</b>" },
    { id: 'MORE_THAN_X_OF_COLOR', params: ['green', 1], description: "ถ้ามีสายไฟสี <b>เขียว</b> มากกว่า 1 เส้น", subDescription: "→ ให้ตัดสายไฟสี <b>เขียว</b> เส้นแรก" },
    { id: 'EXACTLY_X_OF_COLOR', params: ['purple', 2], description: "ถ้ามีสายไฟสี <b>ม่วง</b> 2 เส้นพอดี", subDescription: "→ ให้ตัดสายไฟสี <b>ม่วง</b> เส้นที่สอง" },
    { id: 'HAS_SYMBOL', params: ['⍰', '⍼'], description: "ถ้ามีสายไฟสัญลักษณ์ <b>⍰</b>", subDescription: "→ ให้ตัดสายไฟสัญลักษณ์ <b>⍼</b> (ถ้ามี)" },
  ];
  const stage1Rules = shuffleArray(ruleSet).slice(0, 5);
  stage1Rules.push({ id: 'DEFAULT', params: [], description: "มิเช่นนั้น (ถ้าไม่มีกฎข้อไหนตรงเลย)", subDescription: "→ ให้ตัดสายไฟเส้น <b>แรก</b>" });
  const stage1Data = { wiresOnBomb, rules: stage1Rules };

  // --- STAGE 2: POWER CALIBRATION (CORRECTED LOGIC) ---
  let initialA, initialB, initialC, targetSum;
  let isSolvable = false;
  while (!isSolvable) {
    initialA = (Math.floor(Math.random() * 5) + 3) * 10;
    initialB = (Math.floor(Math.random() * 5) + 3) * 10;
    initialC = (Math.floor(Math.random() * 5) + 3) * 10;
    let targetA = initialA, targetB = initialB, targetC = initialC;
    const pressCount = Math.floor(Math.random() * 6) + 5; 
    for (let i = 0; i < pressCount; i++) {
        const pressType = Math.floor(Math.random() * 3);
        if (pressType === 0) { targetA += 10; targetB += 10; }
        else if (pressType === 1) { targetA -= 10; targetC -= 10; }
        else { targetB += 10; targetC -= 10; }
    }
    if (targetA <= targetC) targetA += 20;
    if (targetB % 20 !== 0) targetB += 10;
    if (targetA < 0 || targetB < 0 || targetC < 0) continue;
    targetSum = targetA + targetB + targetC;
    const sumDifference = Math.abs(targetSum - (initialA + initialB + initialC));
    if (sumDifference % 20 === 0) {
        isSolvable = true;
    }
  }
  const stage2Data = { initialA, initialB, initialC, targetSum };

  // --- STAGE 3: MANUAL OVERRIDE (RANDOMIZED RULES) ---
  const switchLabels = shuffleArray(['α', 'β', 'γ', 'δ']);
  const leverLabels = shuffleArray(['Fe', 'Cu', 'Au']);
  const ledColor = ['red', 'green', 'blue', 'off'][Math.floor(Math.random() * 4)];
  
  // Rule variables
  const hasNumberInRoomId = /\d/.test(roomId);
  const strikesAtStart = 0; // This would be dynamic if we allowed carrying strikes over
  const wireCounts = wiresOnBomb.reduce((acc, wire) => { acc[wire.color] = (acc[wire.color] || 0) + 1; return acc; }, {});
  
  // Randomize which rule is used for each component
  const switchRuleType = ['ledColor', 'wireCount', 'roomId'][Math.floor(Math.random() * 3)];
  const leverRuleFeType = ['constant', 'wireColor'][Math.floor(Math.random() * 2)];
  const leverRuleCuType = ['roomId', 'symbolCount'][Math.floor(Math.random() * 2)];
  const leverRuleAuType = ['wireColor', 'lastWireColor'][Math.floor(Math.random() * 2)];
  const confirmCodeRuleType = ['sum', 'difference', 'product', 'concat'][Math.floor(Math.random() * 4)];

  // Calculate the solution based on the chosen rules
  let correctSwitches;
  if (switchRuleType === 'ledColor') {
    correctSwitches = ledColor === 'off' ? ['β', 'δ'] : ['α', 'γ'];
  } else if (switchRuleType === 'wireCount') {
    correctSwitches = (wireCounts['red'] || 0) > 1 ? ['α', 'β'] : ['γ', 'δ'];
  } else { // roomId
    correctSwitches = hasNumberInRoomId ? ['α', 'δ'] : ['β', 'γ'];
  }

  const levelFe = leverRuleFeType === 'constant' ? 3 : (wireCounts['blue'] || 0) + 1;
  const levelCu = leverRuleCuType === 'roomId' ? (hasNumberInRoomId ? 5 : 2) : new Set(wiresOnBomb.map(w => w.symbol)).size;
  const levelAu = leverRuleAuType === 'wireColor' ? (wireCounts['yellow'] || 0) + 1 : ALL_COLORS.indexOf(wiresOnBomb[5].color) + 1;
  
  let confirmCode;
  const leverValues = [levelFe, levelCu, levelAu];
  if (confirmCodeRuleType === 'sum') {
    confirmCode = leverValues.reduce((a, b) => a + b, 0);
  } else if (confirmCodeRuleType === 'difference') {
    confirmCode = Math.max(...leverValues) - Math.min(...leverValues);
  } else if (confirmCodeRuleType === 'product') {
    confirmCode = levelFe * levelAu;
  } else { // concat
    confirmCode = parseInt(`${levelFe}${levelCu}${levelAu}`.slice(-2));
  }
  confirmCode = confirmCode % 100; // Ensure it's 2 digits

  const stage3Solution = {
      correctSwitches,
      correctLeverValues: { Fe: levelFe, Cu: levelCu, Au: levelAu },
      confirmCode
  };

  const stage3Data = {
    display: { switchLabels, leverLabels, ledColor },
    rules: { switchRuleType, leverRuleFeType, leverRuleCuType, leverRuleAuType, confirmCodeRuleType },
    solution: stage3Solution
  };

  // --- STAGE 4: LOGIC GRID (8-COLOR SYSTEM) ---
  const flashSequence = Array(5).fill(0).map(() => ALL_COLORS[Math.floor(Math.random() * ALL_COLORS.length)]);
  const colorMap = {};
  const shuffledColors = shuffleArray(ALL_COLORS);
  ALL_COLORS.forEach((color, i) => { colorMap[color] = shuffledColors[i]; });
  const hasNumberInRoomIdStage4 = /\d/.test(roomId);
  const stage4Data = { flashSequence, colorMap, hasNumberInRoomId: hasNumberInRoomIdStage4 };

  return { stage1: stage1Data, stage2: stage2Data, stage3: stage3Data, stage4: stage4Data };
}
// =================================================================
// Defuse Duo - script.js (Part 3 of 3) - GRAND OVERHAUL
// SECTION 3: PUZZLE RENDERING AND HANDLING
// =================================================================

function showGame(roomData){
  document.body.classList.add('game-active');
  mainLobby.classList.add('hidden');
  sectionGame.classList.remove('hidden');
  roleTitle.textContent = `บทบาท: ${localRole}`;
  
  updateTimer(roomData.state.timeLeft);
  startTimer(roomData);

  if (roomData.state && roomData.state.puzzle) {
    if (renderedStage !== roomData.state.currentStage || localStrikes !== roomData.state.strikes) {
      localStrikes = roomData.state.strikes;
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
  
  const topBar = document.createElement('div');
  topBar.className = 'game-top-bar';
  
  const stageIndicator = document.createElement('div');
  stageIndicator.className = 'stage-indicator';
  for (let i = 1; i <= 4; i++) {
    const dot = document.createElement('div');
    dot.className = 'stage-dot';
    if (i < state.currentStage) dot.classList.add('completed');
    if (i === state.currentStage) dot.classList.add('active');
    stageIndicator.appendChild(dot);
  }
  
  const strikeIndicator = document.createElement('div');
  strikeIndicator.className = 'strike-indicator';
  strikeIndicator.textContent = `Strikes: ${state.strikes}/3`;

  topBar.append(stageIndicator, strikeIndicator);
  gameArea.appendChild(topBar);

  if (state.currentStage === 1) renderStage1(roomData);
  else if (state.currentStage === 2) renderStage2(roomData);
  else if (state.currentStage === 3) renderStage3(roomData);
  else if (state.currentStage === 4) renderStage4(roomData);
}

async function applyStrike(penalty = 0) {
    if (!currentRoomId) return;
    const roomRef = doc(db, 'rooms', currentRoomId);
    const snap = await getDoc(roomRef);
    if (!snap.exists() || snap.data().status !== 'playing') return;

    const state = snap.data().state;
    const newStrikes = (state.strikes || 0) + 1;
    const newTime = Math.max(0, state.timeLeft - penalty);

    if (newStrikes >= 3) {
        await updateDoc(roomRef, { 'state.strikes': newStrikes, 'state.timeLeft': newTime, status: 'finished', 'state.defused': false });
    } else {
        await updateDoc(roomRef, { 'state.strikes': newStrikes, 'state.timeLeft': newTime });
    }
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

    document.querySelectorAll('.wire').forEach(el => {
        el.style.pointerEvents = 'none';
        el.style.cursor = 'default';
    });
    
    const clickedWireElement = document.querySelector(`.wire[data-wire-id="${cutWireId}"]`);
    if (clickedWireElement) {
        clickedWireElement.classList.add('cut');
    }

    const wires = data.state.puzzle.stage1.wiresOnBomb;
    const rulesFromDB = data.state.puzzle.stage1.rules;
    
    let correctWireToCut = null;

    for (const ruleData of rulesFromDB) {
        const ruleLogic = stage1RuleLibrary[ruleData.id];
        if (ruleLogic && ruleLogic.condition(wires, ...ruleData.params)) {
            const resultWire = ruleLogic.action(wires, ...ruleData.params);
            if (resultWire) {
                correctWireToCut = resultWire;
                break;
            }
        }
    }
    
    setTimeout(async () => {
        if (correctWireToCut && cutWireId === correctWireToCut.id) {
            await updateDoc(roomRef, { 'state.currentStage': 2 });
        } else {
            await applyStrike(15);
        }
    }, 1200);
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
                        </ul>
                        <p style="color: var(--danger-text);"><b>คำเตือน:</b> หากเจ้าหน้าที่ภาคสนามกดปุ่มรีเซ็ตฉุกเฉิน เวลาจะลดลง 20 วินาที</p>`;
    gameArea.append(info, manual);
  } else { // Field Agent
    const info = document.createElement('p');
    info.className = 'muted';
    info.textContent = 'ปรับเทียบแกนพลังงานตามคำสั่งของผู้เชี่ยวชาญ';
    const displayContainer = document.createElement('div');
    displayContainer.className = 'reactor-display-container';
    const displayA = document.createElement('div');
    displayA.className = 'reactor-display';
    displayA.innerHTML = `<span>A</span><strong id="valA">${puzzleState.initialA}</strong>`;
    const displayB = document.createElement('div');
    displayB.className = 'reactor-display';
    displayB.innerHTML = `<span>B</span><strong id="valB">${puzzleState.initialB}</strong>`;
    const displayC = document.createElement('div');
    displayC.className = 'reactor-display';
    displayC.innerHTML = `<span>C</span><strong id="valC">${puzzleState.initialC}</strong>`;
    displayContainer.append(displayA, displayB, displayC);
    const controlContainer = document.createElement('div');
    controlContainer.className = 'reactor-controls';
    const btnPlusA = document.createElement('button');
    btnPlusA.textContent = '+A';
    btnPlusA.title = '+10 to A, +10 to B';
    const btnMinusA = document.createElement('button');
    btnMinusA.textContent = '-A';
    btnMinusA.title = '-10 to A, -10 to C';
    const btnPlusB = document.createElement('button');
    btnPlusB.textContent = '+B';
    btnPlusB.title = '+10 to B, -10 to C';
    const resetBtn = document.createElement('button');
    resetBtn.id = 'resetCalibrationBtn';
    resetBtn.className = 'btn-danger';
    resetBtn.textContent = 'RESET';
    resetBtn.title = 'รีเซ็ตค่าพลังงาน (เวลา -20 วินาที!)';
    const confirmBtn = document.createElement('button');
    confirmBtn.id = 'confirmCalibrationBtn';
    confirmBtn.textContent = 'SET';
    confirmBtn.disabled = true;
    controlContainer.append(btnPlusA, btnMinusA, btnPlusB, resetBtn, confirmBtn);
    gameArea.append(info, displayContainer, controlContainer);
    let currentA = puzzleState.initialA, currentB = puzzleState.initialB, currentC = puzzleState.initialC;
    const updateDisplays = () => {
      document.getElementById('valA').textContent = currentA;
      document.getElementById('valB').textContent = currentB;
      document.getElementById('valC').textContent = currentC;
      const isSumCorrect = (currentA + currentB + currentC) === puzzleState.targetSum;
      const isACorrect = currentA > currentC;
      const isBCorrect = currentB % 20 === 0;
      const isNotNegative = currentA >= 0 && currentB >= 0 && currentC >= 0;
      confirmBtn.disabled = !(isSumCorrect && isACorrect && isBCorrect && isNotNegative);
    };
    btnPlusA.onclick = () => { currentA += 10; currentB += 10; updateDisplays(); };
    btnMinusA.onclick = () => { currentA -= 10; currentC -= 10; updateDisplays(); };
    btnPlusB.onclick = () => { currentB += 10; currentC -= 10; updateDisplays(); };
    confirmBtn.onclick = () => handleCalibrationConfirm();
    resetBtn.onclick = async () => {
      resetBtn.disabled = true;
      confirmBtn.disabled = true;
      const roomRef = doc(db, 'rooms', currentRoomId);
      const snap = await getDoc(roomRef);
      if (snap.exists() && snap.data().status === 'playing') {
        const currentTime = snap.data().state.timeLeft;
        const newTime = Math.max(0, currentTime - 20);
        await updateDoc(roomRef, { 'state.timeLeft': newTime });
      }
      currentA = puzzleState.initialA;
      currentB = puzzleState.initialB;
      currentC = puzzleState.initialC;
      updateDisplays();
      resetBtn.disabled = false;
    };
    updateDisplays();
  }
}

async function handleCalibrationConfirm() {
    const roomRef = doc(db, 'rooms', currentRoomId);
    const currentSnap = await getDoc(roomRef);
    if (currentSnap.data().status !== 'playing') return;
    await updateDoc(roomRef, { 'state.currentStage': 3 });
}
// --- STAGE 3: MANUAL OVERRIDE ---
function renderStage3(roomData) {
    const puzzle = roomData.state.puzzle;
    const stage3 = puzzle.stage3;
    const wireCounts = puzzle.stage1.wiresOnBomb.reduce((acc, wire) => { acc[wire.color] = (acc[wire.color] || 0) + 1; return acc; }, {});

    if (localRole === 'Tech Expert') {
        const info = document.createElement('p');
        info.className = 'muted';
        info.innerHTML = '<b>คู่มือด่าน 3: การปลดชนวน</b><br>ใช้ข้อมูลนี้เพื่อหาค่าที่ถูกต้องสำหรับแผงควบคุม';
        const manualList = document.createElement('ul');
        manualList.className = 'manual-list';

        // Switch Rule
        const switchLi = document.createElement('li');
        if (stage3.rules.switchRuleType === 'ledColor') {
            switchLi.innerHTML = `ถ้าหลอดไฟเป็นสี <b>${stage3.display.ledColor.toUpperCase()}</b>: เปิดเฉพาะสวิตช์ <b>${stage3.solution.correctSwitches.join(' และ ')}</b>`;
        } else if (stage3.rules.switchRuleType === 'wireCount') {
            switchLi.innerHTML = `ถ้ามีสายไฟสี <b>แดง</b> มากกว่า 1 เส้น: เปิดเฉพาะสวิตช์ <b>${stage3.solution.correctSwitches.join(' และ ')}</b>`;
        } else { // roomId
            switchLi.innerHTML = `ถ้ารหัสภารกิจมีตัวเลข: เปิดเฉพาะสวิตช์ <b>${stage3.solution.correctSwitches.join(' และ ')}</b>`;
        }
        manualList.appendChild(switchLi);

        // Lever Rules
        const leverLiFe = document.createElement('li');
        if (stage3.rules.leverRuleFeType === 'constant') {
            leverLiFe.innerHTML = `ระดับของ <b>${stage3.display.leverLabels[0]}</b> = 3`;
        } else {
            leverLiFe.innerHTML = `ระดับของ <b>${stage3.display.leverLabels[0]}</b> = จำนวนสายไฟสี <b>น้ำเงิน</b> ในด่าน 1 + 1`;
        }
        manualList.appendChild(leverLiFe);

        const leverLiCu = document.createElement('li');
        if (stage3.rules.leverRuleCuType === 'roomId') {
            leverLiCu.innerHTML = `ระดับของ <b>${stage3.display.leverLabels[1]}</b> = ถ้ารหัสภารกิจมีตัวเลข ให้เป็น 5, มิเช่นนั้นเป็น 2`;
        } else {
            leverLiCu.innerHTML = `ระดับของ <b>${stage3.display.leverLabels[1]}</b> = จำนวนสัญลักษณ์ที่ไม่ซ้ำกันในด่าน 1`;
        }
        manualList.appendChild(leverLiCu);

        const leverLiAu = document.createElement('li');
        if (stage3.rules.leverRuleAuType === 'wireColor') {
            leverLiAu.innerHTML = `ระดับของ <b>${stage3.display.leverLabels[2]}</b> = จำนวนสายไฟสี <b>เหลือง</b> ในด่าน 1 + 1`;
        } else {
            leverLiAu.innerHTML = `ระดับของ <b>${stage3.display.leverLabels[2]}</b> = ลำดับของสีของสายไฟเส้นสุดท้ายในด่าน 1 (นับจาก 1-8)`;
        }
        manualList.appendChild(leverLiAu);

        // Confirm Code Rule
        const confirmLi = document.createElement('li');
        if (stage3.rules.confirmCodeRuleType === 'sum') {
            confirmLi.innerHTML = `<b>รหัสยืนยัน</b> คือ <b>ผลรวม</b> ของระดับคันโยกทั้งสาม (เอาแค่ 2 ตัวท้าย)`;
        } else if (stage3.rules.confirmCodeRuleType === 'difference') {
            confirmLi.innerHTML = `<b>รหัสยืนยัน</b> คือ <b>ผลต่าง</b> ระหว่างค่าคันโยกที่มากที่สุดและน้อยที่สุด`;
        } else if (stage3.rules.confirmCodeRuleType === 'product') {
            confirmLi.innerHTML = `<b>รหัสยืนยัน</b> คือ <b>ผลคูณ</b> ของคันโยก <b>${stage3.display.leverLabels[0]}</b> และ <b>${stage3.display.leverLabels[2]}</b> (เอาแค่ 2 ตัวท้าย)`;
        } else { // concat
            confirmLi.innerHTML = `<b>รหัสยืนยัน</b> คือ <b>เลข 2 ตัวท้าย</b> ของค่าคันโยกทั้งหมดมาต่อกัน`;
        }
        manualList.appendChild(confirmLi);

        gameArea.append(info, manualList);

    } else { // Field Agent
        const panel = document.createElement('div');
        panel.className = 'detonator-panel';
        panel.innerHTML = `
            <p class="muted">ตั้งค่าแผงควบคุมตามคำสั่งของผู้เชี่ยวชาญ</p>
            <div class="detonator-section">
                <label>แผงสวิตช์จ่ายไฟ (สถานะ: <span class="led-light ${stage3.display.ledColor}">${stage3.display.ledColor.toUpperCase()}</span>)</label>
                <div class="switch-grid">
                    ${stage3.display.switchLabels.map(label => `
                        <div class="switch-container">
                            <label class="switch">
                                <input type="checkbox" data-switch-id="${label}">
                                <span class="slider"></span>
                            </label>
                            <span>${label}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            <div class="detonator-section">
                <label>คันโยกปรับแรงดัน</label>
                <div class="lever-grid">
                    ${stage3.display.leverLabels.map(label => `
                        <div class="lever-container">
                            <label>${label}</label>
                            <input type="range" min="1" max="8" value="1" data-lever-id="${label}">
                            <span id="lever-val-${label}">1</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            <div class="detonator-section">
                <label>รหัสยืนยัน (2 หลัก)</label>
                <input id="confirm-code" type="text" maxlength="2" placeholder="00">
            </div>
            <button id="arm-disarm-btn">ARM & DISARM</button>
        `;
        gameArea.appendChild(panel);

        // Event Listeners
        panel.querySelectorAll('input[type="range"]').forEach(input => {
            input.addEventListener('input', (e) => {
                document.getElementById(`lever-val-${e.target.dataset.leverId}`).textContent = e.target.value;
            });
        });

        document.getElementById('arm-disarm-btn').addEventListener('click', async () => {
            const userSwitches = Array.from(panel.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.dataset.switchId);
            const userLevers = {
                'Fe': parseInt(panel.querySelector(`input[data-lever-id="Fe"]`).value),
                'Cu': parseInt(panel.querySelector(`input[data-lever-id="Cu"]`).value),
                'Au': parseInt(panel.querySelector(`input[data-lever-id="Au"]`).value),
            };
            const userCode = parseInt(document.getElementById('confirm-code').value || -1);

            const solution = stage3.solution;
            const isSwitchCorrect = userSwitches.length === solution.correctSwitches.length && userSwitches.every(s => solution.correctSwitches.includes(s));
            const isLeverCorrect = userLevers.Fe === solution.correctLeverValues.Fe && userLevers.Cu === solution.correctLeverValues.Cu && userLevers.Au === solution.correctLeverValues.Au;
            const isCodeCorrect = userCode === solution.confirmCode;

            if (isSwitchCorrect && isLeverCorrect && isCodeCorrect) {
                await updateDoc(doc(db, 'rooms', currentRoomId), { 'state.currentStage': 4 });
            } else {
                await applyStrike(30);
            }
        });
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
    mapList.className = 'manual-list';
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
    const info = document.createElement('p');
    info.className = 'muted';
    info.textContent = 'จดจำลำดับการกระพริบ แล้วกดตามที่ผู้เชี่ยวชาญสั่ง!';
    const gridContainer = document.createElement('div');
    gridContainer.className = 'logic-grid-container';
    const buttons = {};
    ALL_COLORS.forEach(color => {
        const btn = document.createElement('button');
        btn.className = `logic-btn ${color}`;
        btn.dataset.color = color;
        btn.onclick = () => handleLogicGridPress(color);
        gridContainer.appendChild(btn);
        buttons[color] = btn;
    });
    gameArea.append(info, gridContainer);
    
    // Disable buttons until flash sequence is over
    gridContainer.style.pointerEvents = 'none';
    
    setTimeout(() => {
        let i = 0;
        const interval = setInterval(() => {
            if (i >= puzzleState.flashSequence.length) {
                clearInterval(interval);
                gridContainer.style.pointerEvents = 'auto'; // Enable buttons
                return;
            }
            const colorToFlash = puzzleState.flashSequence[i];
            if (buttons[colorToFlash]) {
                buttons[colorToFlash].classList.add('flash');
                setTimeout(() => {
                    if (buttons[colorToFlash]) {
                        buttons[colorToFlash].classList.remove('flash');
                    }
                }, 400);
            }
            i++;
        }, 700);
    }, 1500);
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
        await applyStrike(45);
        // Reset this stage by clearing presses
        await updateDoc(roomRef, { 'state.logicGrid_playerPresses': [] });
    }
}
