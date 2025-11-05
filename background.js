const MAX_RETRIES = 3; // Mantido para a lógica do Ollama
const GEMINI_RETRY_TIMEOUT_MS = 20000; // NOVO: 10 segundos de limite para o Gemini

// --- FUNÇÃO HELPER: Obter Configurações ---
// As configurações agora estão fixas (hardcoded) neste arquivo.
// Edite os valores abaixo antes de carregar a extensão.
async function getSettings() {
    try {
        // ========== CONFIGURE SUAS CHAVES E ENDPOINTS AQUI ==========
        const settings = {
            geminiApiKey: "AIzaSyA8_mYaTnXtt92G1Vlv6FnCcp0hQQGyvtw",
            ollamaUrl: "http://127.0.0.1:11434",
            ollamaModel: "llama3:8b",
            discordWebhookUrl: "https://discord.com/api/webhooks/1434930524203516086/9gxvkwPSSAgna1lCLFxE9gMb3wZ8CGf053iMQ-fAqM3JrEWkYRCbNqJ8aly9bVNgSjnv"
        };
        // ==========================================================
        
        // A função agora retorna diretamente as configurações definidas acima.
        return settings;

    } catch (e) {
        console.error("Erro ao carregar configurações fixas:", e);
        // Retorna vazio em caso de erro inesperado (improvável)
        return {
            geminiApiKey: '',
            ollamaUrl: '',
            ollamaModel: '',
            discordWebhookUrl: ''
        };
    }
}


// --- Lógica Keep-Alive (Sinal de Vida) ---
const KEEPALIVE_ALARM = 'ollama-keep-alive';
const KEEPALIVE_INTERVAL_MS = 20 * 1000; // 20 segundos

function startKeepAlive() {
    chrome.alarms.create(KEEPALIVE_ALARM, {
        when: Date.now() + KEEPALIVE_INTERVAL_MS
    });
    console.log("Keep-alive signal ENVIADO (próximo em 20s).");
}

function stopKeepAlive() {
    console.log("Limpando alarme keep-alive.");
    chrome.alarms.clear(KEEPALIVE_ALARM);
}

chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === KEEPALIVE_ALARM) {
        console.log("Keep-alive signal RECEBIDO.");
        startKeepAlive();
    }
});
// --- FIM Lógica Keep-Alive ---


// Observa mudanças na URL (navegação)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url.includes('verdanadesk.com')) {
        chrome.tabs.sendMessage(tabId, {
            command: 'navigationHappened'
        });
    }
});

