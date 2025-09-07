// Defuse Duo - script.js (Multi-Stage Complete Version)
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

// --- Helper Functions ---
function makeRoomId(len = 6){
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i=0;i<len;i++) out += chars.charAt(Math.floor(Math.random()*chars.length));
  return out;
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function generateFullPuzzle() {
  // Stage 1: Wires
  const symbolPool = ['⍰','↟','⍼','⟐','⨳','⩻','⪢','⟁','⍬','⦚','⟓','⨇'];
  const selectedSymbols = shuffleArray([...symbolPool]).slice(0, 4);
  const wiresOnBomb = shuffleArray([...selectedSymbols]);
  const defuseOrder = selectedSymbols;

  // Stage 2: Frequency
  const initialFreq = Math.floor(Math.random() * 900) + 100; // 100-999
  const freqDigits = initialFreq.toString().split('').map(Number);
  const correctFreq = (freqDigits[0] + freqDigits[2]) * 10;

  // Stage 3: Password
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const grid = Array(25).fill(0).map(() => chars[Math.floor(Math.random() * chars.length)]);
  const passwordLength = 5;
  const passwordPositions = [];
  const passwordChars = [];
  while (passwordPositions.length < passwordLength) {
    const pos = Math.floor(Math.random() * 25);
    if (!passwordPositions.includes(pos)) {
      passwordPositions.push(pos);
      passwordChars.push(grid[pos]);
    }
  }
  const correctPassword = passwordChars.join('');

  return {
    stage1: { wiresOnBomb, defuseOrder },
    stage2: { initialFreq, correctFreq },
    stage3: { grid, passwordPositions, correctPassword }
  };
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
    console.log('signed in', me.uid);
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
  const roomId = makeRoomId(6);
  const roomRef = doc(db, 'rooms', roomId);
  const puzzle = generateFullPuzzle();
  const initial = {
    createdAt: serverTimestamp(),
    owner: me.uid,
    players: [{ uid: me.uid, name: me.name }],
    status: 'waiting',
    state: {
      puzzle: puzzle,
      currentStage: 1,
      wiresCut: [],
      defused: false,
      timeLeft: 300 // 5 minutes for 3 stages
    }
  };
  await setDoc(roomRef, initial);
  enterRoom(roomId);
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

// --- Room & Game Logic ---
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
}

function showGame(roomData){
  mainLobby.classList.add('hidden');
  sectionGame.classList.remove('hidden');
  roleTitle.textContent = `บทบาท: ${localRole}`;
  
  updateTimer(roomData.state.timeLeft);
  startTimer(roomData);

  renderCurrentStage(roomData);
}

