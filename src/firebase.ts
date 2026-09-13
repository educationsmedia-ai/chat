import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
  type User
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  setDoc,
  updateDoc,
  addDoc,
  serverTimestamp,
  type Unsubscribe
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import type { Room, ChatMessage, RoomParticipant } from './types';

// 1. Initialize Firebase App and Database
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// 2. Strict Error Handling conforming to FirestoreErrorInfo
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const currentUser = auth.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid ?? null,
      email: currentUser?.email ?? null,
      emailVerified: currentUser?.emailVerified ?? null,
      isAnonymous: currentUser?.isAnonymous ?? null,
      tenantId: currentUser?.tenantId ?? null,
      providerInfo: currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// 3. Connection Test on App Boot (as mandated by Skill)
export async function testConnection(): Promise<boolean> {
  try {
    if (auth.currentUser) {
      await getDocFromServer(doc(db, 'test', 'connection'));
    }
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase client is offline. Periksa koneksi internet Anda.');
      return false;
    }
    return true;
  }
}

// 4. Authentication Helpers
export function getOrCreateSessionUser(preferredName?: string): { uid: string; name: string; email?: string; avatar?: string } {
  if (auth.currentUser) {
    return {
      uid: auth.currentUser.uid,
      name: preferredName?.trim() || auth.currentUser.displayName || 'Pengguna',
      email: auth.currentUser.email || '',
      avatar: auth.currentUser.photoURL || '',
    };
  }

  let sessionUid = localStorage.getItem('livechat_session_uid');
  if (!sessionUid) {
    sessionUid = 'user_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    localStorage.setItem('livechat_session_uid', sessionUid);
  }

  const savedName = localStorage.getItem('livechat_username') || preferredName?.trim() || 'Pengguna';
  return {
    uid: sessionUid,
    name: preferredName?.trim() || savedName,
    email: '',
    avatar: '',
  };
}

export async function loginWithGoogle(): Promise<User> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (err: any) {
    console.error('Login error:', err);
    if (err?.code === 'auth/unauthorized-domain') {
      throw new Error(
        'Domain preview belum terdaftar di Authorized Domains Firebase Console. Anda tetap dapat menggunakan Mode Instan (langsung ketik nama dan buat/gabung room tanpa login Google).'
      );
    }
    if (err?.code === 'auth/popup-blocked') {
      throw new Error(
        'Jendela pop-up Google diblokir oleh browser / iframe. Silakan izinkan pop-up atau gunakan Mode Instan tanpa login.'
      );
    }
    if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') {
      throw new Error('Proses login Google dibatalkan.');
    }
    throw new Error(err?.message || 'Gagal login dengan Google.');
  }
}

export async function logoutUser(): Promise<void> {
  await fbSignOut(auth);
}

// 5. Room Management Functions

/**
 * Generate a short, friendly room code (e.g., 'ABC123')
 */
export function generateRoomCode(): string {
  const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

/**
 * Create a new 2-user room with User 1 as creator
 */
export async function createRoomInFirestore(
  code: string,
  roomName: string,
  creator: { uid: string; name: string; email?: string; avatar?: string }
): Promise<string> {
  const formattedCode = code.trim().toUpperCase();
  const roomPath = `rooms/${formattedCode}`;

  const user1Data: RoomParticipant = {
    uid: creator.uid,
    name: creator.name.trim() || 'Pengguna 1',
    email: creator.email || '',
    avatar: creator.avatar || '',
    joinedAt: new Date().toISOString(),
  };

  const newRoomData = {
    code: formattedCode,
    name: roomName.trim() || `Ruang ${formattedCode}`,
    status: 'waiting',
    createdAt: serverTimestamp(),
    createdBy: creator.uid,
    user1: user1Data,
    user2: null,
    user1Online: true,
    user2Online: false,
    user1Typing: false,
    user2Typing: false,
  };

  try {
    const roomRef = doc(db, 'rooms', formattedCode);
    await setDoc(roomRef, newRoomData);
    return formattedCode;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, roomPath);
  }
}

/**
 * Fetch a room document by code
 */
export async function getRoomByCode(code: string): Promise<Room | null> {
  const formattedCode = code.trim().toUpperCase();
  const roomPath = `rooms/${formattedCode}`;
  try {
    const roomRef = doc(db, 'rooms', formattedCode);
    const snap = await getDoc(roomRef);
    if (!snap.exists()) {
      return null;
    }
    return { id: snap.id, ...snap.data() } as Room;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, roomPath);
  }
}

/**
 * Join an existing room as User 2 (enforcing max 2 users limit)
 */
