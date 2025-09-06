import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, get, onValue, update, runTransaction, Unsubscribe } from 'firebase/database';
import { firebaseConfig } from '../firebaseConfig';
import { Puzzle, GameRoom, PlayerRole, Theme, GameResult } from '../types';
import { GAME_DURATION_SECONDS } from '../components/constants';

// Initialize Firebase
let app;
let db;
try {
  app = initializeApp(firebaseConfig);
  db = getDatabase(app);
} catch (error) {
    console.error("Firebase initialization error:", error);
}

// Check if the firebase config is valid
export const isFirebaseConfigured =
  firebaseConfig &&
  firebaseConfig.apiKey &&
  !firebaseConfig.apiKey.includes("YOUR_API_KEY") &&
  firebaseConfig.projectId &&
  !firebaseConfig.projectId.includes("YOUR_PROJECT_ID");

// Generate a unique 4-char uppercase room ID
const generateRoomId = (): string => {
  let id = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  for (let i = 0; i < 4; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
};

// Create a new game room in Firebase
export const createRoom = async (puzzle: Puzzle, hostPlayerId: string, theme: Theme): Promise<string> => {
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

// Join an existing game room
export const joinRoom = async (roomId: string, joiningPlayerId: string): Promise<boolean> => {
  const roomRef = ref(db, `rooms/${roomId}`);

  try {
    const result = await runTransaction(roomRef, (currentRoom: GameRoom | null) => {
      if (!currentRoom) {
        // Room does not exist
        return; // Abort transaction
      }
      if (currentRoom.status !== 'waiting') {
        // Game already started or finished
        return; // Abort transaction
      }
      if (currentRoom.players.B) {
        // Room is full
        return; // Abort transaction
      }
      if (currentRoom.players.A?.playerId === joiningPlayerId) {
        // Player is already in the room
        return currentRoom; // Don't abort, just do nothing
      }

      // Add player B and start the game
      currentRoom.players.B = { playerId: joiningPlayerId };
      currentRoom.status = 'active';
      currentRoom.startTime = Date.now();
      return currentRoom;
    });

    return result.committed && !!result.snapshot.val().players.B;
  } catch (error) {
    console.error("Failed to join room transaction:", error);
    return false;
  }
};

// Function to handle game timeout
export const endGameOnTimeout = async (roomId: string): Promise<void> => {
    const roomRef = ref(db, `rooms/${roomId}`);

    try {
        await runTransaction(roomRef, (currentRoom: GameRoom | null) => {
            if (currentRoom && currentRoom.status === 'active') {
                const result: GameResult = {
                    win: false,
                    timeRemaining: 0,
                    bondScore: 0,
                };
                currentRoom.status = 'finished';
                currentRoom.result = result;
            }
            return currentRoom;
        });
    } catch(e) {
        console.error("Failed to end game on timeout", e);
    }
};

// Listen for updates to a game room
export const onRoomUpdate = (roomId: string, callback: (room: GameRoom) => void): Unsubscribe => {
  const roomRef = ref(db, `rooms/${roomId}`);
  return onValue(roomRef, (snapshot) => {
    if (snapshot.exists()) {
      const roomData = snapshot.val() as GameRoom;
      
      // Handle automatic timeout
      if (roomData.status === 'active' && roomData.startTime) {
        const elapsed = (Date.now() - roomData.startTime) / 1000;
        if (elapsed > GAME_DURATION_SECONDS) {
          endGameOnTimeout(roomId);
        }
      }

      callback(roomData);
    }
  });
};

// Update the solution attempt and check if it's correct
export const updateSolutionAttempt = async (roomId: string, attempt: string): Promise<void> => {
    const roomRef = ref(db, `rooms/${roomId}`);

    const snapshot = await get(roomRef);
    if (!snapshot.exists()) return;

    const room: GameRoom = snapshot.val();
    if (room.status !== 'active') return;

    // Update the attempt value
    await update(roomRef, { solutionAttempt: attempt });

    // Check if the solution is correct
    if (attempt === room.puzzle.solution) {
        // Solution is correct, end the game as a win
        const endTime = Date.now();
        const timeElapsed = (endTime - (room.startTime ?? endTime)) / 1000;
        const timeRemaining = Math.max(0, Math.floor(GAME_DURATION_SECONDS - timeElapsed));
        
        // Simple bond score calculation
        const bondScore = Math.floor((timeRemaining / GAME_DURATION_SECONDS) * 100) + 10; // Bonus points for winning

        const result: GameResult = {
            win: true,
            timeRemaining,
            bondScore,
        };

        await update(roomRef, {
            status: 'finished',
            result: result,
        });
    }
};
