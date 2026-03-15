import { useState, useCallback, useRef } from 'react';

/**
 * Custom hook for handling map location updates
 */
const useLocation = () => {
  const [location, setLocation] = useState('Loading location...');
  const [lat, setLat] = useState(0);
  const [lng, setLng] = useState(0);
  const mapRef = useRef<google.maps.Map | null>(null);

  const handleMapLoad = useCallback((map: google.maps.Map) => {
    if (!map || mapRef.current === map) return;
    mapRef.current = map;

    const geocoder = new window.google.maps.Geocoder();

    const updateLocation = () => {
      const center = map.getCenter();
      if (!center) return;
      
      geocoder.geocode({ location: { lat: center.lat(), lng: center.lng() } })
        .then((response) => {
          setLat(center.lat());
          setLng(center.lng());
          if (response.results[0]) {
            setLocation(response.results[0].formatted_address);
          } else {
            setLocation(`${center.lat().toFixed(4)}, ${center.lng().toFixed(4)}`);
          }
        })
        .catch((error) => {
          console.warn('Geocoder failed:', error);
          setLat(center.lat());
          setLng(center.lng());
          
          const coords = `${center.lat().toFixed(4)}, ${center.lng().toFixed(4)}`;
          
          if (error && typeof error === 'object' && 'code' in error && error.code === 'REQUEST_DENIED') {
            console.info('TIP: Enable Geocoding API in Google Cloud Console for full addresses.');
            setLocation(`Location: ${coords}`);
          } else {
            setLocation(coords);
          }
        });
    };

    updateLocation();
    map.addListener('idle', updateLocation);
  }, []);

  return { location, handleMapLoad, lat, lng };
};

export default useLocation;
