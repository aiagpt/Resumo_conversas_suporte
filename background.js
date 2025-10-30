const API_KEY = "AIzaSyBV2JMVddwSlM9TrxMmHCqvHAYIhTtxves";
// --- ALTERADO: Modelo da API Nuvem corrigido para gemini-1.5-flash ---
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${API_KEY}`;

// --- API do Ollama (Local) ---
const OLLAMA_URL = "http://10.3.129.30:11434/api/generate";
// --- ATUALIZAÇÃO: Revertido para o modelo mais seguro, pois o utilizador tem GPU ---
const OLLAMA_MODEL = "llama3:8b"; // ATENÇÃO: Revertido para 'llama3:8b' (era 'gemma:2b')

// --- NOVO: Constantes de Nova Tentativa ---
const MAX_RETRIES = 3;
const RETRYABLE_STATUSES = [500, 503, 504]; // Erros de servidor que valem a pena tentar de novo

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

    // Rota para a IA da Nuvem (Gemini) - Usada pelo "Não" e pelo "Passo 2"
    if (request.command === 'summarizeConversation') {
        console.log('[Background] Recebido pedido para resumir (Nuvem):');

        callGeminiAPI(request.conversation)
            .then(summary => {
                console.log('[Background] Resumo (Nuvem) recebido:', summary);
                sendResponse({ summary: summary }); // Envia a resposta de SUCESSO
            })
            .catch(error => {
                console.error('[Background] Erro final na API (Nuvem) após tentativas:', error);
                sendResponse({ error: error.message }); // Envia a resposta de ERRO
            });

        return true;
    }

    // --- ATUALIZADO: ROTA para Anonimização Local (Ollama) - Usada pelo "Sim" (Passo 1) ---
    if (request.command === 'anonymizeConversation') {
        console.log('[Background] Recebido pedido para ANONIMIZAR (Local via JSON):');

        startKeepAlive();

        // --- ATUALIZADO: Chama a nova função baseada em JSON ---
        callOllamaAPI_Anonymize_IdentifyJson(request.conversation)
            .then(anonymizedText => {
                console.log('[Background] Anonimização (Local via JSON) concluída.');
                sendResponse({ anonymizedText: anonymizedText });
            })
            .catch(error => {
                console.error('[Background] Erro final na API (Anonimização via JSON):', error);
                sendResponse({ error: error.message });
            })
            .finally(() => {
                stopKeepAlive();
            });

        return true; // Manter canal aberto para resposta assíncrona
    }

    // --- ATUALIZADO: ROTA para Refinamento com IA (Sempre Nuvem/Gemini) ---
    if (request.command === 'refineSummary') {
        console.log('[Background] Recebido pedido para refinar (Nuvem):', request.instruction);

        // Agora passamos o contexto da conversa para a função de refinamento
        callGeminiToRefine(request.summary, request.instruction, request.conversationContext)
            .then(refinedSummary => {
                console.log('[Background] Refinamento (Nuvem) recebido:', refinedSummary);
                sendResponse({ refinedSummary: refinedSummary });
            })
            .catch(error => {
                console.error('[Background] Erro final na API (Refinamento) após tentativas:', error);
                sendResponse({ error: error.message });
            });

        return true; // Manter canal aberto para resposta assíncrona
    }
    // --- FIM ROTA ---

    // --- NOVO: ROTA PARA O JOGO DA VELHA (EASTER EGG) ---
    if (request.command === 'getAIMove') {
        console.log('[Background] Recebido pedido de jogada (Jogo da Velha)');
        
        callGeminiForTicTacToe(request.board, request.history)
            .then(move => {
                console.log('[Background] IA escolheu a jogada:', move);
                sendResponse({ move: move });
            })
            .catch(error => {
                console.error('[Background] Erro na IA do Jogo da Velha:', error);
                sendResponse({ error: error.message });
            });
        
        return true; // Resposta assíncrona
    }
    // --- FIM ROTA JOGO ---
});


// --- ATUALIZADO: PROMPT DE ANONIMIZAÇÃO (JSON IDENTIFY) ---
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

// --- NOVA FUNÇÃO: Anonimização (IA Identifica JSON, Código Remove) ---
async function callOllamaAPI_Anonymize_IdentifyJson(conversation) {
    const prompt = ANONYMIZE_JSON_PROMPT.replace('{{conversation}}', conversation);

    const payload = {
        model: OLLAMA_MODEL, // Ex: 'llama3:8b'
        prompt: prompt,
        stream: false
    };

    let lastError = null;
    let modifiedConversation = conversation; // Começa com a original

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await fetch(OLLAMA_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                if (RETRYABLE_STATUSES.includes(response.status)) {
                    throw new Error(`Erro de servidor Ollama (HTTP ${response.status}).`);
                }
                // Tenta ler como JSON, se falhar, lê como texto
                let errorMsg = `status: ${response.status}`;
                try {
                    const errorBody = await response.json();
                    errorMsg = errorBody.error || errorMsg;
                } catch (e) {
                    // Ignora o erro de parse JSON e usa o status code
                }
                throw new Error(`Falha na API Ollama (Anonimizar/JSON): ${errorMsg}. Verifique se o modelo '${OLLAMA_MODEL}' está disponível.`);
            }

            const result = await response.json();

            if (!result.response) {
                throw new Error('Resposta inesperada do Ollama (Anonimização/JSON): campo "response" ausente.');
            }

            // --- Lógica de Análise e Substituição ---
            try {
                // --- INÍCIO DA CORREÇÃO: Extração Robusta do JSON ---
                const rawResponse = result.response;
                const jsonStart = rawResponse.indexOf('[');
                const jsonEnd = rawResponse.lastIndexOf(']');

                if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) {
                    // Se não encontrar os colchetes, ou se estiverem na ordem errada,
                    // pode ser que a IA tenha retornado um JSON vazio `[]` ou nada.
                    // Verificamos se a resposta é EXATAMENTE `[]`
                    if (rawResponse.trim() === '[]') {
                        console.log('[Background] IA não encontrou dados sensíveis (JSON vazio).');
                        return modifiedConversation; // Retorna a conversa original
                    }
                    // Se não for '[]' e não tiver os colchetes, é um erro.
                    console.error('[Background] Não foi possível encontrar um array JSON válido na resposta da IA:', rawResponse);
                    throw new Error('A resposta da IA não contém um array JSON válido.');
                }

                // Extrai a string que está entre o primeiro '[' e o último ']'
                const jsonString = rawResponse.substring(jsonStart, jsonEnd + 1);
                // --- FIM DA CORREÇÃO ---
                
                // Tenta fazer o parse do JSON extraído
                const sensitiveDataList = JSON.parse(jsonString);

                // Verifica se é um array
                if (!Array.isArray(sensitiveDataList)) {
                    throw new Error('A string extraída não é um array JSON.');
                }

                // Itera pela lista e substitui no texto ORIGINAL
                for (const item of sensitiveDataList) {
                    if (item && item.texto && item.tipo) {
                        // Usa replaceAll para substituir todas as ocorrências
                        // Escapa caracteres especiais no texto para a substituição funcionar corretamente
                        const escapedText = item.texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const regex = new RegExp(escapedText, 'g'); // Cria um RegExp global
                        modifiedConversation = modifiedConversation.replace(regex, `[${item.tipo.toUpperCase()}]`);
                    } else {
                        console.warn('[Background] Item JSON inválido recebido da IA:', item);
                        // Continua para o próximo item
                    }
                }

                console.log('[Background] Substituição baseada em JSON concluída.');
                return modifiedConversation; // SUCESSO

            } catch (parseError) {
                console.error('[Background] Erro ao analisar JSON da IA ou ao substituir texto:', parseError);
                console.error('[Background] Resposta recebida da IA:', result.response); // Loga a resposta crua para debug
                throw new Error(`Falha ao processar a lista JSON da IA: ${parseError.message}. Verifique o prompt e a resposta da IA.`);
            }
            // --- Fim da Lógica ---

        } catch (error) {
            lastError = error;
            console.warn(`[Background] API (Ollama/Anonimizar/JSON) falhou (tentativa ${attempt}/${MAX_RETRIES}). Causa: ${error.message}`);

            if (attempt === MAX_RETRIES) {
                if (error.message.includes('Failed to fetch')) {
                    throw new Error('Não foi possível conectar ao Ollama após 3 tentativas. Verifique se o servidor está em execução.');
                }
                break; // Sai do loop para jogar o último erro
            }
            // Não tenta de novo se for erro de parse JSON ou falha permanente da API
            if (error.message.includes('Falha na API Ollama') || error.message.includes('Falha ao processar a lista JSON') || error.message.includes('A resposta da IA não contém um array JSON válido')) {
                throw error; // Joga o erro permanente imediatamente
            }
            const delay = Math.pow(2, attempt) * 1000;
            console.warn(`Tentando de novo em ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw lastError; // Se todas as tentativas falharem
}


