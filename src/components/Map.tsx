import React, { useEffect, useRef } from 'react';
import { APIProvider, Map, AdvancedMarker, Pin, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { Map as MapIcon, Camera, ArrowDown, X, MapPin, Type as TextIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface Landmark {
  id: string;
  name: string;
  position: { lat: number; lng: number };
  description?: string;
}

interface MapViewProps {
  apiKey: string;
  landmarks: Landmark[];
  center: { lat: number; lng: number };
  zoom: number;
  selectedLandmark: Landmark | null;
  onLandmarkClick?: (landmark: Landmark) => void;
  onCenterChanged?: (center: { lat: number; lng: number }) => void;
  onZoomChanged?: (zoom: number) => void;
  onMapLoad?: (map: google.maps.Map) => void;
  tilt?: number;
  heading?: number;
  is3DMode?: boolean;
  isStreetView?: boolean;
  isEarthView?: boolean;
  onStreetViewChanged?: (enabled: boolean) => void;
  streetViewPov?: { heading: number; pitch: number };
  onStreetViewPovChanged?: (pov: { heading: number; pitch: number }) => void;
  highlights?: { x: number, y: number, width?: number, height?: number, label: string, id: string, type?: 'box' | 'arrow' | 'marker' | 'text', color?: string }[];
  onHighlightDismiss?: (id: string) => void;
  routePoints?: { lat: number; lng: number }[];
  shouldFitRoute?: boolean;
}

const Polyline = ({ path, strokeColor, strokeOpacity, strokeWeight }: {
  key?: string,
  path: google.maps.LatLngLiteral[],
  strokeColor: string,
  strokeOpacity: number,
  strokeWeight: number
}) => {
  const map = useMap();
  const polylineRef = useRef<google.maps.Polyline | null>(null);

  useEffect(() => {
    if (!map) return;

    polylineRef.current = new google.maps.Polyline({
      path,
      strokeColor,
      strokeOpacity,
      strokeWeight,
      map
    });

    return () => {
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
      }
    };
  }, [map, path, strokeColor, strokeOpacity, strokeWeight]);

  return null;
};

const MapContent = ({
  landmarks,
  center,
  zoom,
  selectedLandmark,
  onLandmarkClick,
  onCenterChanged,
  onZoomChanged,
  onMapLoad,
  tilt,
  heading,
  is3DMode,
  isStreetView,
  isEarthView,
  onStreetViewChanged,
  streetViewPov,
  onStreetViewPovChanged,
  routePoints,
  shouldFitRoute
}: {
  landmarks: Landmark[],
  center: { lat: number; lng: number },
  zoom: number,
  selectedLandmark: Landmark | null,
  onLandmarkClick?: (landmark: Landmark) => void,
  onCenterChanged?: (center: { lat: number; lng: number }) => void,
  onZoomChanged?: (zoom: number) => void,
  onMapLoad?: (map: google.maps.Map) => void,
  tilt?: number,
  heading?: number,
  is3DMode?: boolean,
  isStreetView?: boolean,
  isEarthView?: boolean,
  onStreetViewChanged?: (enabled: boolean) => void,
  streetViewPov?: { heading: number; pitch: number },
  onStreetViewPovChanged?: (pov: { heading: number; pitch: number }) => void,
  routePoints?: { lat: number; lng: number }[],
  shouldFitRoute?: boolean
}) => {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');
  const routesLib = useMapsLibrary('routes');
  const streetViewRef = useRef<HTMLDivElement>(null);
  const panoramaRef = useRef<google.maps.StreetViewPanorama | null>(null);
  const [directionsRenderer, setDirectionsRenderer] = React.useState<google.maps.DirectionsRenderer | null>(null);

  // Track the last center/zoom/pov we sent to the parent to avoid feedback loops
  const lastSentCenterRef = useRef(center);
  const lastSentZoomRef = useRef(zoom);
  const lastSentPovRef = useRef(streetViewPov || { heading: 0, pitch: 0 });

  // Notify parent when map is ready
  useEffect(() => {
    if (map && onMapLoad) {
      onMapLoad(map);
    }
  }, [map, onMapLoad]);

  // Handle User-driven camera updates (only on idle to avoid re-render loops during drag)
  useEffect(() => {
    if (!map) return;

    const listener = map.addListener('idle', () => {
      const newCenter = map.getCenter();
      if (newCenter) {
        const c = { lat: newCenter.lat(), lng: newCenter.lng() };
        // If the map moved significantly from what we last recorded, update parent
        const dist = Math.sqrt(
          Math.pow(c.lat - lastSentCenterRef.current.lat, 2) +
          Math.pow(c.lng - lastSentCenterRef.current.lng, 2)
        );

        if (dist > 0.00001) {
          lastSentCenterRef.current = c;
          onCenterChanged?.(c);
        }
      }

      const newZoom = map.getZoom();
      if (newZoom !== undefined && newZoom !== lastSentZoomRef.current) {
        lastSentZoomRef.current = newZoom;
        onZoomChanged?.(newZoom);
      }
    });

    return () => listener.remove();
  }, [map, onCenterChanged, onZoomChanged]);

  // Handle AI-driven camera updates
  useEffect(() => {
    if (map && center) {
      // Check if the incoming center prop is different from what the map currently has
      // AND different from what we last sent (meaning it came from the AI)
      const currentCenter = map.getCenter();
      if (!currentCenter) return;

      const distFromCurrent = Math.sqrt(
        Math.pow(currentCenter.lat() - center.lat, 2) +
        Math.pow(currentCenter.lng() - center.lng, 2)
      );

      const distFromLastSent = Math.sqrt(
        Math.pow(center.lat - lastSentCenterRef.current.lat, 2) +
        Math.pow(center.lng - lastSentCenterRef.current.lng, 2)
      );

      // If the parent (AI) provided a center that is different from our last known state, pan to it smoothly
      if (distFromLastSent > 0.0001 && distFromCurrent > 0.0001) {
        map.panTo(center);

        // Stagger other updates for a more cinematic feel
        if (zoom !== undefined && Math.abs(map.getZoom()! - zoom) > 0.1) {
          setTimeout(() => map.setZoom(zoom), 300);
        }
        if (tilt !== undefined) {
          setTimeout(() => map.setTilt(tilt), 600);
        }
        if (heading !== undefined) {
          setTimeout(() => map.setHeading(heading), 900);
        }

        lastSentCenterRef.current = center;
        lastSentZoomRef.current = zoom || lastSentZoomRef.current;
      }
    }
  }, [map, center, zoom, tilt, heading]);

  useEffect(() => {
    if (map && zoom !== undefined && !center) {
      if (Math.abs(map.getZoom()! - zoom) > 0.1 && Math.abs(zoom - lastSentZoomRef.current) > 0.1) {
        map.setZoom(zoom);
        lastSentZoomRef.current = zoom;
      }
    }
  }, [map, zoom, center]);

  useEffect(() => {
    if (map && tilt !== undefined) {
      map.setTilt(tilt);
    }
  }, [map, tilt]);

  useEffect(() => {
    if (map && heading !== undefined) {
      map.setHeading(heading);
    }
  }, [map, heading]);

  useEffect(() => {
    if (map) {
      if (isEarthView) {
        map.setOptions({
          mapTypeId: 'satellite'
        });
      } else if (is3DMode) {
        // If Charlie didn't provide a specific tilt, default to 45
        if (tilt === undefined) {
          map.setTilt(45);
        }
        map.setOptions({
          mapTypeId: 'roadmap'
        });
      } else {
        map.setTilt(0);
        map.setHeading(0);
        map.setOptions({
          mapTypeId: 'roadmap'
        });
      }
    }
  }, [map, is3DMode, isEarthView, tilt]);

  // Initialize DirectionsRenderer
  useEffect(() => {
    if (map && routesLib && !directionsRenderer) {
      const renderer = new google.maps.DirectionsRenderer({
        map,
        suppressMarkers: true, // We use our own markers
        polylineOptions: {
          strokeColor: '#10b981',
          strokeOpacity: 0.8,
          strokeWeight: 6,
        }
      });
      setDirectionsRenderer(renderer);
    }
  }, [map, routesLib, directionsRenderer]);

  const [fallbackPath, setFallbackPath] = React.useState<google.maps.LatLngLiteral[] | null>(null);

  // Handle Route Drawing with road-following
  useEffect(() => {
    if (!map || !routePoints || routePoints.length < 2) {
      // If we don't have enough points, clear everything
      if (directionsRenderer) {
        try {
          directionsRenderer.setDirections({ routes: [] } as any);
        } catch (e) {
          try {
            directionsRenderer.setDirections(null);
          } catch (err) { }
        }
      }
      setFallbackPath(null);
      return;
    }

    // If we have points but no routes API yet, instantly draw the fallback line so the user isn't left waiting
    if (!routesLib || !directionsRenderer) {
      setFallbackPath(routePoints);
      if (shouldFitRoute) {
        const bounds = new google.maps.LatLngBounds();
        routePoints.forEach(p => bounds.extend(p));
        map.fitBounds(bounds, { top: 100, bottom: 100, left: 100, right: 100 });
      }
      return;
    }

    const directionsService = new google.maps.DirectionsService();
    const origin = routePoints[0];
    const destination = routePoints[routePoints.length - 1];
    const waypoints = routePoints.slice(1, -1).map(p => ({
      location: new google.maps.LatLng(p.lat, p.lng),
      stopover: true
    }));

    directionsService.route({
      origin: new google.maps.LatLng(origin.lat, origin.lng),
      destination: new google.maps.LatLng(destination.lat, destination.lng),
      waypoints: waypoints,
      travelMode: google.maps.TravelMode.DRIVING,
    }, (result, status) => {
      if (status === google.maps.DirectionsStatus.OK && result) {
        try {
          directionsRenderer.setDirections(result);
          setFallbackPath(null);

          // Fit bounds to show the entire route only if requested
          if (shouldFitRoute) {
            const bounds = new google.maps.LatLngBounds();
            result.routes[0].overview_path.forEach(point => bounds.extend(point));
            map.fitBounds(bounds, { top: 100, bottom: 100, left: 100, right: 100 });
          }
        } catch (e) {
          console.error("Error setting directions:", e);
        }
      } else {
        console.warn("Directions request failed:", status, ". Falling back to straight lines.");
        setFallbackPath(routePoints);

        if (status === 'REQUEST_DENIED') {
          console.info("TIP: Enable 'Directions API' in Google Cloud Console for road-following routes.");
        }

        if (shouldFitRoute) {
          const bounds = new google.maps.LatLngBounds();
          routePoints.forEach(p => bounds.extend(p));
          map.fitBounds(bounds, { top: 100, bottom: 100, left: 100, right: 100 });
        }
      }
    });

  }, [map, routesLib, directionsRenderer, routePoints, shouldFitRoute]);

  // Handle Street View Initialization and Updates
  useEffect(() => {
    if (!map || !isStreetView || !streetViewRef.current) {
      if (panoramaRef.current) {
        panoramaRef.current.setVisible(false);
      }
      return;
    }

    if (!panoramaRef.current) {
      panoramaRef.current = new google.maps.StreetViewPanorama(streetViewRef.current, {
        position: center,
        pov: streetViewPov || { heading: 0, pitch: 0 },
        visible: true,
        addressControl: false,
        showRoadLabels: true,
        motionTracking: true,
        motionTrackingControl: false,
        zoomControl: true,
        panControl: true,
        enableCloseButton: false,
        clickToGo: true,
        linksControl: true,
        scrollwheel: true,
      });

      panoramaRef.current.addListener('pov_changed', () => {
        if (panoramaRef.current) {
          const newPov = panoramaRef.current.getPov();
          if (Math.abs(newPov.heading - lastSentPovRef.current.heading) > 0.1 ||
            Math.abs(newPov.pitch - lastSentPovRef.current.pitch) > 0.1) {
            lastSentPovRef.current = newPov;
            onStreetViewPovChanged?.(newPov);
          }
        }
      });

      panoramaRef.current.addListener('visible_changed', () => {
        if (panoramaRef.current) {
          const visible = panoramaRef.current.getVisible();
          onStreetViewChanged?.(visible);
          if (visible) {
            // Force a resize when it becomes visible to fix potential rendering issues
            google.maps.event.trigger(panoramaRef.current, 'resize');
          }
        }
      });

      panoramaRef.current.addListener('position_changed', () => {
        if (panoramaRef.current) {
          const newPos = panoramaRef.current.getPosition();
          if (newPos) {
            const c = { lat: newPos.lat(), lng: newPos.lng() };
            if (Math.abs(c.lat - lastSentCenterRef.current.lat) > 0.00001 ||
              Math.abs(c.lng - lastSentCenterRef.current.lng) > 0.00001) {
              lastSentCenterRef.current = c;
              onCenterChanged?.(c);
            }
          }
        }
      });
    } else {
      // Check if position actually changed to trigger a "movement" effect
      const currentPos = panoramaRef.current.getPosition();
      const posChanged = currentPos && (
        Math.abs(currentPos.lat() - center.lat) > 0.00001 ||
        Math.abs(currentPos.lng() - center.lng) > 0.00001
      );

      if (posChanged) {
        // Trigger a subtle "flash" effect on the container
        if (streetViewRef.current) {
          streetViewRef.current.animate([
            { filter: 'brightness(1)' },
            { filter: 'brightness(1.2)' },
            { filter: 'brightness(1)' }
          ], {
            duration: 300,
            easing: 'ease-out'
          });
        }
      }

      panoramaRef.current.setPosition(center);
      panoramaRef.current.setVisible(true);

      if (streetViewPov) {
        const currentPov = panoramaRef.current.getPov();
        if (Math.abs(currentPov.heading - streetViewPov.heading) > 0.1 ||
          Math.abs(currentPov.pitch - streetViewPov.pitch) > 0.1) {
          panoramaRef.current.setPov(streetViewPov);
          lastSentPovRef.current = streetViewPov;
        }
      }
    }
  }, [map, isStreetView, center, streetViewPov]);

  // 3D Rotation Animation
  useEffect(() => {
    if (!map || !is3DMode || isStreetView) return;

    let animationFrame: number;
    let lastTime = performance.now();

    const rotate = (time: number) => {
      const deltaTime = time - lastTime;
      lastTime = time;

      const currentHeading = map.getHeading() || 0;
      // Dynamic rotation speed: faster if a landmark is selected to "orbit" it
      const speed = selectedLandmark ? 0.12 : 0.06;

      // Smoothly adjust heading
      map.setHeading(currentHeading + (speed * (deltaTime / 16.67)));

      // Add a slight "breathing" effect to the tilt if a landmark is selected
      if (selectedLandmark) {
        const tiltCycle = Math.sin(time / 2000) * 5; // +/- 5 degrees
        map.setTilt(45 + tiltCycle);
      }

      animationFrame = requestAnimationFrame(rotate);
    };

    animationFrame = requestAnimationFrame(rotate);
    return () => cancelAnimationFrame(animationFrame);
  }, [map, is3DMode, selectedLandmark]);

  return (
    <React.Fragment>
      <motion.div
        ref={streetViewRef}
        initial={{ opacity: 0 }}
        animate={{
          opacity: isStreetView ? 1 : 0,
        }}
        transition={{ duration: 0.5, ease: "easeInOut" }}
        style={{
          willChange: "opacity",
          backgroundColor: "#000"
        }}
        className={cn(
          "absolute inset-0 z-50 overflow-hidden",
          isStreetView ? "pointer-events-auto" : "pointer-events-none"
        )}
      />



      {/* Fallback Polyline for when Directions API is disabled */}
      {fallbackPath && !isStreetView && (
        <Polyline
          key="fallback-polyline"
          path={fallbackPath}
          strokeColor="#10b981"
          strokeOpacity={0.8}
          strokeWeight={4}
        />
      )}

      {!isStreetView && landmarks.map((landmark, index) => {
        if (!landmark.position) return null;
        return (
          <AdvancedMarker
            key={`${landmark.id}-${index}`}
            position={landmark.position}
            onClick={() => onLandmarkClick?.(landmark)}
          >
            <div className={cn(
              "relative flex items-center justify-center transition-all duration-500",
              is3DMode ? "scale-150" : "scale-100"
            )}>
              <div className="absolute w-8 h-8 bg-emerald-500/30 rounded-full animate-ping" />
              <Pin
                background={'#10b981'}
                glyphColor={'#000'}
                borderColor={'#fff'}
                scale={is3DMode ? 1.4 : 1.1}
              />
            </div>
          </AdvancedMarker>
        );
      })}
    </React.Fragment>
  );
};

export const GoogleMapView: React.FC<MapViewProps> = ({
  apiKey,
  landmarks,
  center,
  zoom,
  tilt,
  heading,
  selectedLandmark,
  onLandmarkClick,
  onCenterChanged,
  onZoomChanged,
  onMapLoad,
  is3DMode = false,
  isStreetView = false,
  isEarthView = false,
  onStreetViewChanged,
  streetViewPov,
  onStreetViewPovChanged,
  highlights,
  onHighlightDismiss,
  routePoints,
  shouldFitRoute
}) => {
  if (!apiKey) {
    return (
      <div className="w-full h-full bg-slate-900 flex items-center justify-center p-12 text-center">
        <div className="max-w-md space-y-4">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto">
            <MapIcon className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-2xl font-bold text-white">Map Configuration Required</h2>
          <p className="text-slate-400 text-sm">
            Please provide a valid Google Maps API Key in your environment variables (VITE_GOOGLE_MAPS_API_KEY).
          </p>
          <div className="bg-slate-800/50 rounded-xl p-4 text-left border border-slate-700">
            <p className="text-xs text-slate-300 font-bold mb-2 uppercase tracking-wider">Required APIs to enable:</p>
            <ul className="text-xs text-slate-400 space-y-1 list-disc pl-4">
              <li>Maps JavaScript API</li>
              <li>Geocoding API (for location display)</li>
              <li>Directions API (for tour routes)</li>
            </ul>
          </div>
          <p className="text-[10px] text-slate-500">
            Check your <a href="https://console.cloud.google.com/google/maps-apis/api-list" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">Google Cloud Console</a> to enable these services.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
      <APIProvider apiKey={apiKey}>
        <Map
          defaultCenter={center}
          defaultZoom={zoom}
          mapId="DEMO_MAP_ID"
          gestureHandling={'greedy'}
          disableDefaultUI={true}
          className="w-full h-full"
        >
          <MapContent
            landmarks={landmarks}
            center={center}
            zoom={zoom}
            tilt={tilt}
            heading={heading}
            selectedLandmark={selectedLandmark}
            onLandmarkClick={onLandmarkClick}
            onCenterChanged={onCenterChanged}
            onZoomChanged={onZoomChanged}
            onMapLoad={onMapLoad}
            is3DMode={is3DMode}
            isStreetView={isStreetView}
            isEarthView={isEarthView}
            onStreetViewChanged={onStreetViewChanged}
            streetViewPov={streetViewPov}
            onStreetViewPovChanged={onStreetViewPovChanged}
            routePoints={routePoints}
            shouldFitRoute={shouldFitRoute}
          />
        </Map>
      </APIProvider>

    </div>
  );
};
