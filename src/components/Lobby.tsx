import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  LogIn,
  RefreshCw,
  HelpCircle,
  AlertCircle,
  Users,
  Radio,
  ArrowRight,
  Smartphone,
  Video,
  Image as ImageIcon,
  Zap,
} from 'lucide-react';
import {
  loginWithGoogle,
  logoutUser,
  enterPublicRoom,
  getOrCreateSessionUser,
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
}) => {
  const [userName, setUserName] = useState<string>(
    currentUser?.name || localStorage.getItem('livechat_username') || ''
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);

  useEffect(() => {
    // Check if already installed in standalone mode
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
    } else {
      // Show user instructions via Guide Modal
      onOpenGuide();
    }
  };

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

  // Google Login button handler (optional)
  const handleGoogleLogin = async () => {
    setIsAuthenticating(true);
    setErrorMsg(null);
    try {
      const user = await loginWithGoogle();
      if (user.displayName) {
        setUserName(user.displayName);
        localStorage.setItem('livechat_username', user.displayName);
      }
    } catch (err: any) {
      console.error('Google login error:', err);
      setErrorMsg(err.message || 'Gagal login Google.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Direct Enter Chat (No Room Code Required)
  const handleEnterChat = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmedName = userName.trim();
    if (!trimmedName) {
      setErrorMsg('Harap masukkan nama Anda sebelum masuk ke chat.');
      return;
    }

    try {
      setIsLoading(true);
      const user = getOrCreateSessionUser(trimmedName);

      const result = await enterPublicRoom({
        uid: user.uid,
        name: trimmedName,
        email: user.email || '',
        avatar: user.avatar || '',
      });

      if (!result || !result.success || !result.room) {
        setErrorMsg(result?.message || 'Gagal terhubung ke chat. Silakan coba lagi.');
        return;
      }

      const slot =
        result.room.createdBy === user.uid || result.room.user1?.uid === user.uid
          ? 'user1'
          : 'user2';
      onEnterRoom(result.room, slot);
    } catch (err: unknown) {
      console.error('Failed to enter chat:', err);
      const message =
        err instanceof Error
          ? err.message
          : 'Gagal masuk ke chat. Periksa koneksi internet Anda.';
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
                Langsung
              </span>
            </h1>
            <p className="text-xs text-neutral-400">
              Masuk langsung tanpa kode room • Hingga 20 orang online
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isInstalled && (
            <button
              id="install-android-pwa-btn"
              onClick={handleInstallClick}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-all cursor-pointer shadow-sm"
              title="Pasang aplikasi ini di HP Android / Layar Utama"
            >
              <Smartphone size={14} />
              <span>Install di HP</span>
            </button>
          )}

          <button
            id="open-guide-btn"
            onClick={onOpenGuide}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-xs font-medium text-neutral-300 hover:text-white hover:bg-neutral-800 transition-all cursor-pointer"
            title="Panduan Aplikasi"
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
              onClick={handleGoogleLogin}
              disabled={isAuthenticating}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs font-medium text-neutral-300 hover:text-white transition-colors cursor-pointer"
              title="Masuk dengan akun Google (Opsional)"
            >
              <LogIn size={13} />
              <span>{isAuthenticating ? 'Menghubungkan...' : 'Masuk Google (Opsional)'}</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Form Center Box */}
      <main className="w-full max-w-md mx-auto flex-1 flex flex-col justify-center my-4">
        <div className="bg-neutral-900/90 border border-neutral-800/90 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-md">
          {/* Header icon badge */}
          <div className="text-center mb-6">
            <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-inner">
              <Zap size={28} className="animate-pulse" />
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Masuk ke Live Chat
            </h2>
            <p className="text-xs text-neutral-400 mt-1 max-w-xs mx-auto">
              Tidak perlu memasukkan kode room. Cukup ketik nama Anda dan langsung mengobrol bersama!
            </p>
          </div>

          {/* Error Message Banner */}
          {errorMsg && (
            <div className="mb-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs space-y-1.5 animate-in fade-in duration-150">
              <div className="flex items-start gap-2">
                <AlertCircle size={16} className="shrink-0 mt-0.5 text-rose-400" />
                <div className="flex-1 font-medium">{errorMsg}</div>
              </div>
            </div>
          )}

          {/* Form: Just Name Input and Single Enter Button */}
          <form onSubmit={handleEnterChat} className="space-y-4">
            <div>
              <label
                htmlFor="user-name-input"
                className="block text-xs font-semibold text-neutral-300 mb-1.5"
              >
                Nama Pengguna Anda <span className="text-emerald-400">*</span>
              </label>
              <div className="relative">
                <input
                  id="user-name-input"
                  type="text"
                  maxLength={50}
                  autoFocus
                  placeholder="Contoh: Budi Pratama"
                  value={userName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl px-4 py-3 text-base text-neutral-100 placeholder:text-neutral-500 transition-all outline-none"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] text-neutral-400">
                  {userName.length}/50
                </span>
              </div>
              <p className="text-[11px] text-neutral-400 mt-1.5">
                Nama ini akan ditampilkan kepada pengguna lain di ruang obrolan.
              </p>
            </div>

            <button
              id="enter-chat-btn"
              type="submit"
              disabled={isLoading}
              className="w-full mt-3 py-3.5 px-4 bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] text-neutral-950 font-bold rounded-xl text-base flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isLoading ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  <span>Menghubungkan ke Chat...</span>
                </>
              ) : (
                <>
                  <span>Masuk ke Chat</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          {/* Feature highlights grid */}
          <div className="mt-6 pt-5 border-t border-neutral-800 grid grid-cols-2 gap-3 text-left">
            <div className="flex items-center gap-2 p-2 rounded-lg bg-neutral-950/60 border border-neutral-800/60">
              <Zap size={14} className="text-emerald-400 shrink-0" />
              <span className="text-[11px] text-neutral-300 font-medium leading-tight">
                Tanpa Kode Room
              </span>
            </div>
            <div className="flex items-center gap-2 p-2 rounded-lg bg-neutral-950/60 border border-neutral-800/60">
              <Users size={14} className="text-cyan-400 shrink-0" />
              <span className="text-[11px] text-neutral-300 font-medium leading-tight">
                Hingga 20 Orang
              </span>
            </div>
            <div className="flex items-center gap-2 p-2 rounded-lg bg-neutral-950/60 border border-neutral-800/60">
              <ImageIcon size={14} className="text-amber-400 shrink-0" />
              <span className="text-[11px] text-neutral-300 font-medium leading-tight">
                Kirim Foto Instan
              </span>
            </div>
            <div className="flex items-center gap-2 p-2 rounded-lg bg-neutral-950/60 border border-neutral-800/60">
              <Video size={14} className="text-rose-400 shrink-0" />
              <span className="text-[11px] text-neutral-300 font-medium leading-tight">
                Panggilan Video
              </span>
            </div>
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
