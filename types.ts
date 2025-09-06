export enum Theme {
  HauntedHouse = 'บ้านผีสิง',
  SecretLab = 'ห้องทดลองลับ',
  MagicCastle = 'ปราสาทเวทมนตร์',
}

export enum PlayerRole {
  A = 'A',
  B = 'B',
}

export enum Screen {
  Menu = 'MENU',
  Lobby = 'LOBBY',
  Loading = 'LOADING',
  Game = 'GAME',
  End = 'END',
}

export interface PlayerData {
  objective: string;
  clues: string[];
  interactiveElements: string[];
}

export interface Puzzle {
  theme: Theme;
  story: string;
  solution: string;
  playerA: PlayerData;
  playerB: PlayerData;
}

export interface GameResult {
  win: boolean;
  timeRemaining: number;
  bondScore: number;
}

export type GameStatus = 'waiting' | 'active' | 'finished';

export interface GameRoom {
  id: string;
  status: GameStatus;
  theme: Theme;
  puzzle: Puzzle;
  players: {
    [key in PlayerRole]?: {
      playerId: string;
    }
  };
  startTime: number | null;
  solutionAttempt: string;
  result: GameResult | null;
}