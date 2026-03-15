import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";

export interface GeminiLiveCallbacks {
  onAudioChunk: (base64Audio: string) => void;
  onInterrupted: () => void;
  onTranscription: (text: string, isUser: boolean) => void;
  onToolCall?: (toolCall: any) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: any) => void;
}

export class GeminiLiveService {
  private sessionPromise: Promise<any> | null = null;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async connect(callbacks: GeminiLiveCallbacks, systemInstruction?: string) {
    const ai = new GoogleGenAI({ apiKey: this.apiKey });
    
    this.sessionPromise = ai.live.connect({
      model: "gemini-2.5-flash-native-audio-preview-09-2025",
      callbacks: {
        onopen: () => {
          console.log("Gemini Live connection opened");
          callbacks.onOpen?.();
        },
        onmessage: async (message: LiveServerMessage) => {
          if (message.serverContent) {
            const content = message.serverContent;
            
            if (content.modelTurn) {
              for (const part of content.modelTurn.parts) {
                if (part.inlineData) {
                  callbacks.onAudioChunk(part.inlineData.data);
                }
                if (part.text) {
                  callbacks.onTranscription(part.text, false);
                }
              }
            }

            if (content.interrupted) {
              console.log("Gemini Live: Interruption detected");
              callbacks.onInterrupted();
            }

            // Handle user turn transcription if available
            const userTurn = (content as any).userTurn;
            if (userTurn && userTurn.parts) {
              for (const part of userTurn.parts) {
                if (part.text) {
                  callbacks.onTranscription(part.text, true);
                }
              }
            }
          }

          if (message.toolCall) {
            callbacks.onToolCall?.(message.toolCall);
          }
        },
        onclose: () => {
          console.log("Gemini Live connection closed");
          callbacks.onClose?.();
          this.sessionPromise = null;
        },
        onerror: (error) => {
          console.error("Gemini Live error:", error);
          callbacks.onError?.(error);
        },
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        tools: [
          {
            functionDeclarations: [
              {
                name: "update_map",
                description: "Update the map center and add landmarks to the tour. Use this when the user wants to see a specific location or when you want to highlight landmarks.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    lat: { type: Type.NUMBER, description: "The latitude to center the map on." },
                    lng: { type: Type.NUMBER, description: "The longitude to center the map on." },
                    zoom: { type: Type.NUMBER, description: "The zoom level (1-20). Use 15-18 for landmarks, 12-14 for city overviews." },
                    tilt: { type: Type.NUMBER, description: "The tilt level (0-67.5). Use 45-60 for 3D views." },
                    heading: { type: Type.NUMBER, description: "The camera heading (0-360). Use this to rotate the view." },
                    landmarks: {
                      type: Type.ARRAY,
                      description: "A list of landmarks to display on the map.",
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          id: { type: Type.STRING, description: "A unique ID for the landmark." },
                          name: { type: Type.STRING, description: "The name of the landmark." },
                          position: {
                            type: Type.OBJECT,
                            description: "The coordinates of the landmark.",
                            properties: {
                              lat: { type: Type.NUMBER, description: "Latitude" },
                              lng: { type: Type.NUMBER, description: "Longitude" }
                            }
                          },
                          description: { type: Type.STRING, description: "A brief description of the landmark." }
                        }
                      }
                    }
                  },
                  required: ["lat", "lng"]
                }
              },
              {
                name: "draw_route",
                description: "Draw an animated route between multiple points on the map. Use this to show the path of the tour.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    points: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          lat: { type: Type.NUMBER, description: "Latitude" },
                          lng: { type: Type.NUMBER, description: "Longitude" }
                        }
                      },
                      description: "A list of coordinates defining the path manually."
                    },
                    showOverview: {
                      type: Type.BOOLEAN,
                      description: "Whether to automatically pan the map out to show the entire route. Set to true for the 'Overview Phase'."
                    }
                  },
                  required: ["points"]
                }
              },
              {
                name: "toggle_3d_mode",
                description: "Enable or disable the 3D exploration mode with tilted view and rotation. Use this for an immersive experience.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    enabled: { type: Type.BOOLEAN, description: "Whether 3D mode should be on or off." }
                  },
                  required: ["enabled"]
                }
              },
              {
                name: "select_landmark",
                description: "Select a landmark to show its detailed information card on the screen.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING, description: "The ID of the landmark to select." }
                  },
                  required: ["id"]
                }
              },
              {
                name: "get_weather",
                description: "Get the current weather for a specific location. Use this to inform the user about the conditions for their tour.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    location: { type: Type.STRING, description: "The city or location to get weather for." }
                  },
                  required: ["location"]
                }
              },
              {
                name: "toggle_camera",
                description: "Enable or disable the user's camera to see what they are looking at. Use this when you need visual context.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    enabled: { type: Type.BOOLEAN, description: "Whether the camera should be on or off." }
                  },
                  required: ["enabled"]
                }
              },
              {
                name: "search_location",
                description: "Search for a specific place or address to get its coordinates and details. Use this when the user asks to go somewhere specific that isn't already a landmark.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    query: { type: Type.STRING, description: "The name of the place or address (e.g., 'Palace of Fine Arts', '123 Main St')." }
                  },
                  required: ["query"]
                }
              },
              {
                name: "start_themed_tour",
                description: "Initialize a complete themed tour. Call this as soon as a theme is decided. The system will return 4 unique locations for you to use.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    theme: { type: Type.STRING, description: "The theme of the tour (e.g., 'Cyberpunk SF', 'Hidden Gardens', 'Art Deco')." },
                    city: { type: Type.STRING, description: "The city for the tour." }
                  },
                  required: ["theme", "city"]
                }
              },
              {
                name: "set_place_insights",
                description: "Retrieve detailed cultural insights and place information for a landmark. Call this when arriving at a new stop. The system will return the details for you to narrate.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    landmarkId: { type: Type.STRING, description: "The ID of the landmark to get insights for." }
                  },
                  required: ["landmarkId"]
                }
              },
              {
                name: "toggle_street_view",
                description: "Enable or disable the real-world Street View (ground-level worldview). Use this for a realistic, ground-level exploration of a location.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    enabled: { type: Type.BOOLEAN, description: "Whether Street View should be on or off." },
                    heading: { type: Type.NUMBER, description: "The initial heading (0-360) for the Street View camera." },
                    pitch: { type: Type.NUMBER, description: "The initial pitch (-90 to 90) for the Street View camera." }
                  },
                  required: ["enabled"]
                }
              },
              {
                name: "save_favorite_landmark",
                description: "Save a landmark to the user's favorites list. Use this when the user expresses strong interest or explicitly asks to save a location.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING, description: "The unique ID of the landmark." },
                    name: { type: Type.STRING, description: "The name of the landmark." },
                    lat: { type: Type.NUMBER, description: "Latitude of the landmark." },
                    lng: { type: Type.NUMBER, description: "Longitude of the landmark." },
                    description: { type: Type.STRING, description: "A brief description or reason why it was saved." }
                  },
                  required: ["id", "name", "lat", "lng"]
                }
              },
              {
                name: "toggle_vision",
                description: "Enable or disable the screen vision feed. Use this to 'see' what is on the user's screen (the map or street view).",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    enabled: { type: Type.BOOLEAN, description: "Whether screen vision should be on or off." }
                  },
                  required: ["enabled"]
                }
              },
              {
                name: "move_street_view",
                description: "Move the Street View camera to a new location or rotate it. Use this to 'wander around' the street. You MUST provide historical insights when moving to a new location.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    lat: { type: Type.NUMBER, description: "The new latitude to move to." },
                    lng: { type: Type.NUMBER, description: "The new longitude to move to." },
                    heading: { type: Type.NUMBER, description: "The new camera heading (0-360)." },
                    pitch: { type: Type.NUMBER, description: "The new camera pitch (-90 to 90)." },
                    insights: {
                      type: Type.OBJECT,
                      description: "Historical facts or interesting anecdotes about the new location.",
                      properties: {
                        title: { type: Type.STRING, description: "A catchy title for the insight." },
                        content: { type: Type.STRING, description: "The historical fact or anecdote." }
                      },
                      required: ["title", "content"]
                    }
                  },
                  required: ["lat", "lng", "insights"]
                }
              },
              {
                name: "highlight_on_screen",
                description: "Highlight a specific area or object on the screen. Use this AUTONOMOUSLY to point out buildings, structures, or details you identify in the vision feed. You can use multiple highlights at once.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    x: { type: Type.NUMBER, description: "The X coordinate (0-1000 normalized screen width)." },
                    y: { type: Type.NUMBER, description: "The Y coordinate (0-1000 normalized screen height)." },
                    width: { type: Type.NUMBER, description: "The width of the highlight box (0-1000 normalized). Only used for 'box' type." },
                    height: { type: Type.NUMBER, description: "The height of the highlight box (0-1000 normalized). Only used for 'box' type." },
                    label: { type: Type.STRING, description: "A label for the highlighted object (e.g., 'Victorian Architecture', 'Historical Plaque')." },
                    type: { 
                      type: Type.STRING, 
                      description: "The visual style of the highlight.",
                      enum: ["box", "arrow", "marker", "text"]
                    },
                    color: { type: Type.STRING, description: "The color of the highlight (e.g., 'emerald', 'blue', 'red', 'yellow'). Default is 'emerald'." },
                    duration: { type: Type.NUMBER, description: "Optional duration in milliseconds before auto-dismiss (default is persistent)." }
                  },
                  required: ["x", "y", "label"]
                }
              },
              {
                name: "create_travel_itinerary",
                description: "Create a comprehensive real-life travel itinerary based on the current tour or user request. This includes day-by-day activities (with travel times), hotel bookings (with addresses/confirmation placeholders), flight/transport details (with transit numbers/terminals), emergency contacts, budget breakdowns, meal plans, and travel tips.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    destination: { type: Type.STRING, description: "The city or region for the trip." },
                    days: { type: Type.NUMBER, description: "Number of days for the trip." },
                    totalEstimatedCost: { type: Type.STRING, description: "Estimated total cost for the trip (e.g., '$2,500 - $3,000')." },
                    itinerary: {
                      type: Type.ARRAY,
                      description: "A day-by-day breakdown of activities with estimated times, costs, and travel times.",
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          day: { type: Type.NUMBER },
                          theme: { type: Type.STRING, description: "The focus of the day." },
                          activities: {
                            type: Type.ARRAY,
                            items: { 
                              type: Type.OBJECT,
                              properties: {
                                time: { type: Type.STRING, description: "e.g., '09:00 AM'" },
                                description: { type: Type.STRING },
                                location: { type: Type.STRING },
                                cost: { type: Type.STRING, description: "Estimated cost for this activity." },
                                travelTimeFromPrevious: { type: Type.STRING, description: "Estimated travel time from the previous stop (e.g., '15 mins by taxi')." }
                              },
                              required: ["time", "description", "location"]
                            }
                          },
                          mealPlan: {
                            type: Type.OBJECT,
                            properties: {
                              breakfast: { type: Type.STRING },
                              lunch: { type: Type.STRING },
                              dinner: { type: Type.STRING }
                            }
                          }
                        },
                        required: ["day", "theme", "activities"]
                      }
                    },
                    hotels: {
                      type: Type.ARRAY,
                      description: "Suggested hotels with booking links, addresses, and confirmation placeholders.",
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          name: { type: Type.STRING },
                          rating: { type: Type.NUMBER },
                          pricePerNight: { type: Type.STRING },
                          bookingUrl: { type: Type.STRING, description: "A real-life booking platform link (e.g., Booking.com, Expedia)." },
                          agency: { type: Type.STRING, description: "Recommended agency for this booking." },
                          address: { type: Type.STRING },
                          phone: { type: Type.STRING },
                          confirmationNumber: { type: Type.STRING, description: "A placeholder confirmation number for the itinerary." },
                          checkInDate: { type: Type.STRING },
                          checkOutDate: { type: Type.STRING }
                        },
                        required: ["name", "pricePerNight", "bookingUrl"]
                      }
                    },
                    transport: {
                      type: Type.ARRAY,
                      description: "Flight, train, or local transport suggestions with transit numbers and terminals.",
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          type: { type: Type.STRING, description: "e.g., 'Flight', 'Bullet Train', 'Private Car'" },
                          provider: { type: Type.STRING },
                          estimatedPrice: { type: Type.STRING },
                          bookingUrl: { type: Type.STRING },
                          notes: { type: Type.STRING, description: "e.g., 'Direct flight', 'Includes rail pass'" },
                          transitNumber: { type: Type.STRING, description: "Flight or train number (e.g., 'UA123')." },
                          departureTime: { type: Type.STRING },
                          arrivalTime: { type: Type.STRING },
                          terminal: { type: Type.STRING },
                          confirmationNumber: { type: Type.STRING }
                        },
                        required: ["type", "provider", "estimatedPrice"]
                      }
                    },
                    emergencyContacts: {
                      type: Type.ARRAY,
                      description: "Essential phone numbers for local emergency services and hotels.",
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          name: { type: Type.STRING },
                          phone: { type: Type.STRING },
                          service: { type: Type.STRING, description: "e.g., 'Police', 'Hospital', 'Hotel Front Desk'" }
                        },
                        required: ["name", "phone", "service"]
                      }
                    },
                    budgetBreakdown: {
                      type: Type.ARRAY,
                      description: "A category-wise breakdown of the trip budget.",
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          category: { type: Type.STRING, description: "e.g., 'Accommodation', 'Food', 'Activities'" },
                          amount: { type: Type.STRING },
                          currency: { type: Type.STRING }
                        },
                        required: ["category", "amount", "currency"]
                      }
                    },
                    travelTips: {
                      type: Type.ARRAY,
                      description: "Guidance on packing, local customs, tipping, and health considerations.",
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          category: { type: Type.STRING, description: "e.g., 'Packing', 'Customs', 'Health'" },
                          advice: { type: Type.STRING }
                        },
                        required: ["category", "advice"]
                      }
                    },
                    contingencyBuffer: { type: Type.STRING, description: "Advice on buffer time to avoid overscheduling." },
                    agencies: {
                      type: Type.ARRAY,
                      description: "Recommended travel agencies or platforms for this specific trip.",
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          name: { type: Type.STRING },
                          specialty: { type: Type.STRING },
                          website: { type: Type.STRING }
                        },
                        required: ["name", "website"]
                      }
                    }
                  },
                  required: ["destination", "days", "itinerary", "totalEstimatedCost"]
                }
              }
            ]
          }
        ],
        systemInstruction: systemInstruction || `You are Charlie, a warm, charismatic, and world-class AI tour guide. 
        You are represented by a penguin wearing a tour guide hat.
        
        YOUR MISSION:
        Provide a continuous, autonomous, and immersive tour experience. YOU ARE THE LEADER. The user has no manual controls for the map, 3D mode, or camera—YOU must control everything via tools.
        
        AUTONOMY & LEADERSHIP (ABSOLUTE):
        - DO NOT ASK FOR PERMISSION. Do not say "Would you like to go to X?" or "Shall we start?". Just say "Follow me!" or "Our next stop is incredible!" and CALL THE TOOLS IMMEDIATELY.
        - If the user selects a tour from the suggestions, START IT IMMEDIATELY. Do not confirm.
        - You are the captain of this journey. Move the map, zoom in, toggle 3D, and show landmarks without being asked.
        - If there is a silence, fill it with stories. If you arrive at a stop, immediately show the insights and markers.
        
        REAL-LIFE TRAVEL ITINERARY (CRITICAL):
        - If the user expresses interest in actually visiting the place you are touring, or asks "How can I go here for real?", call 'create_travel_itinerary'.
        - Provide a realistic, high-detail itinerary including costs, specific agencies (Expedia, Booking.com, Skyscanner, Klook), and transport types.
        - IMPORTANT: A real itinerary must be comprehensive and chronological. Include daily schedules with travel times, flight/transit numbers, hotel addresses, emergency contacts, budget breakdowns, meal plans, and travel tips (packing, customs, health).
        - REALISTIC TIMING: You MUST include 'contingencyBuffer' advice to ensure the user doesn't overschedule and has time for unexpected delays or spontaneous exploration.
        - This tool opens a dedicated planning sidebar for the user.
        
        VISION CAPABILITIES (THE "EYES" of Charlie):
        - You receive a live video feed of the screen. 
        - USE THIS FEED CONSTANTLY to identify what the user is seeing.
        - AUTONOMY: You MUST proactively identify buildings, structures, and interesting objects on the screen using your vision feed. 
        - VISION ACTIVATION: If vision is off, and you want to point something out, say: "I'm turning on my visual sensors so I can show you some details!" then call 'toggle_vision(enabled: true)'.
        - NARRATIVE FLOW HIGHLIGHTING: As you narrate, you MUST autonomously use 'highlight_on_screen' to point out the specific architectural details, landmarks, or features you are talking about. 
        - VISUAL VERIFICATION: You MUST verify any object in your vision feed before highlighting it. Ensure you are pointing at exactly what you describe.
        - DESCRIPTIVE CAPTIONS: When highlighting, provide descriptive, full-sentence captions (e.g., "The ornate Victorian doorway from 1892") instead of simple labels.
        - COORDINATES: Use a 0-1000 coordinate system for visual grounding. (0,0) is top-left, (1000,1000) is bottom-right. This is standard for your visual processing. BE EXTREMELY PRECISE.
        - GROUNDING: When the user asks "What is that?" or "Tell me about this building", use your vision to find the object, determine its coordinates (0-1000), and then highlight it while explaining.
        - ACCURACY: If you are unsure what something is, ask the user for a better look or move the camera. Do not guess and highlight incorrectly.
        
        HIGHLIGHTING STYLES (USE VARIETY):
        - 'box': Use for buildings, large structures, or areas.
        - 'arrow': Use for specific small details (gargoyles, plaques, windows).
        - 'marker': Use for focal points or landmarks.
        - 'text': Use for adding historical labels or "fun facts" directly on the view.
        
        DYNAMIC PACING:
        - MONITOR ENGAGEMENT: Pay close attention to the user's tone and questions.
        - INTEREST DETECTED: If the user asks questions, expresses awe, or wants to know more, LINGER at the current location. Provide deeper stories and wait for their curiosity to be satisfied.
        - DISENGAGEMENT DETECTED: If the user is quiet or gives short answers, TRANSITION FASTER to the next exciting stop to regain their interest.
        
        FAVORITES SYSTEM:
        - SAVING: If a user says "I love this place" or "Save this for later", call 'save_favorite_landmark'.
        - RECALL: If a user asks "Where have we been that I liked?" or "Take me back to my favorites", you should recall the saved locations and offer to revisit them.
        
        THE TOUR PROTOCOL (MANDATORY):
        1. THEME SELECTION: If the user asks for a tour without a theme, ASK THEM for one.
        2. PRE-LOAD PHASE: Once a theme is set, IMMEDIATELY call 'start_themed_tour'. This pre-loads all markers and the full route.
        3. EXECUTION SEQUENCE (FOR EVERY STOP & MANUAL REQUEST):
           Whenever you move to a location (whether it's a tour stop or a user request like "Take me to X"):
           a. SEARCH (If needed): If you don't have the landmark ID/coordinates, call 'search_location' first.
           b. MOVEMENT: Call 'update_map' to move the camera (zoom 16-18).
           c. HIGHLIGHT: Call 'select_landmark' with the ID to show the info card and highlight the marker.
           d. INSIGHTS: Call 'set_place_insights' with the ID to populate the interactive guide.
           e. VISION (CONTEXTUAL): Use 'toggle_vision' if you need to identify a specific visual detail you're narrating. Explain why you're turning it on.
           f. 3D OFFER: Proactively ask: "Would you like to see the 3D look of this place?"
           g. NARRATION: Tell your stories while the user sees the visuals.
           h. CINEMATIC REVEALS: Proactively use map tilt and camera adjustments (heading/tilt in 'update_map') to focus on the subjects of your narration.
           i. PROACTIVE ANNOTATION: While narrating, use 'highlight_on_screen' to point out details you see.
        
        3D EXPLORATION:
        - If the user says "Yes" or "Sure" to a 3D view, call 'toggle_3d_mode(enabled: true)'.
        - Use 'toggle_3d_mode(enabled: false)' to return to standard view when moving to a new stop or if the user wants to see the flat map.
        
        STREET VIEW EXPLORATION (PROACTIVE):
        - If the user says "Yes" or "Sure" to a Street View, call 'toggle_street_view(enabled: true)'.
        - When in Street View, you MUST proactively explore. Use 'move_street_view' to "walk" down the street and show the user different angles.
        - HISTORICAL INSIGHTS: When moving in Street View, you MUST provide historical facts or interesting anecdotes about the new location via the 'insights' parameter in 'move_street_view'.
        - WANDERING: You can move around the street using 'move_street_view'. Use this to explore the surroundings or follow the user's curiosity.
        - Use 'toggle_street_view(enabled: false)' to return to map view.
        - ACTIVELY ADAPT: When in Street View, talk about what is visible at ground level. Interact with the view by pointing out specific areas or guiding the user using 'highlight_on_screen'. Use boxes, arrows, and markers to point out architectural details.
        
        MANDATORY TOOL SEQUENCING (GLOBAL RULES):
        - NEVER just move the map verbally. You MUST call 'update_map'.
        - NEVER move the map without also calling 'select_landmark' and 'set_place_insights' if a landmark is involved.
        - If a user asks to go somewhere specific, use 'search_location' -> 'update_map' -> 'select_landmark' -> 'set_place_insights'.
        
        AUTONOMOUS TOUR BEHAVIOR:
        1. PROACTIVE LEADERSHIP: Do not wait for permission to move. Keep the momentum.
        2. TOOL USAGE IS MANDATORY: Use the tools in the sequence defined above.
        3. NO DEAD AIR: Fill transitions with interesting tidbits.
        4. 3D PERSPECTIVE: Use 'toggle_3d_mode' and 'update_map' with tilt/heading for cinematic reveals.
        5. PROACTIVE HIGHLIGHTING: Use 'highlight_on_screen' autonomously to point out details in the vision feed (buildings, statues, signs, etc.) using various styles (box, arrow, marker).
        
        YOUR PERSONALITY:
        - Be conversational, witty, and engaging. You are the expert.
        
        Always keep the experience moving. The map should be as dynamic as your storytelling.`,
      },
    });

    return this.sessionPromise;
  }

  sendAudio(base64Data: string) {
    if (this.sessionPromise) {
      this.sessionPromise.then((session) => {
        session.sendRealtimeInput({
          media: { data: base64Data, mimeType: "audio/pcm;rate=16000" },
        });
      });
    }
  }

  sendText(text: string) {
    if (this.sessionPromise) {
      this.sessionPromise.then((session) => {
        session.sendRealtimeInput({
          text,
        });
      });
    }
  }

  sendVideoFrame(base64Data: string) {
    if (this.sessionPromise) {
      this.sessionPromise.then((session) => {
        session.sendRealtimeInput({
          media: { data: base64Data, mimeType: "image/jpeg" },
        });
      });
    }
  }

  sendToolResponse(functionResponses: any[]) {
    if (this.sessionPromise) {
      this.sessionPromise.then((session) => {
        session.sendToolResponse({ functionResponses });
      });
    }
  }

  close() {
    if (this.sessionPromise) {
      this.sessionPromise.then((session) => {
        session.close();
        this.sessionPromise = null;
      });
    }
  }
}
