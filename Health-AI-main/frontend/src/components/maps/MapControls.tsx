import React from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { Plus, Minus, RotateCcw, Maximize2 } from 'lucide-react';
import type { VillageLocation } from '../../types/map';
import { DEFAULT_MAP_CENTER, DEFAULT_ZOOM } from '../../data/villageLocations';

interface MapControlsProps {
  locations: VillageLocation[];
  onReset?: () => void;
}

export const MapControls: React.FC<MapControlsProps> = ({ locations, onReset }) => {
  const map = useMap();

  const handleZoomIn = () => {
    if (!map) return;
    const currentZoom = map.getZoom() || DEFAULT_ZOOM;
    map.setZoom(currentZoom + 1);
  };

  const handleZoomOut = () => {
    if (!map) return;
    const currentZoom = map.getZoom() || DEFAULT_ZOOM;
    map.setZoom(currentZoom - 1);
  };

  const handleResetView = () => {
    if (!map) return;
    map.setCenter({
      lat: DEFAULT_MAP_CENTER.lat,
      lng: DEFAULT_MAP_CENTER.lng,
    });
    map.setZoom(DEFAULT_ZOOM);
    onReset?.();
  };

  const handleFitBounds = () => {
    if (!map || locations.length === 0) {
      handleResetView();
      return;
    }

    if (typeof google !== 'undefined' && google.maps && google.maps.LatLngBounds) {
      const bounds = new google.maps.LatLngBounds();
      locations.forEach((loc) => {
        bounds.extend({ lat: loc.latitude, lng: loc.longitude });
      });
      map.fitBounds(bounds, {
        top: 40,
        bottom: 55,
        left: 40,
        right: 40,
      });
    }
  };

  return (
    <>
      {/* Centered Floating Pill: Fit All & Reset Controls */}
      <div className="absolute bottom-3.5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 bg-white/95 backdrop-blur-md px-2 py-1.5 rounded-xl border border-[#E5EEF1] shadow-lg pointer-events-auto select-none">
        <button
          type="button"
          onClick={handleFitBounds}
          title="Fit all village locations into view"
          aria-label="Fit all locations into view"
          className="px-2.5 py-1 rounded-lg text-slate-700 hover:text-[#102A56] hover:bg-slate-100/90 transition-colors flex items-center gap-1.5 text-xs font-bold cursor-pointer"
        >
          <Maximize2 className="w-3.5 h-3.5 text-[#0A9F68]" />
          <span>Fit All</span>
        </button>

        <span className="w-px h-4 bg-slate-200" />

        <button
          type="button"
          onClick={handleResetView}
          title="Reset map view to default region"
          aria-label="Reset map view"
          className="px-2.5 py-1 rounded-lg text-slate-700 hover:text-[#102A56] hover:bg-slate-100/90 transition-colors flex items-center gap-1.5 text-xs font-bold cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
          <span>Reset</span>
        </button>
      </div>

      {/* Top Right Zoom Controls */}
      <div className="absolute top-3 right-3 z-20 flex flex-col bg-white/95 backdrop-blur-md rounded-xl border border-[#E5EEF1] shadow-md overflow-hidden pointer-events-auto select-none">
        <button
          type="button"
          onClick={handleZoomIn}
          title="Zoom In"
          aria-label="Zoom in"
          className="p-2 text-slate-600 hover:text-[#102A56] hover:bg-slate-100 transition-colors border-b border-slate-100 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          title="Zoom Out"
          aria-label="Zoom out"
          className="p-2 text-slate-600 hover:text-[#102A56] hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <Minus className="w-4 h-4" />
        </button>
      </div>
    </>
  );
};
