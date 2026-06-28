const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// AUTORISATION CORS POUR GITHUB ET RENDER
const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(express.static('public'));

// ==========================================
// VARIABLES - LE FAUSSAIRE
// ==========================================
let rooms = {};
let sessionToRoom = {};

const decks = {
    'popculture': ['Dark Vador', 'Pikachu', 'Harry Potter', 'Homer Simpson', 'Batman', 'Lara Croft', 'Geralt de Riv', 'Sauron'],
    'animaux': ['Un chat', 'Une licorne', 'Un requin', 'Un dinosaure', 'Un pingouin', 'Un éléphant', 'Un koala', 'Une girafe'],
    'jdr': ['Un donjon', 'Un familier', 'Un jet de dé critique', 'Système de magie', 'Grimoire magique', 'Nécromancien', 'Auberge'],
    'metiers': ['Un pompier', 'Un astronaute', 'Un boulanger', 'Un médecin', 'Un policier', 'Un juge', 'Un agriculteur'],
    'nourriture': ['Une pizza', 'Un hamburger', 'Des sushis', 'Un gâteau', 'Une pomme', 'Du fromage'],
    'objets': ['Un téléphone', 'Une chaise', 'Une voiture', 'Une brosse à dents', 'Un ordinateur', 'Une télévision']
};

// ==========================================
// VARIABLES - DUEL DE DRAPEAUX
// ==========================================
let drapeauxRooms = {};
const https = require('https');
let flagsData = [];

https.get('https://flagcdn.com/fr/codes.json', (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
        const data = JSON.parse(body);
        for (let code in data) {
            if (!code.includes('-')) flagsData.push({ name: data[code], code: code });
        }
        console.log(`✅ Liste complète chargée : ${flagsData.length} drapeaux !`);
    });
}).on('error', (e) => console.error("Erreur drapeaux :", e));

// ==========================================
// VARIABLES - DRAW HOCKEY
// ==========================================
let hockeyRooms = {};

// ==========================================
// FONCTIONS GLOBALES
// ==========================================
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code;
    do {
        code = '';
        for(let i=0; i<4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    } while (rooms[code] || drapeauxRooms[code] || hockeyRooms[code]); 
    return code;
}

function createEmptyRoom(code) {
    rooms[code] = {
        players: {},
        gameState: { status: 'waiting', playerOrder: [], currentTurnIndex: 0, round: 1, faussaireSessionId: null, votes: {}, resultMessage: '', innocentsWin: false },
        themeVotes: {}, turnTimer: null, themeVotingTimer: null, timeLeft: 30
    };
}

function getWinningThemeData(roomCode) {
    let room = rooms[roomCode];
    let counts = { popculture: 0, animaux: 0, jdr: 0, metiers: 0, nourriture: 0, objets: 0, hasard: 0 };
    for (let id in room.themeVotes) if (counts[room.themeVotes[id]] !== undefined) counts[room.themeVotes[id]]++;
    let winningTheme = 'hasard'; let maxVotes = -1;
    for (let theme in counts) { if (counts[theme] > maxVotes) { maxVotes = counts[theme]; winningTheme = theme; } }
    return { counts, winningTheme };
}

function broadcastState(roomCode) {
    let room = rooms[roomCode];
    if(!room) return;
    io.to(roomCode).emit('game_state_update', {
        status: room.gameState.status, players: Object.values(room.players),
        currentSessionId: room.gameState.playerOrder[room.gameState.currentTurnIndex],
        round: room.gameState.round, resultMessage: room.gameState.resultMessage,
        innocentsWin: room.gameState.innocentsWin
    });
}

function startTurnTimer(roomCode) {
    let room = rooms[roomCode];
    clearInterval(room.turnTimer); room.timeLeft = 30; 
    io.to(roomCode).emit('timer_update', room.timeLeft);
    room.turnTimer = setInterval(() => {
        room.timeLeft--; io.to(roomCode).emit('timer_update', room.timeLeft);
        if (room.timeLeft <= 0) { clearInterval(room.turnTimer); passTurn(roomCode); }
    }, 1000);
}

