"use client";
import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Loader2, Copy, Check, Mic, Volume2, VolumeX } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "bot";
  content: string;
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "bot",
      content: "Hello! I am the NER Landslide AI Assistant. I can help you understand risk probabilities, weather forecasts, and terrain susceptibility for the North East Region. How can I assist you today?"
    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isPlayingId, setIsPlayingId] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-focus input after loading finishes
  useEffect(() => {
    if (!isLoading && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isLoading]);

  // Stop audio when component unmounts
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error("Failed to copy text", err);
    }
  };

  const playAudio = (text: string, id: string) => {
    if (isPlayingId === id) {
      window.speechSynthesis.cancel();
      setIsPlayingId(null);
      return;
    }

    window.speechSynthesis.cancel();
    setIsPlayingId(id);

    // Phonetic corrections for North East Indian places
    const phoneticMap: Record<string, string> = {
      "Cherrapunji": "Cherra-poon-jee",
      "Guwahati": "Goo-wa-haa-tee",
      "Meghalaya": "May-ghaa-laya",
      "Arunachal Pradesh": "Arun-aa-chal Pra-desh",
      "Mizoram": "Mizo-ram",
      "Nagaland": "Naaga-land",
      "Brahmaputra": "Brahma-put-ra",
      "Sikkim": "Sik-kim",
      "Mangan": "Mung-gun",
      "Namchi": "Naam-chee"
    };

    let cleanText = text.replace(/[*#_]/g, '');
    
    // Apply phonetic corrections
    Object.keys(phoneticMap).forEach(key => {
      const regex = new RegExp(key, "gi");
      cleanText = cleanText.replace(regex, phoneticMap[key]);
    });

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'en-IN';
    utterance.rate = 1.0; 
    utterance.pitch = 1.05;

    // Try to find a premium/natural Indian voice, fallback to UK female, then anything
    const voices = window.speechSynthesis.getVoices();
    const bestVoice = voices.find(v => v.name.includes("Neerja") && v.name.includes("Natural")) || 
                      voices.find(v => v.name.includes("Google") && v.lang === "en-IN") ||
                      voices.find(v => v.lang === "en-IN" && v.name.includes("Female")) ||
                      voices.find(v => v.lang === "en-GB" && v.name.includes("Female")) ||
                      voices[0];
                      
    if (bestVoice) {
      utterance.voice = bestVoice;
    }
    
    utterance.onend = () => setIsPlayingId(null);
    utterance.onerror = () => setIsPlayingId(null);
    
    window.speechSynthesis.speak(utterance);
  };

  const startListening = () => {
    // @ts-ignore
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Your browser does not support voice input. Try Chrome or Edge.");
      return;
    }
    
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN'; // Optimized for Indian English
    recognition.interimResults = false;
    
    recognition.onstart = () => {
      window.speechSynthesis.cancel(); // Stop AI talking if user starts speaking
      setIsPlayingId(null);
      setIsListening(true);
    };
    
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(prev => prev ? `${prev} ${transcript}` : transcript);
    };
    
    recognition.onerror = (event: any) => {
      console.error("Speech error:", event.error);
      setIsListening(false);
    };
    
    recognition.onend = () => setIsListening(false);
    
    recognition.start();
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    window.speechSynthesis.cancel(); // Stop current speech on new message
    setIsPlayingId(null);

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "";
      const url = apiBase ? `${apiBase}/chat` : "/api/chat";
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage.content })
      });
      
      const data = await response.json();
      const botId = (Date.now() + 1).toString();
      
      const botMessage: Message = {
        id: botId,
        role: "bot",
        content: data.reply || "I'm having trouble connecting right now."
      };
      
      setMessages(prev => [...prev, botMessage]);
      
      // Auto-play the response
      if (data.reply) {
        playAudio(data.reply, botId);
      }
      
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "bot",
        content: "Error: Could not reach the AI Server. Please ensure the backend is running."
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
      <div className="bg-slate-800/80 p-4 border-b border-slate-700/50">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Bot className="text-blue-400" />
          GenAI Disaster Assistant
        </h2>
        <p className="text-sm text-slate-400 mt-1">Ask questions about risks, weather, and safety protocols in natural language.</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-4 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "bot" && (
              <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center border border-blue-500/50 flex-shrink-0 mt-1">
                <Bot className="w-5 h-5 text-blue-400" />
              </div>
            )}
            
            <div className={`relative px-5 py-3 rounded-2xl max-w-[80%] group ${
              msg.role === "user" 
                ? "bg-blue-600 text-white rounded-br-sm shadow-md" 
                : "bg-slate-800/80 border border-slate-700 text-slate-200 rounded-bl-sm shadow-md"
            }`}>
              <p className="leading-relaxed whitespace-pre-wrap pr-12">{msg.content}</p>
              
              {msg.role === "bot" && (
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => playAudio(msg.content, msg.id)}
                    className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                    title={isPlayingId === msg.id ? "Stop reading" : "Read aloud"}
                  >
                    {isPlayingId === msg.id ? <VolumeX className="w-4 h-4 text-blue-400 animate-pulse" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                  <button 
                    onClick={() => handleCopy(msg.content, msg.id)}
                    className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                    title="Copy text"
                  >
                    {copiedId === msg.id ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              )}
            </div>
            
            {msg.role === "user" && (
              <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0 mt-1">
                <User className="w-5 h-5 text-slate-300" />
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-4 justify-start">
            <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center border border-blue-500/50">
              <Bot className="w-5 h-5 text-blue-400" />
            </div>
            <div className="px-5 py-4 rounded-2xl bg-slate-800/80 border border-slate-700 rounded-bl-sm">
              <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-slate-900 border-t border-slate-800">
        <form onSubmit={sendMessage} className="relative flex items-center">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your question or use voice..."
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-4 pr-24 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            disabled={isLoading || isListening}
            autoFocus
          />
          <div className="absolute right-2 flex items-center gap-1">
            <button
              type="button"
              onClick={startListening}
              disabled={isLoading || isListening}
              className={`p-2 rounded-lg transition-colors ${
                isListening 
                  ? "bg-red-500 text-white animate-pulse" 
                  : "bg-slate-700 hover:bg-slate-600 text-slate-300"
              }`}
              title="Speak"
            >
              <Mic className="w-5 h-5" />
            </button>
            <button
              type="submit"
              disabled={!input.trim() || isLoading || isListening}
              className="p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-50 disabled:hover:bg-blue-600 transition-colors"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
