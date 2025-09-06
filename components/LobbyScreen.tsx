import React, { useState } from 'react';

interface LobbyScreenProps {
  roomId: string;
}

const LobbyScreen: React.FC<LobbyScreenProps> = ({ roomId }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="text-center bg-slate-800/50 backdrop-blur-sm p-8 rounded-2xl shadow-2xl border border-slate-700 animate-fade-in">
      <h2 className="text-3xl font-bold text-slate-200 mb-4">สร้างห้องสำเร็จ!</h2>
      <p className="text-slate-300 mb-6">ส่งรหัสนี้ให้เพื่อนของคุณเพื่อเริ่มเกม:</p>
      
      <div className="bg-slate-900/70 border border-slate-700 rounded-lg p-4 flex items-center justify-center gap-4 mb-6">
        <span className="text-5xl font-mono tracking-widest text-sky-400">{roomId}</span>
        <button onClick={handleCopy} className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors" title="คัดลอกรหัส">
          {copied ? (
            <svg xmlns="http://www.w.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-green-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          ) : (
            <svg xmlns="http://www.w.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-slate-300">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v3.042m-7.332 0c.055.194.084.4.084.612v3.042m0 0a2.25 2.25 0 002.25 2.25h3a2.25 2.25 0 002.25-2.25m-7.5 0h7.5m-7.5 0a2.25 2.25 0 01-2.25-2.25v-3c0-1.03.693-1.9 1.638-2.166m12.5 0c.945.266 1.638.936 1.638 2.166v3a2.25 2.25 0 01-2.25 2.25h-3a2.25 2.25 0 01-2.25-2.25m-7.5 0h7.5" />
            </svg>
          )}
        </button>
      </div>

      <div className="flex items-center justify-center gap-3 text-slate-400">
        <svg className="animate-spin h-5 w-5 text-slate-500" xmlns="http://www.w.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span>กำลังรอผู้เล่นคนที่สอง...</span>
      </div>
    </div>
  );
};

export default LobbyScreen;