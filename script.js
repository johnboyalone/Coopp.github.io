// =================================================================
// Defuse Duo - script.js (HIGH REPLAYABILITY UPDATE)
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

    const report = document.createElement('p');
    report.innerHTML = `เวลาที่เหลือ: ${formatTime(state.timeLeft)}`;
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
  if (currentRoomId && me) {
    cleanupRoom();
  }
});
// =================================================================
// Defuse Duo - script.js (HIGH REPLAYABILITY UPDATE)
// PART 2 OF 3
// =================================================================

// -----------------------------------------------------------------
// SECTION 2: DYNAMIC PUZZLE GENERATION LOGIC
// -----------------------------------------------------------------

// --- Helper for puzzle generation ---
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function getRandomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// --- Master Puzzle Generation Function ---
function generateFullPuzzle(roomId) {
  // --- STAGE 1: CONDITIONAL WIRING (DYNAMIC RULES) ---
  const symbolPool = ['⍰','↟','⍼','⟐','⨳','⩻','⪢','⟁'];
  const colorPool = ['red', 'blue', 'yellow', 'green']; // Added green for more variety
  const wiresOnBomb = [];
  for (let i = 0; i < 4; i++) {
    wiresOnBomb.push({
      id: i,
      symbol: getRandomElement(symbolPool),
      color: getRandomElement(colorPool)
    });
  }

  const stage1RuleLibrary = [
    { id: 'S1_R1', condition: (w) => w.filter(c => c.color === 'red').length > 1, action: (w) => w.filter(c => c.color === 'red').pop(), description: "ถ้ามีสายไฟสี <b>แดง</b> มากกว่า 1 เส้น", subDescription: "→ ให้ตัดสายไฟสี <b>แดง</b> เส้นสุดท้าย" },
    { id: 'S1_R2', condition: (w) => !w.some(c => c.color === 'blue'), action: (w) => w[1], description: "ถ้า <b>ไม่มี</b> สายไฟสี <b>น้ำเงิน</b> เลย", subDescription: "→ ให้ตัดสายไฟเส้นที่ <b>สอง</b>" },
    { id: 'S1_R3', condition: (w) => w.filter(c => c.color === 'yellow').length === 1, action: (w) => w.find(c => c.color === 'yellow'), description: "ถ้ามีสายไฟสี <b>เหลือง</b> เพียงเส้นเดียว", subDescription: "→ ให้ตัดสายไฟสี <b>เหลือง</b> เส้นนั้น" },
    { id: 'S1_R4', condition: (w) => w.some(c => c.symbol === '⟐'), action: (w) => w.find(c => c.symbol === '↟'), description: "ถ้ามีสายไฟสัญลักษณ์ <b>⟐</b>", subDescription: "→ ให้ตัดสายไฟสัญลักษณ์ <b>↟</b> (ถ้ามี)" },
    { id: 'S1_R5', condition: (w) => w[3].color === 'green', action: (w) => w[0], description: "ถ้าสายไฟเส้น <b>สุดท้าย</b> เป็นสี <b>เขียว</b>", subDescription: "→ ให้ตัดสายไฟเส้น <b>แรก</b>" },
    { id: 'S1_R6', condition: (w) => w.filter(c => c.color === 'green').length >= 2, action: (w) => w[2], description: "ถ้ามีสายไฟสี <b>เขียว</b> อย่างน้อย 2 เส้น", subDescription: "→ ให้ตัดสายไฟเส้นที่ <b>สาม</b>" },
    { id: 'S1_R7', condition: (w) => !w.some(c => c.symbol === '⍰'), action: (w) => w.find(c => c.color === 'blue'), description: "ถ้า <b>ไม่มี</b> สัญลักษณ์ <b>⍰</b> เลย", subDescription: "→ ให้ตัดสายไฟสี <b>น้ำเงิน</b> เส้นแรก (ถ้ามี)" },
    { id: 'S1_R8', condition: (w) => new Set(w.map(c => c.color)).size === 1, action: (w) => w[3], description: "ถ้าสายไฟ <b>ทุกเส้น</b> เป็นสีเดียวกัน", subDescription: "→ ให้ตัดสายไฟเส้น <b>สุดท้าย</b>" },
  ];
  
  const stage1Rules = shuffleArray([...stage1RuleLibrary]).slice(0, 3);
  stage1Rules.push({ id: 'S1_DEFAULT', condition: () => true, action: (w) => w[0], description: "มิเช่นนั้น (ถ้าไม่มีกฎข้อไหนตรงเลย)", subDescription: "→ ให้ตัดสายไฟเส้น <b>แรก</b>" });
  const stage1Data = { wiresOnBomb, rules: stage1Rules };

  // --- STAGE 2: POWER CALIBRATION (DYNAMIC CONDITIONS) ---
  const initialA = (Math.floor(Math.random() * 5) + 3) * 10;
  const initialB = (Math.floor(Math.random() * 5) + 3) * 10;
  const initialC = (Math.floor(Math.random() * 5) + 3) * 10;
  
  const stage2ConditionLibrary = [
      { id: 'S2_C1', description: "<li>ค่าพลังงานของแกน <b>A</b> ต้องมากกว่าแกน <b>C</b></li><li>ค่าพลังงานของแกน <b>B</b> ต้องเป็นเลขคู่ (ลงท้ายด้วย 0)</li>", check: (a,b,c) => a > c && b % 20 === 0 },
      { id: 'S2_C2', description: "<li>ค่าพลังงานของแกน <b>C</b> ต้องมากกว่าแกน <b>B</b></li><li>ค่าพลังงานของแกน <b>A</b> ต้องลงท้ายด้วย 50</li>", check: (a,b,c) => c > b && a % 50 === 0 },
      { id: 'S2_C3', description: "<li>ค่าพลังงานต้องเรียงจากน้อยไปมาก (<b>A < B < C</b>)</li>", check: (a,b,c) => a < b && b < c },
      { id: 'S2_C4', description: "<li>ผลรวมของ <b>A และ C</b> ต้องเท่ากับ <b>B</b> พอดี</li>", check: (a,b,c) => (a + c) === b },
      { id: 'S2_C5', description: "<li>แกนใดแกนหนึ่งต้องมีค่าเป็น <b>100</b> พอดี</li><li>แกน <b>A</b> ต้องมีค่าน้อยที่สุด</li>", check: (a,b,c) => (a === 100 || b === 100 || c === 100) && a < b && a < c },
  ];
  const selectedCondition = getRandomElement(stage2ConditionLibrary);
  let targetA = initialA, targetB = initialB, targetC = initialC;
  let attempts = 0;
  while(attempts < 50) {
      targetA = initialA; targetB = initialB; targetC = initialC;
      for (let i = 0; i < 5; i++) {
          const pressType = Math.floor(Math.random() * 3);
          if (pressType === 0) { targetA += 10; targetB += 10; }
          else if (pressType === 1) { targetA -= 10; targetC -= 10; }
          else { targetB += 10; targetC -= 10; }
      }
      if (targetA >= 0 && targetB >= 0 && targetC >= 0 && selectedCondition.check(targetA, targetB, targetC)) {
          break; // Found a valid solution
      }
      attempts++;
  }
  if (attempts >= 50) { return generateFullPuzzle(roomId); } // Failsafe
  const targetSum = targetA + targetB + targetC;
  const stage2Data = { initialA, initialB, initialC, targetSum, condition: selectedCondition };

  // --- STAGE 3: IDENTITY VERIFICATION (DYNAMIC CLUES) ---
  const iconPool = ['👤', '🕵️', '👩‍🔬', '👨‍✈️', '👩‍🚀', '👨‍💻', '💂', '🧑‍🎨'];
  const codenamePool = ['Viper', 'Ghost', 'Raven', 'Shadow', 'Echo', 'Wraith', 'Nomad', 'Spectre'];
  const statusPool = ['Active', 'Unknown', 'Retired', 'MIA'];
  const affiliationPool = ['Syndicate', 'Phantoms', 'Omega', 'Protocol'];
  const allSuspects = [];
  const shuffledIcons = shuffleArray([...iconPool]);
  const shuffledCodenames = shuffleArray([...codenamePool]);
  for (let i = 0; i < 4; i++) {
      allSuspects.push({
          id: i,
          icon: shuffledIcons[i],
          codename: shuffledCodenames[i],
          status: getRandomElement(statusPool),
          affiliation: getRandomElement(affiliationPool)
      });
  }
  const correctSuspect = getRandomElement(allSuspects);
  const wrongSuspects = allSuspects.filter(s => s.id !== correctSuspect.id);
  const clueTemplates = [
      { type: 'positive', gen: (c, w) => `เป้าหมายมีสถานะเป็น "${c.status}".` },
      { type: 'negative', gen: (c, w) => `เป้าหมายไม่ได้สังกัดกลุ่ม "${w[0].affiliation}".` },
      { type: 'conditional', gen: (c, w) => `ถ้าเป้าหมายใช้ไอคอน ${c.icon}, เขาจะชื่อรหัส "${c.codename}".` },
      { type: 'disjunctive', gen: (c, w) => `เป้าหมายสังกัดกลุ่ม "${c.affiliation}" หรือไม่ก็กลุ่ม "${w[1].affiliation}".` },
      { type: 'comparative', gen: (c, w) => `ผู้ต้องสงสัยที่ชื่อรหัส "${w[0].codename}" และเป้าหมายของเรา มีสถานะเดียวกัน.` },
      { type: 'counting', gen: (c, w) => `มีผู้ต้องสงสัยเพียง ${allSuspects.filter(s => s.status === w[2].status).length} คนที่มีสถานะเป็น "${w[2].status}".` },
  ];
  const stage3Rules = shuffleArray(clueTemplates).slice(0, 5).map(template => ({ description: template.gen(correctSuspect, wrongSuspects) }));
  const stage3Data = {
      suspects: shuffleArray(allSuspects),
      rules: stage3Rules,
      correctSuspectId: correctSuspect.id
  };

  // --- STAGE 4: LOGIC GRID (DYNAMIC MODIFIERS) ---
  const colors = ['red', 'blue', 'green', 'yellow'];
  const flashSequence = Array(5).fill(0).map(() => getRandomElement(colors));
  const colorMap = {};
  const shuffledColors = shuffleArray([...colors]);
  colors.forEach((color, i) => { colorMap[color] = shuffledColors[i]; });
  
  const stage4ModifierLibrary = [
      { id: 'S4_M1', description: "กฎพิเศษ: ลำดับการกดทั้งหมดต้องย้อนกลับ (Reverse)", apply: (seq) => seq.reverse() },
      { id: 'S4_M2', description: "กฎพิเศษ: ให้สลับการกดลำดับที่ 2 กับลำดับที่ 4", apply: (seq) => { const temp = seq[1]; seq[1] = seq[3]; seq[3] = temp; return seq; } },
      { id: 'S4_M3', description: "กฎพิเศษ: ให้กดสีสุดท้ายซ้ำ 2 ครั้ง (ลำดับยาวขึ้น)", apply: (seq) => [...seq, seq[seq.length - 1]] },
      { id: 'S4_M4', description: "กฎพิเศษ: ให้ข้ามการกดลำดับที่ 3 ไปเลย (ลำดับสั้นลง)", apply: (seq) => seq.filter((_, i) => i !== 2) },
      { id: 'S4_M5', description: "กฎพิเศษ: ไม่มีกฎพิเศษ", apply: (seq) => seq },
  ];
  const selectedModifier = getRandomElement(stage4ModifierLibrary);
  const stage4Data = { flashSequence, colorMap, modifier: selectedModifier };

  return { stage1: stage1Data, stage2: stage2Data, stage3: stage3Data, stage4: stage4Data };
}
// =================================================================
// Defuse Duo - script.js (HIGH REPLAYABILITY UPDATE)
// PART 2 OF 3 - FINAL CORRECTION
// =================================================================

