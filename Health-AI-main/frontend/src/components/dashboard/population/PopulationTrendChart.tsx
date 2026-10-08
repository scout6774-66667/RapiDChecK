import { useState, type FC } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ReferenceLine
} from 'recharts';
import { TrendingUp, Info } from 'lucide-react';

export interface TrendSeriesRow {
  year: number;
  fiscal_year: string;
  [key: string]: any;
}

interface PopulationTrendChartProps {
  series: TrendSeriesRow[];
  nfhsBaseline?: Record<string, number>;
  selectedIndicator?: string;
  onSelectIndicator?: (indicator: string) => void;
}

interface IndicatorGroup {
  id: string;
  label: string;
  domain: string;
  keys: { key: string; label: string; color: string }[];
  nfhsBenchmark?: { key: string; label: string; value: number; unit: string };
  description: string;
}

const INDICATOR_GROUPS: IndicatorGroup[] = [
  {
    id: 'maternal_care',
    label: 'Maternal Care & Births',
    domain: 'Maternal Health',
    keys: [
      { key: 'maternal_anc_registered_total', label: 'ANC Registered (HMIS)', color: '#0284C7' },
      { key: 'maternal_anc_3plus_checkups', label: '3+ ANC Check-ups (HMIS)', color: '#10B981' },
      { key: 'maternal_c_section_deliveries', label: 'C-Section Deliveries (HMIS)', color: '#F43F5E' }
    ],
    nfhsBenchmark: {
      key: 'nfhs5_maternal_institutional_births_pct',
      label: 'Institutional Births 2019-20',
      value: 97.5,
      unit: '%'
    },
    description: 'Tracks annual antenatal registrations and delivery interventions across Kolkata public and private institutions.'
  },
  {
    id: 'child_immunization',
    label: 'Child Immunization Cascade',
    domain: 'Child Health',
    keys: [
      { key: 'child_bcg_vaccinated', label: 'BCG Vaccinated (HMIS)', color: '#6366F1' },
      { key: 'child_dpt3_vaccinated', label: 'DPT3 Vaccinated (HMIS)', color: '#F59E0B' },
      { key: 'child_opv3_vaccinated', label: 'OPV3 Vaccinated (HMIS)', color: '#10B981' }
    ],
    nfhsBenchmark: {
      key: 'nfhs5_child_fully_vaccinated_pct',
      label: 'Fully Vaccinated 12-23mo',
      value: 80.2,
      unit: '%'
    },
    description: 'Annual infant vaccination coverage monitored by HMIS against the 80.2% fully-vaccinated NFHS-5 survey baseline.'
  },
  {
    id: 'nutrition_birthweight',
    label: 'Newborn Nutrition & Weight',
    domain: 'Nutrition',
    keys: [
      { key: 'nutrition_newborns_weighed', label: 'Newborns Weighed at Birth (HMIS)', color: '#0D9488' },
      { key: 'nutrition_low_birth_weight_under_2_5kg', label: 'Low Birth Weight <2.5kg (HMIS)', color: '#E11D48' }
    ],
    nfhsBenchmark: {
      key: 'nfhs5_nutrition_underweight_pct',
      label: 'Children Underweight Baseline',
      value: 32.9,
      unit: '%'
    },
    description: 'Weighing compliance and low birth weight burden at birth across 14 observed government HMIS annual cohorts.'
  },
  {
    id: 'ncd_burden',
    label: 'NCD Outpatient Load',
    domain: 'NCD Context',
    keys: [
      { key: 'ncd_outpatient_hypertension_attendance', label: 'Hypertension Outpatients (HMIS)', color: '#9333EA' },
      { key: 'ncd_outpatient_diabetes_attendance', label: 'Diabetes Outpatients (HMIS)', color: '#EA580C' }
    ],
    nfhsBenchmark: {
      key: 'nfhs5_ncd_bp_mildly_elevated_pct',
      label: 'Adult Elevated BP Survey Baseline',
      value: 23.2,
      unit: '%'
    },
    description: 'Urban Kolkata health facility outpatient attendance volume for hypertension and diabetes screening.'
  },
  {
    id: 'communicable_burden',
    label: 'Communicable Disease Signals',
    domain: 'Communicable',
    keys: [
      { key: 'communicable_child_diarrhoea_cases', label: 'Child Diarrhoea Reported (HMIS)', color: '#F97316' },
      { key: 'communicable_child_respiratory_cases', label: 'Child Respiratory Admissions (HMIS)', color: '#3B82F6' }
    ],
    description: 'Reported pediatric diarrhoea and respiratory infection admissions in urban health facilities.'
  }
];

