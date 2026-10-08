/**
 * HealthChatbot.tsx
 *
 * Floating AI health assistant powered by local Ollama LLM (Gemma 3 270M)
 * and Kolkata Health Data Engine via the FastAPI backend (/api/ai/chat and /api/ai/ollama/health).
 *
 * Safety & Architecture:
 *  - Communicates ONLY through FastAPI (no direct browser-to-Ollama connections)
 *  - Non-diagnostic clinical governance boundaries enforced
 *  - Visual Data Badges (📊 DATASET INSIGHT, 🩺 HEALTH EDUCATION, 📋 WORKFLOW GUIDANCE)
 *  - In-memory conversation state with context window management
 *  - Multilingual support (English, Hindi, Bengali)
 *  - Real-time Local AI status indicator
 *  - Resilient offline fallback
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X, MessageCircleHeart, Send, Loader2, AlertCircle, Bot, User, Cpu, Sparkles, Database, Copy, Check
} from 'lucide-react';
import { type Language } from '../i18n/translations';

interface Props {
  lang: Language;
  isOnline: boolean;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  provider?: string;
  model?: string;
  local?: boolean;
  badge?: string;
  source?: string;
}

interface OllamaStatus {
  status: 'connected' | 'offline' | 'checking';
  model: string;
  local: boolean;
  message?: string;
}

// ── Quick-prompt suggestion pills shown in empty state ────────────────────────
const QUICK_PROMPTS: Record<Language, string[]> = {
  en: [
    'Explain hypertension',
    'Explain hypertension in Bengali',
    'What is in the Kolkata dataset?',
    'What health indicators are available?',
    'Show malaria trends',
    'What does NFHS-5 contain?',
  ],
  hi: [
    'उच्च रक्तचाप को समझाइए',
    'कोलकाता डेटासेट में क्या है?',
    'कौन से स्वास्थ्य संकेतक उपलब्ध हैं?',
    'मलेरिया के रुझान (Trends) दिखाएं',
    'NFHS-5 में क्या आंकड़े हैं?',
  ],
  bn: [
    'উচ্চ রক্তচাপ সহজ বাংলায় বুঝিয়ে বলুন',
    'কলকাতা ডেটাসেটে কী কী তথ্য রয়েছে?',
    'কী কী স্বাস্থ্য নির্দেশক উপলব্ধ আছে?',
    'ম্যালেরিয়া সংক্রান্ত ট্রেন্ড দেখান',
    'NFHS-5 তথ্যে কী রয়েছে?',
  ],
};

const UI_STRINGS: Record<Language, {
  title: string;
  subtitle: string;
  placeholder: string;
  send: string;
  offline: string;
  thinking: string;
  emptyHint: string;
  disclaimer: string;
  localAiReady: string;
  localAiOffline: string;
  dataReady: string;
}> = {
  en: {
    title: 'RuralHealth AI Assistant',
    subtitle: 'Local Clinical & Kolkata Dataset Assistant',
    placeholder: 'Ask about health concepts, Kolkata dataset, or workflows...',
    send: 'Send',
    offline: 'Local AI is currently unavailable. You can continue using the other RuralHealth AI features.',
    thinking: 'Analyzing dataset & thinking...',
    emptyHint: 'Suggested Questions:',
    disclaimer: 'Assistive information only — not an autonomous diagnosis or prescription. Consult a PHC doctor.',
    localAiReady: 'Local AI Connected',
    localAiOffline: 'Local AI Offline',
    dataReady: 'Kolkata Data Ready',
  },
  hi: {
    title: 'रूरलहेल्थ AI सहायक',
    subtitle: 'लोकल क्लिनिकल एवं कोलकाता डेटा सहायक',
    placeholder: 'स्वास्थ्य अवधारणाओं, कोलकाता डेटासेट या प्रोटोकॉल के बारे में पूछें...',
    send: 'भेजें',
    offline: 'लोकल AI वर्तमान में अनुपलब्ध है। आप अन्य सुविधाओं का उपयोग जारी रख सकते हैं।',
    thinking: 'सोच रहा है...',
    emptyHint: 'सुझाए गए प्रश्न:',
    disclaimer: 'केवल सहायक जानकारी — कोई चिकित्सीय निदान या पर्चा नहीं। PHC डॉक्टर से परामर्श लें।',
    localAiReady: 'लोकल AI कनेक्टेड',
    localAiOffline: 'लोकल AI ऑफ़लाइन',
    dataReady: 'कोलकाता डेटा उपलब्ध',
  },
  bn: {
    title: 'রুরালহেলথ AI সহায়ক',
    subtitle: 'লোকাল ক্লিনিক্যাল ও কলকাতা ডেটা সহকারী',
    placeholder: 'স্বাস্থ্য ধারণা, কলকাতা ডেটাসেট বা নির্দেশিকা সম্পর্কে জানতে চান...',
    send: 'পাঠান',
    offline: 'লোকাল AI বর্তমানে অনুপলব্ধ। আপনি অন্যান্য বৈশিষ্ট্যগুলি ব্যবহার করতে পারেন।',
    thinking: 'ভাবছে...',
    emptyHint: 'প্রস্তাবিত প্রশ্নাবলী:',
    disclaimer: 'শুধুমাত্র সহায়ক তথ্য — কোনো ডাক্তারি রোগনির্ণয় বা প্রেসক্রিপশন নয়। চিকিৎসকের পরামর্শ নিন।',
    localAiReady: 'লোকাল AI সংযুক্ত',
    localAiOffline: 'লোকাল AI অফলাইন',
    dataReady: 'কলকাতা ডেটা সংযুক্ত',
  },
};

// ── Simple inline markdown renderer (bold + italic + bullets) ──────────────────
function renderMarkdown(text: string): React.ReactNode[] {
  return text.split('\n').map((line, i) => {
    // Header 3
    if (line.startsWith('### ')) {
      return (
        <div key={i} className="font-bold text-emerald-300 text-xs mt-2 mb-0.5">
          {line.slice(4)}
        </div>
      );
    }
    // Bold: **text**
    const parts = line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={j} className="font-bold text-white">{part.slice(2, -2)}</strong>;
      }
      // Italic: *text*
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
        return <em key={j} className="italic opacity-90 text-emerald-200">{part.slice(1, -1)}</em>;
      }
      return part;
    });

    // Bullet point
    if (line.startsWith('- ') || line.startsWith('• ') || line.startsWith('* ')) {
      return (
        <div key={i} className="flex items-start gap-2 ml-1 my-0.5">
          <span className="text-emerald-400 mt-0.5 shrink-0 text-xs">●</span>
          <span className="text-slate-200 text-xs leading-relaxed">{parts.map((p, j) => <React.Fragment key={j}>{p}</React.Fragment>)}</span>
        </div>
      );
    }
    // Empty line -> spacer
    if (!line.trim()) return <div key={i} className="h-1.5" />;

    return <div key={i} className="text-xs text-slate-200 leading-relaxed">{parts.map((p, j) => <React.Fragment key={j}>{p}</React.Fragment>)}</div>;
  });
}

export const HealthChatbot: React.FC<Props> = ({ lang }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus>({
    status: 'checking',
    model: 'gemma3:270m',
    local: true,
  });

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const ui = UI_STRINGS[lang] || UI_STRINGS.en;
  const quickPrompts = QUICK_PROMPTS[lang] || QUICK_PROMPTS.en;

  // Fetch Ollama health status from FastAPI backend
  const checkOllamaHealth = useCallback(async () => {
    try {
      let res: Response | null = null;
      try {
        res = await fetch('/api/ai/ollama/health', { signal: AbortSignal.timeout(3000) });
      } catch {
        res = await fetch('http://127.0.0.1:8000/api/ai/ollama/health', { signal: AbortSignal.timeout(3000) });
      }

      if (res && res.ok) {
        const data = await res.json();
        const isConn = data.status === 'connected' || data.available === true;
        setOllamaStatus({
          status: isConn ? 'connected' : 'offline',
          model: data.model || 'gemma3:270m',
          local: true,
          message: data.message,
        });
      } else {
        setOllamaStatus({
          status: 'offline',
          model: 'gemma3:270m',
          local: true,
        });
      }
    } catch {
      setOllamaStatus({
        status: 'offline',
        model: 'gemma3:270m',
        local: true,
      });
    }
  }, []);

  useEffect(() => {
    checkOllamaHealth();
  }, [checkOllamaHealth]);

  useEffect(() => {
    if (isOpen) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      inputRef.current?.focus();
    }
  }, [isOpen, messages, isLoading]);

  const sendMessage = async (text: string) => {
    const content = text.trim();
    if (!content || isLoading) return;

    setInput('');
    setError(null);

    const newMessages: Message[] = [...messages, { role: 'user', content }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const payload = {
        messages: newMessages.slice(-15).map(m => ({ role: m.role, content: m.content })),
        message: content,
        language: lang,
      };

      let res: Response | null = null;
      try {
        res = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch {
        res = await fetch('http://127.0.0.1:8000/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        throw new Error(ui.offline);
      }

      const data = await res.json();
      const replyContent = data.response || data.reply || 'No response generated.';

      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: replyContent,
          provider: data.provider || 'ollama',
          model: data.model || ollamaStatus.model,
          local: data.local ?? true,
          badge: data.badge,
          source: data.source,
        },
      ]);
    } catch (err: unknown) {
      console.error('AI chat error:', err);
      setError(ui.offline);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const copyText = (idx: number, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const displayModelName = ollamaStatus.model.includes('gemma') ? 'Gemma 3 270M' : ollamaStatus.model;

  return (
    <div className="fixed bottom-6 right-6 z-50 font-sans">
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="group relative flex items-center gap-2.5 bg-gradient-to-r from-[#102A56] to-[#0A9F68] text-white px-4 py-3.5 rounded-full shadow-2xl hover:shadow-emerald-500/25 hover:scale-105 active:scale-95 transition-all border border-white/20"
        >
          <div className="relative">
            <MessageCircleHeart className="w-5 h-5 text-emerald-300 group-hover:rotate-12 transition-transform" />
            <span
              className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-[#102A56] ${
                ollamaStatus.status === 'connected' ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
          </div>
          <span className="text-xs font-bold tracking-wide">
            {ui.title}
          </span>
          <span className="hidden sm:inline-flex items-center gap-1 text-[10px] bg-white/15 px-2 py-0.5 rounded-full font-mono text-emerald-200">
            <Cpu className="w-2.5 h-2.5" />
            {displayModelName}
          </span>
        </button>
      )}

      {isOpen && (
        <div className="w-[92vw] sm:w-[420px] h-[580px] max-h-[85vh] bg-[#0F172A] border border-slate-700/80 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-100 animate-in fade-in slide-in-from-bottom-4 duration-200">

          {/* Header */}
          <div className="bg-gradient-to-r from-[#102A56] via-[#1E293B] to-[#0A9F68] px-4 py-3.5 flex items-center justify-between border-b border-slate-700/60 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center border border-white/15 shadow-inner shrink-0">
                <MessageCircleHeart className="w-4 h-4 text-emerald-300" />
              </div>
              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-xs sm:text-sm text-white">{ui.title}</span>
                  {ollamaStatus.status === 'connected' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-semibold border border-emerald-500/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                      <span>● {ui.localAiReady}</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-medium border border-amber-500/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                      <span>● {ui.localAiOffline}</span>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-slate-300/80">
                  <span>{displayModelName}</span>
                  <span>•</span>
                  <span className="text-emerald-300 flex items-center gap-0.5">
                    <Database className="w-2.5 h-2.5" />
                    {ui.dataReady}
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Conversation Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#0B1120]">

            {/* Empty state with suggested prompts */}
            {messages.length === 0 && !isLoading && (
              <div className="space-y-3 py-2 animate-in fade-in duration-300">
                <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-3.5 text-center space-y-1.5">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto text-emerald-400">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <p className="text-xs font-semibold text-white">How can RuralHealth AI help?</p>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Health concepts • Kolkata dataset • Screening workflows • Multi-language
                  </p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">
                    {ui.emptyHint}
                  </p>
                  <div className="space-y-1.5">
                    {quickPrompts.map((prompt, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => sendMessage(prompt)}
                        className="w-full text-left text-xs text-slate-300 hover:text-white bg-slate-800/40 hover:bg-emerald-950/40 border border-slate-700/50 hover:border-emerald-500/40 rounded-xl p-2.5 transition-all text-ellipsis overflow-hidden whitespace-nowrap"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Message List */}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-2 items-start ${
                  msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto flex-row'
                } max-w-[90%]`}
              >
                <div
                  className={`w-6 h-6 rounded-lg shrink-0 flex items-center justify-center text-[10px] ${
                    msg.role === 'user'
                      ? 'bg-[#0A9F68] text-white'
                      : 'bg-[#102A56] text-emerald-300 border border-slate-700'
                  }`}
                >
                  {msg.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                </div>

                <div
                  className={`rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed space-y-1.5 ${
                    msg.role === 'user'
                      ? 'bg-[#0A9F68] text-white rounded-tr-xs'
                      : 'bg-[#1E293B] text-slate-100 border border-slate-700/60 rounded-tl-xs shadow-md'
                  }`}
                >
                  {msg.role === 'assistant' ? (
                    <>
                      {msg.badge && (
                        <div className="flex items-center gap-1.5 pb-1 border-b border-slate-700/50">
                          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-800/40">
                            {msg.badge}
                          </span>
                        </div>
                      )}
                      <div>{renderMarkdown(msg.content)}</div>
                      <div className="pt-1.5 mt-1 border-t border-slate-700/40 flex items-center justify-between text-[9px] text-slate-400">
                        <span>{msg.provider === 'kolkata-data-engine' ? '📊 Data Engine' : '⚡ Local AI'}</span>
                        <button
                          type="button"
                          onClick={() => copyText(i, msg.content)}
                          className="hover:text-slate-200 inline-flex items-center gap-1"
                        >
                          {copiedIdx === i ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}

            {/* Loading Spinner */}
            {isLoading && (
              <div className="flex gap-2 items-start mr-auto max-w-[85%]">
                <div className="w-6 h-6 rounded-lg bg-[#102A56] text-emerald-300 border border-slate-700 shrink-0 flex items-center justify-center">
                  <Bot className="w-3.5 h-3.5" />
                </div>
                <div className="bg-[#1E293B] border border-slate-700/60 rounded-2xl rounded-tl-xs px-3 py-2 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
                  <span className="text-xs text-slate-400">{ui.thinking}</span>
                </div>
              </div>
            )}

            {/* Error banner */}
            {error && (
              <div className="flex items-start gap-2 bg-rose-950/40 border border-rose-800/50 text-rose-300 rounded-xl p-2.5 text-xs">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Clinical Disclaimer strip */}
          <div className="px-3 py-1 bg-[#090D16] border-t border-slate-800 text-[10px] text-slate-500 text-center shrink-0">
            ⚕️ {ui.disclaimer}
          </div>

          {/* Input Box */}
          <div className="p-3 bg-[#0F172A] border-t border-slate-800 shrink-0">
            <div className="flex gap-2 items-end">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
                }}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                placeholder={ui.placeholder}
                className="flex-1 bg-slate-800/80 text-white placeholder-slate-400 text-xs px-3 py-2.5 rounded-xl border border-slate-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none resize-none transition-all disabled:opacity-50"
                style={{ minHeight: '38px', maxHeight: '100px' }}
              />
              <button
                type="button"
                disabled={!input.trim() || isLoading}
                onClick={() => sendMessage(input)}
                className="w-9 h-9 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition-all shrink-0 active:scale-95"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

        </div>
      )}
    </div>
  );
};

export default HealthChatbot;