function renderCurrentStage(roomData) {
  gameArea.innerHTML = '';
  const state = roomData.state;
  
  const stageIndicator = document.createElement('div');
  stageIndicator.className = 'stage-indicator';
  for (let i = 1; i <= 3; i++) {
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
}

// --- STAGE 1: WIRE CUTTING ---
function renderStage1(roomData) {
  const puzzleState = roomData.state.puzzle.stage1;
  const wiresCut = roomData.state.wiresCut;

  if (localRole === 'Tech Expert') {
    const manualList = document.createElement('ol');
    manualList.className = 'manual-list';
    puzzleState.defuseOrder.forEach((symbol, index) => {
        const li = document.createElement('li');
        li.innerHTML = `ลำดับที่ ${index + 1}: <strong>${symbol}</strong>`;
        manualList.appendChild(li);
    });
    gameArea.appendChild(manualList);
  } else { // Field Agent
    const wireContainer = document.createElement('div');
    wireContainer.className = 'wire-container';
    puzzleState.wiresOnBomb.forEach(symbol => {
        const wireEl = document.createElement('div');
        wireEl.className = 'wire';
        wireEl.textContent = symbol;
        wireEl.style.fontFamily = "'Segoe UI Symbol', sans-serif";
        if (wiresCut.includes(symbol)) {
            wireEl.classList.add('cut');
        } else {
            wireEl.addEventListener('click', () => handleWireCut(symbol));
        }
        wireContainer.appendChild(wireEl);
    });
    gameArea.appendChild(wireContainer);
  }
}

async function handleWireCut(symbol) {
  const roomRef = doc(db, 'rooms', currentRoomId);
  const currentSnap = await getDoc(roomRef);
  const data = currentSnap.data();
  if (data.status !== 'playing') return;

  const state = data.state;
  const nextWireToCut = state.puzzle.stage1.defuseOrder[state.wiresCut.length];

  if (symbol === nextWireToCut) {
    const newWiresCut = [...state.wiresCut, symbol];
    if (newWiresCut.length === 4) {
      await updateDoc(roomRef, { 'state.wiresCut': newWiresCut, 'state.currentStage': 2 });
    } else {
      await updateDoc(roomRef, { 'state.wiresCut': newWiresCut });
    }
  } else {
    await updateDoc(roomRef, { status: 'finished', 'state.defused': false });
  }
}

// --- STAGE 2: FREQUENCY TUNING ---
function renderStage2(roomData) {
  const puzzleState = roomData.state.puzzle.stage2;
  if (localRole === 'Tech Expert') {
    const info = document.createElement('p');
    info.innerHTML = `คู่มือด่าน 2: คำนวณหาความถี่ที่ถูกต้องจากเลขที่คู่หูเห็น<br><b>สูตร: (เลขตัวแรก + เลขตัวสุดท้าย) * 10</b>`;
    gameArea.appendChild(info);
  } else { // Field Agent
    let currentFreq = puzzleState.initialFreq;
    const tunerContainer = document.createElement('div');
    tunerContainer.className = 'tuner-container';
    
    const display = document.createElement('div');
    display.className = 'tuner-display';
    display.textContent = currentFreq;

    const btnMinus = document.createElement('button');
    btnMinus.className = 'tuner-btn';
    btnMinus.textContent = '-';
    btnMinus.onclick = () => { currentFreq--; display.textContent = currentFreq; };

    const btnPlus = document.createElement('button');
    btnPlus.className = 'tuner-btn';
    btnPlus.textContent = '+';
    btnPlus.onclick = () => { currentFreq++; display.textContent = currentFreq; };
    
    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'ยืนยันความถี่';
    confirmBtn.onclick = () => handleFrequencyConfirm(currentFreq);

    tunerContainer.append(btnMinus, display, btnPlus);
    gameArea.append(tunerContainer, confirmBtn);
  }
}

async function handleFrequencyConfirm(freq) {
    const roomRef = doc(db, 'rooms', currentRoomId);
    const currentSnap = await getDoc(roomRef);
    if (currentSnap.data().status !== 'playing') return;
    const correctFreq = currentSnap.data().state.puzzle.stage2.correctFreq;

    if (freq === correctFreq) {
        await updateDoc(roomRef, { 'state.currentStage': 3 });
    } else {
        await updateDoc(roomRef, { status: 'finished', 'state.defused': false });
    }
}

// --- STAGE 3: PASSWORD OVERRIDE ---
function renderStage3(roomData) {
  const puzzleState = roomData.state.puzzle.stage3;
  if (localRole === 'Tech Expert') {
    const grid = document.createElement('div');
    grid.className = 'password-grid';
    puzzleState.grid.forEach(char => {
      const cell = document.createElement('div');
      cell.className = 'grid-cell';
      cell.textContent = char;
      grid.appendChild(cell);
    });
    gameArea.appendChild(grid);
  } else { // Field Agent
    const grid = document.createElement('div');
    grid.className = 'password-grid';
    for(let i = 0; i < 25; i++) {
      const cell = document.createElement('div');
      cell.className = 'grid-cell';
      if (puzzleState.passwordPositions.includes(i)) {
        cell.classList.add('highlight');
        cell.textContent = '?';
      }
      grid.appendChild(cell);
    }
    
    const inputArea = document.createElement('div');
    inputArea.className = 'password-input-area';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'ป้อนรหัสผ่าน...';
    input.maxLength = 5;
    
    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'ปลดล็อก';
    confirmBtn.onclick = () => handlePasswordConfirm(input.value.toUpperCase());

    inputArea.append(input, confirmBtn);
    gameArea.append(grid, inputArea);
  }
}

async function handlePasswordConfirm(password) {
    const roomRef = doc(db, 'rooms', currentRoomId);
    const currentSnap = await getDoc(roomRef);
    if (currentSnap.data().status !== 'playing') return;
    const correctPassword = currentSnap.data().state.puzzle.stage3.correctPassword;

    if (password === correctPassword) {
        await updateDoc(roomRef, { status: 'finished', 'state.defused': true });
    } else {
        await updateDoc(roomRef, { status: 'finished', 'state.defused': false });
    }
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
      if (newTime <= 0) {
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
