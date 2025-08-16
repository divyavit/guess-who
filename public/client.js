(() => {
	const $ = (sel) => document.querySelector(sel);
	const $$ = (sel) => Array.from(document.querySelectorAll(sel));

	const authSection = $('#auth');
	const lobbySection = $('#lobby');
	const gameSection = $('#game');

	const nicknameInput = $('#nickname');
	const createRoomBtn = $('#createRoomBtn');
	const roomCodeInput = $('#roomCodeInput');
	const joinRoomBtn = $('#joinRoomBtn');

	const roomCodeEl = $('#roomCode');
	const copyCodeBtn = $('#copyCodeBtn');
	const playerList = $('#playerList');
	const charactersEl = $('#characters');
	const readyBtn = $('#readyBtn');
	const startBtn = $('#startBtn');

	const gameRoomCode = $('#gameRoomCode');
	const boardEl = $('#board');
	const turnNameEl = $('#turnName');
	const askPanel = $('#askPanel');
	const answerPanel = $('#answerPanel');
	const questionInput = $('#questionInput');
	const askBtn = $('#askBtn');
	const questionText = $('#questionText');
	const chatEl = $('#chat');
	const chatInput = $('#chatInput');
	const sendChatBtn = $('#sendChatBtn');

	let state = {
		room: null,
		playerId: null,
		secretCharacterName: null,
		eliminated: new Set(),
		socket: null
	};

	function show(section) {
		authSection.classList.add('hidden');
		lobbySection.classList.add('hidden');
		gameSection.classList.add('hidden');
		section.classList.remove('hidden');
	}

	function renderLobby() {
		if (!state.room) return;
		roomCodeEl.textContent = state.room.code;
		playerList.innerHTML = '';
		state.room.players.forEach(p => {
			const li = document.createElement('li');
			li.textContent = p.nickname;
			const right = document.createElement('div');
			right.style.display = 'flex';
			right.style.gap = '6px';
			const ready = document.createElement('span');
			ready.className = 'badge ' + (p.isReady ? 'ready' : '');
			ready.textContent = p.isReady ? 'Ready' : 'Not ready';
			const conn = document.createElement('span');
			conn.className = 'badge ' + (p.connected ? '' : 'disconnected');
			conn.textContent = p.connected ? 'Online' : 'Offline';
			right.appendChild(ready);
			right.appendChild(conn);
			li.appendChild(right);
			playerList.appendChild(li);
		});
		// Characters with photos
		charactersEl.innerHTML = '';
		(state.room.characterList || []).forEach(c => {
			const div = document.createElement('div');
			div.className = 'tile' + (state.secretCharacterName === c.name ? ' selected' : '');
			const img = document.createElement('img');
			img.src = c.photo;
			img.alt = c.name;
			const label = document.createElement('div');
			label.textContent = c.name;
			div.appendChild(img);
			div.appendChild(label);
			div.addEventListener('click', () => {
				state.secretCharacterName = c.name;
				$$('#characters .tile').forEach(n => n.classList.remove('selected'));
				div.classList.add('selected');
				readyBtn.disabled = true;
				readyBtn.textContent = 'Ready ✓';
				const me = state.room.players.find(p => p.id === state.playerId);
				if (!me || !me.isReady) {
					state.socket.emit('player:ready', { secretCharacterName: state.secretCharacterName });
				}
			});
			charactersEl.appendChild(div);
		});
		// Buttons & status
		const me = state.room.players.find(p => p.id === state.playerId);
		const readyCount = state.room.players.filter(p => p.isReady).length;
		const connectedCount = state.room.players.filter(p => p.connected).length;
		const isHost = state.room.hostPlayerId === state.playerId;
		// Ready button is clickable unless I'm already ready
		readyBtn.disabled = !!(me && me.isReady);
		readyBtn.textContent = me && me.isReady ? 'Ready ✓' : 'Ready';
		// Start button requires host and >=2 connected (unready players will be auto-readied)
		startBtn.disabled = !(isHost && connectedCount >= 2);
		if (!isHost) {
			startBtn.textContent = 'Start Game (host only)';
		} else if (connectedCount >= 2) {
			startBtn.textContent = 'Start Game';
		} else {
			startBtn.textContent = `Start Game (need ${Math.max(0, 2 - connectedCount)} more online)`;
		}
	}

	function renderGame() {
		if (!state.room) return;
		gameRoomCode.textContent = state.room.code;
		turnNameEl.textContent = (state.room.players.find(p => p.id === state.room.turnPlayerId) || {}).nickname || '-';
		boardEl.innerHTML = '';
		(state.room.characterList || []).forEach(c => {
			const tile = document.createElement('div');
			tile.className = 'tile' + (state.eliminated.has(c.name) ? ' eliminated' : '');
			const img = document.createElement('img');
			img.src = c.photo; img.alt = c.name;
			const label = document.createElement('div');
			label.textContent = c.name;
			tile.appendChild(img);
			tile.appendChild(label);
			tile.addEventListener('click', () => {
				if (state.room.turnPlayerId !== state.playerId) {
					if (state.eliminated.has(c.name)) state.eliminated.delete(c.name); else state.eliminated.add(c.name);
					renderGame();
				}
			});
			boardEl.appendChild(tile);
		});
		const myTurn = state.room.turnPlayerId === state.playerId;
		askPanel.classList.toggle('hidden', !myTurn);
		answerPanel.classList.toggle('hidden', myTurn);
	}

	async function createRoom() {
		const nickname = nicknameInput.value.trim();
		if (!nickname) return alert('Enter nickname');
		const res = await fetch('/api/rooms', {
			method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nickname })
		});
		if (!res.ok) { const e = await res.json().catch(() => ({})); return alert(e.error || 'Failed to create room'); }
		const { room, playerId } = await res.json();
		state.room = room; state.playerId = playerId;
		connectSocket();
		show(lobbySection);
		renderLobby();
	}

	async function joinRoom() {
		const nickname = nicknameInput.value.trim();
		const code = roomCodeInput.value.trim().toUpperCase();
		if (!nickname) return alert('Enter nickname');
		if (!code || code.length !== 6) return alert('Enter a valid 6-letter room code');
		const res = await fetch(`/api/rooms/${code}/join`, {
			method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nickname })
		});
		if (!res.ok) { const e = await res.json().catch(() => ({})); return alert(e.error || 'Failed to join room'); }
		const { room, playerId } = await res.json();
		state.room = room; state.playerId = playerId;
		connectSocket();
		show(lobbySection);
		renderLobby();
	}

	function connectSocket() {
		if (state.socket) state.socket.disconnect();
		state.socket = io({ query: { roomCode: state.room.code, playerId: state.playerId } });

		state.socket.on('connect', () => {});
		state.socket.on('error:message', (m) => alert(m));
		state.socket.on('room:update', (room) => {
			state.room = room;
			if (!room.started) {
				show(lobbySection);
				renderLobby();
			} else {
				show(gameSection);
				renderGame();
			}
		});
		state.socket.on('game:started', (room) => {
			state.room = room;
			show(gameSection);
			renderGame();
			logChat('System', 'Game started!');
		});
		state.socket.on('turn:question', ({ question }) => {
			questionText.textContent = `${nameOf(question.fromPlayerId)} asks: ${question.text}`;
			renderGame();
		});
		state.socket.on('turn:answer', ({ answer, question }) => {
			logChat('System', `${nameOf(question.fromPlayerId)} asked: "${question.text}" – Answer: ${answer.toUpperCase()}`);
			renderGame();
		});
		state.socket.on('chat:message', ({ fromPlayerId, text }) => {
			logChat(nameOf(fromPlayerId), text, fromPlayerId === state.playerId);
		});
	}

	function nameOf(playerId) {
		const p = (state.room?.players || []).find(p => p.id === playerId);
		return p ? p.nickname : 'Unknown';
	}

	function logChat(author, text, me = false) {
		const div = document.createElement('div');
		div.className = 'msg';
		div.innerHTML = `<span class="${me ? 'from-me' : ''}"><strong>${author}:</strong></span> ${escapeHtml(text)}`;
		chatEl.appendChild(div);
		chatEl.scrollTop = chatEl.scrollHeight;
	}

	function escapeHtml(s) {
		return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
	}

	// Events
	createRoomBtn.addEventListener('click', createRoom);
	joinRoomBtn.addEventListener('click', joinRoom);
	copyCodeBtn.addEventListener('click', async () => {
		await navigator.clipboard.writeText(state.room?.code || '');
		copyCodeBtn.textContent = 'Copied!';
		setTimeout(() => (copyCodeBtn.textContent = 'Copy Code'), 1000);
	});
	readyBtn.addEventListener('click', () => {
		if (!state.secretCharacterName) {
			const first = state.room?.characterList?.[0];
			if (first) {
				state.secretCharacterName = first.name;
				// mark selection tile
				$$('#characters .tile').forEach(n => n.classList.remove('selected'));
				const match = Array.from(charactersEl.children).find(el => (el.textContent || '').trim().endsWith(first.name));
				if (match) match.classList.add('selected');
			}
		}
		readyBtn.disabled = true;
		readyBtn.textContent = 'Ready ✓';
		state.socket.emit('player:ready', { secretCharacterName: state.secretCharacterName });
	});
	startBtn.addEventListener('click', () => {
		state.socket.emit('game:start');
	});
	askBtn.addEventListener('click', () => {
		const q = questionInput.value.trim();
		if (!q) return;
		questionInput.value = '';
		state.socket.emit('turn:ask', { question: q });
	});
	answerPanel.querySelectorAll('button[data-answer]').forEach(btn => {
		btn.addEventListener('click', () => {
			state.socket.emit('turn:answer', { answer: btn.dataset.answer });
		});
	});
	sendChatBtn.addEventListener('click', () => {
		const text = chatInput.value.trim();
		if (!text) return;
		chatInput.value = '';
		state.socket.emit('chat:message', { text });
	});
	chatInput.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') sendChatBtn.click();
	});
})(); 