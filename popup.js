document.addEventListener('DOMContentLoaded', () => {
    const toggleSwitch = document.getElementById('toggle-switch');
    const statusText = document.getElementById('status-text');

    // --- Lógica do Toggle (Existente) ---

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

    // --- LÓGICA DO EASTER EGG (JOGO DA VELHA) ---
    const mainContainer = document.getElementById('main-container');
    const gameContainer = document.getElementById('game-container');
    const trigger = document.getElementById('easter-egg-trigger'); // O "ou"

    // Elementos do Jogo
    const gameBoard = document.getElementById('game-board');
    const cells = document.querySelectorAll('.cell');
    const gameStatus = document.getElementById('game-status');
    const restartButton = document.getElementById('restart-button');
    const exitButton = document.getElementById('exit-button');

    let board = ['', '', '', '', '', '', '', '', ''];
    let currentPlayer = 'X';
    let gameActive = true;
    let gameHistory = []; // Histórico de jogadas

    // --- Lógica de Ativação ---
    trigger.addEventListener('click', () => {
        mainContainer.style.display = 'none';
        gameContainer.style.display = 'flex';
        startGame();
    });

    // --- Lógica de Saída ---
    exitButton.addEventListener('click', () => {
        gameContainer.style.display = 'none';
        mainContainer.style.display = 'flex';
    });

    // --- Lógica de Reinício ---
    restartButton.addEventListener('click', startGame);

    // --- Lógica do Tabuleiro ---
    cells.forEach(cell => {
        cell.addEventListener('click', handleCellClick);
    });

    function handleCellClick(event) {
        const clickedCell = event.target;
        const clickedCellIndex = parseInt(clickedCell.getAttribute('data-index'));

        if (board[clickedCellIndex] !== '' || !gameActive || currentPlayer === 'O') {
            return; // Ignora clique se a célula estiver ocupada, jogo inativo, ou for a vez da IA
        }

        makeMove(clickedCellIndex, 'X');

        if (checkWinner()) {
            endGame(false);
        } else if (board.every(cell => cell !== '')) {
            endGame(true); // Empate
        } else {
            currentPlayer = 'O';
            updateGameStatus("A IA (O) está a pensar...");
            gameBoard.classList.add('disabled'); // Desabilita o tabuleiro
            
            // Adiciona um pequeno atraso para a jogada da IA
            setTimeout(aiMove, 500);
        }
    }

    // --- ATUALIZADO: Início do Jogo (com Sorteio) ---
    function startGame() {
        board = ['', '', '', '', '', '', '', '', ''];
        gameActive = true;
        gameHistory = [];
        cells.forEach(cell => {
            cell.textContent = '';
            cell.classList.remove('x', 'o');
        });
        gameBoard.classList.remove('disabled');

        // --- NOVA LÓGICA DE SORTEIO ---
        const startingPlayer = Math.random() < 0.5 ? 'X' : 'O';
        currentPlayer = startingPlayer;

        if (startingPlayer === 'X') {
            updateGameStatus("É a sua vez (X)");
        } else {
            // A IA começa!
            updateGameStatus("A IA (O) começa...");
            gameBoard.classList.add('disabled'); // Desabilita o tabuleiro
            // Adiciona um pequeno atraso para o jogador perceber
            setTimeout(aiMove, 500); // aiMove é a função que chama o background.js
        }
        // --- FIM DA LÓGICA ---
    }

    function makeMove(index, player) {
        board[index] = player;
        cells[index].textContent = player;
        cells[index].classList.add(player.toLowerCase());
        gameHistory.push({ player: player, move: index });
    }

    function updateGameStatus(message) {
        gameStatus.textContent = message;
    }

    function aiMove() {
        // Envia o estado atual para o background script
        chrome.runtime.sendMessage(
            {
                command: 'getAIMove',
                board: board,
                history: gameHistory
            },
            (response) => {
                if (chrome.runtime.lastError) {
                    console.error(chrome.runtime.lastError.message);
                    updateGameStatus("Erro na IA. Tente reiniciar.");
                    gameBoard.classList.remove('disabled');
                    return;
                }

                if (response.error) {
                    console.error(response.error);
                    updateGameStatus("Erro na IA. Tente reiniciar.");
                    gameBoard.classList.remove('disabled');
                    return;
                }

                if (response.move !== undefined && board[response.move] === '') {
                    const aiMoveIndex = response.move;
                    makeMove(aiMoveIndex, 'O');

                    if (checkWinner()) {
                        endGame(false);
                    } else if (board.every(cell => cell !== '')) {
                        endGame(true); // Empate
                    } else {
                        currentPlayer = 'X';
                        updateGameStatus("É a sua vez (X)");
                        gameBoard.classList.remove('disabled'); // Reabilita o tabuleiro
                    }
                } else {
                    // Fallback (se a IA falhar ou sugerir jogada inválida)
                    console.warn("IA sugeriu jogada inválida ou indefinida. Procurando fallback.");
                    const availableMoves = board.map((cell, i) => cell === '' ? i : null).filter(i => i !== null);
                    if (availableMoves.length > 0) {
                        makeMove(availableMoves[0], 'O');
                        currentPlayer = 'X';
                        updateGameStatus("É a sua vez (X)");
                        gameBoard.classList.remove('disabled');
                    } else {
                        endGame(true); // Empate
                    }
                }
            }
        );
    }

    function checkWinner() {
        const winningConditions = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8], // Linhas
            [0, 3, 6], [1, 4, 7], [2, 5, 8], // Colunas
            [0, 4, 8], [2, 4, 6]  // Diagonais
        ];

        for (let i = 0; i < winningConditions.length; i++) {
            const [a, b, c] = winningConditions[i];
            if (board[a] && board[a] === board[b] && board[a] === board[c]) {
                gameWinner = board[a];
                return true;
            }
        }
        gameWinner = null;
        return false;
    }

    function endGame(isDraw) {
        gameActive = false;
        gameBoard.classList.add('disabled'); // Desabilita o tabuleiro no fim

        if (isDraw) {
            updateGameStatus("Empate!");
        } else {
            updateGameStatus(`O Vencedor é ${gameWinner}!`);
        }
    }
});

