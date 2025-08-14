// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCARXD0ZyOfgyrvsY9KiVXs4VwloiumiHE",
  authDomain: "furtagph-cf3d3.firebaseapp.com",
  projectId: "furtagph-cf3d3",
  storageBucket: "furtagph-cf3d3.appspot.com",
  messagingSenderId: "639123411408",
  appId: "1:639123411408:web:737d4aa4a54b414dcda9d5",
  measurementId: "G-GHPYPB8XW8"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
