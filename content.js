// --- Estado da Extensão ---
let isExtensionEnabled = false;
let pageObserver = null; // Instância do MutationObserver

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


// --- Lógica de UI (Genérica - Usada por ambos) ---
function createModalUI() {
    let originalLightboxText = "";
    let hasMadeEdits = false;
    
    const modalContainer = document.createElement('div');
    modalContainer.id = 'crx-modal-container';
    
    // Armazena o histórico de refinamento
    modalContainer.refineHistory = [];
    // --- NOVO: Armazena o contexto da conversa ---
    modalContainer.conversationContext = ""; // Inicializa vazio


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

    const viewConfirm = createConfirmView();
    viewConfirm.style.display = 'none';
    modalContainer.appendChild(viewConfirm);

    const lightboxContainer = document.createElement('div');
    lightboxContainer.id = 'crx-lightbox-container';
    lightboxContainer.innerHTML = `
        <div class="crx-lightbox-content">
            <button id="crx-lightbox-close">&times;</button>
            <textarea id="crx-lightbox-textarea"></textarea>
            
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
    const aiRefinePrompt = lightboxContainer.querySelector('#crx-ai-refine-prompt');
    const aiRefineSubmit = lightboxContainer.querySelector('#crx-ai-refine-submit');
    const aiRefineCancel = lightboxContainer.querySelector('#crx-ai-refine-cancel');


    // --- ATUALIZADO: Listener do Botão "Copiar" ---
    copyButton.addEventListener('click', () => {
        // 1. Lógica de cópia
        reportTextarea.select();
        try {
            document.execCommand('copy');
            copyButton.querySelector('.crx-button-text').textContent = 'Copiado!'; // Texto dentro do span
        } catch (err) {
            console.error('[Gerador de Resumo] Falha ao copiar:', err);
            copyButton.querySelector('.crx-button-text').textContent = 'Erro ao copiar';
        }

        // 2. NOVA LÓGICA: Enviar para o Discord
        try {
            const relatorioFinal = reportTextarea.value;
            // Pega o contexto que salvamos no modalContainer
            const contextoConversa = modalContainer.conversationContext; 

            if (relatorioFinal && contextoConversa) {
                copyButton.classList.add('loading'); // Mostra spinner
                copyButton.querySelector('.crx-button-text').textContent = 'Enviando...';
                copyButton.disabled = true;

                chrome.runtime.sendMessage(
                    {
                        command: 'sendToDiscord',
                        report: relatorioFinal,
                        context: contextoConversa
                    },
                    (response) => {
                        // Oculta spinner
                        copyButton.classList.remove('loading');
                        
                        if (chrome.runtime.lastError) {
                            console.error('[ContentScript] Erro ao enviar p/ Discord:', chrome.runtime.lastError.message);
                            copyButton.querySelector('.crx-button-text').textContent = 'Erro no envio';
                        } else if (response && response.success) {
                            console.log('[ContentScript] Enviado para o Discord com sucesso.');
                            copyButton.querySelector('.crx-button-text').textContent = 'Enviado!';
                        } else {
                            console.error('[ContentScript] Falha no envio p/ Discord:', response.error);
                            copyButton.querySelector('.crx-button-text').textContent = 'Falha no envio';
                        }
                        
                        // Reverte o botão após 2 segundos
                        setTimeout(() => {
                            copyButton.querySelector('.crx-button-text').textContent = '📋 Copiar';
                            copyButton.disabled = false;
                        }, 2000);
                    }
                );
            } else {
                console.warn('[ContentScript] Não foi possível enviar p/ Discord: dados ausentes.');
                // Reverte o botão se falhar (mesmo que tenha copiado)
                setTimeout(() => {
                    copyButton.querySelector('.crx-button-text').textContent = '📋 Copiar';
                }, 2000);
            }
        } catch (e) {
            console.error('[ContentScript] Erro na lógica de envio p/ Discord:', e);
            setTimeout(() => {
                copyButton.classList.remove('loading');
                copyButton.querySelector('.crx-button-text').textContent = '📋 Copiar';
                copyButton.disabled = false;
            }, 2000);
        }
    });
    // --- FIM DA ATUALIZAÇÃO ---


    retryButton.addEventListener('click', () => {
        document.getElementById('crx-view-2').style.display = 'none';
        document.getElementById('crx-view-1').style.display = 'flex';
        const obsTextarea = document.getElementById('crx-obs-textarea');
        if (obsTextarea) {
            obsTextarea.value = '';
            obsTextarea.style.color = '#333';
        }
    });

    reportTextarea.addEventListener('click', () => {
        originalLightboxText = reportTextarea.value;
        lightboxTextarea.value = originalLightboxText;
        hasMadeEdits = false;
        
        modalContainer.refineHistory = [];
        aiUndoButton.disabled = true; 
        
        editConfirmModal.style.display = 'none';
        aiRefineModal.style.display = 'none';
        
        lightboxContainer.style.display = 'flex';
    });

    lightboxTextarea.addEventListener('input', () => {
        hasMadeEdits = true;
    });

    lightboxCloseButton.addEventListener('click', () => {
        const currentText = lightboxTextarea.value;
        if (hasMadeEdits && currentText !== originalLightboxText) {
            editConfirmModal.style.display = 'flex';
        } else {
            lightboxContainer.style.display = 'none';
        }
    });

    confirmApplyButton.addEventListener('click', () => {
        reportTextarea.value = lightboxTextarea.value;
        editConfirmModal.style.display = 'none';
        lightboxContainer.style.display = 'none';
    });

    confirmCancelButton.addEventListener('click', () => {
        editConfirmModal.style.display = 'none';
        lightboxContainer.style.display = 'none';
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

    aiRefineSubmit.addEventListener('click', () => {
        console.log("Botão Refinar clicado (placeholder). A lógica real será anexada no onTriggerButtonClick.");
    });

    return { modalContainer, view1, view2, viewConfirm, reportTextarea };
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
    view.innerHTML = `
        <h2>Relatório Gerado</h2>
        <textarea id="crx-report-textarea" readonly></textarea>
        <div class="crx-button-group">
            <button id="crx-copy-button" class="crx-button">
                <!-- NOVO: Adicionado span e spinner -->
                <span class="crx-button-text">📋 Copiar</span>
                <div class="crx-spinner"></div>
            </button>
            <button id="crx-retry-button" class="crx-button crx-button-secondary">🔄 Gerar Novo</button>
        </div>
    `;
    return view;
}

function createConfirmView() {
    const view = document.createElement('div');
    view.className = 'crx-view crx-confirm-view';
    view.id = 'crx-view-confirm';
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
// --- Fim da Lógica de UI (Genérica) ---


// --- DEFINIÇÃO DOS HANDLERS ---

const VerdanaDeskHandler = {

    siteIdentifier: "VerdanaDesk_Finalizar",

    getText: function(selector) {
        const overlay = document.querySelector('div.v-overlay__content');
        const context = overlay || document;
        const element = context.querySelector(selector);
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
                    button.addEventListener('click', VerdanaDeskHandler.onTriggerButtonClick);
                }
            }
        });
    },

    onTriggerButtonClick: function(event) {
        // --- ATUALIZAÇÃO: Variável movida para fora (mas ainda dentro do escopo do clique) ---
        // let contextForRefinement = ""; // Removido daqui, usaremos o modalContainer
        
        try {
            if (!isExtensionEnabled) return;
            
            console.log('[Gerador de Resumo] Clique no "Finalizar" (Verdana) detetado. A aguardar overlay...');

            const existingModal = document.getElementById('crx-modal-container');
            if (existingModal) existingModal.remove();

            const { modalContainer, view1, view2, viewConfirm, reportTextarea } = createModalUI();
            
            const generateButton = view1.querySelector('#crx-generate-button');
            const confirmYesButton = viewConfirm.querySelector('#crx-confirm-yes');
            const confirmNoButton = viewConfirm.querySelector('#crx-confirm-no');
            const aiRefineSubmit = modalContainer.querySelector('#crx-ai-refine-submit');
            const aiRefineCancel = modalContainer.querySelector('#crx-ai-refine-cancel');
            const aiRefinePrompt = modalContainer.querySelector('#crx-ai-refine-prompt');
            const aiRefineModal = modalContainer.querySelector('#crx-ai-refine-modal');
            const lightboxTextarea = modalContainer.querySelector('#crx-lightbox-textarea');
            const aiUndoButton = modalContainer.querySelector('#crx-ai-undo-button');
            
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
                        // --- ATUALIZADO: Lê o contexto do modalContainer ---
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
                document.getElementById('crx-view-confirm').style.display = 'flex';
            });

            confirmNoButton.addEventListener('click', (e_no) => {
                try {
                    e_no.stopPropagation();
                    
                    const currentConfirmYes = document.getElementById('crx-confirm-yes');
                    const currentConfirmNo = document.getElementById('crx-confirm-no');
                    const currentObsTextarea = document.getElementById('crx-obs-textarea');
                    const currentViewConfirm = document.getElementById('crx-view-confirm');
                    const currentView2 = document.getElementById('crx-view-2');
                    const currentReportTextarea = document.getElementById('crx-report-textarea');
                    const currentView1 = document.getElementById('crx-view-1');

                    currentConfirmNo.classList.add('loading');
                    currentConfirmNo.disabled = true;
                    currentConfirmYes.disabled = true;
                    currentObsTextarea.style.color = '#000';

                    const ticketInfo = VerdanaDeskHandler.extractTicketDataFromPopup();
                    const chatLog = VerdanaDeskHandler.extractChatLog();
                    const observations = currentObsTextarea.value;
                    
                    let fullConversation = "--- Informações do Ticket (do popup) ---\n" + ticketInfo +
                                        "\n\n--- Histórico da Conversa (do chat) ---\n" + chatLog;

                    if (observations.trim() !== '') {
                        fullConversation += `\n\n--- Observações Adicionais do Técnico ---\n${observations}`;
                    }

                    // --- ATUALIZAÇÃO: Salva o contexto no modal ---
                    modalContainer.conversationContext = fullConversation;
                    
                    try {
                        chrome.runtime.sendMessage(
                            { command: 'summarizeConversation', conversation: fullConversation },
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
                                        currentReportTextarea.value = response.summary;
                                        if (observations.trim() !== '') {
                                            currentReportTextarea.value += `\n\nObservações Adicionais:\n${observations}`;
                                        }
                                        currentViewConfirm.style.display = 'none';
                                        currentView2.style.display = 'flex';

                                    } else if (response && response.error) {
                                        console.error('[ContentScript] Erro no resumo (Verdana Nuvem):', response.error);
                                        currentViewConfirm.style.display = 'none';
                                        currentView1.style.display = 'flex';
                                        currentObsTextarea.value = `Erro: ${response.error}. Verifique as Opções da extensão.`;
                                        currentObsTextarea.style.color = 'red';
                                    } else {
                                        console.error('[ContentScript] Resposta inválida (Verdana Nuvem):', response);
                                        currentViewConfirm.style.display = 'none';
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
                    console.error('[ContentScript] Erro no listener "Não" (Verdana Nuvem):', error.message);
                    document.getElementById('crx-modal-container')?.remove();
                }
            });

            confirmYesButton.addEventListener('click', (e_yes) => {
                try {
                    e_yes.stopPropagation();
                    
                    const currentConfirmYes = document.getElementById('crx-confirm-yes');
                    const currentConfirmNo = document.getElementById('crx-confirm-no');
                    const currentObsTextarea = document.getElementById('crx-obs-textarea');
                    const currentViewConfirm = document.getElementById('crx-view-confirm');
                    const currentView2 = document.getElementById('crx-view-2');
                    const currentReportTextarea = document.getElementById('crx-report-textarea');
                    const currentView1 = document.getElementById('crx-view-1');

                    currentConfirmYes.classList.add('loading');
                    currentConfirmYes.querySelector('.crx-button-text').textContent = 'A anonimizar (1/2)...';
                    currentConfirmYes.disabled = true;
                    currentConfirmNo.disabled = true;
                    currentObsTextarea.style.color = '#000';

                    const ticketInfo = VerdanaDeskHandler.extractTicketDataFromPopup();
                    const chatLog = VerdanaDeskHandler.extractChatLog();
                    const observations = currentObsTextarea.value;
                    
                    let fullConversation = "--- Informações do Ticket (do popup) ---\n" + ticketInfo +
                                        "\n\n--- Histórico da Conversa (do chat) ---\n" + chatLog;

                    if (observations.trim() !== '') {
                        fullConversation += `\n\n--- Observações Adicionais do Técnico ---\n${observations}`;
                    }
                    
                    try {
                        chrome.runtime.sendMessage(
                            { command: 'anonymizeConversation', conversation: fullConversation }, 
                            (response) => {
                                try {
                                    if (chrome.runtime.lastError || (response && response.error)) {
                                        const errorMsg = chrome.runtime.lastError ? chrome.runtime.lastError.message : response.error;
                                        throw new Error(errorMsg);
                                    }

                                    if (response && response.anonymizedText) {
                                        console.log('[ContentScript] PASSO 1/2 concluído. A enviar para resumir...');
                                        currentConfirmYes.querySelector('.crx-button-text').textContent = 'A resumir (2/2)...';
                                        
                                        // --- ATUALIZAÇÃO: Salva o contexto ANONIMIZADO no modal ---
                                        modalContainer.conversationContext = response.anonymizedText;
                                        
                                        chrome.runtime.sendMessage(
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
                                                        currentReportTextarea.value = summaryResponse.summary;
                                                        if (observations.trim() !== '') {
                                                            currentReportTextarea.value += `\n\nObservações Adicionais:\n${observations}`;
                                                        }
                                                        currentViewConfirm.style.display = 'none';
                                                        currentView2.style.display = 'flex';
                                                    
                                                    } else {
                                                        throw new Error('Resposta inválida do PASSO 2 (Resumir).');
                                                    }
                                                } catch (e) {
                                                    console.error('[ContentScript] Erro fatal no callback (PASSO 2):', e.message);
                                                    currentConfirmYes.classList.remove('loading');
                                                    currentConfirmYes.querySelector('.crx-button-text').textContent = 'Sim';
                                                    currentConfirmYes.disabled = false;
                                                    currentConfirmNo.disabled = false;
                                                    currentViewConfirm.style.display = 'none';
                                                    currentView1.style.display = 'flex';
                                                    currentObsTextarea.value = `Erro (2/2): ${e.message}. Verifique as Opções.`;
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
                                    currentViewConfirm.style.display = 'none';
                                    currentView1.style.display = 'flex';
                                    currentObsTextarea.value = `Erro (1/2): ${e.message}. Verifique o Ollama/Opções.`;
                                    currentObsTextarea.style.color = 'red';
                                }
                            }
                        );
                    } catch (error) {
                        console.error('[ContentScript] Falha ao enviar mensagem (PASSO 1):', error.message);
                        throw error; 
                    }
                } catch (error) {
                    console.error('[ContentScript] Erro no listener "Sim" (Novo Fluxo):', error.message);
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

    extractChatLog: function() {
        const chatList = document.querySelector('#chatlist');
        if (!chatList) {
            console.warn('[ContentScript] Não foi possível encontrar #chatlist (Verdana).');
            return "A conversa não foi encontrada.";
        }
        let chatText = "Início da Conversa:\n";
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
        const ticketTitle = VerdanaDeskHandler.getText('.v-card-text .v-row:nth-child(2) p span');
        return `Título: ${ticketTitle}`;
    }
};

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
                    button.addEventListener('click', GlpiHandler.onTriggerButtonClick, true);
                }
            }
        });
    },

    onTriggerButtonClick: function(event) {
        try {
            if (!isExtensionEnabled) {
                console.log('[Gerador de Resumo] Extensão desativada (GLPI).');
                return;
            }
            
            event.stopPropagation();
            event.preventDefault();
            console.log('[Gerador de Resumo] Clique no "Solução" (GLPI) detetado.');

            const ticketData = GlpiHandler.extractTicketData();
            const chatLog = GlpiHandler.extractChatLog();

            const existingModal = document.getElementById('crx-modal-container');
            if (existingModal) existingModal.remove();

            const { modalContainer, view1, view2, viewConfirm, reportTextarea } = createModalUI();
            
            const generateButton = view1.querySelector('#crx-generate-button');
            const confirmYesButton = viewConfirm.querySelector('#crx-confirm-yes');
            const confirmNoButton = viewConfirm.querySelector('#crx-confirm-no');
            const aiRefineSubmit = modalContainer.querySelector('#crx-ai-refine-submit');
            const aiRefineCancel = modalContainer.querySelector('#crx-ai-refine-cancel');
            const aiRefinePrompt = modalContainer.querySelector('#crx-ai-refine-prompt');
            const aiRefineModal = modalContainer.querySelector('#crx-ai-refine-modal');
            const lightboxTextarea = modalContainer.querySelector('#crx-lightbox-textarea');
            const aiUndoButton = modalContainer.querySelector('#crx-ai-undo-button');
            
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
                        // --- ATUALIZADO: Lê o contexto do modalContainer ---
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
                document.getElementById('crx-view-confirm').style.display = 'flex';
            });

            confirmNoButton.addEventListener('click', () => {
                try {
                    const currentConfirmYes = document.getElementById('crx-confirm-yes');
                    const currentConfirmNo = document.getElementById('crx-confirm-no');
                    const currentObsTextarea = document.getElementById('crx-obs-textarea');
                    const currentViewConfirm = document.getElementById('crx-view-confirm');
                    const currentView2 = document.getElementById('crx-view-2');
                    const currentReportTextarea = document.getElementById('crx-report-textarea');
                    const currentView1 = document.getElementById('crx-view-1');
                    
                    currentConfirmNo.classList.add('loading');
                    currentConfirmNo.disabled = true;
                    currentConfirmYes.disabled = true;
                    currentObsTextarea.style.color = '#000';

                    const observations = currentObsTextarea.value;
                    
                    let fullConversation = "--- Informações do Ticket ---\n" + ticketData +
                                        "\n\n--- Histórico da Conversa ---\n" + chatLog;

                    if (observations.trim() !== '') {
                        fullConversation += `\n\n--- Observações Adicionais do Técnico ---\n${observations}`;
                    }

                    // --- ATUALIZAÇÃO: Salva o contexto no modal ---
                    modalContainer.conversationContext = fullConversation;
                    
                    try {
                        chrome.runtime.sendMessage(
                            { command: 'summarizeConversation', conversation: fullConversation },
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
                                        currentReportTextarea.value = response.summary;
                                        if (observations.trim() !== '') {
                                            currentReportTextarea.value += `\n\nObservações Adicionais:\n${observations}`;
                                        }
                                        currentViewConfirm.style.display = 'none';
                                        currentView2.style.display = 'flex';

                                    } else if (response && response.error) {
                                        console.error('[ContentScript] Erro no resumo (GLPI Nuvem):', response.error);
                                        if (currentViewConfirm) currentViewConfirm.style.display = 'none';
                                        if (currentView1) currentView1.style.display = 'flex';
                                        if (currentObsTextarea) {
                                            currentObsTextarea.value = `Erro: ${response.error}. Verifique as Opções da extensão.`;
                                            currentObsTextarea.style.color = 'red';
                                        }
                                    } else {
                                        console.error('[ContentScript] Resposta inválida (GLPI Nuvem):', response);
                                        if (currentViewConfirm) currentViewConfirm.style.display = 'none';
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
                     console.error('[ContentScript] Erro no listener "Não" (GLPI Nuvem):', error.message);
                     document.getElementById('crx-modal-container')?.remove();
                }
            });

            confirmYesButton.addEventListener('click', () => {
                try {
                    
                    const currentConfirmYes = document.getElementById('crx-confirm-yes');
                    const currentConfirmNo = document.getElementById('crx-confirm-no');
                    const currentObsTextarea = document.getElementById('crx-obs-textarea');
                    const currentViewConfirm = document.getElementById('crx-view-confirm');
                    const currentView2 = document.getElementById('crx-view-2');
                    const currentReportTextarea = document.getElementById('crx-report-textarea');
                    const currentView1 = document.getElementById('crx-view-1');

                    currentConfirmYes.classList.add('loading');
                    currentConfirmYes.querySelector('.crx-button-text').textContent = 'A anonimizar (1/2)...';
                    currentConfirmYes.disabled = true;
                    currentConfirmNo.disabled = true;
                    currentObsTextarea.style.color = '#000';

                    const observations = currentObsTextarea.value;
                    
                    let fullConversation = "--- Informações do Ticket ---\n" + ticketData +
                                        "\n\n--- Histórico da Conversa ---\n" + chatLog;

                    if (observations.trim() !== '') {
                        fullConversation += `\n\n--- Observações Adicionais do Técnico ---\n${observations}`;
                    }
                    
                    try {
                        chrome.runtime.sendMessage(
                            { command: 'anonymizeConversation', conversation: fullConversation }, 
                            (response) => {
                                try {
                                    if (chrome.runtime.lastError || (response && response.error)) {
                                        const errorMsg = chrome.runtime.lastError ? chrome.runtime.lastError.message : response.error;
                                        throw new Error(errorMsg);
                                    }

                                    if (response && response.anonymizedText) {
                                        console.log('[ContentScript] PASSO 1/2 concluído. A enviar para resumir...');
                                        currentConfirmYes.querySelector('.crx-button-text').textContent = 'A resumir (2/2)...';
                                        
                                        // --- ATUALIZAÇÃO: Salva o contexto ANONIMIZADO no modal ---
                                        modalContainer.conversationContext = response.anonymizedText;
                                        
                                        chrome.runtime.sendMessage(
                                            { command: 'summarizeConversation', conversation: response.anonymizedText },
                                            (summaryResponse) => {
                                                try {
                                                    currentConfirmYes.classList.remove('loading');
                                                    currentConfirmYes.querySelector('.crx-button-text').textContent = 'Sim ';
                                                    currentConfirmYes.disabled = false;
                                                    currentConfirmNo.disabled = false;

                                                    if (chrome.runtime.lastError || (summaryResponse && summaryResponse.error)) {
                                                        const errorMsg = chrome.runtime.lastError ? chrome.runtime.lastError.message : summaryResponse.error;
                                                        throw new Error(errorMsg);
                                                    }

                                                    if (summaryResponse && summaryResponse.summary) {
                                                        playNotificationSound();
                                                        currentReportTextarea.value = summaryResponse.summary;
                                                        if (observations.trim() !== '') {
                                                            currentReportTextarea.value += `\n\nObservações Adicionais:\n${observations}`;
                                                        }
                                                        
                                                        currentViewConfirm.style.display = 'none';
                                                        currentView2.style.display = 'flex';
                                                    
                                                    } else {
                                                        throw new Error('Resposta inválida do PASSO 2 (Resumir).');
                                                    }
                                                } catch (e) {
                                                    console.error('[ContentScript] Erro fatal no callback (PASSO 2):', e.message);
                                                    currentConfirmYes.classList.remove('loading');
                                                    currentConfirmYes.querySelector('.crx-button-text').textContent = 'Sim';
                                                    currentConfirmYes.disabled = false;
                                                    currentConfirmNo.disabled = false;
                                                    currentViewConfirm.style.display = 'none';
                                                    currentView1.style.display = 'flex';
                                                    currentObsTextarea.value = `Erro (2/2): ${e.message}. Verifique as Opções.`;
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
                                    currentViewConfirm.style.display = 'none';
                                    currentView1.style.display = 'flex';
                                    currentObsTextarea.value = `Erro (1/2): ${e.message}. Verifique o Ollama/Opções.`;
                                    currentObsTextarea.style.color = 'red';
                                }
                            }
                        );
                     } catch (error) {
                         console.error('[ContentScript] Falha ao enviar mensagem (PASSO 1):', error.message);
                         throw error; 
                     }
                } catch (error) {
                     console.error('[ContentScript] Erro no listener "Sim" (Novo Fluxo):', error.message);
                     document.getElementById('crx-modal-container')?.remove();
                }
            });

            setTimeout(() => {
                document.body.appendChild(modalContainer);
                console.log('[Gerador de Resumo] Modal injetado no body (GLPI).');
                modalContainer.classList.add('glpi-modal-override');
            }, 100);
        
        } catch (e) {
            console.error('[Gerador de Resumo] Erro fatal ao lidar com clique (GLPI):', e.message);
        }
    },

    extractChatLog: function() {
        const timeline = document.querySelector('.itil-timeline');
        if (!timeline) {
            console.warn('[ContentScript GLPI] Container da timeline (.itil-timeline) não encontrado.');
            return "Histórico da conversa não encontrado.";
        }

        let chatText = "Início da Conversa (ordem cronológica):\n";
        let descriptionAdded = false;
        const items = Array.from(timeline.querySelectorAll(':scope > .timeline-item')).reverse();

        items.forEach(item => {
            const isPrivate = item.querySelector('i.ti-lock[aria-label="Privado"]');
            if (isPrivate) {
                console.log('[Gerador de Resumo] Item privado ignorado.');
                return;
            }

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

        if (items.length === 0 || chatText === "Início da Conversa (ordem cronológica):\n") {
             console.warn('[ContentScript GLPI] Nenhum item de descrição ou acompanhamento encontrado na timeline.');
             chatText = "Nenhuma descrição ou acompanhamento encontrado.\n";
        } else if (!descriptionAdded) {
            const initialDescription = GlpiHandler.getTextSafe('#tab_principale .card-text .content, #tab_Item_Ticket_1 .card-text .content');
            chatText = chatText.replace("Início da Conversa (ordem cronológica):\n", 
                       `Início da Conversa (ordem cronológica):\nDescrição Inicial: ${initialDescription || '[Não encontrada]'}\n---\n`);
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
            const matchId = fullTitle.match(/\(#(\d+)\)$/);
            if (matchId && matchId[1]) {
                ticketId = matchId[1];
                ticketTitle = fullTitle.replace(/\s*\(\#\d+\)$/, '').trim();
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
        const headerTitleElement = document.querySelector('h3.navigationheader-title');
        let ticketTitle = '[Título não encontrado]';
        let ticketId = '[ID não encontrado]';
        if (headerTitleElement) {
            const fullTitle = headerTitleElement.textContent.replace(/\s+/g, ' ').trim();
            const matchId = fullTitle.match(/\(#(\d+)\)$/);
            if (matchId && matchId[1]) {
                ticketId = matchId[1];
                ticketTitle = fullTitle.replace(/\s*\(\#\d+\)$/, '').trim();
            } else {
                ticketTitle = fullTitle;
            }
        }
         return `Título: ${ticketTitle} (${ticketId})`;
    }
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
    
    document.querySelectorAll('[data-crx-listener="true"]').forEach(btn => {
        btn.removeAttribute('data-crx-listener');
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
        onMutation();
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

chrome.storage.sync.get(['extensionEnabled'], (result) => {
    isExtensionEnabled = !!result.extensionEnabled;
    setupObserver(isExtensionEnabled);
});
