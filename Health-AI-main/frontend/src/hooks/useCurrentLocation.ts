import { useState, useCallback } from 'react';
import type { UserLocation, LocationPermissionState } from '../types/location';

export function useCurrentLocation() {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionState, setPermissionState] =
    useState<LocationPermissionState>('not_requested');

  const requestLocation = useCallback(async (): Promise<UserLocation | null> => {
    // 1. Check Geolocation API support
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setPermissionState('unsupported');
      setError('Your browser does not support location services.');
      return null;
    }

    // 2. Check Secure Context (required by modern browsers for Geolocation)
    if (window.isSecureContext === false && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      setPermissionState('unsupported');
      setError('Geolocation requires a secure connection (HTTPS or localhost).');
      return null;
    }

    setLoading(true);
    setError(null);
    setPermissionState('requesting');

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          // Exact, raw coordinates directly from device hardware
          const exactLat = position.coords.latitude;
          const exactLng = position.coords.longitude;
          const exactAccuracy = position.coords.accuracy;

          const userLoc: UserLocation = {
            latitude: exactLat,
            longitude: exactLng,
            accuracy: exactAccuracy,
          };

          setLocation(userLoc);
          setPermissionState('granted');
          setLoading(false);
          setError(null);
          resolve(userLoc);
        },
        (err) => {
          setLoading(false);
          let state: LocationPermissionState = 'unavailable';
          let errorMessage = 'Unable to determine your current location.';

          if (err.code === err.PERMISSION_DENIED) {
            state = 'denied';
            errorMessage =
              'Location permission is blocked. Please allow location access in your browser settings to find nearby healthcare.';
          } else if (err.code === err.TIMEOUT) {
            state = 'timeout';
            errorMessage = 'Location detection timed out. Please try again.';
          } else if (err.code === err.POSITION_UNAVAILABLE) {
            state = 'unavailable';
            errorMessage =
              'Your device could not determine your location. Please check device location services and GPS / Wi-Fi availability.';
          }

          setPermissionState(state);
          setError(errorMessage);
          resolve(null);
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0, // Force fresh hardware GPS reading (no stale cached coordinates)
        }
      );
    });
  }, []);

  const clearLocation = useCallback(() => {
    setLocation(null);
    setPermissionState('not_requested');
    setError(null);
    setLoading(false);
  }, []);

  return {
    location,
    loading,
    error,
    permissionState,
    requestLocation,
    clearLocation,
  };
}
