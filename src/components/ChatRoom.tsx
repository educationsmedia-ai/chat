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
  Camera,
  Video as VideoIcon,
  PhoneCall,
  PhoneOff,
  X,
  Download,
  Loader2,
  UserCheck,
  UserX,
  Plus,
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
  getRoomParticipants,
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

// Consistent color palette for 20 distinct members in group chats
const PARTICIPANT_COLORS = [
  'text-emerald-400',
  'text-sky-400',
  'text-amber-400',
  'text-purple-400',
  'text-rose-400',
  'text-teal-400',
  'text-indigo-400',
  'text-orange-400',
  'text-cyan-400',
  'text-fuchsia-400',
  'text-lime-400',
  'text-pink-400',
];

function getParticipantColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % PARTICIPANT_COLORS.length;
  return PARTICIPANT_COLORS[index];
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

  // Group members modal & call selector
  const [showMembersModal, setShowMembersModal] = useState<boolean>(false);
  const [showCallSelector, setShowCallSelector] = useState<boolean>(false);

  // Photo sending states
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [photoCaption, setPhotoCaption] = useState<string>('');
  const [isCompressingPhoto, setIsCompressingPhoto] = useState<boolean>(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // Video Call states
  const [incomingCall, setIncomingCall] = useState<CallSession | null>(null);
  const [activeCallRole, setActiveCallRole] = useState<'caller' | 'receiver' | null>(null);
  const [callTarget, setCallTarget] = useState<{ uid: string; name: string } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prevMessagesCountRef = useRef<number>(0);
  const isFirstMount = useRef<boolean>(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Derive group members
  const participants = getRoomParticipants(room);
  const otherParticipants = participants.filter((p) => p.uid !== currentUserId);
  const onlineCount = participants.filter((p) => p.online !== false).length;
  const typingUsers = otherParticipants.filter((p) => p.typing);
  const maxCapacity = room.maxParticipants || 20;

  // 1. Subscribe to Room Metadata changes
  useEffect(() => {
    setPresenceStatus(room.id, currentUserId, true, userSlot);

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
      setPresenceStatus(room.id, currentUserId, false, userSlot);
      setTypingStatus(room.id, currentUserId, false, userSlot);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      setPresenceStatus(room.id, currentUserId, false, userSlot);
      setTypingStatus(room.id, currentUserId, false, userSlot);
      unsubscribeRoom();
    };
  }, [room.id, currentUserId, userSlot]);

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

    return () => unsubscribeMessages();
  }, [room.id, currentUserId, soundEnabled]);

  // 3. Listen to Incoming WebRTC Video Calls
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
  }, [messages, typingUsers.length]);

  // 5. Handle Typing Indicator sync
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputText(val);

    if (val.trim().length > 0) {
      setTypingStatus(room.id, currentUserId, true, userSlot);

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        setTypingStatus(room.id, currentUserId, false, userSlot);
      }, 2000);
    } else {
      setTypingStatus(room.id, currentUserId, false, userSlot);
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
      setTypingStatus(room.id, currentUserId, false, userSlot);
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

  // 9. Video Call Trigger
  const handleOpenCallModal = () => {
    if (otherParticipants.length === 0) {
      setErrorMessage('Belum ada anggota lain yang bergabung ke room ini.');
      return;
    }

    if (otherParticipants.length === 1) {
      // Direct call if only 1 counterpart
      startCallWithUser(otherParticipants[0]);
    } else {
      // Multiple participants: show selector
      setShowCallSelector(true);
    }
  };

  const startCallWithUser = (target: RoomParticipant) => {
    setShowCallSelector(false);
    setShowMembersModal(false);
    setCallTarget({ uid: target.uid, name: target.name });
    setActiveCallRole('caller');
  };

  const handleAcceptIncomingCall = () => {
    stopRingtone();
    if (incomingCall) {
      setCallTarget({ uid: incomingCall.callerId, name: incomingCall.callerName });
      setActiveCallRole('receiver');
    }
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
    const shareText = `Gabung ke Live Chat Grup (${participants.length}/${maxCapacity} Anggota).\nKode Room: ${room.code}\nLink: ${window.location.origin}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Undangan Live Chat Grup (Hingga 20 Orang)',
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
      setPresenceStatus(room.id, currentUserId, false, userSlot);
      setTypingStatus(room.id, currentUserId, false, userSlot);
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

  // Render typing notification text
  const renderTypingText = () => {
    if (typingUsers.length === 0) return null;
    if (typingUsers.length === 1) {
      return `${typingUsers[0].name} sedang mengetik...`;
    }
    if (typingUsers.length === 2) {
      return `${typingUsers[0].name} & ${typingUsers[1].name} sedang mengetik...`;
    }
    return `${typingUsers[0].name} dan ${typingUsers.length - 1} lainnya sedang mengetik...`;
  };

  return (
    <div className="h-[100dvh] w-full bg-neutral-950 text-neutral-100 flex flex-col font-sans antialiased overflow-hidden select-text">
      {/* Top Navigation Header */}
      <header className="bg-neutral-900 border-b border-neutral-800 px-3 sm:px-4 py-2.5 shrink-0 flex items-center justify-between shadow-md z-20">
        {/* Left: Room Info and Code */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 p-0.5 shadow-sm flex items-center justify-center shrink-0">
            <div className="w-full h-full bg-neutral-950 rounded-[10px] flex items-center justify-center text-emerald-400 font-bold text-xs">
              <Users size={16} />
            </div>
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-white truncate leading-tight">
                {room.name || `Room ${room.code}`}
              </h2>
              <button
                onClick={handleCopyCode}
                className="shrink-0 font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-neutral-800 border border-neutral-700 text-emerald-400 hover:border-emerald-500/50 transition-colors flex items-center gap-1 cursor-pointer"
                title="Klik untuk salin kode"
              >
                <span>{room.code}</span>
                {copied ? <Check size={11} className="text-emerald-300" /> : <Copy size={11} />}
              </button>
            </div>

            {/* Online Status and Member Count */}
            <div className="flex items-center gap-2 text-xs text-neutral-400 mt-0.5">
              <button
                onClick={() => setShowMembersModal(true)}
                className="flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
                title="Klik untuk melihat daftar anggota"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
                <span className="font-medium">
                  {onlineCount} Online • {participants.length}/{maxCapacity} Anggota
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Action Controls: Video Call, Members List, Sound, Leave */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Members Drawer Trigger */}
          <button
            id="view-members-btn"
            onClick={() => setShowMembersModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium border border-neutral-700/60 transition-colors cursor-pointer"
            title="Lihat Daftar Anggota (Maksimal 20 Orang)"
          >
            <Users size={14} className="text-emerald-400" />
            <span className="hidden md:inline">
              Anggota ({participants.length}/{maxCapacity})
            </span>
          </button>

          {/* Video Call Trigger Button */}
          <button
            id="start-video-call-btn"
            onClick={handleOpenCallModal}
            disabled={otherParticipants.length === 0}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              otherParticipants.length > 0
                ? 'bg-emerald-500 hover:bg-emerald-400 text-neutral-950 shadow-md shadow-emerald-500/20'
                : 'bg-neutral-800 text-neutral-500 cursor-not-allowed border border-neutral-700/50'
            }`}
            title={
              otherParticipants.length > 0
                ? 'Mulai Panggilan Video'
                : 'Menunggu anggota lain bergabung untuk video call'
            }
          >
            <VideoIcon size={14} />
            <span className="hidden sm:inline">Panggilan</span>
          </button>

          <button
            id="share-code-header-btn"
            onClick={handleShareRoom}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium border border-neutral-700/60 transition-colors cursor-pointer"
            title="Undang Teman / Bagikan Kode"
          >
            <Share2 size={14} />
            <span className="hidden lg:inline">{shared ? 'Dibagikan' : 'Undang'}</span>
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
        <div className="flex items-center gap-3 overflow-x-auto">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-neutral-400">Anda:</span>
            <span className="font-semibold text-neutral-200">{currentUserName}</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
          </div>
          <span className="text-neutral-400 shrink-0">•</span>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-neutral-400">Kapasitas:</span>
            <span className="text-emerald-400 font-semibold">{participants.length} dari {maxCapacity} Terisi</span>
          </div>
        </div>

        <button
          onClick={() => setShowMembersModal(true)}
          className="text-emerald-400 hover:text-emerald-300 text-[11px] font-medium flex items-center gap-1 shrink-0 cursor-pointer"
        >
          <span>Daftar Peserta</span>
          <span>→</span>
        </button>
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
        {/* Waiting for other members banner */}
        {participants.length <= 1 && (
          <div className="max-w-md mx-auto my-8 p-6 bg-neutral-900/80 border border-neutral-800 rounded-2xl text-center space-y-4 shadow-xl">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Users size={28} className="animate-pulse" />
            </div>
            <div>
              <h3 className="text-base font-bold text-neutral-100">
                {room.code === 'GLOBAL'
                  ? 'Anda telah terhubung di Ruang Obrolan Utama!'
                  : 'Menunggu peserta lain bergabung...'}
              </h3>
              <p className="text-xs text-neutral-400 mt-1 max-w-sm mx-auto">
                {room.code === 'GLOBAL'
                  ? 'Siapa pun yang membuka aplikasi ini akan otomatis masuk ke ruangan ini. Anda bisa langsung mengetik pesan atau membagikan link ke teman-teman Anda.'
                  : 'Ruang obrolan ini dapat menampung hingga 20 orang sekaligus. Bagikan kode ruangan di bawah ini kepada teman atau rekan kerja Anda:'}
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

            <div className="flex items-center justify-center gap-2">
              <button
                onClick={handleShareRoom}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 text-xs font-bold transition-all shadow-md shadow-emerald-500/20 flex items-center gap-1.5 cursor-pointer"
              >
                <Share2 size={14} />
                <span>Bagikan Undangan Room</span>
              </button>
            </div>

            <div className="text-[11px] text-neutral-400">
              💡 Buka aplikasi di HP atau tab browser lain untuk langsung melihat pesan tersinkronisasi secara real-time.
            </div>
          </div>
        )}

        {/* Empty state when multiple members joined but no messages yet */}
        {participants.length > 1 && messages.length === 0 && (
          <div className="text-center py-12 space-y-2">
            <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <Radio size={22} className="animate-pulse" />
            </div>
            <p className="text-sm font-semibold text-neutral-200">
              {participants.length} anggota telah terhubung di room!
            </p>
            <p className="text-xs text-neutral-400">
              Mulai percakapan dengan mengirimkan pesan atau foto pertama Anda.
            </p>
          </div>
        )}

        {/* List of Messages */}
        {messages.map((msg) => {
          const isOwn = msg.senderId === currentUserId;
          const senderColor = getParticipantColor(msg.senderId);

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} transition-opacity duration-150`}
            >
              {/* Sender Name above message bubble for other participants */}
              {!isOwn && (
                <div className="flex items-center gap-1.5 mb-1 ml-1">
                  <span className={`text-[11px] font-bold ${senderColor}`}>
                    {msg.senderName}
                  </span>
                </div>
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

        {/* Multi-user Typing indicator */}
        {typingUsers.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-neutral-400 animate-in fade-in duration-200 pt-1">
            <span className="font-medium text-emerald-400">{renderTypingText()}</span>
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

      {/* Chat Bottom Input Bar */}
      <footer className="bg-neutral-900 border-t border-neutral-800 p-2.5 sm:p-3 shrink-0">
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

      {/* Members List Modal (Supports up to 20 People) */}
      {showMembersModal && (
        <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                  <Users size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Anggota Room ({participants.length}/{maxCapacity})
                  </h3>
                  <p className="text-[11px] text-neutral-400">
                    {onlineCount} anggota sedang online
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowMembersModal(false)}
                className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-2 flex-1">
              {participants.map((participant) => {
                const isSelf = participant.uid === currentUserId;
                const isCreator = participant.uid === room.createdBy;
                const isOnline = participant.online !== false;
                const color = getParticipantColor(participant.uid);

                return (
                  <div
                    key={participant.uid}
                    className="p-3 rounded-xl bg-neutral-950 border border-neutral-800/80 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        <div className="w-9 h-9 rounded-xl bg-neutral-800 border border-neutral-700 flex items-center justify-center font-bold text-xs text-neutral-200">
                          {participant.name.charAt(0).toUpperCase()}
                        </div>
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-neutral-950 ${
                            isOnline ? 'bg-emerald-500' : 'bg-neutral-600'
                          }`}
                        />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-xs font-bold truncate ${color}`}>
                            {participant.name}
                          </span>
                          {isSelf && (
                            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-medium">
                              Anda
                            </span>
                          )}
                          {isCreator && (
                            <span className="text-[10px] bg-neutral-800 text-neutral-300 px-1.5 py-0.5 rounded border border-neutral-700">
                              Host
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-neutral-400 block">
                          {isOnline ? '🟢 Online' : '⚪ Offline'}
                        </span>
                      </div>
                    </div>

                    {!isSelf && isOnline && (
                      <button
                        onClick={() => startCallWithUser(participant)}
                        className="p-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition-colors cursor-pointer shrink-0"
                        title={`Panggil video ${participant.name}`}
                      >
                        <VideoIcon size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="p-3 bg-neutral-950 border-t border-neutral-800 flex items-center justify-between text-xs">
              <span className="text-neutral-400 font-mono">Kode: {room.code}</span>
              <button
                onClick={handleShareRoom}
                className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold rounded-lg text-xs cursor-pointer transition-colors"
              >
                <Plus size={13} />
                <span>Undang Teman</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Video Call Member Selector Modal */}
      {showCallSelector && (
        <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl flex flex-col">
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <VideoIcon size={18} className="text-emerald-400" />
                <h3 className="text-sm font-bold text-white">Pilih Anggota untuk Video Call</h3>
              </div>
              <button
                onClick={() => setShowCallSelector(false)}
                className="p-1 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-3 space-y-2 max-h-72 overflow-y-auto">
              {otherParticipants.length === 0 ? (
                <p className="text-xs text-neutral-400 text-center py-4">
                  Tidak ada anggota lain di room.
                </p>
              ) : (
                otherParticipants.map((member) => {
                  const isOnline = member.online !== false;
                  return (
                    <div
                      key={member.uid}
                      className="p-2.5 rounded-xl bg-neutral-950 border border-neutral-800 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center font-bold text-xs text-neutral-200">
                          {member.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-neutral-100">{member.name}</p>
                          <p className="text-[10px] text-neutral-400">
                            {isOnline ? '🟢 Online' : '⚪ Offline'}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => startCallWithUser(member)}
                        disabled={!isOnline}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                          isOnline
                            ? 'bg-emerald-500 hover:bg-emerald-400 text-neutral-950 shadow-md shadow-emerald-500/20'
                            : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                        }`}
                      >
                        <VideoIcon size={12} />
                        <span>Panggil</span>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Active Video Call Modal */}
      {activeCallRole && callTarget && (
        <VideoCallModal
          roomId={room.id}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          counterpartId={callTarget.uid}
          counterpartName={callTarget.name}
          role={activeCallRole}
          incomingCallSession={incomingCall}
          onClose={() => {
            setActiveCallRole(null);
            setIncomingCall(null);
            setCallTarget(null);
          }}
        />
      )}
    </div>
  );
};
