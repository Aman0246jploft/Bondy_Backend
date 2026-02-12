# Chat Module Documentation

This document details the Socket.IO events and data structures for the Chat module.

## Connection
- **URL**: `ws://<backend_url>`
- **Path**: `/socket.io/`
- **Auth**: JWT Token required in handshake auth.
  ```json
  {
    "auth": {
      "token": "YOUR_JWT_TOKEN"
    }
  }
  ```

## HTTP API Endpoints

### 1. Upload File
- **URL**: `POST /api/chat/upload`
- **Headers**: `Authorization: Bearer <token>`, `Content-Type: multipart/form-data`
- **Body**: `file` (Binary)
- **Response**:
  ```json
  {
    "status": 200,
    "message": "File uploaded successfully",
    "data": {
      "fileUrl": "https://backend/uploads/filename.jpg",
      "fileType": "image/jpeg"
    }
  }
  ```

## Socket Events (Client -> Server)

### 1. Join Chat (`join_chat`)
*Description*: Joins a specific chat room.
*Payload*:
```json
{
  "chatId": "65c4a..."
}
```

### 2. Send Message (`send_message`)
*Description*: Sends a new message. If `chatId` is missing but `receiverId` is provided, it finds or creates a one-on-one chat.
*Payload*:
```json
{
  "chatId": "65c4a...",       // Optional if receiverId is present
  "receiverId": "65c4b...",   // Optional if chatId is present
  "content": "Hello world",
  "fileUrl": "https://...",   // Optional
  "fileType": "image"         // Optional: 'image', 'video', 'document', 'audio'
}
```
*Ack (Response)*:
```json
{
  "status": "ok",
  "data": { ...messageObject... },
  "chatId": "65c4a..."
}
```

### 3. Typing (`typing`) / Stop Typing (`stop_typing`)
*Description*: Notifies other participants that user is typing.
*Payload*:
```json
{
  "chatId": "65c4a..."
}
```

### 4. Get Chat List (`get_chat_list`)
*Description*: Fetches user's conversation list with headers.
*Payload*:
```json
{
  "page": 1,
  "limit": 20
}
```
  "limit": 20
}
```
*Ack (Response)*:
```json
{
  "status": "ok",
  "data": [ ...chatObjects... ]
}
```
*Note*: If `ack` callback is not provided (e.g. Postman), server emits `get_chat_list_response` with the same payload.

### 5. Get Message List (`get_message_list`)
*Description*: Fetches messages for a specific chat.
*Payload*:
```json
{
  "chatId": "65c4a...",
  "page": 1,
  "limit": 50
}
```
*Ack (Response)*:
```json
{
  "status": "ok",
  "data": [ ...messageObjects... ]
}
```

### 6. Delete Message (`delete_message`)
*Description*: Deletes a message.
*Payload*:
```json
{
  "messageId": "65c4c...",
  "deleteType": "everyone" // or "me"
}
```

## Socket Events (Server -> Client)

### 1. Receive Message (`receive_message`)
*Payload*: `Message` object (populated with sender details).

### 2. Update Chat List (`update_chat_list`)
*Payload*: `Chat` object (updated `lastMessage`, `unreadCount`).
*Trigger*: Sent when a new message arrives to update the inbox view.

### 3. New Chat (`new_chat`)
*Payload*: `Chat` object.
*Trigger*: Sent to receiver when a new conversation is started.

### 4. User Status (`user_online`, `user_offline`)
*Payload*: `{ "userId": "..." }`

### 5. Typing Status (`typing`, `stop_typing`)
*Payload*: `{ "chatId": "...", "userId": "..." }`

## Data Models

### Chat Object
```json
{
  "_id": "...",
  "participants": [
    {
      "_id": "...",
      "firstName": "John",
      "lastName": "Doe",
      "profileImage": "...",
      "isOnline": true
    }
  ],
  "lastMessage": {
    "content": "Hello",
    "sender": "...",
    "createdAt": "2024-02-11T10:00:00Z"
  },
  "unreadCount": 2, // Specific to the requesting user
  "createdAt": "...",
  "otherUser": {       // The other participant in the chat (convenience field)
      "_id": "...",
      "firstName": "John",
      "lastName": "Doe",
      ...
  }
}
```

### Message Object
```json
{
  "_id": "...",
  "chat": "...",
  "sender": {
    "_id": "...",
    "firstName": "Jane",
    "lastName": "Doe",
    "profileImage": "..."
  },
  "content": "Hello world",
  "fileUrl": null,
  "fileType": null,
  "createdAt": "..."
}
```
