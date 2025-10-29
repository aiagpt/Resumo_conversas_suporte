const API_KEY = "AIzaSyBV2JMVddwSlM9TrxMmHCqvHAYIhTtxves";
// --- ALTERADO: Modelo da API Nuvem corrigido para gemini-1.5-flash ---
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${API_KEY}`;

// --- API do Ollama (Local) ---
// ... (restante do código inalterado) ...
const OLLAMA_URL = "http://10.3.129.30:11434/api/generate";
const OLLAMA_MODEL = "llama3:8b"; // O seu modelo local

// --- NOVO: Constantes de Nova Tentativa ---
// ... (restante do código inalterado) ...
const MAX_RETRIES = 3;
const RETRYABLE_STATUSES = [500, 503, 504]; // Erros de servidor que valem a pena tentar de novo

// --- Lógica Keep-Alive (Sinal de Vida) ---
// ... (restante do código inalterado) ...
const KEEPALIVE_ALARM = 'ollama-keep-alive';
const KEEPALIVE_INTERVAL_MS = 20 * 1000; // 20 segundos

// Inicia (ou reinicia) o alarme
// ... (restante do código inalterado) ...
function startKeepAlive() {
    // Cria um alarme ÚNICO para disparar daqui a 20 segundos
    chrome.alarms.create(KEEPALIVE_ALARM, {
// ... (restante do código inalterado) ...
        when: Date.now() + KEEPALIVE_INTERVAL_MS
    });
    console.log("Keep-alive signal ENVIADO (próximo em 20s).");
}

// Para o alarme
// ... (restante do código inalterado) ...
function stopKeepAlive() {
    console.log("Limpando alarme keep-alive.");
    chrome.alarms.clear(KEEPALIVE_ALARM);
}

// Ouve o alarme
// ... (restante do código inalterado) ...
chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === KEEPALIVE_ALARM) {
        // O alarme disparou.
// ... (restante do código inalterado) ...
        console.log("Keep-alive signal RECEBIDO.");
        // Cria o PRÓXIMO alarme (reiniciando a cadeia)
        startKeepAlive();
    }
});
// --- FIM Lógica Keep-Alive ---


// Observa mudanças na URL (navegação)
// ... (restante do código inalterado) ...
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url.includes('verdanadesk.com')) {
        // Envia uma mensagem para o content script para que ele reavalie a página.
// ... (restante do código inalterado) ...
        chrome.tabs.sendMessage(tabId, {
            command: 'navigationHappened'
        });
    }
});

// --- Lógica de Mensagens ---
// ... (restante do código inalterado) ...
// Ouve mensagens do content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    
    // Rota para a IA da Nuvem (Gemini)
// ... (restante do código inalterado) ...
    if (request.command === 'summarizeConversation') {
        console.log('[Background] Recebido pedido para resumir (Nuvem):', request.conversation);
        
        // Usamos .then() e .catch() para lidar com a promise
// ... (restante do código inalterado) ...
        callGeminiAPI(request.conversation)
            .then(summary => {
                console.log('[Background] Resumo (Nuvem) recebido:', summary);
// ... (restante do código inalterado) ...
                sendResponse({ summary: summary }); // Envia a resposta de SUCESSO
            })
            .catch(error => {
                console.error('[Background] Erro final na API (Nuvem) após tentativas:', error);
// ... (restante do código inalterado) ...
                sendResponse({ error: error.message }); // Envia a resposta de ERRO
            });
        
        return true; 
// ... (restante do código inalterado) ...
    }
    
    // ROTA para a IA Local (Ollama)
// ... (restante do código inalterado) ...
    if (request.command === 'summarizeConversationLocal') {
        console.log('[Background] Recebido pedido para resumir (Local):', request.conversation);
        
        startKeepAlive();
// ... (restante do código inalterado) ...
        
        callOllamaAPI(request.conversation)
            .then(summary => {
                console.log('[Background] Resumo (Local) recebido:', summary);
// ... (restante do code inalterado) ...
                sendResponse({ summary: summary });
            })
            .catch(error => {
                console.error('[Background] Erro final na API (Local) após tentativas:', error);
// ... (restante do código inalterado) ...
                sendResponse({ error: error.message });
            })
            .finally(() => {
                stopKeepAlive();
// ... (restante do código inalterado) ...
            });
            
        return true; // Manter canal aberto para resposta assíncrona
    }
});


// --- FUNÇÃO da IA Local (OLLAMA) ATUALIZADA com retries ---
// ... (restante do código inalterado) ...
async function callOllamaAPI(conversation) {
    // O prompt é o mesmo de antes
    const prompt = `