// --- FUNÇÃO da IA da Nuvem (GEMINI) para Resumo - Intacta ---
async function callGeminiAPI(conversation) {
    // O prompt é o mesmo de antes
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

    let lastError = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                if (RETRYABLE_STATUSES.includes(response.status)) {
                    throw new Error(`Erro de servidor Gemini (HTTP ${response.status}).`);
                }
                const errorBody = await response.text();
                console.error('[Background] Erro permanente na API Gemini:', response.status, errorBody);
                throw new Error(`Falha na API (HTTP ${response.status}). Verifique sua chave de API e o console.`);
            }

            const result = await response.json();
            const candidate = result.candidates?.[0];

            if (candidate && candidate.content?.parts?.[0]?.text) {
                if (candidate.finishReason === "STOP" || candidate.finishReason === "MAX_TOKENS") {
                    return candidate.content.parts[0].text; // *** SUCESSO, RETORNA AQUI ***
                } else {
                    throw new Error(`O resumo não pôde ser gerado (Motivo: ${candidate.finishReason}).`);
                }
            } else {
                throw new Error('Formato de resposta inesperado da API Gemini.');
            }

        } catch (error) {
            lastError = error;
            console.warn(`[Background] API (Gemini) falhou (tentativa ${attempt}/${MAX_RETRIES}). Causa: ${error.message}`);

            if (attempt === MAX_RETRIES) {
                break; // Sai do loop para jogar o erro
            }
            if (error.message.includes('Falha na API') || error.message.includes('Motivo:')) {
                 throw error; // Joga o erro permanente imediatamente
            }
            const delay = Math.pow(2, attempt) * 1000;
            console.warn(`Tentando de novo em ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw lastError;
}

// --- ATUALIZADO: FUNÇÃO de Refinamento com IA (Nuvem/Gemini) ---
async function callGeminiToRefine(summary, instruction, conversationContext) {

    // --- ATUALIZADO: NOVO PROMPT DE REFINAMENTO (Mais Robusto) ---
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
    // --- FIM DA ATUALIZAÇÃO ---

    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        ]
    };

    let lastError = null;

    // 3. Usa a mesma lógica de retry de callGeminiAPI
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                if (RETRYABLE_STATUSES.includes(response.status)) {
                    throw new Error(`Erro de servidor Gemini (HTTP ${response.status}).`);
                }
                const errorBody = await response.text();
                console.error('[Background] Erro permanente na API Gemini (Refinamento):', response.status, errorBody);
                throw new Error(`Falha na API (HTTP ${response.status}).`);
            }

            const result = await response.json();
            const candidate = result.candidates?.[0];

            if (candidate && candidate.content?.parts?.[0]?.text) {
                if (candidate.finishReason === "STOP" || candidate.finishReason === "MAX_TOKENS") {
                    return candidate.content.parts[0].text; // *** SUCESSO, RETORNA AQUI ***
                } else {
                    throw new Error(`O refinamento não pôde ser gerado (Motivo: ${candidate.finishReason}).`);
                }
            } else {
                throw new Error('Formato de resposta inesperado da API Gemini (Refinamento).');
            }

        } catch (error) {
            lastError = error;
            console.warn(`[Background] API (Refinamento) falhou (tentativa ${attempt}/${MAX_RETRIES}). Causa: ${error.message}`);

            if (attempt === MAX_RETRIES) {
                break;
            }
            if (error.message.includes('Falha na API') || error.message.includes('Motivo:')) {
                 throw error;
            }
            const delay = Math.pow(2, attempt) * 1000;
            console.warn(`Tentando de novo em ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw lastError;
}

// --- ATUALIZAÇÃO: FUNÇÃO PARA IA DO JOGO DA VELHA (COM PROMPT MELHORADO) ---
async function callGeminiForTicTacToe(board, history) {
    const availableMoves = board
        .map((cell, index) => (cell === '' ? index : null))
        .filter(index => index !== null);
    
    const boardString = board.map(cell => (cell === '' ? ' ' : cell)).join(',');

    // --- PROMPT MELHORADO (ESTILO MINIMAX) ---
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
    // --- FIM DO PROMPT MELHORADO ---

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

    // Não vamos usar a lógica de retry aqui, pois é só um jogo
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
                return jsonResponse.move; // SUCESSO
            } else {
                // Se a IA retornar uma jogada inválida, apenas escolhe a primeira disponível
                console.warn(`IA retornou jogada inválida (${jsonResponse.move}), usando fallback.`);
                return availableMoves[0];
            }
        } else {
            throw new Error('Resposta inesperada da IA do Jogo da Velha.');
        }

    } catch (error) {
        console.error('[Background] Erro na chamada da IA do Jogo da Velha:', error);
        // Fallback: se a API falhar, joga aleatoriamente
        return availableMoves[Math.floor(Math.random() * availableMoves.length)];
    }
}

