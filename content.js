// --- Estado da Extensão ---
let isExtensionEnabled = false;
let pageObserver = null; // Instância do MutationObserver

// Variável para rastrear a view anterior ao abrir o lightbox
let lastViewId = 'crx-view-2'; 
let copyToastElement = null; // Elemento do toast

// --- Lógica de Áudio ---
let audioContext = null;
function playNotificationSound() {
    try {
        const soundUrl = chrome.runtime.getURL('notificacao.mp3');
        const audio = new Audio(soundUrl);
        const playPromise = audio.play();

        if (playPromise !== undefined) {
            playPromise.then(_ => {
                console.log("Notificação a tocar.");
            }).catch(error => {
                console.error("Erro ao tocar notificação:", error);
            });
        }
    } catch (e) {
        console.error("Falha ao criar contexto de áudio:", e);
    }
}


// --- Lógica de Pop-up (Toast) ---

// NOVO: Função para mostrar o toast de sucesso
function showSuccessToast(message) {
    if (!copyToastElement) {
        // Cria o elemento se ainda não existir
        copyToastElement = document.createElement('div');
        copyToastElement.id = 'crx-toast';
        document.body.appendChild(copyToastElement);
    }

    copyToastElement.textContent = message;
    copyToastElement.classList.add('show');
    
    // Oculta após 2 segundos
    setTimeout(() => {
        copyToastElement.classList.remove('show');
    }, 2000); 
}


// --- Lógica de Bloqueio de Cópia (para o modal) ---
function blockCopy(event) {
    const isCtrlPressed = event.ctrlKey || event.metaKey; // Windows/Linux (Ctrl) ou Mac (Cmd)
    const isCopyOrSelectAll = event.key === 'c' || event.key === 'a'; // Teclas 'c' ou 'a'

    // Bloqueia CTRL+C e CTRL+A se a tecla CTRL/CMD estiver pressionada
    if (isCtrlPressed && isCopyOrSelectAll) {
        event.preventDefault();
        event.stopPropagation();
        return true;
    }
    return false;
}

// NOVO: Função para gerenciar listeners de bloqueio (GLOBAL)
function setCopyBlockListeners(enable) {
    if (enable) {
        // O terceiro argumento 'true' (captura) garante que intercetamos o evento primeiro
        document.addEventListener('keydown', blockCopy, true);
    } else {
        document.removeEventListener('keydown', blockCopy, true);
    }
}

/**
 * Fecha a UI da extensão removendo o modal e limpando listeners.
 * Usado para o botão 'X' do GLPI e para o toggle.
 */
function closeAllListenersAndModal() {
    const modalContainer = document.getElementById('crx-modal-container');
    if (modalContainer) {
        setCopyBlockListeners(false);
        modalContainer.remove();
        // Remove listener específico do botão 'X' do GLPI se ele existir
        GlpiHandler.removeCloseListener();
    }
}


// --- Lógica de UI (Genérica - Usada por ambos) ---
function createModalUI() {
    let originalLightboxText = "";
    let hasMadeEdits = false;
    
    const modalContainer = document.createElement('div');
    modalContainer.id = 'crx-modal-container';
    
    // Armazena o histórico de refinamento
    modalContainer.refineHistory = [];
    // Armazena o contexto da conversa
    modalContainer.conversationContext = ""; // Inicializa vazio
    // Armazena o ID do chamado para uso na cópia final
    modalContainer.ticketId = ""; 


    // Botão de Fechar 'X' removido aqui, de acordo com o pedido do utilizador

    const view1 = createView1();
    modalContainer.appendChild(view1);

    const view2 = createView2();
    view2.style.display = 'none';
    modalContainer.appendChild(view2);

    const viewSecurity = createSecurityView(); // Renomeada de viewConfirm
    viewSecurity.style.display = 'none';
    modalContainer.appendChild(viewSecurity);
    
    const viewCopyConfirm = createCopyConfirmView(); // NOVA view de confirmação de cópia
    viewCopyConfirm.style.display = 'none';
    modalContainer.appendChild(viewCopyConfirm);

    const lightboxContainer = document.createElement('div');
    lightboxContainer.id = 'crx-lightbox-container';
    lightboxContainer.innerHTML = `
        <div class="crx-lightbox-content">
            <button id="crx-lightbox-close">&times;</button>
            <textarea id="crx-lightbox-textarea" tabindex="0"></textarea>
            
            <div class="crx-lightbox-button-bar">
                <button id="crx-ai-undo-button" class="crx-button crx-button-secondary" disabled>↩️ Desfazer</button>
                <button id="crx-ai-fix-button" class="crx-button">✨ Consertar com IA</button>
            </div>

            <div id="crx-edit-confirm-modal" class="crx-edit-confirm-overlay">
                <div class="crx-edit-confirm-box">
                    <p>Deseja aplicar as alterações feitas no texto?</p>
                    <button id="crx-confirm-apply" class="crx-button">Aplicar</button>
                    <button id="crx-confirm-cancel" class="crx-button crx-button-secondary">Cancelar (Perder)</button>
                </div>
            </div>

            <div id="crx-ai-refine-modal" class="crx-edit-confirm-overlay">
                <div class="crx-ai-refine-box">
                    <p>O que deseja alterar no resumo?</p>
                    <textarea id="crx-ai-refine-prompt" placeholder="Ex: 'Seja mais formal', 'Resuma em 3 tópicos', 'Corrija a gramática'..."></textarea>
                    <button id="crx-ai-refine-submit" class="crx-button">
                        <span class="crx-button-text">Refinar</span>
                        <div class="crx-spinner"></div>
                    </button>
                    <button id="crx-ai-refine-cancel" class="crx-button crx-button-secondary">Cancelar</button>
                </div>
            </div>

        </div>
    `;
    modalContainer.appendChild(lightboxContainer);

    const copyButton = view2.querySelector('#crx-copy-button');
    const reportTextarea = view2.querySelector('#crx-report-textarea');
    const retryButton = view2.querySelector('#crx-retry-button');
    const lightboxTextarea = lightboxContainer.querySelector('#crx-lightbox-textarea');
    const lightboxCloseButton = lightboxContainer.querySelector('#crx-lightbox-close');
    const aiUndoButton = lightboxContainer.querySelector('#crx-ai-undo-button');
    const editConfirmModal = lightboxContainer.querySelector('#crx-edit-confirm-modal');
    const confirmApplyButton = lightboxContainer.querySelector('#crx-confirm-apply');
    const confirmCancelButton = lightboxContainer.querySelector('#crx-confirm-cancel');
    const aiFixButton = lightboxContainer.querySelector('#crx-ai-fix-button');
    const aiRefineModal = lightboxContainer.querySelector('#crx-ai-refine-modal');
    const aiRefinePrompt = modalContainer.querySelector('#crx-ai-refine-prompt');
    const aiRefineSubmit = modalContainer.querySelector('#crx-ai-refine-submit');
    const aiRefineCancel = modalContainer.querySelector('#crx-ai-refine-cancel');
    
    const copyConfirmCopyButton = viewCopyConfirm.querySelector('#crx-copy-confirm-copy-button');
    const copyConfirmReviewButton = viewCopyConfirm.querySelector('#crx-copy-confirm-review-button');

    // --- Funções de Navegação ---
    function returnToLastView() {
        lightboxContainer.style.display = 'none';
        
        // Retorna para a view que abriu o lightbox
        const lastViewElement = document.getElementById(lastViewId);
        if (lastViewElement) {
             lastViewElement.style.display = 'flex';
             setCopyBlockListeners(lastViewElement.id === 'crx-view-2' || lastViewElement.id === 'crx-view-copy-confirm');
        } else {
             // Fallback para a view do relatório se algo correr mal
             view2.style.display = 'flex';
             setCopyBlockListeners(true);
        }
    }
    
    // closeAllListenersAndModal foi movida para o escopo global

    // --- Lógica do Botão "Copiar" (Realiza a cópia e fecha) ---
    copyConfirmCopyButton.addEventListener('click', () => executeCopyAndClose(reportTextarea, modalContainer, copyConfirmCopyButton));
    
    // --- Lógica do Botão "Revisar/Editar" ---
    copyConfirmReviewButton.addEventListener('click', () => {
        // Ação: Abre o lightbox
        originalLightboxText = reportTextarea.value;
        lightboxTextarea.value = originalLightboxText;
        hasMadeEdits = false;
        
        modalContainer.refineHistory = [];
        aiUndoButton.disabled = true; 
        
        editConfirmModal.style.display = 'none';
        aiRefineModal.style.display = 'none';
        
        // Esconde a view atual e abre o lightbox
        viewCopyConfirm.style.display = 'none';
        lightboxContainer.style.display = 'flex';
        lastViewId = 'crx-view-copy-confirm'; // Define o retorno
    });

    // --- Lógica de Visualização do Relatório (Abre o Lightbox a partir da View 2) ---
    reportTextarea.addEventListener('click', () => {
        // Se clicar diretamente no relatório (fora do fluxo CopyConfirm), 
        // a intenção é ir para a edição, voltando para o relatório (view2) depois.
        originalLightboxText = reportTextarea.value;
        lightboxTextarea.value = originalLightboxText;
        hasMadeEdits = false;
        
        modalContainer.refineHistory = [];
        aiUndoButton.disabled = true; 
        
        editConfirmModal.style.display = 'none';
        aiRefineModal.style.display = 'none';
        
        view2.style.display = 'none'; // Esconde a view atual
        lightboxContainer.style.display = 'flex'; // Abre o lightbox
        lastViewId = 'crx-view-2'; // Define o retorno para a view do relatório
    });

    // --- Bloqueio do Menu de Contexto no Textarea do Relatório ---
    reportTextarea.addEventListener('contextmenu', (e) => {
        // Bloqueia o menu de contexto APENAS na view do relatório
        if (view2.style.display !== 'none' || viewCopyConfirm.style.display !== 'none') {
            e.preventDefault();
        }
    });

    // --- Listeners do Lightbox (Janela de Edição) ---
    lightboxTextarea.addEventListener('input', () => {
        hasMadeEdits = true;
    });

    lightboxCloseButton.addEventListener('click', () => {
        const currentText = lightboxTextarea.value;
        if (hasMadeEdits && currentText !== originalLightboxText) {
            editConfirmModal.style.display = 'flex';
        } else {
            returnToLastView(); // Retorna para a view que o abriu
        }
    });

    confirmApplyButton.addEventListener('click', () => {
        reportTextarea.value = lightboxTextarea.value;
        editConfirmModal.style.display = 'none';
        returnToLastView(); // Retorna para a view que o abriu
    });

    confirmCancelButton.addEventListener('click', () => {
        // Cancela a edição, mas retorna para a view anterior para forçar a decisão
        editConfirmModal.style.display = 'none';
        returnToLastView(); // Retorna para a view que o abriu
    });

    aiUndoButton.addEventListener('click', () => {
        if (modalContainer.refineHistory.length > 0) {
            const previousText = modalContainer.refineHistory.pop();
            lightboxTextarea.value = previousText;
            hasMadeEdits = true; 
            if (modalContainer.refineHistory.length === 0) {
                aiUndoButton.disabled = true;
            }
        }
    });

    aiFixButton.addEventListener('click', () => {
        aiRefinePrompt.value = '';
        aiRefinePrompt.style.color = '#333';
        aiRefineModal.style.display = 'flex';
    });

    aiRefineCancel.addEventListener('click', () => {
        aiRefineModal.style.display = 'none';
    });
    
    // --- Lógica de Reinício ---
    retryButton.addEventListener('click', () => {
        closeAllListenersAndModal();
        
        // Simula o clique no botão de gatilho para reiniciar o fluxo de extração/modal
        // Isto é um pouco hacky mas é a forma mais simples de reativar o fluxo de clique do GLPI/Verdana
        const triggerButton = document.querySelector('[data-crx-listener="true"]');
        if (triggerButton) {
            triggerButton.click();
        }
    });


    // --- FIM Listeners do Lightbox ---


    return { modalContainer, view1, view2, viewSecurity, viewCopyConfirm, reportTextarea };
}