Você é um assistente de IA analista de suporte, focado em alta fidelidade, extração de detalhes cronológicos e análise de qualidade.

Sua tarefa é processar a <Conversa> abaixo e gerar um registro estruturado e DETALhado em Português, incluindo uma análise de desempenho do suporte e um resumo geral.

<Conversa>
${conversation}
</Conversa>

Siga estes passos de raciocínio OBRIGATORIAMENTE antes de gerar a saída:

PASSO 1: (Análise do Problema) Descreva o problema em detalhe, explicando a queixa original do cliente e qualquer descoberta feita durante o diagnóstico.

PASSO 2: (Análise do Andamento) Rastreie a conversa inteira cronologicamente. Crie uma lista numerada (1., 2., 3.) de CADA interação ou evento principal. Seja detalhado, explicando o que cada pessoa relatou e o que o suporte fez em resposta.
- REGRA DE NOMES: Use os nomes das pessoas (ex: Janine Dalmann) para identificar quem está falando, mas OMITA e NÃO INCLUA qualquer informação sensível como números de telefone ou emails que possam estar ao lado do nome (ex: (5527999918661)).

PASSO 3: (Análise da Solução) Descreva a solução final ou a ação de encaminhamento de forma detalhada, explicando o que foi feito e qual o próximo passo (se houver).

PASSO 4: (Análise de Status) Determine o status final baseado *estritamente* nesta lógica:
- Se o cliente confirmar verbalmente que o problema foi resolvido (ex: 'Funcionou!', 'Obrigado, deu certo!', 'Agora foi!'), o status é 'Resolvido'.
- Para QUALQUER outro cenário (sem confirmação, cliente parou de responder, suporte encaminhou e aguarda), o status é 'Não Resolvido'.
- Adicione um parêntese com uma breve justificativa para a sua escolha de status.

PASSO 5: (Análise de Desempenho) Avalie objetivamente a atuação da equipe de suporte com base no andamento (PASSO 2). Identifique 1 ou 2 pontos principais. Seja neutro e baseado em fatos.
- Pontos a melhorar: O suporte demorou a responder? Fez perguntas desnecessárias? Não entendeu o problema? Esqueceu de dar retorno?
- Pontos positivos: Foi ágil? Fez as perguntas corretas para o diagnóstico? Foi claro na solução? Foi empático?

PASSO 6: (Análise do Resumo Geral) Com base em todas as análises anteriores (Problema, Solução, Status), crie um resumo executivo de 1-2 frases. Ele deve explicar a queixa principal, a ação principal e o resultado final.

