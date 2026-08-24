// Firebase Web Configuration for BVIT Lecture Check Admin Portal
const firebaseConfig = {
  apiKey: "AIzaSyCyQL89J9ArVoVJH7FiU51Tn_KNIh87ORE",
  authDomain: "attendance-66f11.firebaseapp.com",
  projectId: "attendance-66f11",
  storageBucket: "attendance-66f11.firebasestorage.app",
  messagingSenderId: "1041295884103",
  appId: "1:1041295884103:web:lecturecheck"
};

// Initialize Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();

// Enable IndexedDB offline persistence and multi-tab caching to minimize Firestore reads/writes
try {
  db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn("Firestore caching active (single tab mode)");
    } else if (err.code === 'unimplemented') {
      console.warn("Firestore caching not supported in this browser");
    }
  });
} catch (e) {
  console.warn("Firestore persistence notice:", e);
}
