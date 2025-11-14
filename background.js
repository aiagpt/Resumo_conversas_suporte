const GEMINI_RETRY_TIMEOUT_MS = 20000; // 20 segundos de limite para o Gemini

// --- FUNÇÃO HELPER: Obter Configurações ---
// As configurações agora estão fixas (hardcoded) neste arquivo.
// Edite os valores abaixo antes de carregar a extensão.
async function getSettings() {
    try {
        // ========== CONFIGURE SUAS CHAVES E ENDPOINTS AQUI ==========
        const settings = {
            geminiApiKey: "token api do gemini",
            
            // --- ADICIONADO EVAGPT ---
            // (Preencha com os seus dados da Api-EvaGPT.html)
            
            // 1. Obtenha sua Chave (APENAS A CHAVE, sem "Bearer ") do painel EvaGPT
            // O código adicionará "Bearer " automaticamente.
            evaGptApiKey: "token do evaGPT", // Ex: "zpka_..."
            
            // 2. Obtenha o ID do Bot (Agente) que fará a anonimização
            evaGptBotId: "token agente do evaGPT", 
            
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
            evaGptApiKey: '',
            evaGptBotId: '',
            discordWebhookUrl: ''
        };
    }
}


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
                console.error('[Background] Erro final na API (Nuvem) após tempo limite:', error);
                sendResponse({ error: error.message });
            }
        })();
        
        return true; // Manter canal aberto
    }

    if (request.command === 'anonymizeConversation') {
        // === PADRÃO DE LISTENER ATUALIZADO PARA MAIOR ROBUSTEZ ===
        console.log('[Background] Recebido pedido para ANONIMIZAR (EvaGPT Nuvem):');
        
        getSettings().then(settings => {
            // Validação das novas settings
            if (!settings.evaGptApiKey || settings.evaGptApiKey.startsWith("COLE_") || settings.evaGptApiKey.startsWith("Bearer")) {
                throw new Error("Chave da API EvaGPT (evaGptApiKey) não configurada ou configurada incorretamente (não inclua 'Bearer ').");
            }
            if (!settings.evaGptBotId || settings.evaGptBotId === "COLE_O_ID_DO_BOT_AQUI") {
                throw new Error("ID do Bot EvaGPT (evaGptBotId) não configurado no background.js.");
            }

            // Se a validação passar, chama a função assíncrona
            return callEvaGPT_Anonymize(request.conversation, settings);
        })
        .then(anonymizedText => {
            // Sucesso da chamada
            console.log('[Background] Anonimização (EvaGPT) concluída.');
            sendResponse({ anonymizedText: anonymizedText });
        })
        .catch(error => {
            // Falha em qualquer ponto (validação ou API)
            console.error('[Background] Erro final na API (Anonimização EvaGPT):', error);
            sendResponse({ error: error.message });
        });

        return true; // Manter canal aberto para a resposta assíncrona
        // === FIM DA ATUALIZAÇÃO ===
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

    if (request.command === 'sendToDiscord') {
        console.log('[Background] Recebido pedido para enviar ao Discord.');

        (async () => {
            try {
                const settings = await getSettings();
                const webhookUrl = settings.discordWebhookUrl;
                
                if (!webhookUrl || webhookUrl === "COLE_SEU_WEBHOOK_DISCORD_AQUI") {
                    throw new Error('Webhook URL do Discord não configurado no background.js.');
                }

                const formData = new FormData();
                
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

                const contextBlob = new Blob([request.context], { type: 'text/plain' });
                formData.append('file1', contextBlob, 'contexto_conversa_toon.txt'); 

                const response = await fetch(webhookUrl, {
                    method: 'POST',
                    body: formData
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
});


// +++ INÍCIO: NOVA FUNÇÃO E PROMPT PARA EVAGPT +++

// Prompt atualizado para NÃO substituir nomes
const EVA_ANONYMIZE_PROMPT = `
Sua tarefa é anonimizar o texto que vou fornecer, substituindo APENAS os seguintes 6 tipos de dados:
1. Telefones (qualquer formato) -> [TELEFONE]
2. Emails -> [EMAIL]
3. CPFs -> [CPF]
4. CNPJs -> [CNPJ]
5. Senhas -> [SENHA]
6. Números de Cartão -> [CARTAO]

**REGRA MAIS IMPORTANTE:** Nomes de pessoas (ex: Janine, Pedro, Carlos, Arthur Ágape) NÃO SÃO DADOS SENSÍVEIS para esta tarefa. Você DEVE manter todos os nomes de pessoas e empresas exatamente como estão. NÃO os substitua por tags como [NOME] ou [CLIENTE].

Sua resposta deve ser APENAS o texto modificado, mantendo os nomes. Não adicione saudações ou explicações.

<Texto>
{{conversation}}
</Texto>
`;

/**
 * Chama a API EvaGPT para anonimizar o texto.
 * Esta função agora cria uma conversa, envia o prompt e retorna o texto limpo.
 */
async function callEvaGPT_Anonymize(conversation, settings) {
    
    // --- ETAPA 1: Criar a conversa (sem retry, deve ser rápido) ---
    const CREATE_URL = `https://api.evagpt.com.br/conversation/create/${settings.evaGptBotId}`;
    let newConversationId = null;
    
    try {
        const createResponse = await fetch(CREATE_URL, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                // === CORREÇÃO: Adiciona "Bearer " antes da chave ===
                'Authorization': `Bearer ${settings.evaGptApiKey}` 
            },
            body: JSON.stringify({ meta: { "purpose": "anonymization_task" } })
        });

        if (!createResponse.ok) {
            const errorBody = await createResponse.text();
            console.error('[Background] Erro EvaGPT (Create):', errorBody);
            // Tenta analisar o JSON para o log
            try {
                const errorJson = JSON.parse(errorBody);
                throw new Error(`Falha ao criar conversa EvaGPT (HTTP ${createResponse.status}): ${errorJson.detail || 'Erro desconhecido'}. Verifique o Bot ID e a API Key.`);
            } catch(e) {
                throw new Error(`Falha ao criar conversa EvaGPT (HTTP ${createResponse.status}). Resposta: ${errorBody}`);
            }
        }
        
        const createResult = await createResponse.json();
        newConversationId = createResult.id; 

        if (!newConversationId) {
            console.error("[Background] Resposta da EvaGPT (Create) não continha 'id'. Resposta:", createResult);
            throw new Error("API EvaGPT criou conversa mas não retornou ID.");
        }
        console.log('[Background] Conversa EvaGPT criada (ID:', newConversationId, ')');

    } catch (error) {
        console.error("[Background] Erro na ETAPA 1 (EvaGPT Create):", error);
        throw error; // Falha aqui, não continua
    }

    // --- ETAPA 2: Enviar o prompt (com retry, pode demorar) ---
    const COMPLETE_URL = `https://api.evagpt.com.br/conversation/complete/${newConversationId}`;
    const promptComConversa = EVA_ANONYMIZE_PROMPT.replace('{{conversation}}', conversation);
    const payload = { 
        text: promptComConversa
    };

    const startTime = Date.now();
    let lastError = null;
    let attempt = 1;

    while (Date.now() - startTime < GEMINI_RETRY_TIMEOUT_MS) {
        try {
            const response = await fetch(COMPLETE_URL, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    // === CORREÇÃO: Adiciona "Bearer " antes da chave ===
                    'Authorization': `Bearer ${settings.evaGptApiKey}` 
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorBody = await response.text();
                console.warn(`[Background] Resposta não-OK da API EvaGPT (Complete): ${response.status}`, errorBody);
                throw new Error(`Falha na API EvaGPT (HTTP ${response.status}).`);
            }

            const result = await response.json();
            
            const anonymizedText = result.sendMensages?.[0]?.text;

            if (anonymizedText) {
                return anonymizedText; // Sucesso
            } else {
                console.error("[Background] Resposta da EvaGPT não continha 'sendMensages[0].text'. Resposta:", result);
                throw new Error('Formato de resposta inesperado da API EvaGPT.');
            }

        } catch (error) {
            lastError = error;
            console.warn(`[Background] API (EvaGPT) falhou (tentativa ${attempt}). Causa: ${error.message}`);
            
            attempt++;
            const delay = Math.pow(2, attempt - 1) * 1000; 

            if (Date.now() - startTime + delay > GEMINI_RETRY_TIMEOUT_MS) {
                console.warn(`[Background] Tempo limite de ${GEMINI_RETRY_TIMEOUT_MS}ms atingido. A desistir.`);
                break; 
            }

            console.warn(`Tentando de novo em ${delay/1000}s...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    } // Fim do loop 'while'

    console.error(`[Background] Erro final na API (EvaGPT) após ${Date.now() - startTime}ms.`, lastError);
    throw lastError;
}
// +++ FIM: NOVA FUNÇÃO E PROMPT PARA EVAGPT +++


// --- MODIFICADO: Aceita 'settings' como argumento ---
async function callGeminiAPI(conversation, settings) {
    
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${settings.geminiApiKey}`;

    // === PROMPT ATUALIZADO PARA TOON E REMOVER HORA ===
    const prompt = `
Você é um assistente de IA analista de suporte, focado em alta fidelidade, extração de detalhes cronológicos e análise de qualidade.
Sua tarefa é processar os dados do chamado abaixo (em formato TOON) e gerar um registro estruturado e DETALhado em Português.

<DadosTOON>
${conversation}
</DadosTOON>

**Instruções de Leitura TOON:**
- A seção TICKET tem dados gerais (id, titulo, grupo, descricao).
- A seção CHAT é tabular. O padrão é: hora|autor|msg.
- A seção OBSERVACOES (se existir) contém notas do técnico.

Siga estes passos de raciocínio OBRIGATORIAMENTE antes de gerar a saída:
PASSO 1: (Análise do Problema) Descreva o problema em detalhe, usando o TICKET/descricao e as primeiras 'msg' do CHAT.
PASSO 2: (Análise do Andamento) Rastreie o CHAT cronologicamente (use a coluna 'hora' para a ordem). Crie uma lista numerada (1., 2., 3.) de CADA interação. Na lista final, inclua **APENAS o 'autor' e a 'msg'**. NÃO inclua a 'hora' (ex: '00:00') no texto do andamento.
PASSO 3: (Análise da Solução) Descreva a solution final com base nas últimas 'msg' do CHAT e nas OBSERVACOES (se existirem).
PASSO 4: (Análise de Status) Determine o status final baseado *estritamente* nesta lógica:
- Se o 'autor' cliente confirmar verbalmente que o problema foi resolvido (ex: 'Funcionou!', 'Obrigado, deu certo!', 'Agora foi!'), o status é 'Resolvido'.
- Para QUALQUER outro cenário (sem confirmação, cliente parou de responder, suporte encaminhou e aguarda), o status é 'Não Resolvido'.
- Adicione um parêntese com uma breve justificativa para a sua escolha de status.
PASSO 5: (Análise de Desempenho) Avalie objetivamente a atuação da equipe de suporte (autores que não são o cliente) com base no andamento (PASSO 2). Identifique 1 ou 2 pontos principais (positivos ou a melhorar).
PASSO 6: (Análise do Resumo Geral) Com base em todas as análises, crie um resumo executivo de 1-2 frases.

**REGRA DE FORMATAÇÃO MAIS IMPORTANTE DE TODAS:**
Sua resposta DEVE começar *exatamente* com o caractere da linha ''*Resumo Geral:*''.
É PROIBIDO gerar qualquer texto antes disso.
A resposta DEVE terminar *exatamente* após a linha ''*Análise de Desempenho:*''.
Formato de Saída Obrigatório:
'*Resumo Geral:*' [Resumo executivo de 1-2 frases do PASSO 6 em Português]
'*Andamento:*' [Lista numerada e detalhada dos eventos do PASSO 2 em Português]
'*Problema:*' [Descrição detalhada do problema do PASSO 1 em Português]
'*Solução:*' [Descrição detalhada da solution do PASSO 3 em Português]
'*Status Final:*' [Resolvido / Não Resolvido (com justificativa do PASSO 4)]
'*Análise de Desempenho:*' [Análise objetiva do PASSO 5 em Português]
    `;
    // === FIM DO PROMPT ATUALIZADO ===

    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        ]
    };

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

                // --- INÍCIO DA CORREÇÃO (HTTP 429) ---
                // Verifica se é um erro de Rate Limit (429) e se a API nos disse quanto tempo esperar
                if (response.status === 429) {
                    const retryAfter = response.headers.get('Retry-After');
                    if (retryAfter) {
                        const delaySeconds = parseInt(retryAfter, 10);
                        if (!isNaN(delaySeconds) && delaySeconds > 0) {
                            const delayMs = delaySeconds * 1000;
                            
                            // Verifica se esta espera específica ultrapassa o nosso tempo limite total
                            if (Date.now() - startTime + delayMs > GEMINI_RETRY_TIMEOUT_MS) {
                                throw new Error(`Falha na API (HTTP 429). Rate limit muito longo (pede ${delaySeconds}s).`);
                            }

                            console.warn(`[Background] Gemini API rate limit (429). Obedecendo header 'Retry-After'. Aguardando ${delaySeconds}s...`);
                            await new Promise(resolve => setTimeout(resolve, delayMs));
                            attempt++; // Incrementa a tentativa
                            continue; // Pula o backoff exponencial e tenta de novo
                        }
                    }
                }
                // --- FIM DA CORREÇÃO ---

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
            const delay = Math.pow(2, attempt - 1) * 1000; 

            if (Date.now() - startTime + delay > GEMINI_RETRY_TIMEOUT_MS) {
                console.warn(`[Background] Tempo limite de ${GEMINI_RETRY_TIMEOUT_MS}ms atingido. A desistir.`);
                break; 
            }

            console.warn(`Tentando de novo em ${delay/1000}s...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    } // Fim do loop 'while'
    
    console.error(`[Background] Erro final na API (Gemini) após ${Date.now() - startTime}ms.`, lastError);
    throw lastError;
}

// --- MODIFICADO: Aceita 'settings' como argumento ---
async function callGeminiToRefine(summary, instruction, conversationContext, settings) {

    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${settings.geminiApiKey}`;

    // === PROMPT ATUALIZADO PARA TOON E REMOVER HORA ===
    const prompt = `
Você é um editor de texto assistente. Sua tarefa é reescrever o <ResumoAtual> com base na <Instrucao> do usuário, usando o <ContextoTOON> como fonte de verdade.
IMPORTANTE: O resumo DEVE manter a sua estrutura original de 6 partes (ex: '*Resumo Geral:*', '*Andamento:*', etc.).
Sua tarefa é aplicar a <Instrucao> APENAS à seção relevante e retornar o TEXTO COMPLETO, incluindo as seções que não foram alteradas.

**Instruções de Leitura TOON (para o contexto):**
- A seção TICKET tem dados gerais (id, titulo, grupo, descricao).
- A seção CHAT é tabular. O padrão é: hora|autor|msg.
- A seção OBSERVACOES (se existir) contém notas do técnico.

**Regra de Formatação do Andamento:** Se você reescrever a seção '*Andamento:*', NÃO inclua a 'hora'. Liste apenas o 'autor' e a 'msg' (ex: "1. Janine Dalmann: [mensagem]").

Responda APENAS com o texto reescrito, sem preâmbulos, saudações ou "Aqui está o texto:".

<ContextoTOON>
${conversationContext}
</ContextoTOON>

<ResumoAtual>
${summary}
</ResumoAtual>

<Instrucao>
${instruction}
</Instrucao>
    `;
    // === FIM DO PROMPT ATUALIZADO ===

    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        ]
    };

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

                // --- INÍCIO DA CORREÇÃO (HTTP 429) ---
                if (response.status === 429) {
                    const retryAfter = response.headers.get('Retry-After');
                    if (retryAfter) {
                        const delaySeconds = parseInt(retryAfter, 10);
                        if (!isNaN(delaySeconds) && delaySeconds > 0) {
                            const delayMs = delaySeconds * 1000;
                            
                            if (Date.now() - startTime + delayMs > GEMINI_RETRY_TIMEOUT_MS) {
                                throw new Error(`Falha na API (HTTP 429). Rate limit muito longo (pede ${delaySeconds}s).`);
                            }

                            console.warn(`[Background] Gemini API rate limit (429) no Refinamento. Obedecendo header 'Retry-After'. Aguardando ${delaySeconds}s...`);
                            await new Promise(resolve => setTimeout(resolve, delayMs));
                            attempt++;
                            continue; 
                        }
                    }
                }
                // --- FIM DA CORREÇÃO ---

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
            const delay = Math.pow(2, attempt - 1) * 1000; 

            if (Date.now() - startTime + delay > GEMINI_RETRY_TIMEOUT_MS) {
                console.warn(`[Background] Tempo limite de ${GEMINI_RETRY_TIMEOUT_MS}ms atingido. A desistir.`);
                break; 
            }

            console.warn(`Tentando de novo em ${delay/1000}s...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    } // Fim do loop 'while'
    
    console.error(`[Background] Erro final na API (Refinamento) após ${Date.now() - startTime}ms.`, lastError);
    throw lastError;
}

// --- MODIFICADO: Aceita 'settings' como argumento ---
async function callGeminiForTicTacToe(board, history, settings) {
    
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${settings.geminiApiKey}`;

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