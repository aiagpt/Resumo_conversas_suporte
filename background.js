const API_KEY = "AIzaSyBV2JMVddwSlM9TrxMmHCqvHAYIhTtxves";
// --- ALTERADO: Modelo da API Nuvem atualizado ---
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${API_KEY}`;

// --- API do Ollama (Local) ---
const OLLAMA_URL = "http://10.3.129.109:11434/api/generate";
const OLLAMA_MODEL = "phi4-mini"; // O seu modelo local

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
    
    // --- NOVA ROTA para a IA Local (Ollama) ---
    if (request.command === 'summarizeConversationLocal') {
        console.log('[Background] Recebido pedido para resumir (Local):', request.conversation);
        
        callOllamaAPI(request.conversation)
            .then(summary => {
                console.log('[Background] Resumo (Local) recebido:', summary);
                sendResponse({ summary: summary });
            })
            .catch(error => {
                console.error('[Background] Erro na API (Local):', error);
                sendResponse({ error: error.message });
            });
            
        return true; // Manter canal aberto para resposta assíncrona
    }
});


// --- NOVA FUNÇÃO da IA Local (OLLAMA) ---
async function callOllamaAPI(conversation) {
    // Este é o prompt que validámos para o phi4-mini
    const prompt = `
Você é um Analista de Qualidade de Atendimento Sênior. Sua especialidade é decompor interações de suporte técnico para avaliar a eficiência do técnico, a clareza do cliente e o resultado final do chamado.
Sua tarefa é ler a transcrição completa de um chamado de suporte e gerar um relatório de análise estruturado em português.
Regras de Análise:
R-1 (Objetividade): O relatório deve ser estritamente fatual, baseado apenas no texto da interação. Não faça suposições sobre o que aconteceu fora do chamado.
R-2 (Diferenciação de Problema): Você deve identificar o "Problema Relatado" (o que o cliente disse que era o problema) e o "Problema Real" (a causa raiz técnica que o suporte identificou). Se forem iguais, apenas repita.
R-3 (Jornada do Atendimento): No resumo, detalhe a "jornada" da solução. Se o primeiro técnico não resolveu e houve escalonamento ou troca, isso deve ser mencionado.
R-4 (Sentimento do Cliente): Você deve inferir o sentimento do cliente ao longo do chamado (ex: Neutro, Satisfeito, Insatisfeito, Confuso) e justificar sua inferência.
R-5 (Status Final): O status deve ser preciso: "Resolvido" (com confirmação do cliente), "Fechado por Inatividade" (cliente parou de responder) ou "Não Resolvido".
Formato de Saída (Obrigatório):
Use exatamente este formato Markdown:
Markdown
### Relatório de Análise do Chamado: [ID_DO_CHAMADO]

**1. Problema Relatado:**
* [O que o cliente solicitou inicialmente.]

**2. Diagnóstico / Problema Real:**
* [Qual era a causa raiz do problema identificada pelo(s) técnico(s).]

**3. Resumo do Atendimento:**
* [Detalhar os passos. Ex: "O técnico A fez X. O cliente respondeu que não funcionou. O técnico B assumiu, identificou Y e aplicou a solução Z."]

**4. Status Final:**
* [Resolvido | Fechado por Inatividade | Não Resolvido]

**5. Análise de Sentimento do Cliente:**
* **Sentimento:** [Neutro | Satisfeito | Insatisfeito | Confuso]
* **Justificativa:** [Citar brevemente a fala ou ação do cliente que justifica esse sentimento. Ex: "Cliente reabriu o chamado informando 'O meu problema ainda não foi solucionado'."]

        Interação:
        ---
        ${conversation}
        ---
        
        Resumo:
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
            throw new Error(`Falha ao contactar o Ollama (status: ${response.status}). Verifique se o Ollama está em execução.`);
        }

        const result = await response.json();
        
        if (result.response) {
            return result.response; // O Ollama envia a resposta aqui
        } else {
            throw new Error('Resposta inesperada do Ollama.');
        }

    } catch (error) {
        console.error('[Background] Erro ao chamar a API do Ollama:', error);
        // Mensagem de erro específica se o Ollama não estiver a rodar
        if (error.message.includes('Failed to fetch')) {
             throw new Error('Não foi possível conectar ao Ollama. Verifique se o Ollama está em execução no seu computador.');
        }
        throw error;
    }
}


// --- FUNÇÃO da IA da Nuvem (GEMINI) - Intacta ---
async function callGeminiAPI(conversation) {
    const prompt = `
Você é um Analista de Qualidade de Atendimento Sênior. Sua especialidade é decompor interações de suporte técnico para avaliar a eficiência do técnico, a clareza do cliente e o resultado final do chamado.
Sua tarefa é ler a transcrição completa de um chamado de suporte e gerar um relatório de análise estruturado em português.
Regras de Análise:
R-1 (Objetividade): O relatório deve ser estritamente fatual, baseado apenas no texto da interação. Não faça suposições sobre o que aconteceu fora do chamado.
R-2 (Diferenciação de Problema): Você deve identificar o "Problema Relatado" (o que o cliente disse que era o problema) e o "Problema Real" (a causa raiz técnica que o suporte identificou). Se forem iguais, apenas repita.
R-3 (Jornada do Atendimento): No resumo, detalhe a "jornada" da solução. Se o primeiro técnico não resolveu e houve escalonamento ou troca, isso deve ser mencionado.
R-4 (Sentimento do Cliente): Você deve inferir o sentimento do cliente ao longo do chamado (ex: Neutro, Satisfeito, Insatisfeito, Confuso) e justificar sua inferência.
R-5 (Status Final): O status deve ser preciso: "Resolvido" (com confirmação do cliente), "Fechado por Inatividade" (cliente parou de responder) ou "Não Resolvido".
Formato de Saída (Obrigatório):
Use exatamente este formato Markdown:
Markdown
### Relatório de Análise do Chamado: [ID_DO_CHAMADO]

**1. Problema Relatado:**
* [O que o cliente solicitou inicialmente.]

**2. Diagnóstico / Problema Real:**
* [Qual era a causa raiz do problema identificada pelo(s) técnico(s).]

**3. Resumo do Atendimento:**
* [Detalhar os passos. Ex: "O técnico A fez X. O cliente respondeu que não funcionou. O técnico B assumiu, identificou Y e aplicou a solução Z."]

**4. Status Final:**
* [Resolvido | Fechado por Inatividade | Não Resolvido]

**5. Análise de Sentimento do Cliente:**
* **Sentimento:** [Neutro | Satisfeito | Insatisfeito | Confuso]
* **Justificativa:** [Citar brevemente a fala ou ação do cliente que justifica esse sentimento. Ex: "Cliente reabriu o chamado informando 'O meu problema ainda não foi solucionado'."]

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

