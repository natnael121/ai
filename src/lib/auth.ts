import { onAuthStateChanged, signInAnonymously, type User } from "firebase/auth";
import { auth } from "../firebase";

let readyPromise: Promise<User> | null = null;

// Anonymous auth only — enough to satisfy firestore.rules' isSignedIn()
// checks so uploads/reads aren't blocked. Swap for a real sign-in flow
// (see README "Stubbed") before external collaborators need a researcher
// identity that persists across devices/sessions.
export function ensureSignedIn(): Promise<User> {
  if (!readyPromise) {
    readyPromise = new Promise((resolve, reject) => {
      const unsubscribe = onAuthStateChanged(
        auth,
        (user) => {
          if (user) {
            unsubscribe();
            resolve(user);
          } else {
            signInAnonymously(auth).catch(reject);
          }
        },
        reject
      );
    });
  }
  return readyPromise;
}
