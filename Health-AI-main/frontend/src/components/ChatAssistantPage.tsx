/**
 * ChatAssistantPage.tsx
 *
 * Full-page Data-Aware Chat Assistant view for RuralHealth AI.
 * Powered by local Ollama LLM (Gemma 3 270M) and the Kolkata Health Data Engine (HMIS + NFHS-5).
 *
 * Safety & Architecture:
 *  - Communicates exclusively through FastAPI backend (/api/ai/chat, /api/ai/data/*)
 *  - Visual Data Badges (📊 DATASET INSIGHT, 🩺 HEALTH EDUCATION, 📋 WORKFLOW GUIDANCE, 🛡️ CLINICAL SAFETY BOUNDARY)
 *  - Source Transparency indicators
 *  - Actionable response cards: Copy, Regenerate, Feedback, Raw Data toggle
 *  - Real-time status indicator (● Local AI Connected • Gemma 3 270M | 📊 Kolkata Health Data Available)
 *  - Multilingual support: English, Hindi (हिंदी), and Bengali (বাংলা)
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  MessageCircleHeart, Send, Loader2, AlertCircle, Bot, User,
  Cpu, Sparkles, Trash2, RefreshCw, ShieldCheck, Database,
  Copy, Check, ThumbsUp, ThumbsDown, Table as TableIcon
} from 'lucide-react';
import { type Language } from '../i18n/translations';

interface ChatAssistantPageProps {
  lang: Language;
  isOnline: boolean;
}

interface DataPoint {
  year: string;
  value: number;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  provider?: string;
  model?: string;
  local?: boolean;
  badge?: string;
  source?: string;
  data_points?: DataPoint[];
  feedback?: 'up' | 'down';
}

interface OllamaStatus {
  status: 'connected' | 'offline' | 'checking';
  model: string;
  local: boolean;
  message?: string;
}

const QUICK_PROMPTS: Record<Language, string[]> = {
  en: [
    'Explain hypertension',
    'Explain hypertension in Bengali',
    'What is in the Kolkata dataset?',
    'What health indicators are available?',
    'Show malaria trends',
    'What does NFHS-5 contain?',
    'Compare hypertension indicators',
  ],
  hi: [
    'उच्च रक्तचाप को समझाइए',
    'कोलकाता डेटासेट में क्या है?',
    'कौन से स्वास्थ्य संकेतक उपलब्ध हैं?',
    'मलेरिया के रुझान (Trends) दिखाएं',
    'NFHS-5 में क्या आंकड़े हैं?',
    'उच्च रक्तचाप संकेतकों की तुलना करें',
    'स्क्रीनिंग के दौरान क्या जांचना चाहिए?',
  ],
  bn: [
    'উচ্চ রক্তচাপ সহজ বাংলায় বুঝিয়ে বলুন',
    'কলকাতা ডেটাসেটে কী কী তথ্য রয়েছে?',
    'কী কী স্বাস্থ্য নির্দেশক উপলব্ধ আছে?',
    'ম্যালেরিয়া সংক্রান্ত ট্রেন্ড দেখান',
    'NFHS-5 তথ্যে কী রয়েছে?',
    'উচ্চ রক্তচাপের বছরভিত্তিক তুলনা করুন',
    'স্ক্রিনিং করার সময় আশা কর্মীর কী করণীয়?',
  ],
};

const UI_STRINGS: Record<Language, {
  title: string;
  subtitle: string;
  placeholder: string;
  send: string;
  clear: string;
  offline: string;
  thinking: string;
  emptyTitle: string;
  emptySubtitle: string;
  emptyHint: string;
  disclaimer: string;
  localAiReady: string;
  localAiOffline: string;
  dataAvailable: string;
  viewData: string;
  copied: string;
}> = {
  en: {
    title: 'RuralHealth AI Chat Assistant',
    subtitle: 'Local Clinical Knowledge & Kolkata Health Intelligence Assistant',
    placeholder: 'Ask about health concepts, Kolkata dataset, trends, or workflows...',
    send: 'Send',
    clear: 'Clear Chat',
    offline: 'Local AI is currently unavailable. Check that Ollama is running and Gemma 3 270M is installed.',
    thinking: 'Analyzing dataset & generating answer...',
    emptyTitle: 'How can RuralHealth AI help you today?',
    emptySubtitle: 'Health education • Screening workflow • Kolkata dataset intelligence • Multilingual guidance',
    emptyHint: 'Suggested Questions:',
    disclaimer: 'RuralHealth AI Guidance: Assistive information only — not an autonomous diagnosis or prescription. Always consult a PHC doctor.',
    localAiReady: 'Local AI Connected',
    localAiOffline: 'Local AI Offline',
    dataAvailable: 'Kolkata Health Data Available',
    viewData: 'View Data Points',
    copied: 'Copied to clipboard',
  },
  hi: {
    title: 'रूरलहेल्थ AI चैट सहायक',
    subtitle: 'लोकल क्लिनिकल ज्ञान एवं कोलकाता स्वास्थ्य डेटा इंटेलिजेंस',
    placeholder: 'स्वास्थ्य जानकारी, कोलकाता डेटासेट, ट्रेंड्स या प्रोटोकॉल के बारे में पूछें...',
    send: 'भेजें',
    clear: 'चैट साफ़ करें',
    offline: 'लोकल AI वर्तमान में अनुपलब्ध है। सुनिश्चित करें कि Ollama चल रहा है और Gemma 3 270M इंस्टॉल है।',
    thinking: 'डेटासेट का विश्लेषण किया जा रहा है...',
    emptyTitle: 'रूरलहेल्थ AI आपकी क्या मदद कर सकता है?',
    emptySubtitle: 'स्वास्थ्य शिक्षा • स्क्रीनिंग प्रोटोकॉल • कोलकाता डेटा इंटेलिजेंस • बहुभाषी सहायता',
    emptyHint: 'सुझाए गए प्रश्न:',
    disclaimer: 'केवल सहायक जानकारी — कोई चिकित्सीय निदान या पर्चा नहीं। हमेशा PHC डॉक्टर से परामर्श लें।',
    localAiReady: 'लोकल AI कनेक्टेड',
    localAiOffline: 'लोकल AI ऑफ़लाइन',
    dataAvailable: 'कोलकाता डेटा उपलब्ध',
    viewData: 'डेटा तालिका देखें',
    copied: 'कॉपी किया गया',
  },
  bn: {
    title: 'রুরালহেলথ AI চ্যাট সহায়ক',
    subtitle: 'লোকাল ক্লিনিক্যাল জ্ঞান ও কলকাতা স্বাস্থ্য ডেটা সহকারী',
    placeholder: 'স্বাস্থ্য তথ্য, কলকাতা ডেটাসেট, ট্রেন্ড বা নির্দেশিকা সম্পর্কে জিজ্ঞাসা করুন...',
    send: 'পাঠান',
    clear: 'চ্যাট মুছুন',
    offline: 'লোকাল AI বর্তমানে অনুপলব্ধ। নিশ্চিত করুন Ollama চালু আছে এবং Gemma 3 270M ইনস্টল আছে।',
    thinking: 'ডেটাসেট বিশ্লেষণ ও উত্তর তৈরি করা হচ্ছে...',
    emptyTitle: 'রুরালহেলথ AI আপনাকে কীভাবে সাহায্য করতে পারে?',
    emptySubtitle: 'স্বাস্থ্য শিক্ষা • স্ক্রিনিং প্রস্তুতি • কলকাতা স্বাস্থ্য ডেটা • বহুভাষিক সহায়তা',
    emptyHint: 'প্রস্তাবিত প্রশ্নাবলী:',
    disclaimer: 'শুধুমাত্র সহায়ক তথ্য — কোনো ডাক্তারি রোগনির্ণয় বা প্রেসক্রিপশন নয়। সর্বদা চিকিৎসকের পরামর্শ নিন।',
    localAiReady: 'লোকাল AI সংযুক্ত',
    localAiOffline: 'লোকাল AI অফলাইন',
    dataAvailable: 'কলকাতা স্বাস্থ্য ডেটা সংযুক্ত',
    viewData: 'ডেটা পয়েন্ট দেখুন',
    copied: 'কপি করা হয়েছে',
  },
};

// ── Markdown renderer (bold + italic + bullets + headers) ─────────────────────
function renderMarkdown(text: string): React.ReactNode[] {
  return text.split('\n').map((line, i) => {
    // Header 3: ### Header
    if (line.startsWith('### ')) {
      return (
        <h3 key={i} className="font-extrabold text-[#102A56] dark:text-emerald-400 text-sm mt-3 mb-1 flex items-center gap-1.5">
          {line.slice(4)}
        </h3>
      );
    }
    // Divider
    if (line.startsWith('───') || line.startsWith('---')) {
      return <hr key={i} className="border-slate-200 my-2" />;
    }

    const parts = line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={j} className="font-bold text-[#102A56] dark:text-white">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
        return <em key={j} className="italic text-[#0A9F68] font-medium">{part.slice(1, -1)}</em>;
      }
      return part;
    });

    if (line.startsWith('- ') || line.startsWith('• ') || line.startsWith('* ')) {
      return (
        <div key={i} className="flex items-start gap-2 ml-1 my-1">
          <span className="text-[#0A9F68] mt-1 shrink-0 text-xs">●</span>
          <span className="text-slate-700 dark:text-slate-200 text-sm leading-relaxed">{parts.map((p, j) => <React.Fragment key={j}>{p}</React.Fragment>)}</span>
        </div>
      );
    }
    if (!line.trim()) return <div key={i} className="h-2" />;

    return <div key={i} className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed my-0.5">{parts.map((p, j) => <React.Fragment key={j}>{p}</React.Fragment>)}</div>;
  });
}

export const ChatAssistantPage: React.FC<ChatAssistantPageProps> = ({ lang }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [expandedDataIndex, setExpandedDataIndex] = useState<number | null>(null);
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus>({
    status: 'checking',
    model: 'gemma3:270m',
    local: true,
  });

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const ui = UI_STRINGS[lang] || UI_STRINGS.en;
  const quickPrompts = QUICK_PROMPTS[lang] || QUICK_PROMPTS.en;

  // Check Ollama health from FastAPI backend
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

  // Scroll to bottom when messages update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

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
          data_points: data.data_points,
        },
      ]);
    } catch (err: unknown) {
      console.error('Chat Assistant error:', err);
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

  const clearChat = () => {
    setMessages([]);
    setError(null);
  };

  const copyMessage = (idx: number, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const setFeedback = (idx: number, fb: 'up' | 'down') => {
    setMessages(prev => prev.map((m, i) => i === idx ? { ...m, feedback: fb } : m));
  };

  const regenerateLast = () => {
    if (messages.length === 0 || isLoading) return;
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (lastUserMsg) {
      sendMessage(lastUserMsg.content);
    }
  };

  const displayModelName = ollamaStatus.model.includes('gemma') ? 'Gemma 3 270M' : ollamaStatus.model;

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] min-h-[580px] bg-white rounded-3xl border border-[#E5EEF1] shadow-md overflow-hidden animate-in fade-in duration-200">

      {/* ── Top Header Bar ─────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-[#102A56] via-[#153B75] to-[#0A9F68] px-6 py-4 flex items-center justify-between gap-4 text-white shadow-xs shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-sm shrink-0">
            <MessageCircleHeart className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="font-extrabold text-base sm:text-lg text-white tracking-tight leading-tight">
                {ui.title}
              </h1>
              {/* Ollama Status Pill */}
              {ollamaStatus.status === 'connected' ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-400/20 text-emerald-200 border border-emerald-400/30 text-[11px] font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                  <span>● {ui.localAiReady} • {displayModelName}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-800/80 text-amber-300 border border-amber-400/30 text-[11px] font-medium">
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                  <span>● {ui.localAiOffline}</span>
                </span>
              )}
              {/* Dataset Available Badge */}
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/10 text-cyan-200 border border-white/15 text-[11px] font-semibold">
                <Database className="w-3 h-3 text-cyan-300" />
                <span>{ui.dataAvailable}</span>
              </span>
            </div>
            <p className="text-xs text-slate-200 mt-0.5 hidden sm:block opacity-90">
              {ui.subtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={clearChat}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-white/90 hover:text-white px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 transition-all shadow-2xs"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{ui.clear}</span>
            </button>
          )}
          <button
            type="button"
            onClick={checkOllamaHealth}
            title="Refresh AI Connection"
            className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all text-white/80 hover:text-white"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Messages & Conversation Body ───────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-[#F8FAFC]">

        {/* Empty State / Welcome */}
        {messages.length === 0 && !isLoading && (
          <div className="max-w-2xl mx-auto py-6 sm:py-8 space-y-6 animate-in fade-in duration-300">
            {/* Welcome Card */}
            <div className="bg-white rounded-3xl p-6 border border-[#E2E8F0] shadow-sm text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#E7F7F0] to-[#DEF7EC] border border-[#BDE7D3] flex items-center justify-center mx-auto text-[#0A9F68] shadow-xs">
                <Sparkles className="w-7 h-7" />
              </div>
              <h2 className="text-lg sm:text-xl font-black text-[#102A56]">
                {ui.emptyTitle}
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
                {ui.emptySubtitle}
              </p>
              <div className="flex items-center justify-center gap-2 flex-wrap pt-1">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F1F5F9] text-slate-600 text-xs font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#0A9F68]" />
                  <span>Gemma 3 270M • Offline Capable</span>
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E7F7F0] text-[#0A9F68] text-xs font-semibold">
                  <Database className="w-3.5 h-3.5 text-[#0A9F68]" />
                  <span>Kolkata HMIS (8202 records) & NFHS-5</span>
                </span>
              </div>
            </div>

            {/* Suggested Question Pills */}
            <div className="space-y-2.5">
              <p className="text-xs font-extrabold text-slate-500 uppercase tracking-wider px-1 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#0A9F68]" />
                <span>{ui.emptyHint}</span>
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {quickPrompts.map((prompt, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => sendMessage(prompt)}
                    className="text-left text-xs font-semibold text-slate-700 bg-white hover:bg-[#E7F7F0] hover:text-[#0A9F68] p-3.5 rounded-2xl border border-slate-200 hover:border-[#0A9F68]/40 transition-all shadow-2xs hover:shadow-sm"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Message Bubbles & Answer Cards */}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-3 items-start max-w-3xl ${
              msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto flex-row'
            }`}
          >
            {/* Avatar */}
            <div className={`w-8 h-8 rounded-2xl shrink-0 flex items-center justify-center shadow-xs ${
              msg.role === 'user'
                ? 'bg-[#0A9F68] text-white'
                : 'bg-[#102A56] text-[#10B981] border border-slate-700'
            }`}>
              {msg.role === 'user'
                ? <User className="w-4 h-4" />
                : <Cpu className="w-4 h-4" />
              }
            </div>

            {/* Bubble / Card */}
            <div className={`rounded-3xl px-5 py-4 shadow-xs leading-relaxed max-w-[90%] sm:max-w-[85%] ${
              msg.role === 'user'
                ? 'bg-[#0A9F68] text-white rounded-tr-xs'
                : 'bg-white text-slate-800 border border-[#E2E8F0] rounded-tl-xs'
            }`}>
              {msg.role === 'assistant' ? (
                <div className="space-y-2.5">
                  {/* Visual Data Badge Header */}
                  {msg.badge && (
                    <div className="flex items-center gap-2 pb-1 border-b border-slate-100 flex-wrap">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-bold ${
                        msg.badge.includes('DATASET') || msg.badge.includes('📊')
                          ? 'bg-emerald-50 text-[#0A9F68] border border-emerald-200'
                          : msg.badge.includes('SAFETY')
                          ? 'bg-amber-50 text-amber-800 border border-amber-200'
                          : 'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}>
                        {msg.badge}
                      </span>
                      {msg.source && (
                        <span className="text-[11px] text-slate-500 font-medium">
                          • {msg.source}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Message Content */}
                  <div>{renderMarkdown(msg.content)}</div>

                  {/* Raw Data Points Collapsible if Trend / Time-series */}
                  {msg.data_points && msg.data_points.length > 0 && (
                    <div className="pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setExpandedDataIndex(expandedDataIndex === i ? null : i)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0A9F68] hover:underline"
                      >
                        <TableIcon className="w-3.5 h-3.5" />
                        <span>{expandedDataIndex === i ? 'Hide Data Points' : `${ui.viewData} (${msg.data_points.length} years)`}</span>
                      </button>

                      {expandedDataIndex === i && (
                        <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="border-b border-slate-200 text-slate-500 font-bold">
                                <th className="p-1">Fiscal Year</th>
                                <th className="p-1">Value</th>
                              </tr>
                            </thead>
                            <tbody>
                              {msg.data_points.map((pt, pIdx) => (
                                <tr key={pIdx} className="border-b border-slate-100 text-slate-700">
                                  <td className="p-1 font-mono">{pt.year}</td>
                                  <td className="p-1 font-semibold">{pt.value}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Footer Action Bar: Copy, Regenerate, Feedback */}
                  <div className="pt-2 mt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400 gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => copyMessage(i, msg.content)}
                        title="Copy answer"
                        className="inline-flex items-center gap-1 hover:text-slate-700 p-1 rounded-md hover:bg-slate-100 transition-colors"
                      >
                        {copiedIndex === i ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="text-[10px] text-emerald-600 font-semibold">{ui.copied}</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span className="text-[10px]">Copy</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={regenerateLast}
                        title="Regenerate response"
                        className="inline-flex items-center gap-1 hover:text-slate-700 p-1 rounded-md hover:bg-slate-100 transition-colors text-[10px]"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Regenerate</span>
                      </button>

                      <div className="flex items-center gap-1 ml-2 border-l border-slate-200 pl-2">
                        <button
                          type="button"
                          onClick={() => setFeedback(i, 'up')}
                          title="Helpful"
                          className={`p-1 rounded-md hover:bg-slate-100 transition-colors ${
                            msg.feedback === 'up' ? 'text-emerald-600 font-bold' : 'hover:text-slate-700'
                          }`}
                        >
                          <ThumbsUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setFeedback(i, 'down')}
                          title="Not helpful"
                          className={`p-1 rounded-md hover:bg-slate-100 transition-colors ${
                            msg.feedback === 'down' ? 'text-rose-600 font-bold' : 'hover:text-slate-700'
                          }`}
                        >
                          <ThumbsDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-[10px]">
                      <span className="font-semibold">{msg.provider === 'kolkata-data-engine' ? '📊 Data Engine' : '⚡ Local Ollama'}</span>
                      <span className="font-mono bg-slate-100 px-2 py-0.5 rounded-md text-slate-600">{msg.model || 'gemma3:270m'}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm font-medium text-white whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex gap-3 items-start mr-auto max-w-3xl">
            <div className="w-8 h-8 rounded-2xl bg-[#102A56] text-[#10B981] border border-slate-700 shrink-0 flex items-center justify-center shadow-xs">
              <Bot className="w-4 h-4" />
            </div>
            <div className="bg-white border border-[#E2E8F0] rounded-3xl rounded-tl-xs px-4 py-3 flex items-center gap-2.5 shadow-xs">
              <Loader2 className="w-4 h-4 text-[#0A9F68] animate-spin" />
              <span className="text-xs text-slate-600 font-semibold">{ui.thinking}</span>
            </div>
          </div>
        )}

        {/* Error Notification */}
        {error && (
          <div className="flex items-start gap-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-4 max-w-2xl mx-auto shadow-xs">
            <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <div className="text-xs font-semibold">
              <p>{error}</p>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Disclaimer Strip ───────────────────────────────────────────────── */}
      <div className="px-4 py-2 bg-[#F1F5F9] border-t border-slate-200 text-center shrink-0">
        <p className="text-[11px] text-slate-500 font-medium">
          ⚕️ {ui.disclaimer}
        </p>
      </div>

      {/* ── Bottom Input Bar ───────────────────────────────────────────────── */}
      <div className="p-4 bg-white border-t border-[#E5EEF1] shrink-0">
        <div className="max-w-4xl mx-auto flex gap-2.5 items-end">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            placeholder={ui.placeholder}
            className="flex-1 bg-[#F8FAFC] text-slate-800 placeholder-slate-400 text-xs sm:text-sm font-medium px-4 py-3 rounded-2xl border border-slate-200 focus:border-[#0A9F68] focus:ring-2 focus:ring-[#0A9F68]/20 outline-none resize-none transition-all disabled:opacity-50 shadow-2xs"
            style={{ minHeight: '46px', maxHeight: '120px' }}
          />
          <button
            type="button"
            disabled={!input.trim() || isLoading}
            onClick={() => sendMessage(input)}
            className="w-11 h-11 rounded-2xl bg-[#0A9F68] hover:bg-[#088758] disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center shadow-md shadow-[#0A9F68]/20 transition-all active:scale-95 shrink-0"
          >
            {isLoading
              ? <Loader2 className="w-5 h-5 animate-spin" />
              : <Send className="w-5 h-5" />
            }
          </button>
        </div>
        <div className="max-w-4xl mx-auto flex items-center justify-between text-[10px] text-slate-400 mt-2 px-1">
          <span>Local Ollama AI Runtime (Gemma 3 270M) • Kolkata Health Data Engine</span>
          <span>Enter to send · Shift+Enter for new line</span>
        </div>
      </div>

    </div>
  );
};

export default ChatAssistantPage;
