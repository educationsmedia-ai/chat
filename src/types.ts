/**
 * Types for Live Chat Real-Time Multiplayer
 */

export interface RoomParticipant {
  uid: string;
  name: string;
  avatar?: string;
  email?: string;
  joinedAt?: string;
  online?: boolean;
  typing?: boolean;
}

export type RoomStatus = 'waiting' | 'active' | 'closed';

export interface Room {
  id: string;
  code: string;
  name: string;
  status: RoomStatus;
  createdAt: any;
  createdBy: string;
  maxParticipants: number;
  participantCount: number;
  participantIds: string[];
  participants: Record<string, RoomParticipant>;
  // Legacy compatibility fields
  user1?: RoomParticipant;
  user2?: RoomParticipant | null;
  user1Online?: boolean;
  user2Online?: boolean;
  user1Typing?: boolean;
  user2Typing?: boolean;
  closedAt?: any;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  imageUrl?: string;
  timestamp: any;
  read: boolean;
}

export type CallStatus = 'ringing' | 'accepted' | 'rejected' | 'ended' | 'busy';

export interface CallSession {
  id: string;
  callerId: string;
  callerName: string;
  receiverId: string;
  status: CallStatus;
  offer?: {
    type: 'offer';
    sdp: string;
  };
  answer?: {
    type: 'answer';
    sdp: string;
  };
  createdAt?: any;
}

export interface LocalUserProfile {
  uid: string;
  name: string;
  email?: string;
  photoURL?: string;
}