function passTurn(roomCode) {
    let room = rooms[roomCode];
    clearInterval(room.turnTimer); room.gameState.currentTurnIndex++;
    if (room.gameState.currentTurnIndex >= room.gameState.playerOrder.length) {
        room.gameState.currentTurnIndex = 0; room.gameState.round++;
        if (room.gameState.round > 2) { room.gameState.status = 'voting'; broadcastState(roomCode); return; }
    }
    const nextPlayerSessionId = room.gameState.playerOrder[room.gameState.currentTurnIndex];
    if (room.players[nextPlayerSessionId] && !room.players[nextPlayerSessionId].connected) { passTurn(roomCode); return; }
    broadcastState(roomCode); startTurnTimer(roomCode);
}

function startGame(roomCode) {
    let room = rooms[roomCode];
    const activePlayers = Object.values(room.players).filter(p => p.connected && !p.spectator).map(p => p.sessionId);
    if (activePlayers.length < 2) return;
    let { winningTheme } = getWinningThemeData(roomCode);
    if (winningTheme === 'hasard') {
        const themeKeys = Object.keys(decks); winningTheme = themeKeys[Math.floor(Math.random() * themeKeys.length)];
    }
    room.gameState.playerOrder = activePlayers.sort(() => Math.random() - 0.5);
    room.gameState.currentTurnIndex = 0; room.gameState.round = 1;
    room.gameState.votes = {}; room.gameState.status = 'playing';
    room.gameState.faussaireSessionId = activePlayers[Math.floor(Math.random() * activePlayers.length)];
    const selectedDeck = decks[winningTheme]; const randomWord = selectedDeck[Math.floor(Math.random() * selectedDeck.length)];
    activePlayers.forEach(sessionId => {
        const playerSocketId = room.players[sessionId].id;
        if (sessionId === room.gameState.faussaireSessionId) {
            io.to(playerSocketId).emit('game_started', { role: 'faussaire', word: null });
        } else {
            io.to(playerSocketId).emit('game_started', { role: 'normal', word: randomWord });
        }
    });
    broadcastState(roomCode); startTurnTimer(roomCode);
}

function sendNextFlagQuestion(roomId) {
    const room = drapeauxRooms[roomId];
    if (!room || !room.gameActive) return;
    if (room.availableFlags.length === 0) room.availableFlags = [...flagsData]; 
    const randomIndex = Math.floor(Math.random() * room.availableFlags.length);
    room.currentCorrectFlag = room.availableFlags[randomIndex];
    room.availableFlags.splice(randomIndex, 1);
    let options = [room.currentCorrectFlag];
    while (options.length < 4) {
        const randomWrong = flagsData[Math.floor(Math.random() * flagsData.length)];
        if (!options.some(item => item.code === randomWrong.code)) options.push(randomWrong);
    }
    options.sort(() => Math.random() - 0.5); 
    io.to(roomId).emit('drapeaux_newQuestion', { flagCode: room.currentCorrectFlag.code, options: options, currentPlayer: room.currentPlayer });
}

function startFlagTimer(roomId) {
    const room = drapeauxRooms[roomId];
    if (!room || !room.gameActive) return;
    clearInterval(room.interval);
    room.interval = setInterval(() => {
        room.times[room.currentPlayer] -= 0.1;
        if (room.times[room.currentPlayer] <= 0) room.times[room.currentPlayer] = 0;
        io.to(roomId).emit('drapeaux_timerUpdate', { times: room.times, currentPlayer: room.currentPlayer });
        if (room.times[room.currentPlayer] === 0) {
            clearInterval(room.interval); room.gameActive = false;
            const winnerIndex = room.currentPlayer === 0 ? 1 : 0;
            io.to(roomId).emit('drapeaux_gameOver', { winner: winnerIndex });
        }
    }, 100);
}

