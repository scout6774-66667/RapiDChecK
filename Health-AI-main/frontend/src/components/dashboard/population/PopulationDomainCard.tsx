import { useState, type FC } from 'react';
import {
  Baby,
  HeartPulse,
  Apple,
  Activity,
  Bug,
  Hospital,
  ChevronDown,
  ChevronUp,
  Info
} from 'lucide-react';

export interface DomainCardData {
  domainKey: string;
  title: string;
  iconName: 'maternal' | 'child' | 'nutrition' | 'ncd' | 'communicable' | 'access';
  signal: string;
  score: number | null;
  confidence: string;
  scoringMetadata?: {
    features_used?: string[];
    normalization_method?: string;
    weights?: Record<string, number>;
  };
  hmisIndicators: Record<
    string,
    { value: number | null; unit: string; description: string; source: string; status: string }
  >;
  nfhsBaseline: Record<
    string,
    { value: number | null; unit: string; description: string; source: string; status: string }
  >;
}

interface PopulationDomainCardProps {
  data: DomainCardData;
  onSelectIndicator?: (indicatorKey: string) => void;
  selectedIndicator?: string;
}

const getDomainIcon = (iconName: DomainCardData['iconName']) => {
  switch (iconName) {
    case 'maternal':
      return <Baby className="w-5 h-5 text-rose-600" />;
    case 'child':
      return <HeartPulse className="w-5 h-5 text-amber-600" />;
    case 'nutrition':
      return <Apple className="w-5 h-5 text-emerald-600" />;
    case 'ncd':
      return <Activity className="w-5 h-5 text-purple-600" />;
    case 'communicable':
      return <Bug className="w-5 h-5 text-orange-600" />;
    case 'access':
      return <Hospital className="w-5 h-5 text-blue-600" />;
  }
};

const getBadgeStyle = (signal: string) => {
  const lower = signal.toLowerCase();
  if (lower.includes('elevated') || lower.includes('constrained')) {
    return 'bg-amber-50 text-amber-700 border-amber-200';
  }
  if (lower.includes('strong') || lower.includes('optimal')) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
  if (lower.includes('insufficient')) {
    return 'bg-slate-100 text-slate-600 border-slate-200';
  }
  return 'bg-blue-50 text-blue-700 border-blue-200';
};

