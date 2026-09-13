import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Copy,
  Check,
  Share2,
  LogOut,
  Volume2,
  VolumeX,
  Clock,
  CheckCheck,
  Users,
  AlertTriangle,
  Smile,
  Radio,
  Image as ImageIcon,
  Camera,
  Video as VideoIcon,
  PhoneCall,
  PhoneOff,
  X,
  Download,
  Loader2,
} from 'lucide-react';
import {
  subscribeToRoom,
  subscribeToMessages,
  sendChatMessage,
  markMessagesAsRead,
  setPresenceStatus,
  setTypingStatus,
  listenToIncomingCalls,
  updateCallStatus,
} from '../firebase';
import { playIncomingSound, playOutgoingSound, playRingtone, stopRingtone } from '../sound';
import { compressImage } from '../utils/image';
import { VideoCallModal } from './VideoCallModal';
import type { Room, ChatMessage, RoomParticipant, CallSession } from '../types';

interface ChatRoomProps {
  initialRoom: Room;
  userSlot: 'user1' | 'user2';
  currentUserId: string;
  currentUserName: string;
  onLeaveRoom: () => void;
}

export const ChatRoom: React.FC<ChatRoomProps> = ({
  initialRoom,
  userSlot,
  currentUserId,
  currentUserName,
  onLeaveRoom,
}) => {
  const [room, setRoom] = useState<Room>(initialRoom);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [shared, setShared] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState<boolean>(false);

  // Photo sending states
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [photoCaption, setPhotoCaption] = useState<string>('');
  const [isCompressingPhoto, setIsCompressingPhoto] = useState<boolean>(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // Video Call states
  const [incomingCall, setIncomingCall] = useState<CallSession | null>(null);
  const [activeCallRole, setActiveCallRole] = useState<'caller' | 'receiver' | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prevMessagesCountRef = useRef<number>(0);
  const isFirstMount = useRef<boolean>(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const counterpartSlot: 'user1' | 'user2' = userSlot === 'user1' ? 'user2' : 'user1';
  const counterpart: RoomParticipant | null =
    userSlot === 'user1' ? (room.user2 ?? null) : room.user1;
  const isCounterpartOnline =
    counterpartSlot === 'user1' ? room.user1Online : !!room.user2Online;
  const isCounterpartTyping =
    counterpartSlot === 'user1' ? !!room.user1Typing : !!room.user2Typing;

  // 1. Subscribe to Room Metadata changes
  useEffect(() => {
    setPresenceStatus(room.id, userSlot, true);

    const unsubscribeRoom = subscribeToRoom(
      room.id,
      (updatedRoom) => {
        if (!updatedRoom) {
          setErrorMessage('Room telah dihapus atau ditutup oleh pembuat.');
          return;
        }
        setRoom(updatedRoom);
      },
      (err) => {
        console.error('Room listener error:', err);
        setErrorMessage('Gagal menyinkronkan status room secara real-time.');
      }
    );

    const handleBeforeUnload = () => {
      setPresenceStatus(room.id, userSlot, false);
      setTypingStatus(room.id, userSlot, false);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      setPresenceStatus(room.id, userSlot, false);
      setTypingStatus(room.id, userSlot, false);
      unsubscribeRoom();
    };
  }, [room.id, userSlot]);

  // 2. Subscribe to Real-Time Messages
  useEffect(() => {
    const unsubscribeMessages = subscribeToMessages(
      room.id,
      (newMessages) => {
        setMessages(newMessages);
        markMessagesAsRead(room.id, currentUserId, newMessages);

        if (!isFirstMount.current && newMessages.length > prevMessagesCountRef.current) {
          const latestMessage = newMessages[newMessages.length - 1];
          if (latestMessage.senderId !== currentUserId && soundEnabled) {
            playIncomingSound();
          }
        }
        prevMessagesCountRef.current = newMessages.length;
        isFirstMount.current = false;
      },
      (err) => {
        console.error('Messages subscription error:', err);
        setErrorMessage('Gagal menerima pesan baru.');
      }
    );

    return () => {
      unsubscribeMessages();
    };
  }, [room.id, currentUserId, soundEnabled]);

  // 3. Subscribe to Incoming Video Calls
  useEffect(() => {
    const unsubscribeCalls = listenToIncomingCalls(room.id, currentUserId, (call) => {
      if (call) {
        setIncomingCall(call);
        playRingtone();
      } else {
        setIncomingCall(null);
        stopRingtone();
      }
    });

    return () => {
      stopRingtone();
      unsubscribeCalls();
    };
  }, [room.id, currentUserId]);

  // 4. Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isCounterpartTyping]);

  // 5. Handle Typing Indicator sync
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputText(val);

    if (val.trim().length > 0) {
      setTypingStatus(room.id, userSlot, true);

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        setTypingStatus(room.id, userSlot, false);
      }, 2000);
    } else {
      setTypingStatus(room.id, userSlot, false);
    }
  };

  // 6. Send Text Message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const textToSend = inputText.trim();
    if (!textToSend || isSending) return;

    if (textToSend.length > 2000) {
      setErrorMessage('Panjang pesan melebihi 2000 karakter.');
      return;
    }

    try {
      setIsSending(true);
      setInputText('');
      setTypingStatus(room.id, userSlot, false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

      if (soundEnabled) {
        playOutgoingSound();
      }

      await sendChatMessage(
        room.id,
        { uid: currentUserId, name: currentUserName },
        textToSend
      );
    } catch (err: unknown) {
      console.error('Send message failed:', err);
      const msg = err instanceof Error ? err.message : 'Gagal mengirim pesan.';
      setErrorMessage(msg);
      setInputText(textToSend);
    } finally {
      setIsSending(false);
    }
  };

  // 7. Handle Photo Selection & Compression
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Harap pilih file format gambar (JPG, PNG, WEBP, dsb).');
      return;
    }

    try {
      setIsCompressingPhoto(true);
      setErrorMessage(null);
      const compressedDataUrl = await compressImage(file, 960, 0.72);
      setSelectedPhoto(compressedDataUrl);
      setPhotoCaption('');
    } catch (err: any) {
      console.error('Compress image error:', err);
      setErrorMessage('Gagal memproses gambar. Coba gambar lain.');
    } finally {
      setIsCompressingPhoto(false);
      // Reset input value so same photo can be re-selected if cancelled
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // 8. Send Photo Message
  const handleSendPhoto = async () => {
    if (!selectedPhoto || isSending) return;

    try {
      setIsSending(true);
      if (soundEnabled) {
        playOutgoingSound();
      }

      await sendChatMessage(
        room.id,
        { uid: currentUserId, name: currentUserName },
        photoCaption.trim(),
        selectedPhoto
      );

      setSelectedPhoto(null);
      setPhotoCaption('');
    } catch (err: unknown) {
      console.error('Send photo failed:', err);
      const msg = err instanceof Error ? err.message : 'Gagal mengirim foto.';
      setErrorMessage(msg);
    } finally {
      setIsSending(false);
    }
  };

  // 9. Video Call Actions
  const handleStartVideoCall = () => {
    if (!counterpart) {
      setErrorMessage('Menunggu lawan bicara bergabung sebelum memulai Video Call.');
      return;
    }
    setActiveCallRole('caller');
  };

  const handleAcceptIncomingCall = () => {
    stopRingtone();
    setActiveCallRole('receiver');
  };

  const handleRejectIncomingCall = async () => {
    stopRingtone();
    if (incomingCall) {
      await updateCallStatus(room.id, incomingCall.id, 'rejected');
      setIncomingCall(null);
    }
  };

  // 10. Copy Room Code
  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  // 11. Share Room Code
  const handleShareRoom = async () => {
    const shareText = `Gabung ke Live Chat saya.\nKode Room: ${room.code}\nLink: ${window.location.origin}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Undangan Live Chat 2 Orang',
          text: shareText,
          url: window.location.origin,
        });
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      } catch {
        // user aborted share
      }
    } else {
      await navigator.clipboard.writeText(shareText);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    }
  };

  // 12. Leave Room
  const handleLeave = () => {
    if (window.confirm('Apakah Anda yakin ingin keluar dari room chat ini?')) {
      setPresenceStatus(room.id, userSlot, false);
      setTypingStatus(room.id, userSlot, false);
      onLeaveRoom();
    }
  };

  // Format message time as 20:35
  const formatTime = (ts: any): string => {
    if (!ts) return '';
    try {
      const date = ts.toDate ? ts.toDate() : new Date(ts);
      return date.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    } catch {
      return '';
    }
  };

  const quickEmojis = ['👍', '❤️', '😂', '👋', '🎉', '🔥', '🙏', '💯'];

  return (
    <div className="h-[100dvh] w-full bg-neutral-950 text-neutral-100 flex flex-col font-sans antialiased overflow-hidden select-text">
      {/* Top Navigation Header */}
      <header className="bg-neutral-900 border-b border-neutral-800 px-3 sm:px-4 py-2.5 shrink-0 flex items-center justify-between shadow-md z-20">
        {/* Left: Room Info and Code */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 p-0.5 shadow-sm flex items-center justify-center shrink-0">
            <div className="w-full h-full bg-neutral-950 rounded-[10px] flex items-center justify-center text-emerald-400 font-bold text-xs">
              2P
            </div>
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-white truncate leading-tight">
                {room.name || `Room ${room.code}`}
              </h2>
              <span className="shrink-0 font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-neutral-800 border border-neutral-700 text-emerald-400">
                {room.code}
              </span>
            </div>

            {/* Online Status Label */}
            <div className="flex items-center gap-2 text-xs text-neutral-400 mt-0.5">
              {!counterpart ? (
                <span className="flex items-center gap-1.5 text-amber-400 font-medium">
                  <span className="w-2 h-2 rounded-full bg-amber-400 inline-block animate-pulse" />
                  Menunggu pengguna 2...
                </span>
              ) : isCounterpartOnline ? (
                <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-ping" />
                  {counterpart.name} • 🟢 Online
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-neutral-400">
                  <span className="w-2 h-2 rounded-full bg-neutral-600 inline-block" />
                  {counterpart.name} • ⚪ Offline
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right Action Controls: Video Call, Copy, Share, Sound, Leave */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Video Call Trigger Button */}
          <button
            id="start-video-call-btn"
            onClick={handleStartVideoCall}
            disabled={!counterpart}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              counterpart
                ? 'bg-emerald-500 hover:bg-emerald-400 text-neutral-950 shadow-md shadow-emerald-500/20'
                : 'bg-neutral-800 text-neutral-500 cursor-not-allowed border border-neutral-700/50'
            }`}
            title={counterpart ? 'Mulai Video Call' : 'Tunggu pengguna kedua untuk video call'}
          >
            <VideoIcon size={14} />
            <span className="hidden sm:inline">Video Call</span>
          </button>

          <button
            id="copy-code-header-btn"
            onClick={handleCopyCode}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium border border-neutral-700/60 transition-colors cursor-pointer"
            title="Salin Kode Room"
          >
            {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            <span className="hidden md:inline">{copied ? 'Tersalin' : 'Salin'}</span>
          </button>

          <button
            id="share-code-header-btn"
            onClick={handleShareRoom}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium border border-neutral-700/60 transition-colors cursor-pointer"
            title="Bagikan Kode Room"
          >
            <Share2 size={14} />
          </button>

          <button
            id="toggle-sound-btn"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs transition-colors cursor-pointer"
            title={soundEnabled ? 'Matikan Suara Pesan' : 'Nyalakan Suara Pesan'}
          >
            {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} className="text-neutral-500" />}
          </button>

          <button
            id="leave-room-btn"
            onClick={handleLeave}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-medium border border-rose-500/20 transition-colors cursor-pointer"
            title="Keluar dari Chat"
          >
            <LogOut size={14} />
            <span className="hidden sm:inline">Keluar</span>
          </button>
        </div>
      </header>

      {/* Participants Subheader Status Banner */}
      <div className="bg-neutral-900/60 border-b border-neutral-800/80 px-4 py-1.5 flex items-center justify-between text-[11px] text-neutral-400 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-neutral-400">Anda:</span>
            <span className="font-semibold text-neutral-200">{currentUserName}</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
          </div>
          <span className="text-neutral-400">•</span>
          <div className="flex items-center gap-1.5">
            <span className="text-neutral-400">Lawan Bicara:</span>
            {counterpart ? (
              <>
                <span className="font-semibold text-neutral-200">{counterpart.name}</span>
                <span
                  className={`w-1.5 h-1.5 rounded-full inline-block ${
                    isCounterpartOnline ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-600'
                  }`}
                />
              </>
            ) : (
              <span className="text-amber-400 font-medium">Belum ada (Menunggu)</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 text-[11px] text-neutral-400">
          <Users size={12} />
          <span>{counterpart ? '2/2 Terisi' : '1/2 Menunggu'}</span>
        </div>
      </div>

      {/* Error Alert Bar if any */}
      {errorMessage && (
        <div className="bg-rose-500/15 border-b border-rose-500/30 px-4 py-2 text-xs text-rose-300 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-neutral-400 hover:text-white text-xs font-bold px-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Incoming Video Call Banner / Dialog */}
      {incomingCall && !activeCallRole && (
        <div className="bg-emerald-950/90 border-b border-emerald-500/40 p-3 sm:p-4 text-white flex items-center justify-between shadow-2xl animate-in slide-in-from-top duration-300 z-30 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500 text-neutral-950 flex items-center justify-center animate-bounce shadow-lg shadow-emerald-500/40">
              <PhoneCall size={20} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                Panggilan Video Masuk
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              </h4>
              <p className="text-xs text-emerald-200">
                Dari <strong className="text-white">{incomingCall.callerName}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="reject-call-btn"
              onClick={handleRejectIncomingCall}
              className="flex items-center gap-1 px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md shadow-rose-600/30 transition-transform active:scale-95 cursor-pointer"
            >
              <PhoneOff size={14} />
              <span>Tolak</span>
            </button>
            <button
              id="accept-call-btn"
              onClick={handleAcceptIncomingCall}
              className="flex items-center gap-1 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 text-xs font-bold shadow-md shadow-emerald-500/30 transition-transform active:scale-95 cursor-pointer"
            >
              <VideoIcon size={14} />
              <span>Terima</span>
            </button>
          </div>
        </div>
      )}

      {/* Chat Messages Conversation Body */}
      <main className="flex-1 overflow-y-auto p-4 space-y-3 bg-neutral-950">
        {/* Waiting for Second User Screen */}
        {!counterpart && (
          <div className="max-w-md mx-auto my-8 p-6 bg-neutral-900/80 border border-neutral-800 rounded-2xl text-center space-y-4 shadow-xl">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
              <Clock size={28} className="animate-spin duration-3000" />
            </div>
            <div>
              <h3 className="text-base font-bold text-neutral-100">Menunggu pengguna kedua...</h3>
              <p className="text-xs text-neutral-400 mt-1 max-w-xs mx-auto">
                Beri tahu teman Anda untuk bergabung ke ruang chat ini menggunakan kode di bawah:
              </p>
            </div>

            <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-xl flex items-center justify-between max-w-xs mx-auto">
              <span className="font-mono text-xl font-extrabold tracking-widest text-emerald-400">
                {room.code}
              </span>
              <button
                id="copy-waiting-code-btn"
                onClick={handleCopyCode}
                className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs rounded-lg font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                <span>{copied ? 'Disalin' : 'Salin'}</span>
              </button>
            </div>

            <div className="text-[11px] text-neutral-400">
              💡 Buka tab browser baru atau HP lain dan masukkan kode di atas untuk langsung menguji chat, foto, dan video call.
            </div>
          </div>
        )}

        {/* Empty state when counterpart joined but no messages yet */}
        {counterpart && messages.length === 0 && (
          <div className="text-center py-12 space-y-2">
            <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <Radio size={22} className="animate-pulse" />
            </div>
            <p className="text-sm font-semibold text-neutral-200">
              Kedua pengguna telah terhubung!
            </p>
            <p className="text-xs text-neutral-400">
              Kirim pesan atau foto pertama Anda. Percakapan ini tersinkronisasi real-time.
            </p>
          </div>
        )}

        {/* List of Messages */}
        {messages.map((msg) => {
          const isOwn = msg.senderId === currentUserId;

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} transition-opacity duration-150`}
            >
              {/* Sender Name above message bubble for counterpart */}
              {!isOwn && (
                <span className="text-[11px] font-medium text-emerald-400/90 mb-1 ml-1">
                  {msg.senderName}
                </span>
              )}

              {/* Message Bubble (Supports Photos & Text) */}
              <div
                className={`relative max-w-[85%] sm:max-w-md md:max-w-lg rounded-2xl text-sm break-words shadow-sm overflow-hidden ${
                  isOwn
                    ? 'bg-emerald-600 text-white rounded-br-xs'
                    : 'bg-neutral-800 text-neutral-100 rounded-bl-xs border border-neutral-700/60'
                }`}
              >
                {/* Photo rendering if available */}
                {msg.imageUrl && (
                  <div className="p-1 pb-0">
                    <img
                      src={msg.imageUrl}
                      alt="Foto Chat"
                      onClick={() => setLightboxImage(msg.imageUrl || null)}
                      className="rounded-xl w-full max-h-72 object-cover cursor-pointer hover:opacity-95 transition-opacity"
                      loading="lazy"
                    />
                  </div>
                )}

                {/* Message Text / Caption */}
                {msg.text && (
                  <p className="px-3.5 py-2 leading-relaxed whitespace-pre-wrap selection:bg-black/30">
                    {msg.text}
                  </p>
                )}

                {/* Footer: Timestamp & Read Receipts */}
                <div
                  className={`flex items-center justify-end gap-1 text-[10px] px-3 pb-1.5 pt-0.5 select-none ${
                    isOwn ? 'text-emerald-100/80' : 'text-neutral-400'
                  }`}
                >
                  <span>{formatTime(msg.timestamp)}</span>

                  {/* Read receipts for own messages */}
                  {isOwn && (
                    <span title={msg.read ? '✓✓ Dibaca' : '✓ Terkirim'}>
                      {msg.read ? (
                        <CheckCheck size={14} className="text-cyan-300 inline" />
                      ) : (
                        <Check size={14} className="text-emerald-200 inline" />
                      )}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {isCounterpartTyping && counterpart && (
          <div className="flex items-center gap-2 text-xs text-neutral-400 animate-in fade-in duration-200 pt-1">
            <span className="font-medium text-emerald-400">{counterpart.name}</span>
            <span>sedang mengetik</span>
            <span className="inline-flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </main>

      {/* Image Preview Overlay Card before sending */}
      {selectedPhoto && (
        <div className="bg-neutral-900 border-t border-neutral-800 p-3 flex flex-col sm:flex-row items-center gap-3 shrink-0 animate-in slide-in-from-bottom duration-200">
          <div className="relative shrink-0">
            <img
              src={selectedPhoto}
              alt="Pratinjau Foto"
              className="w-20 h-20 object-cover rounded-xl border border-neutral-700 shadow-md"
            />
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute -top-1.5 -right-1.5 p-1 bg-neutral-800 hover:bg-neutral-700 text-white rounded-full shadow border border-neutral-600 cursor-pointer"
              title="Batal Foto"
            >
              <X size={12} />
            </button>
          </div>

          <div className="flex-1 w-full flex items-center gap-2">
            <input
              type="text"
              placeholder="Tambahkan keterangan foto (opsional)..."
              value={photoCaption}
              onChange={(e) => setPhotoCaption(e.target.value)}
              className="flex-1 bg-neutral-950 border border-neutral-800 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-xs text-neutral-100 placeholder:text-neutral-500 outline-none"
            />
            <button
              id="send-photo-btn"
              onClick={handleSendPhoto}
              disabled={isSending}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-md shadow-emerald-500/20 disabled:opacity-50 cursor-pointer shrink-0"
            >
              {isSending ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Mengirim...</span>
                </>
              ) : (
                <>
                  <Send size={14} className="rotate-45" />
                  <span>Kirim Foto</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Quick Emoji Bar */}
      {showEmojiPicker && (
        <div className="bg-neutral-900 border-t border-neutral-800 px-3 py-2 flex items-center gap-2 overflow-x-auto shrink-0">
          <span className="text-[11px] text-neutral-400 shrink-0">Reaksi cepat:</span>
          {quickEmojis.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                setInputText((prev) => prev + emoji);
              }}
              className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-sm transition-transform active:scale-90 cursor-pointer"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Chat Bottom Input Bar (Mobile-safe pinned footer) */}
      <footer className="bg-neutral-900 border-t border-neutral-800 p-2.5 sm:p-3 shrink-0">
        {/* Hidden File Input for Photos */}
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          onChange={handlePhotoSelect}
          className="hidden"
        />

        <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto flex items-center gap-2">
          {/* Attach Photo Button */}
          <button
            type="button"
            id="attach-photo-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={isCompressingPhoto || isSending}
            className="p-2.5 rounded-xl bg-neutral-800/80 hover:bg-neutral-800 text-neutral-300 hover:text-emerald-400 transition-colors cursor-pointer shrink-0"
            title="Kirim Foto dari Kamera / Galeri"
          >
            {isCompressingPhoto ? (
              <Loader2 size={18} className="animate-spin text-emerald-400" />
            ) : (
              <Camera size={18} />
            )}
          </button>

          {/* Emoji Toggle Button */}
          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className={`p-2.5 rounded-xl transition-colors cursor-pointer shrink-0 ${
              showEmojiPicker
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'text-neutral-400 hover:text-neutral-200 bg-neutral-800/80 hover:bg-neutral-800'
            }`}
            title="Emoji / Reaksi Cepat"
          >
            <Smile size={18} />
          </button>

          {/* Text Input */}
          <div className="flex-1 relative">
            <input
              id="chat-message-input"
              type="text"
              maxLength={2000}
              placeholder="Ketik pesan..."
              value={inputText}
              onChange={handleInputChange}
              disabled={isSending}
              autoComplete="off"
              className="w-full bg-neutral-950 border border-neutral-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl px-4 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none transition-all"
            />
          </div>

          {/* Send Button */}
          <button
            id="send-message-btn"
            type="submit"
            disabled={!inputText.trim() || isSending}
            className="p-2.5 sm:px-4 sm:py-2.5 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
            title="Kirim Pesan"
          >
            <Send size={16} className="rotate-45" />
            <span className="hidden sm:inline text-xs">Kirim</span>
          </button>
        </form>
      </footer>

      {/* Lightbox Modal for Fullscreen Photo Zoom */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col items-center justify-between p-4 animate-in fade-in duration-200"
          onClick={() => setLightboxImage(null)}
        >
          <div className="w-full max-w-4xl flex items-center justify-between z-10">
            <span className="text-xs text-neutral-400">Pratinjau Foto</span>
            <div className="flex items-center gap-2">
              <a
                href={lightboxImage}
                download={`chat-photo-${Date.now()}.jpg`}
                onClick={(e) => e.stopPropagation()}
                className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition-colors cursor-pointer"
                title="Unduh Foto"
              >
                <Download size={18} />
              </a>
              <button
                onClick={() => setLightboxImage(null)}
                className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white transition-colors cursor-pointer"
                title="Tutup"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="flex-1 w-full flex items-center justify-center p-2">
            <img
              src={lightboxImage}
              alt="Zoomed Chat Photo"
              className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}

      {/* Active Video Call Modal */}
      {activeCallRole && counterpart && (
        <VideoCallModal
          roomId={room.id}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          counterpartId={counterpart.uid}
          counterpartName={counterpart.name}
          role={activeCallRole}
          incomingCallSession={incomingCall}
          onClose={() => {
            setActiveCallRole(null);
            setIncomingCall(null);
          }}
        />
      )}
    </div>
  );
};
