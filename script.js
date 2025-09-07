// script.js ฉบับแก้ไขล่าสุด
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

function generateSymbols(){
  const pool = ['◎','★','◆','♠','♥','☘','☼','✿','☯','♫','✦','⚑'];
  const out = [];
  while (out.length < 4){
    const c = pool[Math.floor(Math.random()*pool.length)];
    if (!out.includes(c)) out.push(c);
  }
  return out;
}

function mapSymbolsToCode(symbols){
  let code = '';
  for (let s of symbols){
    code += (s.codePointAt(0) % 10).toString();
  }
  return code.padEnd(4,'0').substr(0,4);
}

// --- Auth Handling ---
createRoomBtn.disabled = true;
createRoomBtn.textContent = 'กำลังเชื่อมต่อ...';
joinRoomBtn.disabled = true;

signInAnonymously(auth).catch((err)=>{
  console.error('Auth error', err);
  createRoomBtn.textContent = 'เชื่อมต่อล้มเหลว';
  joinRoomBtn.textContent = 'เชื่อมต่อล้มเหลว';
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    me = { uid: user.uid };
    console.log('signed in', me.uid);
    createRoomBtn.disabled = false;
    createRoomBtn.textContent = 'สร้างห้องใหม่';
    joinRoomBtn.disabled = false;
  } else {
    me = null;
    createRoomBtn.disabled = true;
    joinRoomBtn.disabled = true;
    createRoomBtn.textContent = 'โปรดรีเฟรช';
    console.log('Not signed in.');
  }
});