export const PopulationTrendChart: FC<PopulationTrendChartProps> = ({
  series,
}) => {
  const [activeGroupId, setActiveGroupId] = useState<string>('maternal_care');

  const activeGroup = INDICATOR_GROUPS.find((g) => g.id === activeGroupId) || INDICATOR_GROUPS[0];

  // Tooltip formatter for numbers
  const formatTooltipValue = (value: any, name: any) => {
    if (value === null || value === undefined) return ['Data not reported', String(name ?? '')];
    return [Number(value).toLocaleString(), String(name ?? '')];
  };

  return (
    <div id="population-trend-chart-panel" className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 sm:p-6">
      {/* Title & Group Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
              <TrendingUp className="w-4 h-4" />
            </span>
            <h3 className="font-bold text-slate-900 text-lg">Population Health Trends (2008–2021)</h3>
          </div>
          <p className="text-xs text-slate-500 font-medium">
            HMIS annual longitudinal time series with NFHS-5 survey baseline context for Kolkata district.
          </p>
        </div>

        {/* Group Selector Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100/80 p-1 rounded-xl">
          {INDICATOR_GROUPS.map((grp) => (
            <button
              key={grp.id}
              onClick={() => setActiveGroupId(grp.id)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                activeGroupId === grp.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {grp.label}
            </button>
          ))}
        </div>
      </div>

      {/* Description & Source Callout */}
      <div className="mb-4 bg-slate-50 p-3 rounded-xl border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <span className="text-slate-600 font-medium">{activeGroup.description}</span>
        <div className="flex items-center gap-3 shrink-0">
          <span className="inline-flex items-center gap-1.5 font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md text-[11px]">
            <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
            HMIS Annual Continuous
          </span>
          <span className="inline-flex items-center gap-1.5 font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md text-[11px]">
            <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
            NFHS-5 Discrete Survey (2019-20)
          </span>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 15, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
            <XAxis
              dataKey="year"
              stroke="#64748B"
              fontSize={12}
              tickLine={false}
              axisLine={{ stroke: '#E2E8F0' }}
            />
            <YAxis
              stroke="#64748B"
              fontSize={12}
              tickLine={false}
              axisLine={{ stroke: '#E2E8F0' }}
              tickFormatter={(v) => {
                if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
                if (v >= 1000) return `${(v / 1000).toFixed(0)}k`;
                return v;
              }}
            />
            <Tooltip
              formatter={formatTooltipValue}
              labelFormatter={(label) => `Calendar Year: ${label}`}
              contentStyle={{
                backgroundColor: '#0F172A',
                color: '#FFFFFF',
                borderRadius: '12px',
                border: 'none',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
                fontSize: '12px'
              }}
              itemStyle={{ color: '#F8FAFC' }}
            />
            <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />

            {/* HMIS Lines */}
            {activeGroup.keys.map((k) => (
              <Line
                key={k.key}
                type="monotone"
                dataKey={k.key}
                name={k.label}
                stroke={k.color}
                strokeWidth={2.5}
                dot={{ r: 3, fill: k.color }}
                activeDot={{ r: 6 }}
                connectNulls={false}
              />
            ))}

            {/* Survey Year Highlight Line (2019) */}
            <ReferenceLine
              x={2019}
              stroke="#10B981"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={{
                value: 'NFHS-5 Survey Year (2019-20)',
                fill: '#059669',
                fontSize: 10,
                position: 'top',
                fontWeight: 600
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Discrete Survey Context Benchmark Note (Requirement 4 & 11) */}
      {activeGroup.nfhsBenchmark && (
        <div className="mt-4 p-3.5 bg-emerald-50/60 rounded-xl border border-emerald-200/80 flex items-start gap-3">
          <Info className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
          <div className="text-xs text-emerald-900 leading-relaxed">
            <span className="font-bold text-emerald-950">NFHS-5 Survey Context Reference: </span>
            The 2019–20 National Family Health Survey established a district baseline of{' '}
            <span className="font-extrabold text-emerald-950">
              {activeGroup.nfhsBenchmark.value}
              {activeGroup.nfhsBenchmark.unit}
            </span>{' '}
            for <span className="font-semibold">{activeGroup.nfhsBenchmark.label}</span>. As per clinical data governance standards, survey data is preserved as a discrete snapshot and is NOT forward-filled across annual HMIS observations.
          </div>
        </div>
      )}
    </div>
  );
};
