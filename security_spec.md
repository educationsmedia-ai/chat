# Security Specification for Live Chat 2-Person Multiplayer

## 1. Data Invariants

1. **2-Person Room Invariant**: A room cannot have more than two distinct participants (`user1` and `user2`). Any third user trying to join, write, or access must be strictly forbidden.
2. **Participant Integrity**: `user1.uid` must match `createdBy` and the auth UID of the creator upon room creation.
3. **Join Lock Invariant**: A user can only join as `user2` if `user2` is currently null/empty and the joining user is not `user1`. Once joined, `user1` and `user2` cannot be changed to another third user.
4. **Message Membership Invariant**: A message in `/rooms/{roomId}/messages/{messageId}` can only be created by an authenticated user who is an active participant (`user1` or `user2`) in that exact room.
5. **Sender Spoofing Guard**: The `senderId` of a message must match `request.auth.uid`.
6. **Message Immutability**: Messages cannot have their `text`, `senderId`, or `senderName` altered after creation. Only `read` status may be updated by the counterpart participant.
7. **Size Limits & Anti-Denial of Wallet**: Room codes are limited to 10 characters `^[A-Z0-9]{4,10}$`. Messages are limited to 2000 characters. Names are limited to 64 characters. Document IDs must conform to `isValidId()`.
8. **Default-Deny Catch-All**: All unmapped documents are blocked.

---

## 2. The "Dirty Dozen" Attack Payloads

1. **Payload 1: Third User Intrusion (Join Attack)**
   Attempt by User 3 (`attacker_uid`) to join a room where `user1` and `user2` are already assigned.
   *Target*: `rooms/ROOM123`
   *Operation*: `update`
   *Payload*: `{ user2: { uid: 'attacker_uid', name: 'Intruder' } }`
   *Expected*: `PERMISSION_DENIED`

2. **Payload 2: Sender Spoofing on Message Creation**
   User A sends a message claiming `senderId: 'victim_uid'`.
   *Target*: `rooms/ROOM123/messages/msg_01`
   *Operation*: `create`
   *Payload*: `{ senderId: 'victim_uid', senderName: 'Victim', text: 'Impersonated message', read: false }`
   *Expected*: `PERMISSION_DENIED`

3. **Payload 3: Non-Participant Message Injection**
   User C (neither `user1` nor `user2`) attempts to inject a message into room `ROOM123`.
   *Target*: `rooms/ROOM123/messages/msg_02`
   *Operation*: `create`
   *Payload*: `{ senderId: 'attacker_uid', senderName: 'Intruder', text: 'Eavesdropping', read: false }`
   *Expected*: `PERMISSION_DENIED`

4. **Payload 4: Non-Participant Room Snooping (Read Leak)**
   User C attempts to read messages in a private room `ROOM123`.
   *Target*: `rooms/ROOM123/messages`
   *Operation*: `list` or `get`
   *Expected*: `PERMISSION_DENIED`

5. **Payload 5: Oversized Message Injection (Denial of Wallet)**
   User 1 attempts to send a 500KB text payload into chat.
   *Target*: `rooms/ROOM123/messages/msg_03`
   *Operation*: `create`
   *Payload*: `{ senderId: 'user1_uid', senderName: 'Alice', text: 'A'.repeat(50000), read: false }`
   *Expected*: `PERMISSION_DENIED`

6. **Payload 6: Room Creator Overwrite (Takeover Attack)**
   User 2 attempts to change `createdBy` and `user1` to seize room ownership.
   *Target*: `rooms/ROOM123`
   *Operation*: `update`
   *Payload*: `{ createdBy: 'user2_uid', user1: { uid: 'user2_uid', name: 'Bob' } }`
   *Expected*: `PERMISSION_DENIED`

7. **Payload 7: Unauthenticated Room Creation**
   Unauthenticated user attempts to create a room.
   *Target*: `rooms/GUEST1`
   *Operation*: `create`
   *Payload*: `{ code: 'GUEST1', createdBy: 'anon', status: 'waiting' }`
   *Expected*: `PERMISSION_DENIED`

8. **Payload 8: Message Text Tampering (History Rewrite)**
   User 1 attempts to rewrite the content of a previously sent message.
   *Target*: `rooms/ROOM123/messages/msg_01`
   *Operation*: `update`
   *Payload*: `{ text: 'Altered statement' }`
   *Expected*: `PERMISSION_DENIED`

9. **Payload 9: Ghost Field Injection (Shadow Update)**
   User attempts to inject unexpected administrative fields `isAdmin: true` or `bypassRules: true` into a room document.
   *Target*: `rooms/ROOM123`
   *Operation*: `update`
   *Payload*: `{ status: 'active', isAdmin: true, secretAccess: 'granted' }`
   *Expected*: `PERMISSION_DENIED`

10. **Payload 10: Invalid Room Code Format Injection (ID Poisoning)**
    User attempts to create a room with an illegal path / script injection code `../../system`.
    *Target*: `rooms/<script>`
    *Operation*: `create`
    *Expected*: `PERMISSION_DENIED`

11. **Payload 11: Self-Join as Both Users (Ghost Room)**
    User 1 attempts to set both `user1` and `user2` to their own UID to lock the room.
    *Target*: `rooms/ROOM123`
    *Operation*: `update`
    *Payload*: `{ user2: { uid: 'user1_uid', name: 'Alice Clone' } }`
    *Expected*: `PERMISSION_DENIED`

12. **Payload 12: Premature Status Forcing to Terminal Closed State**
    Non-member attempts to close a room.
    *Target*: `rooms/ROOM123`
    *Operation*: `update`
    *Payload*: `{ status: 'closed' }`
    *Expected*: `PERMISSION_DENIED`

---

## 3. Test Runner
Defined in `firestore.rules.test.ts`.
