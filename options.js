document.addEventListener('DOMContentLoaded', () => {
    const saveButton = document.getElementById('save-button');
    const statusMessage = document.getElementById('status-message');
    
    const geminiApiKey = document.getElementById('gemini-api-key');
    const ollamaUrl = document.getElementById('ollama-url');
    const ollamaModel = document.getElementById('ollama-model');
    const discordWebhookUrl = document.getElementById('discord-webhook-url');

    // Carrega as configurações salvas
    function loadOptions() {
        chrome.storage.sync.get([
            'geminiApiKey',
            'ollamaUrl',
            'ollamaModel',
            'discordWebhookUrl'
        ], (items) => {
            geminiApiKey.value = items.geminiApiKey || '';
            ollamaUrl.value = items.ollamaUrl || 'http://127.0.0.1:11434';
            ollamaModel.value = items.ollamaModel || 'llama3:8b';
            discordWebhookUrl.value = items.discordWebhookUrl || '';
        });
    }

    // Salva as configurações
    function saveOptions() {
        const settings = {
            geminiApiKey: geminiApiKey.value.trim(),
            ollamaUrl: ollamaUrl.value.trim(),
            ollamaModel: ollamaModel.value.trim(),
            discordWebhookUrl: discordWebhookUrl.value.trim()
        };

        chrome.storage.sync.set(settings, () => {
            // Exibe mensagem de sucesso
            statusMessage.textContent = 'Configurações salvas com sucesso!';
            statusMessage.className = 'success';
            setTimeout(() => {
                statusMessage.textContent = '';
                statusMessage.className = '';
            }, 2000);
        });
    }

    saveButton.addEventListener('click', saveOptions);
    loadOptions();
});