**REGRA DE FORMATAÇÃO MAIS IMPORTANTE DE TODAS:**
Sua resposta DEVE começar *exatamente* com o caractere ''' da linha ''*Resumo Geral:*''.
É PROIBIDO gerar qualquer texto, título, ou preâmbulo (como 'A conversa foi processada com sucesso!') antes disso.
A resposta DEVE terminar *exatamente* após a linha ''*Análise de Desempenho:*''.

Formato de Saída Obrigatório:
'*Resumo Geral:*' [Resumo executivo de 1-2 frases do PASSO 6 em Português]
'*Andamento:*' [Lista numerada e detalhada dos eventos do PASSO 2 em Português, incluindo os nomes das pessoas, MAS SEM telefones ou emails]
'*Problema:*' [Descrição detalhada do problema do PASSO 1 em Português]
'*Solução:*' [Descrição detalhada da solution do PASSO 3 em Português]
'*Status Final:*' [Resolvido / Não Resolvido (com justificativa do PASSO 4)]
'*Análise de Desempenho:*' [Análise objetiva do PASSO 5 em Português]
    `;

    const payload = {
// ... (restante do código inalterado) ...
        model: OLLAMA_MODEL,
        prompt: prompt,
        stream: false
    };

    let lastError = null;

// ... (restante do código inalterado) ...
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await fetch(OLLAMA_URL, {
// ... (restante do código inalterado) ...
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
// ... (restante do código inalterado) ...
                // Se for um status que podemos tentar de novo (ex: 503, 500)
                if (RETRYABLE_STATUSES.includes(response.status)) {
                    throw new Error(`Erro de servidor Ollama (HTTP ${response.status}).`);
                }
                
                // Erro permanente (ex: 404 modelo não encontrado)
// ... (restante do código inalterado) ...
                const errorBody = await response.json();
                const errorMsg = errorBody.error || `status: ${response.status}`;
                throw new Error(`Falha na API Ollama: ${errorMsg}. Verifique se o modelo '${OLLAMA_MODEL}' está disponível.`);
            }

            const result = await response.json();
// ... (restante do código inalterado) ...
            
            if (result.response) {
                return result.response; // SUCESSO
// ... (restante do código inalterado) ...
            } else {
                throw new Error('Resposta inesperada do Ollama.');
            }

        } catch (error) {
// ... (restante do código inalterado) ...
            lastError = error;
            console.warn(`[Background] API (Ollama) falhou (tentativa ${attempt}/${MAX_RETRIES}). Causa: ${error.message}`);

            if (attempt === MAX_RETRIES) {
                if (error.message.includes('Failed to fetch')) {
// ... (restante do código inalterado) ...
                    throw new Error('Não foi possível conectar ao Ollama após 3 tentativas. Verifique se o servidor está em execução.');
                }
                break; // Sai do loop para jogar o último erro
            }

            // Se for um erro permanente (ex: 404), não tenta de novo
// ... (restante do código inalterado) ...
            if (error.message.includes('Falha na API Ollama')) {
                 throw error; // Joga o erro permanente imediatamente
            }

            // Espera exponencial (2s, 4s)
// ... (restante do código inalterado) ...
            const delay = Math.pow(2, attempt) * 1000;
            console.warn(`Tentando de novo em ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    // Se saímos do loop por falha, joga o último erro
// ... (restante do código inalterado) ...
    throw lastError;
}


// --- FUNÇÃO da IA da Nuvem (GEMINI) ATUALIZADA com retries ---
// ... (restante do código inalterado) ...
async function callGeminiAPI(conversation) {
    // O prompt é o mesmo de antes
    const prompt = `
Você é um assistente de IA analista de suporte, focado em alta fidelidade, extração de detalhes cronológicos e análise de qualidade.

Sua tarefa é processar a <Conversa> abaixo e gerar um registro estruturado e DETALhado em Português, incluindo uma análise de desempenho do suporte e um resumo geral.

<Conversa>
${conversation}
</Conversa>

Siga estes passos de raciocínio OBRIGATORIAMENTE antes de gerar a saída:

PASSO 1: (Análise do Problema) Descreva o problema em detalhe, explicando a queixa original do cliente e qualquer descoberta feita durante o diagnóstico.

PASSO 2: (Análise do Andamento) Rastreie a conversa inteira cronologicamente. Crie uma lista numerada (1., 2., 3.) de CADA interação ou evento principal. Seja detalhado, explicando o que cada pessoa relatou e o que o suporte fez em resposta.
- REGRA DE NOMES: Use os nomes das pessoas (ex: Janine Dalmann) para identificar quem está falando, mas OMITA e NÃO INCLUA qualquer informação sensível como números de telefone ou emails que possam estar ao lado do nome (ex: (5527999918661)).

PASSO 3: (Análise da Solução) Descreva a solução final ou a ação de encaminhamento de forma detalhada, explicando o que foi feito e qual o próximo passo (se houver).

PASSO 4: (Análise de Status) Determine o status final baseado *estritamente* nesta lógica:
- Se o cliente confirmar verbalmente que o problema foi resolvido (ex: 'Funcionou!', 'Obrigado, deu certo!', 'Agora foi!'), o status é 'Resolvido'.
- Para QUALQUER outro cenário (sem confirmação, cliente parou de responder, suporte encaminhou e aguarda), o status é 'Não Resolvido'.
- Adicione um parêntese com uma breve justificativa para a sua escolha de status.

PASSO 5: (Análise de Desempenho) Avalie objetivamente a atuação da equipe de suporte com base no andamento (PASSO 2). Identifique 1 ou 2 pontos principais. Seja neutro e baseado em fatos.
- Pontos a melhorar: O suporte demorou a responder? Fez perguntas desnecessárias? Não entendeu o problema? Esqueceu de dar retorno?
- Pontos positivos: Foi ágil? Fez as perguntas corretas para o diagnóstico? Foi claro na solução? Foi empático?

PASSO 6: (Análise do Resumo Geral) Com base em todas as análises anteriores (Problema, Solução, Status), crie um resumo executivo de 1-2 frases. Ele deve explicar a queixa principal, a ação principal e o resultado final.

**REGRA DE FORMATAÇÃO MAIS IMPORTANTE DE TODAS:**
Sua resposta DEVE começar *exatamente* com o caractere ''' da linha ''*Resumo Geral:*''.
É PROIBIDO gerar qualquer texto, título, ou preâmbulo (como 'A conversa foi processada com sucesso!') antes disso.
A resposta DEVE terminar *exatamente* após a linha ''*Análise de Desempenho:*''.

