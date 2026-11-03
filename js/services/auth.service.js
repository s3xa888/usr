/**
 * تسجيل الدخول والخروج وإنشاء حساب المالك لأول مرة.
 */
import {
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
  updatePassword, reauthenticateWithCredential, EmailAuthProvider, get, set,
} from '../core/sdk.js';
import { auth, dbRef, usernameToEmail } from '../core/firebase.js';
import { USERNAME_RE, MIN_PASSWORD } from './errors.js';

export const onAuth = (cb) => onAuthStateChanged(auth, cb);

export async function login(username, password) {
  return signInWithEmailAndPassword(auth, usernameToEmail(username), password);
}

export const logout = () => signOut(auth);

/** هل تم إنشاء حساب المالك مسبقاً؟ */
export async function ownerExists() {
  const snap = await get(dbRef('meta', 'ownerUid'));
  return snap.exists();
}

export const getOwnerUid = async () => (await get(dbRef('meta', 'ownerUid'))).val();

/**
 * إنشاء حساب المالك (يُسمح مرة واحدة فقط — قواعد الأمان تمنع تكراره).
 */
let creatingOwner = false;
export const isCreatingOwner = () => creatingOwner;

export async function createOwner({ username, password, displayName }) {
  const u = username.trim().toLowerCase();
  if (!USERNAME_RE.test(u)) throw { code: 'auth/invalid-email' };
  if (password.length < MIN_PASSWORD) throw { code: 'auth/weak-password' };
  creatingOwner = true;
  try {
  const cred = await createUserWithEmailAndPassword(auth, usernameToEmail(u), password);
  const uid = cred.user.uid;
  try {
    await set(dbRef('meta', 'ownerUid'), uid);
  } catch (err) {
    // سبقنا شخص آخر — نحذف الحساب الذي أنشأناه للتو
    await cred.user.delete().catch(() => {});
    throw err;
  }
  await ensureOwnerProfile(uid, u, displayName);
  return uid;
  } finally { creatingOwner = false; }
}

export async function ensureOwnerProfile(uid, username, displayName) {
  await set(dbRef('users', uid), {
    username,
    displayName: displayName || username,
    role: 'owner',
    active: true,
    permissions: { add: true, pay: true },
    createdAt: Date.now(),
  });
}

export async function changeOwnPassword(currentPassword, newPassword) {
  if (newPassword.length < MIN_PASSWORD) throw { code: 'auth/weak-password' };
  const user = auth.currentUser;
  const cred = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, cred);
  await updatePassword(user, newPassword);
}
