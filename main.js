const playButtons = document.querySelectorAll('.play-btn');
const modal = document.getElementById('game-modal');
const closeModalBtn = document.getElementById('close-modal');
const gameIframe = document.getElementById('game-iframe');
const modalTitle = document.getElementById('modal-title');

// Quand on clique sur un bouton "Jouer"
playButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
        // Récupère l'attribut data-game du bouton cliqué
        const gamePath = e.target.getAttribute('data-game');
        
        // Récupère le titre du jeu (le <h2> dans la même carte)
        const gameName = e.target.parentElement.querySelector('h2').innerText;
        
        // Injecte les infos dans la modale
        modalTitle.innerText = gameName;
        gameIframe.src = gamePath;
        
        // Affiche la fenêtre
        modal.classList.remove('hidden');
        
        // Optionnel : Bloque le défilement de la page en arrière-plan
        document.body.style.overflow = 'hidden'; 
    });
});

// Fonction pour fermer la modale et couper le jeu
function closeGame() {
    modal.classList.add('hidden');
    
    // On attend un petit délai (l'animation CSS) avant de vider l'iframe
    // Cela permet d'éviter que le jeu ne disparaisse brutalement avant que la fenêtre ne soit cachée
    setTimeout(() => {
        gameIframe.src = "about:blank"; // Vide l'iframe pour arrêter les boucles / musiques
        document.body.style.overflow = 'auto'; // Réactive le défilement
    }, 200);
}

// Quand on clique sur le bouton FERMER
closeModalBtn.addEventListener('click', closeGame);

// Option ergonomique : Fermer en cliquant à côté de la fenêtre (dans la zone sombre)
modal.addEventListener('click', (e) => {
    if (e.target === modal) {
        closeGame();
    }
});