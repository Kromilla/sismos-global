import { useCallback, useState } from "react";

export interface GeoCoords {
  lat: number;
  lon: number;
}

export function useGeolocation() {
  const [coords, setCoords] = useState<GeoCoords | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestLocation = useCallback(
    (onSuccess?: (pos: GeoCoords) => void) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        setError("Geolocalización no soportada en este navegador");
        return;
      }
      setLoading(true);
      setError(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const next = {
            lat: Number(pos.coords.latitude.toFixed(4)),
            lon: Number(pos.coords.longitude.toFixed(4)),
          };
          setCoords(next);
          setLoading(false);
          onSuccess?.(next);
        },
        (err) => {
          setError(err.message || "No se pudo obtener la ubicación");
          setLoading(false);
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
      );
    },
    [],
  );

  return {
    coords,
    loading,
    error,
    requestLocation,
    request: () => requestLocation(),
  };
}