export async function joinRoomInFirestore(
  code: string,
  user: { uid: string; name: string; email?: string; avatar?: string }
): Promise<{ success: boolean; message?: string; room?: Room }> {
  const formattedCode = code.trim().toUpperCase();
  const roomPath = `rooms/${formattedCode}`;

  const room = await getRoomByCode(formattedCode);
  if (!room) {
    return { success: false, message: 'Kode room tidak ditemukan. Silakan periksa kembali kode Anda.' };
  }

  if (room.status === 'closed') {
    return { success: false, message: 'Room ini sudah ditutup atau tidak aktif lagi.' };
  }

  // If already user 1, simply return success (re-joining own room)
  if (room.user1.uid === user.uid) {
    await updateDoc(doc(db, 'rooms', formattedCode), {
      user1Online: true,
    }).catch(err => handleFirestoreError(err, OperationType.UPDATE, roomPath));
    return { success: true, room };
  }

  // If already user 2, simply return success (re-joining)
  if (room.user2 && room.user2.uid === user.uid) {
    await updateDoc(doc(db, 'rooms', formattedCode), {
      user2Online: true,
    }).catch(err => handleFirestoreError(err, OperationType.UPDATE, roomPath));
    return { success: true, room };
  }

  // If room already has user 2 and it is someone else: LIMIT 2 USERS EXCEEDED!
  if (room.user2 && room.user2.uid !== user.uid) {
    return {
      success: false,
      message: 'Room sudah penuh. Maksimal 2 pengguna.',
    };
  }

  // Room is waiting for user 2: Join!
  const user2Data: RoomParticipant = {
    uid: user.uid,
    name: user.name.trim() || 'Pengguna 2',
    email: user.email || '',
    avatar: user.avatar || '',
    joinedAt: new Date().toISOString(),
  };

  try {
    const roomRef = doc(db, 'rooms', formattedCode);
    await updateDoc(roomRef, {
      user2: user2Data,
      status: 'active',
      user2Online: true,
      user2Typing: false,
    });
    return { success: true, room: { ...room, user2: user2Data, status: 'active', user2Online: true } };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, roomPath);
  }
}

/**
 * Subscribe to real-time updates for a room document
 */
export function subscribeToRoom(
  roomId: string,
  onUpdate: (room: Room | null) => void,
  onError: (error: Error) => void
): Unsubscribe {
  const roomPath = `rooms/${roomId}`;
  const roomRef = doc(db, 'rooms', roomId);

  return onSnapshot(
    roomRef,
    (snap) => {
      if (snap.exists()) {
        onUpdate({ id: snap.id, ...snap.data() } as Room);
      } else {
        onUpdate(null);
      }
    },
    (error) => {
      onError(error);
      handleFirestoreError(error, OperationType.GET, roomPath);
    }
  );
}

/**
 * Subscribe to real-time chat messages
 */
export function subscribeToMessages(
  roomId: string,
  onUpdate: (messages: ChatMessage[]) => void,
  onError: (error: Error) => void
): Unsubscribe {
  const messagesPath = `rooms/${roomId}/messages`;
  const messagesRef = collection(db, 'rooms', roomId, 'messages');
  const q = query(messagesRef, orderBy('timestamp', 'asc'), limit(500));

  return onSnapshot(
    q,
    (snapshot) => {
      const messages: ChatMessage[] = [];
      snapshot.forEach((docSnap) => {
        messages.push({
          id: docSnap.id,
          ...docSnap.data(),
        } as ChatMessage);
      });
      onUpdate(messages);
    },
    (error) => {
      onError(error);
      handleFirestoreError(error, OperationType.LIST, messagesPath);
    }
  );
}

/**
 * Send a chat message
 */
export async function sendChatMessage(
  roomId: string,
  sender: { uid: string; name: string },
  text: string,
  imageUrl?: string
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed && !imageUrl) {
    throw new Error('Pesan atau foto tidak boleh kosong');
  }
  if (trimmed.length > 2000) {
    throw new Error('Panjang pesan melebihi batas 2000 karakter');
  }

  const messagesPath = `rooms/${roomId}/messages`;
  try {
    const messagesRef = collection(db, 'rooms', roomId, 'messages');
    const payload: any = {
      senderId: sender.uid,
      senderName: sender.name,
      text: trimmed,
      timestamp: serverTimestamp(),
      read: false,
    };
    if (imageUrl) {
      payload.imageUrl = imageUrl;
    }
    await addDoc(messagesRef, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, messagesPath);
  }
}

/**
 * WebRTC Video Call Signaling Configuration & Helpers
 */
export const rtcIceServers: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
};

export async function createCallSession(
  roomId: string,
  caller: { uid: string; name: string },
  receiverId: string,
  offerSdp: any
): Promise<string> {
  const callId = 'call_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const callRef = doc(db, 'rooms', roomId, 'calls', callId);
  await setDoc(callRef, {
    callerId: caller.uid,
    callerName: caller.name,
    receiverId,
    status: 'ringing',
    offer: offerSdp,
  });
  return callId;
}