// --- Lógica de Ação (Cópia e Fechamento) ---
function executeCopyAndClose(reportTextarea, modalContainer, buttonElement) {
    
    // Salva o resumo original sem ID
    const originalSummary = reportTextarea.value;
    
    // 1. ADICIONA ID AO TEXTO para cópia e envio
    const ticketId = modalContainer.ticketId;
    let cleanId = ticketId.replace(/[()]/g, '');
    if (!cleanId.startsWith('#') && cleanId !== '[ID não encontrado]') {
        cleanId = `#${cleanId}`;
    }
    const finalReport = `ID do Chamado: ${cleanId}\n---\n` + originalSummary;
    
    // Temporariamente define o valor do textarea para a cópia (com ID)
    reportTextarea.value = finalReport; 
    
    // Temporariamente torna a view2 visível (é onde está o textarea de leitura)
    const view2 = document.getElementById('crx-view-2');
    const originalDisplay = view2.style.display;
    view2.style.display = 'flex'; 

    // 2. Lógica de cópia para a área de transferência
    reportTextarea.select();
    reportTextarea.focus(); 
    let copySuccess = false;
    try {
        copySuccess = document.execCommand('copy');
    } catch (err) {
        console.error('[Gerador de Resumo] Falha ao copiar:', err);
    }
    
    // Restaura o valor original do textarea (sem ID)
    reportTextarea.value = originalSummary;
    // Restaura a visibilidade da view2
    view2.style.display = originalDisplay; 
    
    if (!copySuccess) {
        // Se a cópia falhar (muito raro se for readonly), voltamos ao estado anterior.
        buttonElement.querySelector('.crx-button-text').textContent = 'Erro de Cópia';
        setTimeout(() => buttonElement.querySelector('.crx-button-text').textContent = '📋 Copiar', 2000);
        view2.style.display = 'flex'; // Mantém visível para debug
        return;
    }
    
    // --- MOSTRA TOAST DE SUCESSO ---
    showSuccessToast('Relatório Copiado!');
    
    // 3. Enviar para o Discord (usa o finalReport com ID)
    try {
        const contextoConversa = modalContainer.conversationContext; 

        if (finalReport && contextoConversa) {
            buttonElement.classList.add('loading');
            buttonElement.querySelector('.crx-button-text').textContent = 'Enviando...';
            buttonElement.disabled = true;

            chrome.runtime.sendMessage(
                {
                    command: 'sendToDiscord',
                    report: finalReport, // Envia relatório com ID
                    context: contextoConversa
                },
                (response) => {
                    buttonElement.classList.remove('loading');
                    
                    if (chrome.runtime.lastError) {
                        console.error('[ContentScript] Erro ao enviar p/ Discord:', chrome.runtime.lastError.message);
                    } else if (response && response.success) {
                        console.log('[ContentScript] Enviado para o Discord com sucesso.');
                    } else {
                        console.error('[ContentScript] Falha no envio p/ Discord:', response.error);
                    }
                    
                    // Fecha o modal após a tentativa de envio
                    closeAllListenersAndModal(); 
                }
            );
        } else {
            console.warn('[ContentScript] Não foi possível enviar p/ Discord: dados ausentes.');
            // Fecha o modal imediatamente se os dados estiverem ausentes
            closeAllListenersAndModal(); 
        }
    } catch (e) {
        console.error('[ContentScript] Erro na lógica de envio p/ Discord:', e);
        closeAllListenersAndModal(); 
    }
}


function createView1() {
    const view = document.createElement('div');
    view.className = 'crx-view';
    view.id = 'crx-view-1'; 
    view.innerHTML = `
        <h2>Gerador de Resumo</h2>
        
        <p>Observação (opcional):</p>
        <textarea id="crx-obs-textarea" placeholder="Digite suas observações aqui..."></textarea>
        
        <button id="crx-generate-button" class="crx-button">
            <span class="crx-button-text">Gerar Resumo da Conversa</span>
            <div class="crx-spinner"></div>
        </button>
    `;
    return view;
}

function createView2() {
    const view = document.createElement('div');
    view.className = 'crx-view';
    view.id = 'crx-view-2';
    // O textarea agora tem tabindex="-1" e a lógica de click para abrir o lightbox
    view.innerHTML = `
        <h2>Relatório Gerado</h2>
        <textarea id="crx-report-textarea" readonly tabindex="-1"></textarea>
        <div class="crx-button-group">
            <button id="crx-copy-button" class="crx-button">
                <span class="crx-button-text">📋Copiar</span>
                <div class="crx-spinner"></div>
            </button>
            <button id="crx-retry-button" class="crx-button crx-button-secondary">🔄 Gerar Novo</button>
        </div>
    `;
    return view;
}

function createSecurityView() {
    const view = document.createElement('div');
    view.className = 'crx-view crx-confirm-view';
    view.id = 'crx-view-security';
    view.innerHTML = `
        <h2>Verificação de Segurança</h2>
        <p>A conversa contém dados sensíveis (senhas, CPFs, cartões, etc.)?</p>
        <div class="crx-confirm-buttons">
            <button id="crx-confirm-yes" class="crx-button crx-button-secondary">
                <span class="crx-button-text">Sim</span>
                <div class="crx-spinner"></div>
            </button>
            <button id="crx-confirm-no" class="crx-button">
                <span class="crx-button-text">Não</span>
                <div class="crx-spinner"></div>
            </button>
        </div>
    `;
    return view;
}

function createCopyConfirmView() {
    const view = document.createElement('div');
    view.className = 'crx-view crx-confirm-view';
    view.id = 'crx-view-copy-confirm';
    view.innerHTML = `
        <h2>Finalizar Relatório</h2>
        <p>Deseja copiar, ou revisar o texto antes de finalizar?</p>
        <div class="crx-confirm-buttons">
            <button id="crx-copy-confirm-review-button" class="crx-button crx-button-secondary">
                <span class="crx-button-text">✍️ Revisar</span>
            </button>
            <button id="crx-copy-confirm-copy-button" class="crx-button">
                <span class="crx-button-text">📋 Copiar</span>
            </button>
        </div>
    `;
    return view;
}
// --- Fim da Lógica de UI (Genérica) ---

