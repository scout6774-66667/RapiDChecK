import React, { useRef, useEffect } from 'react';
import { X, Play, Wifi, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '../../i18n';
import fieldWalkthroughVideo from '../../assets/field_walkthrough.mp4';

interface VideoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGetStarted: () => void;
}

export const VideoModal: React.FC<VideoModalProps> = ({
  isOpen,
  onClose,
  onGetStarted,
}) => {
  const { language, strings } = useLanguage();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (isOpen && videoRef.current) {
      videoRef.current.play().catch(() => {
        // Autoplay may be restricted by browser until user interacts
      });
    } else if (!isOpen && videoRef.current) {
      videoRef.current.pause();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl max-w-4xl w-full overflow-hidden shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200 flex flex-col max-h-[94vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-[#E8F8F2] text-[#0FA36B] flex items-center justify-center shadow-2xs">
              <Play className="w-4 h-4 fill-current translate-x-0.5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#12345B]">
                {strings.videoModal.title}
              </h3>
              <p className="text-xs text-[#52677F]">
                {language === 'hi'
                  ? 'सामुदायिक स्वास्थ्य वर्कफ़्लो और AI मार्गदर्शन'
                  : language === 'bn'
                  ? 'কমিউনিটি স্বাস্থ্যসেবা ওয়ার্কফ্লো ও AI নির্দেশনা'
                  : 'Frontline Community Healthcare Workflow & AI Guidance'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
            aria-label={strings.videoModal.close}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Video Player Container */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
          <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black shadow-lg border border-slate-200 flex items-center justify-center">
            <video
              ref={videoRef}
              src={fieldWalkthroughVideo}
              controls
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            >
              <source src={fieldWalkthroughVideo} type="video/mp4" />
              <source src="/field_walkthrough.mp4" type="video/mp4" />
              Your browser does not support HTML5 video playback.
            </video>
          </div>

          {/* Video Description & Meta Details */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-1 pt-1">
            <div className="space-y-1">
              <h4 className="text-sm sm:text-base font-bold text-[#12345B]">
                {language === 'hi'
                  ? 'ग्रामीण स्वास्थ्य कार्यकर्ताओं के लिए वास्तविक समय AI निर्णय सहायता'
                  : language === 'bn'
                  ? 'গ্রামীণ স্বাস্থ্যকর্মীদের জন্য রিয়েল-টাইম AI সিদ্ধান্ত সহায়তা'
                  : 'Real-Time AI Decision Support for Rural Health Workers'}
              </h4>
              <p className="text-xs text-[#52677F] max-w-2xl leading-relaxed">
                {strings.videoModal.desc}
              </p>
            </div>

            <div className="shrink-0 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E8F8F2] text-[#0FA36B] border border-[#DCEBE5] text-xs font-bold shadow-2xs">
                <Wifi className="w-3.5 h-3.5" />
                {language === 'hi'
                  ? '100% ऑफ़लाइन सक्षम'
                  : language === 'bn'
                  ? '১০০% অফলাইন সক্ষম'
                  : '100% Offline Enabled'}
              </span>
            </div>
          </div>

          {/* Highlights checklist */}
          <div className="grid sm:grid-cols-2 gap-2.5 pt-2 text-xs text-[#304A67]">
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[#F8FCFA] border border-[#DCEBE5]">
              <CheckCircle2 className="w-4 h-4 text-[#0FA36B] shrink-0" />
              <span>
                {language === 'hi'
                  ? 'फील्ड कार्यकर्ताओं के लिए पूर्ण IndexedDB ऑफ़लाइन संग्रहण'
                  : language === 'bn'
                  ? 'ফিল্ড কর্মীদের জন্য সম্পূর্ণ IndexedDB অফলাইন সংরক্ষণ'
                  : 'Full IndexedDB offline persistence for field workers'}
              </span>
            </div>
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[#F8FCFA] border border-[#DCEBE5]">
              <CheckCircle2 className="w-4 h-4 text-[#0FA36B] shrink-0" />
              <span>
                {language === 'hi'
                  ? 'English, हिन्दी और বাংলা बहुभाषी समर्थन'
                  : language === 'bn'
                  ? 'English, हिन्दी এবং বাংলা বহুভাষিক সহায়তা'
                  : 'English, Hindi (हिन्दी), and Bengali (বাংলা) support'}
              </span>
            </div>
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[#F8FCFA] border border-[#DCEBE5]">
              <CheckCircle2 className="w-4 h-4 text-[#0FA36B] shrink-0" />
              <span>
                {language === 'hi'
                  ? 'क्लिनिकल जोखिम मैट्रिक्स और स्वचालित उच्च जोखिम रेफरल'
                  : language === 'bn'
                  ? 'ক্লিনিকাল ঝুঁকি ম্যাট্রিক্স এবং স্বয়ংক্রিয় উচ্চ ঝুঁকি রেফারেল'
                  : 'Clinical risk matrix & automatic high-risk referral flags'}
              </span>
            </div>
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[#F8FCFA] border border-[#DCEBE5]">
              <CheckCircle2 className="w-4 h-4 text-[#0FA36B] shrink-0" />
              <span>
                {language === 'hi'
                  ? 'ASHAs, डॉक्टरों और जिला अधिकारियों के लिए भूमिका-आधारित पहुँच'
                  : language === 'bn'
                  ? 'ASHAs, ডাক্তার এবং জেলা আধিকারিকদের জন্য ভূমিকা-ভিত্তিক অ্যাক্সেস'
                  : 'Role-Based Access for ASHAs, Doctors, and District Officers'}
              </span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 sm:px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            {strings.videoModal.close}
          </button>
          <button
            onClick={() => {
              onClose();
              onGetStarted();
            }}
            className="px-6 py-2.5 rounded-full bg-[#12B981] hover:bg-[#0FA36B] text-white text-xs font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <span>{strings.videoModal.getStarted}</span>
            <span>→</span>
          </button>
        </div>
      </div>
    </div>
  );
};