// --- Lobby Event Listeners ---
createRoomBtn.addEventListener('click', async ()=>{
  if (!me) return alert('ยังไม่เชื่อมต่อ Firebase (รอสักครู่แล้วลองใหม่)');
  me.name = displayNameInput.value || ('ผู้เล่น-' + me.uid.slice(0,4));
  const roomId = makeRoomId(6);
  const roomRef = doc(db, 'rooms', roomId);
  const symbols = generateSymbols();
  const initial = {
    createdAt: serverTimestamp(),
    owner: me.uid,
    players: [{ uid: me.uid, name: me.name }],
    status: 'waiting',
    state: {
      symbolsA: symbols,
      code: null,
      solved: false,
      timeLeft: 300
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
  if (!rid) return alert('กรุณาใส่รหัสห้อง');
  const ref = doc(db, 'rooms', rid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return alert('ไม่พบห้องนี้');
  const data = snap.data();
  if (data.players && data.players.length >= 2 && !data.players.find(p => p.uid === me.uid)) {
    return alert('ห้องเต็มแล้ว');
  }
  me.name = displayNameInput.value || ('ผู้เล่น-' + me.uid.slice(0,4));
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
  await updateDoc(ref, { status: 'playing', 'state.timeLeft': 300 });
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
      alert('ห้องถูกลบหรือไม่พบห้องอีกต่อไป');
      cleanupRoom();
      showLobby();
      return;
    }
    const data = snap.data();
    renderRoomInfo(roomId, data);

    if (data.status === 'playing') {
      if (!isGameUIShown) {
        const players = data.players || [];
        const idx = players.findIndex(p => p.uid === me.uid);
        localRole = (idx === 0) ? 'A' : 'B';
        ownerUid = data.owner;
        showGame(data);
        isGameUIShown = true;
      }
      updateGameState(data);
    } else if (data.status === 'waiting' || data.status === 'finished') {
      if (isGameUIShown) {
        if (data.status === 'finished') {
          showFinishedScreen(data);
        } else {
          showLobbyRoomView();
        }
      }
    }
  });

  showLobbyRoomView();
}

function renderRoomInfo(roomId, data){
  roomIdLabel.textContent = roomId;
  roomStatus.textContent = data.status || 'รอผู้เล่น';
  playersList.innerHTML = '';
  (data.players || []).forEach(p => {
    const li = document.createElement('li');
    li.textContent = p.name + (p.uid === data.owner ? ' (เจ้าของห้อง)' : '');
    playersList.appendChild(li);
  });
  if (me && me.uid === data.owner && (data.players || []).length >= 2 && data.status === 'waiting') {
    startGameBtn.classList.remove('hidden');
    ownerHint.textContent = 'คุณเป็นเจ้าของห้อง — กด "เริ่มเกม" เมื่อพร้อม';
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
  roleTitle.textContent = (localRole === 'A') ? 'บทบาท: ผู้เล่น A (เห็นสัญลักษณ์)' : 'บทบาท: ผู้เล่น B (เห็นตู้เซฟ)';

  renderGameUI(roomData);

  if (me.uid === roomData.owner && !countdownInterval) {
    countdownInterval = setInterval(async ()=>{
      const roomRef = doc(db, 'rooms', currentRoomId);
      const snap = await getDoc(roomRef);
      if (!snap.exists()) { clearInterval(countdownInterval); return; }
      const r = snap.data();
      if (!r.state || r.state.solved || r.state.timeLeft <= 0 || r.status !== 'playing') {
        clearInterval(countdownInterval);
        countdownInterval = null;
        if (r.state.timeLeft <= 0 && r.status === 'playing') {
          await updateDoc(roomRef, { status: 'finished' });
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
}

function renderGameUI(roomData){
  gameArea.innerHTML = '';
  const state = roomData.state || {};

  if (localRole === 'A') {
    const symbolsDiv = document.createElement('div');
    symbolsDiv.style.fontSize = '28px';
    symbolsDiv.textContent = (state.symbolsA || []).join('   ');
    gameArea.appendChild(symbolsDiv);

    const info = document.createElement('p');
    info.textContent = 'หน้าที่: สื่อสารสัญลักษณ์เหล่านี้ให้ผู้เล่น B เพื่อให้เขาถอดรหัส';
    info.className = 'muted';
    gameArea.appendChild(info);

    const hint = document.createElement('p');
    hint.innerHTML = '<b>คำใบ้:</b> รหัสลับคือ <span style="color: #7dd3fc;">เลขตัวสุดท้าย</span> ของ Code Point แต่ละตัว';
    hint.className = 'muted';
    gameArea.appendChild(hint);

    const createBtn = document.createElement('button');
    createBtn.textContent = state.code ? 'ส่งคำใบ้แล้ว' : 'ส่งคำใบ้ (สร้างรหัสลับ)';
    createBtn.disabled = !!state.code;
    createBtn.addEventListener('click', async ()=>{
      if (!currentRoomId || state.code) return;
      const code = mapSymbolsToCode(state.symbolsA || []);
      const roomRef = doc(db, 'rooms', currentRoomId);
      await updateDoc(roomRef, { 'state.code': code });
      hintText.textContent = 'ระบบได้สร้างรหัสลับแล้ว! สื่อสารกับเพื่อนของคุณได้เลย';
      createBtn.textContent = 'ส่งคำใบ้แล้ว';
      createBtn.disabled = true;
      setTimeout(()=>hintText.textContent = '', 3500);
    });
    gameArea.appendChild(createBtn);

  } else {
    const safeText = document.createElement('div');
    safeText.style.fontSize = '18px';
    safeText.textContent = 'ตู้เซฟ: ป้อนรหัส 4 หลัก';
    gameArea.appendChild(safeText);

    const hint = document.createElement('p');
    hint.innerHTML = '<b>คำใบ้:</b> รหัส 4 หลักมาจาก <span style="color: #7dd3fc;">สัญลักษณ์</span> ที่เพื่อนของคุณเห็น';
    hint.className = 'muted';
    gameArea.appendChild(hint);

    const buffer = document.createElement('div');
    buffer.id = 'inputBuffer';
    buffer.style.fontSize = '22px';
    buffer.style.marginTop = '8px';
    buffer.style.border = '1px solid #9fb4c9';
    buffer.style.padding = '8px 12px';
    buffer.style.minWidth = '100px';
    buffer.style.textAlign = 'center';
    buffer.textContent = '----';
    gameArea.appendChild(buffer);

    const keypad = document.createElement('div');
    keypad.style.display = 'grid';
    keypad.style.gridTemplateColumns = 'repeat(3, 60px)';
    keypad.style.gap = '8px';
    keypad.style.marginTop = '12px';

    let inputBuf = '';

    const onKeyPress = (ch) => {
      if (inputBuf.length >= 4) return;
      inputBuf += ch;
      buffer.textContent = inputBuf.padEnd(4, '-');
    };

    const tryOpen = async () => {
      const roomRef = doc(db, 'rooms', currentRoomId);
      const currentSnap = await getDoc(roomRef);
      const currentData = currentSnap.data();
      const currentState = currentData.state;

      if (!currentState.code) {
        const generatedCode = mapSymbolsToCode(currentState.symbolsA);
        await updateDoc(roomRef, { 'state.code': generatedCode });
      }

      const finalSnap = await getDoc(roomRef);
      const finalData = finalSnap.data();

      if (inputBuf.length < 4) {
        hintText.textContent = 'กรอกรหัส 4 หลักก่อน';
        setTimeout(()=>hintText.textContent = '', 2000);
        return;
      }
      if (inputBuf === finalData.state.code) {
        await updateDoc(roomRef, { 'state.solved': true, 'status': 'finished' });
      } else {
        hintText.textContent = 'รหัสไม่ถูกต้อง ลองอีกครั้ง';
        inputBuf = '';
        buffer.textContent = '----';
        setTimeout(()=>hintText.textContent = '', 2000);
      }
    };

    for (let i=1;i<=9;i++){
      const btn = document.createElement('button');
      btn.textContent = i;
      btn.addEventListener('click', ()=>onKeyPress(i.toString()));
      keypad.appendChild(btn);
    }
    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'C';
    clearBtn.addEventListener('click', () => {
        inputBuf = '';
        buffer.textContent = '----';
    });
    const zeroBtn = document.createElement('button');
    zeroBtn.textContent = '0';
    zeroBtn.addEventListener('click', ()=>onKeyPress('0'));
    const enterBtn = document.createElement('button');
    enterBtn.textContent = 'ยืนยัน';
    enterBtn.style.gridColumn = 'span 3';
    enterBtn.addEventListener('click', tryOpen);

    keypad.appendChild(clearBtn);
    keypad.appendChild(zeroBtn);
    keypad.appendChild(enterBtn);

    gameArea.appendChild(keypad);
  }
}

function showFinishedScreen(roomData) {
    gameArea.innerHTML = '';
    const state = roomData.state;
    const correctCode = mapSymbolsToCode(state.symbolsA);

    const summary = document.createElement('div');
    summary.style.textAlign = 'center';

    const title = document.createElement('h3');
    if (state.solved) {
        title.textContent = '🎉 ยินดีด้วย! เปิดตู้เซฟสำเร็จ! 🎉';
        title.style.color = '#7dd3fc';
    } else {
        title.textContent = '⌛ หมดเวลา! ⌛';
        title.style.color = '#fc7d7d';
    }
    summary.appendChild(title);

    const solution = document.createElement('p');
    solution.innerHTML = `รหัสที่ถูกต้องคือ: <strong style="font-size: 20px; color: #7dd3fc;">${correctCode}</strong>`;
    summary.appendChild(solution);

    const explanationTitle = document.createElement('p');
    explanationTitle.textContent = 'ที่มาของรหัส:';
    explanationTitle.style.marginTop = '20px';
    summary.appendChild(explanationTitle);

    const explanationBox = document.createElement('div');
    explanationBox.style.background = 'rgba(0,0,0,0.2)';
    explanationBox.style.padding = '10px';
    explanationBox.style.borderRadius = '8px';
    explanationBox.style.textAlign = 'left';
    explanationBox.style.fontFamily = 'monospace';
    explanationBox.style.fontSize = '14px';

    state.symbolsA.forEach(symbol => {
        const codePoint = symbol.codePointAt(0);
        const lastDigit = codePoint % 10;
        const line = document.createElement('div');
        line.innerHTML = `สัญลักษณ์ '${symbol}' → Code Point: ${codePoint} → เลขตัวสุดท้าย: <strong style="color: #7dd3fc;">${lastDigit}</strong>`;
        explanationBox.appendChild(line);
    });

    summary.appendChild(explanationBox);
    gameArea.appendChild(summary);

    // ปิดการใช้งานปุ่มทั้งหมด
    document.querySelectorAll('#game button').forEach(b => b.disabled = true);
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
