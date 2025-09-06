// Firebase configuration provided by the user.
// This file is now correctly placed at the root level.
export const firebaseConfig = {
  apiKey: "AIzaSyDceng5cmITvUqqTuMFSja0y4PSkhFmrmg",
  authDomain: "gemini-co-op-game.firebaseapp.com",
  databaseURL: "https://gemini-co-op-game-default-rtdb.firebaseio.com", // Added databaseURL for v8 compatibility if needed, but primarily for config check
  projectId: "gemini-co-op-game",
  storageBucket: "gemini-co-op-game.firebasestorage.app",
  messagingSenderId: "387010923200",
  appId: "1:387010923200:web:082a20a7b94a59aea9bb25"
};

// ** สิ่งสำคัญ **
// อย่าลืมตั้งค่า Rules ใน Firebase Realtime Database ของคุณเพื่อให้สามารถอ่านและเขียนได้
// สำหรับการทดสอบเบื้องต้นคุณสามารถใช้กฎเหล่านี้ (ซึ่งไม่ปลอดภัยสำหรับการใช้งานจริง):
// {
//   "rules": {
//     ".read": true,
//     ".write": true
//   }
// }
