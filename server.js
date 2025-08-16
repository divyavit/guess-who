const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { nanoid } = require('nanoid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
	cors: {
		origin: '*'
	}
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/**
 * In-memory store
 */
const rooms = new Map(); // roomCode -> room

const DEFAULT_CHARACTERS = [
	{ name: 'Alice', photo: 'https://randomuser.me/api/portraits/women/10.jpg' },
	{ name: 'Bob', photo: 'https://randomuser.me/api/portraits/men/11.jpg' },
	{ name: 'Carol', photo: 'https://randomuser.me/api/portraits/women/12.jpg' },
	{ name: 'Dave', photo: 'https://randomuser.me/api/portraits/men/13.jpg' },
	{ name: 'Eve', photo: 'https://randomuser.me/api/portraits/women/14.jpg' },
	{ name: 'Frank', photo: 'https://randomuser.me/api/portraits/men/15.jpg' },
	{ name: 'Grace', photo: 'https://randomuser.me/api/portraits/women/16.jpg' },
	{ name: 'Heidi', photo: 'https://randomuser.me/api/portraits/women/17.jpg' },
	{ name: 'Ivan', photo: 'https://randomuser.me/api/portraits/men/18.jpg' },
	{ name: 'Judy', photo: 'https://randomuser.me/api/portraits/women/19.jpg' },
	{ name: 'Mallory', photo: 'https://randomuser.me/api/portraits/women/20.jpg' },
	{ name: 'Niaj', photo: 'https://randomuser.me/api/portraits/men/21.jpg' },
	{ name: 'Olivia', photo: 'https://randomuser.me/api/portraits/women/22.jpg' },
	{ name: 'Peggy', photo: 'https://randomuser.me/api/portraits/women/23.jpg' },
	{ name: 'Rupert', photo: 'https://randomuser.me/api/portraits/men/24.jpg' },
	{ name: 'Sybil', photo: 'https://randomuser.me/api/portraits/women/25.jpg' },
	{ name: 'Trent', photo: 'https://randomuser.me/api/portraits/men/26.jpg' },
	{ name: 'Uma', photo: 'https://randomuser.me/api/portraits/women/27.jpg' },
	{ name: 'Victor', photo: 'https://randomuser.me/api/portraits/men/28.jpg' },
	{ name: 'Wendy', photo: 'https://randomuser.me/api/portraits/women/29.jpg' },
	{ name: 'Xavier', photo: 'https://randomuser.me/api/portraits/men/30.jpg' },
	{ name: 'Yvonne', photo: 'https://randomuser.me/api/portraits/women/31.jpg' },
	{ name: 'Zara', photo: 'https://randomuser.me/api/portraits/women/32.jpg' },
	{ name: 'Quinn', photo: 'https://randomuser.me/api/portraits/men/33.jpg' }
];

function generateRoomCode() {
	const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // avoid 0,O,1,I
	let code = '';
	for (let i = 0; i < 6; i++) {
		code += alphabet[Math.floor(Math.random() * alphabet.length)];
	}
	return code;
}

function createRoom(hostNickname) {
	const code = generateRoomCode();
	const hostPlayerId = nanoid(10);
	const room = {
		code,
		createdAt: Date.now(),
		hostPlayerId,
		players: new Map(), // id -> player
		started: false,
		turnPlayerId: null,
		characterList: [...DEFAULT_CHARACTERS],
		playerSecretCharacter: new Map(), // playerId -> character name
		currentQuestion: null
	};
	room.players.set(hostPlayerId, {
		id: hostPlayerId,
		nickname: hostNickname,
		connected: false,
		isReady: false
	});
	rooms.set(code, room);
	return { room, playerId: hostPlayerId };
}

function roomToClient(room) {
	return {
		code: room.code,
		createdAt: room.createdAt,
		hostPlayerId: room.hostPlayerId,
		players: Array.from(room.players.values()).map(p => ({
			id: p.id,
			nickname: p.nickname,
			connected: p.connected,
			isReady: p.isReady
		})),
		started: room.started,
		turnPlayerId: room.turnPlayerId,
		characterList: room.characterList,
		currentQuestion: room.currentQuestion
	};
}

app.post('/api/rooms', (req, res) => {
	const { nickname } = req.body || {};
	if (!nickname || typeof nickname !== 'string' || nickname.length > 24) {
		return res.status(400).json({ error: 'Invalid nickname' });
	}
	const { room, playerId } = createRoom(nickname.trim());
	return res.json({ room: roomToClient(room), playerId });
});

app.post('/api/rooms/:code/join', (req, res) => {
	const code = (req.params.code || '').toUpperCase();
	const { nickname } = req.body || {};
	if (!nickname || typeof nickname !== 'string' || nickname.length > 24) {
		return res.status(400).json({ error: 'Invalid nickname' });
	}
	const room = rooms.get(code);
	if (!room) {
		return res.status(404).json({ error: 'Room not found' });
	}
	if (room.started) {
		return res.status(400).json({ error: 'Game already started' });
	}
	if (room.players.size >= 8) {
		return res.status(400).json({ error: 'Room is full' });
	}
	const playerId = nanoid(10);
	room.players.set(playerId, {
		id: playerId,
		nickname: nickname.trim(),
		connected: false,
		isReady: false
	});
	return res.json({ room: roomToClient(room), playerId });
});

io.on('connection', (socket) => {
	const { roomCode, playerId } = socket.handshake.query;
	const code = typeof roomCode === 'string' ? roomCode.toUpperCase() : '';
	const pid = typeof playerId === 'string' ? playerId : '';
	const room = rooms.get(code);
	if (!room) {
		socket.emit('error:message', 'Room not found');
		return socket.disconnect(true);
	}
	const player = room.players.get(pid);
	if (!player) {
		socket.emit('error:message', 'Invalid player');
		return socket.disconnect(true);
	}

	socket.join(code);
	player.connected = true;
	io.to(code).emit('room:update', roomToClient(room));

	socket.on('player:ready', (data) => {
		if (room.started) return;
		const { secretCharacterName } = data || {};
		if (!room.characterList.some(c => c.name === secretCharacterName)) return;
		room.playerSecretCharacter.set(pid, secretCharacterName);
		player.isReady = true;
		io.to(code).emit('room:update', roomToClient(room));
	});

	socket.on('game:start', () => {
		if (room.started) return;
		if (pid !== room.hostPlayerId) {
			socket.emit('error:message', 'Only the host can start the game');
			return;
		}
		const connectedPlayers = Array.from(room.players.values()).filter(p => p.connected);
		if (connectedPlayers.length < 2) {
			socket.emit('error:message', 'Need at least 2 connected players to start');
			return;
		}
		// Auto-ready any connected players who haven't picked yet
		for (const p of connectedPlayers) {
			if (!p.isReady) {
				const random = room.characterList[Math.floor(Math.random() * room.characterList.length)];
				const characterName = typeof random === 'string' ? random : random.name;
				room.playerSecretCharacter.set(p.id, characterName);
				p.isReady = true;
			}
		}
		room.started = true;
		const readyPlayers = connectedPlayers.filter(p => p.isReady);
		room.turnPlayerId = readyPlayers[Math.floor(Math.random() * readyPlayers.length)].id;
		io.to(code).emit('game:started', roomToClient(room));
	});

	socket.on('turn:ask', ({ question }) => {
		if (!room.started) return;
		if (room.turnPlayerId !== pid) return;
		if (!question || typeof question !== 'string' || question.length > 200) return;
		room.currentQuestion = { fromPlayerId: pid, text: question };
		io.to(code).emit('turn:question', { question: room.currentQuestion });
	});

	socket.on('turn:answer', ({ answer }) => {
		if (!room.started) return;
		if (!room.currentQuestion) return;
		const isYesNo = answer === 'yes' || answer === 'no' || answer === 'unknown';
		if (!isYesNo) return;
		// Only a player other than the asker can answer
		if (room.currentQuestion.fromPlayerId === pid) return;
		io.to(code).emit('turn:answer', { answer, question: room.currentQuestion });
		// advance turn to next ready player
		const readyPlayers = Array.from(room.players.values()).filter(p => p.isReady);
		const idx = readyPlayers.findIndex(p => p.id === room.turnPlayerId);
		if (idx !== -1) {
			const next = readyPlayers[(idx + 1) % readyPlayers.length];
			room.turnPlayerId = next.id;
		}
		room.currentQuestion = null;
		io.to(code).emit('room:update', roomToClient(room));
	});

	socket.on('chat:message', ({ text }) => {
		if (!text || typeof text !== 'string' || text.length > 300) return;
		io.to(code).emit('chat:message', { fromPlayerId: pid, text, at: Date.now() });
	});

	socket.on('disconnect', () => {
		player.connected = false;
		io.to(code).emit('room:update', roomToClient(room));
		// If everyone disconnected, consider cleanup later
	});
});

app.get('/health', (_req, res) => {
	res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
	console.log(`Guess Who server listening on http://localhost:${PORT}`);
}); 