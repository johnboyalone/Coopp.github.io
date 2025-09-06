import React from 'react';
import { GameResult } from '../types';

interface EndScreenProps {
  result: GameResult;
  onPlayAgain: () => void;
}

const EndScreen: React.FC<EndScreenProps> = ({ result, onPlayAgain }) => {
  const minutes = Math.floor(result.timeRemaining / 60);
  const seconds = result.timeRemaining % 60;

  return (
    <div className="text-center bg-slate-800/50 backdrop-blur-sm p-8 rounded-2xl shadow-2xl border border-slate-700 animate-fade-in">
      {result.win ? (
        <>
          <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-cyan-400 mb-4">
            ไขปริศนาสำเร็จ!
          </h1>
          <p className="text-slate-300 text-lg mb-2">ทีมเวิร์คของคุณสุดยอดไปเลย!</p>
          <div className="my-8">
            <p className="text-slate-400 text-sm">เวลาที่เหลือ</p>
            <p className="text-4xl font-bold text-white">{`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`}</p>
          </div>
          <div className="my-8">
            <p className="text-slate-400 text-sm">คะแนนสายใย</p>
            <p className="text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500">{result.bondScore}</p>
          </div>
        </>
      ) : (
        <>
          <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500 mb-4">
            หมดเวลา!
          </h1>
          <p className="text-slate-300 text-lg">ครั้งนี้คุณพ่ายแพ้ให้กับปริศนา</p>
        </>
      )}
      <button
        onClick={onPlayAgain}
        className="mt-6 bg-sky-600 hover:bg-sky-700 text-white font-bold py-3 px-8 rounded-lg transition-colors duration-300 text-lg transform hover:scale-105"
      >
        เล่นอีกครั้ง
      </button>
    </div>
  );
};

export default EndScreen;
