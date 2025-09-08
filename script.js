// =================================================================
// Defuse Duo - script.js (STAGE-BASED SPLIT - 1/4)
// Core, Lobby, and Stage 1 Logic
// =================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, onSnapshot, updateDoc, arrayUnion, arrayRemove, serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

/* ==== ใส่ firebaseConfig ของคุณที่นี่ ==== */
const firebaseConfig = {
  apiKey: "AIzaSyDceng5cmITvUqqTuMFSja0y4PSkhFmrmg",
  authDomain: "gemini-co-op-game.firebaseapp.com",
  projectId: "gemini-co-op-game",
  storageBucket: "gemini-co-op-game.firebasestorage.app",
  messagingSenderId: "387010923200",
  appId: "1:387010923200:web:082a20a7b94a59aea9bb25"
};
/* ======================================================= */

// --- Global Variables & UI Refs ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

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

let me = null;
let currentRoomId = null;
let roomUnsubscribe = null;
let localRole = null;
let ownerUid = null;
let countdownInterval = null;
let renderedStage = 0;

// --- Helper & Utility Functions ---
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

function getRandomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function formatTime(sec){
  sec = Number(sec || 0);
  if (sec < 0) sec = 0;
  const m = Math.floor(sec/60).toString().padStart(2,'0');
  const s = (sec%60).toString().padStart(2,'0');
  return `${m}:${s}`;
}

// --- Auth & Lobby Logic ---
function initializeAuth() {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            me = { uid: user.uid, name: (displayNameInput.value || 'ผู้เล่น') };
            console.log('Signed in:', me.uid);
            createRoomBtn.disabled = false;
            joinRoomBtn.disabled = false;
            createRoomBtn.textContent = 'สร้างภารกิจใหม่';
            joinRoomBtn.textContent = 'เข้าร่วมด้วยรหัส';
        } else {
            me = null;
            signInAnonymously(auth).catch((err)=>{
                console.error('Auth error', err);
                alert('ไม่สามารถเชื่อมต่อเพื่อยืนยันตัวตนได้');
            });
        }
    });
}

