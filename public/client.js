const socket = io();

// --- GESTION AUDIO & MUSIQUE ---
const bgMusic = document.getElementById('bg-music');
const muteBtn = document.getElementById('mute-btn');
bgMusic.volume = 0.15; 

document.body.addEventListener('click', () => {
    if (bgMusic.paused && muteBtn.textContent === '🔈') {
        bgMusic.play().then(() => { muteBtn.textContent = '🔊'; }).catch(e => console.log("Attente d'interaction"));
    }
}, { once: true });

muteBtn.addEventListener('click', (e) => {
    e.stopPropagation(); 
    if (bgMusic.paused) { bgMusic.play(); muteBtn.textContent = '🔊'; } 
    else { bgMusic.pause(); muteBtn.textContent = '🔈'; }
});

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playPop() {
    if(audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.frequency.setValueAtTime(300, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(500, audioCtx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    osc.start(); osc.stop(audioCtx.currentTime + 0.1);
}
function playTick() {
    if(audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination); osc.type = 'square';
    osc.frequency.setValueAtTime(800, audioCtx.currentTime); gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);
    osc.start(); osc.stop(audioCtx.currentTime + 0.05);
}

// --- DOM Elements ---
const loginScreen = document.getElementById('login-screen');
const gameScreen = document.getElementById('game-screen');
const errorText = document.getElementById('login-error');
const usernameInput = document.getElementById('username');
const roomCodeInput = document.getElementById('room-code-input');
const roomCodeDisplay = document.getElementById('room-code-display');

const avatarOptions = document.querySelectorAll('.avatar-option');
let selectedAvatar = '🦊';

avatarOptions.forEach(opt => {
    opt.addEventListener('click', () => {
        avatarOptions.forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected'); selectedAvatar = opt.textContent; playPop();
    });
});

const startBtn = document.getElementById('start-btn');
const startControls = document.getElementById('start-controls');
const roleDisplay = document.getElementById('role-display');
const turnDisplay = document.getElementById('turn-display');
const timerDisplay = document.getElementById('timer-display');
const playerList = document.getElementById('player-list');
const podiumArea = document.getElementById('podium-area');
const podiumList = document.getElementById('podium-list');

const canvas = document.getElementById('drawing-board');
const ctx = canvas.getContext('2d');

const colorBtns = document.querySelectorAll('.color-btn');
const sizeBtns = document.querySelectorAll('.size-btn');
let currentColor = '#111111';
let currentSize = 5;

const undoBtn = document.getElementById('undo-btn');
const nextTurnBtn = document.getElementById('next-turn-btn');
const drawingTools = document.getElementById('drawing-tools');

const themeModal = document.getElementById('theme-modal');
const themeCards = document.querySelectorAll('.theme-card');
const voteModal = document.getElementById('vote-modal');
const voteModalButtons = document.getElementById('vote-modal-buttons');

let isDrawing = false, currentX = 0, currentY = 0;
let isMyTurn = false;
let currentRoom = null;
let undoStack = [];

let mySessionId = sessionStorage.getItem('faussaire_session');
if (!mySessionId) {
    mySessionId = Math.random().toString(36).substring(2, 15);
    sessionStorage.setItem('faussaire_session', mySessionId);
}

// --- CONFIGURATION PINCEAUX ---
colorBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        colorBtns.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected'); currentColor = btn.dataset.color; updateCursor();
    });
});

sizeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        sizeBtns.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected'); currentSize = parseInt(btn.dataset.size); updateCursor();
    });
});

function updateCursor() {
    if(!isMyTurn) { canvas.style.cursor = 'crosshair'; return; }
    const size = currentSize; const color = currentColor.replace('#', '%23');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size+4}" height="${size+4}" viewBox="0 0 ${size+4} ${size+4}"><circle cx="${(size+4)/2}" cy="${(size+4)/2}" r="${size/2}" fill="${color}" stroke="%23111" stroke-width="2"/></svg>`;
    canvas.style.cursor = `url('data:image/svg+xml;utf8,${svg}') ${(size+4)/2} ${(size+4)/2}, crosshair`;
}

function getMousePos(evt) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width; 
    const scaleY = canvas.height / rect.height;
    
    let clientX = evt.type.includes('touch') ? evt.touches[0].clientX : evt.clientX;
    let clientY = evt.type.includes('touch') ? evt.touches[0].clientY : evt.clientY;
    
    return { 
        x: (clientX - rect.left) * scaleX, 
        y: (clientY - rect.top) * scaleY 
    };
}

// --- CONNEXION & SALONS ---
document.getElementById('create-room-btn').addEventListener('click', () => {
    const username = usernameInput.value.trim().toUpperCase();
    if (!username) return errorText.textContent = "ENTRE UN PSEUDO !";
    socket.emit('create_room', { username, avatar: selectedAvatar, sessionId: mySessionId });
});

