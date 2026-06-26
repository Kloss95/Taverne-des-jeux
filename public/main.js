// Fonction pour ouvrir un jeu dans la popup
function openGame(gameUrl) {
    const modal = document.getElementById('game-modal');
    const iframe = document.getElementById('game-frame');
    
    // Si la modale n'existe pas dans le HTML, on affiche une erreur dans la console
    if (!modal || !iframe) {
        console.error("ERREUR : La structure HTML de la modale est introuvable !");
        return;
    }
    
    // On indique à l'iframe d'aller chercher le fichier du jeu
    iframe.src = gameUrl;
    
    // On affiche la fenêtre
    modal.style.display = 'flex';
}

// Fonction pour fermer la popup
function closeGame() {
    const modal = document.getElementById('game-modal');
    const iframe = document.getElementById('game-frame');
    
    if (iframe) {
        // On vide la source de l'iframe pour couper le jeu et le son
        iframe.src = '';
    }
    if (modal) {
        // On recache la fenêtre
        modal.style.display = 'none';
    }
}