createRoomBtn.addEventListener('click', async ()=>{
    if (!me) return alert('ยังไม่เชื่อมต่อ Firebase (รอสักครู่แล้วลองใหม่)');
    createRoomBtn.disabled = true;
    createRoomBtn.textContent = 'กำลังสร้าง...';

    try {
        me.name = displayNameInput.value || ('ผู้เล่น-' + me.uid.slice(0,4));
        const roomId = makeRoomId(6);
        const roomRef = doc(db, 'rooms', roomId);

        const puzzle = generateAndValidatePuzzle(roomId);
        if (!puzzle) {
            throw new Error("ไม่สามารถสร้างปริศนาที่สมบูรณ์ได้ กรุณาลองอีกครั้ง");
        }

        const initial = {
            createdAt: serverTimestamp(),
            owner: me.uid,
            players: [{ uid: me.uid, name: me.name }],
            status: 'waiting',
            state: {
                currentStage: 1,
                defused: false,
                timeLeft: 300,
                puzzle: puzzle,
                logicGrid_playerPresses: []
            }
        };
        await setDoc(roomRef, initial);
        enterRoom(roomId);
    } catch (error) {
        console.error("Error creating room:", error);
        alert('เกิดข้อผิดพลาดในการสร้างห้อง: ' + error.message);
        createRoomBtn.disabled = false;
        createRoomBtn.textContent = 'สร้างภารกิจใหม่';
    }
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
  await cleanupRoom();
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

// --- Puzzle Generation (Stage 1 only) ---
function generateStage1Puzzle() {
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
    
    const stage1Rules = shuffleArray([...stage1RuleLibrary])
        .slice(0, 3)
        .map(rule => ({ id: rule.id, description: rule.description, subDescription: rule.subDescription }));
    
    stage1Rules.push({ id: 'S1_DEFAULT', description: "มิเช่นนั้น (ถ้าไม่มีกฎข้อไหนตรงเลย)", subDescription: "→ ให้ตัดสายไฟเส้น <b>แรก</b>" });
    return { wiresOnBomb, rules: stage1Rules };
}

// --- Rendering & Handling (Stage 1 only) ---
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
// =================================================================
// Defuse Duo - script.js (STAGE-BASED SPLIT - 2/4)
// Stage 2 Logic (Generation, Rendering, Handling)
// =================================================================

// --- Puzzle Generation (Stage 2 only) ---
const stage2ConditionLibrary = [
    { id: 'S2_C1', description: 'ค่าพลังงาน A ต้องมากกว่า C (A > C)', check: (a, b, c) => a > c },
    { id: 'S2_C2', description: 'ค่าพลังงาน B ต้องเป็นค่ากลาง (A < B < C หรือ C < B < A)', check: (a, b, c) => (a < b && b < c) || (c < b && b < a) },
    { id: 'S2_C3', description: 'ค่าพลังงานต้องเรียงจากน้อยไปมาก (A < B < C)', check: (a, b, c) => a < b && b < c },
    { id: 'S2_C4', description: 'ค่าพลังงานทั้งหมดต้องเท่ากัน (A = B = C)', check: (a, b, c) => a === b && b === c },
    { id: 'S2_C5', description: 'ผลรวมของ A และ C ต้องเท่ากับ B (A + C = B)', check: (a, b, c) => a + c === b }
];

function generateStage2Puzzle() {
    const condition = getRandomElement(stage2ConditionLibrary);
    
    let attempts = 0;
    while (attempts < 200) { // Try 200 times to find a valid puzzle
        attempts++;
        
        // 1. Generate a potential WINNING state first
        const targetA = 10 * (Math.floor(Math.random() * 8) + 2); // 20-90
        const targetB = 10 * (Math.floor(Math.random() * 8) + 2); // 20-90
        const targetC = 10 * (Math.floor(Math.random() * 8) + 2); // 20-90
        
        // Check if this winning state meets the condition
        if (!condition.check(targetA, targetB, targetC)) {
            continue; // If not, try generating a new winning state
        }
        
        const targetSum = targetA + targetB + targetC;

        // 2. "Walk backwards" to find the INITIAL state
        let initialA = targetA;
        let initialB = targetB;
        let initialC = targetC;
        
        const reverseMoves = [
            (a, b, c) => [a - 10, b - 10, c], // Reverse of +A
            (a, b, c) => [a + 10, b, c + 10], // Reverse of -A
            (a, b, c) => [a, b - 10, c + 10]  // Reverse of +B
        ];
        
        // Apply 1 to 3 reverse moves
        const movesToMake = Math.floor(Math.random() * 3) + 1; 
        for (let i = 0; i < movesToMake; i++) {
            const randomReverseMove = getRandomElement(reverseMoves);
            [initialA, initialB, initialC] = randomReverseMove(initialA, initialB, initialC);
        }

        // 3. Validate the generated initial state
        if (initialA > 0 && initialB > 0 && initialC > 0 && (initialA + initialB + initialC) !== targetSum) {
            // SUCCESS! We found a valid, solvable puzzle.
            return {
                initialA,
                initialB,
                initialC,
                targetSum,
                condition: { id: condition.id, description: condition.description }
            };
        }
    }

    // This part should almost never be reached, but it's a final safety net.
    console.error("CRITICAL: Could not generate a Stage 2 puzzle even with solution-first method. Using emergency fallback.");
    return { 
        initialA: 20, initialB: 50, initialC: 70, 
        targetSum: 160, 
        condition: { id: 'S2_C3', description: 'ค่าพลังงานต้องเรียงจากน้อยไปมาก (A < B < C)' } 
    };
}


// --- Rendering & Handling (Stage 2 only) ---
function renderStage2(roomData) {
    const puzzleState = roomData.state.puzzle.stage2;
    const playerState = roomData.state.powerLevels;

    if (localRole === 'Tech Expert') {
        const info = document.createElement('p');
        info.className = 'muted';
        info.innerHTML = '<b>คู่มือด่าน 2: การปรับเทียบพลังงาน</b><br>สั่งการให้เจ้าหน้าที่ภาคสนามปรับค่าพลังงานให้ตรงตามเป้าหมายและเงื่อนไข';
        
        const manualList = document.createElement('ul');
        manualList.className = 'manual-list';
        manualList.innerHTML = `
            <li>ค่าพลังงานเริ่มต้น: A: ${puzzleState.initialA}, B: ${puzzleState.initialB}, C: ${puzzleState.initialC}</li>
            <li>เป้าหมาย: ทำให้ <b>ผลรวมของ A+B+C</b> เท่ากับ <b>${puzzleState.targetSum}</b></li>
            <li>เงื่อนไขพิเศษที่ต้องทำตาม: <b>${puzzleState.condition.description}</b></li>
            <li style="color: var(--warning);">คำเตือน: หากเจ้าหน้าที่ภาคสนามกดปุ่มรีเซ็ตฉุกเฉิน เวลาจะลดลง 20 วินาที และค่าพลังงานจะกลับไปที่ค่าเริ่มต้น</li>
        `;
        gameArea.append(info, manualList);
    } else { // Field Agent
        const info = document.createElement('p');
        info.className = 'muted';
        info.textContent = 'ปรับเทียบแกนพลังงานตามคำสั่งของผู้เชี่ยวชาญ';
        
        const displayContainer = document.createElement('div');
        displayContainer.className = 'power-display-container';
        displayContainer.innerHTML = `
            <div class="power-display">A<span id="valA">${playerState.a}</span></div>
            <div class="power-display">B<span id="valB">${playerState.b}</span></div>
            <div class="power-display">C<span id="valC">${playerState.c}</span></div>
        `;
        
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'power-button-container';
        buttonContainer.innerHTML = `
            <button id="btnPlusA">+A</button>
            <button id="btnMinusA">-A</button>
            <button id="btnPlusB">+B</button>
            <button id="btnReset" class="btn-warning">RESET</button>
            <button id="btnSet" class="btn-accent">SET</button>
        `;
        
        gameArea.append(info, displayContainer, buttonContainer);
        
        document.getElementById('btnPlusA').onclick = () => handlePowerChange({ a: 10, b: 10, c: 0 });
        document.getElementById('btnMinusA').onclick = () => handlePowerChange({ a: -10, b: 0, c: -10 });
        document.getElementById('btnPlusB').onclick = () => handlePowerChange({ a: 0, b: 10, c: -10 });
        document.getElementById('btnReset').onclick = handlePowerReset;
        document.getElementById('btnSet').onclick = handlePowerSet;
    }
}

async function handlePowerChange(delta) {
    const roomRef = doc(db, 'rooms', currentRoomId);
    const snap = await getDoc(roomRef);
    if (!snap.exists() || snap.data().status !== 'playing') return;
    
    const currentLevels = snap.data().state.powerLevels;
    const newLevels = {
        a: Math.max(0, currentLevels.a + delta.a),
        b: Math.max(0, currentLevels.b + delta.b),
        c: Math.max(0, currentLevels.c + delta.c)
    };
    await updateDoc(roomRef, { 'state.powerLevels': newLevels });
}

async function handlePowerReset() {
    if (!confirm('การรีเซ็ตฉุกเฉินจะทำให้เวลาลดลง 20 วินาที! ยืนยันหรือไม่?')) return;
    
    const roomRef = doc(db, 'rooms', currentRoomId);
    const snap = await getDoc(roomRef);
    if (!snap.exists() || snap.data().status !== 'playing') return;
    
    const state = snap.data().state;
    const puzzle = state.puzzle.stage2;
    const newTime = Math.max(0, state.timeLeft - 20);
    
    await updateDoc(roomRef, {
        'state.timeLeft': newTime,
        'state.powerLevels': { a: puzzle.initialA, b: puzzle.initialB, c: puzzle.initialC }
    });
}

async function handlePowerSet() {
    const roomRef = doc(db, 'rooms', currentRoomId);
    const snap = await getDoc(roomRef);
    if (!snap.exists() || snap.data().status !== 'playing') return;
    
    const state = snap.data().state;
    const puzzle = state.puzzle.stage2;
    const currentLevels = state.powerLevels;
    
    const currentSum = currentLevels.a + currentLevels.b + currentLevels.c;
    const isSumCorrect = (currentSum === puzzle.targetSum);
    const isConditionCorrect = puzzle.condition.check(currentLevels.a, currentLevels.b, currentLevels.c);
    
    if (isSumCorrect && isConditionCorrect) {
        await updateDoc(roomRef, { 'state.currentStage': 3 });
    } else {
        await updateDoc(roomRef, { status: 'finished', 'state.defused': false });
    }
}

// =================================================================
// Defuse Duo - script.js (STAGE-BASED SPLIT - 3/4)
// Stage 3 Logic (Generation, Rendering, Handling)
// =================================================================

// --- Puzzle Generation (Stage 3 only) ---
function generateStage3Puzzle() {
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
    
    // Ensure there are enough unique wrong suspects for clue generation
    if (wrongSuspects.length < 3) {
        // This is a rare edge case, but good to handle.
        // We can just rerun the generation.
        return generateStage3Puzzle();
    }

    const clueTemplates = [
        { gen: (c, w) => `เป้าหมายมีสถานะเป็น "${c.status}".` },
        { gen: (c, w) => `เป้าหมายไม่ได้สังกัดกลุ่ม "${w[0].affiliation}".` },
        { gen: (c, w) => `ถ้าเป้าหมายใช้ไอคอน ${c.icon}, เขาจะชื่อรหัส "${c.codename}".` },
        { gen: (c, w) => `เป้าหมายสังกัดกลุ่ม "${c.affiliation}" หรือไม่ก็กลุ่ม "${w[1].affiliation}".` },
        { gen: (c, w) => `ผู้ต้องสงสัยที่ชื่อรหัส "${w[0].codename}" และเป้าหมายของเรา มีสถานะเดียวกัน.` },
        { gen: (c, w) => `มีผู้ต้องสงสัยเพียง ${allSuspects.filter(s => s.status === w[2].status).length} คนที่มีสถานะเป็น "${w[2].status}".` },
    ];
    
    const stage3Rules = shuffleArray(clueTemplates)
        .slice(0, 5)
        .map(template => ({ description: template.gen(correctSuspect, wrongSuspects) }));
        
    return {
        suspects: shuffleArray(allSuspects),
        rules: stage3Rules,
        correctSuspectId: correctSuspect.id
    };
}

// --- Rendering & Handling (Stage 3 only) ---
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
        // Disable all cards to prevent double-clicking
        document.querySelectorAll('.suspect-card').forEach(c => c.style.pointerEvents = 'none');
        card.classList.add('selected');
        await handleIdentityConfirm(suspect.id);
      };
      
      card.innerHTML = `
        <div class="suspect-icon">${suspect.icon}</div>
        <div class="suspect-details">
          <div class="suspect-codename">${suspect.codename}</div>
          <div class="suspect-info">สถานะ: ${suspect.status}</div>
          <div class="suspect-info">สังกัด: ${suspect.affiliation}</div>
        </div>`;
        
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
// =================================================================
// Defuse Duo - script.js (STAGE-BASED SPLIT - 4/4)
// Stage 4 Logic, Puzzle Assembly, and Game Flow Control
// =================================================================

// --- Puzzle Generation (Stage 4 only) ---
function generateStage4Puzzle() {
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
    
    return { flashSequence, colorMap, modifier: { id: selectedModifier.id, description: selectedModifier.description } };
}

// --- Puzzle Assembly ---
function generateAndValidatePuzzle() {
    let attempts = 0;
    while (attempts < 10) {
        try {
            const stage1 = generateStage1Puzzle();
            const stage2 = generateStage2Puzzle();
            const stage3 = generateStage3Puzzle();
            const stage4 = generateStage4Puzzle();
            
            // If all stages generate successfully, return the complete puzzle object
            if (stage1 && stage2 && stage3 && stage4) {
                return { stage1, stage2, stage3, stage4 };
            }
        } catch (e) {
            console.warn("A stage failed to generate, retrying...", e.message);
        }
        attempts++;
    }
    console.error("Failed to generate a valid puzzle after multiple attempts.");
    return null; // Return null if it fails repeatedly
}

// --- Rendering & Handling (Stage 4 only) ---
function renderStage4(roomData) {
    const puzzleState = roomData.state.puzzle.stage4;
    if (localRole === 'Tech Expert') {
        const info = document.createElement('p');
        info.className = 'muted';
        info.innerHTML = '<b>คู่มือด่าน 4: ตารางรหัสสี</b><br>บอกเจ้าหน้าที่ภาคสนามให้กดสีตามตารางนี้';
        
        const grid = document.createElement('div');
        grid.className = 'manual-grid';
        Object.entries(puzzleState.colorMap).forEach(([key, value]) => {
            grid.innerHTML += `<div><span class="color-box ${key}">${key.charAt(0).toUpperCase()}</span> → <span class="color-box ${value}">${value.charAt(0).toUpperCase()}</span></div>`;
        });
        
        const modifierInfo = document.createElement('p');
        modifierInfo.className = 'manual-list';
        modifierInfo.innerHTML = `<b>${puzzleState.modifier.description}</b>`;
        
        gameArea.append(info, grid, modifierInfo);
    } else { // Field Agent
        const info = document.createElement('p');
        info.className = 'muted';
        info.textContent = 'รอสัญญาณไฟกระพริบ แล้วรายงานให้ผู้เชี่ยวชาญทราบ!';
        
        const gridContainer = document.createElement('div');
        gridContainer.className = 'logic-grid-container';
        const buttons = {};
        ['red', 'blue', 'green', 'yellow'].forEach(color => {
            const btn = document.createElement('button');
            btn.className = `logic-btn ${color}`;
            btn.dataset.color = color;
            btn.disabled = true;
            btn.onclick = () => handleLogicGridPress(color);
            gridContainer.appendChild(btn);
            buttons[color] = btn;
        });
        
        gameArea.append(info, gridContainer);
        
        // Start flashing sequence
        setTimeout(() => {
            let i = 0;
            const interval = setInterval(() => {
                if (i >= puzzleState.flashSequence.length) {
                    clearInterval(interval);
                    Object.values(buttons).forEach(b => b.disabled = false);
                    info.textContent = 'กดปุ่มตามลำดับที่ถูกต้อง!';
                    return;
                }
                const colorToFlash = puzzleState.flashSequence[i];
                buttons[colorToFlash].classList.add('flash');
                setTimeout(() => buttons[colorToFlash].classList.remove('flash'), 400);
                i++;
            }, 800);
        }, 1000);
    }
}

async function handleLogicGridPress(pressedColor) {
    const roomRef = doc(db, 'rooms', currentRoomId);
    const snap = await getDoc(roomRef);
    if (!snap.exists() || snap.data().status !== 'playing') return;
    
    const state = snap.data().state;
    const puzzle = state.puzzle.stage4;
    const playerPresses = state.logicGrid_playerPresses || [];
    const newPresses = [...playerPresses, pressedColor];
    
    // Calculate the correct solution sequence based on the modifier
    let solutionSequence = puzzle.flashSequence.map(color => puzzle.colorMap[color]);
    const modifierId = puzzle.modifier.id;
    if (modifierId === 'S4_M1') { solutionSequence.reverse(); }
    if (modifierId === 'S4_M2' && solutionSequence.length >= 4) { [solutionSequence[1], solutionSequence[3]] = [solutionSequence[3], solutionSequence[1]]; }
    if (modifierId === 'S4_M3') { solutionSequence.push(solutionSequence[solutionSequence.length - 1]); }
    if (modifierId === 'S4_M4' && solutionSequence.length >= 3) { solutionSequence.splice(2, 1); }

    // Check if the latest press is correct
    if (newPresses[newPresses.length - 1] !== solutionSequence[newPresses.length - 1]) {
        await handleLogicGridMistake();
        return;
    }
    
    // Check for win condition
    if (newPresses.length === solutionSequence.length) {
        await updateDoc(roomRef, { status: 'finished', 'state.defused': true });
    } else {
        await updateDoc(roomRef, { 'state.logicGrid_playerPresses': newPresses });
    }
}

async function handleLogicGridMistake() {
    const roomRef = doc(db, 'rooms', currentRoomId);
    const snap = await getDoc(roomRef);
    if (!snap.exists() || snap.data().status !== 'playing') return;
    
    const state = snap.data().state;
    const newTime = Math.max(0, state.timeLeft - 45);
    const newFlashSequence = Array(5).fill(0).map(() => ['red', 'blue', 'green', 'yellow'][Math.floor(Math.random() * 4)]);
    
    await updateDoc(roomRef, {
        'state.timeLeft': newTime,
        'state.logicGrid_playerPresses': [],
        'state.puzzle.stage4.flashSequence': newFlashSequence
    });
    renderedStage = 0; // Force re-render
}

// --- Main Game Flow Control ---
async function enterRoom(roomId){
  currentRoomId = roomId;
  const ref = doc(db, 'rooms', roomId);

  roomUnsubscribe = onSnapshot(ref, (snap)=>{
    if (!snap.exists()){
      alert('ห้องถูกลบหรือไม่พบห้องอีกต่อไป');
      cleanupAndShowLobby();
      return;
    }
    const data = snap.data();
    renderRoomInfo(roomId, data);
    
    const myPlayerIndex = data.players.findIndex(p => p.uid === me.uid);
    localRole = (myPlayerIndex === 0) ? 'Tech Expert' : 'Field Agent';
    ownerUid = data.owner;

    if (data.status === 'playing' || data.status === 'finished') {
      showGame(data);
    } else {
      showLobbyRoomView();
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
    const role = (p.uid === data.players[0]?.uid) ? 'Tech Expert' : 'Field Agent';
    li.textContent = `${p.name} (${role})` + (p.uid === data.owner ? ' (เจ้าของห้อง)' : '');
    playersList.appendChild(li);
  });
  if (me && me.uid === data.owner && (data.players || []).length >= 2) {
    startGameBtn.classList.remove('hidden');
    ownerHint.textContent = 'คุณเป็นเจ้าของห้อง — กด "เริ่มเกม" เมื่อพร้อม';
  } else {
    startGameBtn.classList.add('hidden');
    ownerHint.textContent = (data.players.length < 2) ? 'รอผู้เล่นอีกคน...' : 'รอเจ้าของห้องเริ่มเกม...';
  }
}

function showLobbyRoomView(){
  mainLobby.classList.remove('hidden');
  roomInfo.classList.remove('hidden');
  sectionGame.classList.add('hidden');
  joinArea.classList.add('hidden');
}

function showLobby(){
  mainLobby.classList.remove('hidden');
  roomInfo.classList.add('hidden');
  startGameBtn.classList.add('hidden');
  sectionGame.classList.add('hidden');
  createRoomBtn.disabled = false;
  createRoomBtn.textContent = 'สร้างภารกิจใหม่';
}

function cleanupAndShowLobby() {
    if (roomUnsubscribe) { roomUnsubscribe(); roomUnsubscribe = null; }
    clearInterval(countdownInterval);
    countdownInterval = null;
    currentRoomId = null;
    localRole = null;
    ownerUid = null;
    renderedStage = 0;
    showLobby();
}

async function cleanupRoom(){
  if (!currentRoomId) return;
  const ref = doc(db, 'rooms', currentRoomId);
  try { await updateDoc(ref, { players: arrayRemove({ uid: me.uid, name: me.name }) }); } catch (e) {}
  cleanupAndShowLobby();
}

function startTimer(roomData) {
    if (me.uid === roomData.owner && roomData.status === 'playing' && !countdownInterval) {
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
                await updateDoc(roomRef, { status: 'finished', 'state.defused': false, 'state.timeLeft': 0 });
            } else {
                await updateDoc(roomRef, { 'state.timeLeft': newTime });
            }
        }, 1000);
    }
}

