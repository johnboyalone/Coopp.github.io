// script.js (module)
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, onSnapshot, updateDoc, arrayUnion, arrayRemove, serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

/* ==== ใส่ firebaseConfig ของคุณที่นี่ (คุณให้มาแล้ว) ==== */
const firebaseConfig = {
  apiKey: "AIzaSyDceng5cmITvUqqTuMFSja0y4PSkhFmrmg",
  authDomain: "gemini-co-op-game.firebaseapp.com",
  projectId: "gemini-co-op-game",
  storageBucket: "gemini-co-op-game.firebasestorage.app",
  messagingSenderId: "387010923200",
  appId: "1:387010923200:web:082a20a7b94a59aea9bb25"
};
/* ======================================================= */

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- UI refs
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

let me = null; // { uid, name }
let currentRoomId = null;
let roomUnsubscribe = null;
let localRole = null; // 'A' or 'B'
let ownerUid = null;
let countdownInterval = null;

// Helper: สร้าง id ห้องสั้น ๆ
function makeRoomId(len = 6){
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i=0;i<len;i++) out += chars.charAt(Math.floor(Math.random()*chars.length));
  return out;
}

// โอน/แปลงสัญลักษณ์ -> รหัส 4 หลัก
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

// ======= Firebase Auth: sign in anonymously
signInAnonymously(auth).catch((err)=>{
  console.error('Auth error', err);
});
onAuthStateChanged(auth, (user) => {
  if (user) {
    me = { uid: user.uid, name: (displayNameInput.value || 'ผู้เล่น') };
    console.log('signed in', me.uid);
  } else {
    me = null;
  }
});

