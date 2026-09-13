import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  PhoneOff,
  SwitchCamera,
  AlertCircle,
  Users,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import {
  rtcIceServers,
  createCallSession,
  answerCallSession,
  updateCallStatus,
  addIceCandidate,
  listenToCallSession,
  listenToIceCandidates,
} from '../firebase';
import { playCallEndSound, stopRingtone } from '../sound';
import type { CallSession } from '../types';

interface VideoCallModalProps {
  roomId: string;
  currentUserId: string;
  currentUserName: string;
  counterpartId: string;
  counterpartName: string;
  role: 'caller' | 'receiver';
  incomingCallSession?: CallSession | null;
  onClose: () => void;
}

export const VideoCallModal: React.FC<VideoCallModalProps> = ({
  roomId,
  currentUserId,
  currentUserName,
  counterpartId,
  counterpartName,
  role,
  incomingCallSession,
  onClose,
}) => {
  const [callStatus, setCallStatus] = useState<'initiating' | 'ringing' | 'connected' | 'ended' | 'error'>(
    role === 'caller' ? 'initiating' : 'ringing'
  );
  const [callId, setCallId] = useState<string | null>(incomingCallSession?.id || null);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isVideoDisabled, setIsVideoDisabled] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isCleanedUpRef = useRef<boolean>(false);

  // Format call duration MM:SS
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Safe cleanup for media stream and peer connection
  const cleanupMediaAndPeer = () => {
    if (isCleanedUpRef.current) return;
    isCleanedUpRef.current = true;

    stopRingtone();

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      localStreamRef.current = null;
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
  };

  // End or reject call
  const handleEndCall = async () => {
    playCallEndSound();
    if (callId) {
      const targetStatus = callStatus === 'connected' ? 'ended' : 'rejected';
      await updateCallStatus(roomId, callId, targetStatus).catch(() => {});
    }
    cleanupMediaAndPeer();
    onClose();
  };

  // Toggle Microphone
  const handleToggleMute = () => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      if (audioTracks.length > 0) {
        const nextState = !isMuted;
        audioTracks.forEach((track) => {
          track.enabled = !nextState;
        });
        setIsMuted(nextState);
      }
    }
  };

  // Toggle Video / Camera
  const handleToggleVideo = () => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      if (videoTracks.length > 0) {
        const nextState = !isVideoDisabled;
        videoTracks.forEach((track) => {
          track.enabled = !nextState;
        });
        setIsVideoDisabled(nextState);
      }
    }
  };

  // Flip Camera (Front / Back on mobile)
  const handleFlipCamera = async () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);

    if (localStreamRef.current && peerConnectionRef.current) {
      try {
        const oldVideoTrack = localStreamRef.current.getVideoTracks()[0];
        if (oldVideoTrack) oldVideoTrack.stop();

        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: nextMode },
        });
        const newVideoTrack = newStream.getVideoTracks()[0];

        // Replace track in peer connection
        const senders = peerConnectionRef.current.getSenders();
        const videoSender = senders.find((s) => s.track?.kind === 'video');
        if (videoSender) {
          await videoSender.replaceTrack(newVideoTrack);
        }

        // Replace track in local stream
        localStreamRef.current.removeTrack(oldVideoTrack);
        localStreamRef.current.addTrack(newVideoTrack);

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
        }
      } catch (err) {
        console.warn('Could not flip camera:', err);
      }
    }
  };

  // WebRTC Lifecycle Setup
  useEffect(() => {
    let unsubscribeCall: (() => void) | null = null;
    let unsubscribeIce: (() => void) | null = null;

    const setupWebRTC = async () => {
      try {
        // 1. Get Camera & Microphone Permissions
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user',
          },
          audio: true,
        });

        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // 2. Initialize RTCPeerConnection
        const pc = new RTCPeerConnection(rtcIceServers);
        peerConnectionRef.current = pc;

        // Add local tracks to peer connection
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });

        // Remote stream received
        pc.ontrack = (event) => {
          if (remoteVideoRef.current && event.streams[0]) {
            remoteVideoRef.current.srcObject = event.streams[0];
          }
        };

        // 3. Handle Caller vs Receiver Flow
        if (role === 'caller') {
          setCallStatus('ringing');

          // Collect local ICE candidates for caller
          let currentSessionId: string | null = null;
          const queuedCandidates: RTCIceCandidate[] = [];

          pc.onicecandidate = (event) => {
            if (event.candidate) {
              if (currentSessionId) {
                addIceCandidate(roomId, currentSessionId, 'caller', event.candidate);
              } else {
                queuedCandidates.push(event.candidate);
              }
            }
          };

          // Create Offer
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          const newCallId = await createCallSession(
            roomId,
            { uid: currentUserId, name: currentUserName },
            counterpartId,
            { type: offer.type, sdp: offer.sdp }
          );
          currentSessionId = newCallId;
          setCallId(newCallId);

          // Flush any early candidates
          for (const cand of queuedCandidates) {
            addIceCandidate(roomId, newCallId, 'caller', cand);
          }

          // Listen to call doc for Answer from Receiver
          unsubscribeCall = listenToCallSession(roomId, newCallId, async (call) => {
            if (!call) {
              setCallStatus('ended');
              handleEndCall();
              return;
            }

            if (call.status === 'accepted' && call.answer && !pc.currentRemoteDescription) {
              await pc.setRemoteDescription(new RTCSessionDescription(call.answer));
              setCallStatus('connected');
              stopRingtone();

              // Start duration timer
              timerRef.current = setInterval(() => {
                setDuration((prev) => prev + 1);
              }, 1000);
            } else if (call.status === 'rejected' || call.status === 'ended') {
              setCallStatus('ended');
              playCallEndSound();
              setTimeout(onClose, 1500);
            }
          });

          // Listen to Receiver's ICE candidates
          unsubscribeIce = listenToIceCandidates(roomId, newCallId, 'receiver', async (cand) => {
            try {
              if (pc.remoteDescription) {
                await pc.addIceCandidate(new RTCIceCandidate(cand));
              }
            } catch (e) {
              console.warn('ICE candidate addition failed:', e);
            }
          });
        } else if (role === 'receiver' && incomingCallSession) {
          // Receiver Flow
          const activeCallId = incomingCallSession.id;
          setCallId(activeCallId);

          pc.onicecandidate = (event) => {
            if (event.candidate) {
              addIceCandidate(roomId, activeCallId, 'receiver', event.candidate);
            }
          };

          // Set Remote Description (Caller's Offer)
          if (incomingCallSession.offer) {
            await pc.setRemoteDescription(new RTCSessionDescription(incomingCallSession.offer));
          }

          // Create & Send Answer
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          await answerCallSession(roomId, activeCallId, {
            type: answer.type,
            sdp: answer.sdp,
          });

          setCallStatus('connected');
          stopRingtone();

          // Start duration timer
          timerRef.current = setInterval(() => {
            setDuration((prev) => prev + 1);
          }, 1000);

          // Listen to Caller's ICE candidates
          unsubscribeIce = listenToIceCandidates(roomId, activeCallId, 'caller', async (cand) => {
            try {
              if (pc.remoteDescription) {
                await pc.addIceCandidate(new RTCIceCandidate(cand));
              }
            } catch (e) {
              console.warn('ICE candidate addition failed:', e);
            }
          });

          // Listen for call termination
          unsubscribeCall = listenToCallSession(roomId, activeCallId, (call) => {
            if (!call || call.status === 'ended' || call.status === 'rejected') {
              setCallStatus('ended');
              playCallEndSound();
              setTimeout(onClose, 1500);
            }
          });
        }
      } catch (err: any) {
        console.error('WebRTC error:', err);
        setCallStatus('error');
        if (err.name === 'NotAllowedError') {
          setErrorMessage('Izin Kamera/Mikrofon ditolak oleh browser. Harap izinkan akses kamera & mikrofon.');
        } else if (err.name === 'NotFoundError') {
          setErrorMessage('Kamera atau mikrofon tidak terdeteksi pada perangkat ini.');
        } else {
          setErrorMessage(err.message || 'Gagal memulai koneksi video call.');
        }
      }
    };

    setupWebRTC();

    return () => {
      if (unsubscribeCall) unsubscribeCall();
      if (unsubscribeIce) unsubscribeIce();
      cleanupMediaAndPeer();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col justify-between items-center select-none overflow-hidden animate-in fade-in duration-200">
      {/* Top Header Bar */}
      <header className="absolute top-0 left-0 right-0 z-20 p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between text-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold text-sm">
            {counterpartName.charAt(0).toUpperCase()}
          </div>
          <div>
            <h3 className="font-bold text-sm sm:text-base leading-tight drop-shadow-md">
              {counterpartName}
            </h3>
            <p className="text-xs text-neutral-300 drop-shadow-sm flex items-center gap-1.5 mt-0.5">
              {callStatus === 'connected' ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
                  <span className="font-mono text-emerald-300 font-medium">{formatDuration(duration)}</span>
                </>
              ) : callStatus === 'ringing' ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse inline-block" />
                  <span>Berdering... Menunggu jawaban</span>
                </>
              ) : callStatus === 'initiating' ? (
                <span>Menghubungkan kamera...</span>
              ) : callStatus === 'ended' ? (
                <span className="text-rose-400">Panggilan Berakhir</span>
              ) : (
                <span className="text-rose-400">Terjadi Kendala</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Flip camera on mobile */}
          <button
            onClick={handleFlipCamera}
            className="p-2.5 rounded-full bg-neutral-800/80 hover:bg-neutral-700 text-white backdrop-blur-md transition-colors cursor-pointer"
            title="Balik Kamera"
          >
            <SwitchCamera size={18} />
          </button>
        </div>
      </header>

      {/* Main Video View Area */}
      <div className="relative w-full h-full flex items-center justify-center bg-neutral-950">
        {/* Remote Video (Full Screen) */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className={`w-full h-full object-cover ${
            callStatus !== 'connected' ? 'hidden' : 'block'
          }`}
        />

        {/* Placeholder when not connected yet */}
        {callStatus !== 'connected' && (
          <div className="text-center p-6 space-y-4 max-w-sm mx-auto animate-pulse">
            <div className="w-24 h-24 mx-auto rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Users size={40} />
            </div>
            <div>
              <h4 className="text-lg font-bold text-white">{counterpartName}</h4>
              <p className="text-xs text-neutral-400 mt-1">
                {callStatus === 'ringing'
                  ? 'Menghubungkan video call real-time...'
                  : 'Menyiapkan media browser...'}
              </p>
            </div>
          </div>
        )}

        {/* Error Alert Display */}
        {errorMessage && (
          <div className="absolute top-20 max-w-md mx-4 p-4 rounded-2xl bg-rose-500/20 border border-rose-500/40 backdrop-blur-md text-rose-200 text-xs flex items-start gap-3 z-30">
            <AlertCircle size={18} className="shrink-0 text-rose-400 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-white">Gagal Mengakses Kamera/Audio</p>
              <p className="mt-1 leading-relaxed">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* Local Video Preview (Picture-in-Picture Floating Window) */}
        <div className="absolute bottom-24 right-4 sm:bottom-28 sm:right-6 w-28 h-40 sm:w-36 sm:h-52 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20 bg-neutral-900 z-20">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${
              facingMode === 'user' ? 'scale-x-[-1]' : ''
            } ${isVideoDisabled ? 'hidden' : 'block'}`}
          />
          {isVideoDisabled && (
            <div className="w-full h-full flex flex-col items-center justify-center bg-neutral-800 text-neutral-400 text-xs gap-1">
              <VideoOff size={20} />
              <span>Kamera Mati</span>
            </div>
          )}
          <div className="absolute bottom-1 left-2 text-[10px] text-white font-medium drop-shadow-md">
            Anda
          </div>
        </div>
      </div>

      {/* Bottom Control Bar */}
      <footer className="absolute bottom-0 left-0 right-0 z-20 p-5 pb-8 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex items-center justify-center gap-4 sm:gap-6">
        {/* Toggle Audio Mute */}
        <button
          id="toggle-mic-btn"
          onClick={handleToggleMute}
          className={`p-3.5 rounded-full backdrop-blur-md transition-all cursor-pointer ${
            isMuted
              ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30'
              : 'bg-neutral-800/90 text-white hover:bg-neutral-700'
          }`}
          title={isMuted ? 'Nyalakan Mikrofon' : 'Matikan Mikrofon'}
        >
          {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
        </button>

        {/* Toggle Video Camera */}
        <button
          id="toggle-video-btn"
          onClick={handleToggleVideo}
          className={`p-3.5 rounded-full backdrop-blur-md transition-all cursor-pointer ${
            isVideoDisabled
              ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30'
              : 'bg-neutral-800/90 text-white hover:bg-neutral-700'
          }`}
          title={isVideoDisabled ? 'Nyalakan Kamera' : 'Matikan Kamera'}
        >
          {isVideoDisabled ? <VideoOff size={22} /> : <VideoIcon size={22} />}
        </button>

        {/* End Call Button */}
        <button
          id="end-call-btn"
          onClick={handleEndCall}
          className="p-4 rounded-full bg-rose-600 hover:bg-rose-500 text-white shadow-xl shadow-rose-600/40 transition-transform active:scale-95 cursor-pointer"
          title="Akhiri Panggilan"
        >
          <PhoneOff size={24} />
        </button>
      </footer>
    </div>
  );
};
