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
const TRIGGER_BUTTON_SELECTOR = 'button.d2l-button';

function findTriggerButton() {
    const buttons = document.querySelectorAll(TRIGGER_BUTTON_SELECTOR);
    buttons.forEach(button => {
        // Procura pelo botão com o texto exato
        if (button.textContent.trim() === 'Fazer login' && !button.hasAttribute('data-crx-listener')) {
            console.log('[Gerador de Resumo] Botão "Fazer login" encontrado!');
            button.setAttribute('data-crx-listener', 'true');
            button.addEventListener('click', onTriggerButtonClick);
        }
    });
}

// --- Lógica para construir a interface ---
function onTriggerButtonClick(event) {
    // Se a extensão não estiver ativa, não faz nada.
    if (!isExtensionEnabled) return;

    // Previne a ação padrão do botão (ex: submeter um formulário)
    event.preventDefault();
    event.stopPropagation();

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
        const observations = obsTextarea.value;
        if (observations.trim() !== '') {
            reportTextarea.value += `\n\nObservações Adicionais:\n${observations}`;
        }
        view1.style.display = 'none';
        view2.style.display = 'flex';
    });

    copyButton.addEventListener('click', () => {
        reportTextarea.select();
        document.execCommand('copy');
        copyButton.textContent = 'Copiado!';
        setTimeout(() => {
            copyButton.innerHTML = '📋 Copiar';
        }, 2000);
    });

    document.body.appendChild(modalContainer);
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
    const today = new Date().toLocaleDateString('pt-BR');
    const reportContent = `Relatório de Atendimento - ${today}\n\nCliente: [Nome do Cliente]\n\nMotivo do Contato:`;
    view.innerHTML = `
        <h2>Relatório Gerado</h2>
        <textarea id="crx-report-textarea" readonly>${reportContent}</textarea>
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
});

// Verifica o estado inicial quando a página carrega
chrome.storage.sync.get(['extensionEnabled'], (result) => {
    isExtensionEnabled = !!result.extensionEnabled;
    setupObserver(isExtensionEnabled);
});

