# Socket.IO Chat — Frontend Integration Guide

> **Base URL**: `http://localhost:8080` (replace with your production URL)  
> **Transport**: Socket.IO v4 (WebSocket + polling fallback)  
> **Authentication**: JWT token sent on connection handshake (**required**)

---

## Table of Contents

1. [Connection Setup](#1-connection-setup)
2. [Data Models](#2-data-models)
3. [Client → Server Events](#3-client--server-events)
   - [join_chat](#31-join_chat)
   - [send_message](#32-send_message)
   - [typing / stop_typing](#33-typing--stop_typing)
   - [get_chat_list](#34-get_chat_list)
   - [get_message_list](#35-get_message_list)
   - [delete_message](#36-delete_message)
   - [mark_messages_read](#37-mark_messages_read)
4. [Server → Client Events](#4-server--client-events)
   - [user_online](#41-user_online)
   - [user_offline](#42-user_offline)
   - [online_users_list](#43-online_users_list)
   - [receive_message](#44-receive_message)
   - [update_chat_list](#45-update_chat_list)
   - [new_chat](#46-new_chat)
   - [typing / stop_typing](#47-typing--stop_typing)
   - [message_deleted](#48-message_deleted)
   - [messages_read_update](#49-messages_read_update)
5. [HTTP REST Endpoints](#5-http-rest-endpoints)
6. [Error Response Format](#6-error-response-format)
7. [Full React / Next.js Example](#7-full-react--nextjs-example)

---

## 1. Connection Setup

### Install

```bash
npm install socket.io-client
```

### Connect (with auth)

```js
import { io } from "socket.io-client";

const socket = io("http://localhost:8080", {
  auth: {
    token: "YOUR_JWT_TOKEN",   // Required — must be a valid Bearer token
  },
  transports: ["websocket"],   // Optional: force WebSocket only
});

socket.on("connect", () => {
  console.log("Connected:", socket.id);
});

socket.on("connect_error", (err) => {
  console.error("Connection failed:", err.message);
  // Likely: invalid/missing token
});

socket.on("disconnect", (reason) => {
  console.log("Disconnected:", reason);
});
```

> **Note**: The token is validated on the server. If invalid or missing, the connection will be rejected with `connect_error`.

---

## 2. Data Models

### Chat Object

Returned by `get_chat_list`, `update_chat_list`, `new_chat`.

```json
{
  "_id": "65c4a1f2b39a2e110000001",
  "participants": [
    {
      "_id": "698072a07c409d5a242e3c54",
      "firstName": "John",
      "lastName": "Doe",
      "profileImage": "http://localhost:8080/uploads/temp/photo.jpg",
      "isOnline": true
    },
    {
      "_id": "698072a07c409d5a242e3c55",
      "firstName": "Jane",
      "lastName": "Smith",
      "profileImage": "http://localhost:8080/uploads/temp/photo2.jpg",
      "isOnline": false
    }
  ],
  "lastMessage": {
    "content": "Hey there!",
    "sender": "698072a07c409d5a242e3c54",
    "createdAt": "2026-02-20T09:30:00.000Z"
  },
  "unreadCount": 3,
  "otherUser": {
    "_id": "698072a07c409d5a242e3c55",
    "firstName": "Jane",
    "lastName": "Smith",
    "profileImage": "http://localhost:8080/uploads/temp/photo2.jpg",
    "isOnline": false
  },
  "blockedBy": [],
  "createdAt": "2026-02-01T10:00:00.000Z",
  "updatedAt": "2026-02-20T09:30:00.000Z"
}
```

| Field | Type | Description |
|---|---|---|
| `_id` | `string` | Unique chat room ID |
| `participants` | `User[]` | Both users in the chat |
| `participants[].isOnline` | `boolean` | Live online status |
| `lastMessage` | `object` | Last sent message summary |
| `unreadCount` | `number` | Unread count **for you** (user-specific) |
| `otherUser` | `User` | The other participant (convenience field) |
| `blockedBy` | `string[]` | User IDs who blocked this chat |

---

### Message Object

Returned by `send_message` (ack), `receive_message`, `get_message_list`.

```json
{
  "_id": "65c4a1f2b39a2e110000002",
  "chat": "65c4a1f2b39a2e110000001",
  "sender": {
    "_id": "698072a07c409d5a242e3c54",
    "firstName": "John",
    "lastName": "Doe",
    "profileImage": "http://localhost:8080/uploads/temp/photo.jpg"
  },
  "content": "Hello world!",
  "fileUrl": null,
  "fileType": null,
  "readBy": ["698072a07c409d5a242e3c54"],
  "isDeletedForEveryone": false,
  "deletedFor": [],
  "createdAt": "2026-02-20T09:31:00.000Z",
  "updatedAt": "2026-02-20T09:31:00.000Z"
}
```

| Field | Type | Description |
|---|---|---|
| `_id` | `string` | Unique message ID |
| `chat` | `string` | Parent chat room ID |
| `sender` | `User` | Populated sender object |
| `content` | `string` | Text content (empty string if file-only) |
| `fileUrl` | `string \| null` | Full URL of attached file |
| `fileType` | `"image" \| "video" \| "document" \| "audio" \| null` | Type of attached file |
| `readBy` | `string[]` | IDs of users who have read this message |
| `isDeletedForEveryone` | `boolean` | True if deleted for all participants |
| `deletedFor` | `string[]` | IDs for users who deleted for themselves |

---

## 3. Client → Server Events

All events support an optional **acknowledgement callback** (ack). If you pass a callback as the last argument to `socket.emit()`, the server will call it with the result instead of emitting a separate event.

---

### 3.1 `join_chat`

Joins a specific chat room to receive real-time messages.  
**Call this every time you open a chat conversation.**

```js
socket.emit("join_chat", { chatId: "65c4a1f2b39a2e110000001" });
```

**Payload:**

| Field | Type | Required | Description |
|---|---|---|---|
| `chatId` | `string` | ✅ | The ID of the chat room to join |

> No response/ack from server. Silently joins the room.

---

### 3.2 `send_message`

Sends a new message. Supports two scenarios:

- **Scenario A**: Provide `chatId` — sends to an existing chat.
- **Scenario B**: Provide `receiverId` — server finds an existing chat or **creates a new one**.

At least one of `content` or `fileUrl` is required.

```js
// Text message to existing chat
socket.emit("send_message", {
  chatId: "65c4a1f2b39a2e110000001",
  content: "Hello!",
}, (ack) => {
  if (ack.status === "ok") {
    console.log("Sent:", ack.data);   // Message object
    console.log("Chat ID:", ack.chatId);
  } else {
    console.error(ack.message);
  }
});

// Start a new chat with a user by receiverId
socket.emit("send_message", {
  receiverId: "698072a07c409d5a242e3c55",
  content: "Hey, let's talk!",
}, (ack) => { ... });

// Send a file (upload first via REST, then pass URL)
socket.emit("send_message", {
  chatId: "65c4a1f2b39a2e110000001",
  fileUrl: "http://localhost:8080/uploads/chat/image.jpg",
  fileType: "image",
}, (ack) => { ... });
```

**Payload:**

| Field | Type | Required | Description |
|---|---|---|---|
| `chatId` | `string` | Either `chatId` or `receiverId` required | Existing chat room ID |
| `receiverId` | `string` | Either `chatId` or `receiverId` required | Target user ID |
| `content` | `string` | Either `content` or `fileUrl` required | Text content |
| `fileUrl` | `string (URL)` | Either `content` or `fileUrl` required | Pre-uploaded file URL |
| `fileType` | `"image" \| "video" \| "document" \| "audio"` | Optional | Type of file |

**Ack Response (success):**

```json
{
  "status": "ok",
  "data": { /* Message Object */ },
  "chatId": "65c4a1f2b39a2e110000001"
}
```

**Ack Response (error):**

```json
{
  "status": "error",
  "message": "Cannot chat with yourself"
}
```

**Possible error messages:**
- `"Chat not found"` — invalid `chatId`
- `"Cannot chat with yourself"` — `receiverId` is same as current user
- `"You cannot message in this conversation."` — chat is blocked
- `"Internal Server Error"` — unexpected server error

---

### 3.3 `typing` / `stop_typing`

Notifies other participants that the current user is typing or stopped.

```js
// User starts typing
socket.emit("typing", { chatId: "65c4a1f2b39a2e110000001" });

// User stops typing
socket.emit("stop_typing", { chatId: "65c4a1f2b39a2e110000001" });
```

**Payload:**

| Field | Type | Required |
|---|---|---|
| `chatId` | `string` | ✅ |

> No ack. Server re-emits to **other** room participants only (not back to sender).

---

### 3.4 `get_chat_list`

Fetches the list of conversations for the current user, sorted by most recent message.

```js
socket.emit("get_chat_list", { page: 1, limit: 20 }, (ack) => {
  if (ack.status === "ok") {
    console.log("Chats:", ack.data); // Array of Chat Objects
  }
});
```

**Payload:**

| Field | Type | Required | Default |
|---|---|---|---|
| `page` | `number` | Optional | `1` |
| `limit` | `number` | Optional | `20` |

**Ack Response (success):**

```json
{
  "status": "ok",
  "data": [ /* Array of Chat Objects */ ]
}
```

> **Postman / no-ack mode**: If no callback is provided, server emits `get_chat_list_response` with the same payload.

---

### 3.5 `get_message_list`

Fetches messages for a specific chat room (paginated, newest first).  
Also resets the unread count for this user to `0`.

```js
socket.emit("get_message_list", {
  chatId: "65c4a1f2b39a2e110000001",
  page: 1,
  limit: 50,
}, (ack) => {
  if (ack.status === "ok") {
    // Messages are newest-first; reverse to display oldest first
    const messages = ack.data.reverse();
  }
});
```

**Payload:**

| Field | Type | Required | Default |
|---|---|---|---|
| `chatId` | `string` | ✅ | — |
| `page` | `number` | Optional | `1` |
| `limit` | `number` | Optional | `50` |

**Ack Response (success):**

```json
{
  "status": "ok",
  "data": [ /* Array of Message Objects, newest first */ ]
}
```

**Ack Response (error):**

```json
{ "status": "error", "message": "Chat not found" }
```

> **Postman / no-ack mode**: Server emits `get_message_list_response`.

> ⚠️ Messages filtered: `isDeletedForEveryone: false` AND not in `deletedFor` for current user.

---

### 3.6 `delete_message`

Deletes a message either just for yourself or for everyone.

```js
// Delete for yourself only
socket.emit("delete_message", {
  messageId: "65c4a1f2b39a2e110000002",
  deleteType: "me",
}, (ack) => {
  console.log(ack.status); // "ok"
});

// Delete for everyone (only sender can do this)
socket.emit("delete_message", {
  messageId: "65c4a1f2b39a2e110000002",
  deleteType: "everyone",
}, (ack) => {
  if (ack.status === "ok") {
    // Server broadcasts "message_deleted" to the entire room
  }
});
```

**Payload:**

| Field | Type | Required | Description |
|---|---|---|---|
| `messageId` | `string` | ✅ | ID of the message to delete |
| `deleteType` | `"me" \| "everyone"` | ✅ | Scope of deletion |

**Ack Response (success):**

```json
{ "status": "ok" }
```

**Ack Response (error):**

```json
{ "status": "error", "message": "Unauthorized" }
```

**Possible errors:**
- `"Message not found"` — invalid `messageId`
- `"Unauthorized"` — trying to delete-for-everyone a message you didn't send

---

### 3.7 `mark_messages_read`

Marks all messages in a chat as read for the current user and resets the unread count.

```js
socket.emit("mark_messages_read", {
  chatId: "65c4a1f2b39a2e110000001"
}, (ack) => {
  // ack.status === "ok"
});
```

**Payload:**

| Field | Type | Required |
|---|---|---|
| `chatId` | `string` | ✅ |

> Server also broadcasts `messages_read_update` to the entire chat room.

---

## 4. Server → Client Events

Listen to these on your socket instance throughout the app lifetime.

---

### 4.1 `user_online`

Emitted to **all connected clients** when a user connects.

```js
socket.on("user_online", ({ userId }) => {
  // Mark userId as online in your UI
});
```

**Payload:** `{ userId: string }`

---

### 4.2 `user_offline`

Emitted to **all connected clients** when a user disconnects.

```js
socket.on("user_offline", ({ userId }) => {
  // Mark userId as offline in your UI
});
```

**Payload:** `{ userId: string }`

---

### 4.3 `online_users_list`

Emitted **only to the newly connected socket** upon connection. Contains all currently online user IDs.

```js
socket.on("online_users_list", ({ userIds }) => {
  // Initialize your online status map
  // userIds: string[]
});
```

**Payload:** `{ userIds: string[] }`

---

### 4.4 `receive_message`

Emitted to **all room participants except the sender** when a new message is sent.

```js
socket.on("receive_message", (message) => {
  // Append message to current chat UI
  // message: Message Object
});
```

**Payload:** Full [Message Object](#message-object)

> The **sender** receives the message via the `send_message` ack callback, not this event.

---

### 4.5 `update_chat_list`

Emitted to **each participant individually** (with correct unread count) after a message is sent.  
Use this to refresh the chat list/inbox without needing to re-fetch.

```js
socket.on("update_chat_list", (chat) => {
  // Update the chat in your chats list state
  // chat: Chat Object (with unreadCount specific to you)
});
```

**Payload:** Full [Chat Object](#chat-object)

---

### 4.6 `new_chat`

Emitted **to the receiver** when someone starts a new conversation with them for the first time.

```js
socket.on("new_chat", (chat) => {
  // Add this new chat to your chats list
  // chat: Chat Object
});
```

**Payload:** Full [Chat Object](#chat-object)

---

### 4.7 `typing` / `stop_typing`

Emitted to **other room participants** when someone is typing or stops.

```js
socket.on("typing", ({ chatId, userId }) => {
  // Show "John is typing..." in chatId room
});

socket.on("stop_typing", ({ chatId, userId }) => {
  // Hide typing indicator
});
```

**Payload:** `{ chatId: string, userId: string }`

---

### 4.8 `message_deleted`

Emitted to **the entire chat room** when a message is deleted for everyone.

```js
socket.on("message_deleted", ({ messageId }) => {
  // Remove or replace message with "This message was deleted"
});
```

**Payload:** `{ messageId: string }`

---

### 4.9 `messages_read_update`

Emitted to **the entire chat room** when a user reads all messages.

```js
socket.on("messages_read_update", ({ chatId, userId }) => {
  // Update read receipts in your UI for chatId
  // userId read all messages in this chat
});
```

**Payload:** `{ chatId: string, userId: string }`

---

## 5. HTTP REST Endpoints

These are regular HTTP endpoints used alongside the socket.

### Upload a File

Upload a file before sending it via `send_message`.

```
POST /api/chat/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Body (form-data):**

| Key | Type |
|---|---|
| `file` | Binary |

**Response:**

```json
{
  "status": 200,
  "message": "File uploaded successfully",
  "data": {
    "fileUrl": "http://localhost:8080/uploads/chat/filename.jpg",
    "fileType": "image/jpeg"
  }
}
```

Pass `fileUrl` and a mapped `fileType` to `send_message`.

---

## 6. Error Response Format

All ack error responses follow this shape:

```json
{
  "status": "error",
  "message": "Descriptive error message"
}
```

All ack success responses follow this shape:

```json
{
  "status": "ok",
  "data": { /* ... */ }
}
```

---

## 7. Full React / Next.js Example

```jsx
// hooks/useSocket.js
import { useEffect, useRef } from "react";
import { io } from "socket.io-client";

export function useSocket(token) {
  const socketRef = useRef(null);

  useEffect(() => {
    if (!token) return;

    const socket = io("http://localhost:8080", {
      auth: { token },
      transports: ["websocket"],
    });

    socketRef.current = socket;

    // 1. Online presence
    socket.on("online_users_list", ({ userIds }) => {
      // Initialize online map
    });
    socket.on("user_online", ({ userId }) => { /* mark online */ });
    socket.on("user_offline", ({ userId }) => { /* mark offline */ });

    // 2. Incoming message
    socket.on("receive_message", (message) => {
      // Append to conversation state
    });

    // 3. Chat list updates
    socket.on("update_chat_list", (chat) => {
      // Update conversation in list
    });

    socket.on("new_chat", (chat) => {
      // Add new conversation to list
    });

    // 4. Typing
    socket.on("typing", ({ chatId, userId }) => { /* show typing */ });
    socket.on("stop_typing", ({ chatId, userId }) => { /* hide typing */ });

    // 5. Deletion & read receipts
    socket.on("message_deleted", ({ messageId }) => { /* remove msg */ });
    socket.on("messages_read_update", ({ chatId, userId }) => { /* update receipts */ });

    return () => socket.disconnect();
  }, [token]);

  return socketRef;
}
```

```jsx
// components/Chat.jsx (usage example)
import { useSocket } from "@/hooks/useSocket";

export default function ChatPage() {
  const token = localStorage.getItem("token");
  const socketRef = useSocket(token);

  function openChat(chatId) {
    const socket = socketRef.current;
    socket.emit("join_chat", { chatId });
    socket.emit("get_message_list", { chatId, page: 1, limit: 50 }, (ack) => {
      if (ack.status === "ok") {
        setMessages(ack.data.reverse());
      }
    });
  }

  function sendMessage(chatId, content) {
    const socket = socketRef.current;
    socket.emit("send_message", { chatId, content }, (ack) => {
      if (ack.status === "ok") {
        setMessages((prev) => [...prev, ack.data]);
      }
    });
  }

  function startTyping(chatId) {
    socketRef.current.emit("typing", { chatId });
  }

  function stopTyping(chatId) {
    socketRef.current.emit("stop_typing", { chatId });
  }

  function markRead(chatId) {
    socketRef.current.emit("mark_messages_read", { chatId });
  }

  // ... render
}
```

---

## Quick Reference Table

| Direction | Event | Purpose |
|---|---|---|
| C→S | `join_chat` | Subscribe to a chat room |
| C→S | `send_message` | Send text or file message |
| C→S | `typing` | Start typing indicator |
| C→S | `stop_typing` | Stop typing indicator |
| C→S | `get_chat_list` | Fetch conversation list |
| C→S | `get_message_list` | Fetch messages in a chat |
| C→S | `delete_message` | Delete a message |
| C→S | `mark_messages_read` | Reset unread count |
| S→C | `user_online` | A user came online |
| S→C | `user_offline` | A user went offline |
| S→C | `online_users_list` | Initial online users list |
| S→C | `receive_message` | New incoming message |
| S→C | `update_chat_list` | Refresh chat inbox item |
| S→C | `new_chat` | A new conversation was started |
| S→C | `typing` | Someone is typing |
| S→C | `stop_typing` | Someone stopped typing |
| S→C | `message_deleted` | A message was deleted for everyone |
| S→C | `messages_read_update` | Messages were read by a user |
