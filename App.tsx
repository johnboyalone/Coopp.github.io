import React, { useState, useCallback, useEffect } from 'react';
import { Theme, GameRoom, Screen, PlayerRole, GameResult } from './types';
import { generatePuzzle } from './services/geminiService';
import { isFirebaseConfigured, createRoom, joinRoom, onRoomUpdate, updateSolutionAttempt } from './services/firebaseService';
import MenuScreen from './components/MenuScreen';
import GameScreen from './components/GameScreen';
import EndScreen from './components/EndScreen';
import LoadingScreen from './components/LoadingScreen';
import LobbyScreen from './components/LobbyScreen';
import { nanoid } from 'https://cdn.jsdelivr.net/npm/nanoid/nanoid.js';

// Generate or retrieve a persistent player ID
const getPlayerId = (): string => {
  let playerId = localStorage.getItem('playerId');
  if (!playerId) {
    playerId = nanoid(10);
    localStorage.setItem('playerId', playerId);
  }
  return playerId;
};

const FirebaseSetupScreen: React.FC = () => (
    <div className="text-center bg-slate-800/50 backdrop-blur-sm p-8 rounded-2xl shadow-2xl border border-slate-700 max-w-lg mx-auto">
      <h1 className="text-3xl font-bold text-amber-400 mb-4">ต้องการการตั้งค่า Firebase</h1>
      <p className="text-slate-300 mb-6">
        แอปพลิเคชันนี้จำเป็นต้องเชื่อมต่อกับ Firebase Realtime Database เพื่อทำงาน โปรดทำตามขั้นตอนในไฟล์ 
        <code className="bg-slate-900 text-sky-300 px-2 py-1 rounded-md text-sm mx-1">firebaseConfig.ts</code> 
        เพื่อตั้งค่าโปรเจกต์ของคุณ
      </p>
      <p className="text-slate-400 text-sm">
        หลังจากตั้งค่าเรียบร้อยแล้ว กรุณารีเฟรชหน้าเว็บนี้อีกครั้ง
      </p>
    </div>
);


const App: React.FC = () => {
  const [screen, setScreen] = useState<Screen>(Screen.Menu);
  const [gameRoom, setGameRoom] = useState<GameRoom | null>(null);
  const [playerRole, setPlayerRole] = useState<PlayerRole | null>(null);
  const [playerId] = useState<string>(getPlayerId());
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!gameRoom || !gameRoom.id) return;

    const unsubscribe = onRoomUpdate(gameRoom.id, (room) => {
      setGameRoom(room);
      if (room.status === 'active' && screen !== Screen.Game) {
        setIsLoading(false);
        setScreen(Screen.Game);
      }
      if (room.status === 'finished' && screen !== Screen.End) {
        setScreen(Screen.End);
      }
    });

    return () => unsubscribe();
  }, [gameRoom?.id, screen]);

  const handleCreateGame = useCallback(async (theme: Theme) => {
    setIsLoading(true);
    setError(null);
    try {
      const newPuzzle = await generatePuzzle(theme);
      const roomId = await createRoom(newPuzzle, playerId, theme);
      setPlayerRole(PlayerRole.A);
      // The listener will set the gameRoom, so we just need to set the screen
      setGameRoom({ id: roomId } as GameRoom); // Set a temporary room object to trigger listener
      setScreen(Screen.Lobby);
    } catch (err) {
      console.error("Failed to create game:", err);
      setError("ไม่สามารถสร้างเกมได้ โปรดลองอีกครั้ง");
      setIsLoading(false);
    }
  }, [playerId]);

  const handleJoinGame = useCallback(async (roomId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const success = await joinRoom(roomId, playerId);
      if(success) {
        setPlayerRole(PlayerRole.B);
        setGameRoom({ id: roomId } as GameRoom); // Set a temporary room object to trigger listener
        // The listener will handle screen transition
      } else {
        throw new Error("Room is full or does not exist.");
      }
    } catch (err) {
      console.error("Failed to join game:", err);
      setError("ไม่สามารถเข้าร่วมห้องได้ อาจเป็นเพราะรหัสผิดหรือห้องเต็มแล้ว");
      setIsLoading(false);
    }
  }, [playerId]);
  
  const handleSolutionAttempt = useCallback((attempt: string) => {
    if (gameRoom?.id) {
        updateSolutionAttempt(gameRoom.id, attempt);
    }
  }, [gameRoom?.id]);

  const handleGameEnd = useCallback((result: GameResult) => {
     // This is now handled by Firebase state changes
  }, []);

  const handlePlayAgain = useCallback(() => {
    setScreen(Screen.Menu);
    setGameRoom(null);
    setPlayerRole(null);
    setError(null);
    setIsLoading(false);
  }, []);
  
  if (!isFirebaseConfigured) {
    return (
       <div className="min-h-screen w-full flex items-center justify-center p-4 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900">
          <FirebaseSetupScreen />
      </div>
    );
  }

  const renderScreen = () => {
    if (isLoading) {
      return <LoadingScreen />;
    }

    switch (screen) {
      case Screen.Menu:
        return <MenuScreen onCreateGame={handleCreateGame} onJoinGame={handleJoinGame} error={error} />;
      case Screen.Lobby:
        return gameRoom && <LobbyScreen roomId={gameRoom.id} />;
      case Screen.Game:
        return gameRoom && gameRoom.puzzle && playerRole && (
          <GameScreen 
            gameRoom={gameRoom} 
            playerRole={playerRole} 
            onGameEnd={handleGameEnd}
            onSolutionChange={handleSolutionAttempt}
          />
        );
      case Screen.End:
        return gameRoom?.result && <EndScreen result={gameRoom.result} onPlayAgain={handlePlayAgain} />;
      default:
        return <MenuScreen onCreateGame={handleCreateGame} onJoinGame={handleJoinGame} error={error} />;
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900">
      <div className="w-full max-w-2xl mx-auto">
        {renderScreen()}
      </div>
    </div>
  );
};

export default App;
