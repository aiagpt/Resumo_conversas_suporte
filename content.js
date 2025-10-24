// --- Estado da Extensão ---
let isExtensionEnabled = false;
let pageObserver = null; // Instância do MutationObserver

// --- Lógica de UI (Genérica - Usada por ambos) ---
// (Definida primeiro para estar disponível para os handlers)
function createModalUI() {
    const modalContainer = document.createElement('div');
    modalContainer.id = 'crx-modal-container';

    const closeButton = document.createElement('button');
    closeButton.id = 'crx-close-button';
    closeButton.innerHTML = '&times;';
    closeButton.onclick = () => modalContainer.remove();
    modalContainer.appendChild(closeButton);

    const view1 = createView1();
    modalContainer.appendChild(view1);

    const view2 = createView2();
    view2.style.display = 'none';
    modalContainer.appendChild(view2);

    // NOVO: View de Confirmação
    const viewConfirm = createConfirmView();
    viewConfirm.style.display = 'none';
    modalContainer.appendChild(viewConfirm);

    const copyButton = view2.querySelector('#crx-copy-button');
    const reportTextarea = view2.querySelector('#crx-report-textarea');

    copyButton.addEventListener('click', () => {
        reportTextarea.select();
        try {
            document.execCommand('copy');
            copyButton.textContent = 'Copiado!';
        } catch (err) {
            console.error('[Gerador de Resumo] Falha ao copiar:', err);
            copyButton.textContent = 'Erro ao copiar';
        }
        setTimeout(() => {
            copyButton.innerHTML = '📋 Copiar';
        }, 2000);
    });

    return { modalContainer, view1, view2, viewConfirm, reportTextarea };
}

function createView1() {
    const view = document.createElement('div');
    view.className = 'crx-view';
    // --- HTML ATUALIZADO ---
    // 1. Removido o checkbox
    // 2. Botão "Gerar Resumo" habilitado por padrão
    view.innerHTML = `
        <h2>Gerador de Resumo</h2>
        
        <p>Observação (opcional):</p>
        <textarea id="crx-obs-textarea" placeholder="Digite suas observações aqui..."></textarea>
        
        <button id="crx-generate-button" class="crx-button">
            <span class="crx-button-text">Gerar Resumo da Conversa</span>
            <div class="crx-spinner"></div>
        </button>
    `;
    // --- FIM DA ATUALIZAÇÃO ---
    return view;
}

function createView2() {
    const view = document.createElement('div');
    view.className = 'crx-view';
    view.innerHTML = `
        <h2>Relatório Gerado</h2>
        <textarea id="crx-report-textarea" readonly></textarea>
        <button id="crx-copy-button" class="crx-button">📋 Copiar</button>
    `;
    return view;
}

// NOVO: Função para criar a view de confirmação
function createConfirmView() {
    const view = document.createElement('div');
    view.className = 'crx-view crx-confirm-view';
    // --- LÓGICA INVERTIDA ---
    // "Sim" (Pular IA) é o secundário (cinza)
    // "Não" (Usar IA) é o primário (verde)
    view.innerHTML = `
        <h2>Verificação de Segurança</h2>
        <p>A conversa contém dados sensíveis (senhas, CPFs, cartões, etc.)?</p>
        <div class="crx-confirm-buttons">
            <button id="crx-confirm-yes" class="crx-button crx-button-secondary">
                <span class="crx-button-text">Sim (Pular IA)</span>
                <div class="crx-spinner"></div>
            </button>
            <button id="crx-confirm-no" class="crx-button">
                <span class="crx-button-text">Não (Usar IA)</span>
                <div class="crx-spinner"></div>
            </button>
        </div>
    `;
    return view;
}
// --- Fim da Lógica de UI (Genérica) ---


// --- DEFINIÇÃO DOS HANDLERS ---

/**
 * Manipulador para a estrutura original (VerdanaDesk com botão "Finalizar")
 */
