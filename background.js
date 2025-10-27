const API_KEY = "AIzaSyBV2JMVddwSlM9TrxMmHCqvHAYIhTtxves";
// --- ALTERADO: Modelo da API Nuvem atualizado ---
const API_URL = `https://generativethreelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${API_KEY}`;

// --- API do Ollama (Local) ---
const OLLAMA_URL = "http://10.3.129.109:11434/api/generate";
const OLLAMA_MODEL = "phi4"; // O seu modelo local

// --- NOVO: Lógica Keep-Alive (Sinal de Vida) ---
const KEEPALIVE_ALARM = 'ollama-keep-alive';

// Ouve o alarme
chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === KEEPALIVE_ALARM) {
        // Esta função de audição (mesmo vazia) é suficiente para 
        // reiniciar o temporizador de inatividade do service worker.
        console.log("Keep-alive signal received.");
    }
});
// --- FIM Lógica Keep-Alive ---


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
    
    // Rota para a IA da Nuvem (Gemini) - Intacta
    if (request.command === 'summarizeConversation') {
        console.log('[Background] Recebido pedido para resumir (Nuvem):', request.conversation);
        
        // Usamos .then() e .catch() para lidar com a promise
        callGeminiAPI(request.conversation)
            .then(summary => {
                console.log('[Background] Resumo (Nuvem) recebido:', summary);
                sendResponse({ summary: summary }); // Envia a resposta de SUCESSO
            })
            .catch(error => {
                console.error('[Background] Erro na API (Nuvem):', error);
                sendResponse({ error: error.message }); // Envia a resposta de ERRO
            });
        
        // 'return true;' FICA AQUI, DENTRO do 'if'
        // Isso informa ao Chrome para manter o canal de mensagem aberto
        // para a resposta assíncrona.
        return true; 
    }
    
    // --- ROTA ATUALIZADA para a IA Local (Ollama) ---
    if (request.command === 'summarizeConversationLocal') {
        console.log('[Background] Recebido pedido para resumir (Local):', request.conversation);
        
        // --- NOVO: Inicia o alarme keep-alive ---
        // Cria um alarme que dispara a cada 20 segundos (0.33 minutos)
        chrome.alarms.create(KEEPALIVE_ALARM, {
            periodInMinutes: 0.33 
        });
        
        callOllamaAPI(request.conversation)
            .then(summary => {
                console.log('[Background] Resumo (Local) recebido:', summary);
                sendResponse({ summary: summary });
            })
            .catch(error => {
                console.error('[Background] Erro na API (Local):', error);
                sendResponse({ error: error.message });
            })
            .finally(() => {
                // --- NOVO: Para o alarme keep-alive quando a chamada termina ---
                console.log("Limpando alarme keep-alive.");
                chrome.alarms.clear(KEEPALIVE_ALARM);
            });
            
        return true; // Manter canal aberto para resposta assíncrona
    }
});


// --- NOVA FUNÇÃO da IA Local (OLLAMA) ---
async function callOllamaAPI(conversation) {
    // Este é o prompt que validámos para o phi4-mini
    const prompt = `
Função: Você é um assistente de IA que resume conversas de suporte.

Tarefa: Analise a conversa abaixo. Gere um resumo focado no problema, no andamento e na solução.

Regras:

Seja claro e objetivo.

No campo "Andamento", resuma os principais passos do diagnóstico ou da interação.

Indique o status final obrigatório: "Resolvido" ou "Não Resolvido".

Segurança: NÃO inclua informações sensíveis (nomes, senhas, emails, CPFs, telefones).

Formato de Saída Obrigatório:

*Andamento:* [Resumo dos principais pontos da interação ou diagnóstico]
*Problema:* [Descrição concisa do problema do cliente]
*Solução:* [Descrição da ação final de suporte ou encaminhamento]
*Status Final:* [Resolvido / Não Resolvido]

 ${conversation}
    `;

    try {
        const payload = {
            model: OLLAMA_MODEL,
            prompt: prompt,
            stream: false // Queremos a resposta completa
        };

        const response = await fetch(OLLAMA_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            // Se o modelo não existir (404) ou outro erro
            const errorBody = await response.json();
            const errorMsg = errorBody.error || `status: ${response.status}`;
            throw new Error(`Falha na API Ollama: ${errorMsg}. Verifique se o modelo '${OLLAMA_MODEL}' está disponível no servidor.`);
        }

        const result = await response.json();
        
        if (result.response) {
            return result.response; // O Ollama envia a resposta aqui
        } else {
            throw new Error('Resposta inesperada do Ollama.');
        }

    } catch (error) {
        console.error('[Background] Erro ao chamar a API do Ollama:', error);
        
        if (error.message.includes('Failed to fetch')) {
             throw new Error('Não foi possível conectar ao Ollama. Verifique se o servidor Ollama está em execução.');
        }
        // Repassa a mensagem de erro (ex: modelo não encontrado)
        throw error; 
    }
}


// --- FUNÇÃO da IA da Nuvem (GEMINI) - Intacta ---
async function callGeminiAPI(conversation) {
    const prompt = `
Contexto: Você é um especialista em análise de interações de suporte ao cliente. Sua função é processar transcrições do WhatsApp e extrair as informações mais relevantes de forma segura e anônima.

Tarefa: Analise a transcrição da conversa fornecida abaixo. Crie um resumo executivo que seja claro e intuitivo. O resumo deve capturar:

O problema inicial do cliente.

O andamento da conversa (ex: passos de diagnóstico, tentativas de solução).

A solução ou encaminhamento final.

Restrições de Segurança (Críticas):

Anonimização Total: NÃO inclua, em hipótese alguma, informações sensíveis ou de identificação pessoal (nomes, senhas, CPFs, emails, telefones).

Formato de Saída Obrigatório:

*Andamento:* [Resumo dos principais pontos da interação ou diagnóstico]
*Problema:* [Descrição concisa do problema do cliente]
*Solução:* [Descrição da ação final de suporte ou encaminhamento]
*Status Final:* [Resolvido / Não Resolvido]
${conversation}
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

