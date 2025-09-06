// main.js
// This file contains the main game logic using Phaser.js.
// It interacts with the NetworkManager to handle multiplayer state.

const networkManager = new NetworkManager();
let phaserGame;
let playerType = null;
let gameId = null;

// Phaser game config
const config = {
    type: Phaser.AUTO,
    scale: {
        mode: Phaser.Scale.FIT,
        parent: 'game-container',
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: 720,
        height: 1280, // Designed for portrait mobile
    },
    scene: {
        preload: preload,
        create: create,
        update: update,
    }
};

let gameScene;
let timerText;
let puzzleText;
let hintObject;
let puzzleObjects = {};

// Puzzle data and assets
const puzzles = [
    { name: 'บ้านผีสิง', id: 0, playerA_asset: 'safe', playerB_asset: 'code_pad' },
    { name: 'ห้องทดลองลับ', id: 1, playerA_asset: 'vials', playerB_asset: 'diagram' },
    { name: 'ปราสาทเวทมนตร์', id: 2, playerA_asset: 'runes', playerB_asset: 'magical_door' }
];

// Preload assets for all puzzles
function preload() {
    this.load.image('background_haunted', 'https://placehold.co/720x1280/1a1a1a/ffffff?text=Haunted+House');
    this.load.image('background_lab', 'https://placehold.co/720x1280/333344/ffffff?text=Secret+Lab');
    this.load.image('background_castle', 'https://placehold.co/720x1280/4a3a6b/ffffff?text=Magic+Castle');

    // General assets
    this.load.image('safe', 'https://placehold.co/200x200/555555/ffffff?text=SAFE');
    this.load.image('code_pad', 'https://placehold.co/200x200/999999/000000?text=CODE+PAD');
    this.load.image('vials', 'https://placehold.co/200x200/80ff80/000000?text=Vials');
    this.load.image('diagram', 'https://placehold.co/200x200/4444ff/ffffff?text=Diagram');
    this.load.image('runes', 'https://placehold.co/200x200/c080ff/ffffff?text=Runes');
    this.load.image('magical_door', 'https://placehold.co/200x200/a0a0ff/ffffff?text=Door');
    this.load.image('lock_icon', 'https://placehold.co/50x50/ff0000/ffffff?text=🔒');
    this.load.image('unlock_icon', 'https://placehold.co/50x50/00ff00/ffffff?text=🔓');
}

function create() {
    gameScene = this;

    // Wait for network to be ready before starting the game
    networkManager.init(() => {
        // Create UI for selecting player type and joining/creating games
        createUI();
    });
}

function createUI() {
    // Clear any previous UI
    gameScene.children.removeAll();

    const titleText = gameScene.add.text(gameScene.scale.width / 2, gameScene.scale.height * 0.2, 'เกมไขปริศนา Co-op', { fontSize: '48px', color: '#fff', align: 'center' }).setOrigin(0.5);

    const playerAButton = gameScene.add.text(gameScene.scale.width / 2, gameScene.scale.height * 0.4, 'เข้าสู่ห้อง A', { fontSize: '32px', color: '#fff', backgroundColor: '#336699', padding: { x: 20, y: 10 } })
        .setOrigin(0.5)
        .setInteractive()
        .on('pointerdown', () => startGame('A'));

    const playerBButton = gameScene.add.text(gameScene.scale.width / 2, gameScene.scale.height * 0.55, 'เข้าสู่ห้อง B', { fontSize: '32px', color: '#fff', backgroundColor: '#993366', padding: { x: 20, y: 10 } })
        .setOrigin(0.5)
        .setInteractive()
        .on('pointerdown', () => startGame('B'));
    
    const gameIdInput = gameScene.add.dom(gameScene.scale.width / 2, gameScene.scale.height * 0.75).createFromHTML('<input type="text" placeholder="รหัสห้อง (ถ้ามี)" style="width: 250px; font-size: 24px; text-align: center; padding: 10px; border-radius: 10px;">');
    
    const joinButton = gameScene.add.text(gameScene.scale.width / 2, gameScene.scale.height * 0.85, 'เข้าร่วมห้อง', { fontSize: '32px', color: '#fff', backgroundColor: '#666666', padding: { x: 20, y: 10 } })
        .setOrigin(0.5)
        .setInteractive()
        .on('pointerdown', async () => {
            const inputVal = gameIdInput.node.value;
            if (inputVal) {
                try {
                    await networkManager.joinGame(inputVal.toUpperCase(), 'B'); // Assumes joiner is always B for simplicity
                    gameId = inputVal.toUpperCase();
                    setupGameScene();
                } catch (e) {
                    gameScene.add.text(gameScene.scale.width / 2, gameScene.scale.height * 0.95, e.message, { fontSize: '20px', color: '#ff0000' }).setOrigin(0.5);
                }
            } else {
                 gameScene.add.text(gameScene.scale.width / 2, gameScene.scale.height * 0.95, 'กรุณาใส่รหัสห้อง', { fontSize: '20px', color: '#ff0000' }).setOrigin(0.5);
            }
        });
}

async function startGame(type) {
    playerType = type;
    gameId = await networkManager.createNewGame(playerType);
    setupGameScene();
}

