# Guess Who (Rooms)

A simple web-based Guess Who game with room codes. Create a room, share the code, and play in the browser.

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Start the server:

```bash
npm start
```

Open `http://localhost:3000` in your browser.

## Features

- Create and join rooms via 6-letter code
- Lobby with player presence and ready states
- Choose a secret character
- Start game (host only)
- Turn-based ask/answer flow (yes/no/unknown)
- Local elimination board per player
- Simple chat

Note: This uses in-memory storage and is not intended for production. Restarting the server will clear all rooms. 