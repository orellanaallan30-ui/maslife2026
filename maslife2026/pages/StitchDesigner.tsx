import React, { useState, useRef } from 'react';
import { useClinic } from '../ClinicContext';

interface GeneratedDesign {
  imageUrl: string;
  htmlUrl: string;
  htmlContent: string;
  screenId: string;
  projectId: string;
}

const PRESET_PROMPTS = [
  { label: 'Página de inicio clínica', prompt: 'Modern healthcare clinic landing page with hero section, services list, team profiles and appointment booking button. Clean white design with teal accent colors.' },
  { label: 'Formulario de cita', prompt: 'Medical appointment booking form with patient name, date picker, specialty selector, contact info fields and confirmation button. Minimal and professional design.' },
  { label: 'Ficha de paciente', prompt: 'Patient profile card showing name, age, diagnosis, vitals, recent appointments and treatment history. Clean medical UI with status badges.' },
  { label: 'Dashboard de finanzas', prompt: 'Healthcare finances dashboard with monthly income chart, recent transactions list, total balance card and expense breakdown. Dark sidebar with white content area.' },
];

const StitchDesigner: React.FC = () => {
  const { loggedPro } = useClinic();
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [design, setDesign] = useState<GeneratedDesign | null>(null);
  const [previewMode, setPreviewMode] = useState<'image' | 'html'>('image');
  const [editPrompt, setEditPrompt] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const callStitch = async (body: Record<string, string>) => {
    const res = await fetch('/api/stitch-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Error desconocido');
    return data as GeneratedDesign;
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError('');
    try {
      const result = await callStitch({ prompt: prompt.trim(), action: 'generate' });
      setDesign(result);
      setEditPrompt('');
      setPreviewMode('image');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = async () => {
    if (!editPrompt.trim() || !design) return;
    setEditLoading(true);
    setError('');
    try {
      const result = await callStitch({
        prompt: editPrompt.trim(),
        action: 'edit',
        projectId: design.projectId,
        screenId: design.screenId,
      });
      setDesign(result);
      setEditPrompt('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setEditLoading(false);
    }
  };

  const handleVariant = async () => {
    if (!design) return;
    setEditLoading(true);
    setError('');
    try {
      const result = await callStitch({
        prompt: editPrompt.trim() || 'Generate an alternative style variation',
        action: 'variant',
        projectId: design.projectId,
        screenId: design.screenId,
      });
      setDesign(result);
      setEditPrompt('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setEditLoading(false);
    }
  };

  const handleCopyHtml = () => {
    if (!design?.htmlContent) return;
    navigator.clipboard.writeText(design.htmlContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const handlePreset = (p: string) => {
    setPrompt(p);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50">
      {/* Header */}
      <div className="shrink-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
          <span className="material-icons-round text-white text-xl">palette</span>
        </div>
        <div>
          <h1 className="text-lg font-black text-slate-900 tracking-tight">Google Stitch · Diseñador IA</h1>
          <p className="text-xs text-slate-500 font-medium">Genera interfaces de tu clínica con inteligencia artificial</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="px-2.5 py-1 bg-blue-50 text-blue-700 text-[10px] font-black uppercase tracking-wider rounded-full border border-blue-200">
            Google Labs
          </span>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left panel — prompt */}
        <div className="w-80 shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Preset prompts */}
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Plantillas rápidas</p>
              <div className="space-y-2">
                {PRESET_PROMPTS.map(p => (
                  <button
                    key={p.label}
                    onClick={() => handlePreset(p.prompt)}
                    className="w-full text-left px-3 py-2.5 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-all group text-xs"
                  >
                    <span className="font-bold text-slate-700 group-hover:text-blue-700 block">{p.label}</span>
                    <span className="text-slate-400 text-[10px] leading-snug line-clamp-2 mt-0.5">{p.prompt.substring(0, 60)}…</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Prompt textarea */}
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Tu descripción</p>
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder={`Describe la pantalla que quieres diseñar para la clínica de ${loggedPro?.name ?? 'tu clínica'}…`}
                rows={6}
                className="w-full px-3 py-3 rounded-xl border border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none text-sm text-slate-800 resize-none transition-all placeholder:text-slate-400"
              />
            </div>

            {error && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-xs text-rose-700 font-medium flex items-start gap-2">
                <span className="material-icons-round text-rose-500 text-sm shrink-0 mt-0.5">error</span>
                {error}
              </div>
            )}

            <button
              onClick={handleGenerate}
              disabled={loading || !prompt.trim()}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-sm font-black shadow-lg shadow-blue-200 hover:shadow-blue-300 hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:pointer-events-none transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="material-icons-round text-base animate-spin">sync</span>
                  Generando…
                </>
              ) : (
                <>
                  <span className="material-icons-round text-base">auto_awesome</span>
                  Generar Diseño
                </>
              )}
            </button>

            {/* Edit section */}
            {design && (
              <div className="border-t border-slate-100 pt-4 space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Refinar diseño</p>
                <textarea
                  value={editPrompt}
                  onChange={e => setEditPrompt(e.target.value)}
                  placeholder="Ej: cambia los colores a azul marino, agrega un menú de navegación…"
                  rows={4}
                  className="w-full px-3 py-3 rounded-xl border border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none text-sm text-slate-800 resize-none transition-all placeholder:text-slate-400"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleEdit}
                    disabled={editLoading || !editPrompt.trim()}
                    className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-black hover:bg-indigo-700 disabled:opacity-50 disabled:pointer-events-none transition-all flex items-center justify-center gap-1.5"
                  >
                    {editLoading ? <span className="material-icons-round text-sm animate-spin">sync</span> : <span className="material-icons-round text-sm">edit</span>}
                    Editar
                  </button>
                  <button
                    onClick={handleVariant}
                    disabled={editLoading}
                    className="flex-1 py-2.5 rounded-xl bg-slate-200 text-slate-700 text-xs font-black hover:bg-slate-300 disabled:opacity-50 disabled:pointer-events-none transition-all flex items-center justify-center gap-1.5"
                  >
                    {editLoading ? <span className="material-icons-round text-sm animate-spin">sync</span> : <span className="material-icons-round text-sm">shuffle</span>}
                    Variante
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Config note */}
          <div className="shrink-0 border-t border-slate-100 p-4 bg-slate-50">
            <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
              Requiere <code className="bg-slate-200 px-1 rounded font-mono">STITCH_API_KEY</code> en las variables de entorno de Vercel.
            </p>
          </div>
        </div>

        {/* Right panel — preview */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {design ? (
            <>
              {/* Preview toolbar */}
              <div className="shrink-0 bg-white border-b border-slate-200 px-5 py-3 flex items-center gap-3">
                <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                  <button
                    onClick={() => setPreviewMode('image')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${previewMode === 'image' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Vista previa
                  </button>
                  <button
                    onClick={() => setPreviewMode('html')}
                    disabled={!design.htmlContent}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-40 ${previewMode === 'html' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    HTML
                  </button>
                </div>

                <div className="flex items-center gap-2 ml-auto">
                  {design.htmlContent && (
                    <button
                      onClick={handleCopyHtml}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all"
                    >
                      <span className="material-icons-round text-sm">{copied ? 'check' : 'content_copy'}</span>
                      {copied ? 'Copiado' : 'Copiar HTML'}
                    </button>
                  )}
                  {design.htmlUrl && (
                    <a
                      href={design.htmlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-blue-600 hover:bg-blue-50 transition-all"
                    >
                      <span className="material-icons-round text-sm">open_in_new</span>
                      Abrir en Stitch
                    </a>
                  )}
                </div>
              </div>

              {/* Preview content */}
              <div className="flex-1 overflow-auto bg-slate-100 p-6 flex items-start justify-center">
                {previewMode === 'image' ? (
                  <img
                    src={design.imageUrl}
                    alt="Diseño generado por Stitch"
                    className="max-w-4xl w-full rounded-2xl shadow-2xl border border-white/50"
                  />
                ) : (
                  <div className="w-full max-w-4xl">
                    <div className="bg-slate-800 rounded-t-2xl px-4 py-2.5 flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-rose-400" />
                      <div className="w-3 h-3 rounded-full bg-amber-400" />
                      <div className="w-3 h-3 rounded-full bg-green-400" />
                      <span className="text-slate-400 text-xs font-mono ml-2">index.html</span>
                    </div>
                    <pre className="bg-slate-900 text-green-300 text-xs font-mono p-5 rounded-b-2xl overflow-x-auto max-h-[calc(100vh-280px)] leading-relaxed whitespace-pre-wrap break-all">
                      {design.htmlContent}
                    </pre>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Empty state */
            <div className="flex-1 flex flex-col items-center justify-center gap-6 p-10 text-center">
              <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center">
                <span className="material-icons-round text-5xl text-blue-400">brush</span>
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-700 mb-2">Diseña con IA</h2>
                <p className="text-sm text-slate-400 font-medium max-w-xs leading-relaxed">
                  Describe la pantalla que quieres y Google Stitch la generará en segundos. Usa las plantillas para empezar.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center max-w-sm">
                {PRESET_PROMPTS.map(p => (
                  <button
                    key={p.label}
                    onClick={() => handlePreset(p.prompt)}
                    className="px-3 py-2 bg-white border border-slate-200 rounded-full text-xs font-bold text-slate-600 hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50 transition-all"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StitchDesigner;
