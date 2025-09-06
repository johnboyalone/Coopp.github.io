import React from 'react';

const LoadingScreen: React.FC = () => {
  return (
    <div className="text-center bg-slate-800/50 backdrop-blur-sm p-8 rounded-2xl shadow-2xl border border-slate-700">
      <div className="flex justify-center items-center mb-6">
        <svg className="animate-spin h-12 w-12 text-sky-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
      <h2 className="text-3xl font-bold text-slate-200 mb-2">กำลังสร้างการผจญภัยของคุณ...</h2>
      <p className="text-slate-400">AI กำลังสร้างความท้าทายที่ไม่เหมือนใครสำหรับคุณและคู่หูของคุณ</p>
    </div>
  );
};

export default LoadingScreen;