document.getElementById('join-room-btn').addEventListener('click', () => {
    const username = usernameInput.value.trim().toUpperCase();
    const code = roomCodeInput.value.trim().toUpperCase();
    if (!username) return errorText.textContent = "ENTRE UN PSEUDO !";
    if (!code || code.length !== 4) return errorText.textContent = "CODE INVALIDE !";
    socket.emit('join_room', { username, avatar: selectedAvatar, sessionId: mySessionId, roomCode: code });
});

socket.on('room_joined', (roomCode) => {
    currentRoom = roomCode; roomCodeDisplay.textContent = roomCode;
    loginScreen.style.display = 'none'; gameScreen.style.display = 'block'; playPop();
});

socket.on('room_error', (msg) => { errorText.textContent = msg; });

startBtn.addEventListener('click', () => socket.emit('request_theme_vote', currentRoom));
document.getElementById('play-again-btn').addEventListener('click', () => socket.emit('request_theme_vote', currentRoom));

themeCards.forEach(card => {
    card.addEventListener('click', () => {
        socket.emit('vote_theme', { roomCode: currentRoom, theme: card.dataset.theme });
        themeModal.style.display = 'none';
        turnDisplay.textContent = "VOTE ENREGISTRÉ ! EN ATTENTE DES AUTRES...";
        turnDisplay.style.color = "#111"; playPop();
    });
});

socket.on('update_theme_votes', (data) => {
    for (let theme in data.counts) {
        const countSpan = document.getElementById(`count-${theme}`);
        if (countSpan) countSpan.textContent = data.counts[theme];
    }
});

nextTurnBtn.addEventListener('click', () => { if (isMyTurn) socket.emit('pass_turn', currentRoom); });

undoBtn.addEventListener('click', () => {
    if (!isMyTurn || undoStack.length === 0) return;
    const previousState = undoStack.pop(); loadCanvasData(previousState);
    socket.emit('undo_action', { roomCode: currentRoom, dataUrl: previousState });
});

function loadCanvasData(dataUrl) {
    if (!dataUrl) { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
    const img = new Image();
    img.onload = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0); };
    img.src = dataUrl;
}

socket.on('undo_action', loadCanvasData);

// --- SYNCHRONISATION DES SPECTATEURS EN COURS DE ROUTE ---
socket.on('request_canvas_state', (targetSocketId) => {
    if (isMyTurn) {
        socket.emit('sync_canvas_state', { targetSocketId: targetSocketId, dataUrl: canvas.toDataURL() });
    }
});
socket.on('receive_canvas_state', loadCanvasData);


socket.on('update_players', (players) => {
    playerList.innerHTML = '';
    players.forEach(p => {
        const li = document.createElement('li');
        let statusTag = "";
        if (!p.connected) statusTag = " (DÉCO)";
        else if (p.spectator) statusTag = " (EN ATTENTE)";
        
        li.innerHTML = `<span class="${!p.connected ? 'offline' : ''}"><span class="player-avatar">${p.avatar}</span> ${p.name}${statusTag}</span> <span class="score-badge">${p.score}</span>`;
        playerList.appendChild(li);
    });
});

socket.on('timer_update', (timeLeft) => {
    timerDisplay.textContent = timeLeft;
    if (timeLeft <= 5 && timeLeft > 0) { timerDisplay.classList.add('timer-urgent'); playTick(); } 
    else { timerDisplay.classList.remove('timer-urgent'); }
});

