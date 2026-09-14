/**
 * Live Chat Multiplayer / Real-Time
 * Cloud Firestore + Firebase Auth
 * Mode Instan: Siapa saja yang membuka aplikasi otomatis terhubung ke Ruang Obrolan Bersama
 */

import React, { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, testConnection, getOrCreateSessionUser, getOrCreateGlobalRoom, getRoomByCode } from './firebase';
import { Lobby } from './components/Lobby';
import { ChatRoom } from './components/ChatRoom';
import { GuideModal } from './components/GuideModal';
import type { LocalUserProfile, Room } from './types';

export default function App() {
  const [currentUser, setCurrentUser] = useState<LocalUserProfile | null>(null);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [userSlot, setUserSlot] = useState<'user1' | 'user2' | null>(null);
  const [showGuide, setShowGuide] = useState<boolean>(false);
  const [initialCode, setInitialCode] = useState<string>('');
  const [isAutoConnecting, setIsAutoConnecting] = useState<boolean>(false);
  const [autoConnectError, setAutoConnectError] = useState<string | null>(null);

  // 1. Check URL search parameters for shared room codes (?room=ABC123)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room') || params.get('code');
    if (roomParam) {
      setInitialCode(roomParam.toUpperCase());
    }
  }, []);

  // 2. Test Firestore connection on app mount & track Auth state
  useEffect(() => {
    testConnection();

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        const profile: LocalUserProfile = {
          uid: user.uid,
          name: user.displayName || localStorage.getItem('livechat_username') || 'Pengguna',
          email: user.email || '',
          photoURL: user.photoURL || '',
        };
        setCurrentUser(profile);
      } else {
        setCurrentUser(null);
      }
    });

    return () => unsubscribe();
  }, []);

  // 3. Auto-join logic if user requested instant entry or has visited before
  const handleInstantAutoJoin = async (preferredName?: string) => {
    setIsAutoConnecting(true);
    setAutoConnectError(null);
    try {
      const user = getOrCreateSessionUser(preferredName);
      if (preferredName) {
        localStorage.setItem('livechat_username', preferredName);
      }

      // If URL contains a specific room code, join that room automatically
      const params = new URLSearchParams(window.location.search);
      const specificCode = params.get('room') || params.get('code') || initialCode;

      let targetRoom: Room;
      if (specificCode && specificCode.trim().length >= 4) {
        const found = await getRoomByCode(specificCode.trim().toUpperCase());
        if (found) {
          targetRoom = found;
        } else {
          targetRoom = await getOrCreateGlobalRoom(user);
        }
      } else {
        // Automatically join the Global Public Room
        targetRoom = await getOrCreateGlobalRoom(user);
      }

      const slot =
        targetRoom.createdBy === user.uid || targetRoom.user1?.uid === user.uid
          ? 'user1'
          : 'user2';

      setActiveRoom(targetRoom);
      setUserSlot(slot);

      // Update URL query string
      const newUrl = `${window.location.pathname}?room=${targetRoom.code}`;
      window.history.replaceState({ path: newUrl }, '', newUrl);
    } catch (err: unknown) {
      console.error('Auto join failed:', err);
      const msg = err instanceof Error ? err.message : 'Gagal menyambung otomatis ke room chat.';
      setAutoConnectError(msg);
    } finally {
      setIsAutoConnecting(false);
    }
  };

  // 4. Enter Room Handler (Manual or code based)
  const handleEnterRoom = (room: Room, slot: 'user1' | 'user2') => {
    setActiveRoom(room);
    setUserSlot(slot);

    // Update URL query string without reloading
    const newUrl = `${window.location.pathname}?room=${room.code}`;
    window.history.replaceState({ path: newUrl }, '', newUrl);
  };

  // 5. Leave Room Handler
  const handleLeaveRoom = () => {
    setActiveRoom(null);
    setUserSlot(null);

    // Clear room query from URL
    window.history.replaceState({}, '', window.location.pathname);
  };

  return (
    <div className="w-full min-h-screen bg-neutral-950 text-neutral-100 font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      {!activeRoom || !userSlot ? (
        <Lobby
          currentUser={currentUser}
          onEnterRoom={handleEnterRoom}
          onInstantJoin={handleInstantAutoJoin}
          isAutoConnecting={isAutoConnecting}
          autoConnectError={autoConnectError}
          onOpenGuide={() => setShowGuide(true)}
          initialCode={initialCode}
        />
      ) : (
        <ChatRoom
          initialRoom={activeRoom}
          userSlot={userSlot}
          currentUserId={
            currentUser?.uid ||
            (userSlot === 'user1' ? activeRoom.user1.uid : activeRoom.user2?.uid) ||
            localStorage.getItem('livechat_session_uid') ||
            ''
          }
          currentUserName={
            currentUser?.name ||
            (userSlot === 'user1' ? activeRoom.user1.name : activeRoom.user2?.name) ||
            localStorage.getItem('livechat_username') ||
            'Pengguna'
          }
          onLeaveRoom={handleLeaveRoom}
        />
      )}

      {/* Interactive Guide & Architecture Documentation Modal */}
      <GuideModal
        isOpen={showGuide}
        onClose={() => setShowGuide(false)}
      />
    </div>
  );
}
