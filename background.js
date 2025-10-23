const API_KEY = "AIzaSyA8_mYaTnXtt92G1Vlv6FnCcp0hQQGyvtw";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${API_KEY}`;

// Observa mudanças na URL (navegação)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Verifica se o URL mudou e o carregamento está completo.
    if (changeInfo.status === 'complete' && tab.url && tab.url.includes('verdanadesk.com')) {
        // Envia uma mensagem para o content script para que ele reavalie a página.
        chrome.tabs.sendMessage(tabId, {
            command: 'navigationHappened'
        });
    }
});

// --- Lógica de Mensagens ---
// Ouve mensagens do content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    
    if (request.command === 'summarizeConversation') {
        console.log('[Background] Recebido pedido para resumir:', request.conversation);
        
        // Usamos .then() e .catch() para lidar com a promise
        callGeminiAPI(request.conversation)
            .then(summary => {
                console.log('[Background] Resumo recebido:', summary);
                sendResponse({ summary: summary }); // Envia a resposta de SUCESSO
            })
            .catch(error => {
                console.error('[Background] Erro na API:', error);
                sendResponse({ error: error.message }); // Envia a resposta de ERRO
            });
        
        // 'return true;' FICA AQUI, DENTRO do 'if'
        // Isso informa ao Chrome para manter o canal de mensagem aberto
        // para a resposta assíncrona.
        return true; 
    }
    
    // Se o comando não for 'summarizeConversation', o listener termina
    // e o 'return true' não é chamado, fechando o canal (o que é correto).
});


async function callGeminiAPI(conversation) {
    const prompt = `
        Você é um assistente de suporte técnico. Sua tarefa é resumir a seguinte interação
        entre um cliente e um técnico de suporte. O resumo deve ser conciso, em português,
        e focar no problema principal e na solução (se houver).
        Se for apenas um teste, mencione isso.

        Interação:
        ---
        ${conversation}
        ---
        
        Resumo:
    `;

    try {
        const payload = {
            contents: [{ parts: [{ text: prompt }] }],
            // Configurações de segurança (opcional, mas recomendado)
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
            ]
        };

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error('[Background] Erro na resposta da API:', response.status, errorBody);
            throw new Error(`Falha na API: ${response.status}. Verifique sua chave de API e o console do background.`);
        }

        const result = await response.json();
        const candidate = result.candidates?.[0];

        if (candidate && candidate.content?.parts?.[0]?.text) {
            // Verifica se a IA terminou de gerar (pode haver 'finishReason')
            if (candidate.finishReason === "STOP" || candidate.finishReason === "MAX_TOKENS") {
                return candidate.content.parts[0].text;
            } else {
                // A IA foi bloqueada por segurança
                console.warn('[Background] Resposta da IA bloqueada:', candidate.finishReason);
                return `O resumo não pôde ser gerado (Motivo: ${candidate.finishReason}).`;
            }
        } else {
            // Resposta inesperada
            console.warn('[Background] Resposta inesperada da API:', JSON.stringify(result, null, 2));
            throw new Error('Formato de resposta inesperado da API.');
        }

    } catch (error) {
        console.error('[Background] Erro ao chamar a API do Gemini:', error);
        throw error; // Repassa o erro para o listener
    }
}

