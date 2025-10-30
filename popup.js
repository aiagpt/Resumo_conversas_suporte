document.addEventListener('DOMContentLoaded', () => {
    // --- Lógica Principal (Ativar/Desativar) ---
    const toggleSwitch = document.getElementById('toggle-switch');
    const statusText = document.getElementById('status-text');

    // Carrega o estado salvo quando o popup abre
    chrome.storage.sync.get(['extensionEnabled'], (result) => {
        toggleSwitch.checked = !!result.extensionEnabled;
        updateStatus(toggleSwitch.checked);
    });

    // Salva o estado e envia mensagem quando o botão é clicado
    toggleSwitch.addEventListener('change', () => {
        const isEnabled = toggleSwitch.checked;
        chrome.storage.sync.set({ extensionEnabled: isEnabled });
        updateStatus(isEnabled);

        // Envia uma mensagem para a content script na aba ativa
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].id) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    command: 'toggleExtension',
                    enabled: isEnabled
                });
            }
        });
    });

    function updateStatus(isEnabled) {
        if (isEnabled) {
            statusText.textContent = 'Extensão Ativada';
            statusText.style.color = '#00875f';
        } else {
            statusText.textContent = 'Extensão Desativada';
            statusText.style.color = '#555';
        }
    }

    // --- Lógica do Easter Egg (Jogo da Velha) ---
    const mainContainer = document.querySelector('.container');
    const gameContainer = document.getElementById('game-container');
    const easterEggTrigger = document.getElementById('easter-egg-trigger');
    const exitButton = document.getElementById('exit-button');
    const restartButton = document.getElementById('restart-button');
    const gameStatus = document.getElementById('game-status');
    const cells = document.querySelectorAll('.cell');
    const opponentSwitch = document.getElementById('opponent-switch');
    const labelGemini = document.getElementById('opponent-label-gemini');
    const labelMinimax = document.getElementById('opponent-label-minimax');

    const humanPlayer = 'X';
    const aiPlayer = 'O';
    let board = Array(9).fill('');
    let gameActive = true;
    let currentPlayer = humanPlayer;
    let currentOpponent = 'gemini'; // 'gemini' ou 'minimax'
    let moveHistory = []; // Para o prompt do Gemini

    // --- Lógica de Ativação do Easter Egg ---
    easterEggTrigger.addEventListener('click', () => {
        mainContainer.style.display = 'none';
        gameContainer.style.display = 'flex';
        startGame();
    });

    // --- Lógica de Controlo do Jogo ---
    opponentSwitch.addEventListener('change', () => {
        currentOpponent = opponentSwitch.checked ? 'minimax' : 'gemini';
        updateOpponentLabels();
    });
    
    function updateOpponentLabels() {
        if (currentOpponent === 'minimax') {
            labelGemini.style.fontWeight = 'normal';
            labelMinimax.style.fontWeight = 'bold';
            labelMinimax.style.color = '#333';
            labelGemini.style.color = '#888';
            // Atualiza o status *apenas* se o jogo não estiver ativo (para não sobrescrever "Vitória")
            if (gameActive) gameStatus.textContent = "IA Invencível ('O') ativada.";
        } else {
            labelGemini.style.fontWeight = 'bold';
            labelMinimax.style.fontWeight = 'normal';
            labelGemini.style.color = '#333';
            labelMinimax.style.color = '#888';
            if (gameActive) gameStatus.textContent = "IA Normal ('O') ativada.";
        }
    }

    function startGame() {
        board.fill('');
        cells.forEach(cell => {
            cell.textContent = '';
            cell.classList.remove('X', 'O', 'win', 'draw'); // <-- NOVO: Limpa classes de animação
        });
        gameActive = true;
        moveHistory = [];
        currentOpponent = opponentSwitch.checked ? 'minimax' : 'gemini';
        updateOpponentLabels(); // Define os labels *antes* de definir o status de início

        // Sorteia quem começa
        if (Math.random() < 0.5) {
            currentPlayer = humanPlayer;
            gameStatus.textContent = "Você ('X') começa.";
        } else {
            currentPlayer = aiPlayer;
            gameStatus.textContent = "A IA ('O') começa.";
            // Adiciona um pequeno atraso para a primeira jogada da IA
            setTimeout(makeAIMove, 500); 
        }
    }

    function handleCellClick(e, index) {
        const clickedIndex = index !== null ? index : parseInt(e.target.dataset.index);

        if (board[clickedIndex] !== '' || !gameActive || currentPlayer !== humanPlayer) {
            return;
        }

        // Jogada do Humano
        updateBoard(clickedIndex, humanPlayer);
        moveHistory.push({ player: humanPlayer, move: clickedIndex });

        if (checkGameEnd()) return;

        // Próximo é a IA
        currentPlayer = aiPlayer;
        gameStatus.textContent = "IA ('O') está a pensar...";
        setTimeout(makeAIMove, 500); // Dá um tempo para o jogador ver a sua jogada
    }

    // --- ATUALIZADO: Roteador de Jogada da IA ---
    function makeAIMove() {
        if (!gameActive) return;

        if (currentOpponent === 'gemini') {
            // --- MÉTODO 1: Chamar a IA Gemini (Nuvem) ---
            chrome.runtime.sendMessage(
                { command: 'getAIMove', board: board, history: moveHistory },
                (response) => {
                    // Verifica se o canal de comunicação ainda existe
                    if (chrome.runtime.lastError) {
                        console.error("Erro de comunicação (popup.js):", chrome.runtime.lastError.message);
                        gameStatus.textContent = "Erro: IA adormeceu. Reinicie.";
                        gameActive = false; // Para o jogo
                        return;
                    }
                    
                    if (response.error) {
                        console.error("Erro da IA (Gemini):", response.error);
                        gameStatus.textContent = "IA falhou. Tente o Minimax.";
                        // Fallback: se o Gemini falhar, deixa o humano jogar
                        currentPlayer = humanPlayer;
                        return;
                    }
                    
                    if (board[response.move] === '') {
                        updateBoard(response.move, aiPlayer);
                        moveHistory.push({ player: aiPlayer, move: response.move });
                        if (checkGameEnd()) return;
                        currentPlayer = humanPlayer;
                        gameStatus.textContent = "Sua vez ('X').";
                    } else {
                        console.warn("IA (Gemini) tentou jogada inválida, usando fallback.");
                        makeRandomMove();
                    }
                }
            );
        } else {
            // --- MÉTODO 2: Chamar a IA Minimax (Local) ---
            const bestMove = findBestMove(board);
            if (bestMove !== -1) {
                updateBoard(bestMove, aiPlayer);
                moveHistory.push({ player: aiPlayer, move: bestMove });
                if (checkGameEnd()) return;
                currentPlayer = humanPlayer;
                gameStatus.textContent = "Sua vez ('X').";
            }
        }
    }

    function makeRandomMove() {
        if (!gameActive) return;
        const availableCells = board
            .map((cell, index) => (cell === '' ? index : null))
            .filter(index => index !== null);
        
        if (availableCells.length > 0) {
            const move = availableCells[Math.floor(Math.random() * availableCells.length)];
            updateBoard(move, aiPlayer);
            moveHistory.push({ player: aiPlayer, move: move });
            if (checkGameEnd()) return;
            currentPlayer = humanPlayer;
            gameStatus.textContent = "Sua vez ('X').";
        }
    }

    function updateBoard(index, player) {
        board[index] = player;
        cells[index].textContent = player;
        cells[index].classList.add(player);
    }

    // --- NOVO: Função para animar o fim do jogo ---
    function animateEndGame(pattern, winner) {
        for (const index of pattern) {
            cells[index].classList.add('win'); // Adiciona classe de pulsação
            if (winner === 'T') {
                cells[index].classList.add('draw'); // Adiciona classe de empate (fade)
            }
        }
    }

    // --- ATUALIZADO: Lógica de Fim de Jogo ---
    function checkGameEnd() {
        const result = checkWinner(board); // result é { winner, pattern } ou null
        
        if (result) {
            gameActive = false;
            gameStatus.textContent = result.winner === 'T' ? 'Empate!' : `Fim de Jogo: '${result.winner}' venceu!`;
            
            // --- NOVO: Chama a animação ---
            animateEndGame(result.pattern, result.winner);

            // --- NOVO: Reinicia automaticamente após 2 segundos ---
            setTimeout(startGame, 2000); 
            
            return true;
        }
        return false;
    }

    // --- ATUALIZADO: checkWinner agora retorna um objeto com o padrão vencedor ---
    function checkWinner(currentBoard) {
        const winPatterns = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8], // Linhas
            [0, 3, 6], [1, 4, 7], [2, 5, 8], // Colunas
            [0, 4, 8], [2, 4, 6]  // Diagonais
        ];

        for (const pattern of winPatterns) {
            const [a, b, c] = pattern;
            if (currentBoard[a] && currentBoard[a] === currentBoard[b] && currentBoard[a] === currentBoard[c]) {
                return { winner: currentBoard[a], pattern: pattern }; // <-- Objeto de vitória
            }
        }

        if (currentBoard.every(cell => cell !== '')) {
            // Retorna todas as células para a animação de empate
            return { winner: 'T', pattern: [0, 1, 2, 3, 4, 5, 6, 7, 8] }; // <-- Objeto de empate
        }

        return null; // Jogo continua
    }
    
    // --- NOVO: Algoritmo Minimax ---
    
    // Encontra a melhor jogada
    function findBestMove(board) {
        let bestScore = -Infinity;
        let bestMove = -1;

        for (let i = 0; i < board.length; i++) {
            if (board[i] === '') { // Se a célula estiver vazia
                board[i] = aiPlayer; // Tenta a jogada
                let score = minimax(board, 0, false); // Calcula o score para esta jogada
                board[i] = ''; // Desfaz a jogada
                
                if (score > bestScore) {
                    bestScore = score;
                    bestMove = i;
                }
            }
        }
        return bestMove;
    }

    // Função Minimax recursiva
    function minimax(currentBoard, depth, isMaximizing) {
        const result = checkWinner(currentBoard); // <-- ATUALIZADO: Usa o novo checkWinner
        if (result) {
            if (result.winner === aiPlayer) return 10 - depth;
            if (result.winner === humanPlayer) return depth - 10;
            if (result.winner === 'T') return 0;
        }

        if (isMaximizing) { // Vez da IA (quer maximizar o score)
            let bestScore = -Infinity;
            for (let i = 0; i < currentBoard.length; i++) {
                if (currentBoard[i] === '') {
                    currentBoard[i] = aiPlayer;
                    bestScore = Math.max(bestScore, minimax(currentBoard, depth + 1, false));
                    currentBoard[i] = '';
                }
            }
            return bestScore;
        } else { // Vez do Humano (quer minimizar o score da IA)
            let bestScore = Infinity;
            for (let i = 0; i < currentBoard.length; i++) {
                if (currentBoard[i] === '') {
                    currentBoard[i] = humanPlayer;
                    bestScore = Math.min(bestScore, minimax(currentBoard, depth + 1, true));
                    currentBoard[i] = '';
                }
            }
            return bestScore;
        }
    }
    // --- FIM Minimax ---
    
    // --- Listeners dos Botões ---
    cells.forEach((cell, index) => {
        cell.addEventListener('click', (e) => handleCellClick(e, index));
    });

    startGame();

    // --- Lógica de Saída ---
    exitButton.addEventListener('click', () => {
        gameContainer.style.display = 'none';
        mainContainer.style.display = 'flex';
    });
    
    // --- Lógica de Reinício ---
    restartButton.addEventListener('click', startGame);
});

