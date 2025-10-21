chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Verifica se o URL mudou (útil para Single Page Applications) e o carregamento está completo.
    if (changeInfo.status === 'complete' && tab.url) {
        // Envia uma mensagem para o content script para que ele reavalie a página.
        chrome.tabs.sendMessage(tabId, {
            command: 'navigationHappened'
        });
    }
});
