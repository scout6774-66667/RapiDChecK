import { useState, useEffect, useCallback } from 'react';
import { useMapsLibrary, useMap } from '@vis.gl/react-google-maps';
import type {
  UserLocation,
  NearbyHealthcareFacility,
  NearbyFacilityCategory,
  NearbyRadiusKm,
} from '../types/location';
import { calculateDistanceKm, formatDistance } from '../utils/distance';

interface UseNearbyPlacesProps {
  userLocation: UserLocation | null;
  radiusKm: NearbyRadiusKm;
  category: NearbyFacilityCategory;
  isOffline?: boolean;
}

export function useNearbyPlaces({
  userLocation,
  radiusKm,
  category,
  isOffline = false,
}: UseNearbyPlacesProps) {
  const [facilities, setFacilities] = useState<NearbyHealthcareFacility[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const placesLibrary = useMapsLibrary('places');
  const map = useMap();

  const fetchNearby = useCallback(() => {
    if (!userLocation || isOffline) {
      setFacilities([]);
      setLoading(false);
      return;
    }

    if (!placesLibrary) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Use map container or fallback dummy node for PlacesService
      const dummyNode = document.createElement('div');
      const service = new placesLibrary.PlacesService(map || dummyNode);

      let placeType = 'hospital';
      let keyword = 'health OR hospital OR clinic OR PHC';

      if (category === 'hospital') {
        placeType = 'hospital';
        keyword = 'hospital OR medical center';
      } else if (category === 'phc') {
        placeType = 'health';
        keyword = 'primary health centre OR PHC OR community health centre';
      } else if (category === 'clinic') {
        placeType = 'doctor';
        keyword = 'clinic OR dispensary OR doctor';
      } else if (category === 'pharmacy') {
        placeType = 'pharmacy';
        keyword = 'pharmacy OR medical store OR chemist';
      } else if (category === 'diagnostic') {
        placeType = 'health';
        keyword = 'diagnostic centre OR medical laboratory OR pathology lab';
      }

      const request: google.maps.places.PlaceSearchRequest = {
        location: new google.maps.LatLng(
          userLocation.latitude,
          userLocation.longitude
        ),
        radius: radiusKm * 1000,
        type: placeType,
        keyword: keyword,
      };

      service.nearbySearch(request, (results, status) => {
        setLoading(false);

        if (status === google.maps.places.PlacesServiceStatus.OK && results) {
          const mapped: NearbyHealthcareFacility[] = results
            .filter((p) => p.geometry?.location)
            .map((p) => {
              const lat = p.geometry!.location!.lat();
              const lng = p.geometry!.location!.lng();
              const dist = calculateDistanceKm(
                userLocation.latitude,
                userLocation.longitude,
                lat,
                lng
              );

              let detectedType: NearbyHealthcareFacility['type'] = 'facility';
              const nameLower = (p.name || '').toLowerCase();
              const types = p.types || [];

              if (nameLower.includes('hospital') || types.includes('hospital')) {
                detectedType = 'hospital';
              } else if (
                nameLower.includes('phc') ||
                nameLower.includes('primary health') ||
                nameLower.includes('community health')
              ) {
                detectedType = 'phc';
              } else if (nameLower.includes('clinic') || types.includes('doctor')) {
                detectedType = 'clinic';
              } else if (
                nameLower.includes('pharmacy') ||
                nameLower.includes('chemist') ||
                types.includes('pharmacy')
              ) {
                detectedType = 'pharmacy';
              } else if (
                nameLower.includes('lab') ||
                nameLower.includes('diagnostic') ||
                nameLower.includes('pathology')
              ) {
                detectedType = 'diagnostic';
              }

              return {
                id: p.place_id || `place-${lat}-${lng}`,
                placeId: p.place_id,
                name: p.name || 'Healthcare Facility',
                type: detectedType,
                latitude: lat,
                longitude: lng,
                address: p.vicinity || p.formatted_address,
                distanceKm: dist,
                distanceFormatted: formatDistance(dist),
                isOpen: p.opening_hours?.isOpen?.() ?? undefined,
                rating: p.rating,
                userRatingsTotal: p.user_ratings_total,
                types: p.types,
                vicinity: p.vicinity,
              };
            })
            // Sort Nearest First
            .sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0));

          setFacilities(mapped);
        } else if (
          status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS
        ) {
          setFacilities([]);
        } else {
          // If Places API status is OVER_QUERY_LIMIT or REQUEST_DENIED
          if (status === google.maps.places.PlacesServiceStatus.REQUEST_DENIED) {
            setError(
              'Places service access denied. Please ensure Places API is enabled in Google Cloud Console.'
            );
          } else {
            setError(`Unable to search nearby places (${status}).`);
          }
        }
      });
    } catch (e: unknown) {
      setLoading(false);
      const msg = e instanceof Error ? e.message : 'Places search error';
      setError(msg);
    }
  }, [userLocation, radiusKm, category, isOffline, placesLibrary, map]);

  useEffect(() => {
    fetchNearby();
  }, [fetchNearby]);

  return {
    facilities,
    loading,
    error,
    refetch: fetchNearby,
  };
}