// --- Função global para obter ID do URL ---
function getTicketIdFromUrl() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const id = urlParams.get('id');
        if (id) {
            // Retorna o ID limpo (apenas o número)
            return id; 
        }
    } catch(e) {
        console.error("[Gerador de Resumo] Falha ao extrair ID do URL:", e);
    }
    return '[ID não encontrado]';
}

// --- FUNÇÃO HELPER: Encontrar o elemento clicável do botão 'X' do GLPI (ATUALIZADO) ---
function findGlpiCloseTarget() {
    // Procura o botão de fechar específico pela classe 'close-itil-answer'
    const closeButtonByClass = document.querySelector('button.close-itil-answer');
    
    if (closeButtonByClass) {
        console.log('[Gerador de Resumo] Botão de fechar GLPI encontrado via close-itil-answer.');
        return closeButtonByClass;
    }
    
    // Fallback: Procura o ícone (.ti-x) e o seu pai clicável (como na versão anterior)
    const icon = document.querySelector('.ti-x');
    if (icon) {
        return icon.closest('button, a');
    }
    
    return null;
}

// --- DEFINIÇÃO DOS HANDLERS ---

const VerdanaDeskHandler = {

    siteIdentifier: "VerdanaDesk_Finalizar",

    getText: function(selector) {
        const overlay = document.querySelector('div.v-overlay__content');
        const context = overlay || document;
        const element = context.querySelector(selector);
        return element ? element.textContent.trim() : '';
    },
    
    getDestinationSelector: function() {
        // Campo de solução do TinyMCE no VerdanaDesk
        return 'body#tinymce[data-id="solution"]';
    },

    findTriggerButton: function() {
        const spans = document.querySelectorAll('span.v-btn__content');
        spans.forEach(span => {
            if (span.textContent.trim() === 'Finalizar') {
                const button = span.closest('button');
                if (button && !button.hasAttribute('data-crx-listener')) {
                    console.log('[Gerador de Resumo] Botão "Finalizar" (Verdana) encontrado!');
                    button.setAttribute('data-crx-listener', 'true');
                    button.addEventListener('click', VerdanaDeskHandler.onTriggerButtonClick);
                }
            }
        });
    },

    onTriggerButtonClick: function(event) {
        
        try {
            if (!isExtensionEnabled) return;
            
            // --- NOVO: LÓGICA DE FECHAMENTO (CORREÇÃO DE ESCOPO: setCopyBlockListeners é GLOBAL) ---
            const existingModal = document.getElementById('crx-modal-container');
            if (existingModal) {
                console.log('[Gerador de Resumo] Modal já aberto. Fechando ao segundo clique.');
                closeAllListenersAndModal(); // Usa a função centralizada
                return; // Para o processamento
            }
            // --- FIM LÓGICA DE FECHAMENTO ---

            console.log('[Gerador de Resumo] Clique no "Finalizar" (Verdana) detetado. A aguardar overlay...');
            
            // O retorno de createModalUI não precisa mais de setCopyBlockListeners
            const { modalContainer, view1, view2, viewSecurity, viewCopyConfirm, reportTextarea } = createModalUI();
            
            const generateButton = view1.querySelector('#crx-generate-button');
            const confirmYesButton = viewSecurity.querySelector('#crx-confirm-yes');
            const confirmNoButton = viewSecurity.querySelector('#crx-confirm-no');
            const copyConfirmCopyButton = viewCopyConfirm.querySelector('#crx-copy-confirm-copy-button');
            const aiRefineSubmit = modalContainer.querySelector('#crx-ai-refine-submit');
            const aiRefineCancel = modalContainer.querySelector('#crx-ai-refine-cancel');
            const aiRefinePrompt = modalContainer.querySelector('#crx-ai-refine-prompt');
            const aiRefineModal = modalContainer.querySelector('#crx-ai-refine-modal');
            const lightboxTextarea = modalContainer.querySelector('#crx-lightbox-textarea');
            const aiUndoButton = modalContainer.querySelector('#crx-ai-undo-button');
            
            // Re-anexa o listener de cópia para receber as referências corretas
            copyConfirmCopyButton.replaceWith(copyConfirmCopyButton.cloneNode(true));
            modalContainer.querySelector('#crx-copy-confirm-copy-button')
                          .addEventListener('click', () => executeCopyAndClose(reportTextarea, modalContainer, modalContainer.querySelector('#crx-copy-confirm-copy-button')));


            aiRefineSubmit.replaceWith(aiRefineSubmit.cloneNode(true));
            const aiRefineSubmitReal = modalContainer.querySelector('#crx-ai-refine-submit');
            
            aiRefineSubmitReal.addEventListener('click', () => {
                const instruction = aiRefinePrompt.value;
                const currentSummary = lightboxTextarea.value;
        
                if (instruction.trim() === '') {
                    aiRefinePrompt.style.color = 'red';
                    aiRefinePrompt.value = 'Por favor, insira uma instrução.';
                    return;
                }
        
                aiRefineSubmitReal.classList.add('loading');
                aiRefineSubmitReal.querySelector('.crx-button-text').textContent = 'A refinar...';
                aiRefineSubmitReal.disabled = true;
                aiRefineCancel.disabled = true;
        
                chrome.runtime.sendMessage(
                    { 
                        command: 'refineSummary', 
                        summary: currentSummary, 
                        instruction: instruction,
                        conversationContext: modalContainer.conversationContext 
                    }, 
                    (refineResponse) => {
                        try {
                            aiRefineSubmitReal.classList.remove('loading');
                            aiRefineSubmitReal.querySelector('.crx-button-text').textContent = 'Refinar';
                            aiRefineSubmitReal.disabled = false;
                            aiRefineCancel.disabled = false;

                            if (refineResponse && refineResponse.refinedSummary) {
                                const textBeforeRefine = lightboxTextarea.value;
                                modalContainer.refineHistory.push(textBeforeRefine);
                                aiUndoButton.disabled = false; 
                                
                                lightboxTextarea.value = refineResponse.refinedSummary;
                                lightboxTextarea.dispatchEvent(new Event('input', { bubbles: true }));
                                aiRefineModal.style.display = 'none';
                            } else if (refineResponse && refineResponse.error) {
                                throw new Error(refineResponse.error);
                            } else {
                                throw new Error('Resposta inválida do refinamento.');
                            }
                        } catch(e) {
                            console.error('[ContentScript] Erro no callback de Refinamento:', e.message);
                            aiRefineSubmitReal.classList.remove('loading');
                            aiRefineSubmitReal.querySelector('.crx-button-text').textContent = 'Refinar';
                            aiRefineSubmitReal.disabled = false;
                            aiRefineCancel.disabled = false;
                            aiRefinePrompt.style.color = 'red';
                            aiRefinePrompt.value = `Erro: ${e.message}`;
                        }
                    }
                );
            });

            generateButton.addEventListener('click', (e_gen) => {
                e_gen.stopPropagation();
                document.getElementById('crx-view-1').style.display = 'none';
                document.getElementById('crx-view-security').style.display = 'flex';
            });

            confirmNoButton.addEventListener('click', (e_no) => {
                try {
                    e_no.stopPropagation();
                    
                    const currentConfirmYes = document.getElementById('crx-confirm-yes');
                    const currentConfirmNo = document.getElementById('crx-confirm-no');
                    const currentObsTextarea = document.getElementById('crx-obs-textarea');
                    const currentViewSecurity = document.getElementById('crx-view-security');
                    const currentViewCopyConfirm = document.getElementById('crx-view-copy-confirm');
                    const currentReportTextarea = document.getElementById('crx-report-textarea');
                    const currentView1 = document.getElementById('crx-view-1');

                    currentConfirmNo.classList.add('loading');
                    currentConfirmNo.disabled = true;
                    currentConfirmYes.disabled = true;
                    currentObsTextarea.style.color = '#000';
                    setCopyBlockListeners(false);

                    // === INÍCIO DA MODIFICAÇÃO TOON ===
                    const ticketInfo = VerdanaDeskHandler.extractTicketDataFromPopup();
                    const chatLogArray = VerdanaDeskHandler.extractChatLog(); // Agora retorna Array
                    const observations = currentObsTextarea.value;

                    // Converte para TOON
                    const toonPayload = convertToTOON(ticketInfo, chatLogArray, observations);
                    
                    // Salva o contexto (TOON) no modal
                    modalContainer.conversationContext = toonPayload;
                    // Salva o ID
                    modalContainer.ticketId = ticketInfo.id;
                    // === FIM DA MODIFICAÇÃO TOON ===
                    
                    try {
                        chrome.runtime.sendMessage(
                            // Envia o payload TOON
                            { command: 'summarizeConversation', conversation: toonPayload },
                            (response) => {
                                try {
                                    currentConfirmNo.classList.remove('loading');
                                    currentConfirmNo.disabled = false;
                                    currentConfirmYes.disabled = false;

                                    if (chrome.runtime.lastError) {
                                        console.error('[ContentScript] Contexto invalidado (Verdana Nuvem):', chrome.runtime.lastError.message);
                                        document.getElementById('crx-modal-container')?.remove();
                                        return;
                                    }
                                    
                                    if (response && response.summary) {
                                        playNotificationSound();
                                        
                                        // INJETA SÓ O RESUMO
                                        currentReportTextarea.value = response.summary;
                                        // Adiciona observações ao final do resumo (se houver)
                                        if (observations.trim() !== '') {
                                            currentReportTextarea.value += `\n\nObservações Adicionais:\n${observations}`;
                                        }
                                        currentViewSecurity.style.display = 'none';
                                        currentViewCopyConfirm.style.display = 'flex'; // AVANÇA PARA CONFIRMAÇÃO DE CÓPIA
                                        setCopyBlockListeners(true); // ATIVA bloqueio na view de confirmação

                                    } else if (response && response.error) {
                                        console.error('[ContentScript] Erro no resumo (Verdana Nuvem):', response.error);
                                        currentViewSecurity.style.display = 'none';
                                        currentView1.style.display = 'flex';
                                        currentObsTextarea.value = `Erro: ${response.error}. Verifique as Opções da extensão.`;
                                        currentObsTextarea.style.color = 'red';
                                    } else {
                                        console.error('[ContentScript] Resposta inválida (Verdana Nuvem):', response);
                                        currentViewSecurity.style.display = 'none';
                                        currentView1.style.display = 'flex';
                                        currentObsTextarea.value = 'Erro: Resposta inválida do script de background (Nuvem).';
                                        currentObsTextarea.style.color = 'red';
                                    }
                                } catch (e) {
                                    console.error('[ContentScript] Erro fatal no callback (Verdana Nuvem):', e.message);
                                    document.getElementById('crx-modal-container')?.remove();
                                }
                            }
                        );
                    } catch (error) {
                        console.error('[ContentScript] Falha ao enviar mensagem (Verdana Nuvem):', error.message);
                        throw error; 
                    }
                } catch (error) {
                    console.error('[Gerador de Resumo] Erro fatal ao lidar com clique (Verdana):', error.message);
                    document.getElementById('crx-modal-container')?.remove();
                }
            });

            confirmYesButton.addEventListener('click', (e_yes) => {
                try {
                    e_yes.stopPropagation();
                    
                    const currentConfirmYes = document.getElementById('crx-confirm-yes');
                    const currentConfirmNo = document.getElementById('crx-confirm-no');
                    const currentObsTextarea = document.getElementById('crx-obs-textarea');
                    const currentViewSecurity = document.getElementById('crx-view-security');
                    const currentViewCopyConfirm = document.getElementById('crx-view-copy-confirm');
                    const currentReportTextarea = document.getElementById('crx-report-textarea');
                    const currentView1 = document.getElementById('crx-view-1');

                    currentConfirmYes.classList.add('loading');
                    currentConfirmYes.querySelector('.crx-button-text').textContent = 'A anonimizar (1/2)...';
                    currentConfirmYes.disabled = true;
                    currentConfirmNo.disabled = true;
                    currentObsTextarea.style.color = '#000';
                    setCopyBlockListeners(false);

                    // === INÍCIO DA MODIFICAÇÃO TOON ===
                    const ticketInfo = VerdanaDeskHandler.extractTicketDataFromPopup();
                    const chatLogArray = VerdanaDeskHandler.extractChatLog(); // Agora retorna Array
                    const observations = currentObsTextarea.value;

                    // Converte para TOON
                    const toonPayload = convertToTOON(ticketInfo, chatLogArray, observations);
                    
                    // Salva o ID (será usado no passo 2)
                    modalContainer.ticketId = ticketInfo.id;
                    // === FIM DA MODIFICAÇÃO TOON ===
                    
                    try {
                        chrome.runtime.sendMessage(
                            // Envia o TOON para anonimizar
                            { command: 'anonymizeConversation', conversation: toonPayload }, 
                            (response) => {
                                try {
                                    if (chrome.runtime.lastError || (response && response.error)) {
                                        const errorMsg = chrome.runtime.lastError ? chrome.runtime.lastError.message : response.error;
                                        throw new Error(errorMsg);
                                    }

                                    if (response && response.anonymizedText) {
                                        console.log('[ContentScript] PASSO 1/2 concluído. A enviar para resumir...');
                                        currentConfirmYes.querySelector('.crx-button-text').textContent = 'A resumir (2/2)...';
                                        
                                        // Salva o contexto ANONIMIZADO no modal
                                        modalContainer.conversationContext = response.anonymizedText;
                                        
                                        chrome.runtime.sendMessage(
                                            // Envia o TOON anonimizado para resumir
                                            { command: 'summarizeConversation', conversation: response.anonymizedText },
                                            (summaryResponse) => {
                                                try {
                                                    currentConfirmYes.classList.remove('loading');
                                                    currentConfirmYes.querySelector('.crx-button-text').textContent = 'Sim';
                                                    currentConfirmYes.disabled = false;
                                                    currentConfirmNo.disabled = false;

                                                    if (chrome.runtime.lastError || (summaryResponse && summaryResponse.error)) {
                                                        const errorMsg = chrome.runtime.lastError ? chrome.runtime.lastError.message : summaryResponse.error;
                                                        throw new Error(errorMsg);
                                                    }

                                                    if (summaryResponse && summaryResponse.summary) {
                                                        playNotificationSound();
                                                        
                                                        // INJETA SÓ O RESUMO
                                                        currentReportTextarea.value = summaryResponse.summary;
                                                        // Adiciona observações ao final do resumo (se houver)
                                                        if (observations.trim() !== '') {
                                                            currentReportTextarea.value += `\n\nObservações Adicionais:\n${observations}`;
                                                        }
                                                        currentViewSecurity.style.display = 'none';
                                                        currentViewCopyConfirm.style.display = 'flex'; // AVANÇA PARA CONFIRMAÇÃO DE CÓPIA
                                                        setCopyBlockListeners(true); // ATIVA bloqueio na view de confirmação
                                                    
                                                    } else {
                                                        throw new Error('Resposta inválida do PASSO 2 (Resumir).');
                                                    }
                                                } catch (e) {
                                                    console.error('[ContentScript] Erro fatal no callback (PASSO 2):', e.message);
                                                    currentConfirmYes.classList.remove('loading');
                                                    currentConfirmYes.querySelector('.crx-button-text').textContent = 'Sim';
                                                    currentConfirmYes.disabled = false;
                                                    currentConfirmNo.disabled = false;
                                                    currentViewSecurity.style.display = 'none';
                                                    currentView1.style.display = 'flex';
                                                    currentObsTextarea.value = `Erro (2/2): ${e.message}. Verifique as Opções da extensão.`;
                                                    currentObsTextarea.style.color = 'red';
                                                }
                                            }
                                        );
                                    } else {
                                        throw new Error('Resposta inválida do PASSO 1 (Anonimizar).');
                                    }
                                } catch (e) {
                                    console.error('[ContentScript] Erro fatal no callback (PASSO 1):', e.message);
                                    currentConfirmYes.classList.remove('loading');
                                    currentConfirmYes.querySelector('.crx-button-text').textContent = 'Sim';
                                    currentConfirmYes.disabled = false;
                                    currentConfirmNo.disabled = false;
                                    currentViewSecurity.style.display = 'none';
                                    currentView1.style.display = 'flex';
                                    // === CORREÇÃO DA MENSAGEM DE ERRO ===
                                    currentObsTextarea.value = `Erro (1/2): ${e.message}. Verifique as Opções da extensão.`;
                                    currentObsTextarea.style.color = 'red';
                                }
                            }
                        );
                    } catch (error) {
                        console.error('[ContentScript] Falha ao enviar mensagem (PASSO 1):', error.message);
                        throw error; 
                    }
                } catch (error) {
                    console.error('[Gerador de Resumo] Erro fatal ao lidar com clique (Verdana):', error.message);
                    document.getElementById('crx-modal-container')?.remove();
                }
            });


            setTimeout(() => {
                const overlay = document.querySelector('div.v-overlay__content');
                if (overlay) {
                    overlay.appendChild(modalContainer);
                    console.log('[Gerador de Resumo] Modal injetado no overlay (Verdana).');
                } else {
                    document.body.appendChild(modalContainer);
                    console.log('[Gerador de Resumo] Modal injetado no body (Verdana fallback).');
                }
            }, 0);
        
        } catch (e) {
            console.error('[Gerador de Resumo] Erro fatal ao lidar com clique (Verdana):', e.message);
        }
    },

    // === MODIFICADO PARA RETORNAR ARRAY E LIMPAR ===
    extractChatLog: function() {
        const chatList = document.querySelector('#chatlist');
        if (!chatList) {
            console.warn('[ContentScript] Não foi possível encontrar #chatlist (Verdana).');
            return []; // Retorna array vazio
        }
        
        let messagesArray = []; // MUDANÇA: Array em vez de string
        
        const messages = chatList.querySelectorAll('.v-list-item');
        messages.forEach(msg => {
            const senderEl = msg.querySelector('.v-list-item-title span:not(.text-grey)');
            const timeEl = msg.querySelector('.v-list-item-title .text-grey');
            const messageEl = msg.querySelector('.v-list-item-subtitle > .py-1');
            
            if (senderEl && messageEl && timeEl) {
                const sender = senderEl.textContent.trim();
                const time = timeEl.textContent.trim();
                const clone = messageEl.cloneNode(true);
                clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
                
                // --- INÍCIO DA LIMPEZA (Verdana) ---
                // Remove scripts e styles que podem estar no corpo da mensagem
                clone.querySelectorAll('script, style').forEach(el => el.remove());
                let message = clone.textContent.trim();
                // Limpa lixo de script residual (se houver)
                message = message.replace(/\/\/\<!\[CDATA\[[\s\S]*?\/\/\]\]\>/g, '');
                // --- FIM DA LIMPEZA ---

                // MUDANÇA: Adiciona ao array
                messagesArray.push({
                    time: time,
                    author: sender,
                    content: message
                });
            }
        });
        return messagesArray; // Retorna o array
    },
    // === FIM DA MODIFICAÇÃO ===

    extractTicketDataFromPopup: function() {
        // Tenta encontrar o ID no link dentro do modal (VerdanaDesk)
        const idElement = document.querySelector('a.font-weight-bold[href*="ticket.form.php?id="]');
        let ticketId = getTicketIdFromUrl(); // Busca o ID da URL como fallback primário
        
        if (ticketId === '[ID não encontrado]' && idElement) {
            const match = idElement.textContent.match(/#(\d+)/);
            if (match && match[1]) {
                // Se encontrar no HTML, usa o formato #ID
                ticketId = `#${match[1]}`;
            }
        } else if (ticketId !== '[ID não encontrado]' && !ticketId.startsWith('#')) {
            // Se o ID foi encontrado na URL (apenas número), prefixa com #
            ticketId = `#${ticketId}`;
        }
        
        const ticketTitle = VerdanaDeskHandler.getText('.v-card-text .v-row:nth-child(2) p span');
        const ticketGroup = VerdanaDeskHandler.getText('.v-card-text .v-row:nth-child(4) p span');
        const ticketDescEl = document.querySelector('#ticket_description_modal');
        let descriptionText = '';
        if (ticketDescEl) {
            const clone = ticketDescEl.cloneNode(true);
            clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
            
            // --- INÍCIO DA LIMPEZA (Verdana) ---
            clone.querySelectorAll('script, style').forEach(el => el.remove());
            descriptionText = clone.textContent.trim();
            // --- FIM DA LIMPEZA ---
        }
        
        const fullData = `Título do Chamado: ${ticketTitle}\n` +
               `Grupo de Atendimento: ${ticketGroup}\n` +
               `Descrição Inicial: ${descriptionText}`; // Removida (do popup) para bater com o TOON
               
        return {
            id: ticketId,
            fullData: fullData
        };
    },
};

const GlpiHandler = {
    siteIdentifier: "GLPI_Solucao",
    // Variável para armazenar o listener de fechar do GLPI (X)
    glpiCloseListener: null,

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
                    button.addEventListener('click', GlpiHandler.onTriggerButtonClick, true);
                }
            }
        });
    },

    // NOVO: Função para limpar o listener do botão 'X'
    removeCloseListener: function() {
        if (this.glpiCloseListener) {
            // Usa a função auxiliar para encontrar o alvo clicável
            const closeTarget = findGlpiCloseTarget(); 
            if (closeTarget) {
                // Tenta restaurar o atributo se ele tiver sido removido
                const storedToggle = closeTarget.getAttribute('data-crx-original-toggle');
                if (storedToggle) {
                     closeTarget.setAttribute('data-bs-toggle', storedToggle);
                     closeTarget.removeAttribute('data-crx-original-toggle');
                     console.log('[Gerador de Resumo] Atributo data-bs-toggle restaurado no botão X.');
                }
                
                closeTarget.removeEventListener('click', this.glpiCloseListener, true);
                console.log('[Gerador de Resumo] Listener do botão X (GLPI) removido.');
            }
            this.glpiCloseListener = null;
        }
    },

    onTriggerButtonClick: function(event) {
        try {
            if (!isExtensionEnabled) {
                console.log('[Gerador de Resumo] Extensão desativada (GLPI).');
                return;
            }
            
            // --- NOVO: FORÇA A INTERRUPÇÃO E FECHAMENTO ---
            // Usamos stopImmediatePropagation e preventDefault para impedir o GLPI de fechar a janela
            event.stopImmediatePropagation();
            event.preventDefault();

            // Lógica de toggle
            const existingModal = document.getElementById('crx-modal-container');
            if (existingModal) {
                console.log('[Gerador de Resumo] Modal já aberto. Fechando ao segundo clique.');
                closeAllListenersAndModal(); // Usa a função centralizada
                return; // Para o processamento
            }
            // --- FIM LÓGICA DE FECHAMENTO ---
            
            console.log('[Gerador de Resumo] Clique no "Solução" (GLPI) detetado. A abrir modal.');

            // O retorno de createModalUI não precisa mais de setCopyBlockListeners
            const { modalContainer, view1, view2, viewSecurity, viewCopyConfirm, reportTextarea } = createModalUI();
            
            const generateButton = view1.querySelector('#crx-generate-button');
            const confirmYesButton = viewSecurity.querySelector('#crx-confirm-yes');
            const confirmNoButton = viewSecurity.querySelector('#crx-confirm-no');
            const copyConfirmCopyButton = viewCopyConfirm.querySelector('#crx-copy-confirm-copy-button');
            const aiRefineSubmit = modalContainer.querySelector('#crx-ai-refine-submit');
            const aiRefineCancel = modalContainer.querySelector('#crx-ai-refine-cancel');
            const aiRefinePrompt = modalContainer.querySelector('#crx-ai-refine-prompt');
            const aiRefineModal = modalContainer.querySelector('#crx-ai-refine-modal');
            const lightboxTextarea = modalContainer.querySelector('#crx-lightbox-textarea');
            const aiUndoButton = modalContainer.querySelector('#crx-ai-undo-button');
            
            // Re-anexa o listener de cópia para receber as referências corretas
            copyConfirmCopyButton.replaceWith(copyConfirmCopyButton.cloneNode(true));
            modalContainer.querySelector('#crx-copy-confirm-copy-button')
                          .addEventListener('click', () => executeCopyAndClose(reportTextarea, modalContainer, modalContainer.querySelector('#crx-copy-confirm-copy-button')));


            aiRefineSubmit.replaceWith(aiRefineSubmit.cloneNode(true));
            const aiRefineSubmitReal = modalContainer.querySelector('#crx-ai-refine-submit');

            aiRefineSubmitReal.addEventListener('click', () => {
                const instruction = aiRefinePrompt.value;
                const currentSummary = lightboxTextarea.value;
        
                if (instruction.trim() === '') {
                    aiRefinePrompt.style.color = 'red';
                    aiRefinePrompt.value = 'Por favor, insira uma instrução.';
                    return;
                }
        
                aiRefineSubmitReal.classList.add('loading');
                aiRefineSubmitReal.querySelector('.crx-button-text').textContent = 'A refinar...';
                aiRefineSubmitReal.disabled = true;
                aiRefineCancel.disabled = true;
        
                chrome.runtime.sendMessage(
                    { 
                        command: 'refineSummary', 
                        summary: currentSummary, 
                        instruction: instruction,
                        conversationContext: modalContainer.conversationContext
                    }, 
                    (refineResponse) => {
                        try {
                            aiRefineSubmitReal.classList.remove('loading');
                            aiRefineSubmitReal.querySelector('.crx-button-text').textContent = 'Refinar';
                            aiRefineSubmitReal.disabled = false;
                            aiRefineCancel.disabled = false;
        
                            if (refineResponse && refineResponse.refinedSummary) {
                                const textBeforeRefine = lightboxTextarea.value;
                                modalContainer.refineHistory.push(textBeforeRefine);
                                aiUndoButton.disabled = false;
                                
                                lightboxTextarea.value = refineResponse.refinedSummary;
                                lightboxTextarea.dispatchEvent(new Event('input', { bubbles: true }));
                                aiRefineModal.style.display = 'none';
                            } else if (refineResponse && refineResponse.error) {
                                throw new Error(refineResponse.error);
                            } else {
                                throw new Error('Resposta inválida do refinamento.');
                            }
                        } catch(e) {
                            console.error('[ContentScript] Erro no callback de Refinamento:', e.message);
                            aiRefineSubmitReal.classList.remove('loading');
                            aiRefineSubmitReal.querySelector('.crx-button-text').textContent = 'Refinar';
                            aiRefineSubmitReal.disabled = false;
                            aiRefineCancel.disabled = false;
                            aiRefinePrompt.style.color = 'red';
                            aiRefinePrompt.value = `Erro: ${e.message}`;
                        }
                    }
                );
            });

            generateButton.addEventListener('click', () => {
                document.getElementById('crx-view-1').style.display = 'none';
                document.getElementById('crx-view-security').style.display = 'flex';
            });

            confirmNoButton.addEventListener('click', () => {
                try {
                    const currentConfirmYes = document.getElementById('crx-confirm-yes');
                    const currentConfirmNo = document.getElementById('crx-confirm-no');
                    const currentObsTextarea = document.getElementById('crx-obs-textarea');
                    const currentViewSecurity = document.getElementById('crx-view-security');
                    const currentViewCopyConfirm = document.getElementById('crx-view-copy-confirm');
                    const currentReportTextarea = document.getElementById('crx-report-textarea');
                    const currentView1 = document.getElementById('crx-view-1');
                    
                    currentConfirmNo.classList.add('loading');
                    currentConfirmNo.disabled = true;
                    currentConfirmYes.disabled = true;
                    currentObsTextarea.style.color = '#000';
                    setCopyBlockListeners(false);

                    // === INÍCIO DA MODIFICAÇÃO TOON ===
                    const ticketInfo = GlpiHandler.extractTicketData();
                    const chatLogArray = GlpiHandler.extractChatLog(); // Agora retorna Array
                    const observations = currentObsTextarea.value;

                    // Converte para TOON
                    const toonPayload = convertToTOON(ticketInfo, chatLogArray, observations);
                    
                    // Salva o contexto (TOON) no modal
                    modalContainer.conversationContext = toonPayload;
                    // Salva o ID
                    modalContainer.ticketId = ticketInfo.id;
                    // === FIM DA MODIFICAÇÃO TOON ===
                    
                    try {
                        chrome.runtime.sendMessage(
                            // Envia o payload TOON
                            { command: 'summarizeConversation', conversation: toonPayload },
                            (response) => {
                                try {
                                    currentConfirmNo.classList.remove('loading');
                                    currentConfirmNo.disabled = false;
                                    currentConfirmYes.disabled = false;

                                    if (chrome.runtime.lastError) {
                                        console.error('[ContentScript] Erro no callback (GLPI Nuvem):', chrome.runtime.lastError.message);
                                        document.getElementById('crx-modal-container')?.remove();
                                        return;
                                    }
                                    
                                    if (response && response.summary) {
                                        playNotificationSound();
                                        
                                        // INJETA SÓ O RESUMO
                                        currentReportTextarea.value = response.summary;
                                        // Adiciona observações ao final do resumo (se houver)
                                        if (observations.trim() !== '') {
                                            currentReportTextarea.value += `\n\nObservações Adicionais:\n${observations}`;
                                        }
                                        currentViewSecurity.style.display = 'none';
                                        currentViewCopyConfirm.style.display = 'flex'; // AVANÇA PARA CONFIRMAÇÃO DE CÓPIA
                                        setCopyBlockListeners(true); // ATIVA bloqueio na view de confirmação

                                    } else if (response && response.error) {
                                        console.error('[ContentScript] Erro no resumo (GLPI Nuvem):', response.error);
                                        if (currentViewSecurity) currentViewSecurity.style.display = 'none';
                                        if (currentView1) currentView1.style.display = 'flex';
                                        if (currentObsTextarea) {
                                            currentObsTextarea.value = `Erro: ${response.error}. Verifique as Opções da extensão.`;
                                            currentObsTextarea.style.color = 'red';
                                        }
                                    } else {
                                        console.error('[ContentScript] Resposta inválida (GLPI Nuvem):', response);
                                        if (currentViewSecurity) currentViewSecurity.style.display = 'none';
                                        if (currentView1) currentView1.style.display = 'flex';
                                        if (currentObsTextarea) {
                                            currentObsTextarea.value = 'Erro: Resposta inválida do script de background (Nuvem).';
                                            currentObsTextarea.style.color = 'red';
                                        }
                                    }
                                } catch (e) {
                                    console.error('[ContentScript] Erro fatal no callback (GLPI Nuvem):', e.message);
                                    document.getElementById('crx-modal-container')?.remove();
                                }
                            }
                        );
                     } catch (error) {
                         console.error('[ContentScript] Falha ao enviar mensagem (GLPI Nuvem):', error.message);
                         throw error;
                     }
                } catch (error) {
                     console.error('[Gerador de Resumo] Erro fatal ao lidar com clique (GLPI):', error.message);
                     document.getElementById('crx-modal-container')?.remove();
                }
            });

            confirmYesButton.addEventListener('click', () => {
                try {
                    
                    const currentConfirmYes = document.getElementById('crx-confirm-yes');
                    const currentConfirmNo = document.getElementById('crx-confirm-no');
                    const currentObsTextarea = document.getElementById('crx-obs-textarea');
                    const currentViewSecurity = document.getElementById('crx-view-security');
                    const currentViewCopyConfirm = document.getElementById('crx-view-copy-confirm');
                    const currentReportTextarea = document.getElementById('crx-report-textarea');
                    const currentView1 = document.getElementById('crx-view-1');

                    currentConfirmYes.classList.add('loading');
                    currentConfirmYes.querySelector('.crx-button-text').textContent = 'A anonimizar (1/2)...';
                    currentConfirmYes.disabled = true;
                    currentConfirmNo.disabled = true;
                    currentObsTextarea.style.color = '#000';
                    setCopyBlockListeners(false);

                    // === INÍCIO DA MODIFICAÇÃO TOON ===
                    const ticketInfo = GlpiHandler.extractTicketData();
                    const chatLogArray = GlpiHandler.extractChatLog(); // Agora retorna Array
                    const observations = currentObsTextarea.value;

                    // Converte para TOON
                    const toonPayload = convertToTOON(ticketInfo, chatLogArray, observations);
                    
                    // Salva o ID (será usado no passo 2)
                    modalContainer.ticketId = ticketInfo.id;
                    // === FIM DA MODIFICAÇÃO TOON ===
                    
                    try {
                        chrome.runtime.sendMessage(
                            // Envia o TOON para anonimizar
                            { command: 'anonymizeConversation', conversation: toonPayload }, 
                            (response) => {
                                try {
                                    if (chrome.runtime.lastError || (response && response.error)) {
                                        const errorMsg = chrome.runtime.lastError ? chrome.runtime.lastError.message : response.error;
                                        throw new Error(errorMsg);
                                    }

                                    if (response && response.anonymizedText) {
                                        console.log('[ContentScript] PASSO 1/2 concluído. A enviar para resumir...');
                                        currentConfirmYes.querySelector('.crx-button-text').textContent = 'A resumir (2/2)...';
                                        
                                        // Salva o contexto ANONIMIZADO no modal
                                        modalContainer.conversationContext = response.anonymizedText;
                                        
                                        chrome.runtime.sendMessage(
                                            // Envia o TOON anonimizado para resumir
                                            { command: 'summarizeConversation', conversation: response.anonymizedText },
                                            (summaryResponse) => {
                                                try {
                                                    currentConfirmYes.classList.remove('loading');
                                                    currentConfirmYes.querySelector('.crx-button-text').textContent = 'Sim';
                                                    currentConfirmYes.disabled = false;
                                                    currentConfirmNo.disabled = false;

                                                    if (chrome.runtime.lastError || (summaryResponse && summaryResponse.error)) {
                                                        const errorMsg = chrome.runtime.lastError ? chrome.runtime.lastError.message : summaryResponse.error;
                                                        throw new Error(errorMsg);
                                                    }

                                                    if (summaryResponse && summaryResponse.summary) {
                                                        playNotificationSound();
                                                        
                                                        // INJETA SÓ O RESUMO
                                                        currentReportTextarea.value = summaryResponse.summary;
                                                        // Adiciona observações ao final do resumo (se houver)
                                                        if (observations.trim() !== '') {
                                                            currentReportTextarea.value += `\n\nObservações Adicionais:\n${observations}`;
                                                        }
                                                        
                                                        currentViewSecurity.style.display = 'none';
                                                        currentViewCopyConfirm.style.display = 'flex'; // AVANÇA PARA CONFIRMAÇÃO DE CÓPIA
                                                        setCopyBlockListeners(true); // ATIVA bloqueio na view de confirmação
                                                    
                                                    } else {
                                                        throw new Error('Resposta inválida do PASSO 2 (Resumir).');
                                                    }
                                                } catch (e) {
                                                    console.error('[ContentScript] Erro fatal no callback (PASSO 2):', e.message);
                                                    currentConfirmYes.classList.remove('loading');
                                                    currentConfirmYes.querySelector('.crx-button-text').textContent = 'Sim';
                                                    currentConfirmYes.disabled = false;
                                                    currentConfirmNo.disabled = false;
                                                    currentViewSecurity.style.display = 'none';
                                                    currentView1.style.display = 'flex';
                                                    currentObsTextarea.value = `Erro (2/2): ${e.message}. Verifique as Opções da extensão.`;
                                                    currentObsTextarea.style.color = 'red';
                                                }
                                            }
                                        );
                                    } else {
                                        throw new Error('Resposta inválida do PASSO 1 (Anonimizar).');
                                    }
                                } catch (e) {
                                    console.error('[ContentScript] Erro fatal no callback (PASSO 1):', e.message);
                                    currentConfirmYes.classList.remove('loading');
                                    currentConfirmYes.querySelector('.crx-button-text').textContent = 'Sim';
                                    currentConfirmYes.disabled = false;
                                    currentConfirmNo.disabled = false;
                                    currentViewSecurity.style.display = 'none';
                                    currentView1.style.display = 'flex';
                                    // === CORREÇÃO DA MENSAGEM DE ERRO ===
                                    currentObsTextarea.value = `Erro (1/2): ${e.message}. Verifique as Opções da extensão.`;
                                    currentObsTextarea.style.color = 'red';
                                }
                            }
                        );
                     } catch (error) {
                         console.error('[ContentScript] Falha ao enviar mensagem (PASSO 1):', error.message);
                         throw error; 
                     }
                } catch (error) {
                     console.error('[Gerador de Resumo] Erro fatal ao lidar com clique (GLPI):', error.message);
                     document.getElementById('crx-modal-container')?.remove();
                }
            });

            setTimeout(() => {
                document.body.appendChild(modalContainer);
                console.log('[Gerador de Resumo] Modal injetado no body (GLPI).');
                modalContainer.classList.add('glpi-modal-override');

                // --- NOVO: Anexa listener ao botão de fechar (close-itil-answer) ---
                const closeTarget = findGlpiCloseTarget(); 
                if (closeTarget) {
                    // 1. Guarda o valor original e remove o atributo que dispara o colapso do GLPI
                    const originalToggle = closeTarget.getAttribute('data-bs-toggle');
                    if (originalToggle) {
                        closeTarget.removeAttribute('data-bs-toggle');
                        closeTarget.setAttribute('data-crx-original-toggle', originalToggle); // Guarda original
                        console.log('[Gerador de Resumo] Atributo data-bs-toggle removido.');
                    }
                    
                    // 2. Armazena e anexa o nosso listener
                    GlpiHandler.glpiCloseListener = (e) => {
                        // OBRIGATÓRIO: O GLPI usa a fase de CAPTURA para fechar, 
                        // então precisamos parar o evento aqui E no target.
                        e.stopImmediatePropagation();
                        e.preventDefault();
                        
                        // 3. Tenta restaurar o comportamento nativo antes de fechar nosso modal.
                        const storedToggle = e.currentTarget.getAttribute('data-crx-original-toggle');
                        if (storedToggle) {
                             e.currentTarget.setAttribute('data-bs-toggle', storedToggle);
                             e.currentTarget.removeAttribute('data-crx-original-toggle');
                             console.log('[Gerador de Resumo] Atributo data-bs-toggle restaurado antes de fechar.');
                        }
                        
                        closeAllListenersAndModal(); // Fecha nosso modal
                        console.log('[Gerador de Resumo] Modal fechado via botão X do GLPI (Atributo removido).');
                    };
                    // Anexa o listener com fase de captura para ter prioridade (true)
                    closeTarget.addEventListener('click', GlpiHandler.glpiCloseListener, true);
                    console.log('[Gerador de Resumo] Listener do botão X (GLPI) anexado ao elemento pai clicável.');
                } else {
                     console.warn('[Gerador de Resumo] Botão X (close-itil-answer) do GLPI não encontrado após injeção.');
                }
                // --- FIM NOVO ---
                
            }, 100);
        
        } catch (e) {
            console.error('[Gerador de Resumo] Erro fatal ao lidar com clique (GLPI):', e.message);
        }
    },

    // === INÍCIO DA MODIFICAÇÃO (GLPI) ===
    extractChatLog: function() {
        const timeline = document.querySelector('.itil-timeline');
        if (!timeline) {
            console.warn('[ContentScript GLPI] Container da timeline (.itil-timeline) não encontrado.');
            return []; // Retorna array vazio
        }

        let chatArray = []; // <--- MUDANÇA: Array em vez de string
        let descriptionAdded = false;
        // Inverte a ordem para começar do mais antigo para o mais recente na extração
        const items = Array.from(timeline.querySelectorAll(':scope > .timeline-item')).reverse();

        items.forEach(item => {
            const isPrivate = item.querySelector('i.ti-lock[aria-label="Privado"]');
            if (isPrivate) {
                console.log('[Gerador de Resumo] Item privado ignorado.');
                return;
            }

            const isFollowup = item.classList.contains('ITILFollowup');
            // Correção: usar classList.contains
            const isDescription = item.classList.contains('ITILContent'); 

            if (!isFollowup && !isDescription) {
                return; 
            }

            const headerElement = item.querySelector('.timeline-header');
            const contentElement = item.querySelector('.card-body .rich_text_container, .card-body .content');

            if (headerElement && contentElement) {
                
                // --- INÍCIO DA LIMPEZA (GLPI) ---

                // 1. Limpa o Cabeçalho (Autor/Hora)
                let headerHTML = headerElement.innerHTML;
                // Remove todo o lixo de script CDATA e qtip
                headerHTML = headerHTML.replace(/\/\/\<!\[CDATA\[[\s\S]*?\/\/\]\]\>/g, '');
                const tempHeader = document.createElement('div');
                tempHeader.innerHTML = headerHTML;
                
                // Agora extrai o texto limpo
                let headerText = tempHeader.textContent.replace(/\s+/g, ' ').trim();
                
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
                     } else {
                         // Fallback final: Pega o nome antes de qualquer lixo
                         author = (headerText.split(' por ')[1] || headerText.split(' em ')[0] || headerText).trim();
                         author = author.split(' //')[0].split(' Editar')[0];
                     }
                }
                // Limpa o nome (remove o ID duplicado que o GLPI às vezes adiciona)
                author = author.replace(/[A-Z]{2}\s*$/, '').trim(); // Remove "JD" ou "CÁ" do final do nome

                // 2. Limpa o Conteúdo (Mensagem)
                const cloneContent = contentElement.cloneNode(true);
                // Remove scripts, botões, e galerias de imagem
                cloneContent.querySelectorAll('script, style, button, a.btn, .pswp-gallery').forEach(el => el.remove());
                
                let content = cloneContent.textContent;
                
                // Limpa lixo de script residual (CDATA, jQuery, etc.)
                content = content.replace(/\/\/\<!\[CDATA\[[\s\S]*?\/\/\]\]\>/g, '');
                content = content.replace(/jQuery\([\s\S]*?\);/g, '');
                content = content.replace(/read_more\(\);/g, '');
                content = content.replace(/\s+/g, ' ').trim();

                if (!content && contentElement.innerHTML.includes('<img')) {
                    content = '[Imagem anexada]';
                }
                // --- FIM DA LIMPEZA (GLPI) ---


                if (isDescription && !descriptionAdded) {
                    // chatText += `Descrição Inicial (${time} por ${author}):\n${content}\n---\n`;
                    chatArray.push({
                        time: time || '00:00',
                        author: author.replace('|', '-'),
                        content: content
                    });
                    descriptionAdded = true;
                } else if (isFollowup) {
                    // chatText += `[${time || 'Tempo não encontrado'}] ${author}:\n${content}\n---\n`;
                    chatArray.push({
                        time: time || '00:00',
                        author: author.replace('|', '-'),
                        content: content
                    });
                }
            }
        });

        if (items.length === 0 || chatArray.length === 0) {
             console.warn('[ContentScript GLPI] Nenhum item de descrição ou acompanhamento encontrado na timeline.');
        } 
        
        // Limpa a descrição fallback também
        if (!descriptionAdded) {
            const initialDescription = GlpiHandler.getTextSafe('#tab_principale .card-text .content, #tab_Item_Ticket_1 .card-text .content');
            
            let cleanedFallbackDesc = initialDescription.replace(/\/\/\<!\[CDATA\[[\s\S]*?\/\/\]\]\>/g, '');
            cleanedFallbackDesc = cleanedFallbackDesc.replace(/jQuery\([\s\S]*?\);/g, '');
            cleanedFallbackDesc = cleanedFallbackDesc.replace(/\s+/g, ' ').trim();

             chatArray.unshift({ // Adiciona ao início do array
                 time: '00:00',
                 author: 'Descrição',
                 content: cleanedFallbackDesc || '[Não encontrada]'
             });
        }

        // chatText += "Fim da Conversa.\n";
        return chatArray; // Retorna a lista pura
    },
    // === FIM DA MODIFICAÇÃO ===

    extractTicketData: function() {
        const headerTitleElement = document.querySelector('h3.navigationheader-title');
        let ticketTitle = '[Título não encontrado]';
        let ticketId = getTicketIdFromUrl(); // Busca o ID da URL

        if (headerTitleElement) {
            const fullTitle = headerTitleElement.textContent.replace(/\s+/g, ' ').trim();
            // Padrão do GLPI: Título (#ID)
            const matchId = fullTitle.match(/\((#\d+)\)$/); 
            if (matchId && matchId[1]) {
                // Se encontrar no cabeçalho, usa o ID do cabeçalho, que já vem formatado
                ticketId = matchId[1]; 
                ticketTitle = fullTitle.replace(/\s*\((#\d+)\)$/, '').trim();
            } else {
                // Se não encontrar no cabeçalho, usa o título completo e o ID da URL
                ticketTitle = fullTitle;
            }
        }

        let ticketGroup = '[Grupo não encontrado]';
        const labels = document.querySelectorAll('label, th, dt, .glpi-label');
        labels.forEach(label => {
            if (label.textContent.trim().includes('Grupo')) {
                const container = label.closest('div.row, div.mb-3, tr, dl > div'); 
                if (container) {
                    const valueElement = container.querySelector('span:not(.badge), div:not(.glpi-label):not([class*="col-md-"]), td, dd'); 
                     if (valueElement && valueElement.textContent.trim()) {
                         ticketGroup = valueElement.textContent.replace(/\s+/g, ' ').trim();
                     }
                }
            }
        });

        // Tenta encontrar a descrição inicial fora da timeline
        const initialDescriptionElement = document.querySelector('#tab_principale .card-text .content, #tab_Item_Ticket_1 .card-text .content');
        let initialDescription = '[Descrição não encontrada]';
         if (initialDescriptionElement) {
            const clone = initialDescriptionElement.cloneNode(true);
            // --- INÍCIO DA LIMPEZA (GLPI) ---
            clone.querySelectorAll('script, style, button, a.btn, .pswp-gallery').forEach(el => el.remove());
            let text = clone.textContent;
            text = text.replace(/\/\/\<!\[CDATA\[[\s\S]*?\/\/\]\]\>/g, ''); // Remove CDATA
            text = text.replace(/jQuery\([\s\S]*?\);/g, ''); // Remove jQuery calls
            // --- FIM DA LIMPEZA ---
            initialDescription = text.replace(/\s+/g, ' ').trim();
        }
        
        const fullData = `Título do Chamado: ${ticketTitle} (${ticketId})\n` +
               `Grupo de Atendimento: ${ticketGroup}\n` +
               `Descrição Inicial: ${initialDescription}`;
        
        return {
            id: ticketId,
            fullData: fullData
        };
    },
};
// --- Fim do Handler: GLPI ---


// --- Lógica Principal (Roteador e Observador) ---

let activeHandler = null; 

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
         // Adiciona o listener de fechar do GLPI aqui também, caso o botão apareça com atraso
         if (activeHandler.siteIdentifier === "GLPI_Solucao") {
             GlpiHandler.removeCloseListener(); // Remove o antigo se houver
             setTimeout(() => {
                 const closeTarget = findGlpiCloseTarget(); 
                 if (closeTarget && !GlpiHandler.glpiCloseListener) { // Verifica se ainda não está ativo
                     // Lógica de interceção e remoção de atributo repetida para a interceção tardia
                     const originalToggle = closeTarget.getAttribute('data-bs-toggle');
                     if (originalToggle) {
                         closeTarget.removeAttribute('data-bs-toggle');
                         closeTarget.setAttribute('data-crx-original-toggle', originalToggle);
                     }
                     
                     GlpiHandler.glpiCloseListener = (e) => {
                         e.stopImmediatePropagation();
                         e.preventDefault();
                         
                         const storedToggle = e.currentTarget.getAttribute('data-crx-original-toggle');
                         if (storedToggle) {
                              e.currentTarget.setAttribute('data-bs-toggle', storedToggle);
                              e.currentTarget.removeAttribute('data-crx-original-toggle');
                         }
                         
                         closeAllListenersAndModal();
                         console.log('[Gerador de Resumo] Modal fechado via botão X do GLPI (late binding).');
                     };
                     closeTarget.addEventListener('click', GlpiHandler.glpiCloseListener, true);
                     console.log('[Gerador de Resumo] Listener do botão X (GLPI) anexado (late binding).');
                 }
             }, 500); // Dá um tempo para o GLPI carregar o botão
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

    if (activeHandler && !document.querySelector('[data-crx-listener="true"]')) {
        activeHandler.findTriggerButton();
    }
}

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

    return null;
}

function setupObserver(enable) {
    if (pageObserver) {
        pageObserver.disconnect();
        pageObserver = null;
        console.log('[Gerador de Resumo] Observer parado.');
    }
    
    // Remove listeners existentes
    document.querySelectorAll('[data-crx-listener="true"]').forEach(btn => {
        btn.removeAttribute('data-crx-listener');
        // Usa a mesma lógica para remover o listener, pois o evento é o mesmo (click)
        if (typeof VerdanaDeskHandler !== 'undefined' && typeof VerdanaDeskHandler.onTriggerButtonClick === 'function') {
             btn.removeEventListener('click', VerdanaDeskHandler.onTriggerButtonClick); 
        }
        if (typeof GlpiHandler !== 'undefined' && typeof GlpiHandler.onTriggerButtonClick === 'function') {
            btn.removeEventListener('click', GlpiHandler.onTriggerButtonClick, true); 
        }
    });
    activeHandler = null; 
    
    // Remove o listener do botão X do GLPI em qualquer caso
    GlpiHandler.removeCloseListener(); 

    if (enable) {
        // Remove o toast de cópia se existir (caso o utilizador volte)
        const toast = document.getElementById('crx-toast');
        if (toast) toast.remove();

        console.log('[Gerador de Resumo] Ativado. Iniciando MutationObserver...');
        pageObserver = new MutationObserver(onMutation);
        pageObserver.observe(document.body, { childList: true, subtree: true });
        onMutation();
    } else {
        console.log('[Gerador de Resumo] Desativado.');
        // Remove o toast de cópia se existir
        const toast = document.getElementById('crx-toast');
        if (toast) toast.remove();
        
        // --- NOVO: Garante que o modal é fechado ao desativar a extensão ---
        const existingModal = document.getElementById('crx-modal-container');
        if (existingModal) {
            closeAllListenersAndModal();
        }
        // --- FIM NOVO ---
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

chrome.storage.sync.get(['extensionEnabled'], (result) => {
    isExtensionEnabled = !!result.extensionEnabled;
    setupObserver(isExtensionEnabled);
});


// +++ INÍCIO: NOVA FUNÇÃO CONVERSORA TOON +++
/**
 * Converte os dados do ticket e o array do chat para o formato TOON.
 * @param {object} ticketData - Objeto de extractTicketData (id, fullData)
 * @param {Array} chatArray - Array de objetos de extractChatLog (time, author, content)
 * @param {string} observations - Texto do campo de observações
 * @returns {string} - String formatada em TOON
 */
function convertToTOON(ticketData, chatArray, observations) {
    // Seção do Ticket (formato chave: valor)
    let output = "TICKET:\n";
    output += `id: ${ticketData.id.replace('|', '-')}\n`;
    output += `titulo: ${(ticketData.fullData.match(/Título do Chamado: (.*)/)?.[1] || 'N/A').replace('|', '-').replace(/\n/g, ' ')}\n`;
    output += `grupo: ${ticketData.fullData.match(/Grupo de Atendimento: (.*)/)?.[1] || 'N/A'}\n`;
    
    // --- INÍCIO DA LIMPEZA (TOON) ---
    // Limpa a descrição que vem do ticketData
    const cleanDesc = (ticketData.fullData.match(/Descrição Inicial: ([\s\S]*)/)?.[1] || '[Não encontrada]')
                        .replace(/\|/g, '-') // remove pipes
                        .replace(/\n/g, ' ') // remove quebras de linha
                        .trim();
    output += `descricao: ${cleanDesc}\n`;
    // --- FIM DA LIMPEZA ---

    // Seção do Chat (formato TABULAR - aqui está a grande economia)
    // Sintaxe: nome_da_lista[quantidade]{colunas}:
    output += `\nCHAT[${chatArray.length}]{hora|autor|msg}:\n`;
    
    chatArray.forEach(msg => {
        // Limpeza extra: remove pipes (|) e quebras de linha da mensagem, autor e hora
        const cleanTime = msg.time.replace(/\|/g, '-').replace(/\n/g, ' ').trim();
        const cleanAuthor = msg.author.replace('|', '-').replace(/\n/g, ' ').trim();
        const cleanMsg = msg.content.replace(/\|/g, '-').replace(/\n/g, ' ').trim();
        
        // Usa PIPE como separador
        output += `${cleanTime}|${cleanAuthor}|${cleanMsg}\n`;
    });

    // Adiciona observações se existirem
    if (observations && observations.trim() !== '') {
        output += `\nOBSERVACOES:\n`;
        output += observations.replace(/\|/g, '-'); // Limpa pipes das observações
    }

    return output;
}
// +++ FIM: NOVA FUNÇÃO CONVERSORA TOON +++