// -----------------------------------------------------------------
// SECTION 2: DYNAMIC PUZZLE GENERATION LOGIC
// -----------------------------------------------------------------

// --- Helper for puzzle generation ---
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function getRandomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// --- Master Puzzle Generation Function ---
function generateFullPuzzle(roomId) {
  // --- STAGE 1: CONDITIONAL WIRING (DYNAMIC RULES) ---
  const symbolPool = ['⍰','↟','⍼','⟐','⨳','⩻','⪢','⟁'];
  const colorPool = ['red', 'blue', 'yellow', 'green'];
  const wiresOnBomb = [];
  for (let i = 0; i < 4; i++) {
    wiresOnBomb.push({
      id: i,
      symbol: getRandomElement(symbolPool),
      color: getRandomElement(colorPool)
    });
  }

  const stage1RuleLibrary = [
    { id: 'S1_R1', description: "ถ้ามีสายไฟสี <b>แดง</b> มากกว่า 1 เส้น", subDescription: "→ ให้ตัดสายไฟสี <b>แดง</b> เส้นสุดท้าย" },
    { id: 'S1_R2', description: "ถ้า <b>ไม่มี</b> สายไฟสี <b>น้ำเงิน</b> เลย", subDescription: "→ ให้ตัดสายไฟเส้นที่ <b>สอง</b>" },
    { id: 'S1_R3', description: "ถ้ามีสายไฟสี <b>เหลือง</b> เพียงเส้นเดียว", subDescription: "→ ให้ตัดสายไฟสี <b>เหลือง</b> เส้นนั้น" },
    { id: 'S1_R4', description: "ถ้ามีสายไฟสัญลักษณ์ <b>⟐</b>", subDescription: "→ ให้ตัดสายไฟสัญลักษณ์ <b>↟</b> (ถ้ามี)" },
    { id: 'S1_R5', description: "ถ้าสายไฟเส้น <b>สุดท้าย</b> เป็นสี <b>เขียว</b>", subDescription: "→ ให้ตัดสายไฟเส้น <b>แรก</b>" },
    { id: 'S1_R6', description: "ถ้ามีสายไฟสี <b>เขียว</b> อย่างน้อย 2 เส้น", subDescription: "→ ให้ตัดสายไฟเส้นที่ <b>สาม</b>" },
    { id: 'S1_R7', description: "ถ้า <b>ไม่มี</b> สัญลักษณ์ <b>⍰</b> เลย", subDescription: "→ ให้ตัดสายไฟสี <b>น้ำเงิน</b> เส้นแรก (ถ้ามี)" },
    { id: 'S1_R8', description: "ถ้าสายไฟ <b>ทุกเส้น</b> เป็นสีเดียวกัน", subDescription: "→ ให้ตัดสายไฟเส้น <b>สุดท้าย</b>" },
  ];
  
  // **** FIXED HERE: Explicitly map to remove function properties ****
  const stage1Rules = shuffleArray([...stage1RuleLibrary])
    .slice(0, 3)
    .map(rule => ({ id: rule.id, description: rule.description, subDescription: rule.subDescription }));
  
  stage1Rules.push({ id: 'S1_DEFAULT', description: "มิเช่นนั้น (ถ้าไม่มีกฎข้อไหนตรงเลย)", subDescription: "→ ให้ตัดสายไฟเส้น <b>แรก</b>" });
  const stage1Data = { wiresOnBomb, rules: stage1Rules };

  // --- STAGE 2: POWER CALIBRATION (DYNAMIC CONDITIONS) ---
  const initialA = (Math.floor(Math.random() * 5) + 3) * 10;
  const initialB = (Math.floor(Math.random() * 5) + 3) * 10;
  const initialC = (Math.floor(Math.random() * 5) + 3) * 10;
  
  const stage2ConditionLibrary = [
      { id: 'S2_C1', description: "<li>ค่าพลังงานของแกน <b>A</b> ต้องมากกว่าแกน <b>C</b></li><li>ค่าพลังงานของแกน <b>B</b> ต้องเป็นเลขคู่ (ลงท้ายด้วย 0)</li>", check: (a,b,c) => a > c && b % 20 === 0 },
      { id: 'S2_C2', description: "<li>ค่าพลังงานของแกน <b>C</b> ต้องมากกว่าแกน <b>B</b></li><li>ค่าพลังงานของแกน <b>A</b> ต้องลงท้ายด้วย 50</li>", check: (a,b,c) => c > b && a % 50 === 0 },
      { id: 'S2_C3', description: "<li>ค่าพลังงานต้องเรียงจากน้อยไปมาก (<b>A < B < C</b>)</li>", check: (a,b,c) => a < b && b < c },
      { id: 'S2_C4', description: "<li>ผลรวมของ <b>A และ C</b> ต้องเท่ากับ <b>B</b> พอดี</li>", check: (a,b,c) => (a + c) === b },
      { id: 'S2_C5', description: "<li>แกนใดแกนหนึ่งต้องมีค่าเป็น <b>100</b> พอดี</li><li>แกน <b>A</b> ต้องมีค่าน้อยที่สุด</li>", check: (a,b,c) => (a === 100 || b === 100 || c === 100) && a < b && a < c },
  ];
  const selectedCondition = getRandomElement(stage2ConditionLibrary);
  let targetA = initialA, targetB = initialB, targetC = initialC;
  let attempts = 0;
  while(attempts < 50) {
      targetA = initialA; targetB = initialB; targetC = initialC;
      for (let i = 0; i < 5; i++) {
          const pressType = Math.floor(Math.random() * 3);
          if (pressType === 0) { targetA += 10; targetB += 10; }
          else if (pressType === 1) { targetA -= 10; targetC -= 10; }
          else { targetB += 10; targetC -= 10; }
      }
      if (targetA >= 0 && targetB >= 0 && targetC >= 0 && selectedCondition.check(targetA, targetB, targetC)) {
          break;
      }
      attempts++;
  }
  if (attempts >= 50) { return generateFullPuzzle(roomId); }
  const targetSum = targetA + targetB + targetC;
  const stage2Data = { initialA, initialB, initialC, targetSum, condition: { id: selectedCondition.id, description: selectedCondition.description } };

  // --- STAGE 3: IDENTITY VERIFICATION (DYNAMIC CLUES) ---
  const iconPool = ['👤', '🕵️', '👩‍🔬', '👨‍✈️', '👩‍🚀', '👨‍💻', '💂', '🧑‍🎨'];
  const codenamePool = ['Viper', 'Ghost', 'Raven', 'Shadow', 'Echo', 'Wraith', 'Nomad', 'Spectre'];
  const statusPool = ['Active', 'Unknown', 'Retired', 'MIA'];
  const affiliationPool = ['Syndicate', 'Phantoms', 'Omega', 'Protocol'];
  const allSuspects = [];
  const shuffledIcons = shuffleArray([...iconPool]);
  const shuffledCodenames = shuffleArray([...codenamePool]);
  for (let i = 0; i < 4; i++) {
      allSuspects.push({
          id: i,
          icon: shuffledIcons[i],
          codename: shuffledCodenames[i],
          status: getRandomElement(statusPool),
          affiliation: getRandomElement(affiliationPool)
      });
  }
  const correctSuspect = getRandomElement(allSuspects);
  const wrongSuspects = allSuspects.filter(s => s.id !== correctSuspect.id);
  const clueTemplates = [
      { gen: (c, w) => `เป้าหมายมีสถานะเป็น "${c.status}".` },
      { gen: (c, w) => `เป้าหมายไม่ได้สังกัดกลุ่ม "${w[0].affiliation}".` },
      { gen: (c, w) => `ถ้าเป้าหมายใช้ไอคอน ${c.icon}, เขาจะชื่อรหัส "${c.codename}".` },
      { gen: (c, w) => `เป้าหมายสังกัดกลุ่ม "${c.affiliation}" หรือไม่ก็กลุ่ม "${w[1].affiliation}".` },
      { gen: (c, w) => `ผู้ต้องสงสัยที่ชื่อรหัส "${w[0].codename}" และเป้าหมายของเรา มีสถานะเดียวกัน.` },
      { gen: (c, w) => `มีผู้ต้องสงสัยเพียง ${allSuspects.filter(s => s.status === w[2].status).length} คนที่มีสถานะเป็น "${w[2].status}".` },
  ];
  const stage3Rules = shuffleArray(clueTemplates).slice(0, 5).map(template => ({ description: template.gen(correctSuspect, wrongSuspects) }));
  const stage3Data = {
      suspects: shuffleArray(allSuspects),
      rules: stage3Rules,
      correctSuspectId: correctSuspect.id
  };

  // --- STAGE 4: LOGIC GRID (DYNAMIC MODIFIERS) ---
  const colors = ['red', 'blue', 'green', 'yellow'];
  const flashSequence = Array(5).fill(0).map(() => getRandomElement(colors));
  const colorMap = {};
  const shuffledColors = shuffleArray([...colors]);
  colors.forEach((color, i) => { colorMap[color] = shuffledColors[i]; });
  
  const stage4ModifierLibrary = [
      { id: 'S4_M1', description: "กฎพิเศษ: ลำดับการกดทั้งหมดต้องย้อนกลับ (Reverse)" },
      { id: 'S4_M2', description: "กฎพิเศษ: ให้สลับการกดลำดับที่ 2 กับลำดับที่ 4" },
      { id: 'S4_M3', description: "กฎพิเศษ: ให้กดสีสุดท้ายซ้ำ 2 ครั้ง (ลำดับยาวขึ้น)" },
      { id: 'S4_M4', description: "กฎพิเศษ: ให้ข้ามการกดลำดับที่ 3 ไปเลย (ลำดับสั้นลง)" },
      { id: 'S4_M5', description: "กฎพิเศษ: ไม่มีกฎพิเศษ" },
  ];
  const selectedModifier = getRandomElement(stage4ModifierLibrary);
  const stage4Data = { flashSequence, colorMap, modifier: { id: selectedModifier.id, description: selectedModifier.description } };

  return { stage1: stage1Data, stage2: stage2Data, stage3: stage3Data, stage4: stage4Data };
}
// =================================================================
// Defuse Duo - script.js (HIGH REPLAYABILITY UPDATE)
// PART 3 OF 3 - FINAL CORRECTION 2
// =================================================================

