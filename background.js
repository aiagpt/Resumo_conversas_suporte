const API_KEY = "AIzaSyBV2JMVddwSlM9TrxMmHCqvHAYIhTtxves";
// --- ALTERADO: Modelo da API Nuvem atualizado ---
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${API_KEY}`;

// --- API do Ollama (Local) ---
const OLLAMA_URL = "http://10.3.129.108:11434/api/generate";
const OLLAMA_MODEL = "llama3:8b"; // O seu modelo local

// --- Lógica Keep-Alive (Sinal de Vida) ---
const KEEPALIVE_ALARM = 'ollama-keep-alive';
const KEEPALIVE_INTERVAL_MS = 20 * 1000; // 20 segundos

// Inicia (ou reinicia) o alarme
function startKeepAlive() {
    // Cria um alarme ÚNICO para disparar daqui a 20 segundos
    chrome.alarms.create(KEEPALIVE_ALARM, {
        when: Date.now() + KEEPALIVE_INTERVAL_MS
    });
    console.log("Keep-alive signal ENVIADO (próximo em 20s).");
}

// Para o alarme
function stopKeepAlive() {
    console.log("Limpando alarme keep-alive.");
    chrome.alarms.clear(KEEPALIVE_ALARM);
}

// Ouve o alarme
chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === KEEPALIVE_ALARM) {
        // O alarme disparou.
        console.log("Keep-alive signal RECEBIDO.");
        // Cria o PRÓXIMO alarme (reiniciando a cadeia)
        startKeepAlive();
    }
});
// --- FIM Lógica Keep-Alive ---


// Observa mudanças na URL (navegação)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
// ... (restante do código inalterado) ...
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
// ... (restante do código inalterado) ...
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
        
        return true; 
    }
    
    // --- ROTA ATUALIZADA para a IA Local (Ollama) ---
    if (request.command === 'summarizeConversationLocal') {
// ... (restante do código inalterado) ...
        console.log('[Background] Recebido pedido para resumir (Local):', request.conversation);
        
        // --- NOVO: Inicia a CADEIA de keep-alive ---
        startKeepAlive();
        
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
                // --- NOVO: Para a CADEIA de keep-alive ---
                stopKeepAlive();
            });
            
        return true; // Manter canal aberto para resposta assíncrona
    }
});


// --- NOVA FUNÇÃO da IA Local (OLLAMA) ---
async function callOllamaAPI(conversation) {
// ... (restante do código inalterado) ...
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
'*Solução:*' [Descrição detalhada da solução do PASSO 3 em Português]
'*Status Final:*' [Resolvido / Não Resolvido (com justificativa do PASSO 4)]
'*Análise de Desempenho:*' [Análise objetiva do PASSO 5 em Português]
    `;

    try {
        const payload = {
// ... (restante do código inalterado) ...
            model: OLLAMA_MODEL,
            prompt: prompt,
            stream: false // Queremos a resposta completa
        };

        const response = await fetch(OLLAMA_URL, {
// ... (restante do código inalterado) ...
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
// ... (restante do código inalterado) ...
            // Se o modelo não existir (404) ou outro erro
            const errorBody = await response.json();
            const errorMsg = errorBody.error || `status: ${response.status}`;
            throw new Error(`Falha na API Ollama: ${errorMsg}. Verifique se o modelo '${OLLAMA_MODEL}' está disponível no servidor.`);
        }

        const result = await response.json();
        
        if (result.response) {
// ... (restante do código inalterado) ...
            return result.response; // O Ollama envia a resposta aqui
        } else {
            throw new Error('Resposta inesperada do Ollama.');
        }

    } catch (error) {
// ... (restante do código inalterado) ...
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
// ... (restante do código inalterado) ...
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
'*Solução:*' [Descrição detalhada da solução do PASSO 3 em Português]
'*Status Final:*' [Resolvido / Não Resolvido (com justificativa do PASSO 4)]
'*Análise de Desempenho:*' [Análise objetiva do PASSO 5 em Português]
    `;
    

    try {
        const payload = {
// ... (restante do código inalterado) ...
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
// ... (restante do código inalterado) ...
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
// ... (restante do código inalterado) ...
            const errorBody = await response.text();
            console.error('[Background] Erro na resposta da API:', response.status, errorBody);
            throw new Error(`Falha na API: ${response.status}. Verifique sua chave de API e o console do background.`);
        }

        const result = await response.json();
// ... (restante do código inalterado) ...
        const candidate = result.candidates?.[0];

        if (candidate && candidate.content?.parts?.[0]?.text) {
// ... (restante do código inalterado) ...
            // Verifica se a IA terminou de gerar (pode haver 'finishReason')
            if (candidate.finishReason === "STOP" || candidate.finishReason === "MAX_TOKENS") {
                return candidate.content.parts[0].text;
            } else {
                // A IA foi bloqueada por segurança
                console.warn('[Background] Resposta da IA bloqueada:', candidate.finishReason);
                return `O resumo não pôde ser gerado (Motivo: ${candidate.finishReason}).`;
            }
        } else {
// ... (restante do código inalterado) ...
            // Resposta inesperada
            console.warn('[Background] Resposta inesperada da API:', JSON.stringify(result, null, 2));
            throw new Error('Formato de resposta inesperado da API.');
        }

    } catch (error) {
// ... (restante do código inalterado) ...
        console.error('[Background] Erro ao chamar a API do Gemini:', error);
        throw error; // Repassa o erro para o listener
    }
}

