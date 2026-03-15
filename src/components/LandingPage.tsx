import React from 'react';
import { motion } from 'motion/react';
import { 
  Map as MapIcon, 
  Eye, 
  Mic, 
  Navigation, 
  Zap, 
  Globe, 
  Shield, 
  Sparkles,
  ArrowRight,
  Layers,
  Video
} from 'lucide-react';
import { cn } from '../lib/utils';

interface LandingPageProps {
  onStart: () => void;
  onLogin: () => void;
  isConnecting: boolean;
}

const LandingPage: React.FC<LandingPageProps> = ({ onStart, onLogin, isConnecting }) => {
  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-emerald-500/30 overflow-x-hidden">
      {/* Hero Section */}
      <header className="relative h-screen flex flex-col items-center justify-center px-6 overflow-hidden">
        {/* Animated Background Elements */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/10 blur-[120px] rounded-full animate-pulse" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full animate-pulse" style={{ animationDelay: '2s' }} />
          
          {/* Grid Pattern */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
        </div>

        <nav className="absolute top-0 left-0 right-0 p-8 flex justify-between items-center z-50">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.4)]">
              <MapIcon className="text-white w-6 h-6" />
            </div>
            <span className="text-xl font-bold tracking-tighter uppercase">Charlie Tour</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-white/60 uppercase tracking-widest">
            <a href="#features" className="hover:text-emerald-400 transition-colors">Features</a>
            <a href="#tech" className="hover:text-emerald-400 transition-colors">Technology</a>
            <a href="#vision" className="hover:text-emerald-400 transition-colors">Vision</a>
          </div>
          <button 
            onClick={onLogin}
            className="px-6 py-2 bg-emerald-500 text-white rounded-full font-bold text-sm uppercase tracking-wider hover:bg-emerald-400 transition-all active:scale-95 shadow-[0_0_20px_rgba(16,185,129,0.3)]"
          >
            Sign In with Google
          </button>
        </nav>

        <div className="relative z-10 text-center max-w-5xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1 className="text-7xl md:text-9xl font-black tracking-tighter leading-[0.85] uppercase mb-8">
              The Future of <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-blue-500">Exploration</span>
            </h1>
            <p className="text-xl md:text-2xl text-white/60 font-light max-w-2xl mx-auto mb-12 leading-relaxed">
              Meet Charlie, the world's first autonomous AI tour guide powered by the Gemini Live API. 
              Real-time vision, low-latency voice, and proactive intelligence.
            </p>
            <div className="flex flex-col md:flex-row items-center justify-center gap-6">
              <button 
                onClick={onLogin}
                className="group relative px-10 py-5 bg-emerald-500 rounded-2xl font-black text-xl uppercase tracking-tighter overflow-hidden transition-all hover:shadow-[0_0_40px_rgba(16,185,129,0.4)] active:scale-95"
              >
                <span className="relative z-10 flex items-center gap-3">
                  Sign In to Start <ArrowRight className="group-hover:translate-x-2 transition-transform" />
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 to-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
              <div className="flex items-center gap-4 px-6 py-4 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl">
                <div className="flex -space-x-3">
                  {[1,2,3].map(i => (
                    <div key={i} className="w-8 h-8 rounded-full border-2 border-[#050505] bg-emerald-500 flex items-center justify-center text-[10px] font-bold">
                      AI
                    </div>
                  ))}
                </div>
                <span className="text-sm font-medium text-white/40 uppercase tracking-widest">Hackathon Edition 2026</span>
              </div>
            </div>
          </motion.div>
        </div>

        <motion.div 
          animate={{ y: [0, 10, 0] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="absolute bottom-10 left-1/2 -translate-x-1/2 text-white/20"
        >
          <div className="w-6 h-10 border-2 border-current rounded-full flex justify-center p-1">
            <div className="w-1 h-2 bg-current rounded-full" />
          </div>
        </motion.div>
      </header>

      {/* Features Grid */}
      <section id="features" className="py-32 px-6 bg-[#0a0a0a]">
        <div className="max-w-7xl mx-auto">
          <div className="mb-24">
            <h2 className="text-5xl md:text-7xl font-black uppercase tracking-tighter mb-6">
              Live Agent <br />Capabilities
            </h2>
            <div className="h-1 w-24 bg-emerald-500" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <FeatureCard 
              icon={<Mic className="w-8 h-8 text-emerald-400" />}
              title="Gemini Live API"
              description="Ultra-low latency voice interaction. Charlie hears, understands, and responds in real-time with human-like charisma."
            />
            <FeatureCard 
              icon={<Eye className="w-8 h-8 text-blue-400" />}
              title="Multimodal Vision"
              description="Charlie sees your screen. He identifies landmarks, architecture, and hidden details as you explore the world together."
            />
            <FeatureCard 
              icon={<Zap className="w-8 h-8 text-yellow-400" />}
              title="Autonomous Agency"
              description="Charlie isn't just a chatbot. He's a guide. He takes the lead, controls the map, and navigates based on your interests."
            />
            <FeatureCard 
              icon={<Layers className="w-8 h-8 text-purple-400" />}
              title="Proactive Annotations"
              description="Real-time visual highlighting. Charlie draws boxes, arrows, and markers directly on the map to point out what he's narrating."
            />
            <FeatureCard 
              icon={<Globe className="w-8 h-8 text-orange-400" />}
              title="Immersive 3D & Street View"
              description="Seamless transitions between 2D maps, 3D photorealistic views, and ground-level Street View exploration."
            />
            <FeatureCard 
              icon={<Shield className="w-8 h-8 text-red-400" />}
              title="Contextual Intelligence"
              description="Charlie remembers your favorites, understands your tone, and adapts the tour pacing to keep you engaged."
            />
          </div>
        </div>
      </section>

      {/* Technical Deep Dive */}
      <section id="tech" className="py-32 px-6 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-emerald-500/5 blur-[150px] rounded-full pointer-events-none" />
        
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-24 items-center">
          <div>
            <span className="text-emerald-400 font-bold uppercase tracking-[0.3em] text-sm mb-6 block">The Tech Stack</span>
            <h2 className="text-6xl font-black uppercase tracking-tighter mb-8 leading-none">
              Built for the <br />Next Generation
            </h2>
            <p className="text-xl text-white/60 mb-12 leading-relaxed">
              Charlie Tour leverages the cutting edge of AI and Web technologies to create a seamless, 
              zero-latency exploration experience. No manual controls, just pure interaction.
            </p>
            
            <ul className="space-y-6">
              <TechItem title="Gemini 3.1 Pro Preview" detail="State-of-the-art reasoning for complex historical and cultural context." />
              <TechItem title="Real-time WebRTC Streaming" detail="Bidirectional audio and video streaming for the Live Agent experience." />
              <TechItem title="Google Maps Photorealistic 3D" detail="Leveraging the latest Maps SDK for immersive visual storytelling." />
              <TechItem title="Autonomous Tool Calling" detail="Charlie executes complex sequences of map movements and visual highlights." />
            </ul>
          </div>

          <div className="relative">
            <div className="aspect-square rounded-3xl bg-white/5 border border-white/10 p-8 relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
              <div className="relative z-10 h-full flex flex-col justify-between">
                <div className="flex justify-between items-start">
                  <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center">
                    <Sparkles className="w-8 h-8 text-white" />
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-mono text-white/40 uppercase tracking-widest">Status</p>
                    <p className="text-emerald-400 font-bold uppercase tracking-tighter">Operational</p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                    <motion.div 
                      animate={{ x: ['-100%', '100%'] }}
                      transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
                      className="h-full w-1/3 bg-emerald-500"
                    />
                  </div>
                  <p className="font-mono text-[10px] text-white/30 uppercase tracking-[0.2em]">
                    Processing Multimodal Input Stream...
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                    <p className="text-[10px] text-white/40 uppercase mb-1">Latency</p>
                    <p className="text-xl font-bold tracking-tighter">~120ms</p>
                  </div>
                  <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                    <p className="text-[10px] text-white/40 uppercase mb-1">Throughput</p>
                    <p className="text-xl font-bold tracking-tighter">4K/60fps</p>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Decorative Elements */}
            <div className="absolute -top-12 -right-12 w-48 h-48 bg-blue-500/10 blur-3xl rounded-full" />
            <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-emerald-500/10 blur-3xl rounded-full" />
          </div>
        </div>
      </section>

      {/* Vision Showcase */}
      <section id="vision" className="py-32 px-6 bg-white text-black">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-end gap-12 mb-24">
            <div className="max-w-2xl">
              <h2 className="text-6xl md:text-8xl font-black uppercase tracking-tighter leading-[0.85] mb-8">
                He Sees <br />What You See
              </h2>
              <p className="text-xl text-black/60 leading-relaxed">
                Charlie's vision system captures the map container in real-time, allowing him to 
                "look" at the same landmarks you are viewing. He uses this to provide 
                spontaneous, context-aware commentary.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-full border-2 border-black flex items-center justify-center">
                <Video className="w-8 h-8" />
              </div>
              <span className="text-sm font-bold uppercase tracking-widest">Live Vision Feed</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <div className="group relative aspect-video rounded-3xl overflow-hidden bg-black">
              <img 
                src="https://picsum.photos/seed/city-vision/1200/800" 
                alt="Vision Analysis" 
                className="w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-700"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 p-8 flex flex-col justify-between pointer-events-none">
                <div className="flex justify-between items-start">
                  <div className="px-3 py-1 bg-emerald-500 text-white text-[10px] font-bold uppercase rounded-full">Object Detection</div>
                  <div className="text-white/40 font-mono text-[10px]">01 // ARCHITECTURE</div>
                </div>
                <div className="space-y-2">
                  <div className="w-32 h-32 border-2 border-emerald-500 rounded-lg relative">
                    <div className="absolute -top-6 left-0 bg-emerald-500 text-white text-[8px] px-2 py-0.5 rounded font-bold uppercase">Maple Tree</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-col justify-center space-y-8">
              <div className="p-8 bg-black/5 rounded-3xl border border-black/10">
                <h3 className="text-2xl font-bold uppercase mb-4">Semantic Understanding</h3>
                <p className="text-black/60">Charlie doesn't just see pixels; he understands history. He can distinguish between a 19th-century facade and a modern renovation.</p>
              </div>
              <div className="p-8 bg-black/5 rounded-3xl border border-black/10">
                <h3 className="text-2xl font-bold uppercase mb-4">Real-time Annotation</h3>
                <p className="text-black/60">As he speaks, he draws. His narration is perfectly synced with visual highlights, creating a truly multimodal experience.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-48 px-6 text-center relative overflow-hidden">
        <div className="absolute inset-0 z-0">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] h-[150%] bg-[radial-gradient(circle_at_center,#10b98115_0%,transparent_70%)]" />
        </div>
        
        <div className="relative z-10 max-w-4xl mx-auto">
          <h2 className="text-7xl md:text-9xl font-black uppercase tracking-tighter leading-[0.8] mb-12">
            Ready to <br />Explore?
          </h2>
          <button 
            onClick={onLogin}
            className="group relative px-16 py-8 bg-white text-black rounded-3xl font-black text-3xl uppercase tracking-tighter overflow-hidden transition-all hover:scale-105 active:scale-95 shadow-[0_20px_60px_rgba(255,255,255,0.1)]"
          >
            <span className="relative z-10 flex items-center gap-4">
              Sign In Now <ArrowRight className="w-8 h-8 group-hover:translate-x-3 transition-transform" />
            </span>
          </button>
          <p className="mt-12 text-white/40 font-mono text-sm uppercase tracking-[0.3em]">
            Experience Charlie Tour • Version 2.0 • 2026
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-8">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center">
            <MapIcon className="text-white w-4 h-4" />
          </div>
          <span className="text-sm font-bold tracking-tighter uppercase">Charlie Tour</span>
        </div>
        <p className="text-white/20 text-xs uppercase tracking-widest font-medium">
          © 2026 Charlie Tour AI. Built for the Hackathon.
        </p>
        <div className="flex gap-6 text-white/40 text-xs uppercase tracking-widest font-bold">
          <a href="#" className="hover:text-emerald-400 transition-colors">Privacy</a>
          <a href="#" className="hover:text-emerald-400 transition-colors">Terms</a>
          <a href="#" className="hover:text-emerald-400 transition-colors">Github</a>
        </div>
      </footer>
    </div>
  );
};

const FeatureCard = ({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) => (
  <div className="p-8 bg-white/5 border border-white/10 rounded-3xl hover:bg-white/10 transition-all group">
    <div className="mb-6 transform group-hover:scale-110 transition-transform duration-500">{icon}</div>
    <h3 className="text-xl font-bold uppercase mb-4 tracking-tight">{title}</h3>
    <p className="text-white/50 leading-relaxed text-sm">{description}</p>
  </div>
);

const TechItem = ({ title, detail }: { title: string, detail: string }) => (
  <li className="flex items-start gap-4 group">
    <div className="mt-1.5 w-1.5 h-1.5 bg-emerald-500 rounded-full group-hover:scale-150 transition-transform" />
    <div>
      <p className="font-bold uppercase text-sm tracking-tight">{title}</p>
      <p className="text-white/40 text-xs">{detail}</p>
    </div>
  </li>
);

export default LandingPage;