// -----------------------------------------------------------------
// SECTION 3: DYNAMIC PUZZLE RENDERING AND HANDLING
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

// --- STAGE 1: CONDITIONAL WIRING (DYNAMIC) ---
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

    const stage1RuleLibrary = [
        { id: 'S1_R1', condition: (w) => w.filter(c => c.color === 'red').length > 1, action: (w) => w.filter(c => c.color === 'red').pop() },
        { id: 'S1_R2', condition: (w) => !w.some(c => c.color === 'blue'), action: (w) => w[1] },
        { id: 'S1_R3', condition: (w) => w.filter(c => c.color === 'yellow').length === 1, action: (w) => w.find(c => c.color === 'yellow') },
        { id: 'S1_R4', condition: (w) => w.some(c => c.symbol === '⟐'), action: (w) => w.find(c => c.symbol === '↟') },
        { id: 'S1_R5', condition: (w) => w[3].color === 'green', action: (w) => w[0] },
        { id: 'S1_R6', condition: (w) => w.filter(c => c.color === 'green').length >= 2, action: (w) => w[2] },
        { id: 'S1_R7', condition: (w) => !w.some(c => c.symbol === '⍰'), action: (w) => w.find(c => c.color === 'blue') },
        { id: 'S1_R8', condition: (w) => new Set(w.map(c => c.color)).size === 1, action: (w) => w[3] },
        { id: 'S1_DEFAULT', condition: () => true, action: (w) => w[0] },
    ];

    let correctWireToCut = null;
    for (const ruleData of rulesFromDB) {
        const ruleLogic = stage1RuleLibrary.find(libRule => libRule.id === ruleData.id);
        if (ruleLogic && ruleLogic.condition(wires)) {
            correctWireToCut = ruleLogic.action(wires);
            break;
        }
    }

    if (!correctWireToCut) {
        await updateDoc(roomRef, { status: 'finished', 'state.defused': false });
        return;
    }
    if (cutWireId === correctWireToCut.id) {
        await updateDoc(roomRef, { 'state.currentStage': 2 });
    } else {
        await updateDoc(roomRef, { status: 'finished', 'state.defused': false });
    }
}

