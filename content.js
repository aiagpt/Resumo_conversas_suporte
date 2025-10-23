// --- Estado da Extensão ---
let isExtensionEnabled = false;

// Função para iniciar ou parar de observar a página
function setupObserver(enable) {
    if (enable) {
        // Inicia o observer se ainda não estiver rodando
        if (!window.pageObserver) {
            console.log('[Gerador de Resumo] Ativado. Procurando botão...');
            const observer = new MutationObserver(findTriggerButton);
            observer.observe(document.body, { childList: true, subtree: true });
            window.pageObserver = observer;
            findTriggerButton(); // Procura imediatamente também
        }
    } else {
        // Para e remove o observer
        if (window.pageObserver) {
            console.log('[Gerador de Resumo] Desativado.');
            window.pageObserver.disconnect();
            delete window.pageObserver;
        }
    }
}

// --- Lógica para encontrar o botão ---
function findTriggerButton() {
    // Procura por todos os spans com a classe 'v-btn__content'
    const spans = document.querySelectorAll('span.v-btn__content');
    
    spans.forEach(span => {
        // Verifica se o texto dentro do span é "Finalizar"
        if (span.textContent.trim() === 'Finalizar') {
            
            // Encontra o elemento <button> pai mais próximo
            const button = span.closest('button');
            
            // Verifica se encontrou um botão e se ele já não tem o nosso "ouvinte"
            if (button && !button.hasAttribute('data-crx-listener')) {
                console.log('[Gerador de Resumo] Botão "Finalizar" encontrado!');
                // Marca o botão para não adicionar o "ouvinte" de novo
                button.setAttribute('data-crx-listener', 'true');
                // Adiciona a ação de clique
                button.addEventListener('click', onTriggerButtonClick);
            }
        }
    });
}

// --- Lógica para construir a interface ---
function onTriggerButtonClick(event) {
    // Se a extensão não estiver ativa, não faz nada.
    if (!isExtensionEnabled) return;

    // Remove qualquer modal antigo antes de criar um novo
    const existingModal = document.getElementById('crx-modal-container');
    if (existingModal) {
        existingModal.remove();
    }

    // --- Constrói a UI do Modal diretamente no DOM ---
    const modalContainer = document.createElement('div');
    modalContainer.id = 'crx-modal-container';

    const closeButton = document.createElement('button');
    closeButton.id = 'crx-close-button';
    closeButton.innerHTML = '&times;';
    closeButton.onclick = () => modalContainer.remove();
    modalContainer.appendChild(closeButton);

    // View 1: Gerar Resumo
    const view1 = createView1();
    modalContainer.appendChild(view1);

    // View 2: Relatório (inicialmente escondida)
    const view2 = createView2();
    view2.style.display = 'none';
    modalContainer.appendChild(view2);

    // --- Lógica para trocar de tela e copiar ---
    const generateButton = view1.querySelector('#crx-generate-button');
    const copyButton = view2.querySelector('#crx-copy-button');
    const obsTextarea = view1.querySelector('#crx-obs-textarea');
    const reportTextarea = view2.querySelector('#crx-report-textarea');

    generateButton.addEventListener('click', () => {
        
        // --- INÍCIO DA LÓGICA DE LOADING ---
        generateButton.textContent = 'Processando... ⌛';
        generateButton.disabled = true;
        obsTextarea.style.color = '#000'; // Resetar cor de erro
        // --- FIM DA LÓGICA DE LOADING ---

        // 1. Captura os dados do popup do site (Título, Grupo, etc.)
        const ticketInfo = extractTicketDataFromPopup();
        
        // 2. Captura o histórico da conversa real (da página principal)
        const chatLog = extractChatLog();
        
        // 3. Captura observações manuais
        const observations = obsTextarea.value;
        
        // 4. Combina tudo para enviar à IA
        let fullConversation = "--- Informações do Ticket (do popup) ---\n" +
                               ticketInfo +
                               "\n\n--- Histórico da Conversa (do chat) ---\n" +
                               chatLog;

        if (observations.trim() !== '') {
            fullConversation += `\n\n--- Observações Adicionais do Técnico ---\n${observations}`;
        }


        // Envia para o background.js para chamar a API
        chrome.runtime.sendMessage(
            { 
                command: 'summarizeConversation', 
                conversation: fullConversation
            }, 
            (response) => {
                
                // --- RESET DO ESTADO DE LOADING ---
                generateButton.textContent = 'Gerar Resumo da Conversa';
                generateButton.disabled = false;
                // --- FIM DO RESET ---

                if (response && response.summary) {
                    // Preenche o relatório com o resumo da IA
                    const originalReport = extractReportBaseData(); // Pega os dados base novamente
                    reportTextarea.value = `${originalReport}\n\nResumo da IA:\n${response.summary}`;
                    
                    // Adiciona observações se existirem
                    if (observations.trim() !== '') {
                        reportTextarea.value += `\n\nObservações Adicionais:\n${observations}`;
                    }

                    // Muda para a tela de relatório
                    view1.style.display = 'none';
                    view2.style.display = 'flex';
                } else if (response && response.error) {
                    // Mostra o erro no campo de observação
                    console.error('[ContentScript] Erro recebido do background:', response.error);
                    obsTextarea.value = `Erro ao gerar resumo: ${response.error}`;
                    obsTextarea.style.color = 'red';
                } else {
                    // Erro inesperado
                    console.error('[ContentScript] Resposta inválida do background:', response);
                    obsTextarea.value = 'Erro: Resposta inválida do script de background.';
                    obsTextarea.style.color = 'red';
                }
            }
        );
    });

    copyButton.addEventListener('click', () => {
        reportTextarea.select();
        document.execCommand('copy');
        copyButton.textContent = 'Copiado!';
        setTimeout(() => {
            copyButton.innerHTML = '📋 Copiar';
        }, 2000);
    });

    // Injeta o modal dentro do overlay do site
    setTimeout(() => {
        const overlay = document.querySelector('div.v-overlay__content');
        if (overlay) {
            overlay.appendChild(modalContainer);
        } else {
            // Fallback: se não achar o overlay, injeta no body
            document.body.appendChild(modalContainer);
        }
    }, 0); // Timeout 0 espera o overlay ser criado pelo script do site
}

