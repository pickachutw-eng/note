// Firebase Realtime Database 設定：請將你的 Firebase 專案設定貼入這裡。
// 預設讀取路徑為 /cards；若你的資料庫路徑不同，可修改 FIREBASE_CARDS_PATH。
export const FIREBASE_CONFIG = window.FIREBASE_CONFIG || {
  apiKey: "AIzaSyAWBPlP6kJdZsZ2fiOZuycYnTcNY2Xasys",
  authDomain: "notes-97961.firebaseapp.com",
  databaseURL: "https://notes-97961-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "notes-97961",
  storageBucket: "notes-97961.firebasestorage.app",
  messagingSenderId: "953339062268",
  appId: "1:953339062268:web:d5c3f1ce74a814098f7479",
};

export const FIREBASE_CARDS_PATH = window.FIREBASE_CARDS_PATH || 'cards';
