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

    // --- Lógica da API Key (Removida) ---
    // Não precisamos mais salvar ou carregar a chave pelo popup.
});