// Função auxiliar para pegar o texto de um seletor
function getText(selector) {
    // Procura dentro do overlay, para garantir que estamos pegando os dados do popup
    const overlay = document.querySelector('div.v-overlay__content');
    const context = overlay || document; // Usa o overlay se existir, senão o documento todo
    
    const element = context.querySelector(selector);
    // Usa .textContent para pegar texto de elementos aninhados
    return element ? element.textContent.trim() : '';
}

// Função para extrair os dados base do popup do site
function extractReportBaseData() {
    const today = new Date().toLocaleDateString('pt-BR');
    
    // Tenta pegar o nome do cliente da UI do chat (se disponível)
    let clientName = document.querySelector('#chatlist .v-list-item:first-child .text-primary')?.textContent.trim() || '[Nome do Cliente]';
    
    // Pega os dados do overlay
    const ticketId = getText('.v-card-text .v-row:nth-child(1) p a');
    const ticketTitle = getText('.v-card-text .v-row:nth-child(2) p span');

    return `Relatório de Atendimento - ${today}\n` +
           `Cliente: ${clientName}\n` +
           `Chamado: ${ticketId}\n` +
           `Título: ${ticketTitle}`;
}

// --- NOVA FUNÇÃO ---
// Extrai o histórico de chat real da página principal
function extractChatLog() {
    // Procura o chat log na página principal (NÃO no overlay)
    const chatList = document.querySelector('#chatlist');
    if (!chatList) {
        console.warn('[ContentScript] Não foi possível encontrar a lista de chat (#chatlist).');
        return "A conversa não foi encontrada.";
    }

    let chatText = "Início da Conversa:\n";
    // Pega todas as mensagens
    const messages = chatList.querySelectorAll('.v-list-item');

    messages.forEach(msg => {
        // Tenta encontrar o nome/número do remetente
        const senderEl = msg.querySelector('.v-list-item-title .text-primary, .v-list-item-title .text-red'); // Adiciona 'text-red' se o técnico for vermelho
        // Tenta encontrar o timestamp
        const timeEl = msg.querySelector('.v-list-item-title .text-grey');
        // Tenta encontrar o texto da mensagem
        const messageEl = msg.querySelector('.v-list-item-subtitle > .py-1');

        if (senderEl && messageEl && timeEl) {
            const sender = senderEl.textContent.trim();
            const time = timeEl.textContent.trim();
            
            // Limpa o HTML da mensagem (para lidar com <br> e outros)
            const clone = messageEl.cloneNode(true);
            clone.querySelectorAll('br').forEach(br => br.replaceWith('\n')); // Substitui <br> por quebra de linha
            const message = clone.textContent.trim();

            chatText += `[${time}] ${sender}: ${message}\n`;
        }
    });

    chatText += "Fim da Conversa.\n";
    return chatText;
}


// --- FUNÇÃO MODIFICADA ---
// Extrai APENAS os dados do popup "Encerramento do atendimento"
function extractTicketDataFromPopup() {
    const ticketTitle = getText('.v-card-text .v-row:nth-child(2) p span');
    const ticketGroup = getText('.v-card-text .v-row:nth-child(4) p span');
    
    // Pega a descrição do popup (que é o PRIMEIRO item da conversa)
    const ticketDescEl = document.querySelector('#ticket_description_modal');
    let descriptionText = '';
    if (ticketDescEl) {
        const clone = ticketDescEl.cloneNode(true);
        clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
        descriptionText = clone.textContent.trim();
    }

    return `Título do Chamado: ${ticketTitle}\n` +
           `Grupo de Atendimento: ${ticketGroup}\n` +
           `Descrição Inicial (do popup): ${descriptionText}`;
}


function createView1() {
    const view = document.createElement('div');
    view.className = 'crx-view';
    view.innerHTML = `
        <h2>Gerador de Resumo</h2>
        <button id="crx-generate-button" class="crx-button">Gerar Resumo da Conversa</button>
        <p>Observação (opcional):</p>
        <textarea id="crx-obs-textarea" placeholder="Digite suas observações aqui..."></textarea>
    `;
    return view;
}

function createView2() {
    const view = document.createElement('div');
    view.className = 'crx-view';
    // O conteúdo do textarea será preenchido dinamicamente
    view.innerHTML = `
        <h2>Relatório Gerado</h2>
        <textarea id="crx-report-textarea" readonly></textarea>
        <button id="crx-copy-button" class="crx-button">📋 Copiar</button>
    `;
    return view;
}


// --- Comunicação com o popup ---
chrome.runtime.onMessage.addListener((request) => {
    if (request.command === 'toggleExtension') {
        isExtensionEnabled = request.enabled;
        setupObserver(isExtensionEnabled);
    }
    if (request.command === 'navigationHappened') {
        // A página mudou, re-avalia o DOM
        if (isExtensionEnabled) {
            setupObserver(true);
        }
    }
});

// Verifica o estado inicial quando a página carrega
chrome.storage.sync.get(['extensionEnabled'], (result) => {
    isExtensionEnabled = !!result.extensionEnabled;
    setupObserver(isExtensionEnabled);
});

