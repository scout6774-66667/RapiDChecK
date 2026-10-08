import { useState, useMemo, type FC } from 'react';
import { Search } from 'lucide-react';

export interface IndicatorTableRow {
  featureName: string;
  description: string;
  domain: string;
  source: 'HMIS' | 'NFHS-5';
  latestValue: number | null | string;
  unit: string;
  coverage: string;
  status: string;
}

interface PopulationIndicatorTableProps {
  indicators: IndicatorTableRow[];
  onSelectIndicator?: (featureName: string) => void;
}

export const PopulationIndicatorTable: FC<PopulationIndicatorTableProps> = ({
  indicators,
  onSelectIndicator
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDomain, setSelectedDomain] = useState<string>('ALL');

  const domains: string[] = useMemo(() => {
    const set = new Set<string>(indicators.map((i) => i.domain));
    return ['ALL', ...Array.from(set)];
  }, [indicators]);

  const filteredIndicators = useMemo(() => {
    return indicators.filter((item) => {
      const matchSearch =
        item.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.featureName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchDomain = selectedDomain === 'ALL' || item.domain === selectedDomain;
      return matchSearch && matchDomain;
    });
  }, [indicators, searchTerm, selectedDomain]);

  return (
    <div id="population-indicator-table" className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 sm:p-6">
      {/* Header and Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
        <div>
          <h3 className="font-bold text-slate-900 text-lg">Curated Population Health Indicator Directory</h3>
          <p className="text-xs text-slate-500 font-medium">
            Complete data provenance, latest observations, and measurement units across 6 health domains.
          </p>
        </div>

        {/* Search & Domain Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search Box */}
          <div className="relative min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search indicators..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          {/* Domain Filter Dropdown */}
          <div className="relative">
            <select
              value={selectedDomain}
              onChange={(e) => setSelectedDomain(e.target.value)}
              className="pl-3 pr-8 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              {domains.map((d: string) => (
                <option key={d} value={d}>
                  {d === 'ALL' ? 'All Domains' : d.replace(/_/g, ' ').toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto rounded-xl border border-slate-100">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase tracking-wider text-[10px]">
            <tr>
              <th className="py-3 px-4">Indicator / Description</th>
              <th className="py-3 px-3">Domain</th>
              <th className="py-3 px-3">Source</th>
              <th className="py-3 px-3 text-right">Latest Value</th>
              <th className="py-3 px-3">Unit</th>
              <th className="py-3 px-4">Year Coverage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {filteredIndicators.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-400 font-medium">
                  No indicators match your filter criteria.
                </td>
              </tr>
            ) : (
              filteredIndicators.map((ind) => {
                const isNfhs = ind.source === 'NFHS-5';
                return (
                  <tr
                    key={ind.featureName}
                    onClick={() => onSelectIndicator && onSelectIndicator(ind.featureName)}
                    className="hover:bg-blue-50/40 transition-colors cursor-pointer group"
                  >
                    <td className="py-3 px-4 font-semibold text-slate-900 group-hover:text-blue-700">
                      <div>{ind.description}</div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">{ind.featureName}</div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="capitalize text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                        {ind.domain.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          isNfhs
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-indigo-100 text-indigo-800'
                        }`}
                      >
                        {ind.source}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-extrabold text-slate-900 text-sm">
                      {ind.latestValue !== null && ind.latestValue !== undefined ? (
                        typeof ind.latestValue === 'number' ? (
                          ind.unit === 'percentage' ? (
                            `${ind.latestValue}%`
                          ) : (
                            ind.latestValue.toLocaleString()
                          )
                        ) : (
                          ind.latestValue
                        )
                      ) : (
                        <span className="text-slate-400 font-normal italic text-xs">insufficient_data</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-slate-500 text-[11px]">
                      {ind.unit.replace(/_/g, ' ')}
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-medium text-[11px]">
                      {ind.coverage}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
        <span>Showing {filteredIndicators.length} of {indicators.length} curated indicators</span>
        <span className="italic">Click any row to inspect trend or provenance</span>
      </div>
    </div>
  );
};