// --- Lógica de Mensagens ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    if (request.command === 'summarizeConversation') {
        console.log('[Background] Recebido pedido para resumir (Nuvem):');
        
        // Usar uma IIFE (Immediately Invoked Function Expression) assíncrona
        // para poder usar await dentro do listener síncrono
        (async () => {
            try {
                const settings = await getSettings();
                if (!settings.geminiApiKey || settings.geminiApiKey === "COLE_SUA_CHAVE_GEMINI_AQUI") {
                    throw new Error("Chave da API do Gemini não configurada no background.js.");
                }

                const summary = await callGeminiAPI(request.conversation, settings);
                console.log('[Background] Resumo (Nuvem) recebido:', summary);
                sendResponse({ summary: summary });
            } catch (error) {
                // O erro final (após o tempo limite) é capturado aqui
                console.error('[Background] Erro final na API (Nuvem) após tempo limite:', error);
                sendResponse({ error: error.message });
            }
        })();
        
        return true; // Manter canal aberto
    }

    if (request.command === 'anonymizeConversation') {
        console.log('[Background] Recebido pedido para ANONIMIZAR (Local via JSON):');
        
        (async () => {
            try {
                const settings = await getSettings();
                startKeepAlive();
                const anonymizedText = await callOllamaAPI_Anonymize_IdentifyJson(request.conversation, settings);
                console.log('[Background] Anonimização (Local via JSON) concluída.');
                sendResponse({ anonymizedText: anonymizedText });
            } catch (error) {
                console.error('[Background] Erro final na API (Anonimização via JSON):', error);
                sendResponse({ error: error.message });
            } finally {
                stopKeepAlive();
            }
        })();

        return true;
    }

    if (request.command === 'refineSummary') {
        console.log('[Background] Recebido pedido para refinar (Nuvem):', request.instruction);

        (async () => {
            try {
                const settings = await getSettings();
                 if (!settings.geminiApiKey || settings.geminiApiKey === "COLE_SUA_CHAVE_GEMINI_AQUI") {
                    throw new Error("Chave da API do Gemini não configurada no background.js.");
                }
                const refinedSummary = await callGeminiToRefine(request.summary, request.instruction, request.conversationContext, settings);
                console.log('[Background] Refinamento (Nuvem) recebido:', refinedSummary);
                sendResponse({ refinedSummary: refinedSummary });
            } catch (error) {
                // O erro final (após o tempo limite) é capturado aqui
                console.error('[Background] Erro final na API (Refinamento) após tempo limite:', error);
                sendResponse({ error: error.message });
            }
        })();
        
        return true;
    }
    
    if (request.command === 'getAIMove') {
        console.log('[Background] Recebido pedido de jogada (Jogo da Velha)');
        
         (async () => {
            try {
                const settings = await getSettings();
                 if (!settings.geminiApiKey || settings.geminiApiKey === "COLE_SUA_CHAVE_GEMINI_AQUI") {
                    throw new Error("Chave da API do Gemini não configurada no background.js.");
                }
                const move = await callGeminiForTicTacToe(request.board, request.history, settings);
                console.log('[Background] IA escolheu a jogada:', move);
                sendResponse({ move: move });
            } catch (error) {
                console.error('[Background] Erro na IA do Jogo da Velha:', error);
                sendResponse({ error: error.message });
            }
        })();
        
        return true;
    }

    // --- NOVO: ROTA PARA ENVIAR AO DISCORD ---
    if (request.command === 'sendToDiscord') {
        console.log('[Background] Recebido pedido para enviar ao Discord.');

        (async () => {
            try {
                const settings = await getSettings();
                const webhookUrl = settings.discordWebhookUrl;
                
                if (!webhookUrl || webhookUrl === "COLE_SEU_WEBHOOK_DISCORD_AQUI") {
                    throw new Error('Webhook URL do Discord não configurado no background.js.');
                }

                // 2. Prepara o payload como FormData
                const formData = new FormData();
                
                // O relatório vai no 'payload_json' como um "embed"
                // Limita a descrição a 4096 caracteres (limite do Discord)
                const reportSnippet = request.report.length > 4000 ? 
                                      request.report.substring(0, 4000) + "\n... (relatório truncado)" : 
                                      request.report;

                formData.append('payload_json', JSON.stringify({
                    embeds: [{
                        title: "Relatório de Suporte Gerado",
                        description: reportSnippet,
                        color: 5763719, // Cor verde
                        footer: {
                            text: `Gerado em: ${new Date().toLocaleString('pt-BR')}`
                        }
                    }]
                }));

                // O contexto da conversa vai como um arquivo de texto
                const contextBlob = new Blob([request.context], { type: 'text/plain' });
                formData.append('file1', contextBlob, 'contexto_conversa.txt');

                // 3. Envia o POST para o Discord
                // Esta chamada não tem lógica de retry, mas pode ser adicionada se necessário
                const response = await fetch(webhookUrl, {
                    method: 'POST',
                    body: formData // fetch define o Content-Type 'multipart/form-data' automaticamente
                });

                if (response.ok) {
                    console.log('[Background] Dados enviados para o Discord com sucesso.');
                    sendResponse({ success: true });
                } else {
                    const errorText = await response.text();
                    console.error('[Background] Falha ao enviar para o Discord:', response.status, errorText);
                    throw new Error(`Falha no Webhook (HTTP ${response.status}). Verifique o URL.`);
                }
            } catch (error) {
                console.error('[Background] Erro ao enviar para o Discord:', error);
                sendResponse({ error: error.message });
            }
        })();

        return true; // Manter canal aberto
    }
    // --- FIM ROTA DISCORD ---
});


