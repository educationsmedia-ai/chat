/**
 * Types for Live Chat Real-Time Multiplayer
 */

export interface RoomParticipant {
  uid: string;
  name: string;
  avatar?: string;
  email?: string;
  joinedAt?: string;
}

export type RoomStatus = 'waiting' | 'active' | 'closed';

export interface Room {
  id: string;
  code: string;
  name: string;
  status: RoomStatus;
  createdAt: any;
  createdBy: string;
  user1: RoomParticipant;
  user2?: RoomParticipant | null;
  user1Online: boolean;
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
  timestamp: any;
  read: boolean;
}

export interface LocalUserProfile {
  uid: string;
  name: string;
  email?: string;
  photoURL?: string;
}
