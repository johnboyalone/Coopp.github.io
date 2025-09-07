// Defuse Duo - script.js (Esoteric Symbols Version)
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

function generateBombPuzzle(){
  // NEW ESOTERIC SYMBOLS
  const pool = ['⍰','↟','⍼','⟐','⨳','⩻','⪢','⟁','⍬','⦚','⟓','⨇'];
  const selectedSymbols = shuffleArray([...pool]).slice(0, 4);
  
  const wiresOnBomb = shuffleArray([...selectedSymbols]);
  const defuseOrder = selectedSymbols;

  return { wiresOnBomb, defuseOrder };
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
  const puzzle = generateBombPuzzle();
  const initial = {
    createdAt: serverTimestamp(),
    owner: me.uid,
    players: [{ uid: me.uid, name: me.name }],
    status: 'waiting',
    state: {
      wiresOnBomb: puzzle.wiresOnBomb,
      defuseOrder: puzzle.defuseOrder,
      wiresCut: [],
      defused: false,
      timeLeft: 180
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
        showGame(data);
        isGameUIShown = true;
      }
      updateGameState(data);
    } else if (data.status === 'finished') {
      if (isGameUIShown) {
        showFinishedScreen(data);
      }
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
  mainLobby.querySelector('#lobby .card')?.classList.remove('hidden');
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
  mainLobby.querySelector('#lobby .card')?.classList.add('hidden');
  roomInfo.classList.add('hidden');
  sectionGame.classList.remove('hidden');
  hintText.textContent = '';
  roleTitle.textContent = `บทบาท: ${localRole}`;

  renderGameUI(roomData);

  if (me.uid === roomData.owner && !countdownInterval) {
    countdownInterval = setInterval(async ()=>{
      const roomRef = doc(db, 'rooms', currentRoomId);
      const snap = await getDoc(roomRef);
      if (!snap.exists()) { clearInterval(countdownInterval); return; }
      const r = snap.data();
      if (!r.state || r.state.defused || r.state.timeLeft <= 0 || r.status !== 'playing') {
        clearInterval(countdownInterval);
        countdownInterval = null;
        if (r.state.timeLeft <= 0 && r.status === 'playing') {
          await updateDoc(roomRef, { status: 'finished', 'state.defused': false });
        }
        return;
      }
      const newTime = (r.state.timeLeft || 0) - 1;
      await updateDoc(roomRef, { 'state.timeLeft': newTime });
    }, 1000);
  }
}

function updateGameState(roomData) {
    const state = roomData.state || {};
    timerText.textContent = 'เวลา: ' + formatTime(state.timeLeft || 0);
    if (state.timeLeft < 30) {
        timerText.classList.add('timer-critical');
    } else {
        timerText.classList.remove('timer-critical');
    }

    if (localRole === 'Field Agent') {
        const wires = document.querySelectorAll('.wire');
        wires.forEach(wireEl => {
            const wireSymbol = wireEl.dataset.symbol;
            if (state.wiresCut.includes(wireSymbol)) {
                wireEl.classList.add('cut');
            }
        });
    }
}

function renderGameUI(roomData){
  gameArea.innerHTML = '';
  const state = roomData.state || {};

  if (localRole === 'Tech Expert') {
    const info = document.createElement('p');
    info.textContent = 'คู่มือการกู้ระเบิด: บอกให้คู่หูตัดสายไฟตามลำดับต่อไปนี้!';
    info.className = 'muted';
    gameArea.appendChild(info);

    const manualList = document.createElement('ol');
    manualList.className = 'manual-list';
    (state.defuseOrder || []).forEach((symbol, index) => {
        const li = document.createElement('li');
        li.innerHTML = `ลำดับที่ ${index + 1}: <strong style="font-family: 'Segoe UI Symbol', sans-serif;">${symbol}</strong>`;
        manualList.appendChild(li);
    });
    gameArea.appendChild(manualList);

  } else { // Field Agent
    const info = document.createElement('p');
    info.textContent = 'คุณอยู่หน้าแผงวงจร! รายงานสัญลักษณ์บนสายไฟให้ผู้เชี่ยวชาญทราบ และตัดตามคำสั่ง!';
    info.className = 'muted';
    gameArea.appendChild(info);

    const wireContainer = document.createElement('div');
    wireContainer.className = 'wire-container';

    (state.wiresOnBomb || []).forEach(symbol => {
        const wireEl = document.createElement('div');
        wireEl.className = 'wire';
        wireEl.style.fontFamily = "'Segoe UI Symbol', sans-serif";
        wireEl.textContent = symbol;
        wireEl.dataset.symbol = symbol;

        wireEl.addEventListener('click', async () => {
            const roomRef = doc(db, 'rooms', currentRoomId);
            const currentSnap = await getDoc(roomRef);
            const currentData = currentSnap.data();
            const currentState = currentData.state;

            if (currentState.wiresCut.includes(symbol) || currentData.status === 'finished') return;

            const nextWireToCut = currentState.defuseOrder[currentState.wiresCut.length];

            if (symbol === nextWireToCut) {
                const newWiresCut = [...currentState.wiresCut, symbol];
                if (newWiresCut.length === 4) {
                    await updateDoc(roomRef, { 'state.wiresCut': newWiresCut, 'state.defused': true, status: 'finished' });
                } else {
                    await updateDoc(roomRef, { 'state.wiresCut': newWiresCut });
                }
            } else {
                await updateDoc(roomRef, { status: 'finished', 'state.defused': false });
            }
        });
        wireContainer.appendChild(wireEl);
    });
    gameArea.appendChild(wireContainer);
  }
}

function showFinishedScreen(roomData) {
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
    report.innerHTML = `ลำดับการตัดที่ถูกต้องคือ: <strong style="color: var(--warning); font-family: 'Segoe UI Symbol', sans-serif;">${state.defuseOrder.join(' → ')}</strong>`;
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