const ANONYMIZE_JSON_PROMPT = `
Sua tarefa é analisar o <Texto> abaixo e IDENTIFICAR todos os dados sensíveis.
Você NÃO DEVE modificar o texto.
Sua resposta deve ser APENAS um array JSON válido. Nada antes, nada depois.
O array JSON deve conter um objeto para CADA dado sensível encontrado.
Cada objeto no array deve ter DUAS chaves:
1.  "texto": Contendo a string EXATA do dado sensível encontrado no texto.
2.  "tipo": Contendo a tag correspondente (em MAIÚSCULAS) para aquele tipo de dado.

Tipos de dados sensíveis e suas tags:
- Telefones (ex: (27) 99999-8888, 999998888, etc.): Use a tag "TELEFONE"
- Emails (ex: nome@dominio.com): Use a tag "EMAIL"
- CPFs (ex: 123.456.789-10, 12345678910): Use a tag "CPF"
- CNPJs (ex: 12.345.678/0001-90, etc.): Use a tag "CNPJ"
- Senhas (qualquer coisa que pareça uma senha): Use a tag "SENHA"
- Números de Cartão (ex: 4444 5555 6666 7777, etc.): Use a tag "CARTAO"

O que NÃO é sensível (NÃO inclua no JSON):
- Nomes de pessoas (ex: Janine Dalmann, Pedro)
- Datas e horas (ex: 2025-10-29, 14:30)
- Números de protocolo, IDs de ticket, IPs, versões.

Exemplo de Resposta JSON Válida:
[
  {"texto": "(27) 99999-8888", "tipo": "TELEFONE"},
  {"texto": "123.456.789-10", "tipo": "CPF"},
  {"texto": "minha senha é 123mudar", "tipo": "SENHA"}
]

Se NENHUM dado sensível for encontrado, retorne um array JSON vazio: []

<Texto>
{{conversation}}
</Texto>
`;