function updateTimer(seconds) {
    timerText.textContent = 'เวลา: ' + formatTime(seconds);
}

function showGame(roomData) {
  mainLobby.classList.add('hidden');
  sectionGame.classList.remove('hidden');
  roleTitle.textContent = `บทบาท: ${localRole}`;
  updateTimer(roomData.state.timeLeft);
  startTimer(roomData);

  if (roomData.status === 'finished') {
    renderGameFinished(roomData);
    return;
  }
  // Force re-render if stage changes OR if it's a mistake reset in stage 4
  if (renderedStage !== roomData.state.currentStage) {
    renderedStage = roomData.state.currentStage;
    renderCurrentStage(roomData);
  }
}

function renderGameFinished(roomData) {
    gameArea.innerHTML = '';
    const title = document.createElement('h2');
    const subTitle = document.createElement('p');
    subTitle.className = 'muted';
    if (roomData.state.defused) {
        title.textContent = '✅ ภารกิจสำเร็จ! ✅';
        title.style.color = 'var(--accent)';
        subTitle.textContent = `ทำได้ดีมากเจ้าหน้าที่! คุณกู้ระเบิดได้สำเร็จโดยเหลือเวลา ${formatTime(roomData.state.timeLeft)}`;
    } else {
        title.textContent = '💥 ภารกิจล้มเหลว! 💥';
        title.style.color = 'var(--danger)';
        subTitle.textContent = roomData.state.timeLeft > 0 ? 'คุณทำพลาดในขั้นตอนการกู้ระเบิด' : 'เวลาหมด! ระเบิดทำงานแล้ว';
    }
    gameArea.append(title, subTitle);
    document.querySelectorAll('#game button').forEach(b => b.disabled = true);
    backToLobbyBtn.disabled = false;
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

// --- Initial Load ---
window.addEventListener('load', initializeAuth);
window.addEventListener('beforeunload', async ()=>{
  if (currentRoomId && me) {
    await cleanupRoom();
  }
});
