// network.js
// This file handles all Firebase Realtime Database interactions.
// It is a separate module to keep the game logic clean.

class NetworkManager {
    constructor() {
        this.app = null;
        this.database = null;
        this.auth = null;
        this.gameRef = null;
        this.gameData = null;
        this.onGameDataUpdated = null;
        this.currentUserId = null;
    }

    async init(callback) {
        if (!firebase.apps.length) {
            this.app = firebase.initializeApp(firebaseConfig);
        } else {
            this.app = firebase.app();
        }
        
        this.auth = firebase.auth();
        this.database = firebase.database();

        try {
            if (initialAuthToken) {
                await this.auth.signInWithCustomToken(initialAuthToken);
            } else {
                await this.auth.signInAnonymously();
            }
        } catch (error) {
            console.error("Firebase Auth Error:", error);
        }

        this.auth.onAuthStateChanged(user => {
            if (user) {
                this.currentUserId = user.uid;
                callback(); // Callback to start the game after auth is ready
            } else {
                this.currentUserId = null;
            }
        });
    }

    // Creates a new game room and sets initial state.
    async createNewGame(playerType) {
        const gameId = this.generateGameId();
        this.gameRef = this.database.ref(`artifacts/${appId}/public/data/games/${gameId}`);
        const initialPuzzleId = Math.floor(Math.random() * 3); // Random puzzle theme

        const initialData = {
            players: {
                [this.currentUserId]: {
                    type: playerType,
                    status: 'online',
                    puzzleId: initialPuzzleId,
                }
            },
            puzzleState: {
                // Example puzzle state for demonstration
                // Player A sees the code, Player B sees the safe
                playerA_code: Math.floor(1000 + Math.random() * 9000).toString(),
                playerB_safe_open: false,
                // And vice versa
                playerB_symbol_code: ['circle', 'triangle', 'square'][Math.floor(Math.random() * 3)],
                playerA_hint_found: false
            },
            timer: 300, // 5 minutes in seconds
            startTime: firebase.database.ServerValue.TIMESTAMP,
            status: 'waiting',
            lastUpdated: firebase.database.ServerValue.TIMESTAMP,
        };

        await this.gameRef.set(initialData);
        return gameId;
    }

    // Joins an existing game room.
    async joinGame(gameId, playerType) {
        this.gameRef = this.database.ref(`artifacts/${appId}/public/data/games/${gameId}`);
        const snapshot = await this.gameRef.get();
        if (!snapshot.exists()) {
            throw new Error('Game room not found.');
        }

        const gameData = snapshot.val();
        if (Object.keys(gameData.players).length >= 2) {
            throw new Error('Game room is full.');
        }

        const updates = {};
        updates[`players/${this.currentUserId}`] = {
            type: playerType,
            status: 'online',
            puzzleId: Object.values(gameData.players)[0].puzzleId // Sync puzzle theme
        };
        updates.status = 'playing';
        updates.lastUpdated = firebase.database.ServerValue.TIMESTAMP;
        
        await this.gameRef.update(updates);
    }

    // Sets up a real-time listener for game data changes.
    listenForGameData(callback) {
        if (this.gameRef) {
            this.onGameDataUpdated = callback;
            this.gameRef.on('value', snapshot => {
                this.gameData = snapshot.val();
                if (this.onGameDataUpdated) {
                    this.onGameDataUpdated(this.gameData);
                }
            });
        }
    }

    // Updates a specific part of the game state.
    updateGameState(path, value) {
        if (this.gameRef) {
            const updates = {};
            updates[path] = value;
            updates.lastUpdated = firebase.database.ServerValue.TIMESTAMP;
            this.gameRef.update(updates);
        }
    }
    
    // Generates a simple, unique game ID.
    generateGameId() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
}
