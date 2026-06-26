// Fonction pour ouvrir un jeu dans la popup
function openGame(gameUrl) {
    const modal = document.getElementById('game-modal');
    const iframe = document.getElementById('game-frame');
    
    // On indique à l'iframe d'aller chercher le fichier du jeu
    iframe.src = gameUrl;
    
    // On affiche la fenêtre
    modal.style.display = 'flex';
}

// Fonction pour fermer la popup
function closeGame() {
    const modal = document.getElementById('game-modal');
    const iframe = document.getElementById('game-frame');
    
    // On vide la source de l'iframe (ça coupe instantanément le jeu et sa musique !)
    iframe.src = '';
    
    // On recache la fenêtre
    modal.style.display = 'none';
}