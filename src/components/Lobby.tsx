import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  PlusCircle,
  LogIn,
  RefreshCw,
  Copy,
  Check,
  HelpCircle,
  Sparkles,
  AlertCircle,
  Users,
  ShieldCheck,
  Radio,
  ArrowRight,
} from 'lucide-react';
import {
  auth,
  loginWithGoogle,
  logoutUser,
  generateRoomCode,
  createRoomInFirestore,
  joinRoomInFirestore,
} from '../firebase';
import type { LocalUserProfile, Room } from '../types';

interface LobbyProps {
  currentUser: LocalUserProfile | null;
  onEnterRoom: (room: Room, userSlot: 'user1' | 'user2') => void;
  onOpenGuide: () => void;
  initialCode?: string;
}

export const Lobby: React.FC<LobbyProps> = ({
  currentUser,
  onEnterRoom,
  onOpenGuide,
  initialCode = '',
}) => {
  const [userName, setUserName] = useState<string>(
    currentUser?.name || localStorage.getItem('livechat_username') || ''
  );
  const [roomName, setRoomName] = useState<string>('');
  const [generatedCode, setGeneratedCode] = useState<string>(generateRoomCode());
  const [inputCode, setInputCode] = useState<string>(initialCode);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'create' | 'join'>('create');
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);

  // Sync username when currentUser updates
  useEffect(() => {
    if (currentUser?.name && !userName) {
      setUserName(currentUser.name);
    }
  }, [currentUser]);

  // Persist username in local storage
  const handleNameChange = (val: string) => {
    setUserName(val);
    localStorage.setItem('livechat_username', val);
    if (errorMsg && errorMsg.includes('nama')) {
      setErrorMsg(null);
    }
  };

  const handleRefreshCode = () => {
    const code = generateRoomCode();
    setGeneratedCode(code);
    setCopiedCode(false);
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(generatedCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // ignore clipboard error
    }
  };

  // Ensure user is signed in with Google (mandatory for Firestore security rules)
  const ensureAuthenticated = async () => {
    if (auth.currentUser) {
      return auth.currentUser;
    }
    setIsAuthenticating(true);
    try {
      const user = await loginWithGoogle();
      if (!userName) {
        setUserName(user.displayName || 'Pengguna');
        localStorage.setItem('livechat_username', user.displayName || 'Pengguna');
      }
      return user;
    } catch (err) {
      console.error('Authentication cancelled or failed:', err);
      throw new Error('Diperlukan otentikasi Google untuk mengakses database Firebase secara aman.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  // 1. Buat Room
  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmedName = userName.trim();
    if (!trimmedName) {
      setErrorMsg('Harap masukkan nama pengguna Anda sebelum membuat room.');
      return;
    }

    try {
      setIsLoading(true);
      const user = await ensureAuthenticated();

      const createdCode = await createRoomInFirestore(
        generatedCode,
        roomName.trim() || `Ruang ${generatedCode}`,
        {
          uid: user.uid,
          name: trimmedName,
          email: user.email || '',
          avatar: user.photoURL || '',
        }
      );

      const newRoom: Room = {
        id: createdCode,
        code: createdCode,
        name: roomName.trim() || `Ruang ${createdCode}`,
        status: 'waiting',
        createdAt: new Date(),
        createdBy: user.uid,
        user1: {
          uid: user.uid,
          name: trimmedName,
          email: user.email || '',
          avatar: user.photoURL || '',
        },
        user2: null,
        user1Online: true,
        user2Online: false,
      };

      onEnterRoom(newRoom, 'user1');
    } catch (err: unknown) {
      console.error('Failed to create room:', err);
      const message = err instanceof Error ? err.message : 'Gagal membuat room. Periksa koneksi internet Anda.';
      setErrorMsg(message);
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Gabung Room
  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmedName = userName.trim();
    if (!trimmedName) {
      setErrorMsg('Harap masukkan nama pengguna Anda sebelum bergabung.');
      return;
    }

    const cleanCode = inputCode.trim().toUpperCase();
    if (!cleanCode) {
      setErrorMsg('Harap masukkan Kode Room yang valid.');
      return;
    }

    if (cleanCode.length < 4 || cleanCode.length > 10) {
      setErrorMsg('Kode Room tidak valid (harus 4-10 karakter alfanumerik).');
      return;
    }

    try {
      setIsLoading(true);
      const user = await ensureAuthenticated();

      const result = await joinRoomInFirestore(cleanCode, {
        uid: user.uid,
        name: trimmedName,
        email: user.email || '',
        avatar: user.photoURL || '',
      });

      if (!result.success || !result.room) {
        setErrorMsg(result.message || 'Gagal bergabung ke room.');
        return;
      }

      const slot = result.room.user1.uid === user.uid ? 'user1' : 'user2';
      onEnterRoom(result.room, slot);
    } catch (err: unknown) {
      console.error('Failed to join room:', err);
      const message = err instanceof Error ? err.message : 'Gagal bergabung ke room. Periksa koneksi atau kode room.';
      setErrorMsg(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col justify-between p-4 sm:p-6 md:p-8 font-sans antialiased selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Top Navigation Bar */}
      <header className="w-full max-w-4xl mx-auto flex items-center justify-between py-2 border-b border-neutral-800/80 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 p-0.5 shadow-lg shadow-emerald-500/10 flex items-center justify-center">
            <div className="w-full h-full bg-neutral-950 rounded-[10px] flex items-center justify-center text-emerald-400">
              <MessageSquare size={18} className="stroke-[2.5]" />
            </div>
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              LIVE CHAT
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Radio size={10} className="animate-pulse text-emerald-400" />
                Real-Time
              </span>
            </h1>
            <p className="text-xs text-neutral-400">Percakapan instan 2 orang • Aman & Terenkripsi</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="open-guide-btn"
            onClick={onOpenGuide}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-xs font-medium text-neutral-300 hover:text-white hover:bg-neutral-800 transition-all cursor-pointer"
            title="Panduan & Arsitektur"
          >
            <HelpCircle size={14} />
            <span className="hidden sm:inline">Panduan</span>
          </button>

          {currentUser ? (
            <div className="flex items-center gap-2 pl-2 border-l border-neutral-800">
              {currentUser.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt={currentUser.name}
                  className="w-7 h-7 rounded-full ring-1 ring-neutral-700"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold flex items-center justify-center ring-1 ring-emerald-500/30">
                  {currentUser.name.charAt(0).toUpperCase()}
                </div>
              )}
              <button
                onClick={() => logoutUser()}
                className="text-[11px] text-neutral-400 hover:text-rose-400 transition-colors cursor-pointer"
                title="Keluar akun Google"
              >
                Ganti Akun
              </button>
            </div>
          ) : (
            <button
              id="google-login-header-btn"
              onClick={ensureAuthenticated}
              disabled={isAuthenticating}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/15 border border-emerald-500/30 text-xs font-semibold text-emerald-300 hover:bg-emerald-600/25 transition-colors cursor-pointer"
            >
              <LogIn size={13} />
              <span>{isAuthenticating ? 'Menghubungkan...' : 'Masuk Google'}</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Form Center Box */}
      <main className="w-full max-w-lg mx-auto flex-1 flex flex-col justify-center my-2">
        <div className="bg-neutral-900/90 border border-neutral-800/90 rounded-2xl p-6 sm:p-7 shadow-2xl backdrop-blur-md">
          {/* Form Title & User Profile Setup */}
          <div className="space-y-4 mb-6">
            <div>
              <label htmlFor="user-name-input" className="block text-xs font-medium text-neutral-300 mb-1.5">
                Nama Pengguna Anda <span className="text-emerald-400">*</span>
              </label>
              <div className="relative">
                <input
                  id="user-name-input"
                  type="text"
                  maxLength={50}
                  placeholder="Contoh: Budi Pratama"
                  value={userName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl px-4 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500 transition-all outline-none"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] text-neutral-400">
                  {userName.length}/50
                </span>
              </div>
              <p className="text-[11px] text-neutral-400 mt-1">
                Nama ini akan ditampilkan kepada lawan bicara di dalam ruang chat.
              </p>
            </div>

            {/* Google Authentication Notification status */}
            {!currentUser && (
              <div className="bg-neutral-950/70 border border-neutral-800 rounded-xl p-3 flex items-start gap-2.5 text-xs text-neutral-300">
                <ShieldCheck size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-neutral-200 font-medium leading-tight">Keamanan Database Firebase</p>
                  <p className="text-neutral-400 text-[11px] mt-0.5">
                    Aplikasi menggunakan Firestore terenkripsi. Otentikasi Google 1-klik akan dilakukan otomatis saat Anda membuat atau bergabung room.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Action Tabs: Buat Room vs Gabung Room */}
          <div className="flex rounded-xl bg-neutral-950 p-1 border border-neutral-800 mb-6">
            <button
              id="tab-create-room"
              onClick={() => { setActiveTab('create'); setErrorMsg(null); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'create'
                  ? 'bg-neutral-800 text-white shadow-xs'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <PlusCircle size={14} />
              Buat Room Baru
            </button>
            <button
              id="tab-join-room"
              onClick={() => { setActiveTab('join'); setErrorMsg(null); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'join'
                  ? 'bg-neutral-800 text-white shadow-xs'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Users size={14} />
              Gabung Room
            </button>
          </div>

          {/* Error Message Banner */}
          {errorMsg && (
            <div className="mb-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5 animate-in fade-in duration-150">
              <AlertCircle size={16} className="shrink-0 mt-0.5 text-rose-400" />
              <div className="flex-1 font-medium">{errorMsg}</div>
            </div>
          )}

          {/* TAB 1: BUAT ROOM */}
          {activeTab === 'create' && (
            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div>
                <label htmlFor="room-name-input" className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Nama Ruang Chat (Opsional)
                </label>
                <input
                  id="room-name-input"
                  type="text"
                  maxLength={64}
                  placeholder={`Contoh: Diskusi Santai`}
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl px-4 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 transition-all outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-neutral-300">
                    Kode Room Unik Anda:
                  </span>
                  <button
                    type="button"
                    onClick={handleRefreshCode}
                    className="text-[11px] text-neutral-400 hover:text-emerald-400 flex items-center gap-1 cursor-pointer transition-colors"
                    title="Buat kode baru"
                  >
                    <RefreshCw size={11} /> Ganti Kode
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 flex items-center justify-between">
                    <span className="font-mono text-base font-bold tracking-widest text-emerald-400">
                      {generatedCode}
                    </span>
                    <span className="text-[10px] uppercase font-bold text-neutral-400 bg-neutral-900 px-2 py-0.5 rounded">
                      Maks 2 Org
                    </span>
                  </div>
                  <button
                    type="button"
                    id="copy-lobby-code-btn"
                    onClick={handleCopyCode}
                    className="p-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700/60 transition-colors cursor-pointer"
                    title="Salin Kode Room"
                  >
                    {copiedCode ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                  </button>
                </div>
                <p className="text-[11px] text-neutral-400 mt-1">
                  Bagikan kode ini kepada teman Anda agar bisa masuk ke chat yang sama.
                </p>
              </div>

              <button
                id="create-and-enter-btn"
                type="submit"
                disabled={isLoading || isAuthenticating}
                className="w-full mt-2 py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isLoading || isAuthenticating ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    <span>Menyiapkan Room...</span>
                  </>
                ) : (
                  <>
                    <span>Buat Room & Masuk Chat</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          )}

          {/* TAB 2: GABUNG ROOM */}
          {activeTab === 'join' && (
            <form onSubmit={handleJoinRoom} className="space-y-4">
              <div>
                <label htmlFor="join-room-code-input" className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Masukkan Kode Room Teman Anda <span className="text-emerald-400">*</span>
                </label>
                <input
                  id="join-room-code-input"
                  type="text"
                  maxLength={10}
                  placeholder="Contoh: ABC123"
                  value={inputCode}
                  onChange={(e) => {
                    setInputCode(e.target.value.toUpperCase());
                    if (errorMsg) setErrorMsg(null);
                  }}
                  className="w-full bg-neutral-950 border border-neutral-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl px-4 py-2.5 text-base font-mono tracking-wider uppercase text-neutral-100 placeholder:text-neutral-500 transition-all outline-none"
                />
                <p className="text-[11px] text-neutral-400 mt-1">
                  Hanya 2 pengguna yang diizinkan berada di dalam satu room.
                </p>
              </div>

              <button
                id="join-room-submit-btn"
                type="submit"
                disabled={isLoading || isAuthenticating}
                className="w-full mt-2 py-3 px-4 bg-cyan-500 hover:bg-cyan-400 text-neutral-950 font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isLoading || isAuthenticating ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    <span>Memeriksa & Bergabung...</span>
                  </>
                ) : (
                  <>
                    <span>Gabung Room & Masuk Chat</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Concept Diagram / Explainer */}
          <div className="mt-6 pt-5 border-t border-neutral-800 text-[11px] text-neutral-400 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-ping" />
              Sinkronisasi pesan instan
            </span>
            <span className="text-neutral-400 font-medium">Batas: 2 Pengguna</span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-4xl mx-auto text-center text-xs text-neutral-400 py-3">
        Live Chat Real-Time Multiplayer • Cloud Firestore Backend
      </footer>
    </div>
  );
};
