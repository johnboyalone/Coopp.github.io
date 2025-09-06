import React from 'react';
import { Theme } from '../types';

// Game duration in seconds (e.g., 5 minutes)
export const GAME_DURATION_SECONDS = 5 * 60;

// Icons for themes
const HauntedHouseIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
);

const SecretLabIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h18M7.5 3L12 7.5m0 0L16.5 3M12 7.5V21" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l-3.83-3.83a2.25 2.25 0 013.182-3.182l3.83 3.83m-3.182 3.182a2.25 2.25 0 003.182 3.182l3.83-3.83a2.25 2.25 0 00-3.182-3.182l-3.83 3.83z" />
    </svg>
);

const MagicCastleIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />
    </svg>
);

// Theme details for UI display
export const THEME_DETAILS: { [key in Theme]: { description: string; color: string; icon: JSX.Element; } } = {
  [Theme.HauntedHouse]: {
    description: "ไขปริศนาสยองขวัญก่อนที่วิญญาณจะมาเอาตัวไป",
    color: "from-purple-500 to-indigo-600",
    icon: <HauntedHouseIcon />,
  },
  [Theme.SecretLab]: {
    description: "หยุดการทดลองที่ผิดพลาดก่อนที่มันจะแพร่กระจาย",
    color: "from-green-500 to-cyan-600",
    icon: <SecretLabIcon />,
  },
  [Theme.MagicCastle]: {
    description: "ถอนคำสาปของพ่อมดชั่วร้ายก่อนที่ปราสาทจะล่มสลาย",
    color: "from-amber-500 to-red-600",
    icon: <MagicCastleIcon />,
  },
};
