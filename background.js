const API_KEY = "AIzaSyBV2JMVddwSlM9TrxMmHCqvHAYIhTtxves";
// --- ALTERADO: Modelo da API Nuvem corrigido para gemini-1.5-flash ---
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${API_KEY}`;

// --- API do Ollama (Local) ---
const OLLAMA_URL = "http://10.3.129.30:11434/api/generate";
const OLLAMA_MODEL = "llama3:8b"; // O seu modelo local

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
        console.log('[Background] Recebido pedido para ANONIMIZAR (Local):');
        
        startKeepAlive();
        
        callOllamaAPI_Anonymize(request.conversation)
            .then(anonymizedText => {
                console.log('[Background] Anonimização (Local) concluída.');
                sendResponse({ anonymizedText: anonymizedText });
            })
            .catch(error => {
                console.error('[Background] Erro final na API (Anonimização):', error);
                sendResponse({ error: error.message });
            })
            .finally(() => {
                stopKeepAlive();
            });
            
        return true; // Manter canal aberto para resposta assíncrona
    }

    // ROTA para Refinamento com IA (Sempre Nuvem/Gemini) - Intacta
    if (request.command === 'refineSummary') {
        console.log('[Background] Recebido pedido para refinar (Nuvem):', request.instruction);
        
        callGeminiToRefine(request.summary, request.instruction)
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
});


// --- NOVO: PROMPT DE ANONIMIZAÇÃO ---
const ANONYMIZE_PROMPT = `
Sua tarefa é processar o <Texto> abaixo e anonimizar TODOS os dados sensíveis.
Você DEVE substituir os dados sensíveis por tags genéricas (placeholders).
Responda APENAS com o texto anonimizado. Não adicione NENHUM preâmbulo, cabeçalho ou texto extra.

REGRAS DE SUBSTITUIÇÃO OBRIGATÓRIAS:
- Telefones (ex: (27) 99999-8888, 999998888, 5527999998888, 27999998888): Substitua por [TELEFONE]
- Emails (ex: nome@dominio.com): Substitua por [EMAIL]
- CPFs (ex: 123.456.789-10, 12345678910): Substitua por [CPF]
- CNPJs (ex: 12.345.678/0001-90, 12345678000190): Substitua por [CNPJ]
- Senhas (ex: 'minha senha é 123mudar', 'password: abc@123', 'senha: Mudar@123'): Substitua por [SENHA]
- Números de Cartão (ex: 4444 5555 6666 7777, 4444555566667777): Substitua por [CARTAO]

REGRAS DE PRESERVAÇÃO OBRIGATÓRIAS:
- MANTENHA nomes de pessoas (ex: Janine Dalmann, Pedro). NÃO OS REMOVA.
- NÃO remova números de protocolo, IDs de ticket, números de versão ou IPs (ex: 192.168.0.1).
- MANTENHA a formatação original, incluindo quebras de linha e estrutura.

<Texto>
{{conversation}}
</Texto>
`;

// --- NOVA FUNÇÃO: Anonimização com IA Local (OLLAMA) ---
async function callOllamaAPI_Anonymize(conversation) {
    const prompt = ANONYMIZE_PROMPT.replace('{{conversation}}', conversation);
    
    const payload = {
        model: OLLAMA_MODEL, // 'llama3:8b'
        prompt: prompt,
        stream: false
    };

    let lastError = null;

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
                const errorBody = await response.json();
                const errorMsg = errorBody.error || `status: ${response.status}`;
                throw new Error(`Falha na API Ollama (Anonimizar): ${errorMsg}. Verifique se o modelo '${OLLAMA_MODEL}' está disponível.`);
            }

            const result = await response.json();
            
            if (result.response) {
                return result.response; // SUCESSO
            } else {
                throw new Error('Resposta inesperada do Ollama (Anonimização).');
            }

        } catch (error) {
            lastError = error;
            console.warn(`[Background] API (Ollama/Anonimizar) falhou (tentativa ${attempt}/${MAX_RETRIES}). Causa: ${error.message}`);

            if (attempt === MAX_RETRIES) {
                if (error.message.includes('Failed to fetch')) {
                    throw new Error('Não foi possível conectar ao Ollama após 3 tentativas. Verifique se o servidor está em execução.');
                }
                break; // Sai do loop para jogar o último erro
            }
            if (error.message.includes('Falha na API Ollama')) {
                 throw error; // Joga o erro permanente imediatamente
            }
            const delay = Math.pow(2, attempt) * 1000;
            console.warn(`Tentando de novo em ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw lastError;
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
Sua resposta DEVE começar *exatamente* com o caractere ''' da linha ''*Resumo Geral:*''.
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

// --- FUNÇÃO de Refinamento com IA (Nuvem/Gemini) - Intacta ---
async function callGeminiToRefine(summary, instruction) {
    // 1. Cria um prompt específico para refinamento
    const prompt = `
Você é um editor de texto assistente. Sua tarefa é reescrever o <ResumoAtual> com base na <Instrução> do usuário.
Responda APENAS com o texto reescrito, sem preâmbulos, saudações ou "Aqui está o texto:".

<ResumoAtual>
${summary}
</ResumoAtual>

<Instrução>
${instruction}
</Instrução>
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

