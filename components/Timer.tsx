import React, { useState, useEffect } from 'react';
import { GAME_DURATION_SECONDS } from './constants';

interface TimerProps {
  startTime: number;
}

const Timer: React.FC<TimerProps> = ({ startTime }) => {
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION_SECONDS);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const elapsed = (Date.now() - startTime) / 1000;
      return Math.max(0, Math.ceil(GAME_DURATION_SECONDS - elapsed));
    };

    setTimeLeft(calculateTimeLeft());

    const intervalId = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(intervalId);
  }, [startTime]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  const timeColor = timeLeft < 60 ? 'text-red-500' : 'text-slate-200';

  return (
    <div className={`text-center bg-slate-900/50 p-3 rounded-lg border border-slate-700 min-w-[100px] ${timeLeft < 60 && timeLeft > 0 ? 'animate-pulse' : ''}`}>
      <div className={`text-3xl font-mono font-bold ${timeColor}`}>
        {`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`}
      </div>
      <div className="text-xs text-slate-400 tracking-wider">เวลาที่เหลือ</div>
    </div>
  );
};

export default Timer;