// --- MODIFICADO: Aceita 'settings' como argumento ---
async function callOllamaAPI_Anonymize_IdentifyJson(conversation, settings) {
    const prompt = ANONYMIZE_JSON_PROMPT.replace('{{conversation}}', conversation);
    
    const OLLAMA_URL = settings.ollamaUrl + "/api/generate"; // Adiciona /api/generate
    const OLLAMA_MODEL = settings.ollamaModel;
    
    // A lista de status "tentáveis" do Ollama permanece a mesma
    const OLLAMA_RETRYABLE_STATUSES = [500, 503, 504];

    const payload = {
        model: OLLAMA_MODEL,
        prompt: prompt,
        stream: false
    };

    let lastError = null;
    let modifiedConversation = conversation;

    // A lógica do Ollama permanece com MAX_RETRIES, pois é uma chamada local
    // e não queremos ficar 10 segundos à espera de uma falha local.
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await fetch(OLLAMA_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                if (OLLAMA_RETRYABLE_STATUSES.includes(response.status)) {
                    throw new Error(`Erro de servidor Ollama (HTTP ${response.status}).`);
                }
                let errorMsg = `status: ${response.status}`;
                try {
                    const errorBody = await response.json();
                    errorMsg = errorBody.error || errorMsg;
                } catch (e) {}
                // Erro permanente (ex: 404, 400) - não tenta de novo
                throw new Error(`Falha na API Ollama (Anonimizar/JSON): ${errorMsg}. Verifique se o modelo '${OLLAMA_MODEL}' está disponível em ${settings.ollamaUrl}.`);
            }

            const result = await response.json();

            if (!result.response) {
                throw new Error('Resposta inesperada do Ollama (Anonimização/JSON): campo "response" ausente.');
            }

            try {
                const rawResponse = result.response;
                const jsonStart = rawResponse.indexOf('[');
                const jsonEnd = rawResponse.lastIndexOf(']');

                if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) {
                    if (rawResponse.trim() === '[]') {
                        console.log('[Background] IA não encontrou dados sensíveis (JSON vazio).');
                        return modifiedConversation;
                    }
                    console.error('[Background] Não foi possível encontrar um array JSON válido na resposta da IA:', rawResponse);
                    throw new Error('A resposta da IA não contém um array JSON válido.');
                }

                const jsonString = rawResponse.substring(jsonStart, jsonEnd + 1);
                const sensitiveDataList = JSON.parse(jsonString);

                if (!Array.isArray(sensitiveDataList)) {
                    throw new Error('A string extraída não é um array JSON.');
                }

                for (const item of sensitiveDataList) {
                    if (item && item.texto && item.tipo) {
                        const escapedText = item.texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const regex = new RegExp(escapedText, 'g');
                        modifiedConversation = modifiedConversation.replace(regex, `[${item.tipo.toUpperCase()}]`);
                    } else {
                        console.warn('[Background] Item JSON inválido recebido da IA:', item);
                    }
                }

                console.log('[Background] Substituição baseada em JSON concluída.');
                return modifiedConversation; // Sucesso

            } catch (parseError) {
                console.error('[Background] Erro ao analisar JSON da IA ou ao substituir texto:', parseError);
                console.error('[Background] Resposta recebida da IA:', result.response);
                // Erro de lógica/parse - não tenta de novo
                throw new Error(`Falha ao processar a lista JSON da IA: ${parseError.message}. Verifique o prompt e a resposta da IA.`);
            }

        } catch (error) {
            lastError = error;
            console.warn(`[Background] API (Ollama/Anonimizar/JSON) falhou (tentativa ${attempt}/${MAX_RETRIES}). Causa: ${error.message}`);

            if (attempt === MAX_RETRIES) {
                if (error.message.includes('Failed to fetch')) {
                    throw new Error(`Não foi possível conectar ao Ollama em ${settings.ollamaUrl} após 3 tentativas.`);
                }
                break; // Sai do loop se for a última tentativa
            }
            
            // Se for um erro permanente (lançado acima), não tenta de novo
            if (error.message.includes('Falha na API Ollama') || error.message.includes('Falha ao processar a lista JSON') || error.message.includes('A resposta da IA não contém um array JSON válido')) {
                throw error;
            }
            
            // Se for um erro de servidor (5xx) ou 'Failed to fetch' (no catch), tenta de novo
            const delay = Math.pow(2, attempt) * 1000;
            console.warn(`Tentando de novo em ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    // Se saiu do loop, lança o último erro
    throw lastError;
}


// --- MODIFICADO: Aceita 'settings' como argumento ---
async function callGeminiAPI(conversation, settings) {
    
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${settings.geminiApiKey}`;

    const prompt = `
Você é um assistente de IA analista de suporte, focado em alta fidelidade, extração de detalhes cronológicos e análise de qualidade.
Sua tarefa é processar a <Conversa> abaixo e gerar um registro estruturado e DETALhado em Português, incluindo uma análise de desempenho do suporte e um resumo geral.
Se a conversa contiver tags de anonimização (ex: [EMAIL], [CPF]), use-as no resumo.
<Conversa>
${conversation}
</Conversa>
Siga estes passos de raciocínio OBRIGATORIAMENTE antes de gerar a saída:
PASSO 1: (Análise do Problema) Descreva o problema em detalhe, explicando a queixa original do cliente e qualquer descoberta feita during o diagnóstico.
PASSO 2: (Análise do Andamento) Rastreie a conversa inteira cronologicamente. Crie uma lista numerada (1., 2., 3.) de CADA interação ou evento principal. Seja detalhado, explicando o que cada pessoa relatou e o que o suporte fez em resposta.
- REGRA DE NOMES: Use os nomes das pessoas (ex: Janine Dalmann) para identificar quem está falando.
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
Sua resposta DEVE começar *exatamente* com o caractere da linha ''*Resumo Geral:*''.
É PROIBIDO gerar qualquer texto, título, ou preâmbulo (como 'A conversa foi processada com sucesso!') antes disso.
A resposta DEVE terminar *exatamente* após a linha ''*Análise de Desempenho:*''.
Formato de Saída Obrigatório:
'*Resumo Geral:*' [Resumo executivo de 1-2 frases do PASSO 6 em Português]
'*Andamento:*' [Lista numerada e detalhada dos eventos do PASSO 2 em Português, incluindo os nomes das pessoas]
'*Problema:*' [Descrição detalhada do problema do PASSO 1 em Português]
'*Solução:*' [Descrição detalhada da solution do PASSO 3 em Português]
'*Status Final:*' [Resolvido / Não Resolvido (com justificativa do PASSO 4)]
'*Análise de Desempenho:*' [Análise objetiva do PASSO 5 em Português]
    `;

    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        ]
    };

    // --- MUDANÇA: Lógica de 'for' trocada por 'while' baseado em tempo ---
    const startTime = Date.now();
    let lastError = null;
    let attempt = 1;

    while (Date.now() - startTime < GEMINI_RETRY_TIMEOUT_MS) {
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorBody = await response.text();
                console.warn(`[Background] Resposta não-OK da API Gemini: ${response.status}`, errorBody);
                throw new Error(`Falha na API (HTTP ${response.status}).`);
            }

            const result = await response.json();
            const candidate = result.candidates?.[0];

            if (candidate && candidate.content?.parts?.[0]?.text) {
                if (candidate.finishReason === "STOP" || candidate.finishReason === "MAX_TOKENS") {
                    return candidate.content.parts[0].text; // Sucesso
                } else {
                    throw new Error(`O resumo não pôde ser gerado (Motivo: ${candidate.finishReason}).`);
                }
            } else {
                throw new Error('Formato de resposta inesperado da API Gemini.');
            }

        } catch (error) {
            lastError = error;
            console.warn(`[Background] API (Gemini) falhou (tentativa ${attempt}). Causa: ${error.message}`);
            
            attempt++;
            // Usa (attempt - 1) para o delay: 1s, 2s, 4s, 8s...
            const delay = Math.pow(2, attempt - 1) * 1000; 

            // Verifica se a próxima espera vai ultrapassar o tempo limite
            if (Date.now() - startTime + delay > GEMINI_RETRY_TIMEOUT_MS) {
                console.warn(`[Background] Tempo limite de ${GEMINI_RETRY_TIMEOUT_MS}ms atingido. A desistir.`);
                break; // Sai do loop 'while'
            }

            console.warn(`Tentando de novo em ${delay/1000}s...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    } // Fim do loop 'while'

    // Se saiu do loop (porque o tempo acabou), lança o último erro
    console.error(`[Background] Erro final na API (Gemini) após ${Date.now() - startTime}ms.`, lastError);
    throw lastError;
}

// --- MODIFICADO: Aceita 'settings' como argumento ---
async function callGeminiToRefine(summary, instruction, conversationContext, settings) {

    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${settings.geminiApiKey}`;

    const prompt = `
Você é um editor de texto assistente. Sua tarefa é reescrever o <ResumoAtual> com base na <Instrucao> do usuário, usando a <ConversaAnonimizada> como fonte de verdade.
IMPORTANTE: O resumo DEVE manter a sua estrutura original de 6 partes, cada uma com seu cabeçalho (ex: '*Resumo Geral:*', '*Andamento:*', etc.).
Sua tarefa é aplicar a <Instrucao> APENAS à seção relevante e retornar o TEXTO COMPLETO, incluindo as seções que não foram alteradas.
EXEMPLO:
Se <ResumoAtual> for:
'*Resumo Geral:*' Resumo antigo.
'*Andamento:*' 1. A. 2. B. 3. C.
... (outras seções) ...
E a <Instrucao> for: "deixe o andamento mais curto"
Sua resposta DEVE ser:
'*Resumo Geral:*' Resumo antigo.
'*Andamento:*' 1. Resumo do andamento.
... (outras seções) ...
NUNCA retorne apenas a parte que você alterou. Retorne o resumo completo e estruturado.
Responda APENAS com o texto reescrito, sem preâmbulos, saudações ou "Aqui está o texto:".
<ConversaAnonimizada>
${conversationContext}
</ConversaAnonimizada>
<ResumoAtual>
${summary}
</ResumoAtual>
<Instrucao>
${instruction}
</Instrucao>
    `;

    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        ]
    };

    // --- MUDANÇA: Lógica de 'for' trocada por 'while' baseado em tempo ---
    const startTime = Date.now();
    let lastError = null;
    let attempt = 1;

    while (Date.now() - startTime < GEMINI_RETRY_TIMEOUT_MS) {
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorBody = await response.text();
                console.warn(`[Background] Resposta não-OK da API Gemini (Refinamento): ${response.status}`, errorBody);
                throw new Error(`Falha na API (HTTP ${response.status}).`);
            }

            const result = await response.json();
            const candidate = result.candidates?.[0];

            if (candidate && candidate.content?.parts?.[0]?.text) {
                if (candidate.finishReason === "STOP" || candidate.finishReason === "MAX_TOKENS") {
                    return candidate.content.parts[0].text; // Sucesso
                } else {
                    throw new Error(`O refinamento não pôde ser gerado (Motivo: ${candidate.finishReason}).`);
                }
            } else {
                throw new Error('Formato de resposta inesperado da API Gemini (Refinamento).');
            }

        } catch (error) {
            lastError = error;
            console.warn(`[Background] API (Refinamento) falhou (tentativa ${attempt}). Causa: ${error.message}`);
            
            attempt++;
            // Usa (attempt - 1) para o delay: 1s, 2s, 4s, 8s...
            const delay = Math.pow(2, attempt - 1) * 1000; 

            // Verifica se a próxima espera vai ultrapassar o tempo limite
            if (Date.now() - startTime + delay > GEMINI_RETRY_TIMEOUT_MS) {
                console.warn(`[Background] Tempo limite de ${GEMINI_RETRY_TIMEOUT_MS}ms atingido. A desistir.`);
                break; // Sai do loop 'while'
            }

            console.warn(`Tentando de novo em ${delay/1000}s...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    } // Fim do loop 'while'
    
    // Se saiu do loop (porque o tempo acabou), lança o último erro
    console.error(`[Background] Erro final na API (Refinamento) após ${Date.now() - startTime}ms.`, lastError);
    throw lastError;
}

// --- MODIFICADO: Aceita 'settings' como argumento ---
async function callGeminiForTicTacToe(board, history, settings) {
    // A lógica desta função (Jogo da Velha) permanece a mesma.
    // Ela não usa um loop de retry, mas sim um "fallback"
    // (escolher uma jogada aleatória), o que é aceitável para o jogo.
    
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${settings.geminiApiKey}`;

    const availableMoves = board
        .map((cell, index) => (cell === '' ? index : null))
        .filter(index => index !== null);
    
    const boardString = board.map(cell => (cell === '' ? ' ' : cell)).join(',');

    const prompt = `
Você é um jogador perfeito e invencível de Jogo da Velha (Tic-Tac-Toe), baseado no algoritmo Minimax.
Você joga como 'O'. O humano joga como 'X'.
O tabuleiro atual é (células 0-8): [${boardString}]
As jogadas ainda disponíveis (posições vazias) são: [${availableMoves.join(', ')}]
O histórico de jogadas é: ${JSON.stringify(history)}
Você DEVE seguir esta ordem de prioridade para escolher sua jogada:
1.  **VENCER:** Se você ('O') pode completar 3 em linha nesta jogada, ESCOLHA ESSA JOGADA.
2.  **BLOQUEAR:** Se o humano ('X') pode completar 3 em linha na próxima jogada, BLOQUEIE ESSA JOGADA.
3.  **CRIAR GARFO (FORK):** Tente jogar numa posição que crie duas ameaças de vitória para 'O' simultaneamente.
4.  **BLOQUEAR GARFO:** Se o humano ('X') está a tentar criar um garfo, jogue na posição que o impede.
5.  **JOGADA ESTRATÉGICA (se nada acima for possível):**
    a. Jogue no centro (célula 4), se disponível.
    b. Jogue num canto oposto ao do humano (ex: se 'X' está em 0, jogue em 8).
    c. Jogue em qualquer canto vazio (0, 2, 6, 8).
    d. Jogue em qualquer lateral vazia (1, 3, 5, 7).
Analise o tabuleiro [${boardString}] e escolha o NÚMERO da melhor jogada possível a partir da lista [${availableMoves.join(', ')}].
`;

    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    "move": { 
                        "type": "NUMBER",
                        "description": "O número da célula (0-8) para a jogada."
                    }
                },
                required: ["move"]
            }
        },
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        ]
    };

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            throw new Error(`Falha na API (HTTP ${response.status}).`);
        }

        const result = await response.json();
        const candidate = result.candidates?.[0];

        if (candidate && candidate.content?.parts?.[0]?.text) {
            const jsonResponse = JSON.parse(candidate.content.parts[0].text);
            if (typeof jsonResponse.move === 'number' && availableMoves.includes(jsonResponse.move)) {
                return jsonResponse.move;
            } else {
                console.warn(`IA retornou jogada inválida (${jsonResponse.move}), usando fallback.`);
                return availableMoves[0];
            }
        } else {
            throw new Error('Resposta inesperada da IA do Jogo da Velha.');
        }

    } catch (error) {
        console.error('[Background] Erro na chamada da IA do Jogo da Velha:', error);
        // Fallback: retorna uma jogada aleatória se a API falhar
        return availableMoves[Math.floor(Math.random() * availableMoves.length)];
    }
}