// --- STAGE 2: POWER CALIBRATION (DYNAMIC) ---
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
                        <ul>${puzzleState.condition.description}</ul>
                        <p style="color: var(--danger-text);"><b>คำเตือน:</b> หากเจ้าหน้าที่ภาคสนามกดปุ่มรีเซ็ตฉุกเฉิน เวลาจะลดลง 20 วินาที และค่าพลังงานจะกลับไปที่ค่าเริ่มต้น</p>`;
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
    
    const stage2ConditionLibrary = [
        { id: 'S2_C1', check: (a,b,c) => a > c && b % 20 === 0 },
        { id: 'S2_C2', check: (a,b,c) => c > b && a % 50 === 0 },
        { id: 'S2_C3', check: (a,b,c) => a < b && b < c },
        { id: 'S2_C4', check: (a,b,c) => (a + c) === b },
        { id: 'S2_C5', check: (a,b,c) => (a === 100 || b === 100 || c === 100) && a < b && a < c },
    ];
    const conditionCheck = stage2ConditionLibrary.find(c => c.id === puzzleState.condition.id).check;

    const updateDisplays = () => {
      document.getElementById('valA').textContent = currentA;
      document.getElementById('valB').textContent = currentB;
      document.getElementById('valC').textContent = currentC;
      const isSumCorrect = (currentA + currentB + currentC) === puzzleState.targetSum;
      const isConditionMet = conditionCheck(currentA, currentB, currentC);
      const isNotNegative = currentA >= 0 && currentB >= 0 && currentC >= 0;
      confirmBtn.disabled = !(isSumCorrect && isConditionMet && isNotNegative);
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

// --- STAGE 3: IDENTITY VERIFICATION (DYNAMIC) ---
function renderStage3(roomData) {
  const puzzleState = roomData.state.puzzle.stage3;
  if (localRole === 'Tech Expert') {
    const info = document.createElement('p');
    info.className = 'muted';
    info.innerHTML = '<b>คู่มือด่าน 3: ฐานข้อมูลข่าวกรอง</b><br>ใช้ข้อมูลนี้เพื่อระบุตัวตนเป้าหมายที่แท้จริง';
    const manualList = document.createElement('ol');
    manualList.className = 'manual-list';
    puzzleState.rules.forEach(rule => {
        const li = document.createElement('li');
        li.textContent = rule.description;
        manualList.appendChild(li);
    });
    gameArea.append(info, manualList);
  } else { // Field Agent
    const info = document.createElement('p');
    info.className = 'muted';
    info.textContent = 'รายงานข้อมูลผู้ต้องสงสัยทั้งหมด แล้วเลือกเป้าหมายตามที่ผู้เชี่ยวชาญระบุ';
    const suspectContainer = document.createElement('div');
    suspectContainer.className = 'suspect-container';
    puzzleState.suspects.forEach(suspect => {
      const card = document.createElement('div');
      card.className = 'suspect-card';
      card.onclick = async () => {
        document.querySelectorAll('.suspect-card').forEach(c => c.style.pointerEvents = 'none');
        card.classList.add('selected');
        await handleIdentityConfirm(suspect.id);
      };
      card.innerHTML = `<div class="suspect-icon">${suspect.icon}</div><div class="suspect-details"><div class="suspect-codename">${suspect.codename}</div><div class="suspect-info">สถานะ: ${suspect.status}</div><div class="suspect-info">สังกัด: ${suspect.affiliation}</div></div>`;
      suspectContainer.appendChild(card);
    });
    gameArea.append(info, suspectContainer);
  }
}

async function handleIdentityConfirm(selectedSuspectId) {
    const roomRef = doc(db, 'rooms', currentRoomId);
    const currentSnap = await getDoc(roomRef);
    if (currentSnap.data().status !== 'playing') return;
    const correctSuspectId = currentSnap.data().state.puzzle.stage3.correctSuspectId;
    if (selectedSuspectId === correctSuspectId) {
        await updateDoc(roomRef, { 'state.currentStage': 4 });
    } else {
        await updateDoc(roomRef, { status: 'finished', 'state.defused': false });
    }
}

// --- STAGE 4: LOGIC GRID (DYNAMIC) ---
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
    rule2.innerHTML = `<b>กฎข้อที่ 2: กฎดัดแปลงลำดับ</b><br>${puzzleState.modifier.description}`;
    gameArea.append(info, rule1, rule2);
  } else { // Field Agent
    const info = document.createElement('p');
    info.className = 'muted';
    info.textContent = 'จดจำลำดับการกระพริบ แล้วรายงานให้ผู้เชี่ยวชาญทราบ!';
    const gridContainer = document.createElement('div');
    gridContainer.className = 'logic-grid-container';
    const buttons = {};
    ['red', 'blue', 'green', 'yellow'].forEach(color => {
        const btn = document.createElement('button');
        btn.className = `logic-btn ${color}`;
        btn.dataset.color = color;
        btn.onclick = () => handleLogicGridPress(color);
        gridContainer.appendChild(btn);
        buttons[color] = btn;
    });
    gameArea.append(info, gridContainer);
    setTimeout(() => {
        let i = 0;
        const interval = setInterval(() => {
            if (i >= puzzleState.flashSequence.length) {
                clearInterval(interval);
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
        }, 600);
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

    const stage4ModifierLibrary = [
        { id: 'S4_M1', apply: (seq) => seq.reverse() },
        { id: 'S4_M2', apply: (seq) => { const temp = seq[1]; seq[1] = seq[3]; seq[3] = temp; return seq; } },
        { id: 'S4_M3', apply: (seq) => [...seq, seq[seq.length - 1]] },
        { id: 'S4_M4', apply: (seq) => seq.filter((_, i) => i !== 2) },
        { id: 'S4_M5', apply: (seq) => seq },
    ];
    const modifierFunction = stage4ModifierLibrary.find(m => m.id === puzzle.modifier.id).apply;

    let initialSequence = puzzle.flashSequence.map(seenColor => puzzle.colorMap[seenColor]);
    let correctSequence = modifierFunction([...initialSequence]);

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
        const newFlashSequence = Array(5).fill(0).map(() => ['red', 'blue', 'green', 'yellow'][Math.floor(Math.random() * 4)]);
        await updateDoc(roomRef, {
            'state.timeLeft': newTime,
            'state.logicGrid_playerPresses': [],
            'state.puzzle.stage4.flashSequence': newFlashSequence
        });
        renderedStage = 0; 
    }
}
