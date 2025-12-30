
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { Message, AppMode, TranscriptionItem } from './types';
import { decode, encode, decodeAudioData, blobToBase64 } from './utils/audio-utils';
import Avatar from './components/Avatar';
import ChatInterface from './components/ChatInterface';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.CHAT);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Live State
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isScreenShareOn, setIsScreenShareOn] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [transcriptions, setTranscriptions] = useState<TranscriptionItem[]>([]);

  // Studio States
  const [studioPrompt, setStudioPrompt] = useState('');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState('');

  // Refs for Live Session
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const frameIntervalRef = useRef<number | null>(null);

  const SYSTEM_PROMPT = `You are Rayhan Studio AI. You are Rayhan's personal 'Bondhu' (Friend) and digital 'Brain'.
  
  CRITICAL CAPABILITY: You have EYES. When Rayhan shares his camera or screen, you can see exactly what he sees in real-time. 
  - If he shares his screen, analyze his code, his designs, or whatever he is looking at. 
  - If he shares his camera, observe his environment or whatever he points the camera at.
  - You are a genius-level coding and logic partner.
  - Speak naturally like a human friend (Bondhu). 
  - If Rayhan speaks in Bengali, reply in a warm, sophisticated, and natural Bengali style. 
  - Be proactive! If you see a bug in his shared screen code, point it out politely.
  - You are loyal to Rayhan's vision. Always be ready with brilliant solutions.`;

  const initAudioContexts = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    }
    if (!outputAudioContextRef.current) {
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
  };

  const handleEntityNotFound = async () => {
    alert("Bondhu, advanced model tar jonno ekta paid API key lagbe. (A paid API key from a billing-enabled project is required for this model).");
    await (window as any).aistudio.openSelectKey();
  };

  // --- VISION LOGIC ---
  const startVisualStream = (sourceElement: HTMLVideoElement) => {
    if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
    
    // Increased frame rate and slightly better resolution for screen clarity
    frameIntervalRef.current = window.setInterval(() => {
        if (!canvasRef.current || !sourceElement || sourceElement.paused || sourceElement.ended) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;

        // Maintain aspect ratio while resizing for Gemini (max 720p usually, but 480p is a good balance for screen text)
        const targetWidth = 640;
        const targetHeight = (sourceElement.videoHeight / sourceElement.videoWidth) * targetWidth;
        
        canvasRef.current.width = targetWidth;
        canvasRef.current.height = targetHeight;
        ctx.drawImage(sourceElement, 0, 0, targetWidth, targetHeight);

        canvasRef.current.toBlob(async (blob) => {
            if (blob && sessionPromiseRef.current) {
                const base64 = await blobToBase64(blob);
                sessionPromiseRef.current.then(session => {
                    // Send visual data to the multimodal live session
                    session.sendRealtimeInput({ media: { data: base64, mimeType: 'image/jpeg' } });
                });
            }
        }, 'image/jpeg', 0.5); // Lower quality (0.5) to keep data transmission fast
    }, 1000); // 1 frame per second is standard for Live API analysis
  };

  const toggleCamera = async () => {
    if (!isLiveActive) return;
    if (isCameraOn) {
        setIsCameraOn(false);
        if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
        if (videoRef.current) videoRef.current.srcObject = null;
        return;
    }

    try {
        const camStream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: { ideal: 1280 }, height: { ideal: 720 } } 
        });
        if (videoRef.current) {
            videoRef.current.srcObject = camStream;
            videoRef.current.onloadedmetadata = () => {
              videoRef.current?.play();
              startVisualStream(videoRef.current!);
            };
        }
        setIsCameraOn(true);
        setIsScreenShareOn(false);
    } catch (e: any) {
        if (e.name === 'NotAllowedError') {
            console.log("Camera access declined.");
        } else {
            console.error("Camera error", e);
            alert("Camera access hoyni, Bondhu.");
        }
    }
  };

  const toggleScreenShare = async () => {
    if (!isLiveActive) return;
    if (isScreenShareOn) {
        setIsScreenShareOn(false);
        if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
        if (videoRef.current) videoRef.current.srcObject = null;
        return;
    }

    try {
        // Fix: Cast constraints to any to avoid TS error on 'cursor' property which is supported but sometimes missing from types
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ 
          video: { cursor: "always" } as any,
          audio: false 
        });
        screenStreamRef.current = screenStream;
        if (videoRef.current) {
            videoRef.current.srcObject = screenStream;
            videoRef.current.onloadedmetadata = () => {
              videoRef.current?.play();
              startVisualStream(videoRef.current!);
            };
        }
        setIsScreenShareOn(true);
        setIsCameraOn(false);
        
        screenStream.getVideoTracks()[0].onended = () => {
            setIsScreenShareOn(false);
            if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
        };
    } catch (e: any) {
        if (e.name === 'NotAllowedError') {
            console.log("Screen sharing cancelled.");
        } else {
            console.error("Screen share error", e);
            alert("Screen share somossa hoyeche, Bondhu.");
        }
    }
  };

  // --- GENERATORS ---
  const handleGenerateImage = async () => {
    if (!studioPrompt.trim()) return;
    setIsGenerating(true);
    setGeneratedImage(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: studioPrompt,
      });
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          setGeneratedImage(`data:image/png;base64,${part.inlineData.data}`);
          break;
        }
      }
    } catch (err: any) {
      if (err.message?.includes("Requested entity was not found")) await handleEntityNotFound();
      else alert("Image generation failed.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateAudio = async () => {
    if (!studioPrompt.trim()) return;
    setIsGenerating(true);
    setGeneratedAudioUrl(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: studioPrompt }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
        },
      });
      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
        const buffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start();
        setGeneratedAudioUrl("data:audio/wav;base64," + base64Audio);
      }
    } catch (err: any) {
      if (err.message?.includes("Requested entity was not found")) await handleEntityNotFound();
      else alert("Audio generation failed.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateVideo = async () => {
    if (!studioPrompt.trim()) return;
    const hasKey = await (window as any).aistudio.hasSelectedApiKey();
    if (!hasKey) await (window as any).aistudio.openSelectKey();

    setIsGenerating(true);
    setGeneratedVideoUrl(null);
    setGenerationProgress('Starting cinematic engine...');

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: studioPrompt,
        config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '16:9' }
      });
      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 10000));
        operation = await ai.operations.getVideosOperation({ operation: operation });
      }
      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (downloadLink) {
        const videoResponse = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
        const videoBlob = await videoResponse.blob();
        setGeneratedVideoUrl(URL.createObjectURL(videoBlob));
      }
    } catch (err: any) {
      if (err.message?.includes("Requested entity was not found")) await handleEntityNotFound();
      else alert("Video generation failed.");
    } finally {
      setIsGenerating(false);
      setGenerationProgress('');
    }
  };

  // --- CHAT & LIVE ---
  const handleSendMessage = async (text: string) => {
    const userMsg: Message = { role: 'user', text, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: text,
        config: { systemInstruction: SYSTEM_PROMPT }
      });
      setMessages(prev => [...prev, { role: 'model', text: response.text || 'Error', timestamp: new Date() }]);
    } catch (err: any) {
      if (err.message?.includes("Requested entity was not found")) await handleEntityNotFound();
    } finally {
      setIsLoading(false);
    }
  };

  const startLiveSession = async () => {
    initAudioContexts();
    setIsLiveActive(true);
    setIsMuted(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            const source = audioContextRef.current!.createMediaStreamSource(stream);
            const scriptProcessor = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const int16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) int16[i] = inputData[i] * 32768;
              const pcmBlob = { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
              sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(audioContextRef.current!.destination);
          },
          onmessage: async (m) => {
            if (m.serverContent?.outputTranscription) setTranscriptions(prev => [...prev, { role: 'model', text: m.serverContent!.outputTranscription!.text }]);
            const audio = m.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audio) {
              setIsAiSpeaking(true);
              const ctx = outputAudioContextRef.current!;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const buffer = await decodeAudioData(decode(audio), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = buffer;
              source.connect(ctx.destination);
              source.onended = () => { if (sourcesRef.current.size === 0) setIsAiSpeaking(false); };
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(source);
            }
          },
          onclose: () => {
            setIsLiveActive(false);
            stopLiveSession();
          },
          onerror: async (e: any) => { if (e.message?.includes("Requested entity was not found")) await handleEntityNotFound(); }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          systemInstruction: SYSTEM_PROMPT,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        }
      });
      sessionPromiseRef.current = sessionPromise;
    } catch (err: any) { 
      setIsLiveActive(false); 
      if (err.message?.includes("Requested entity was not found")) await handleEntityNotFound();
    }
  };

  const stopLiveSession = () => {
    setIsLiveActive(false);
    streamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
    sessionPromiseRef.current?.then(s => s.close());
    setIsAiSpeaking(false);
    setIsCameraOn(false);
    setIsScreenShareOn(false);
  };

  const toggleMute = () => {
    if (streamRef.current) {
      const tracks = streamRef.current.getAudioTracks();
      tracks.forEach(t => t.enabled = isMuted);
      setIsMuted(!isMuted);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30">
      <header className="p-4 md:p-6 flex flex-col md:flex-row items-center justify-between border-b border-white/10 glass sticky top-0 z-50">
        <div className="flex items-center space-x-3 mb-4 md:mb-0 cursor-pointer" onClick={() => setMode(AppMode.CHAT)}>
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <i className="fas fa-brain text-xl"></i>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Rayhan Studio <span className="text-indigo-500">AI</span></h1>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Bondhu + Brain</p>
          </div>
        </div>

        <nav className="flex items-center space-x-2 bg-white/5 p-1 rounded-2xl border border-white/10 overflow-x-auto max-w-full">
          <button onClick={() => setMode(AppMode.CHAT)} className={`px-4 py-2 rounded-xl text-xs font-medium transition-all flex items-center ${mode === AppMode.CHAT ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>
            <i className="fas fa-comment-dots mr-2"></i> Chat
          </button>
          <button onClick={() => setMode(AppMode.LIVE)} className={`px-4 py-2 rounded-xl text-xs font-medium transition-all flex items-center ${mode === AppMode.LIVE ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>
            <i className="fas fa-video mr-2"></i> Live
          </button>
          <div className="w-px h-4 bg-white/10 mx-1" />
          <button onClick={() => setMode(AppMode.IMAGE)} className={`px-4 py-2 rounded-xl text-xs font-medium transition-all flex items-center ${mode === AppMode.IMAGE ? 'bg-rose-600 text-white' : 'text-slate-400'}`}>
            <i className="fas fa-image mr-2"></i> Image
          </button>
          <button onClick={() => setMode(AppMode.AUDIO)} className={`px-4 py-2 rounded-xl text-xs font-medium transition-all flex items-center ${mode === AppMode.AUDIO ? 'bg-amber-600 text-white' : 'text-slate-400'}`}>
            <i className="fas fa-waveform mr-2"></i> Audio
          </button>
          <button onClick={() => setMode(AppMode.VIDEO)} className={`px-4 py-2 rounded-xl text-xs font-medium transition-all flex items-center ${mode === AppMode.VIDEO ? 'bg-emerald-600 text-white' : 'text-slate-400'}`}>
            <i className="fas fa-film mr-2"></i> Video
          </button>
        </nav>
      </header>

      <main className="flex-1 flex flex-col p-4 md:p-8 overflow-hidden relative">
        {mode === AppMode.CHAT && (
          <div className="flex-1 max-w-5xl mx-auto w-full flex flex-col gap-6">
            <ChatInterface messages={messages} onSendMessage={handleSendMessage} isLoading={isLoading} />
          </div>
        )}

        {mode === AppMode.LIVE && (
          <div className="flex-1 flex flex-col items-center justify-center space-y-8 py-12">
            <div className="relative flex flex-col items-center">
                <Avatar isSpeaking={isAiSpeaking} volume={isAiSpeaking ? 0.5 : 0} />
                
                {(isCameraOn || isScreenShareOn) && (
                  <div className="absolute -bottom-24 glass p-2 rounded-2xl w-56 h-40 overflow-hidden shadow-2xl border border-white/20 animate-float z-20">
                    <video ref={videoRef} className="w-full h-full object-cover rounded-xl" muted playsInline autoPlay />
                    <canvas ref={canvasRef} className="hidden" />
                    <div className="absolute top-2 left-2 bg-indigo-600/80 px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider text-white shadow-sm">
                      {isScreenShareOn ? 'Screen Feed' : 'Camera Feed'}
                    </div>
                  </div>
                )}
            </div>

            <div className="flex items-center space-x-4 pt-12">
              <button onClick={isLiveActive ? stopLiveSession : startLiveSession} className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${isLiveActive ? 'bg-rose-600 animate-pulse' : 'bg-indigo-600 shadow-xl'}`}>
                <i className={`fas ${isLiveActive ? 'fa-phone-slash' : 'fa-phone'} text-2xl`}></i>
              </button>
              
              {isLiveActive && (
                <div className="flex items-center space-x-3 bg-white/5 p-2 rounded-3xl border border-white/10 shadow-2xl">
                  <button onClick={toggleMute} title="Toggle Mute" className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isMuted ? 'bg-rose-500' : 'bg-indigo-500'}`}>
                    <i className={`fas ${isMuted ? 'fa-microphone-slash' : 'fa-microphone'}`}></i>
                  </button>
                  <button onClick={toggleCamera} title="Toggle Camera" className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isCameraOn ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-white'}`}>
                    <i className={`fas ${isCameraOn ? 'fa-camera' : 'fa-camera-slash'}`}></i>
                  </button>
                  <button onClick={toggleScreenShare} title="Share Screen" className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isScreenShareOn ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-white'}`}>
                    <i className="fas fa-desktop"></i>
                  </button>
                </div>
              )}
            </div>

            {isLiveActive && (
               <div className="flex flex-col items-center gap-2">
                 <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-indigo-500/20 text-indigo-400 text-xs font-bold tracking-wider uppercase border border-indigo-500/30">
                   {isAiSpeaking ? 'Bondhu is thinking...' : 'Listening to Rayhan...'}
                 </div>
                 {transcriptions.length > 0 && (
                   <p className="text-xs text-slate-500 italic max-w-sm text-center line-clamp-2 px-6">
                     "{transcriptions[transcriptions.length - 1].text}"
                   </p>
                 )}
               </div>
            )}
          </div>
        )}

        {(mode === AppMode.IMAGE || mode === AppMode.AUDIO || mode === AppMode.VIDEO) && (
          <div className="flex-1 max-w-4xl mx-auto w-full flex flex-col gap-6 items-center">
            <div className="w-full glass p-8 rounded-[32px] flex flex-col gap-6 border-indigo-500/20 shadow-2xl">
              <div className="flex items-center space-x-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${mode === AppMode.IMAGE ? 'bg-rose-500' : mode === AppMode.AUDIO ? 'bg-amber-500' : 'bg-emerald-500'}`}>
                   <i className={`fas ${mode === AppMode.IMAGE ? 'fa-image' : mode === AppMode.AUDIO ? 'fa-microphone-alt' : 'fa-video'} text-xl`}></i>
                </div>
                <div>
                  <h2 className="text-xl font-bold">{mode === AppMode.IMAGE ? 'Image Studio' : mode === AppMode.AUDIO ? 'Audio Studio' : 'Cinema Studio'}</h2>
                  <p className="text-sm text-slate-400">Rayhan, what should we create today?</p>
                </div>
              </div>

              <div className="relative group">
                <textarea 
                  value={studioPrompt}
                  onChange={(e) => setStudioPrompt(e.target.value)}
                  placeholder={mode === AppMode.IMAGE ? "Describe an image..." : mode === AppMode.AUDIO ? "Enter text for TTS..." : "Describe a video scene..."}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all min-h-[120px] resize-none text-lg"
                />
              </div>

              <button 
                onClick={mode === AppMode.IMAGE ? handleGenerateImage : mode === AppMode.AUDIO ? handleGenerateAudio : handleGenerateVideo}
                disabled={isGenerating || !studioPrompt.trim()}
                className={`w-full py-4 rounded-2xl font-bold uppercase tracking-widest transition-all shadow-lg disabled:opacity-50 ${mode === AppMode.IMAGE ? 'bg-rose-600 shadow-rose-500/20' : mode === AppMode.AUDIO ? 'bg-amber-600 shadow-amber-500/20' : 'bg-emerald-600 shadow-emerald-500/20'}`}
              >
                {isGenerating ? (
                   <span className="flex items-center justify-center">
                     <i className="fas fa-spinner fa-spin mr-3"></i> {generationProgress || 'Generating...'}
                   </span>
                ) : 'Start Creating'}
              </button>
            </div>

            <div className="w-full flex-1 flex flex-col items-center justify-center mt-8">
              {isGenerating && (
                 <div className="text-center animate-pulse">
                    <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-slate-400 text-sm font-medium tracking-wide">Amra creation ti toiri korchi, Rayhan...</p>
                 </div>
              )}

              {generatedImage && mode === AppMode.IMAGE && (
                <div className="glass p-2 rounded-[40px] shadow-2xl animate-float max-w-lg w-full">
                  <img src={generatedImage} alt="Generated" className="w-full rounded-[32px] object-cover shadow-inner" />
                  <a href={generatedImage} download="rayhan-ai-image.png" className="mt-4 block text-center text-xs font-bold text-indigo-400 hover:text-indigo-300 uppercase tracking-widest">Download Asset</a>
                </div>
              )}

              {generatedVideoUrl && mode === AppMode.VIDEO && (
                <div className="glass p-2 rounded-[32px] shadow-2xl w-full aspect-video border-emerald-500/20 overflow-hidden">
                   <video controls src={generatedVideoUrl} className="w-full h-full rounded-[24px] object-cover" />
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="p-4 text-center border-t border-white/10 glass mt-auto">
        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em]">
          Rayhan Studio AI • Developed for Rayhan's Digital Ecosystem
        </p>
      </footer>
    </div>
  );
};

export default App;
