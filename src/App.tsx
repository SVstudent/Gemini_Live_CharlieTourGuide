import React, { useState, useEffect, useRef, useCallback, Component } from 'react';
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { GoogleMapView } from './components/Map';
import { GeminiLiveService } from './services/geminiLive';
import LandingPage from './components/LandingPage';
import { Map as MapIcon, Globe, Compass, Navigation, Info, Menu, X, Mic, MicOff, Loader2, Camera, Eye, History, MapPin, Clock, Heart, Star, Trash2, ArrowDown, Type as TextIcon, Sparkles, ChevronRight, ChevronLeft, ChevronUp, ChevronDown, RotateCcw, Plane, Hotel, Calendar, ExternalLink, Briefcase, Phone, Shield, DollarSign, Utensils } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import useLocation from './hooks/useLocation';
import { toJpeg } from 'html-to-image';
import { auth, db, loginWithGoogle, logout, handleFirestoreError, OperationType } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, orderBy, deleteDoc, doc, setDoc } from 'firebase/firestore';

// Error Boundary Component
interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorInfo: string | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState;
  public props: ErrorBoundaryProps;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorInfo: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, errorInfo: error.message };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let displayMessage = "Something went wrong.";
      try {
        const parsed = JSON.parse(this.state.errorInfo || "{}");
        if (parsed.error) {
          displayMessage = `Firestore Error: ${parsed.error} (${parsed.operationType} at ${parsed.path})`;
        }
      } catch (e) {
        displayMessage = this.state.errorInfo || displayMessage;
      }

      return (
        <div className="min-h-screen bg-black flex items-center justify-center p-8 text-center">
          <div className="max-w-md w-full bg-white/5 border border-white/10 p-8 rounded-3xl backdrop-blur-xl">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <X className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-4">System Error</h2>
            <p className="text-white/60 mb-8 leading-relaxed">
              {displayMessage}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-4 bg-white text-black font-bold rounded-2xl hover:bg-white/90 transition-colors"
            >
              Restart Charlie
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Types
// App config store for pure functions
export const apiStore = {
  geminiKey: process.env.GEMINI_API_KEY || ""
};

interface Landmark {
  id: string;
  name: string;
  position: { lat: number; lng: number };
  description?: string;
}

interface VisitedLocation {
  id: number;
  landmark_id?: string;
  name: string;
  lat: number;
  lng: number;
  description?: string;
  timestamp: string;
}

interface TripPlan {
  destination: string;
  days: number;
  totalEstimatedCost: string;
  itinerary: {
    day: number;
    theme: string;
    activities: {
      time: string;
      description: string;
      location: string;
      cost: string;
      travelTimeFromPrevious?: string;
    }[];
    mealPlan?: {
      breakfast?: string;
      lunch?: string;
      dinner?: string;
    };
  }[];
  hotels?: {
    name: string;
    rating: number;
    pricePerNight: string;
    bookingUrl: string;
    agency?: string;
    address?: string;
    phone?: string;
    confirmationNumber?: string;
    checkInDate?: string;
    checkOutDate?: string;
  }[];
  transport?: {
    type: string;
    provider: string;
    estimatedPrice: string;
    bookingUrl: string;
    notes?: string;
    transitNumber?: string;
    departureTime?: string;
    arrivalTime?: string;
    terminal?: string;
    confirmationNumber?: string;
  }[];
  emergencyContacts?: {
    name: string;
    phone: string;
    service: string;
  }[];
  budgetBreakdown?: {
    category: string;
    amount: string;
    currency: string;
  }[];
  travelTips?: {
    category: string; // e.g., 'Packing', 'Customs', 'Health'
    advice: string;
  }[];
  contingencyBuffer?: string;
  agencies?: {
    name: string;
    specialty: string;
    website: string;
  }[];
}

interface PlaceInsights {
  landmarkId: string;
  placeDetails: {
    address?: string;
    rating?: number;
    openingHours?: string;
    phoneNumber?: string;
    website?: string;
  };
  culturalTips: { title: string; content: string }[];
}

// Helper to search for a location using standard Gemini API
async function searchLocation(query: string, lat: number, lng: number): Promise<Landmark | null> {
  const ai = new GoogleGenAI({ apiKey: apiStore.geminiKey });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Search for "${query}" near (${lat}, ${lng}). Return its coordinates and a brief description as JSON.`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            name: { type: Type.STRING },
            lat: { type: Type.NUMBER },
            lng: { type: Type.NUMBER },
            description: { type: Type.STRING },
          },
          required: ['id', 'name', 'lat', 'lng', 'description'],
        },
      },
    });

    const item = JSON.parse(response.text || '{}');
    if (!item.lat || !item.lng) return null;

    return {
      id: item.id || `search-${Date.now()}`,
      name: item.name || query,
      position: { lat: item.lat, lng: item.lng },
      description: item.description
    };
  } catch (error) {
    console.error("Error searching location:", error);
    return null;
  }
}

// Helper to get themed landmarks using standard Gemini API
async function getThemedLandmarks(theme: string, city: string, lat: number, lng: number): Promise<Landmark[]> {
  const ai = new GoogleGenAI({ apiKey: apiStore.geminiKey });
  try {
    console.log(`Getting themed landmarks for ${theme} in ${city}...`);
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Find 4 unique, real-world landmarks for a "${theme}" tour in ${city}. 
      Use the coordinates of ${city} as a reference. 
      Return a JSON array of objects with: id (unique string), name (landmark name), lat (number), lng (number), description (brief).`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              name: { type: Type.STRING },
              lat: { type: Type.NUMBER },
              lng: { type: Type.NUMBER },
              description: { type: Type.STRING },
            },
            required: ['id', 'name', 'lat', 'lng', 'description'],
          },
        },
      },
    });

    const data = JSON.parse(response.text || '[]');
    console.log(`Found ${data.length} landmarks for ${theme} in ${city}`);
    return data
      .filter((item: any) => item.lat && item.lng)
      .map((item: any) => ({
        id: item.id || `landmark-${Math.random()}`,
        name: item.name,
        position: { lat: item.lat, lng: item.lng },
        description: item.description
      }));
  } catch (error) {
    console.error("Error fetching themed landmarks:", error);
    return [];
  }
}

