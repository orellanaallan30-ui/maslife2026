// Helper para llamar a Claude API via serverless function
// Centraliza todas las llamadas IA del proyecto

export interface ClaudeRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: any }>;
  system?: string;
  tools?: any[];
  maxTokens?: number;
}

export async function callClaudeAPI(request: ClaudeRequest): Promise<any> {
  const endpoint = import.meta.env.VITE_AI_ENDPOINT || '/api/ai-agent';

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: request.messages,
      system: request.system || '',
      tools: request.tools || [],
    })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData?.error?.message || `Error ${response.status}`);
  }

  return response.json();
}

// Helper simplificado: envía un prompt y recibe texto
export async function askClaude(prompt: string, systemPrompt?: string): Promise<string> {
  try {
    const data = await callClaudeAPI({
      messages: [{ role: 'user', content: prompt }],
      system: systemPrompt || 'Eres un asistente médico profesional. Responde de forma concisa y precisa en español.',
    });

    const textBlocks = data.content?.filter((b: any) => b.type === 'text') || [];
    return textBlocks.map((b: any) => b.text).join('\n') || 'Sin respuesta.';
  } catch (error: any) {
    console.error('Claude API error:', error);
    throw error;
  }
}