Formato de Saída Obrigatório:
'*Resumo Geral:*' [Resumo executivo de 1-2 frases do PASSO 6 em Português]
'*Andamento:*' [Lista numerada e detalhada dos eventos do PASSO 2 em Português, incluindo os nomes das pessoas, MAS SEM telefones ou emails]
'*Problema:*' [Descrição detalhada do problema do PASSO 1 em Português]
'*Solução:*' [Descrição detalhada da solution do PASSO 3 em Português]
'*Status Final:*' [Resolvido / Não Resolvido (com justificativa do PASSO 4)]
'*Análise de Desempenho:*' [Análise objetiva do PASSO 5 em Português]
    `;
    
    const payload = {
// ... (restante do código inalterado) ...
        contents: [{ parts: [{ text: prompt }] }],
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
// ... (restante do código inalterado) ...
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        ]
    };

    let lastError = null;

// ... (restante do código inalterado) ...
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await fetch(API_URL, {
// ... (restante do código inalterado) ...
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
// ... (restante do código inalterado) ...
                // Se for um status que podemos tentar de novo (503, 500, 504)
                if (RETRYABLE_STATUSES.includes(response.status)) {
                    throw new Error(`Erro de servidor Gemini (HTTP ${response.status}).`);
                }

                // Se for um erro do cliente (4xx), é permanente. Não adianta tentar de novo.
// ... (restante do código inalterado) ...
                const errorBody = await response.text();
                console.error('[Background] Erro permanente na API Gemini:', response.status, errorBody);
                throw new Error(`Falha na API (HTTP ${response.status}). Verifique sua chave de API e o console.`);
            }

            // Se response.ok, processa o sucesso.
// ... (restante do código inalterado) ...
            const result = await response.json();
            const candidate = result.candidates?.[0];

            if (candidate && candidate.content?.parts?.[0]?.text) {
// ... (restante do código inalterado) ...
                if (candidate.finishReason === "STOP" || candidate.finishReason === "MAX_TOKENS") {
                    return candidate.content.parts[0].text; // *** SUCESSO, RETORNA AQUI ***
                } else {
// ... (restante do código inalterado) ...
                    // A IA foi bloqueada por segurança
                    throw new Error(`O resumo não pôde ser gerado (Motivo: ${candidate.finishReason}).`);
                }
            } else {
// ... (restante do código inalterado) ...
                throw new Error('Formato de resposta inesperado da API Gemini.');
            }

        } catch (error) {
// ... (restante do código inalterado) ...
            lastError = error;
            console.warn(`[Background] API (Gemini) falhou (tentativa ${attempt}/${MAX_RETRIES}). Causa: ${error.message}`);
            
            if (attempt === MAX_RETRIES) {
// ... (restante do código inalterado) ...
                break; // Sai do loop para jogar o erro
            }

            // Se for um erro permanente (4xx ou bloqueio de segurança), não tenta de novo
// ... (restante do código inalterado) ...
            if (error.message.includes('Falha na API') || error.message.includes('Motivo:')) {
                 throw error; // Joga o erro permanente imediatamente
            }

            // Espera exponencial (2s, 4s) para erros de rede ou 5xx
// ... (restante do código inalterado) ...
            const delay = Math.pow(2, attempt) * 1000; 
            console.warn(`Tentando de novo em ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    // Se saímos do loop por falha, joga o último erro
// ... (restante do código inalterado) ...
    throw lastError;
}