// Helper to get place insights using standard Gemini API
async function getLandmarkInsights(landmarkName: string): Promise<Partial<PlaceInsights>> {
  const ai = new GoogleGenAI({ apiKey: apiStore.geminiKey });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Cultural insights for "${landmarkName}". Include placeDetails (address, rating, openingHours, website) and 5-10 culturalTips (title, content).`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            placeDetails: {
              type: Type.OBJECT,
              properties: {
                address: { type: Type.STRING },
                rating: { type: Type.NUMBER },
                openingHours: { type: Type.STRING },
                website: { type: Type.STRING },
              }
            },
            culturalTips: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  content: { type: Type.STRING },
                },
                required: ['title', 'content']
              }
            }
          },
          required: ['culturalTips']
        },
      },
    });

    return JSON.parse(response.text || '{}');
  } catch (error) {
    console.error("Error fetching landmark insights:", error);
    return { culturalTips: [] };
  }
}

export default function App() {
  const [appConfig, setAppConfig] = useState({
    geminiKey: process.env.GEMINI_API_KEY || "",
    mapsKey: import.meta.env?.VITE_GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || ""
  });
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcriptions, setTranscriptions] = useState<{ text: string; isUser: boolean; id: number }[]>([]);
  const [landmarks, setLandmarks] = useState<Landmark[]>([]);
  const [mapCenter, setMapCenter] = useState({ lat: 37.7749, lng: -122.4194 }); // SF Default
  const [mapZoom, setMapZoom] = useState(12);
  const [mapTilt, setMapTilt] = useState(0);
  const [mapHeading, setMapHeading] = useState(0);
  const [selectedLandmark, setSelectedLandmark] = useState<Landmark | null>(null);
  const [placeInsights, setPlaceInsights] = useState<Record<string, PlaceInsights>>({});
  const [activeTipIndex, setActiveTipIndex] = useState(0);
  const [is3DMode, setIs3DMode] = useState(false);
  const [isStreetView, setIsStreetView] = useState(false);
  const [isEarthView, setIsEarthView] = useState(false);
  const [streetViewPov, setStreetViewPov] = useState({ heading: 0, pitch: 0 });
  const [highlights, setHighlights] = useState<{ x: number, y: number, width?: number, height?: number, label: string, id: string, type?: 'box' | 'arrow' | 'marker' | 'text', color?: string }[]>([]);
  const [routePoints, setRoutePoints] = useState<{ lat: number; lng: number }[]>([]);
  const [shouldFitRoute, setShouldFitRoute] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isVisionActive, setIsVisionActive] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [lastVisionFrame, setLastVisionFrame] = useState<string | null>(null);
  const [isWandering, setIsWandering] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [favorites, setFavorites] = useState<Landmark[]>([]);
  const [history, setHistory] = useState<VisitedLocation[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyTab, setHistoryTab] = useState<'history' | 'favorites'>('history');
  const [charlieInsights, setCharlieInsights] = useState<{ title: string; content: string } | null>(null);
  const [dismissedLandmarkId, setDismissedLandmarkId] = useState<string | null>(null);
  const [moveDirection, setMoveDirection] = useState<number | null>(null);
  const [showLanding, setShowLanding] = useState(true);
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
  const [isTripPlannerOpen, setIsTripPlannerOpen] = useState(false);
  const [currentTripPlan, setCurrentTripPlan] = useState<TripPlan | null>(null);
  const [showInterruptionFlash, setShowInterruptionFlash] = useState(false);

  const tourSuggestions = [
    {
      id: 'sf-gg',
      title: 'Golden Gate Exploration',
      city: 'San Francisco',
      description: 'Explore the iconic bridge, its history, and the surrounding Presidio.',
      image: 'https://images.unsplash.com/photo-1449034446853-66c86144b0ad?auto=format&fit=crop&w=800&q=80',
      prompt: 'Take me on a tour of the Golden Gate Bridge and its surrounding history.'
    },
    {
      id: 'paris-mont',
      title: 'Artistic Montmartre',
      city: 'Paris',
      description: 'Walk through the bohemian streets where Picasso and Van Gogh once lived.',
      image: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=800&q=80',
      prompt: 'I want to explore the artistic history of Montmartre in Paris.'
    },
    {
      id: 'tokyo-shinjuku',
      title: 'Neon Shinjuku',
      city: 'Tokyo',
      description: 'Discover the vibrant nightlife, hidden alleys, and futuristic skyscrapers.',
      image: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=800&q=80',
      prompt: 'Show me the vibrant neon lights and hidden gems of Shinjuku, Tokyo.'
    },
    {
      id: 'rome-col',
      title: 'Ancient Colosseum',
      city: 'Rome',
      description: 'Step back in time to the era of gladiators and the Roman Empire.',
      image: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&w=800&q=80',
      prompt: 'Let\'s walk through the history of the Roman Colosseum and the Forum.'
    },
    {
      id: 'ny-cp',
      title: 'Central Park Secrets',
      city: 'New York',
      description: 'Uncover the hidden statues, bridges, and stories of the world\'s most famous park.',
      image: 'https://images.unsplash.com/photo-1523292562811-8fa7962a78c8?auto=format&fit=crop&w=800&q=80',
      prompt: 'Discover the hidden secrets and landmarks of Central Park in New York.'
    },
    {
      id: 'london-west',
      title: 'Royal Westminster',
      city: 'London',
      description: 'Visit the heart of British power, from Big Ben to Westminster Abbey.',
      image: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=800&q=80',
      prompt: 'Guide me through the royal history of Westminster Abbey and Big Ben in London.'
    }
  ];

  const handleSuggestionClick = (suggestion: typeof tourSuggestions[0]) => {
    if (geminiLiveRef.current) {
      geminiLiveRef.current.sendText(suggestion.prompt);
      setIsSuggestionsOpen(false);
    }
  };

  const lastMoveTimeRef = useRef<number>(0);

  const { location: currentAddress, handleMapLoad, lat: currentLat, lng: currentLng } = useLocation();
  const currentLocationRef = useRef({ lat: 37.7749, lng: -122.4194 });

  useEffect(() => {
    if (currentLat !== 0 || currentLng !== 0) {
      currentLocationRef.current = { lat: currentLat, lng: currentLng };
    }
  }, [currentLat, currentLng]);

  const geminiLiveRef = useRef<GeminiLiveService | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const captureContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioQueueRef = useRef<string[]>([]);
  const isProcessingQueueRef = useRef(false);
  const nextStartTimeRef = useRef<number>(0);
  const videoIntervalRef = useRef<any>(null);
  const visionIntervalRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const landmarksRef = useRef<Landmark[]>([]);

  useEffect(() => {
    landmarksRef.current = landmarks;
  }, [landmarks]);

  // Fetch history on mount and config
  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        if (data.googleMapsApiKey || data.geminiApiKey) {
          setAppConfig(prev => ({
            geminiKey: data.geminiApiKey || prev.geminiKey,
            mapsKey: data.googleMapsApiKey || prev.mapsKey
          }));
          if (data.geminiApiKey) {
            apiStore.geminiKey = data.geminiApiKey;
          }
        }
      })
      .catch(err => console.error("Failed to fetch runtime config:", err));
    // History is now handled by real-time listener
  }, []);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Firestore Real-time Listeners
  useEffect(() => {
    if (!user) {
      setHistory([]);
      setFavorites([]);
      return;
    }

    // History Listener
    const historyQuery = query(
      collection(db, 'visited_locations'),
      where('uid', '==', user.uid),
      orderBy('timestamp', 'desc')
    );

    const unsubscribeHistory = onSnapshot(historyQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as any[];
      setHistory(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'visited_locations');
    });

    // Favorites Listener
    const favoritesQuery = query(
      collection(db, 'favorites'),
      where('uid', '==', user.uid)
    );

    const unsubscribeFavorites = onSnapshot(favoritesQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as any[];
      setFavorites(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'favorites');
    });

    return () => {
      unsubscribeHistory();
      unsubscribeFavorites();
    };
  }, [user]);

  const saveToHistory = async (location: Partial<VisitedLocation>) => {
    if (!user) return;

    try {
      const path = 'visited_locations';
      await addDoc(collection(db, path), {
        ...location,
        uid: user.uid,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'visited_locations');
    }
  };

  // Resume audio context on user interaction
  const resumeAudioContexts = async () => {
    if (!playbackContextRef.current) {
      playbackContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    if (!captureContextRef.current) {
      captureContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    }

    if (playbackContextRef.current?.state === 'suspended') {
      await playbackContextRef.current.resume();
    }
    if (captureContextRef.current?.state === 'suspended') {
      await captureContextRef.current.resume();
    }

    // Warmup: Play a silent buffer to initialize the audio pipeline
    if (playbackContextRef.current) {
      const context = playbackContextRef.current;
      const buffer = context.createBuffer(1, 1, 24000);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.start(0);
    }
  };

  const stopCameraAI = useCallback(() => {
    if (videoIntervalRef.current) {
      clearInterval(videoIntervalRef.current);
      videoIntervalRef.current = null;
    }
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setIsCameraActive(false);
  }, [cameraStream]);

  const startCameraAI = useCallback(async () => {
    if (isCameraActive) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'environment'
        }
      });
      setCameraStream(stream);
      setIsCameraActive(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      videoIntervalRef.current = setInterval(() => {
        if (videoRef.current && canvasRef.current && geminiLiveRef.current && isConnected) {
          const canvas = canvasRef.current;
          const video = videoRef.current;
          const context = canvas.getContext('2d');
          if (context) {
            canvas.width = 320;
            canvas.height = 240;
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const base64 = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
            geminiLiveRef.current.sendVideoFrame(base64);
          }
        }
      }, 1000);
    } catch (error) {
      console.error("Error accessing camera:", error);
    }
  }, [isCameraActive, isConnected]);

  const stopVisionAI = useCallback(() => {
    if (visionIntervalRef.current) {
      clearTimeout(visionIntervalRef.current);
      visionIntervalRef.current = null;
    }
    setIsVisionActive(false);
  }, []);

  const startVisionAI = useCallback(async () => {
    if (isVisionActive) return;
    setIsVisionActive(true);

    const captureFrame = async () => {
      if (!mapContainerRef.current || !geminiLiveRef.current || !isConnected) return;

      try {
        // Use toJpeg with optimized settings to keep payload small but clear
        // We use a fixed width/height to ensure the model gets a consistent aspect ratio
        // and to prevent massive payloads on high-res screens
        const dataUrl = await toJpeg(mapContainerRef.current, {
          quality: 0.7, // Balanced quality for OCR/Grounding
          pixelRatio: 1, // 1:1 with CSS pixels for stability
          width: 1024, // Optimized width for Gemini vision
          height: 768, // Optimized height
          skipFonts: true,
          cacheBust: true,
        });

        const base64 = dataUrl.split(',')[1];
        setLastVisionFrame(dataUrl);
        geminiLiveRef.current.sendVideoFrame(base64);
      } catch (error) {
        console.error("Error capturing screen vision:", error);
      }

      // Schedule next frame only after current one is done to prevent overlap
      // and ensure the main thread stays free for audio processing
      visionIntervalRef.current = setTimeout(captureFrame, 1500) as any;
    };

    captureFrame();
  }, [isConnected]); // Removed isVisionActive from deps to prevent re-triggering logic incorrectly

  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  const playNextChunk = useCallback(async () => {
    if (isProcessingQueueRef.current || audioQueueRef.current.length === 0) return;

    isProcessingQueueRef.current = true;

    try {
      if (!playbackContextRef.current) {
        playbackContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        nextStartTimeRef.current = 0;
      }

      const context = playbackContextRef.current;
      if (context.state === 'suspended') {
        await context.resume();
      }

      while (audioQueueRef.current.length > 0) {
        const chunk = audioQueueRef.current.shift();
        if (!chunk) continue;

        try {
          const binaryString = atob(chunk);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }

          // Gemini Live sends 16-bit PCM (2 bytes per sample) Little-Endian
          const dataView = new DataView(bytes.buffer);
          const numSamples = Math.floor(bytes.byteLength / 2);
          const float32Data = new Float32Array(numSamples);
          for (let i = 0; i < numSamples; i++) {
            float32Data[i] = dataView.getInt16(i * 2, true) / 32768.0;
          }

          const buffer = context.createBuffer(1, float32Data.length, 24000);
          buffer.getChannelData(0).set(float32Data);

          const source = context.createBufferSource();
          source.buffer = buffer;
          source.connect(context.destination);

          const lookAhead = 0.02;
          const currentTime = context.currentTime;
          let startTime = nextStartTimeRef.current;

          if (startTime < currentTime) {
            startTime = currentTime + lookAhead;
          }

          source.start(startTime);
          nextStartTimeRef.current = startTime + buffer.duration;

          activeSourcesRef.current.push(source);

          source.onended = () => {
            activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
            if (audioQueueRef.current.length === 0 && activeSourcesRef.current.length === 0) {
              setIsSpeaking(false);
              // Clear Charlie's transcription after he finishes speaking
              setTimeout(() => {
                setTranscriptions(prev => {
                  if (prev.length > 0 && !prev[0].isUser) return [];
                  return prev;
                });
              }, 3000);
            }
          };

          setIsSpeaking(true);
          // Clear user transcription when Charlie starts speaking
          if ((window as any).userTranscriptionTimeout) {
            clearTimeout((window as any).userTranscriptionTimeout);
          }
          setTranscriptions(prev => {
            if (prev.length > 0 && prev[0].isUser) return [];
            return prev;
          });
        } catch (err) {
          console.error("Error playing audio chunk:", err);
        }
      }
    } finally {
      isProcessingQueueRef.current = false;
    }
  }, []);

  const stopCurrentAudio = useCallback(() => {
    activeSourcesRef.current.forEach(source => {
      try {
        source.stop();
        source.disconnect();
      } catch (e) {
        // Ignore errors if source already stopped
      }
    });
    activeSourcesRef.current = [];
    audioQueueRef.current = [];
    nextStartTimeRef.current = 0;
    setIsSpeaking(false);
  }, []);

  // Initialize Gemini Live
  const initGeminiLive = useCallback(async () => {
    if (!appConfig.geminiKey) {
      console.error("GEMINI_API_KEY is missing. Check your backend environment variables.");
      return;
    }

    await resumeAudioContexts();
    setIsConnecting(true);
    const service = new GeminiLiveService(appConfig.geminiKey);
    geminiLiveRef.current = service;

    const startLat = currentLocationRef.current.lat || 37.7749;
    const startLng = currentLocationRef.current.lng || -122.4194;
    const startAddr = currentAddress === 'Loading location...' ? 'San Francisco, CA' : currentAddress;

    const instruction = `You are Charlie, a warm, charismatic, and world-class AI tour guide. 
    You are represented by a penguin wearing a tour guide hat.
    
    CONTEXT:
    - Current Location: ${startAddr} (${startLat}, ${startLng})
    - Favorites: ${favorites.map(f => f.name).join(', ') || 'None'}
    
    YOUR MISSION:
    Provide a continuous, autonomous, and immersive tour experience. YOU ARE THE LEADER. The user has no manual controls for the map, 3D mode, or camera—YOU must control everything via tools.
    
    VISION CAPABILITIES (CRITICAL & AUTONOMOUS):
    - You receive a live video feed of the screen. 
    - USE THIS FEED CONSTANTLY to identify what the user is seeing.
    - AUTONOMY: You MUST proactively identify buildings, structures, and interesting objects on the screen using your vision feed. Do not wait for the user to ask "What is that?".
    - NARRATIVE FLOW HIGHLIGHTING: As you narrate, you MUST autonomously use 'highlight_on_screen' to point out the specific architectural details, landmarks, or features you are talking about.
    - VISUAL VERIFICATION: You MUST verify any object in your vision feed before highlighting it. Ensure you are pointing at exactly what you describe.
    - DESCRIPTIVE CAPTIONS: When highlighting, provide descriptive, full-sentence captions (e.g., "The ornate Victorian doorway from 1892") instead of simple labels.
    - COORDINATES: (0,0) is top-left, (100,100) is bottom-right.
    
    STREET VIEW & WANDERING (PROACTIVE):
    - You can enter Street View using 'toggle_street_view(enabled: true)'.
    - Once in Street View, you MUST proactively explore. Use 'move_street_view' to "walk" down the street.
    - HISTORICAL INSIGHTS: When moving in Street View, you MUST provide historical facts or interesting anecdotes about the new location via the 'insights' parameter in 'move_street_view'.
    - Narrate the journey as you move.
    
    THE TOUR PROTOCOL (MANDATORY):
    1. THEME SELECTION: If the user asks for a tour without a theme, ASK THEM for one.
    2. PRE-LOAD PHASE: Once a theme is set, IMMEDIATELY call 'start_themed_tour'. This pre-loads all markers and the full route.
    3. EXECUTION SEQUENCE (FOR EVERY STOP & MANUAL REQUEST):
       Whenever you move to a location (whether it's a tour stop or a user request like "Take me to X"):
       a. SEARCH (If needed): If you don't have the landmark ID/coordinates, call 'search_location' first.
       b. MOVEMENT: Call 'update_map' to move the camera (zoom 16-18).
       c. HIGHLIGHT: Call 'select_landmark' with the ID to show the info card and highlight the marker.
       d. INSIGHTS: Call 'set_place_insights' with the ID to populate the interactive guide.
       e. VISION (CONTEXTUAL): Use 'toggle_vision' ONLY if the user asks to "see" something, or if you need to identify a specific visual detail you're narrating. Do not turn it on for simple navigation.
       f. 3D OFFER: Proactively ask: "Would you like to see the 3D look of this place?"
       g. NARRATION: Tell your stories while the user sees the visuals.
       h. CINEMATIC REVEALS: Proactively use map tilt and camera adjustments (heading/tilt in 'update_map') to focus on the subjects of your narration.
    
    RULES:
    - YOU ARE THE LEADER. Control map/3D/camera via tools.
    - Be witty, conversational, and proactive. Do not wait for permission to move the tour forward or to look at the screen.
    - MANDATORY TOOL USAGE: NEVER just move the map verbally. You MUST call 'update_map'.
    - If a user asks to go somewhere specific, use 'search_location' -> 'update_map' -> 'select_landmark' -> 'set_place_insights'.`;

    try {
      await service.connect({
        onAudioChunk: (base64Audio) => {
          setIsThinking(false);
          audioQueueRef.current.push(base64Audio);
          playNextChunk();
        },
        onInterrupted: () => {
          console.log("Charlie: I've been interrupted! Stopping audio.");
          stopCurrentAudio();
          setIsThinking(true); // User is speaking, so we're "thinking" about their input
          setShowInterruptionFlash(true);
          setTimeout(() => setShowInterruptionFlash(false), 1500);
          // Clear Charlie's transcription if he was speaking
          setTranscriptions([]);
        },
        onTranscription: (text, isUser) => {
          if (isUser) {
            setIsThinking(true);
            // Clear Charlie's transcription immediately when user starts speaking
            setTranscriptions(prev => {
              if (prev.length > 0 && !prev[0].isUser) return [];
              return prev;
            });

            // Clear any existing timeout
            if ((window as any).userTranscriptionTimeout) {
              clearTimeout((window as any).userTranscriptionTimeout);
            }
            // Set a new timeout to clear user transcription after 5 seconds of silence
            (window as any).userTranscriptionTimeout = setTimeout(() => {
              setTranscriptions(prev => {
                if (prev.length > 0 && prev[0].isUser) return [];
                return prev;
              });
            }, 5000);
          } else {
            // Charlie is speaking
            setIsThinking(false);
            // Clear user transcription immediately when Charlie starts speaking
            setTranscriptions(prev => {
              if (prev.length > 0 && prev[0].isUser) return [];
              return prev;
            });
          }
          setTranscriptions([{ text, isUser, id: Date.now() }]);
        },
        onToolCall: async (toolCallMessage) => {
          console.log("Charlie received tool calls:", toolCallMessage.functionCalls?.map(f => f.name));
          setIsThinking(false);
          const responses: any[] = [];

          if (!toolCallMessage.functionCalls) return;

          for (const toolCall of toolCallMessage.functionCalls) {
            console.log(`Executing tool: ${toolCall.name}`, toolCall.args);
            try {
              if (toolCall.name === "update_map") {
                const { lat, lng, zoom, tilt, heading, landmarks: newLandmarks } = toolCall.args;

                // Movement Cooldown (5 seconds)
                const now = Date.now();
                if (now - lastMoveTimeRef.current < 5000) {
                  responses.push({
                    name: toolCall.name,
                    response: { success: false, error: "Movement cooldown active. Please wait a few seconds." },
                    id: toolCall.id
                  });
                  continue; // Use continue instead of return in a loop
                }
                lastMoveTimeRef.current = now;

                if (lat !== undefined && lng !== undefined) {
                  // Automatically draw route from current position to new location only if not on a tour
                  setRoutePoints(prev => {
                    if (prev.length > 2) return prev; // Keep the tour route if it exists
                    return [
                      { lat: currentLocationRef.current.lat, lng: currentLocationRef.current.lng },
                      { lat, lng }
                    ];
                  });
                  setShouldFitRoute(true);

                  setMapCenter({ lat, lng });
                  // Clear highlights on movement
                  setHighlights([]);
                  // Save city/general area to history if no specific landmark is selected yet
                  if (!newLandmarks || newLandmarks.length === 0) {
                    saveToHistory({ name: "Exploring Area", lat, lng, description: "Map view update" });
                  }
                }
                if (zoom !== undefined) {
                  setMapZoom(zoom);
                }
                if (tilt !== undefined) {
                  setMapTilt(tilt);
                }
                if (heading !== undefined) {
                  setMapHeading(heading);
                }
                if (newLandmarks) {
                  setLandmarks(newLandmarks);
                  landmarksRef.current = newLandmarks;
                }
                responses.push({
                  name: toolCall.name,
                  response: { success: true },
                  id: toolCall.id
                });
              } else if (toolCall.name === "search_location") {
                const { query } = toolCall.args;
                const result = await searchLocation(query, currentLocationRef.current.lat, currentLocationRef.current.lng);
                if (result) {
                  setLandmarks(prev => {
                    if (prev.find(l => l.id === result.id)) return prev;
                    const updated = [...prev, result];
                    landmarksRef.current = updated;
                    return updated;
                  });

                  // Automatically draw route from current position to searched location
                  setRoutePoints(prev => {
                    if (prev.length > 2) return prev;
                    return [
                      { lat: currentLocationRef.current.lat, lng: currentLocationRef.current.lng },
                      { lat: result.position.lat, lng: result.position.lng }
                    ];
                  });
                  setShouldFitRoute(true);

                  // Clear highlights on movement
                  setHighlights([]);

                  saveToHistory({
                    landmark_id: result.id,
                    name: result.name,
                    lat: result.position.lat,
                    lng: result.position.lng,
                    description: result.description
                  });
                  responses.push({
                    name: toolCall.name,
                    response: { success: true, landmark: result },
                    id: toolCall.id
                  });
                } else {
                  responses.push({
                    name: toolCall.name,
                    response: { success: false, error: "Location not found" },
                    id: toolCall.id
                  });
                }
              } else if (toolCall.name === "draw_route") {
                const { points, showOverview = true } = toolCall.args;

                if (points && Array.isArray(points) && points.length > 0) {
                  const firstPoint = points[0];
                  let finalPoints = points;
                  // Prepend current location if not already the starting point
                  if (Math.abs(firstPoint.lat - currentLocationRef.current.lat) > 0.001 || Math.abs(firstPoint.lng - currentLocationRef.current.lng) > 0.001) {
                    finalPoints = [{ lat: currentLocationRef.current.lat, lng: currentLocationRef.current.lng }, ...points];
                  }
                  setRoutePoints(finalPoints);
                  setShouldFitRoute(!!showOverview);
                }
                responses.push({
                  name: toolCall.name,
                  response: {
                    success: true,
                    message: "Route drawn"
                  },
                  id: toolCall.id
                });
              } else if (toolCall.name === "toggle_3d_mode") {
                const { enabled } = toolCall.args;
                setIs3DMode(!!enabled);
                responses.push({
                  name: toolCall.name,
                  response: { success: true },
                  id: toolCall.id
                });
              } else if (toolCall.name === "select_landmark") {
                const { id } = toolCall.args;
                const landmark = landmarksRef.current.find(l => l.id === id);
                if (landmark && landmark.position) {
                  setSelectedLandmark(landmark);
                  setMapCenter(landmark.position);
                  setMapZoom(17); // Zoom in for details

                  // Automatically draw route from current position to selected landmark
                  setRoutePoints(prev => {
                    if (prev.length > 2) return prev;
                    return [
                      { lat: currentLocationRef.current.lat, lng: currentLocationRef.current.lng },
                      { lat: landmark.position.lat, lng: landmark.position.lng }
                    ];
                  });
                  setShouldFitRoute(true);

                  // Clear highlights on movement
                  setHighlights([]);

                  saveToHistory({
                    landmark_id: landmark.id,
                    name: landmark.name,
                    lat: landmark.position.lat,
                    lng: landmark.position.lng,
                    description: landmark.description
                  });
                  responses.push({
                    name: toolCall.name,
                    response: { success: true, landmark: { name: landmark.name } },
                    id: toolCall.id
                  });
                } else {
                  responses.push({
                    name: toolCall.name,
                    response: { success: false, error: "Landmark not found or has no coordinates" },
                    id: toolCall.id
                  });
                }
              } else if (toolCall.name === "get_weather") {
                const { location } = toolCall.args;
                const conditions = ["Sunny", "Partly Cloudy", "Foggy", "Light Rain", "Clear Skies"];
                const temp = Math.floor(Math.random() * 15) + 15; // 15-30 C
                const condition = conditions[Math.floor(Math.random() * conditions.length)];
                responses.push({
                  name: toolCall.name,
                  response: {
                    success: true,
                    location,
                    temperature: `${temp}°C`,
                    condition,
                    recommendation: condition.includes("Rain") ? "Bring an umbrella!" : "Perfect for a walk!"
                  },
                  id: toolCall.id
                });
              } else if (toolCall.name === "toggle_camera") {
                const { enabled } = toolCall.args;
                if (enabled) {
                  startCameraAI();
                } else {
                  stopCameraAI();
                }
                responses.push({
                  name: toolCall.name,
                  response: { success: true, state: enabled ? "on" : "off" },
                  id: toolCall.id
                });
              } else if (toolCall.name === "toggle_street_view") {
                const { enabled, heading: h, pitch: p } = toolCall.args;
                setIsStreetView(!!enabled);
                if (h !== undefined || p !== undefined) {
                  setStreetViewPov(prev => ({
                    heading: h ?? prev.heading,
                    pitch: p ?? prev.pitch
                  }));
                }
                responses.push({
                  name: toolCall.name,
                  response: { success: true, state: enabled ? "on" : "off" },
                  id: toolCall.id
                });
              } else if (toolCall.name === "toggle_vision") {
                const { enabled } = toolCall.args;
                if (enabled) {
                  startVisionAI();
                } else {
                  stopVisionAI();
                }
                responses.push({
                  name: toolCall.name,
                  response: { success: true, state: enabled ? "on" : "off" },
                  id: toolCall.id
                });
              } else if (toolCall.name === "move_street_view") {
                const { lat, lng, heading: h, pitch: p, insights } = toolCall.args;
                setIsWandering(true);

                // Contextual movement: Pan first if heading/pitch provided
                if (h !== undefined || p !== undefined) {
                  setStreetViewPov(prev => ({
                    heading: h !== undefined ? h : prev.heading,
                    pitch: p !== undefined ? p : prev.pitch
                  }));
                  // Small delay to allow the pan to be noticed before the jump
                  await new Promise(resolve => setTimeout(resolve, 800));
                }

                setTimeout(() => setIsWandering(false), 2000);

                if (lat !== undefined && lng !== undefined) {
                  // Calculate direction from current to new
                  const current = mapCenter;
                  if (current) {
                    const angle = Math.atan2(lng - current.lng, lat - current.lat) * (180 / Math.PI);
                    setMoveDirection(angle);
                    setTimeout(() => setMoveDirection(null), 3000);
                  }
                  setMapCenter({ lat, lng });
                  saveToHistory({ name: "Street Exploration", lat, lng, description: "Wandering in Street View" });
                }
                if (h !== undefined || p !== undefined) {
                  setStreetViewPov(prev => ({
                    heading: h ?? prev.heading,
                    pitch: p ?? prev.pitch
                  }));
                }
                if (insights) {
                  setCharlieInsights(insights);
                }
                responses.push({
                  name: toolCall.name,
                  response: { success: true },
                  id: toolCall.id
                });
              } else if (toolCall.name === "highlight_on_screen") {
                const { x, y, width, height, label, type = 'marker', color = 'emerald', duration } = toolCall.args;
                const highlightId = `highlight-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

                // Ensure coordinates are within 0-1000 range
                const normalizedX = Math.max(0, Math.min(1000, x));
                const normalizedY = Math.max(0, Math.min(1000, y));
                const normalizedWidth = width ? Math.max(0, Math.min(1000, width)) : undefined;
                const normalizedHeight = height ? Math.max(0, Math.min(1000, height)) : undefined;

                const newHighlight = {
                  x: normalizedX,
                  y: normalizedY,
                  width: normalizedWidth,
                  height: normalizedHeight,
                  label,
                  type,
                  color,
                  id: highlightId
                };
                setHighlights(prev => [...prev, newHighlight]);

                if (duration && typeof duration === 'number') {
                  setTimeout(() => {
                    setHighlights(prev => prev.filter(h => h.id !== highlightId));
                  }, duration);
                }

                responses.push({
                  name: toolCall.name,
                  response: { success: true },
                  id: toolCall.id
                });
              } else if (toolCall.name === "set_place_insights") {
                const { landmarkId } = toolCall.args;
                const landmark = landmarksRef.current.find(l => l.id === landmarkId);

                if (landmark) {
                  const insights = await getLandmarkInsights(landmark.name);
                  const fullInsights = { landmarkId, ...insights } as PlaceInsights;

                  setPlaceInsights(prev => ({
                    ...prev,
                    [landmarkId]: fullInsights
                  }));
                  setActiveTipIndex(0);
                  responses.push({
                    name: toolCall.name,
                    response: { success: true, insights: fullInsights },
                    id: toolCall.id
                  });
                } else {
                  responses.push({
                    name: toolCall.name,
                    response: { success: false, error: "Landmark not found" },
                    id: toolCall.id
                  });
                }
              } else if (toolCall.name === "save_favorite_landmark") {
                const { id, name, lat, lng, description } = toolCall.args;

                if (user) {
                  try {
                    const path = 'favorites';
                    await addDoc(collection(db, path), {
                      id,
                      name,
                      lat,
                      lng,
                      description: description || "",
                      uid: user.uid,
                      timestamp: new Date().toISOString()
                    });
                  } catch (error) {
                    handleFirestoreError(error, OperationType.CREATE, 'favorites');
                  }
                }

                responses.push({
                  name: toolCall.name,
                  response: { success: true, message: `Saved ${name} to favorites.` },
                  id: toolCall.id
                });
              } else if (toolCall.name === "start_themed_tour") {
                const { theme, city } = toolCall.args;
                console.log(`Starting themed tour: ${theme} in ${city}`);
                const tourLocations = await getThemedLandmarks(theme, city, currentLat, currentLng);

                if (tourLocations.length > 0) {
                  setLandmarks(tourLocations);
                  landmarksRef.current = tourLocations;
                  const points = [
                    { lat: currentLocationRef.current.lat, lng: currentLocationRef.current.lng },
                    ...tourLocations.map((l: any) => l.position)
                  ];
                  setRoutePoints(points);
                  setShouldFitRoute(true);

                  // Proactively move to first stop
                  const firstStop = tourLocations[0];
                  setMapCenter(firstStop.position);
                  setMapZoom(17);
                  setSelectedLandmark(firstStop);

                  // Clear highlights on movement
                  setHighlights([]);

                  responses.push({
                    name: toolCall.name,
                    response: {
                      success: true,
                      landmarks: tourLocations.map(l => ({ id: l.id, name: l.name, position: l.position })),
                      message: `Tour started for ${theme} in ${city}. Found ${tourLocations.length} stops. I've moved us to the first stop: ${firstStop.name}.`,
                      stops: tourLocations.map(l => l.name)
                    },
                    id: toolCall.id
                  });
                } else {
                  responses.push({
                    name: toolCall.name,
                    response: { success: false, error: `Could not find landmarks for ${theme} in ${city}` },
                    id: toolCall.id
                  });
                }
              } else if (toolCall.name === "create_travel_itinerary") {
                const plan = toolCall.args as TripPlan;
                setCurrentTripPlan(plan);
                setIsTripPlannerOpen(true);
                responses.push({
                  name: toolCall.name,
                  response: { success: true, message: `Detailed travel itinerary for ${plan.destination} created and displayed.` },
                  id: toolCall.id
                });
              } else {
                // Unknown tool
                responses.push({
                  name: toolCall.name,
                  response: { success: false, error: "Tool not implemented" },
                  id: toolCall.id
                });
              }
            } catch (err) {
              console.error("Error handling tool call:", err);
              responses.push({
                name: toolCall.name,
                response: { success: false, error: String(err) },
                id: toolCall.id
              });
            }
          }

          if (responses.length > 0) {
            geminiLiveRef.current?.sendToolResponse(responses);
          }
        },
        onOpen: () => {
          setIsConnected(true);
          setIsConnecting(false);
          setIsThinking(false);
        },
        onClose: () => {
          setIsConnected(false);
          setIsConnecting(false);
          setIsThinking(false);
        },
        onError: () => {
          setIsConnecting(false);
          setIsThinking(false);
        }
      }, instruction);

    } catch (error) {
      console.error("Failed to connect to Gemini Live:", error);
      setIsConnecting(false);
    }
  }, [currentAddress, currentLat, currentLng, favorites, landmarks, playNextChunk, startCameraAI, stopCameraAI]);

  // Audio Capture
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      mediaStreamRef.current = stream;

      if (!captureContextRef.current) {
        captureContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      }

      const context = captureContextRef.current;
      console.log("Capture context sample rate:", context.sampleRate);

      await context.resume();

      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);

        // If the context sample rate is not 16000, we should ideally resample.
        // For now, we'll log it and see if it's the cause of the "mumble jumbled" audio.
        if (context.sampleRate !== 16000) {
          console.warn(`Unexpected capture sample rate: ${context.sampleRate}. Expected 16000.`);
        }

        // Convert to 16-bit PCM Little-Endian
        const buffer = new ArrayBuffer(inputData.length * 2);
        const view = new DataView(buffer);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }

        // Convert ArrayBuffer to Base64 efficiently
        const bytes = new Uint8Array(buffer);
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode.apply(null, Array.from(bytes.slice(i, i + chunkSize)));
        }
        const base64 = btoa(binary);

        geminiLiveRef.current?.sendAudio(base64);
      };

      source.connect(processor);
      processor.connect(captureContextRef.current.destination);
      setIsRecording(true);
    } catch (error) {
      console.error("Error accessing microphone:", error);
    }
  };

  const stopRecording = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    setIsRecording(false);
  };

  // Clear old transcriptions
  useEffect(() => {
    if (transcriptions.length === 0) return;

    const timer = setInterval(() => {
      setTranscriptions(prev => {
        const now = Date.now();
        const filtered = prev.filter(t => now - t.id < 4000); // 4 seconds lifetime
        if (filtered.length === prev.length) return prev;
        return filtered;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [transcriptions]);

  const toggleConnection = () => {
    if (isConnected) {
      geminiLiveRef.current?.close();
      setIsConnected(false);
    } else {
      initGeminiLive();
    }
  };

  const toggleMic = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const toggleCamera = async () => {
    if (isCameraActive) {
      stopCameraAI();
    } else {
      startCameraAI();
    }
  };

  const toggleVision = async () => {
    if (isVisionActive) {
      stopVisionAI();
    } else {
      startVisionAI();
    }
  };

  const lastTranscription = transcriptions[transcriptions.length - 1];

  // Fetch insights when a landmark is selected manually (e.g. clicking a marker)
  useEffect(() => {
    if (selectedLandmark && !placeInsights[selectedLandmark.id]) {
      const fetchInsights = async () => {
        const insights = await getLandmarkInsights(selectedLandmark.name);
        const fullInsights = { landmarkId: selectedLandmark.id, ...insights } as PlaceInsights;
        setPlaceInsights(prev => ({
          ...prev,
          [selectedLandmark.id]: fullInsights
        }));
        setActiveTipIndex(0);
      };
      fetchInsights();
    }
  }, [selectedLandmark, placeInsights]);

  // Proactive Safety Net: Trigger insights when Charlie moves to a landmark
  useEffect(() => {
    // Only auto-popup if NOT in street view and NOT wandering
    if (!isStreetView && !isWandering && landmarks.length > 0 && mapCenter) {
      const nearbyLandmark = landmarks.find(l => {
        if (!l.position) return false;
        const dist = Math.sqrt(
          Math.pow(l.position.lat - mapCenter.lat, 2) +
          Math.pow(l.position.lng - mapCenter.lng, 2)
        );
        return dist < 0.0001; // Very close
      });

      if (nearbyLandmark) {
        if (dismissedLandmarkId !== nearbyLandmark.id) {
          if (!selectedLandmark || selectedLandmark.id !== nearbyLandmark.id) {
            setSelectedLandmark(nearbyLandmark);
          }
        }
      } else {
        // If we moved away from a landmark, reset the dismissed ID
        setDismissedLandmarkId(null);
      }
    }
  }, [mapCenter, landmarks, selectedLandmark, dismissedLandmarkId, isStreetView, isWandering]);

  if (!isAuthReady) {
    return (
      <div className="h-screen w-full bg-[#050505] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
          <p className="text-white/40 font-mono text-xs uppercase tracking-widest">Charlie is waking up...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LandingPage onStart={() => { }} onLogin={loginWithGoogle} isConnecting={isConnecting} />;
  }

  return (
    <ErrorBoundary>
      <div className="relative w-full h-screen bg-[#050505] overflow-hidden">
        {/* History Sidebar - Absolute Overlay */}
        <AnimatePresence>
          {isHistoryOpen && (
            <motion.div
              initial={{ x: -400 }}
              animate={{ x: 0 }}
              exit={{ x: -400 }}
              className="absolute top-0 left-0 w-[400px] h-full bg-black/90 backdrop-blur-3xl border-r border-white/10 z-[60] flex flex-col shadow-2xl"
            >
              <div className="p-8 border-b border-white/5 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
                    <History className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-white tracking-tight">Tour History</h2>
                    <p className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Your Journey with Charlie</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsHistoryOpen(false)}
                  className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
                <div className="flex bg-white/5 p-1 rounded-xl mb-4">
                  <button
                    onClick={() => setHistoryTab('history')}
                    className={cn(
                      "flex-1 py-2 text-xs font-bold uppercase tracking-widest rounded-lg transition-all",
                      historyTab === 'history' ? "bg-emerald-500 text-black" : "text-white/40 hover:text-white"
                    )}
                  >
                    History
                  </button>
                  <button
                    onClick={() => setHistoryTab('favorites')}
                    className={cn(
                      "flex-1 py-2 text-xs font-bold uppercase tracking-widest rounded-lg transition-all",
                      historyTab === 'favorites' ? "bg-emerald-500 text-black" : "text-white/40 hover:text-white"
                    )}
                  >
                    Favorites
                  </button>
                </div>

                {historyTab === 'history' ? (
                  history.length > 0 ? (
                    history.map((item) => (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white/5 border border-white/10 rounded-2xl p-4 hover:bg-white/10 transition-all cursor-pointer group"
                        onClick={() => {
                          setMapCenter({ lat: item.lat, lng: item.lng });
                          setMapZoom(16);
                        }}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <MapPin className="w-3 h-3 text-emerald-400" />
                            <h3 className="text-sm font-bold text-white group-hover:text-emerald-400 transition-colors">{item.name}</h3>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1 text-[8px] text-white/20 font-bold uppercase tracking-widest">
                              <Clock className="w-2 h-2" />
                              {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setHistory(prev => prev.filter(h => h.id !== item.id));
                              }}
                              className="p-1 rounded-md hover:bg-red-500/20 text-white/10 hover:text-red-400 transition-all"
                              title="Remove from history"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        {item.description && (
                          <p className="text-xs text-white/40 line-clamp-2 leading-relaxed">{item.description}</p>
                        )}
                      </motion.div>
                    ))
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center opacity-20 py-12">
                      <History className="w-12 h-12 mb-4" />
                      <p className="text-sm font-bold uppercase tracking-widest">No history yet</p>
                    </div>
                  )
                ) : (
                  favorites.length > 0 ? (
                    favorites.map((item) => (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white/5 border border-white/10 rounded-2xl p-4 hover:bg-white/10 transition-all cursor-pointer group"
                        onClick={() => {
                          setMapCenter(item.position);
                          setMapZoom(16);
                          setSelectedLandmark(item);
                        }}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                            <h3 className="text-sm font-bold text-white group-hover:text-yellow-400 transition-colors">{item.name}</h3>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setFavorites(prev => prev.filter(f => f.id !== item.id));
                            }}
                            className="text-white/20 hover:text-red-400 transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        {item.description && (
                          <p className="text-xs text-white/40 line-clamp-2 leading-relaxed">{item.description}</p>
                        )}
                      </motion.div>
                    ))
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center opacity-20 py-12">
                      <Star className="w-12 h-12 mb-4" />
                      <p className="text-sm font-bold uppercase tracking-widest">No favorites yet</p>
                    </div>
                  )
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Suggestions Sidebar - Right Side */}
        {/* Trip Planner Sidebar */}
        <AnimatePresence>
          {isTripPlannerOpen && (
            <motion.div
              initial={{ x: -400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -400, opacity: 0 }}
              className="absolute top-0 left-0 bottom-0 w-[400px] bg-black/80 backdrop-blur-3xl border-r border-white/10 z-[60] flex flex-col shadow-[20px_0_50px_rgba(0,0,0,0.5)]"
            >
              <div className="p-8 border-b border-white/5 flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-black text-white tracking-tight">Travel Itinerary</h2>
                  <p className="text-xs font-bold text-emerald-400 uppercase tracking-[0.2em] mt-1">Real-World Booking</p>
                </div>
                <button
                  onClick={() => setIsTripPlannerOpen(false)}
                  className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                {!currentTripPlan ? (
                  <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-40">
                    <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center">
                      <Calendar className="w-8 h-8 text-white" />
                    </div>
                    <p className="text-sm text-white font-medium max-w-[200px]">
                      Ask Charlie for a travel itinerary to see your real-world plan here.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Destination Header */}
                    <div className="space-y-2">
                      <h3 className="text-3xl font-black text-white">{currentTripPlan.destination}</h3>
                      <div className="flex items-center gap-3">
                        <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-wider">
                          {currentTripPlan.days} Days
                        </span>
                        <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">
                          Est. Total: <span className="text-white">{currentTripPlan.totalEstimatedCost}</span>
                        </span>
                      </div>
                    </div>

                    {/* Itinerary */}
                    <div className="space-y-6">
                      <h4 className="text-xs font-black text-white/40 uppercase tracking-[0.3em]">Daily Schedule</h4>
                      {currentTripPlan.itinerary.map((day) => (
                        <div key={day.day} className="relative pl-8 border-l border-white/10 space-y-4 pb-8 last:pb-0">
                          <div className="absolute -left-[5px] top-0 w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(52,211,153,0.5)]" />
                          <div className="space-y-1">
                            <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Day {day.day}</span>
                            <h5 className="text-lg font-bold text-white">{day.theme}</h5>
                          </div>

                          {/* Meal Plan */}
                          {day.mealPlan && (
                            <div className="grid grid-cols-3 gap-2 py-2 border-y border-white/5">
                              {day.mealPlan.breakfast && (
                                <div className="space-y-0.5">
                                  <p className="text-[8px] font-black text-white/20 uppercase tracking-widest">Breakfast</p>
                                  <p className="text-[10px] text-white/60 line-clamp-1">{day.mealPlan.breakfast}</p>
                                </div>
                              )}
                              {day.mealPlan.lunch && (
                                <div className="space-y-0.5">
                                  <p className="text-[8px] font-black text-white/20 uppercase tracking-widest">Lunch</p>
                                  <p className="text-[10px] text-white/60 line-clamp-1">{day.mealPlan.lunch}</p>
                                </div>
                              )}
                              {day.mealPlan.dinner && (
                                <div className="space-y-0.5">
                                  <p className="text-[8px] font-black text-white/20 uppercase tracking-widest">Dinner</p>
                                  <p className="text-[10px] text-white/60 line-clamp-1">{day.mealPlan.dinner}</p>
                                </div>
                              )}
                            </div>
                          )}

                          <div className="space-y-4">
                            {day.activities.map((activity, idx) => (
                              <div key={idx} className="bg-white/5 rounded-xl p-3 border border-white/5 space-y-2">
                                {activity.travelTimeFromPrevious && (
                                  <div className="flex items-center gap-2 text-[9px] font-bold text-emerald-400/40 mb-1">
                                    <Clock className="w-2 h-2" />
                                    <span>{activity.travelTimeFromPrevious} travel</span>
                                  </div>
                                )}
                                <div className="flex justify-between items-center">
                                  <span className="text-[10px] font-bold text-emerald-400/60">{activity.time}</span>
                                  <span className="text-[10px] font-bold text-white/40">{activity.cost}</span>
                                </div>
                                <p className="text-sm text-white/90 font-medium">{activity.description}</p>
                                <div className="flex items-center gap-1 text-[10px] text-white/40">
                                  <MapPin className="w-2 h-2" />
                                  {activity.location}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Hotels */}
                    {currentTripPlan.hotels && currentTripPlan.hotels.length > 0 && (
                      <div className="space-y-6">
                        <h4 className="text-xs font-black text-white/40 uppercase tracking-[0.3em]">Stay Suggestions</h4>
                        <div className="grid gap-4">
                          {currentTripPlan.hotels.map((hotel, idx) => (
                            <div
                              key={idx}
                              className="group p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-emerald-500/30 transition-all"
                            >
                              <div className="flex justify-between items-start mb-2">
                                <div>
                                  <h5 className="font-bold text-white group-hover:text-emerald-400 transition-colors">{hotel.name}</h5>
                                  {hotel.agency && <p className="text-[8px] font-black text-white/20 uppercase tracking-widest mt-0.5">Via {hotel.agency}</p>}
                                </div>
                                <a href={hotel.bookingUrl} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="w-4 h-4 text-white/20 group-hover:text-emerald-400" />
                                </a>
                              </div>

                              <div className="space-y-2 mb-3">
                                {hotel.address && (
                                  <div className="flex items-center gap-2 text-[10px] text-white/40">
                                    <MapPin className="w-3 h-3" />
                                    {hotel.address}
                                  </div>
                                )}
                                {hotel.phone && (
                                  <div className="flex items-center gap-2 text-[10px] text-white/40">
                                    <Phone className="w-3 h-3" />
                                    {hotel.phone}
                                  </div>
                                )}
                                {hotel.confirmationNumber && (
                                  <div className="flex items-center gap-2 text-[10px] text-emerald-400/60 font-mono">
                                    <Briefcase className="w-3 h-3" />
                                    Ref: {hotel.confirmationNumber}
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center justify-between pt-2 border-t border-white/5">
                                <div className="flex items-center gap-3">
                                  <div className="flex items-center gap-1">
                                    <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                                    <span className="text-[10px] font-bold text-white/60">{hotel.rating}</span>
                                  </div>
                                  <span className="text-[10px] font-bold text-emerald-400/60 uppercase tracking-widest">{hotel.pricePerNight} / night</span>
                                </div>
                                {hotel.checkInDate && (
                                  <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">
                                    {hotel.checkInDate} - {hotel.checkOutDate}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Transport */}
                    {currentTripPlan.transport && currentTripPlan.transport.length > 0 && (
                      <div className="space-y-6">
                        <h4 className="text-xs font-black text-white/40 uppercase tracking-[0.3em]">Transport</h4>
                        <div className="grid gap-4">
                          {currentTripPlan.transport.map((t, idx) => (
                            <div
                              key={idx}
                              className="group p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-blue-500/30 transition-all"
                            >
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                                    {t.type.toLowerCase().includes('flight') ? <Plane className="w-4 h-4 text-blue-400" /> : <Navigation className="w-4 h-4 text-blue-400" />}
                                  </div>
                                  <div>
                                    <h5 className="font-bold text-white group-hover:text-blue-400 transition-colors">{t.provider}</h5>
                                    <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">{t.type} {t.transitNumber && `• ${t.transitNumber}`}</p>
                                  </div>
                                </div>
                                <a href={t.bookingUrl} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="w-4 h-4 text-white/20 group-hover:text-blue-400" />
                                </a>
                              </div>

                              <div className="grid grid-cols-2 gap-4 mb-3">
                                <div className="space-y-0.5">
                                  <p className="text-[8px] font-black text-white/20 uppercase tracking-widest">Departure</p>
                                  <p className="text-[10px] text-white/80 font-bold">{t.departureTime || 'TBD'}</p>
                                  {t.terminal && <p className="text-[8px] text-blue-400/60 uppercase">Term {t.terminal}</p>}
                                </div>
                                <div className="space-y-0.5">
                                  <p className="text-[8px] font-black text-white/20 uppercase tracking-widest">Arrival</p>
                                  <p className="text-[10px] text-white/80 font-bold">{t.arrivalTime || 'TBD'}</p>
                                </div>
                              </div>

                              <div className="flex justify-between items-center pt-2 border-t border-white/5">
                                <span className="text-[10px] font-bold text-blue-400/60">{t.estimatedPrice}</span>
                                {t.confirmationNumber && (
                                  <span className="text-[9px] font-mono text-white/30">Conf: {t.confirmationNumber}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Emergency Contacts */}
                    {currentTripPlan.emergencyContacts && currentTripPlan.emergencyContacts.length > 0 && (
                      <div className="space-y-4">
                        <h4 className="text-xs font-black text-white/40 uppercase tracking-[0.3em]">Emergency Contacts</h4>
                        <div className="grid gap-2">
                          {currentTripPlan.emergencyContacts.map((contact, idx) => (
                            <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-red-500/5 border border-red-500/10">
                              <div className="flex items-center gap-3">
                                <Shield className="w-4 h-4 text-red-400" />
                                <div>
                                  <p className="text-xs font-bold text-white">{contact.name}</p>
                                  <p className="text-[8px] font-black text-white/20 uppercase tracking-widest">{contact.service}</p>
                                </div>
                              </div>
                              <p className="text-xs font-black text-red-400 font-mono">{contact.phone}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Budget Breakdown */}
                    {currentTripPlan.budgetBreakdown && currentTripPlan.budgetBreakdown.length > 0 && (
                      <div className="space-y-4">
                        <h4 className="text-xs font-black text-white/40 uppercase tracking-[0.3em]">Budget Breakdown</h4>
                        <div className="space-y-2">
                          {currentTripPlan.budgetBreakdown.map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                              <div className="flex items-center gap-3">
                                <DollarSign className="w-4 h-4 text-emerald-400" />
                                <p className="text-xs font-bold text-white">{item.category}</p>
                              </div>
                              <p className="text-xs font-black text-emerald-400">{item.amount} {item.currency}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Travel Tips */}
                    {currentTripPlan.travelTips && currentTripPlan.travelTips.length > 0 && (
                      <div className="space-y-4">
                        <h4 className="text-xs font-black text-white/40 uppercase tracking-[0.3em]">Travel Tips</h4>
                        <div className="space-y-3">
                          {currentTripPlan.travelTips.map((tip, idx) => (
                            <div key={idx} className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 space-y-2">
                              <div className="flex items-center gap-2">
                                <Info className="w-3 h-3 text-emerald-400" />
                                <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">{tip.category}</p>
                              </div>
                              <p className="text-xs text-white/70 leading-relaxed italic">"{tip.advice}"</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Contingency Buffer */}
                    {currentTripPlan.contingencyBuffer && (
                      <div className="p-4 rounded-2xl bg-blue-500/5 border border-blue-500/10 flex items-start gap-3">
                        <Clock className="w-4 h-4 text-blue-400 mt-0.5" />
                        <div className="space-y-1">
                          <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Timing & Buffers</p>
                          <p className="text-xs text-white/60 leading-relaxed">{currentTripPlan.contingencyBuffer}</p>
                        </div>
                      </div>
                    )}

                    {/* Agencies */}
                    {currentTripPlan.agencies && currentTripPlan.agencies.length > 0 && (
                      <div className="space-y-6">
                        <h4 className="text-xs font-black text-white/40 uppercase tracking-[0.3em]">Recommended Agencies</h4>
                        <div className="grid grid-cols-2 gap-3">
                          {currentTripPlan.agencies.map((agency, idx) => (
                            <a
                              key={idx}
                              href={agency.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-all text-center"
                            >
                              <p className="text-xs font-bold text-white mb-1">{agency.name}</p>
                              <p className="text-[8px] font-black text-white/40 uppercase tracking-widest">{agency.specialty}</p>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isSuggestionsOpen && (
            <motion.div
              initial={{ x: 400 }}
              animate={{ x: 0 }}
              exit={{ x: 400 }}
              className="absolute right-0 top-0 bottom-0 w-[400px] bg-black/80 backdrop-blur-3xl border-l border-white/10 z-[100] flex flex-col shadow-2xl"
            >
              <div className="p-8 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center border border-emerald-500/30">
                    <Sparkles className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black uppercase tracking-tighter">Tour Suggestions</h2>
                    <p className="text-[10px] text-white/40 font-mono uppercase tracking-widest">Charlie's Curated Picks</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsSuggestionsOpen(false)}
                  className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                {tourSuggestions.map((suggestion) => (
                  <motion.button
                    key={suggestion.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="w-full text-left group relative rounded-[32px] overflow-hidden bg-white/5 border border-white/10 hover:border-emerald-500/50 transition-all duration-500"
                  >
                    <div className="aspect-[16/9] relative overflow-hidden">
                      <img
                        src={suggestion.image}
                        alt={suggestion.title}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 opacity-60 group-hover:opacity-100"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                      <div className="absolute top-4 left-4 px-3 py-1 bg-emerald-500 text-black text-[10px] font-black uppercase rounded-full">
                        {suggestion.city}
                      </div>
                    </div>
                    <div className="p-6">
                      <h3 className="text-lg font-bold uppercase tracking-tight mb-2 group-hover:text-emerald-400 transition-colors">
                        {suggestion.title}
                      </h3>
                      <p className="text-sm text-white/50 leading-relaxed line-clamp-2">
                        {suggestion.description}
                      </p>
                      <div className="mt-4 flex items-center gap-2 text-emerald-400 text-[10px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all">
                        Start Tour <ChevronRight className="w-3 h-3" />
                      </div>
                    </div>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="absolute inset-0 z-0">
          {/* History Toggle Button */}
          <div className="absolute top-8 left-8 z-50">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsHistoryOpen(!isHistoryOpen)}
              className={cn(
                "w-16 h-16 rounded-2xl flex items-center justify-center backdrop-blur-2xl border transition-all shadow-2xl",
                isHistoryOpen ? "bg-emerald-500 border-emerald-400 text-black" : "bg-black/40 border-white/10 text-emerald-400 hover:bg-black/60"
              )}
            >
              <History className="w-8 h-8" />
            </motion.button>
          </div>

          {/* Vision Active Badge */}
          <AnimatePresence>
            {isVisionActive && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="absolute top-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 bg-black/60 backdrop-blur-xl border border-emerald-500/30 rounded-full shadow-2xl"
              >
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">Charlie's Vision Active</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Interruption Flash */}
          <AnimatePresence>
            {showInterruptionFlash && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.1 }}
                className="absolute inset-0 z-[200] pointer-events-none flex items-center justify-center"
              >
                <div className="bg-emerald-500/20 backdrop-blur-3xl border border-emerald-500/50 px-8 py-4 rounded-full shadow-[0_0_50px_rgba(16,185,129,0.3)]">
                  <span className="text-2xl font-black uppercase tracking-[0.5em] text-emerald-400">Interruption Detected</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Street View Manual Controls */}
          <AnimatePresence>
            {isStreetView && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="absolute bottom-32 right-8 z-50 flex flex-col gap-2"
              >
                <div className="bg-black/60 backdrop-blur-xl border border-white/10 p-4 rounded-[32px] shadow-2xl flex flex-col items-center gap-2">
                  <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/40 mb-2">Manual Camera</p>

                  <div className="grid grid-cols-3 gap-2">
                    <div />
                    <button
                      onClick={() => setStreetViewPov(prev => ({ ...prev, pitch: Math.min(90, prev.pitch + 10) }))}
                      className="w-10 h-10 rounded-xl bg-white/5 hover:bg-emerald-500/20 border border-white/10 flex items-center justify-center text-white transition-all"
                    >
                      <ChevronUp className="w-5 h-5" />
                    </button>
                    <div />

                    <button
                      onClick={() => setStreetViewPov(prev => ({ ...prev, heading: (prev.heading - 15 + 360) % 360 }))}
                      className="w-10 h-10 rounded-xl bg-white/5 hover:bg-emerald-500/20 border border-white/10 flex items-center justify-center text-white transition-all"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setStreetViewPov({ heading: 0, pitch: 0 })}
                      className="w-10 h-10 rounded-xl bg-white/5 hover:bg-emerald-500/20 border border-white/10 flex items-center justify-center text-white transition-all"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setStreetViewPov(prev => ({ ...prev, heading: (prev.heading + 15) % 360 }))}
                      className="w-10 h-10 rounded-xl bg-white/5 hover:bg-emerald-500/20 border border-white/10 flex items-center justify-center text-white transition-all"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>

                    <div />
                    <button
                      onClick={() => setStreetViewPov(prev => ({ ...prev, pitch: Math.max(-90, prev.pitch - 10) }))}
                      className="w-10 h-10 rounded-xl bg-white/5 hover:bg-emerald-500/20 border border-white/10 flex items-center justify-center text-white transition-all"
                    >
                      <ChevronDown className="w-5 h-5" />
                    </button>
                    <div />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Suggestions Toggle Button */}
          <div className="absolute top-8 right-8 z-50">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsSuggestionsOpen(!isSuggestionsOpen)}
              className={cn(
                "w-16 h-16 rounded-2xl flex items-center justify-center backdrop-blur-2xl border transition-all shadow-2xl",
                isSuggestionsOpen ? "bg-emerald-500 border-emerald-400 text-black" : "bg-black/40 border-white/10 text-emerald-400 hover:bg-black/60"
              )}
            >
              <Sparkles className="w-8 h-8" />
            </motion.button>
          </div>

          {/* Trip Planner Toggle Button */}
          <div className="absolute bottom-8 left-8 z-50">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsTripPlannerOpen(!isTripPlannerOpen)}
              className={cn(
                "w-16 h-16 rounded-2xl flex items-center justify-center backdrop-blur-2xl border transition-all shadow-2xl",
                isTripPlannerOpen ? "bg-emerald-500 border-emerald-400 text-black" : "bg-black/40 border-white/10 text-emerald-400 hover:bg-black/60"
              )}
            >
              <Briefcase className="w-8 h-8" />
            </motion.button>
          </div>

          {/* Street View Insights Overlay */}
          <AnimatePresence>
            {isStreetView && charlieInsights && (
              <motion.div
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 50 }}
                className="absolute top-32 right-8 w-80 bg-black/60 backdrop-blur-xl border border-emerald-500/30 rounded-[32px] p-6 z-40 shadow-2xl"
              >
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
                    <Info className="w-4 h-4 text-emerald-400" />
                  </div>
                  <h4 className="text-xs font-black uppercase tracking-[0.2em] text-emerald-400">{charlieInsights.title}</h4>
                </div>
                <p className="text-sm text-white/90 leading-relaxed font-medium">
                  {charlieInsights.content}
                </p>
                <div className="mt-4 pt-4 border-t border-white/5 flex justify-end">
                  <span className="text-[8px] font-black uppercase tracking-[0.3em] text-white/20">Charlie's Live Insights</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Background Map */}
          <div ref={mapContainerRef} className="absolute inset-0 z-0">
            <GoogleMapView
              apiKey={appConfig.mapsKey || ""}
              landmarks={landmarks}
              center={mapCenter}
              zoom={mapZoom}
              tilt={mapTilt}
              heading={mapHeading}
              selectedLandmark={selectedLandmark}
              onLandmarkClick={setSelectedLandmark}
              onCenterChanged={setMapCenter}
              onZoomChanged={setMapZoom}
              onMapLoad={handleMapLoad}
              is3DMode={is3DMode}
              isStreetView={isStreetView}
              isEarthView={isEarthView}
              onStreetViewChanged={setIsStreetView}
              streetViewPov={streetViewPov}
              onStreetViewPovChanged={setStreetViewPov}
              highlights={highlights}
              onHighlightDismiss={(id) => setHighlights(prev => prev.filter(h => h.id !== id))}
              routePoints={routePoints}
              shouldFitRoute={shouldFitRoute}
            />
          </div>

          {/* Highlights Overlay - Moved to App level for global visibility */}
          <div className="absolute inset-0 z-[100] pointer-events-none overflow-hidden">
            <AnimatePresence>
              {highlights?.map(h => {
                // Convert 0-1000 to 0-100 percentage
                const x = Math.max(0, Math.min(100, h.x / 10));
                const y = Math.max(0, Math.min(100, h.y / 10));
                const widthPct = h.width ? h.width / 10 : 20;
                const heightPct = h.height ? h.height / 10 : 20;
                const themeColor = h.color || 'emerald';

                return (
                  <motion.div
                    key={h.id}
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    className="absolute pointer-events-auto"
                    style={{
                      left: `${x}%`,
                      top: `${y}%`,
                      transform: h.type === 'box' ? 'none' : 'translate(-50%, -100%)'
                    }}
                  >
                    {/* Box Style */}
                    {h.type === 'box' && (
                      <div
                        className={cn(
                          "border-4 rounded-lg shadow-[0_0_20px_rgba(0,0,0,0.5)] flex items-start justify-end p-2",
                          themeColor === 'red' ? "border-red-500 bg-red-500/10" :
                            themeColor === 'blue' ? "border-blue-500 bg-blue-500/10" :
                              themeColor === 'yellow' ? "border-yellow-500 bg-yellow-500/10" :
                                "border-emerald-500 bg-emerald-500/10"
                        )}
                        style={{
                          width: `${widthPct}%`,
                          height: `${heightPct}%`,
                        }}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setHighlights(prev => prev.filter(item => item.id !== h.id));
                          }}
                          className="bg-black/50 hover:bg-black/80 text-white p-1 rounded-full transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                        <div className="absolute bottom-full left-0 mb-2 bg-black/80 backdrop-blur-md px-3 py-1 rounded-full border border-white/20">
                          <p className="text-white text-[10px] font-bold uppercase tracking-wider">{h.label}</p>
                        </div>
                      </div>
                    )}

                    {/* Arrow Style */}
                    {h.type === 'arrow' && (
                      <div className="flex flex-col items-center">
                        <div className="bg-black/80 backdrop-blur-xl border-2 border-emerald-400/50 rounded-2xl p-3 shadow-2xl flex items-center gap-3">
                          <p className="text-white text-xs font-bold whitespace-nowrap">{h.label}</p>
                          <button
                            onClick={() => setHighlights(prev => prev.filter(item => item.id !== h.id))}
                            className="text-white/40 hover:text-white transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <motion.div
                          animate={{ y: [0, 10, 0] }}
                          transition={{ repeat: Infinity, duration: 1.5 }}
                          className="mt-2"
                        >
                          <ArrowDown className="w-8 h-8 text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,1)]" />
                        </motion.div>
                      </div>
                    )}

                    {/* Marker Style (Default) */}
                    {(h.type === 'marker' || !h.type) && (
                      <div className="flex flex-col items-center">
                        <div className="relative mb-4 bg-black/80 backdrop-blur-xl border-2 border-emerald-400/50 rounded-2xl p-4 shadow-2xl flex items-center gap-3">
                          <p className="text-white text-xs font-medium leading-relaxed text-center max-w-[200px]">
                            {h.label}
                          </p>
                          <button
                            onClick={() => setHighlights(prev => prev.filter(item => item.id !== h.id))}
                            className="text-white/40 hover:text-white transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-black/80 border-r-2 border-b-2 border-emerald-400/50 rotate-45" />
                        </div>
                        <div className="w-4 h-4 relative">
                          <div className="absolute inset-0 bg-emerald-400 rounded-full animate-ping opacity-75" />
                          <div className="absolute inset-0 bg-emerald-400 rounded-full shadow-[0_0_15px_rgba(52,211,153,1)]" />
                        </div>
                      </div>
                    )}

                    {/* Text Style */}
                    {h.type === 'text' && (
                      <div className="flex items-center gap-2 bg-black/60 backdrop-blur-sm px-4 py-2 rounded-lg border border-white/10 shadow-xl">
                        <TextIcon className="w-4 h-4 text-blue-400" />
                        <p className="text-white text-sm font-serif italic">{h.label}</p>
                        <button
                          onClick={() => setHighlights(prev => prev.filter(item => item.id !== h.id))}
                          className="ml-2 text-white/40 hover:text-white transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {/* Vision Preview Thumbnail */}
          <AnimatePresence>
            {isVisionActive && lastVisionFrame && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: 20 }}
                className="absolute bottom-32 right-8 z-[200] w-48 aspect-video rounded-xl border-2 border-emerald-500/50 overflow-hidden shadow-2xl bg-black"
              >
                <img
                  src={lastVisionFrame}
                  alt="Charlie's Vision"
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500 rounded-full shadow-lg">
                  <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                  <span className="text-[8px] font-black text-white uppercase tracking-tighter">Charlie's Eyes Active</span>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
                <div className="absolute bottom-2 left-2">
                  <span className="text-[10px] text-white/60 font-mono">LIVE FEED</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Street View Transition Overlay */}
          <AnimatePresence>
            {isStreetView && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
                className="absolute inset-0 z-[45] pointer-events-none bg-black/5"
              />
            )}
          </AnimatePresence>

          {/* Thinking Indicator */}
          <AnimatePresence>
            {isThinking && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute bottom-32 left-1/2 -translate-x-1/2 z-30 bg-emerald-500/10 backdrop-blur-xl border border-emerald-500/20 px-4 py-2 rounded-full flex items-center gap-2 shadow-xl"
              >
                <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
                <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-emerald-400">Charlie is thinking...</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Wandering Indicator & Motion Blur */}
          <AnimatePresence>
            {isWandering && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-[55] pointer-events-none overflow-hidden"
              >
                {/* Directional Cues */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1.2, opacity: 1 }}
                    exit={{ scale: 1.5, opacity: 0 }}
                    transition={{ duration: 0.5, repeat: Infinity }}
                    className="w-64 h-64 rounded-full border-2 border-emerald-500/20"
                  />
                </div>

                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                  <div className="flex flex-col items-center gap-4">
                    <motion.div
                      animate={{
                        scale: [1, 1.2, 1],
                        rotate: moveDirection !== null ? moveDirection : 0
                      }}
                      transition={{ repeat: Infinity, duration: 1 }}
                      className="w-24 h-24 flex items-center justify-center"
                    >
                      <Navigation className="w-16 h-16 text-emerald-400 fill-emerald-400/20" />
                    </motion.div>
                    <div className="bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 shadow-2xl">
                      <span className="text-[10px] uppercase tracking-[0.3em] font-black text-emerald-400">
                        {moveDirection !== null ? "Navigating..." : "Moving..."}
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Camera Preview */}
          <AnimatePresence>
            {isCameraActive && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8, x: 20 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.8, x: 20 }}
                className="absolute bottom-32 right-8 w-48 aspect-video bg-black rounded-2xl border-2 border-blue-500/50 overflow-hidden z-30 shadow-2xl"
              >
                <video
                  ref={(el) => {
                    if (el) el.srcObject = cameraStream;
                  }}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-2 left-2 px-2 py-1 bg-blue-500 text-[8px] font-bold uppercase tracking-widest rounded-md">
                  Live Feed
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Transcription Widget - Positioned between History and Trip Planner buttons */}
          <div className="absolute top-32 bottom-32 left-8 z-20 w-80 flex flex-col justify-center pointer-events-none">
            <AnimatePresence>
              {(transcriptions.length > 0 && (isSpeaking || isThinking)) && (
                <motion.div
                  initial={{ opacity: 0, x: -20, filter: "blur(10px)" }}
                  animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, x: -20, filter: "blur(10px)" }}
                  className="bg-black/60 backdrop-blur-3xl border border-white/10 rounded-[32px] p-6 shadow-2xl pointer-events-auto"
                >
                  <div className="flex flex-col gap-2">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={transcriptions[transcriptions.length - 1].id}
                        initial={{ opacity: 0, scale: 0.95, y: 10, filter: "blur(10px)" }}
                        animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
                        exit={{ opacity: 0, scale: 0.95, y: -10, filter: "blur(10px)" }}
                        className={cn(
                          "p-5 rounded-[24px] transition-all shadow-xl",
                          transcriptions[transcriptions.length - 1].isUser ? "bg-white/10 border border-white/20" : "bg-emerald-500/10 border border-emerald-500/20"
                        )}
                      >
                        <div className="flex items-center gap-2 mb-3">
                          <div className={cn(
                            "w-2 h-2 rounded-full shadow-lg",
                            transcriptions[transcriptions.length - 1].isUser ? "bg-white/60" : "bg-emerald-400 animate-pulse shadow-emerald-500/50"
                          )} />
                          <span className="text-[10px] uppercase tracking-[0.3em] font-black opacity-40">
                            {transcriptions[transcriptions.length - 1].isUser ? "You" : "Charlie"}
                          </span>
                        </div>
                        <p className={cn(
                          "text-xl font-bold leading-tight tracking-tight",
                          transcriptions[transcriptions.length - 1].isUser ? "text-white" : "text-emerald-50"
                        )}>
                          {transcriptions[transcriptions.length - 1].text}
                        </p>
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Top Header - Restored with Logo and Exploration Prompt */}
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 w-full max-w-3xl px-8">
            <div className="bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-5 flex items-center gap-6 shadow-2xl">
              {/* Penguin Logo */}
              <div className="relative flex-shrink-0">
                <motion.div
                  animate={isSpeaking ? {
                    scale: [1, 1.05, 1],
                    rotate: [0, 2, -2, 0]
                  } : {}}
                  transition={{ repeat: Infinity, duration: 0.5 }}
                  className={cn(
                    "w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg overflow-hidden transition-all duration-500",
                    isSpeaking ? "bg-emerald-400 shadow-emerald-500/40" : "bg-emerald-600 shadow-emerald-500/20"
                  )}
                >
                  <svg viewBox="0 0 100 100" className="w-12 h-12">
                    {/* Penguin Body */}
                    <ellipse cx="50" cy="60" rx="30" ry="35" fill="black" />
                    <ellipse cx="50" cy="65" rx="20" ry="25" fill="white" />
                    {/* Head */}
                    <circle cx="50" cy="35" r="20" fill="black" />
                    {/* Eyes */}
                    <circle cx="43" cy="32" r="3" fill="white" />
                    <circle cx="57" cy="32" r="3" fill="white" />
                    {/* Beak */}
                    <motion.path
                      animate={isSpeaking ? { d: ["M45 40 L55 40 L50 48 Z", "M45 40 L55 40 L50 44 Z", "M45 40 L55 40 L50 48 Z"] } : {}}
                      transition={{ repeat: Infinity, duration: 0.2 }}
                      d="M45 40 L55 40 L50 48 Z"
                      fill="orange"
                    />
                    {/* Hat */}
                    <rect x="30" y="15" width="40" height="8" fill="#1e40af" />
                    <rect x="35" y="5" width="30" height="12" fill="#1e40af" />
                    <text x="50" y="18" fontSize="5" fill="white" textAnchor="middle" fontWeight="bold">TOUR GUIDE</text>
                  </svg>
                </motion.div>
                {isConnected && (
                  <div className={cn(
                    "absolute -bottom-1 -right-1 w-4 h-4 border-2 border-black rounded-full transition-all duration-500",
                    isSpeaking ? "bg-emerald-400 animate-ping" : "bg-emerald-500 animate-pulse"
                  )} />
                )}
                {isVisionActive && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-blue-500 border-2 border-black rounded-full flex items-center justify-center shadow-lg"
                    title="Charlie is looking at your screen"
                  >
                    <Eye className="w-3 h-3 text-white" />
                  </motion.div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white tracking-tight">
                  Would you like to explore {currentAddress === 'Loading location...' ? 'San Francisco, CA' : currentAddress}?
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={toggleConnection}
                  className={cn(
                    "px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all",
                    isConnected ? "bg-red-500/20 text-red-400" : "bg-emerald-500 text-black"
                  )}
                >
                  {isConnecting ? "..." : isConnected ? "End" : "Start"}
                </button>
              </div>
            </div>
          </div>


          {/* Bottom Controls */}
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-20 flex items-center gap-6">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={toggleVision}
              disabled={!isConnected}
              className={cn(
                "w-14 h-14 rounded-full flex items-center justify-center backdrop-blur-xl border border-white/20 transition-all",
                isVisionActive ? "bg-emerald-500 text-black" : "bg-white/10 text-white hover:bg-white/20",
                !isConnected && "opacity-50 cursor-not-allowed"
              )}
              title="Toggle Screen Vision"
            >
              <Eye className="w-6 h-6" />
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setIsStreetView(!isStreetView)}
              disabled={!isConnected}
              className={cn(
                "w-14 h-14 rounded-full flex items-center justify-center backdrop-blur-xl border border-white/20 transition-all",
                isStreetView ? "bg-emerald-500 text-black" : "bg-white/10 text-white hover:bg-white/20",
                !isConnected && "opacity-50 cursor-not-allowed"
              )}
              title="Toggle Street View"
            >
              <Camera className="w-6 h-6" />
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={toggleMic}
              disabled={!isConnected}
              className={cn(
                "w-20 h-20 rounded-full flex items-center justify-center shadow-2xl transition-all",
                !isConnected ? "bg-white/5 text-white/10 cursor-not-allowed" :
                  isRecording ? "bg-red-500 text-white shadow-red-500/40" : "bg-white/10 text-white backdrop-blur-xl border border-white/20 hover:bg-white/20"
              )}
            >
              {isRecording ? <Mic className="w-10 h-10" /> : <MicOff className="w-10 h-10" />}
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setIs3DMode(!is3DMode)}
              disabled={!isConnected}
              className={cn(
                "w-14 h-14 rounded-full flex items-center justify-center backdrop-blur-xl border border-white/20 transition-all",
                is3DMode ? "bg-emerald-500 text-black" : "bg-white/10 text-white hover:bg-white/20",
                !isConnected && "opacity-50 cursor-not-allowed"
              )}
              title="Toggle 3D Mode"
            >
              <Navigation className="w-6 h-6" />
            </motion.button>
          </div>

          {/* Earth View Toggle - Bottom Right */}
          <div className="absolute bottom-10 right-10 z-20">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setIsEarthView(!isEarthView)}
              disabled={!isConnected}
              className={cn(
                "w-16 h-16 rounded-2xl flex items-center justify-center backdrop-blur-2xl border border-white/20 shadow-2xl transition-all",
                isEarthView ? "bg-emerald-500 text-black shadow-emerald-500/40" : "bg-white/10 text-white hover:bg-white/20",
                !isConnected && "opacity-50 cursor-not-allowed"
              )}
              title="Toggle Earth View"
            >
              <Globe className={cn("w-8 h-8", isEarthView && "animate-pulse")} />
            </motion.button>
          </div>

          {/* Floating Landmark Detail Card - Expanded Split View */}
          <AnimatePresence>
            {selectedLandmark && (
              <motion.div
                initial={{ opacity: 0, y: 100, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 100, scale: 0.95 }}
                className="absolute bottom-32 left-8 right-8 h-[500px] bg-black/80 backdrop-blur-3xl border border-white/10 rounded-[40px] shadow-2xl z-40 overflow-hidden flex flex-col"
              >
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 via-blue-500 to-emerald-500 animate-gradient-x" />

                {/* Header */}
                <div className="p-8 flex justify-between items-center border-bottom border-white/5">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
                      <Compass className="w-6 h-6 text-emerald-400" />
                    </div>
                    <div>
                      <span className="text-[10px] uppercase tracking-[0.3em] text-emerald-400 font-black mb-1 block">Interactive Guide</span>
                      <h3 className="text-3xl font-black text-white tracking-tighter">{selectedLandmark.name}</h3>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => {
                        const isFav = favorites.find(f => f.id === selectedLandmark.id);
                        if (isFav) {
                          setFavorites(prev => prev.filter(f => f.id !== selectedLandmark.id));
                        } else {
                          setFavorites(prev => [...prev, selectedLandmark]);
                        }
                      }}
                      className={cn(
                        "w-12 h-12 rounded-full flex items-center justify-center transition-all border",
                        favorites.find(f => f.id === selectedLandmark.id)
                          ? "bg-yellow-500/20 border-yellow-500/50 text-yellow-400"
                          : "bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10"
                      )}
                    >
                      <Star className={cn("w-6 h-6", favorites.find(f => f.id === selectedLandmark.id) && "fill-yellow-400")} />
                    </button>
                    <button
                      onClick={() => {
                        if (selectedLandmark) {
                          setDismissedLandmarkId(selectedLandmark.id);
                        }
                        setSelectedLandmark(null);
                      }}
                      className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all border border-white/10"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 flex overflow-hidden">
                  {/* Left Side: Place Details */}
                  <div className="w-1/3 border-r border-white/5 p-8 overflow-y-auto bg-white/[0.02]">
                    <div className="flex items-center justify-between mb-6">
                      <h4 className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-black flex items-center gap-2">
                        <Info className="w-3 h-3" /> Place Information
                      </h4>
                      <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-md">
                        <div className="w-1 h-1 rounded-full bg-emerald-500" />
                        <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">Verified Grounding</span>
                      </div>
                    </div>

                    {placeInsights[selectedLandmark.id]?.placeDetails ? (
                      <div className="space-y-6">
                        {Object.entries(placeInsights[selectedLandmark.id].placeDetails).map(([key, value], idx) => (
                          value && (
                            <div key={`${key}-${idx}`} className="group">
                              <span className="text-[10px] uppercase tracking-wider text-white/20 font-bold block mb-1 group-hover:text-emerald-400/40 transition-colors">
                                {key.replace(/([A-Z])/g, ' $1').trim()}
                              </span>
                              <p className="text-sm font-medium text-white/80 break-words leading-relaxed">
                                {value}
                              </p>
                            </div>
                          )
                        ))}
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center opacity-20">
                        <Loader2 className="w-8 h-8 animate-spin mb-4" />
                        <p className="text-xs font-bold uppercase tracking-widest">Gathering Details...</p>
                      </div>
                    )}
                  </div>

                  {/* Right Side: Cultural Tips Tabs */}
                  <div className="flex-1 flex flex-col overflow-hidden bg-black/20">
                    <div className="p-8 pb-0">
                      <h4 className="text-[10px] uppercase tracking-[0.2em] text-emerald-400 font-black mb-6 flex items-center gap-2">
                        <Navigation className="w-3 h-3" /> Cultural & Historical Insights
                      </h4>

                      {/* Tabs Scrollable Area */}
                      <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide no-scrollbar">
                        {placeInsights[selectedLandmark.id]?.culturalTips.map((tip, idx) => (
                          <button
                            key={idx}
                            onClick={() => setActiveTipIndex(idx)}
                            className={cn(
                              "flex-shrink-0 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all duration-300",
                              activeTipIndex === idx
                                ? "bg-emerald-500 border-emerald-400 text-black shadow-lg shadow-emerald-500/20"
                                : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10"
                            )}
                          >
                            {tip.title}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Active Tip Content */}
                    <div className="flex-1 p-8 pt-4 overflow-y-auto">
                      <AnimatePresence mode="wait">
                        {placeInsights[selectedLandmark.id]?.culturalTips[activeTipIndex] ? (
                          <motion.div
                            key={activeTipIndex}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="h-full"
                          >
                            <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-[32px] p-8 h-full relative overflow-hidden group">
                              <div className="absolute -top-12 -right-12 w-48 h-48 bg-emerald-500/10 blur-[80px] rounded-full group-hover:bg-emerald-500/20 transition-all duration-700" />
                              <span className="text-6xl font-black text-emerald-500/10 absolute top-4 right-8 select-none">
                                {String(activeTipIndex + 1).padStart(2, '0')}
                              </span>
                              <h5 className="text-2xl font-black text-emerald-400 mb-4 relative z-10">
                                {placeInsights[selectedLandmark.id].culturalTips[activeTipIndex].title}
                              </h5>
                              <p className="text-lg text-white/70 leading-relaxed font-medium relative z-10">
                                {placeInsights[selectedLandmark.id].culturalTips[activeTipIndex].content}
                              </p>
                            </div>
                          </motion.div>
                        ) : (
                          <div className="h-full flex flex-col items-center justify-center text-center opacity-20">
                            <Loader2 className="w-8 h-8 animate-spin mb-4" />
                            <p className="text-xs font-bold uppercase tracking-widest">Charlie is writing tips...</p>
                          </div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </ErrorBoundary>
  );
}
