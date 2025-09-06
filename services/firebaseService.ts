import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, get, onValue, update, runTransaction, Unsubscribe } from 'firebase/database';
import { firebaseConfig } from '../../firebaseConfig';
import { Puzzle, GameRoom, PlayerRole, Theme, GameResult } from '../types';
import { GAME_DURATION_SECONDS } from '../components/constants';

let app;
let db;

export let isFirebaseConfigured = false;

try {
  if (
    firebaseConfig &&
    firebaseConfig.apiKey &&
    !firebaseConfig.apiKey.includes("AIzaSyDceng5cmITvUqqTuMFSja0y4PSkhFmrmg") && // Placeholder check
    firebaseConfig.projectId &&
    !firebaseConfig.projectId.includes("gemini-co-op-game") // Placeholder check
  ) {
    app = initializeApp(firebaseConfig);
    db = getDatabase(app);
    isFirebaseConfigured = true;
  }
} catch (error) {
    console.error("Firebase initialization error:", error);
}

const generateRoomId = (): string => {
  let id = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  for (let i = 0; i < 4; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
};

export const createRoom = async (puzzle: Puzzle, hostPlayerId: string, theme: Theme): Promise<string> => {
  if (!isFirebaseConfigured) throw new Error("Firebase is not configured.");
  const roomId = generateRoomId();
  const roomRef = ref(db, `rooms/${roomId}`);

  const newRoom: GameRoom = {
    id: roomId,
    status: 'waiting',
    theme,
    puzzle,
    players: {
      [PlayerRole.A]: { playerId: hostPlayerId },
    },
    startTime: null,
    solutionAttempt: '',
    result: null,
  };

  await set(roomRef, newRoom);
  return roomId;
};

export const joinRoom = async (roomId: string, joiningPlayerId: string): Promise<boolean> => {
  if (!isFirebaseConfigured) throw new Error("Firebase is not configured.");
  const roomRef = ref(db, `rooms/${roomId}`);

  try {
    const result = await runTransaction(roomRef, (currentRoom: GameRoom | null) => {
      if (!currentRoom) {
        return; 
      }
      if (currentRoom.status !== 'waiting' || currentRoom.players.B) {
        return;
      }
      if (currentRoom.players.A?.playerId === joiningPlayerId) {
        return currentRoom;
      }

      currentRoom.players.B = { playerId: joiningPlayerId };
      currentRoom.status = 'active';
      currentRoom.startTime = Date.now();
      return currentRoom;
    });

    return result.committed && !!result.snapshot.val()?.players.B;
  } catch (error) {
    console.error("Failed to join room transaction:", error);
    return false;
  }
};

const endGameOnTimeout = async (roomId: string): Promise<void> => {
    if (!isFirebaseConfigured) return;
    const roomRef = ref(db, `rooms/${roomId}`);
    try {
        await runTransaction(roomRef, (currentRoom: GameRoom | null) => {
            if (currentRoom && currentRoom.status === 'active') {
                currentRoom.status = 'finished';
                currentRoom.result = { win: false, timeRemaining: 0, bondScore: 0 };
            }
            return currentRoom;
        });
    } catch(e) {
        console.error("Failed to end game on timeout", e);
    }
};

export const onRoomUpdate = (roomId: string, callback: (room: GameRoom | null) => void): Unsubscribe => {
  if (!isFirebaseConfigured) return () => {};
  const roomRef = ref(db, `rooms/${roomId}`);
  return onValue(roomRef, (snapshot) => {
    if (snapshot.exists()) {
      const roomData = snapshot.val() as GameRoom;
      
      if (roomData.status === 'active' && roomData.startTime) {
        const elapsed = (Date.now() - roomData.startTime) / 1000;
        if (elapsed > GAME_DURATION_SECONDS + 2) { // Add 2s buffer
          endGameOnTimeout(roomId);
        }
      }
      callback(roomData);
    } else {
      callback(null);
    }
  });
};

export const updateSolutionAttempt = async (roomId: string, attempt: string): Promise<void> => {
    if (!isFirebaseConfigured) return;
    const roomRef = ref(db, `rooms/${roomId}`);

    const snapshot = await get(roomRef);
    if (!snapshot.exists()) return;

    const room: GameRoom = snapshot.val();
    if (room.status !== 'active' || attempt.length > 4) return;

    await update(roomRef, { solutionAttempt: attempt });

    if (attempt === room.puzzle.solution) {
        const endTime = Date.now();
        const timeElapsed = (endTime - (room.startTime ?? endTime)) / 1000;
        const timeRemaining = Math.max(0, Math.floor(GAME_DURATION_SECONDS - timeElapsed));
        const bondScore = Math.floor((timeRemaining / GAME_DURATION_SECONDS) * 100) + 10;

        const result: GameResult = { win: true, timeRemaining, bondScore };

        await update(roomRef, {
            status: 'finished',
            result: result,
        });
    }
};
