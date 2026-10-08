import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, AlertCircle, Keyboard, Plus, Square, RotateCcw } from 'lucide-react';

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  lang: string;
  isOnline: boolean;
}

export const VoiceInputButton: React.FC<VoiceInputButtonProps> = ({
  onTranscript,
  lang,
  isOnline,
}) => {
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [finalText, setFinalText] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showInput, setShowInput] = useState(false);
  const [typedText, setTypedText] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const MAX_RETRIES = 2;

  const isSpeechSupported =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  // Get language code for speech recognition
  const getLangCode = useCallback(() => {
    switch (lang) {
      case 'hi': return 'hi-IN';
      case 'bn': return 'bn-IN';
      default: return 'en-IN';
    }
  }, [lang]);

  // Auto-focus input panel
  useEffect(() => {
    if (showInput && inputRef.current) inputRef.current.focus();
  }, [showInput]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAll();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stopAll = () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch {}
      audioContextRef.current = null;
    }
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    setIsListening(false);
    setInterimText('');
    setAudioLevel(0);
  };

  // ─── AUDIO LEVEL METER ────────────────────────────────────────────────────
  const startAudioMeter = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      audioContextRef.current = ctx;
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setAudioLevel(Math.min(avg / 128, 1));
        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // Mic access denied — meter won't show but voice may still work via SpeechRecognition
    }
  };

  const stopAudioMeter = () => {
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch {}
      audioContextRef.current = null;
    }
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setAudioLevel(0);
  };

  // ─── VOICE RECOGNITION ────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    setErrorMsg(null);
    setInterimText('');
    setFinalText('');

    if (!isSpeechSupported) {
      setErrorMsg('Voice not supported in this browser. Please type your symptoms.');
      setShowInput(true);
      return;
    }
    if (!isOnline) {
      setErrorMsg('Voice requires internet. Please type your symptoms.');
      setShowInput(true);
      return;
    }

    try {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();

      // ── KEY SETTINGS FOR BEST VOICE CATCHING ──
      recognition.continuous = true;        // Keep listening after first result
      recognition.interimResults = true;    // Show live transcript as user speaks
      recognition.maxAlternatives = 3;      // Get multiple alternatives for better accuracy
      recognition.lang = getLangCode();

      recognition.onstart = () => {
        setIsListening(true);
        setErrorMsg(null);
        setRetryCount(0);
        startAudioMeter();
      };

      recognition.onresult = (event: any) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          // Pick the best alternative (highest confidence)
          let bestTranscript = result[0].transcript;
          let bestConfidence = result[0].confidence || 0;

          for (let alt = 1; alt < result.length; alt++) {
            if ((result[alt].confidence || 0) > bestConfidence) {
              bestConfidence = result[alt].confidence;
              bestTranscript = result[alt].transcript;
            }
          }

          if (result.isFinal) {
            final += bestTranscript + ' ';
          } else {
            interim += bestTranscript;
          }
        }

        if (interim) setInterimText(interim);
        if (final) {
          setFinalText((prev) => (prev ? prev + ' ' + final.trim() : final.trim()));
          setInterimText('');
          // Send each final result immediately for real-time feedback
          const cleaned = final.trim().replace(/\s+/g, ' ');
          if (cleaned) onTranscript(cleaned);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);

        // Auto-retry on no-speech (user hasn't spoken yet)
        if (event.error === 'no-speech' && retryCount < MAX_RETRIES) {
          setRetryCount((prev) => prev + 1);
          retryTimerRef.current = setTimeout(() => {
            if (recognitionRef.current) {
              try { recognitionRef.current.start(); } catch {}
            }
          }, 500);
          return;
        }

        setIsListening(false);
        stopAudioMeter();

        switch (event.error) {
          case 'not-allowed':
            setErrorMsg('Microphone access denied. Please allow mic permission in your browser.');
            break;
          case 'network':
            setErrorMsg('Network error. Voice recognition requires internet.');
            break;
          case 'no-speech':
            setErrorMsg('No speech detected after multiple attempts. Please try again or type.');
            break;
          case 'audio-capture':
            setErrorMsg('No microphone found. Check your microphone settings.');
            break;
          case 'service-not-allowed':
            setErrorMsg('Speech service unavailable. Please type your symptoms.');
            break;
          default:
            setErrorMsg('Voice input failed. Try again or type your symptoms.');
        }
        setShowInput(true);
      };

      recognition.onend = () => {
        setIsListening(false);
        stopAudioMeter();
        // If we have interim text when recognition ends, treat it as final
        if (interimText.trim()) {
          const cleaned = interimText.trim();
          setFinalText((prev) => (prev ? prev + ' ' + cleaned : cleaned));
          onTranscript(cleaned);
          setInterimText('');
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      setIsListening(false);
      setErrorMsg('Voice input not available. Please type your symptoms.');
      setShowInput(true);
    }
  }, [isOnline, isSpeechSupported, getLangCode, onTranscript, retryCount, interimText]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopListening = () => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    setIsListening(false);
    stopAudioMeter();
  };

  const handleTypeSubmit = () => {
    const trimmed = typedText.trim();
    if (!trimmed) return;
    onTranscript(trimmed);
    setTypedText('');
    setShowInput(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleTypeSubmit();
    }
    if (e.key === 'Escape') {
      setShowInput(false);
      setTypedText('');
    }
  };

  // ─── AUDIO LEVEL BARS ─────────────────────────────────────────────────────
  const AudioBars = () => {
    const bars = 5;
    return (
      <div className="flex items-end gap-0.5 h-4">
        {Array.from({ length: bars }).map((_, i) => {
          const threshold = (i + 1) / bars;
          const active = audioLevel >= threshold * 0.8;
          return (
            <div
              key={i}
              className={`w-1 rounded-full transition-all duration-75 ${
                active ? 'bg-white' : 'bg-white/30'
              }`}
              style={{ height: `${6 + i * 3}px` }}
            />
          );
        })}
      </div>
    );
  };

  return (
    <div className="inline-flex flex-col items-start gap-2 w-full">
      {/* ── MAIN BUTTONS ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        {/* Voice / Stop button */}
        {isListening ? (
          <button
            type="button"
            onClick={stopListening}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-rose-600 text-white shadow-lg shadow-rose-300 animate-pulse transition-all active:scale-95"
            title="Stop listening"
          >
            <Square className="w-4 h-4 fill-white" />
            <AudioBars />
            <span>Stop</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={startListening}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 shadow-sm transition-all active:scale-95"
            title={isSpeechSupported ? 'Click to speak your symptoms' : 'Voice not supported — click to type'}
          >
            <Mic className="w-5 h-5 text-emerald-600" />
            <span>🎤 Speak</span>
          </button>
        )}

        {/* Type button */}
        <button
          type="button"
          onClick={() => {
            if (isListening) stopListening();
            setShowInput(!showInput);
          }}            className={`inline-flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all shadow-sm border ${
            showInput
              ? 'bg-slate-600 dark:bg-slate-500 text-white border-slate-700 dark:border-slate-600'
              : 'bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600'
          }`}
          title="Type symptoms instead"
        >
          <Keyboard className="w-4 h-4" />
          <span>Type</span>
        </button>
      </div>

      {/* ── ERROR MESSAGE ─────────────────────────────────────────────────── */}
      {errorMsg && (
        <div className="w-full text-xs text-amber-700 font-medium flex items-start gap-2 bg-amber-50 px-3 py-2 rounded-xl border border-amber-200">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="flex-1">{errorMsg}</span>
          <button
            onClick={() => { setErrorMsg(null); startListening(); }}
            className="text-amber-800 hover:text-amber-900 font-bold flex items-center gap-1 shrink-0"
          >
            <RotateCcw className="w-3 h-3" /> Retry
          </button>
        </div>
      )}

      {/* ── LIVE LISTENING INDICATOR ─────────────────────────────────────── */}
      {isListening && (
        <div className="w-full bg-gradient-to-r from-rose-50 to-pink-50 border-2 border-rose-200 rounded-2xl p-4 shadow-md">
          <div className="flex items-center gap-3 mb-2">
            {/* Pulsing mic icon */}
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-rose-500 flex items-center justify-center shadow-lg shadow-rose-300 animate-pulse">
                <Mic className="w-5 h-5 text-white" />
              </div>
              {/* Sound wave rings */}
              <div className="absolute inset-0 rounded-full border-2 border-rose-400 animate-ping opacity-30" />
            </div>
            <div>
              <p className="text-sm font-bold text-rose-800">Listening...</p>
              <p className="text-[10px] text-rose-600">Speak clearly in {lang === 'hi' ? 'Hindi' : lang === 'bn' ? 'Bengali' : 'English'}</p>
            </div>
            <AudioBars />
          </div>

          {/* Live transcript preview */}
          {(interimText || finalText) && (
            <div className="mt-2 bg-white rounded-xl p-3 border border-rose-100">
              {finalText && (
                <p className="text-sm text-slate-800 font-semibold">{finalText}</p>
              )}
              {interimText && (
                <p className="text-sm text-slate-400 italic">{interimText}<span className="animate-pulse">|</span></p>
              )}
            </div>
          )}

          <p className="text-[10px] text-rose-500 mt-2 text-center">
            e.g. "fever, cough, headache, fatigue" · Speak naturally, commas optional
          </p>
        </div>
      )}

      {/* ── TYPE INPUT PANEL ──────────────────────────────────────────────── */}
      {showInput && !isListening && (
        <div className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-2xl p-4 shadow-md space-y-3">
          <p className="text-xs text-slate-600 font-semibold flex items-center gap-2">
            <Keyboard className="w-4 h-4" />
            Type your symptoms separated by commas
          </p>

          <textarea
            ref={inputRef}
            rows={2}
            value={typedText}
            onChange={(e) => setTypedText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. fever, cough, headache, fatigue"
            className="w-full text-sm font-semibold p-3 rounded-xl border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 resize-none"
          />

          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-slate-500 font-medium">Ctrl+Enter to add</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setShowInput(false); setTypedText(''); setErrorMsg(null); }}
                className="text-xs font-bold text-slate-600 hover:text-slate-800 px-4 py-2 rounded-lg hover:bg-slate-100 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleTypeSubmit}
                disabled={!typedText.trim()}
                className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Symptoms
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
