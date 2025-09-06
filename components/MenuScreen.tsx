import React, { useState } from 'react';
import { Theme } from '../types';
import { THEME_DETAILS } from './constants';

interface MenuScreenProps {
  onCreateGame: (theme: Theme) => void;
  onJoinGame: (roomId: string) => void;
  error: string | null;
}

const MenuScreen: React.FC<MenuScreenProps> = ({ onCreateGame, onJoinGame, error }) => {
  const [roomIdInput, setRoomIdInput] = useState('');

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomIdInput.trim()) {
      onJoinGame(roomIdInput.trim().toUpperCase());
    }
  };

  return (
    <div className="text-center bg-slate-800/50 backdrop-blur-sm p-8 rounded-2xl shadow-2xl border border-slate-700">
      <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-fuchsia-500 mb-2">
        เกมไขปริศนา Gemini
      </h1>
      <p className="text-slate-300 mb-8 max-w-md mx-auto">
        สื่อสารกับคู่หูของคุณผ่านออนไลน์เพื่อไขปริศนาสุดท้าทายก่อนที่เวลาจะหมด
      </p>

      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-300 p-3 rounded-lg mb-6">
          <p className="font-semibold">เกิดข้อผิดพลาด</p>
          <p>{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        {/* Create Game Section */}
        <div className="flex flex-col gap-4">
            <h2 className="text-2xl font-semibold text-slate-200">สร้างเกมใหม่</h2>
            <p className="text-slate-400 text-sm -mt-2">เลือกธีมและชวนเพื่อนของคุณ</p>
            {(Object.keys(THEME_DETAILS) as Theme[]).map((theme) => {
                const details = THEME_DETAILS[theme];
                return (
                    <button
                        key={theme}
                        onClick={() => onCreateGame(theme)}
                        className={`group w-full relative overflow-hidden text-left p-4 rounded-xl bg-slate-800 border border-slate-700 hover:border-sky-500 transition-all duration-300 transform hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-slate-900`}
                    >
                        <div className={`absolute top-0 right-0 -mt-4 -mr-4 w-16 h-16 rounded-full bg-gradient-to-br ${details.color} opacity-20 group-hover:opacity-30 transition-opacity duration-300`}></div>
                        <div className="relative flex items-center gap-4">
                            <div className={`p-2 rounded-full inline-block bg-gradient-to-br ${details.color} text-white`}>
                                {React.cloneElement(details.icon, {className: "w-6 h-6"})}
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white">{theme}</h3>
                                <p className="text-xs text-slate-400">{details.description}</p>
                            </div>
                        </div>
                    </button>
                );
            })}
        </div>
        
        {/* Join Game Section */}
        <div className="flex flex-col gap-4">
          <h2 className="text-2xl font-semibold text-slate-200">เข้าร่วมเกม</h2>
           <p className="text-slate-400 text-sm -mt-2">ใส่รหัสห้องที่เพื่อนของคุณส่งมา</p>
          <form onSubmit={handleJoinSubmit} className="flex flex-col gap-4">
            <input
              type="text"
              value={roomIdInput}
              onChange={(e) => setRoomIdInput(e.target.value)}
              maxLength={4}
              className="w-full text-center text-2xl font-mono tracking-widest bg-slate-900 border border-slate-600 rounded-lg p-3 focus:ring-2 focus:ring-sky-500 focus:outline-none placeholder:text-slate-500"
              placeholder="รหัสห้อง"
            />
            <button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-lg transition-colors duration-300 text-lg transform hover:scale-105 disabled:bg-slate-700 disabled:scale-100 disabled:cursor-not-allowed"
              disabled={!roomIdInput.trim()}
            >
              เข้าร่วม
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default MenuScreen;