// ==========================================
// CONNEXIONS SOCKET.IO
// ==========================================
io.on('connection', (socket) => {
    
    // -- LE FAUSSAIRE --
    socket.on('join_room', (data) => {
        const { username, avatar, sessionId, roomCode } = data;
        if (!rooms[roomCode]) return socket.emit('room_error', "Ce salon n'existe pas !");
        socket.join(roomCode); socket.sessionId = sessionId; sessionToRoom[sessionId] = roomCode;
        let room = rooms[roomCode];
        const shouldSpectate = room.gameState.status !== 'waiting' && room.gameState.status !== 'result';
        if (!room.players[sessionId]) {
            room.players[sessionId] = { id: socket.id, sessionId, name: username, avatar, score: 0, connected: true, spectator: shouldSpectate };
            if (shouldSpectate && room.gameState.status === 'playing') socket.to(roomCode).emit('request_canvas_state', socket.id);
        } else {
            room.players[sessionId].id = socket.id; room.players[sessionId].name = username;
            room.players[sessionId].avatar = avatar; room.players[sessionId].connected = true;
            if (room.gameState.status === 'playing') socket.to(roomCode).emit('request_canvas_state', socket.id);
        }
        socket.emit('room_joined', roomCode);
        io.to(roomCode).emit('update_players', Object.values(room.players)); broadcastState(roomCode);
    });

    socket.on('sync_canvas_state', (payload) => { io.to(payload.targetSocketId).emit('receive_canvas_state', payload.dataUrl); });

    socket.on('create_room', (data) => {
        const { username, avatar, sessionId } = data; const roomCode = generateRoomCode();
        createEmptyRoom(roomCode);
        socket.join(roomCode); socket.sessionId = sessionId; sessionToRoom[sessionId] = roomCode;
        rooms[roomCode].players[sessionId] = { id: socket.id, sessionId, name: username, avatar, score: 0, connected: true, spectator: false };
        socket.emit('room_joined', roomCode);
        io.to(roomCode).emit('update_players', Object.values(rooms[roomCode].players)); broadcastState(roomCode);
    });

    socket.on('request_theme_vote', (roomCode) => {
        let room = rooms[roomCode]; if(!room) return;
        for (let sid in room.players) if (room.players[sid].connected) room.players[sid].spectator = false;
        io.to(roomCode).emit('update_players', Object.values(room.players));
        const activePlayers = Object.values(room.players).filter(p => p.connected);
        if (activePlayers.length < 2 || room.gameState.status === 'playing') return;
        room.gameState.status = 'theme_voting'; room.themeVotes = {}; broadcastState(roomCode);
        io.to(roomCode).emit('update_theme_votes', getWinningThemeData(roomCode));
        clearTimeout(room.themeVotingTimer);
        room.themeVotingTimer = setTimeout(() => { if (room.gameState.status === 'theme_voting') startGame(roomCode); }, 15000);
    });

    socket.on('vote_theme', (data) => {
        const { roomCode, theme } = data; let room = rooms[roomCode];
        if (!room || room.gameState.status !== 'theme_voting' || room.players[socket.sessionId].spectator) return;
        room.themeVotes[socket.sessionId] = theme; io.to(roomCode).emit('update_theme_votes', getWinningThemeData(roomCode));
        const activeCount = Object.values(room.players).filter(p => p.connected && !p.spectator).length;
        if (Object.keys(room.themeVotes).length >= activeCount) { clearTimeout(room.themeVotingTimer); startGame(roomCode); }
    });

    socket.on('pass_turn', (roomCode) => {
        let room = rooms[roomCode];
        if (!room || room.gameState.status !== 'playing' || socket.sessionId !== room.gameState.playerOrder[room.gameState.currentTurnIndex]) return;
        passTurn(roomCode);
    });
    
    socket.on('undo_action', (payload) => { socket.to(payload.roomCode).emit('undo_action', payload.dataUrl); });

    socket.on('vote_faussaire', (data) => {
        const { roomCode, votedSessionId } = data; let room = rooms[roomCode];
        if (!room || room.gameState.status !== 'voting' || room.players[socket.sessionId].spectator) return;
        room.gameState.votes[socket.sessionId] = votedSessionId;
        const activeCount = Object.values(room.players).filter(p => p.connected && !p.spectator).length;
        if (Object.keys(room.gameState.votes).length === activeCount) {
            const faussaireId = room.gameState.faussaireSessionId; const faussaireName = room.players[faussaireId].name;
            let votesAgainstFaussaire = 0;
            Object.values(room.gameState.votes).forEach(votedId => { if (String(votedId) === String(faussaireId)) votesAgainstFaussaire++; });
            const threshold = activeCount <= 3 ? 2 : activeCount - 2;
            const faussaireLoses = votesAgainstFaussaire >= threshold;
            for (let voterId in room.gameState.votes) {
                if (String(room.gameState.votes[voterId]) === String(faussaireId)) { if (room.players[voterId]) room.players[voterId].score += 1; }
            }
            if (faussaireLoses) { room.gameState.resultMessage = `LE FAUSSAIRE ÉTAIT BIEN ${faussaireName} !`; room.gameState.innocentsWin = true; } 
            else { room.players[faussaireId].score += 2; room.gameState.resultMessage = `LE FAUSSAIRE VOUS A EU, C'ÉTAIT ${faussaireName} !`; room.gameState.innocentsWin = false; }
            room.gameState.status = 'result'; io.to(roomCode).emit('update_players', Object.values(room.players)); broadcastState(roomCode);
        }
    });

    socket.on('draw', (payload) => { socket.to(payload.roomCode).emit('draw', payload.data); });


    // -- DUEL DE DRAPEAUX --
    socket.on('drapeaux_createRoom', (username) => {
        const roomCode = generateRoomCode();
        drapeauxRooms[roomCode] = {
            id: roomCode, players: [{ id: socket.id, name: username || 'Joueur 1', replayReady: false }],
            times: [60.0, 60.0], scores: [0, 0], currentPlayer: 0, availableFlags: [...flagsData],
            currentCorrectFlag: null, gameActive: false, interval: null
        };
        socket.join(roomCode); socket.emit('drapeaux_roomCreated', roomCode);
    });

    socket.on('drapeaux_joinRoom', (data) => {
        const { code, username } = data; const roomCode = code.toUpperCase(); const room = drapeauxRooms[roomCode];
        if (!room) return socket.emit('drapeaux_roomError', "Ce code n'existe pas.");
        if (room.players.length >= 2) return socket.emit('drapeaux_roomError', "Le salon est déjà plein.");
        room.players.push({ id: socket.id, name: username || 'Joueur 2', replayReady: false });
        socket.join(roomCode);
        io.to(roomCode).emit('drapeaux_startCountdown', { p1Name: room.players[0].name, p2Name: room.players[1].name });
        setTimeout(() => {
            room.gameActive = true;
            io.to(room.players[0].id).emit('drapeaux_gameStart', { playerIndex: 0 });
            io.to(room.players[1].id).emit('drapeaux_gameStart', { playerIndex: 1 });
            sendNextFlagQuestion(roomCode); startFlagTimer(roomCode);
        }, 3000);
    });

    socket.on('drapeaux_submitAnswer', (flagCode) => {
        const roomEntry = Object.entries(drapeauxRooms).find(([_, r]) => r.players.some(p => p.id === socket.id));
        if (!roomEntry) return;
        const [roomId, room] = roomEntry; if (!room.gameActive) return;
        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== room.currentPlayer) return; 
        if (flagCode === room.currentCorrectFlag.code) {
            clearInterval(room.interval); room.scores[room.currentPlayer] += 1; room.currentPlayer = room.currentPlayer === 0 ? 1 : 0;
            io.to(roomId).emit('drapeaux_correctAnswer', { correctCode: flagCode, scores: room.scores });
            setTimeout(() => { sendNextFlagQuestion(roomId); startFlagTimer(roomId); }, 300);
        } else { socket.emit('drapeaux_wrongAnswer', { wrongCode: flagCode }); }
    });

    socket.on('drapeaux_playAgain', () => {
        const roomEntry = Object.entries(drapeauxRooms).find(([_, r]) => r.players.some(p => p.id === socket.id));
        if (!roomEntry) return;
        const [roomId, room] = roomEntry; const player = room.players.find(p => p.id === socket.id); player.replayReady = true;
        if (room.players[0].replayReady && room.players[1].replayReady) {
            room.times = [60.0, 60.0]; room.scores = [0, 0]; room.currentPlayer = 0;
            room.availableFlags = [...flagsData]; room.players.forEach(p => p.replayReady = false);
            io.to(roomId).emit('drapeaux_startCountdown', { p1Name: room.players[0].name, p2Name: room.players[1].name });
            setTimeout(() => {
                room.gameActive = true;
                io.to(room.players[0].id).emit('drapeaux_gameStart', { playerIndex: 0 });
                io.to(room.players[1].id).emit('drapeaux_gameStart', { playerIndex: 1 });
                sendNextFlagQuestion(roomId); startFlagTimer(roomId);
            }, 3000);
        }
    });

    // -- DRAW HOCKEY --
    socket.on('hockey_createRoom', (username) => {
        const roomCode = generateRoomCode();
        hockeyRooms[roomCode] = {
            id: roomCode, players: [{ id: socket.id, name: username || 'Joueur 1', replayReady: false }], hostId: socket.id
        };
        socket.join(roomCode); socket.emit('hockey_roomCreated', roomCode);
    });

    socket.on('hockey_joinRoom', (data) => {
        const { code, username } = data; const roomCode = code.toUpperCase(); const room = hockeyRooms[roomCode];
        if (!room) return socket.emit('hockey_error', "Ce code n'existe pas.");
        if (room.players.length >= 2) return socket.emit('hockey_error', "Le salon est plein.");
        room.players.push({ id: socket.id, name: username || 'Joueur 2', replayReady: false });
        socket.join(roomCode);
        
        io.to(roomCode).emit('hockey_startCountdown', { hostId: room.hostId, roomCode: roomCode, players: room.players });
        setTimeout(() => { io.to(roomCode).emit('hockey_gameStart'); }, 3000);
    });

    socket.on('hockey_syncPuck', (data) => { socket.to(data.roomCode).emit('hockey_updatePuck', data.puck); });
    
    // NOUVEAU : Streaming du trait en temps réel
    socket.on('hockey_syncLine', (data) => { socket.to(data.roomCode).emit('hockey_syncLine', data.lineData); });
    socket.on('hockey_endLine', (data) => { socket.to(data.roomCode).emit('hockey_endLine', data.lineData); });

    socket.on('hockey_goalScored', (data) => {
        const { roomCode, scores } = data;
        io.to(roomCode).emit('hockey_updateScore', scores);
        if (scores.host >= 7 || scores.client >= 7) {
            const winner = scores.host >= 7 ? 'host' : 'client';
            io.to(roomCode).emit('hockey_gameOver', winner);
        }
    });

    socket.on('hockey_playAgain', (roomCode) => {
        const room = hockeyRooms[roomCode]; if (!room) return;
        const player = room.players.find(p => p.id === socket.id); if (player) player.replayReady = true;
        if (room.players.every(p => p.replayReady)) {
            room.players.forEach(p => p.replayReady = false);
            io.to(roomCode).emit('hockey_startCountdown', { hostId: room.hostId, roomCode: roomCode, players: room.players });
            setTimeout(() => { io.to(roomCode).emit('hockey_gameStart'); }, 3000);
        }
    });

    // -- DÉCONNEXION --
    socket.on('disconnect', () => {
        const faussaireCode = sessionToRoom[socket.sessionId];
        if (faussaireCode && rooms[faussaireCode] && rooms[faussaireCode].players[socket.sessionId]) {
            let room = rooms[faussaireCode]; room.players[socket.sessionId].connected = false;
            io.to(faussaireCode).emit('update_players', Object.values(room.players));
            if (room.gameState.status === 'theme_voting') {
                const activeCount = Object.values(room.players).filter(p => p.connected && !p.spectator).length;
                if (activeCount >= 2 && Object.keys(room.themeVotes).length >= activeCount) { clearTimeout(room.themeVotingTimer); startGame(faussaireCode); }
            } else if (room.gameState.status === 'playing' && room.gameState.playerOrder[room.gameState.currentTurnIndex] === socket.sessionId) { passTurn(faussaireCode); }
        }

        const drapeauxEntry = Object.entries(drapeauxRooms).find(([_, r]) => r.players.some(p => p.id === socket.id));
        if (drapeauxEntry) {
            const [roomId, room] = drapeauxEntry; clearInterval(room.interval);
            io.to(roomId).emit('drapeaux_playerDisconnected'); delete drapeauxRooms[roomId]; 
        }

        const hockeyEntry = Object.entries(hockeyRooms).find(([_, r]) => r.players.some(p => p.id === socket.id));
        if (hockeyEntry) {
            const [roomId, room] = hockeyEntry;
            io.to(roomId).emit('hockey_playerDisconnected'); delete hockeyRooms[roomId]; 
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Le serveur Hub Rétro tourne sur le port ${PORT}`));