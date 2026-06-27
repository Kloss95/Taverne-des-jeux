const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Sert les fichiers statiques (index.html, style.css)
app.use(express.static('public')); 

// Base de données raccourcie pour l'exemple (tu peux remettre tes 150+ pays ici)
const flagsData = [
    { name: "Afghanistan", code: "af" }, { name: "Afrique du Sud", code: "za" },
    { name: "Albanie", code: "al" }, { name: "Algérie", code: "dz" },
    { name: "Allemagne", code: "de" }, { name: "Argentine", code: "ar" },
    { name: "Australie", code: "au" }, { name: "Autriche", code: "at" },
    { name: "Belgique", code: "be" }, { name: "Brésil", code: "br" },
    { name: "Canada", code: "ca" }, { name: "Chili", code: "cl" },
    { name: "Chine", code: "cn" }, { name: "Colombie", code: "co" },
    { name: "Corée du Sud", code: "kr" }, { name: "Danemark", code: "dk" },
    { name: "Égypte", code: "eg" }, { name: "Espagne", code: "es" },
    { name: "États-Unis", code: "us" }, { name: "Finlande", code: "fi" },
    { name: "France", code: "fr" }, { name: "Grèce", code: "gr" },
    { name: "Inde", code: "in" }, { name: "Italie", code: "it" },
    { name: "Japon", code: "jp" }, { name: "Maroc", code: "ma" }
];

let waitingPlayer = null;
const rooms = {};

io.on('connection', (socket) => {
    console.log('Nouveau joueur connecté:', socket.id);

    // Le joueur clique sur "Créer / Rejoindre un duel"
    socket.on('joinQueue', () => {
        if (waitingPlayer && waitingPlayer.id !== socket.id) {
            // Match trouvé ! Création d'un salon privé.
            const roomId = 'room_' + Date.now();
            const p1 = waitingPlayer;
            const p2 = socket;
            
            p1.join(roomId);
            p2.join(roomId);
            
            rooms[roomId] = {
                players: [p1.id, p2.id],
                times: [60.0, 60.0],
                currentPlayer: 0, // 0 pour p1, 1 pour p2
                availableFlags: [...flagsData],
                currentCorrectFlag: null,
                gameActive: true,
                interval: null
            };

            waitingPlayer = null;

            // On prévient les joueurs que la partie commence et on leur donne leur numéro
            io.to(p1.id).emit('gameStart', { playerIndex: 0 });
            io.to(p2.id).emit('gameStart', { playerIndex: 1 });

            sendNextQuestion(roomId);
            startTimer(roomId);
        } else {
            // Pas d'adversaire, on met le joueur en salle d'attente
            waitingPlayer = socket;
            socket.emit('waitingForOpponent');
        }
    });

    // Un joueur clique sur un drapeau
    socket.on('submitAnswer', (flagCode) => {
        const roomEntry = Object.entries(rooms).find(([_, r]) => r.players.includes(socket.id));
        if (!roomEntry) return;
        const [roomId, room] = roomEntry;

        if (!room.gameActive) return;
        
        const playerIndex = room.players.indexOf(socket.id);
        
        // On ignore si ce n'est pas son tour
        if (playerIndex !== room.currentPlayer) return; 

        if (flagCode === room.currentCorrectFlag.code) {
            // BONNE RÉPONSE : On arrête le chrono, on change de joueur et on relance
            clearInterval(room.interval);
            room.currentPlayer = room.currentPlayer === 0 ? 1 : 0;
            io.to(roomId).emit('correctAnswer', { correctCode: flagCode });
            
            // Petite pause avant d'afficher la prochaine question
            setTimeout(() => {
                sendNextQuestion(roomId);
                startTimer(roomId);
            }, 300);
        } else {
            // MAUVAISE RÉPONSE : On prévient juste le joueur pour qu'il puisse retenter
            socket.emit('wrongAnswer', { wrongCode: flagCode });
        }
    });

    socket.on('disconnect', () => {
        if (waitingPlayer && waitingPlayer.id === socket.id) {
            waitingPlayer = null;
        }
        
        // Si un joueur quitte en pleine partie, le salon ferme
        const roomEntry = Object.entries(rooms).find(([_, r]) => r.players.includes(socket.id));
        if (roomEntry) {
            const [roomId, room] = roomEntry;
            clearInterval(room.interval);
            io.to(roomId).emit('playerDisconnected');
            delete rooms[roomId];
        }
    });
});

function sendNextQuestion(roomId) {
    const room = rooms[roomId];
    if (!room || !room.gameActive) return;

    if (room.availableFlags.length === 0) {
        room.availableFlags = [...flagsData]; // Recharge si on a tout fait
    }

    const randomIndex = Math.floor(Math.random() * room.availableFlags.length);
    room.currentCorrectFlag = room.availableFlags[randomIndex];
    room.availableFlags.splice(randomIndex, 1);

    let options = [room.currentCorrectFlag];
    while (options.length < 4) {
        const randomWrong = flagsData[Math.floor(Math.random() * flagsData.length)];
        if (!options.some(item => item.code === randomWrong.code)) {
            options.push(randomWrong);
        }
    }
    options.sort(() => Math.random() - 0.5); // Mélange les 4 propositions

    io.to(roomId).emit('newQuestion', {
        flagCode: room.currentCorrectFlag.code,
        options: options,
        currentPlayer: room.currentPlayer
    });
}

function startTimer(roomId) {
    const room = rooms[roomId];
    if (!room || !room.gameActive) return;

    clearInterval(room.interval);
    room.interval = setInterval(() => {
        room.times[room.currentPlayer] -= 0.1;
        
        // On envoie la mise à jour des temps 10 fois par seconde
        io.to(roomId).emit('timerUpdate', { times: room.times, currentPlayer: room.currentPlayer });

        if (room.times[room.currentPlayer] <= 0) {
            room.times[room.currentPlayer] = 0;
            clearInterval(room.interval);
            room.gameActive = false;
            const winnerIndex = room.currentPlayer === 0 ? 1 : 0;
            io.to(roomId).emit('gameOver', { winner: winnerIndex });
        }
    }, 100);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Serveur prêt sur le port ${PORT}`);
});