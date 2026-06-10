// Helper para llamar a Claude API via serverless function
// Centraliza todas las llamadas IA del proyecto

import { supabase } from '../supabaseClient';

export interface ClaudeRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: any }>;
  system?: string;
  tools?: any[];
  maxTokens?: number;
}

export async function callClaudeAPI(request: ClaudeRequest): Promise<any> {
  const endpoint = import.meta.env.VITE_AI_ENDPOINT || '/api/ai-agent';

  // Incluir token de sesión para que el endpoint valide al profesional
  const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      messages: request.messages,
      system: request.system || '',
      tools: request.tools || [],
      max_tokens: request.maxTokens,
    })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData?.error?.message || `Error ${response.status}`);
  }

  return response.json();
}

// Envía imágenes (base64 dataURL o URL pública de Storage) + texto a Claude Vision
export async function askClaudeWithImages(
  images: string[],
  textPrompt: string,
  systemPrompt?: string
): Promise<string> {
  const imageBlocks = images.map(img => {
    if (img.startsWith('http')) {
      return { type: 'image', source: { type: 'url', url: img } };
    }
    const [meta, data] = img.split(',');
    const mediaType = (meta.match(/data:(image\/[\w+]+);/) || [])[1] || 'image/jpeg';
    return { type: 'image', source: { type: 'base64', media_type: mediaType, data } };
  });

  const content: any[] = [...imageBlocks, { type: 'text', text: textPrompt }];

  try {
    const result = await callClaudeAPI({
      messages: [{ role: 'user', content }],
      system: systemPrompt || 'Eres un experto en biomecánica y fisioterapia avanzada.',
      maxTokens: 2048,
    });
    const textBlocks = result.content?.filter((b: any) => b.type === 'text') || [];
    return textBlocks.map((b: any) => b.text).join('\n') || 'Sin respuesta.';
  } catch (error: any) {
    console.error('Claude Vision error:', error);
    throw error;
  }
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
