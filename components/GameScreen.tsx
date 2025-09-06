import React from 'react';
import { GameRoom, PlayerRole, GameResult } from '../types';
import { THEME_DETAILS } from './constants';
import Timer from './Timer';

interface GameScreenProps {
  gameRoom: GameRoom;
  playerRole: PlayerRole;
  onGameEnd: (result: GameResult) => void; // This might be deprecated as logic is in firebaseService
  onSolutionChange: (attempt: string) => void;
}

const PlayerView: React.FC<{ playerData: GameRoom['puzzle']['playerA'] }> = ({ playerData }) => (
  <div className="space-y-4">
    <div>
      <h3 className="text-lg font-semibold text-sky-400">เป้าหมายของคุณ</h3>
      <p className="text-slate-300">{playerData.objective}</p>
    </div>
    <div>
      <h3 className="text-lg font-semibold text-sky-400">คำใบ้ของคุณ</h3>
      <ul className="list-disc list-inside space-y-1 text-slate-300">
        {playerData.clues.map((clue, index) => <li key={index}>{clue}</li>)}
      </ul>
    </div>
    <div>
      <h3 className="text-lg font-semibold text-sky-400">วัตถุที่โต้ตอบได้</h3>
      <div className="flex flex-wrap gap-2 mt-2">
        {playerData.interactiveElements.map((item, index) => (
          <div key={index} className="bg-slate-700/50 text-slate-300 px-3 py-1 rounded-full text-sm">{item}</div>
        ))}
      </div>
    </div>
  </div>
);

const GameScreen: React.FC<GameScreenProps> = ({ gameRoom, playerRole, onSolutionChange }) => {
  const { puzzle, startTime, solutionAttempt } = gameRoom;
  const themeDetails = THEME_DETAILS[puzzle.theme];

  const playerData = playerRole === PlayerRole.A ? puzzle.playerA : puzzle.playerB;

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm p-6 md:p-8 rounded-2xl shadow-2xl border border-slate-700 w-full max-w-2xl animate-fade-in">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h1 className={`text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r ${themeDetails.color}`}>{puzzle.theme}</h1>
          <p className="text-slate-400 mt-2 max-w-prose">{puzzle.story}</p>
        </div>
        {startTime && <Timer startTime={startTime} />}
      </div>

      <div className="my-6">
        <div className="text-center p-2 bg-slate-900 rounded-lg w-fit mx-auto text-sky-300 font-semibold">
           มุมมองผู้เล่น {playerRole}
        </div>
      </div>
      
      <div className="bg-slate-900/70 p-6 rounded-lg border border-slate-700 min-h-[250px]">
        <PlayerView playerData={playerData} />
      </div>
      
      <div className="mt-6 text-center">
        <label htmlFor="solution" className="block text-sm font-medium text-slate-300 mb-2">ป้อนรหัส 4 หลัก:</label>
        <input
          id="solution"
          type="text"
          value={solutionAttempt}
          onChange={(e) => onSolutionChange(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
          maxLength={4}
          className="w-48 text-center text-3xl font-mono tracking-widest bg-slate-900 border border-slate-600 rounded-lg p-2 focus:ring-2 focus:ring-sky-500 focus:outline-none"
          placeholder="----"
          // Disable input for Player A for better UX, assuming Player B always inputs the code
          disabled={playerRole === PlayerRole.A}
        />
         {playerRole === PlayerRole.A && <p className="text-xs text-slate-500 mt-2">ผู้เล่น B เป็นคนป้อนรหัส</p>}
      </div>
    </div>
  );
};

export default GameScreen;