// ======= Event handlers for lobby UI
createRoomBtn.addEventListener('click', async ()=>{
  if (!me) return alert('ยังไม่เชื่อมต่อ Firebase (รอสักครู่แล้วลองใหม่)');
  me.name = displayNameInput.value || ('ผู้เล่น-' + me.uid.slice(0,4));
  const roomId = makeRoomId(6);
  const roomRef = doc(db, 'rooms', roomId);
  const symbols = generateSymbols();
  const code = mapSymbolsToCode(symbols);
  // initial state
  const initial = {
    createdAt: serverTimestamp(),
    owner: me.uid,
    players: [{ uid: me.uid, name: me.name }],
    status: 'waiting', // waiting | ready | playing | finished
    state: {
      symbolsA: symbols, // visible to A
      code: null,        // null until A "ส่งคำใบ้"
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
  // add self to players
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
  // เจ้าของห้องเป็นคนเริ่ม: เปลี่ยน status -> playing และ set timeLeft
  if (!currentRoomId) return;
  const ref = doc(db, 'rooms', currentRoomId);
  await updateDoc(ref, { status: 'playing', 'state.timeLeft': 300 });
});

// กลับไปลอบบี้
backToLobbyBtn.addEventListener('click', ()=>{
  if (currentRoomId) {
    // ออกจากห้อง (แต่ไม่ได้ลบห้อง) — ถ้าต้องการลบเมื่อไม่มีผู้เล่น ผู้สร้าง/คุณสามารถเขียน cloud function หรือเช็คเมื่อ players = 0
    leaveRoomBtn.click();
  } else {
    showLobby();
  }
});

// ======= เข้าห้อง: ตั้ง listener realtime
async function enterRoom(roomId){
  currentRoomId = roomId;
  const ref = doc(db, 'rooms', roomId);

  // listener
  roomUnsubscribe = onSnapshot(ref, (snap)=>{
    if (!snap.exists()){
      alert('ห้องถูกลบหรือไม่พบห้องอีกต่อไป');
      cleanupRoom();
      showLobby();
      return;
    }
    const data = snap.data();
    renderRoomInfo(roomId, data);
    // ถ้า status == playing ให้แสดงหน้าจอเกม
    if (data.status === 'playing') {
      // หา role ของฉัน: ถาฉันเป็นผู้เล่นแรกใน players => อาจกำหนดเป็น A, อีกคนเป็น B
      const players = data.players || [];
      const idx = players.findIndex(p => p.uid === me.uid);
      // Map: index 0 => A, index 1 => B
      if (idx === -1) {
        // spectator (rare) — treat as B by default
        localRole = 'B';
      } else {
        localRole = (idx === 0) ? 'A' : 'B';
      }
      ownerUid = data.owner;
      // แสดงหน้าเกม
      showGame(data);
    } else {
      // ยังไม่เล่น => อยู่หน้าลอบบี้
      showLobbyRoomView();
    }
  });

  // show UI
  showLobbyRoomView();
}

// render ลิสต์ผู้เล่น
function renderRoomInfo(roomId, data){
  roomIdLabel.textContent = roomId;
  roomStatus.textContent = data.status || 'รอผู้เล่น';
  playersList.innerHTML = '';
  (data.players || []).forEach(p => {
    const li = document.createElement('li');
    li.textContent = p.name + (p.uid === data.owner ? ' (เจ้าของห้อง)' : '');
    playersList.appendChild(li);
  });
  // show start button only for owner and when players >= 2
  if (me && me.uid === data.owner && (data.players || []).length >= 2) {
    startGameBtn.classList.remove('hidden');
    ownerHint.textContent = 'คุณเป็นเจ้าของห้อง — กด "เริ่มเกม" เมื่อพร้อม';
  } else {
    startGameBtn.classList.add('hidden');
    ownerHint.textContent = '';
  }
}

// แสดง lobby ที่มีข้อมูลห้อง
function showLobbyRoomView(){
  mainLobby.querySelector('#lobby .card')?.classList.remove('hidden');
  roomInfo.classList.remove('hidden');
  sectionGame.classList.add('hidden');
  // ซ่อน join area
  joinArea.classList.add('hidden');
}

// แสดง lobby ปกติ
function showLobby(){
  // cleanup
  if (roomUnsubscribe) { roomUnsubscribe(); roomUnsubscribe = null; }
  currentRoomId = null;
  roomInfo.classList.add('hidden');
  startGameBtn.classList.add('hidden');
  mainLobby.querySelector('#lobby .card')?.classList.remove('hidden');
  sectionGame.classList.add('hidden');
}

// cleanup local room state
async function cleanupRoom(){
  if (!currentRoomId) return;
  // remove self from players (if not already)
  const ref = doc(db, 'rooms', currentRoomId);
  try { await updateDoc(ref, { players: arrayRemove({ uid: me.uid, name: me.name }) }); } catch (e) {}
  if (roomUnsubscribe) { roomUnsubscribe(); roomUnsubscribe = null; }
  currentRoomId = null;
  localRole = null;
  ownerUid = null;
  clearInterval(countdownInterval);
  countdownInterval = null;
}

// ======= แสดงหน้าเกม และ logic co-op (A: สัญลักษณ์ -> สร้างรหัส, B: กรอกรหัส)
function showGame(roomData){
  // hide lobby, show game
  mainLobby.querySelector('#lobby .card')?.classList.add('hidden');
  roomInfo.classList.add('hidden');
  sectionGame.classList.remove('hidden');
  hintText.textContent = '';
  // determine role already set in snapshot handler
  roleTitle.textContent = (localRole === 'A') ? 'บทบาท: ผู้เล่น A (เห็นสัญลักษณ์)' : 'บทบาท: ผู้เล่น B (เห็นตู้เซฟ)';

  renderGameUI(roomData);
  // start countdown updater (owner updates Firestore timeLeft)
  if (me.uid === roomData.owner && roomData.status === 'playing' && !countdownInterval) {
    // owner will decrement timeLeft every second and push to DB
    countdownInterval = setInterval(async ()=>{
      const roomRef = doc(db, 'rooms', currentRoomId);
      const snap = await getDoc(roomRef);
      if (!snap.exists()) { clearInterval(countdownInterval); return; }
      const r = snap.data();
      if (!r.state) return;
      if (r.state.solved || r.state.timeLeft <= 0) {
        clearInterval(countdownInterval);
        return;
      }
      const newTime = (r.state.timeLeft || 0) - 1;
      await updateDoc(roomRef, { 'state.timeLeft': newTime });
      if (newTime <= 0) {
        // mark finished
        await updateDoc(roomRef, { status: 'finished' });
      }
    }, 1000);
  }
}

// สร้าง UI ภายในเกมตามสถานะ (เรียกทุกครั้งเมื่อ snapshot เข้ามา)
function renderGameUI(roomData){
  gameArea.innerHTML = '';
  const state = roomData.state || {};
  // update timer
  timerText.textContent = 'เวลา: ' + formatTime(state.timeLeft || 0);

  if (localRole === 'A') {
    // show symbols and button to "ส่งคำใบ้ (สร้างรหัส)" ถ้ายังไม่สร้าง
    const symbolsDiv = document.createElement('div');
    symbolsDiv.style.fontSize = '28px';
    symbolsDiv.textContent = (state.symbolsA || []).join('   ');
    gameArea.appendChild(symbolsDiv);

    const info = document.createElement('p'); info.textContent = 'หน้าที่: ส่งคำใบ้ให้ผู้เล่น B โดยการกดปุ่มเพื่อสร้างรหัส (ระบบจะเก็บรหัสและซิงค์ไปยังห้อง)';
    info.className = 'muted';
    gameArea.appendChild(info);

    const createBtn = document.createElement('button');
    createBtn.textContent = state.code ? 'รหัสถูกสร้างแล้ว' : 'ส่งคำใบ้ (สร้างรหัส)';
    createBtn.disabled = !!state.code;
    createBtn.addEventListener('click', async ()=>{
      if (!currentRoomId) return;
      if (state.code) return alert('รหัสถูกสร้างแล้ว');
      const code = mapSymbolsToCode(state.symbolsA || []);
      const roomRef = doc(db, 'rooms', currentRoomId);
      await updateDoc(roomRef, { 'state.code': code });
      hintText.textContent = 'ส่งคำใบ้ให้ผู้เล่น B ทางเสียง/ข้อความจริง ๆ (ตัวเกมจะซิงค์รหัสไว้)';
      setTimeout(()=>hintText.textContent = '', 3500);
    });
    gameArea.appendChild(createBtn);

  } else {
    // role B: show safe + keypad
    const safeText = document.createElement('div');
    safeText.style.fontSize = '18px';
    safeText.textContent = state.solved ? 'ตู้เซฟ: ถูกเปิดแล้ว 🎉' : 'ตู้เซฟ: รอรหัสจากผู้เล่น A';
    gameArea.appendChild(safeText);

    const buffer = document.createElement('div');
    buffer.id = 'inputBuffer';
    buffer.style.fontSize = '22px';
    buffer.style.marginTop = '8px';
    buffer.textContent = '';
    gameArea.appendChild(buffer);

    // keypad
    const keypad = document.createElement('div');
    keypad.style.display = 'grid';
    keypad.style.gridTemplateColumns = 'repeat(3, 60px)';
    keypad.style.gap = '8px';
    keypad.style.marginTop = '12px';
    for (let i=1;i<=9;i++){
      const btn = document.createElement('button');
      btn.textContent = i;
      btn.addEventListener('click', ()=>onKeyPress(i.toString()));
      keypad.appendChild(btn);
    }
    const zeroBtn = document.createElement('button'); zeroBtn.textContent = '0';
    zeroBtn.addEventListener('click', ()=>onKeyPress('0'));
    const enterBtn = document.createElement('button'); enterBtn.textContent = 'ยืนยัน';
    enterBtn.addEventListener('click', tryOpen);
    // arrange last row
    keypad.appendChild(zeroBtn);
    keypad.appendChild(enterBtn);

    gameArea.appendChild(keypad);

    // store buffer in closure
    let inputBuf = '';
    function onKeyPress(ch){
      if (inputBuf.length >= 4) return;
      inputBuf += ch;
      buffer.textContent = inputBuf;
    }
    async function tryOpen(){
      if (!currentRoomId) return;
      if (!state.code) {
        hintText.textContent = 'ยังไม่มีรหัส — รอผู้เล่น A สร้างรหัส';
        setTimeout(()=>hintText.textContent = '', 3000);
        return;
      }
      if (inputBuf.length < 4) {
        hintText.textContent = 'กรอกรหัส 4 หลักก่อน';
        setTimeout(()=>hintText.textContent = '', 2000);
        return;
      }
      if (inputBuf === state.code) {
        // update solved
        const roomRef = doc(db, 'rooms', currentRoomId);
        await updateDoc(roomRef, { 'state.solved': true, 'status': 'finished' });
        hintText.textContent = 'ยินดีด้วย! ตู้เซฟถูกเปิดแล้ว 🎉';
      } else {
        hintText.textContent = 'รหัสไม่ถูกต้อง ลองอีกครั้ง';
        setTimeout(()=>hintText.textContent = '', 2000);
      }
      inputBuf = '';
      buffer.textContent = '';
    }
  }

  // ถ้าห้อง finished ให้แสดงสรุปและปุ่มกลับไปลอบบี้
  if (roomData.status === 'finished') {
    const summary = document.createElement('p');
    summary.textContent = 'จบเกม — ปิดด่านแล้ว คุณสามารถกลับไปลอบบี้เพื่อเล่นใหม่';
    gameArea.appendChild(summary);
  }
}

// ฟอร์แมทเวลา
function formatTime(sec){
  sec = Number(sec || 0);
  const m = Math.floor(sec/60).toString().padStart(2,'0');
  const s = (sec%60).toString().padStart(2,'0');
  return `${m}:${s}`;
}

// ======= เมื่อโหลดหน้า: check auth ready
window.addEventListener('beforeunload', async ()=>{
  // Leave room on close
  if (currentRoomId && me) {
    const ref = doc(db, 'rooms', currentRoomId);
    try { await updateDoc(ref, { players: arrayRemove({ uid: me.uid, name: me.name }) }); } catch (e) {}
  }
});