const VerdanaDeskHandler = {

    siteIdentifier: "VerdanaDesk_Finalizar",

    getText: function(selector) {
        // Procura dentro do overlay, para garantir que estamos pegando os dados do popup
        const overlay = document.querySelector('div.v-overlay__content');
        const context = overlay || document; // Usa o overlay se existir, senão o documento todo
        
        const element = context.querySelector(selector);
        // Usa .textContent para pegar texto de elementos aninhados
        return element ? element.textContent.trim() : '';
    },

    findTriggerButton: function() {
        const spans = document.querySelectorAll('span.v-btn__content');
        spans.forEach(span => {
            if (span.textContent.trim() === 'Finalizar') {
                const button = span.closest('button');
                if (button && !button.hasAttribute('data-crx-listener')) {
                    console.log('[Gerador de Resumo] Botão "Finalizar" (Verdana) encontrado!');
                    button.setAttribute('data-crx-listener', 'true');
                    // NÃO usa captura, espera o overlay
                    button.addEventListener('click', VerdanaDeskHandler.onTriggerButtonClick);
                }
            }
        });
    },

    onTriggerButtonClick: function(event) {
        if (!isExtensionEnabled) return;
        
        // NÃO impede o evento padrão - deixa o overlay do VerdanaDesk aparecer.
        console.log('[Gerador de Resumo] Clique no "Finalizar" (Verdana) detetado. A aguardar overlay...');

        const existingModal = document.getElementById('crx-modal-container');
        if (existingModal) existingModal.remove();

        // ATUALIZADO: Pega as 3 views
        const { modalContainer, view1, view2, viewConfirm, reportTextarea } = createModalUI();
        
        const generateButton = view1.querySelector('#crx-generate-button');
        const obsTextarea = view1.querySelector('#crx-obs-textarea');
        
        // --- LÓGICA INVERTIDA ---
        const confirmYesButton = viewConfirm.querySelector('#crx-confirm-yes'); // Botão SIM (Pular IA)
        const confirmNoButton = viewConfirm.querySelector('#crx-confirm-no');   // Botão NÃO (Usar IA)
        // -----------------------

        // --- LÓGICA DE GERAÇÃO (VIEW 1) ---
        generateButton.addEventListener('click', (e_gen) => {
            e_gen.stopPropagation(); // Impede que o clique "borbulhe" para o overlay

            // Apenas troca para a view de confirmação
            view1.style.display = 'none';
            viewConfirm.style.display = 'flex';
        });


        // --- LÓGICA CONFIRMAÇÃO "NÃO" (Usar IA) ---
        confirmNoButton.addEventListener('click', (e_no) => {
            e_no.stopPropagation(); // Impede o clique no overlay
            
            // --- ATIVA O LOADING (no botão "Não") ---
            confirmNoButton.classList.add('loading');
            confirmNoButton.disabled = true;
            confirmYesButton.disabled = true; // Desabilita ambos
            obsTextarea.style.color = '#000';
            // ---------------------

            // Extração de dados acontece AQUI
            const ticketInfo = VerdanaDeskHandler.extractTicketDataFromPopup();
            const chatLog = VerdanaDeskHandler.extractChatLog();
            const observations = obsTextarea.value;
            
            let fullConversation = "--- Informações do Ticket (do popup) ---\n" +
                                   ticketInfo +
                                   "\n\n--- Histórico da Conversa (do chat) ---\n" +
                                   chatLog;

            if (observations.trim() !== '') {
                fullConversation += `\n\n--- Observações Adicionais do Técnico ---\n${observations}`;
            }

            chrome.runtime.sendMessage(
                { command: 'summarizeConversation', conversation: fullConversation },
                (response) => {
                    // --- DESATIVA O LOADING ---
                    const currentConfirmYes = document.getElementById('crx-confirm-yes');
                    const currentConfirmNo = document.getElementById('crx-confirm-no');
                    if (currentConfirmYes && currentConfirmNo) {
                        currentConfirmNo.classList.remove('loading');
                        currentConfirmNo.disabled = false;
                        currentConfirmYes.disabled = false;
                    }
                    // ------------------------

                    if (chrome.runtime.lastError) {
                        console.error('[ContentScript] Contexto invalidado (Verdana):', chrome.runtime.lastError.message);
                        document.getElementById('crx-modal-container')?.remove();
                        return;
                    }
                    
                    if (response && response.summary) {
                        const originalReport = VerdanaDeskHandler.extractReportBaseData(); 
                        reportTextarea.value = `${originalReport}\n\nResumo da IA:\n${response.summary}`;
                        if (observations.trim() !== '') {
                            reportTextarea.value += `\n\nObservações Adicionais:\n${observations}`;
                        }
                        // Troca para a view 2 (Resultado)
                        viewConfirm.style.display = 'none';
                        view2.style.display = 'flex';
                    } else if (response && response.error) {
                        console.error('[ContentScript] Erro (Verdana):', response.error);
                        // Volta para a view 1 para mostrar o erro
                        viewConfirm.style.display = 'none';
                        view1.style.display = 'flex';
                        obsTextarea.value = `Erro ao gerar resumo: ${response.error}`;
                        obsTextarea.style.color = 'red';
                    } else {
                        console.error('[ContentScript] Resposta inválida (Verdana):', response);
                        // Volta para a view 1 para mostrar o erro
                        viewConfirm.style.display = 'none';
                        view1.style.display = 'flex';
                        obsTextarea.value = 'Erro: Resposta inválida do script de background.';
                        obsTextarea.style.color = 'red';
                    }
                }
            );
        });

        // --- LÓGICA CONFIRMAÇÃO "SIM" (Pular IA) ---
        confirmYesButton.addEventListener('click', (e_yes) => {
            e_yes.stopPropagation(); // Impede o clique no overlay
            
            const originalReport = VerdanaDeskHandler.extractReportBaseData();
            const observations = obsTextarea.value;
            
            // Popula o relatório SEM IA
            reportTextarea.value = originalReport;
            if (observations.trim() !== '') {
                reportTextarea.value += `\n\nObservações Adicionais:\n${observations}`;
            }
            
            // Troca para a view 2 (Resultado)
            viewConfirm.style.display = 'none';
            view2.style.display = 'flex';
        });


        // Lógica de injeção original do VerdanaDesk (espera o overlay aparecer)
        setTimeout(() => {
            const overlay = document.querySelector('div.v-overlay__content');
            if (overlay) {
                overlay.appendChild(modalContainer);
                console.log('[Gerador de Resumo] Modal injetado no overlay (Verdana).');
            } else {
                document.body.appendChild(modalContainer);
                console.log('[Gerador de Resumo] Modal injetado no body (Verdana fallback).');
            }
        }, 0); // Timeout 0 espera o overlay ser criado pelo script do site
    },

    extractChatLog: function() {
        const chatList = document.querySelector('#chatlist');
        if (!chatList) {
            console.warn('[ContentScript] Não foi possível encontrar #chatlist (Verdana).');
            return "A conversa não foi encontrada.";
        }
        let chatText = "Início da Conversa:\n";
        const messages = chatList.querySelectorAll('.v-list-item');
        messages.forEach(msg => {
            // --- CORREÇÃO DO BUG ---
            // Seletor antigo: '.v-list-item-title .text-primary, .v-list-item-title .text-red'
            // Seletor novo: Pega qualquer span que NÃO seja o .text-grey (horário)
            const senderEl = msg.querySelector('.v-list-item-title span:not(.text-grey)');
            // --- FIM DA CORREÇÃO ---
            
            const timeEl = msg.querySelector('.v-list-item-title .text-grey');
            const messageEl = msg.querySelector('.v-list-item-subtitle > .py-1');
            
            if (senderEl && messageEl && timeEl) {
                const sender = senderEl.textContent.trim();
                const time = timeEl.textContent.trim();
                const clone = messageEl.cloneNode(true);
                clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
                const message = clone.textContent.trim();
                chatText += `[${time}] ${sender}: ${message}\n`;
            }
        });
        chatText += "Fim da Conversa.\n";
        return chatText;
    },

    extractTicketDataFromPopup: function() {
        const ticketTitle = VerdanaDeskHandler.getText('.v-card-text .v-row:nth-child(2) p span');
        const ticketGroup = VerdanaDeskHandler.getText('.v-card-text .v-row:nth-child(4) p span');
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
    },

    extractReportBaseData: function() {
        const today = new Date().toLocaleDateString('pt-BR');
        let clientName = document.querySelector('#chatlist .v-list-item:first-child .text-primary')?.textContent.trim() || '[Nome do Cliente]';
        const ticketId = VerdanaDeskHandler.getText('.v-card-text .v-row:nth-child(1) p a');
        const ticketTitle = VerdanaDeskHandler.getText('.v-card-text .v-row:nth-child(2) p span');
        return `Relatório de Atendimento - ${today}\n` +
               `Cliente: ${clientName}\n` +
               `Chamado: ${ticketId}\n` +
               `Título: ${ticketTitle}`;
    }
};