export function listenToCallSession(
  roomId: string,
  callId: string,
  onUpdate: (call: any) => void
): Unsubscribe {
  const callRef = doc(db, 'rooms', roomId, 'calls', callId);
  return onSnapshot(callRef, (snapshot) => {
    if (snapshot.exists()) {
      onUpdate({ id: snapshot.id, ...snapshot.data() });
    } else {
      onUpdate(null);
    }
  });
}

export function listenToIncomingCalls(
  roomId: string,
  currentUserId: string,
  onCall: (call: any | null) => void
): Unsubscribe {
  const callsRef = collection(db, 'rooms', roomId, 'calls');
  const q = query(
    callsRef,
    where('receiverId', '==', currentUserId),
    where('status', '==', 'ringing'),
    limit(1)
  );
  return onSnapshot(q, (snapshot) => {
    if (!snapshot.empty) {
      const docSnap = snapshot.docs[0];
      onCall({ id: docSnap.id, ...docSnap.data() });
    } else {
      onCall(null);
    }
  });
}

export async function answerCallSession(
  roomId: string,
  callId: string,
  answerSdp: any
): Promise<void> {
  const callRef = doc(db, 'rooms', roomId, 'calls', callId);
  await updateDoc(callRef, {
    status: 'accepted',
    answer: answerSdp,
  });
}

export async function updateCallStatus(
  roomId: string,
  callId: string,
  status: 'rejected' | 'ended' | 'busy'
): Promise<void> {
  const callRef = doc(db, 'rooms', roomId, 'calls', callId);
  await updateDoc(callRef, {
    status,
  }).catch((err) => console.warn('Update call status error:', err));
}

export async function addIceCandidate(
  roomId: string,
  callId: string,
  role: 'caller' | 'receiver',
  candidate: RTCIceCandidate
): Promise<void> {
  const candCollection = collection(db, 'rooms', roomId, 'calls', callId, `${role}Candidates`);
  await addDoc(candCollection, candidate.toJSON());
}

export function listenToIceCandidates(
  roomId: string,
  callId: string,
  remoteRole: 'caller' | 'receiver',
  onCandidate: (candidateInit: RTCIceCandidateInit) => void
): Unsubscribe {
  const candCollection = collection(db, 'rooms', roomId, 'calls', callId, `${remoteRole}Candidates`);
  return onSnapshot(candCollection, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const data = change.doc.data();
        onCandidate(data as RTCIceCandidateInit);
      }
    });
  });
}

/**
 * Mark unread messages sent by the counterpart as read (✓✓ Dibaca)
 */
export async function markMessagesAsRead(
  roomId: string,
  currentUserId: string,
  messages: ChatMessage[]
): Promise<void> {
  const unreadFromOther = messages.filter(
    (m) => !m.read && m.senderId !== currentUserId
  );

  for (const msg of unreadFromOther) {
    const msgPath = `rooms/${roomId}/messages/${msg.id}`;
    try {
      const msgRef = doc(db, 'rooms', roomId, 'messages', msg.id);
      await updateDoc(msgRef, { read: true });
    } catch (error) {
      console.warn('Could not mark message as read:', error);
    }
  }
}

/**
 * Update typing status
 */
export async function setTypingStatus(
  roomId: string,
  slot: 'user1' | 'user2',
  isTyping: boolean
): Promise<void> {
  const roomPath = `rooms/${roomId}`;
  const key = slot === 'user1' ? 'user1Typing' : 'user2Typing';
  try {
    const roomRef = doc(db, 'rooms', roomId);
    await updateDoc(roomRef, {
      [key]: isTyping,
    });
  } catch (error) {
    // Non-fatal typing update error
    console.debug('Typing update suppressed:', error);
  }
}

/**
 * Update online presence status
 */
export async function setPresenceStatus(
  roomId: string,
  slot: 'user1' | 'user2',
  isOnline: boolean
): Promise<void> {
  const roomPath = `rooms/${roomId}`;
  const key = slot === 'user1' ? 'user1Online' : 'user2Online';
  try {
    const roomRef = doc(db, 'rooms', roomId);
    await updateDoc(roomRef, {
      [key]: isOnline,
    });
  } catch (error) {
    console.warn('Presence update error:', error);
  }
}

/**
 * Close or leave room
 */
export async function closeRoomInFirestore(roomId: string): Promise<void> {
  const roomPath = `rooms/${roomId}`;
  try {
    const roomRef = doc(db, 'rooms', roomId);
    await updateDoc(roomRef, {
      status: 'closed',
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, roomPath);
  }
}