function setupGameScene() {
    gameScene.children.removeAll();

    // Display Game ID
    gameScene.add.text(gameScene.scale.width / 2, 50, `รหัสห้อง: ${gameId}`, { fontSize: '32px', color: '#fff' }).setOrigin(0.5);

    // Initial background based on puzzle theme
    const puzzleId = networkManager.gameData.players[networkManager.currentUserId].puzzleId;
    const puzzleTheme = puzzles.find(p => p.id === puzzleId);
    gameScene.add.image(gameScene.scale.width / 2, gameScene.scale.height / 2, `background_${puzzleTheme.name.toLowerCase().replace(/ /g, '_')}`).setOrigin(0.5);

    // Initial timer display
    timerText = gameScene.add.text(gameScene.scale.width / 2, 120, 'เวลา: 05:00', { fontSize: '48px', color: '#fff' }).setOrigin(0.5);
    
    // UI for puzzles
    createPuzzles(puzzleTheme);

    // Listen for state changes
    networkManager.listenForGameData(handleGameDataUpdate);
}

function createPuzzles(puzzleTheme) {
    // Player A's puzzle setup
    if (playerType === 'A') {
        const puzzleAsset = puzzleTheme.playerA_asset;
        puzzleObjects.main = gameScene.add.image(gameScene.scale.width / 2, gameScene.scale.height / 2, puzzleAsset)
            .setInteractive()
            .on('pointerdown', () => {
                const code = networkManager.gameData.puzzleState.playerA_code;
                puzzleText = gameScene.add.text(gameScene.scale.width / 2, gameScene.scale.height / 2, `รหัสคือ: ${code}`, { fontSize: '40px', color: '#ff0000' }).setOrigin(0.5);
            });
            
        hintObject = gameScene.add.image(gameScene.scale.width / 2, gameScene.scale.height * 0.75, 'lock_icon')
            .setScale(0.5)
            .setInteractive()
            .on('pointerdown', () => {
                networkManager.updateGameState('puzzleState/playerA_hint_found', true);
            });

    // Player B's puzzle setup
    } else if (playerType === 'B') {
        const puzzleAsset = puzzleTheme.playerB_asset;
        puzzleObjects.main = gameScene.add.image(gameScene.scale.width / 2, gameScene.scale.height / 2, puzzleAsset)
            .setInteractive()
            .on('pointerdown', () => {
                const enteredCode = prompt('กรุณาใส่รหัสที่ได้รับจาก Player A:');
                if (enteredCode && enteredCode === networkManager.gameData.puzzleState.playerA_code) {
                    networkManager.updateGameState('puzzleState/playerB_safe_open', true);
                    gameScene.add.text(gameScene.scale.width / 2, gameScene.scale.height * 0.8, 'ตู้นิรภัยเปิดแล้ว!', { fontSize: '32px', color: '#00ff00' }).setOrigin(0.5);
                } else {
                     gameScene.add.text(gameScene.scale.width / 2, gameScene.scale.height * 0.8, 'รหัสไม่ถูกต้อง!', { fontSize: '32px', color: '#ff0000' }).setOrigin(0.5);
                }
            });

        hintObject = gameScene.add.text(gameScene.scale.width / 2, gameScene.scale.height * 0.75, 'รอคำใบ้จาก Player A...', { fontSize: '28px', color: '#fff' }).setOrigin(0.5);
    }
}

function handleGameDataUpdate(data) {
    if (!data) return;

    // Update timer
    const timeElapsed = (Date.now() - data.startTime) / 1000;
    const timeLeft = Math.max(0, data.timer - timeElapsed);
    const minutes = Math.floor(timeLeft / 60);
    const seconds = Math.floor(timeLeft % 60);
    timerText.setText(`เวลา: ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);

    // Game over condition
    if (timeLeft <= 0) {
        showGameOver(false);
        return;
    }

    // Check for puzzle completion
    if (data.puzzleState.playerA_hint_found && data.puzzleState.playerB_safe_open) {
        showGameOver(true);
    }

    // Update UI based on partner's actions
    if (playerType === 'B' && data.puzzleState.playerA_hint_found) {
        hintObject.setText('Player A ได้พบคำใบ้แล้ว!');
    }
    
    if (playerType === 'A' && data.puzzleState.playerB_safe_open) {
        // Change the hint object to show it's completed
        hintObject.setTexture('unlock_icon');
        // A simple text to confirm completion
        gameScene.add.text(gameScene.scale.width / 2, gameScene.scale.height * 0.85, 'สำเร็จ! ตู้นิรภัยถูกเปิดแล้ว!', { fontSize: '32px', color: '#00ff00' }).setOrigin(0.5);
    }
}

function update(time, delta) {
    // Game loop, primarily for a timer
}

function showGameOver(isWin) {
    gameScene.children.removeAll();
    let message = isWin ? 'ยินดีด้วย! ไขปริศนาสำเร็จ!' : 'หมดเวลา! คุณแพ้!';
    let color = isWin ? '#00ff00' : '#ff0000';
    const score = isWin ? Math.floor(100 + (networkManager.gameData.timer - ((Date.now() - networkManager.gameData.startTime) / 1000))) : 0;

    gameScene.add.text(gameScene.scale.width / 2, gameScene.scale.height * 0.4, message, { fontSize: '48px', color: color }).setOrigin(0.5);
    gameScene.add.text(gameScene.scale.width / 2, gameScene.scale.height * 0.5, `คะแนนสายใยของคุณ: ${score}`, { fontSize: '36px', color: '#fff' }).setOrigin(0.5);
    
    const restartButton = gameScene.add.text(gameScene.scale.width / 2, gameScene.scale.height * 0.7, 'เล่นใหม่', { fontSize: '32px', color: '#fff', backgroundColor: '#666666', padding: { x: 20, y: 10 } })
        .setOrigin(0.5)
        .setInteractive()
        .on('pointerdown', () => {
            phaserGame.destroy(true);
            phaserGame = new Phaser.Game(config);
        });
}

// Initialize the game when the window loads
window.onload = function () {
    phaserGame = new Phaser.Game(config);
};