// --- MACHINE À ÉTAT DU JEU ---
socket.on('game_state_update', (state) => {
    const myPlayer = state.players.find(p => p.sessionId === mySessionId);
    const isSpectator = myPlayer && myPlayer.spectator;

    if (state.status === 'theme_voting') {
        drawingTools.style.display = 'none'; timerDisplay.style.display = 'none';
        voteModal.style.display = 'none'; podiumArea.style.display = 'none';
        startControls.style.display = 'none';

        if (isSpectator) {
            themeModal.style.display = 'none';
            turnDisplay.textContent = "CHOIX DU THÈME EN COURS... TU REJOINDRAS LA PROCHAINE MANCHE !";
            turnDisplay.style.color = "#111";
        } else {
            themeModal.style.display = 'flex';
            turnDisplay.textContent = "VOTE POUR LE THÈME EN COURS...";
        }
    }
    else if (state.status === 'playing') {
        themeModal.style.display = 'none'; startControls.style.display = 'none';
        voteModal.style.display = 'none'; podiumArea.style.display = 'none';
        
        if (isSpectator) {
            drawingTools.style.display = 'none'; timerDisplay.style.display = 'none';
            turnDisplay.textContent = "PARTIE EN COURS... TU REJOINDRAS LA PROCHAINE MANCHE !";
            turnDisplay.style.color = "#111";
        } else {
            drawingTools.style.display = 'flex'; timerDisplay.style.display = 'block';
            isMyTurn = (state.currentSessionId === mySessionId);
            turnDisplay.style.color = "var(--secondary)";
            updateCursor();
            
            if (isMyTurn) {
                turnDisplay.textContent = `C'EST À TON TOUR ! (TOUR ${state.round}/2)`;
                nextTurnBtn.style.display = 'block'; undoBtn.style.display = 'block';
                undoStack = []; playPop();
            } else {
                const currentPlayer = state.players.find(p => p.sessionId === state.currentSessionId);
                turnDisplay.textContent = `${currentPlayer ? currentPlayer.name : 'UN JOUEUR'} DESSINE... (TOUR ${state.round}/2)`;
                nextTurnBtn.style.display = 'none'; undoBtn.style.display = 'none';
            }
        }
    } 
    else if (state.status === 'voting') {
        drawingTools.style.display = 'none'; timerDisplay.style.display = 'none';
        
        if (isSpectator) {
            voteModal.style.display = 'none';
            turnDisplay.textContent = "VOTE POUR LE FAUSSAIRE EN COURS... EN ATTENTE DE LA PROCHAINE MANCHE !";
            turnDisplay.style.color = "var(--danger)";
        } else {
            turnDisplay.textContent = "DESSIN TERMINÉ ! EN ATTENTE DES VOTES...";
            turnDisplay.style.color = "var(--danger)";
            voteModal.style.display = 'flex'; voteModalButtons.innerHTML = '';
            
            state.players.forEach(p => {
                if (p.sessionId !== mySessionId && p.connected && !p.spectator) {
                    const btn = document.createElement('button');
                    btn.className = 'vote-card'; btn.innerHTML = `${p.avatar} ${p.name}`;
                    btn.onclick = () => {
                        socket.emit('vote_faussaire', { roomCode: currentRoom, votedSessionId: p.sessionId });
                        voteModal.style.display = 'none'; playPop();
                        turnDisplay.textContent = "VOTE ENREGISTRÉ !";
                    };
                    voteModalButtons.appendChild(btn);
                }
            });
        }
    }
    else if (state.status === 'result') {
        timerDisplay.style.display = 'none'; voteModal.style.display = 'none'; themeModal.style.display = 'none';
        turnDisplay.textContent = state.resultMessage.toUpperCase();
        turnDisplay.style.color = "var(--text-dark)";
        
        podiumArea.style.display = 'flex'; podiumList.innerHTML = '';
        const activePlayers = state.players.filter(p => !p.spectator);
        const sortedPlayers = [...activePlayers].sort((a,b) => b.score - a.score);
        
        sortedPlayers.forEach((p, index) => {
            if(index > 2) return; 
            const li = document.createElement('li');
            li.className = `rank-${index + 1}`;
            const position = index === 0 ? '1ER' : index === 1 ? '2ÈME' : '3ÈME';
            li.innerHTML = `<span>${position} - ${p.avatar} ${p.name}</span> <span>${p.score} PTS</span>`;
            podiumList.appendChild(li);
        });
    }
});

socket.on('game_started', (data) => {
    if (data.role === 'faussaire') {
        roleDisplay.textContent = `🤫 TU ES LE FAUSSAIRE !`; roleDisplay.style.color = "var(--danger)";
    } else {
        roleDisplay.textContent = `MOT : ${data.word.toUpperCase()}`; roleDisplay.style.color = "var(--secondary)";
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
});

// --- DESSIN ---
function drawLine(x0, y0, x1, y1, color, size, send = true) {
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
    ctx.strokeStyle = color; ctx.lineWidth = size; ctx.lineCap = 'round'; ctx.stroke(); ctx.closePath();
    
    // CORRECTION : L'envoi se fait à chaque segment tracé, sans délai de 15ms. Fluidité parfaite garantie !
    if (!send) return;
    socket.emit('draw', { roomCode: currentRoom, data: { x0, y0, x1, y1, color, size } });
}

function startDrawing(e) {
    if (!isMyTurn) return; 
    e.preventDefault(); undoStack.push(canvas.toDataURL());
    if (undoStack.length > 20) undoStack.shift(); 
    isDrawing = true; const pos = getMousePos(e); currentX = pos.x; currentY = pos.y;
}
function continueDrawing(e) {
    if (!isDrawing || !isMyTurn) return;
    e.preventDefault(); const pos = getMousePos(e);
    drawLine(currentX, currentY, pos.x, pos.y, currentColor, currentSize, true);
    currentX = pos.x; currentY = pos.y;
}
function stopDrawing() { isDrawing = false; }

canvas.addEventListener('mousedown', startDrawing); canvas.addEventListener('mousemove', continueDrawing);
canvas.addEventListener('mouseup', stopDrawing); canvas.addEventListener('mouseout', stopDrawing);
canvas.addEventListener('touchstart', startDrawing, { passive: false });
canvas.addEventListener('touchmove', continueDrawing, { passive: false });
canvas.addEventListener('touchend', stopDrawing);

socket.on('draw', (data) => drawLine(data.x0, data.y0, data.x1, data.y1, data.color, data.size, false));