/**
 * Manipulador para a estrutura GLPI (VerdanaDesk com botão "Solução")
 */
const GlpiHandler = {
    siteIdentifier: "GLPI_Solucao",

    getTextSafe: function(selector, context = document) {
        const element = context.querySelector(selector);
        return element ? element.textContent.replace(/\s+/g, ' ').trim() : '';
    },

    findTriggerButton: function() {
        const buttons = document.querySelectorAll('button.action-solution span');
        buttons.forEach(span => {
            if (span.textContent.trim() === 'Solução') {
                const button = span.closest('button');
                if (button && !button.hasAttribute('data-crx-listener')) {
                    console.log('[Gerador de Resumo] Botão "Solução" (GLPI) encontrado!');
                    button.setAttribute('data-crx-listener', 'true');
                    // Usa captura (true) para ser acionado ANTES do script da página
                    button.addEventListener('click', GlpiHandler.onTriggerButtonClick, true);
                }
            }
        });
    },

    onTriggerButtonClick: function(event) {
        if (!isExtensionEnabled) {
            console.log('[Gerador de Resumo] Extensão desativada, ignorando clique (GLPI).');
            return;
        }
        
        // Impede que o clique original da página (abrir o colapso) seja executado
        event.stopPropagation();
        event.preventDefault();

        console.log('[Gerador de Resumo] Clique no "Solução" (GLPI) detetado e impedido.');

        // Coleta os dados AGORA, pois a página não vai mudar
        const baseData = GlpiHandler.extractReportBaseData();
        const ticketData = GlpiHandler.extractTicketData();
        const chatLog = GlpiHandler.extractChatLog();

        const existingModal = document.getElementById('crx-modal-container');
        if (existingModal) existingModal.remove();

        // ATUALIZADO: Pega as 3 views
        const { modalContainer, view1, view2, viewConfirm, reportTextarea } = createModalUI();
        
        const generateButton = view1.querySelector('#crx-generate-button');
        const obsTextarea = view1.querySelector('#crx-obs-textarea');
        
        // --- LÓGICA INVERTIDA ---
        const confirmYesButton = viewConfirm.querySelector('#crx-confirm-yes'); // Botão SIM (Pular IA)
        const confirmNoButton = viewConfirm.querySelector('#crx-confirm-no');   // Botão NÃO (Usar IA)
        // -----------------------


        // --- LÓGICA DE GERAÇÃO (VIEW 1) ---
        generateButton.addEventListener('click', () => {
            // Apenas troca para a view de confirmação
            view1.style.display = 'none';
            viewConfirm.style.display = 'flex';
        });

        // --- LÓGICA CONFIRMAÇÃO "NÃO" (Usar IA) ---
        confirmNoButton.addEventListener('click', () => {
            // --- ATIVA O LOADING (no botão "Não") ---
            confirmNoButton.classList.add('loading');
            confirmNoButton.disabled = true;
            confirmYesButton.disabled = true;
            obsTextarea.style.color = '#000';
            // ---------------------

            const observations = obsTextarea.value;
            
            let fullConversation = "--- Informações do Ticket ---\n" +
                                   ticketData + // Usa dados já coletados
                                   "\n\n--- Histórico da Conversa ---\n" +
                                   chatLog; // Usa dados já coletados

            if (observations.trim() !== '') {
                fullConversation += `\n\n--- Observações Adicionais do Técnico ---\n${observations}`;
            }

            chrome.runtime.sendMessage(
                { command: 'summarizeConversation', conversation: fullConversation },
                (response) => {
                    // --- DESATIVA O LOADING ---
                    const currentConfirmYes = document.getElementById('crx-confirm-yes');
                    const currentConfirmNo = document.getElementById('crx-confirm-no');
                    if (currentConfirmYes && currentConfirmNo) {
                        currentConfirmNo.classList.remove('loading');
                        currentConfirmNo.disabled = false;
                        currentConfirmYes.disabled = false;
                    }
                    // ------------------------

                    if (chrome.runtime.lastError) {
                        console.error('[ContentScript] Erro (GLPI):', chrome.runtime.lastError.message);
                        return;
                    }
                    
                    if (response && response.summary) {
                        reportTextarea.value = `${baseData}\n\nResumo da IA:\n${response.summary}`; // Usa baseData já coletado
                        if (observations.trim() !== '') {
                            reportTextarea.value += `\n\nObservações Adicionais:\n${observations}`;
                        }
                        // Troca para a view 2 (Resultado)
                        viewConfirm.style.display = 'none';
                        view2.style.display = 'flex';
                    } else if (response && response.error) {
                        console.error('[ContentScript] Erro (GLPI):', response.error);
                        // Volta para a view 1 para mostrar o erro
                        viewConfirm.style.display = 'none';
                        view1.style.display = 'flex';
                        obsTextarea.value = `Erro ao gerar resumo: ${response.error}`;
                        obsTextarea.style.color = 'red';
                    } else {
                        console.error('[ContentScript] Resposta inválida (GLPI):', response);
                         // Volta para a view 1 para mostrar o erro
                        viewConfirm.style.display = 'none';
                        view1.style.display = 'flex';
                        obsTextarea.value = 'Erro: Resposta inválida do script de background.';
                        obsTextarea.style.color = 'red';
                    }
                }
            );
        });

        // --- LÓGICA CONFIRMAÇÃO "SIM" (Pular IA) ---
        confirmYesButton.addEventListener('click', () => {
            const observations = obsTextarea.value;
            
            // Popula o relatório SEM IA
            reportTextarea.value = baseData; // Usa baseData já coletado
            if (observations.trim() !== '') {
                reportTextarea.value += `\n\nObservações Adicionais:\n${observations}`;
            }
            
            // Troca para a view 2 (Resultado)
            viewConfirm.style.display = 'none';
            view2.style.display = 'flex';
        });


        // Injeta o modal no body
        setTimeout(() => {
            document.body.appendChild(modalContainer);
            console.log('[Gerador de Resumo] Modal injetado no body (GLPI).');
            modalContainer.classList.add('glpi-modal-override');
        }, 100); // Pequeno atraso para garantir
    },

    extractChatLog: function() {
        const timeline = document.querySelector('.itil-timeline');
        if (!timeline) {
            console.warn('[ContentScript GLPI] Container da timeline (.itil-timeline) não encontrado.');
            return "Histórico da conversa não encontrado.";
        }

        let chatText = "";
        let descriptionAdded = false;
        const items = timeline.querySelectorAll(':scope > .timeline-item'); 

        items.forEach(item => {
            const isFollowup = item.classList.contains('ITILFollowup');
            const isDescription = item.classList.contains('ITILContent');

            if (!isFollowup && !isDescription) {
                return; 
            }

            const headerElement = item.querySelector('.timeline-header');
            const contentElement = item.querySelector('.card-body .rich_text_container, .card-body .content');

            if (headerElement && contentElement) {
                let headerText = headerElement.textContent.replace(/\s+/g, ' ').trim();
                const cloneContent = contentElement.cloneNode(true);
                cloneContent.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
                cloneContent.querySelectorAll('button, a.btn').forEach(btn => btn.remove());
                let content = cloneContent.textContent.replace(/\s+/g, ' ').trim();
                
                if (!content && cloneContent.innerHTML.includes('<img')) {
                    content = '[Imagem anexada]';
                }

                const match = headerText.match(/(?:Criado em:|Por)\s*(.*?)\s*(?:em|at)\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}|Ontem|Hoje)/i);
                let author = headerText; 
                let time = '';
                if (match && match.length >= 3) {
                    author = match[1].trim().replace(/^por\s+/i, ''); 
                    time = match[2].trim();
                } else {
                    const simpleMatch = headerText.match(/(.*?)\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}|Ontem|Hoje)/i);
                     if (simpleMatch && simpleMatch.length >= 3) {
                         author = simpleMatch[1].trim();
                         time = simpleMatch[2].trim();
                     }
                }

                if (isDescription && !descriptionAdded) {
                    chatText += `Descrição Inicial (${time} por ${author}):\n${content}\n---\n`;
                    descriptionAdded = true;
                } else if (isFollowup) {
                    chatText += `[${time || 'Tempo não encontrado'}] ${author}:\n${content}\n---\n`;
                }
            }
        });

        if (chatText === "") {
             console.warn('[ContentScript GLPI] Nenhum item de descrição ou acompanhamento encontrado na timeline.');
             chatText = "Nenhuma descrição ou acompanhamento encontrado.\n";
        } else if (!descriptionAdded) {
            const initialDescription = GlpiHandler.getTextSafe('#tab_principale .card-text .content, #tab_Item_Ticket_1 .card-text .content');
            chatText = `Descrição Inicial: ${initialDescription || '[Não encontrada]'}\n---\n` + chatText;
        }

        chatText += "Fim da Conversa.\n";
        return chatText;
    },

    extractTicketData: function() {
        const headerTitleElement = document.querySelector('h3.navigationheader-title');
        let ticketTitle = '[Título não encontrado]';
        let ticketId = '[ID não encontrado]';

        if (headerTitleElement) {
            const fullTitle = headerTitleElement.textContent.replace(/\s+/g, ' ').trim();
            const matchId = fullTitle.match(/\(#(\d+)\)/);
            if (matchId && matchId[1]) {
                ticketId = matchId[1];
                ticketTitle = fullTitle.replace(/\(#\d+\)\s*-\s*/, '').trim();
            } else {
                ticketTitle = fullTitle; 
            }
        }

        let ticketGroup = '[Grupo não encontrado]';
        const labels = document.querySelectorAll('label, th, dt, .glpi-label');
        labels.forEach(label => {
            if (label.textContent.trim().includes('Grupo')) {
                const container = label.closest('div.row, div.mb-3, tr, dl > div'); 
                if (container) {
                    // *** CORREÇÃO DE SINTAXE (:)not([class*="..."]) ***
                    const valueElement = container.querySelector('span:not(.badge), div:not(.glpi-label):not([class*="col-md-"]), td, dd'); 
                     if (valueElement && valueElement.textContent.trim()) {
                         ticketGroup = valueElement.textContent.replace(/\s+/g, ' ').trim();
                     }
                }
            }
        });

        const initialDescriptionElement = document.querySelector('#tab_principale .card-text .content, #tab_Item_Ticket_1 .card-text .content');
        let initialDescription = '[Descrição não encontrada]';
         if (initialDescriptionElement) {
            const clone = initialDescriptionElement.cloneNode(true);
            clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
            initialDescription = clone.textContent.replace(/\s+/g, ' ').trim();
        }

        return `Título do Chamado: ${ticketTitle}\n` +
               `Grupo de Atendimento: ${ticketGroup}\n` +
               `Descrição Inicial: ${initialDescription}`;
    },

    extractReportBaseData: function() {
        const today = new Date().toLocaleDateString('pt-BR');
        let clientName = '[Requerente não encontrado]';
        const actorLabels = document.querySelectorAll('label, th, dt, .glpi-label');
        actorLabels.forEach(label => {
            if (label.textContent.trim().toLowerCase() === 'requerente') {
                const container = label.closest('div.row, div.mb-3, tr, dl > div');
                if (container) {
                    // *** CORREÇÃO DE SINTAXE (:)not([class*="..."]) ***
                    const valueElement = container.querySelector('a[href*="user.form.php"], span:not(.badge), div:not(.glpi-label):not([class*="col-md-"]), td, dd');
                    if (valueElement && valueElement.textContent.trim()) {
                        clientName = valueElement.textContent.replace(/\s+/g, ' ').trim();
                    }
                }
            }
        });

        const headerTitleElement = document.querySelector('h3.navigationheader-title');
        let ticketTitle = '[Título não encontrado]';
        let ticketId = '[ID não encontrado]';
        if (headerTitleElement) {
            const fullTitle = headerTitleElement.textContent.replace(/\s+/g, ' ').trim();
            const matchId = fullTitle.match(/\(#(\d+)\)/);
            if (matchId && matchId[1]) {
                ticketId = matchId[1];
                ticketTitle = fullTitle.replace(/\(#\d+\)\s*-\s*/, '').trim();
            } else {
                ticketTitle = fullTitle;
            }
        }

        return `Relatório de Atendimento - ${today}\n` +
               `Cliente: ${clientName}\n` +
               `Chamado: ${ticketId}\n` +
               `Título: ${ticketTitle}`;
    }
};
// --- Fim do Handler: GLPI ---


// --- Lógica Principal (Roteador e Observador) ---

let activeHandler = null; 

/**
 * Função chamada pelo MutationObserver.
 * Tenta detetar o handler e, se encontrado, procura o botão.
 */
function onMutation() {
    if (!isExtensionEnabled) {
        return;
    }

    if (activeHandler && document.querySelector('[data-crx-listener="true"]')) {
         if (pageObserver) {
            pageObserver.disconnect();
            pageObserver = null;
            console.log('[Gerador de Resumo] Botão gatilho encontrado e listener anexado. Observer parado.');
         }
         return;
    }

    if (!activeHandler) {
        activeHandler = detectAndSelectHandler();
        if (activeHandler) {
            console.log(`[Gerador de Resumo] Handler detetado: ${activeHandler.siteIdentifier}.`);
        } else {
            return; 
        }
    }

    // *** CORREÇÃO AQUI ***
    // Chama a função findTriggerButton do handler ativo
    if (activeHandler && !document.querySelector('[data-crx-listener="true"]')) {
        activeHandler.findTriggerButton();
    }
}


/**
 * Determina qual handler (lógica de site) usar com base no conteúdo da página.
 */
function detectAndSelectHandler() {
    const finalizarButtonSpan = Array.from(document.querySelectorAll('span.v-btn__content')).find(span => span.textContent.trim() === 'Finalizar');
    if (finalizarButtonSpan && finalizarButtonSpan.closest('button')) {
         console.log("[Gerador de Resumo] Detetada estrutura VerdanaDesk_Finalizar.");
        return VerdanaDeskHandler;
    }

     const solucaoButtonSpan = Array.from(document.querySelectorAll('button.action-solution span')).find(span => span.textContent.trim() === 'Solução');
     if (solucaoButtonSpan && solucaoButtonSpan.closest('button')) {
          console.log("[Gerador de Resumo] Detetada estrutura GLPI_Solucao.");
         return GlpiHandler;
     }

    return null; // Nenhum handler compatível encontrado
}

/**
 * Inicia ou para de observar a página.
 */
function setupObserver(enable) {
    if (pageObserver) {
        pageObserver.disconnect();
        pageObserver = null;
        console.log('[Gerador de Resumo] Observer parado.');
    }
    
    document.querySelectorAll('[data-crx-listener="true"]').forEach(btn => {
        btn.removeAttribute('data-crx-listener');
        // Remove listeners de ambos os handlers para garantir
        if (typeof VerdanaDeskHandler !== 'undefined' && typeof VerdanaDeskHandler.onTriggerButtonClick === 'function') {
             btn.removeEventListener('click', VerdanaDeskHandler.onTriggerButtonClick); 
        }
        if (typeof GlpiHandler !== 'undefined' && typeof GlpiHandler.onTriggerButtonClick === 'function') {
            btn.removeEventListener('click', GlpiHandler.onTriggerButtonClick, true); 
        }
    });
    activeHandler = null; 

    if (enable) {
        console.log('[Gerador de Resumo] Ativado. Iniciando MutationObserver...');
        pageObserver = new MutationObserver(onMutation);
        pageObserver.observe(document.body, { childList: true, subtree: true });
        onMutation(); // Tenta executar imediatamente
    } else {
        console.log('[Gerador de Resumo] Desativado.');
    }
}


// --- Comunicação com o popup e background ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.command === 'toggleExtension') {
        isExtensionEnabled = request.enabled;
        setupObserver(isExtensionEnabled);
    }
    if (request.command === 'navigationHappened') {
        console.log('[Gerador de Resumo] Navegação detetada, reavaliando página...');
        if (isExtensionEnabled) {
            setupObserver(false); 
            setupObserver(true);  
        }
    }
     return false; 
});

// Verifica o estado inicial quando a página carrega
chrome.storage.sync.get(['extensionEnabled'], (result) => {
    isExtensionEnabled = !!result.extensionEnabled;
    setupObserver(isExtensionEnabled);
});