export const PopulationDomainCard: FC<PopulationDomainCardProps> = ({
  data,
  onSelectIndicator,
  selectedIndicator
}) => {
  const [expanded, setExpanded] = useState(false);

  const hmisKeys = Object.keys(data.hmisIndicators);
  const nfhsKeys = Object.keys(data.nfhsBaseline);

  // Top 2 indicators to display in collapsed view
  const previewHmis = hmisKeys.slice(0, 2);
  const previewNfhs = nfhsKeys.slice(0, 1);

  return (
    <div
      id={`domain-card-${data.domainKey}`}
      className="bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col justify-between"
    >
      {/* Top Header */}
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
              {getDomainIcon(data.iconName)}
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base leading-snug">{data.title}</h3>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Health Intelligence Domain
              </span>
            </div>
          </div>

          {/* Context Signal Badge */}
          <span
            className={`px-2.5 py-1 text-xs font-bold rounded-lg border leading-tight text-right ${getBadgeStyle(
              data.signal
            )}`}
          >
            {data.signal.replace(/^Kolkata\s+/i, '')}
          </span>
        </div>

        {/* Score & Confidence Bar */}
        {data.score !== null && (
          <div className="mb-4 bg-slate-50/80 p-2.5 rounded-xl border border-slate-100 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-slate-600">
              <span className="font-semibold">Burden Signal:</span>
              <span className="font-bold text-slate-900">{data.score}/100</span>
            </div>
            <div className="text-[11px] text-slate-500 font-medium">
              Conf: <span className="text-slate-700 font-semibold">{data.confidence}</span>
            </div>
          </div>
        )}

        {/* Primary Preview Indicators */}
        <div className="space-y-2 mb-3">
          {previewHmis.map((k) => {
            const ind = data.hmisIndicators[k];
            const isClickable = Boolean(onSelectIndicator);
            const isSelected = selectedIndicator === k;

            return (
              <div
                key={k}
                onClick={() => onSelectIndicator && onSelectIndicator(k)}
                className={`p-2 rounded-lg border text-xs transition-colors ${
                  isSelected
                    ? 'bg-blue-50/80 border-blue-300 ring-1 ring-blue-300'
                    : 'bg-white border-slate-100 hover:border-slate-300'
                } ${isClickable ? 'cursor-pointer' : ''}`}
                title={ind.description}
              >
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="font-medium text-slate-700 truncate">{ind.description}</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 shrink-0">
                    HMIS
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-slate-900 text-sm">
                    {ind.value !== null && ind.value !== undefined
                      ? ind.value.toLocaleString()
                      : <span className="text-slate-400 italic font-normal">Data not reported</span>}
                  </span>
                  <span className="text-slate-400 text-[10px]">{ind.unit.replace(/_/g, ' ')}</span>
                </div>
              </div>
            );
          })}

          {/* NFHS Survey Baseline Preview */}
          {previewNfhs.map((k) => {
            const ind = data.nfhsBaseline[k];
            return (
              <div
                key={k}
                className="p-2 rounded-lg bg-emerald-50/40 border border-emerald-100 text-xs"
                title={ind.description}
              >
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="font-medium text-emerald-900 truncate">{ind.description}</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 shrink-0">
                    NFHS-5 2019-20
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-emerald-950 text-sm">
                    {ind.value !== null ? `${ind.value}%` : 'Unavailable'}
                  </span>
                  <span className="text-emerald-700 text-[10px]">survey baseline</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Expanded View for All Indicators */}
        {expanded && (
          <div className="pt-3 border-t border-slate-100 space-y-3 animate-in fade-in duration-150">
            {/* All HMIS Indicators */}
            {hmisKeys.length > 2 && (
              <div>
                <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  All HMIS Indicators
                </h4>
                <div className="space-y-1.5">
                  {hmisKeys.slice(2).map((k) => {
                    const ind = data.hmisIndicators[k];
                    const isSelected = selectedIndicator === k;
                    return (
                      <div
                        key={k}
                        onClick={() => onSelectIndicator && onSelectIndicator(k)}
                        className={`p-2 rounded-lg border text-xs cursor-pointer ${
                          isSelected ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-300' : 'bg-slate-50/50 border-slate-100 hover:border-slate-200'
                        }`}
                      >
                        <div className="flex justify-between items-center text-slate-700 font-medium">
                          <span className="truncate pr-2">{ind.description}</span>
                          <span className="font-bold text-slate-900 shrink-0">
                            {ind.value !== null ? ind.value.toLocaleString() : 'N/A'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* All NFHS-5 Survey Baselines */}
            {nfhsKeys.length > 1 && (
              <div>
                <h4 className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <span>NFHS-5 Survey Context (2019–20)</span>
                  <Info className="w-3 h-3" />
                </h4>
                <div className="space-y-1.5">
                  {nfhsKeys.slice(1).map((k) => {
                    const ind = data.nfhsBaseline[k];
                    return (
                      <div
                        key={k}
                        className="p-2 rounded-lg bg-emerald-50/30 border border-emerald-100 text-xs flex justify-between items-center"
                      >
                        <span className="truncate pr-2 text-emerald-900 font-medium">{ind.description}</span>
                        <span className="font-bold text-emerald-950 shrink-0">
                          {ind.value !== null ? `${ind.value}%` : 'N/A'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Transparent Scoring Provenance Note */}
            {data.scoringMetadata && (
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[10px] text-slate-500 space-y-1">
                <div className="font-bold text-slate-700">Governance & Calculation:</div>
                <div>Norm: {data.scoringMetadata.normalization_method || 'population_weighting'}</div>
                {data.scoringMetadata.weights && (
                  <div>
                    Weights: {Object.entries(data.scoringMetadata.weights).map(([k, v]) => `${k} (${v})`).join(', ')}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Expand / Collapse Footer */}
      <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-slate-600 hover:text-slate-900 font-semibold flex items-center gap-1 transition-colors"
        >
          {expanded ? (
            <>
              <span>Collapse</span>
              <ChevronUp className="w-3.5 h-3.5" />
            </>
          ) : (
            <>
              <span>View all {hmisKeys.length + nfhsKeys.length} indicators</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </>
          )}
        </button>

        <span className="text-[10px] text-slate-400 font-medium">Traceable to HMIS / NFHS</span>
      </div>
    </div>
  );
};
