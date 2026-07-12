import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { 
  Send, User, Trash2, MessageSquare, Sparkles, AlertTriangle, 
  Sun, Moon, Heart, Pill, Users, TrendingUp, Flame, Settings, Mic, MicOff, Camera
} from "lucide-react";
import { Header } from "@/components/Header";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FeatureGate } from "@/components/FeatureGate";
import { useStreaks } from "@/hooks/useStreaks";
import { useHeartScore } from "@/hooks/useHeartScore";
import { haptic } from "@/lib/haptics";
import { UnifiedCheckin } from "@/components/UnifiedCheckin";
import { HealthSummarySheet } from "@/components/HealthSummarySheet";
import { MedicationsSheet } from "@/components/MedicationsSheet";
import { FamilySheet } from "@/components/FamilySheet";
import { InsightsSheet } from "@/components/InsightsSheet";
import { DeviceConnectionSheet } from "@/components/DeviceConnectionSheet";
import { ProfileSheet } from "@/components/ProfileSheet";
import { Progress } from "@/components/ui/progress";
import { useVoiceConversation } from "@/hooks/useVoiceConversation";
import { VoiceStateIndicator, VoiceStateBadge } from "@/components/VoiceStateIndicator";
import { SpeakButton } from "@/components/VoiceOutput";
import { ChatImageCapture } from "@/components/ChatImageCapture";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const AICoach = () => {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { mainStreakCount } = useStreaks();
  const { todayScore } = useHeartScore();
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastSpokenIndexRef = useRef<number>(-1);

  // Sheet states
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [healthSheetOpen, setHealthSheetOpen] = useState(false);
  const [medsSheetOpen, setMedsSheetOpen] = useState(false);
  const [familySheetOpen, setFamilySheetOpen] = useState(false);
  const [insightsSheetOpen, setInsightsSheetOpen] = useState(false);
  const [devicesSheetOpen, setDevicesSheetOpen] = useState(false);
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);

  // Voice conversation hook
  const {
    voiceMode,
    voiceState,
    isSupported: voiceSupported,
    toggleVoiceMode,
    speak,
    interrupt,
    setVoiceState,
  } = useVoiceConversation({
    language: language as "en" | "hi",
    onTranscript: (text) => {
      setInput(text);
      // Auto-send after voice input
      setTimeout(() => {
        handleSendWithVoice(text);
      }, 100);
    },
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Fetch user profile
  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
      return data;
    },
    enabled: !!user?.id,
  });

  // Check if ritual is pending
  const { data: ritualStatus } = useQuery({
    queryKey: ["ritual-status", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const today = new Date().toISOString().split("T")[0];
      const hour = new Date().getHours();
      const ritualType = hour < 14 ? "morning" : "evening";
      
      const { data: behavior } = await supabase
        .from("behavior_logs")
        .select("id")
        .eq("user_id", user.id)
        .eq("log_date", today)
        .eq("ritual_type", ritualType)
        .maybeSingle();
      
      return { 
        ritualType, 
        completed: !!behavior,
        isMorning: hour < 14,
      };
    },
    enabled: !!user?.id,
  });

  // Fetch existing conversations
  const { data: conversations } = useQuery({
    queryKey: ["chat-conversations", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("chat_conversations")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Load messages for a conversation
  const loadConversation = async (convId: string) => {
    const { data, error } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true });

    if (error) {
      toast.error(language === 'hi' ? 'बातचीत लोड करने में त्रुटि' : 'Failed to load conversation');
      return;
    }

    setConversationId(convId);
    setMessages(data.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })));
    lastSpokenIndexRef.current = data.length - 1;
  };

  // Create new conversation
  const createConversation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("chat_conversations")
        .insert({
          user_id: user.id,
          language,
          title: language === 'hi' ? 'नई बातचीत' : 'New Conversation',
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setConversationId(data.id);
      setMessages([]);
      lastSpokenIndexRef.current = -1;
      queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
    },
  });

  // Delete conversation
  const deleteConversation = useMutation({
    mutationFn: async (convId: string) => {
      await supabase.from("chat_messages").delete().eq("conversation_id", convId);
      await supabase.from("chat_conversations").delete().eq("id", convId);
    },
    onSuccess: () => {
      if (conversationId) {
        setConversationId(null);
        setMessages([]);
        lastSpokenIndexRef.current = -1;
      }
      queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
      toast.success(language === "hi" ? "बातचीत हटा दी गई" : "Conversation deleted");
    },
  });

  const handleSendWithVoice = async (textToSend?: string) => {
    const messageText = textToSend || input;
    if (!messageText.trim() || isLoading) return;

    let currentConvId = conversationId;
    if (!currentConvId && user?.id) {
      const { data: newConv } = await supabase
        .from("chat_conversations")
        .insert({
          user_id: user.id,
          language,
          title: messageText.substring(0, 50),
        })
        .select()
        .single();
      if (newConv) {
        currentConvId = newConv.id;
        setConversationId(newConv.id);
        queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
      }
    }

    const userMessage: Message = { role: "user", content: messageText };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    if (currentConvId) {
      await supabase.from("chat_messages").insert({
        conversation_id: currentConvId,
        role: "user",
        content: messageText,
      });
    }

    try {
      const { data, error } = await supabase.functions.invoke("chat-copilot", {
        body: {
          messages: [...messages, userMessage],
          language,
        },
      });

      if (error) {
        if (error.message?.includes("429")) {
          toast.error(language === 'hi' ? 'सीमा पार। कृपया बाद में प्रयास करें।' : "Rate limit exceeded. Please try again later.");
        } else if (error.message?.includes("402")) {
          toast.error(language === 'hi' ? 'भुगतान आवश्यक। कृपया क्रेडिट जोड़ें।' : "Payment required. Please add credits to continue.");
        } else {
          throw error;
        }
        setVoiceState("idle");
        return;
      }

      const reader = data.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") continue;

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  assistantContent += content;
                  setMessages((prev) => {
                    const newMessages = [...prev];
                    const lastMessage = newMessages[newMessages.length - 1];
                    if (lastMessage?.role === "assistant") {
                      lastMessage.content = assistantContent;
                    } else {
                      newMessages.push({ role: "assistant", content: assistantContent });
                    }
                    return newMessages;
                  });
                }
              } catch (e) {
                // Ignore parsing errors
              }
            }
          }
        }

        if (currentConvId && assistantContent) {
          await supabase.from("chat_messages").insert({
            conversation_id: currentConvId,
            role: "assistant",
            content: assistantContent,
          });
        }

        // Auto-speak the response if in voice mode
        if (voiceMode && assistantContent) {
          setIsLoading(false);
          await speak(assistantContent);
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      toast.error(language === 'hi' ? 'संदेश भेजने में त्रुटि' : "Failed to send message. Please try again.");
      setVoiceState("idle");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = () => handleSendWithVoice();

  const suggestedQuestions = language === 'hi' 
    ? [
        "मेरा BP 140/90 है, क्या यह ठीक है?",
        "शुगर कम करने के लिए क्या करूं?",
        "अच्छी नींद के लिए सुझाव दें",
      ]
    : [
        "Is my 140/90 BP okay?",
        "How to lower blood sugar?",
        "Tips for better sleep",
      ];

  const quickActions = [
    { 
      icon: ritualStatus?.isMorning ? Sun : Moon, 
      label: ritualStatus?.isMorning ? "Morning" : "Evening",
      sublabel: ritualStatus?.completed ? "Done ✓" : "Check-in",
      color: "text-orange-500",
      bg: "bg-orange-500/10",
      action: () => { haptic('light'); setCheckinOpen(true); },
      highlight: !ritualStatus?.completed,
    },
    { 
      icon: Heart, 
      label: "HeartScore",
      sublabel: todayScore && typeof todayScore === 'object' ? `${todayScore.heart_score}` : "--",
      color: "text-red-500",
      bg: "bg-red-500/10",
      action: () => { haptic('light'); setHealthSheetOpen(true); },
    },
    { 
      icon: Pill, 
      label: "Meds",
      color: "text-green-500",
      bg: "bg-green-500/10",
      action: () => { haptic('light'); setMedsSheetOpen(true); },
    },
    { 
      icon: Users, 
      label: "Family",
      color: "text-violet-500",
      bg: "bg-violet-500/10",
      action: () => { haptic('light'); setFamilySheetOpen(true); },
    },
    { 
      icon: TrendingUp, 
      label: "Trends",
      color: "text-blue-500",
      bg: "bg-blue-500/10",
      action: () => { haptic('light'); setInsightsSheetOpen(true); },
    },
  ];

  const hour = new Date().getHours();
  const greeting = hour < 12 
    ? (language === 'hi' ? 'सुप्रभात' : 'Good morning')
    : hour < 17 
    ? (language === 'hi' ? 'नमस्ते' : 'Good afternoon')
    : (language === 'hi' ? 'शुभ संध्या' : 'Good evening');

  return (
    <div className="min-h-screen bg-background flex flex-col pb-24 md:pb-0">
      <Header />

      {/* All Sheets */}
      <UnifiedCheckin isOpen={checkinOpen} onClose={() => setCheckinOpen(false)} />
      <HealthSummarySheet isOpen={healthSheetOpen} onClose={() => setHealthSheetOpen(false)} />
      <MedicationsSheet isOpen={medsSheetOpen} onClose={() => setMedsSheetOpen(false)} />
      <FamilySheet isOpen={familySheetOpen} onClose={() => setFamilySheetOpen(false)} />
      <InsightsSheet isOpen={insightsSheetOpen} onClose={() => setInsightsSheetOpen(false)} />
      <DeviceConnectionSheet isOpen={devicesSheetOpen} onClose={() => setDevicesSheetOpen(false)} />
      <ProfileSheet isOpen={profileSheetOpen} onClose={() => setProfileSheetOpen(false)} />

      <main className="flex-1 container mx-auto px-4 py-4 max-w-2xl flex flex-col">
        {/* Compact Header with Greeting & Stats */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg">
              <Logo size="sm" showText={false} />
            </div>
            <div>
              <h1 className="text-lg font-bold">
                {greeting}{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ''}
              </h1>
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <span className="flex items-center gap-1">
                  <Flame className="w-3 h-3 text-orange-500" />
                  {mainStreakCount} days
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Heart className="w-3 h-3 text-red-500" />
                  {todayScore && typeof todayScore === 'object' ? todayScore.heart_score : '--'}
                </span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Voice Mode Toggle */}
            {voiceSupported && (
              <Button 
                variant={voiceMode ? "default" : "ghost"}
                size="icon" 
                className={cn(
                  "rounded-full transition-all",
                  voiceMode && "bg-primary shadow-lg shadow-primary/30"
                )}
                onClick={toggleVoiceMode}
              >
                {voiceMode ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
              </Button>
            )}
            <Button 
              variant="ghost" 
              size="icon" 
              className="rounded-full"
              onClick={() => { haptic('light'); setProfileSheetOpen(true); }}
            >
              <Settings className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Voice State Indicator (when in voice mode) */}
        {voiceMode && voiceState !== "idle" && (
          <div className="mb-4 flex justify-center">
            <div 
              className="flex flex-col items-center gap-2 cursor-pointer"
              onClick={voiceState === "speaking" ? interrupt : undefined}
            >
              <VoiceStateIndicator state={voiceState} size="lg" />
              <span className="text-xs text-muted-foreground">
                {voiceState === "listening" && (language === "hi" ? "बोलें..." : "Speak now...")}
                {voiceState === "processing" && (language === "hi" ? "सोच रहा हूं..." : "Thinking...")}
                {voiceState === "speaking" && (language === "hi" ? "टैप करें रोकने के लिए" : "Tap to interrupt")}
              </span>
            </div>
          </div>
        )}

        {/* Check-in Prompt (if not done) */}
        {!ritualStatus?.completed && (
          <button
            onClick={() => { haptic('medium'); setCheckinOpen(true); }}
            className="mb-4 w-full p-4 rounded-2xl bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 flex items-center gap-4 active:scale-[0.98] transition-transform"
          >
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
              {ritualStatus?.isMorning ? <Sun className="w-6 h-6 text-primary" /> : <Moon className="w-6 h-6 text-primary" />}
            </div>
            <div className="flex-1 text-left">
              <p className="font-semibold">
                {ritualStatus?.isMorning 
                  ? (language === 'hi' ? 'सुबह की जांच' : 'Morning Check-in')
                  : (language === 'hi' ? 'शाम की जांच' : 'Evening Check-in')}
              </p>
              <p className="text-sm text-muted-foreground">
                {language === 'hi' ? 'अपनी दैनिक जांच शुरू करें' : 'Start your daily ritual'}
              </p>
            </div>
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary-foreground" />
            </div>
          </button>
        )}

        {/* Quick Actions */}
        <div className="mb-4 flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          {quickActions.map((action, i) => (
            <button
              key={i}
              onClick={action.action}
              className={`shrink-0 flex flex-col items-center p-3 rounded-2xl border transition-all active:scale-95 ${
                action.highlight 
                  ? 'border-primary/50 bg-primary/10' 
                  : 'border-border/50 bg-card hover:bg-muted/50'
              }`}
              style={{ minWidth: '72px' }}
            >
              <div className={`w-10 h-10 rounded-xl ${action.bg} flex items-center justify-center mb-1`}>
                <action.icon className={`w-5 h-5 ${action.color}`} />
              </div>
              <span className="text-xs font-medium">{action.label}</span>
              {action.sublabel && (
                <span className="text-[10px] text-muted-foreground">{action.sublabel}</span>
              )}
            </button>
          ))}
        </div>

        {/* Medical Disclaimer */}
        <div className="flex items-start gap-2 p-3 mb-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-muted-foreground">
            {language === 'hi' 
              ? 'यह AI सलाह है, चिकित्सा निदान नहीं।'
              : 'AI guidance only, not medical diagnosis.'}
          </p>
        </div>

        {/* Conversation History */}
        {conversations && conversations.length > 0 && (
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 rounded-full gap-1"
              onClick={() => createConversation.mutate()}
              disabled={createConversation.isPending}
            >
              <MessageSquare className="w-3 h-3" />
              New
            </Button>
            {conversations.map((conv) => (
              <Button
                key={conv.id}
                variant={conversationId === conv.id ? "default" : "outline"}
                size="sm"
                className="shrink-0 gap-1 rounded-full text-xs"
                onClick={() => loadConversation(conv.id)}
              >
                {conv.title?.substring(0, 15) || "Chat"}
                {conversationId === conv.id && (
                  <Trash2
                    className="w-3 h-3 opacity-50 hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConversation.mutate(conv.id);
                    }}
                  />
                )}
              </Button>
            ))}
          </div>
        )}

        {/* Messages */}
        <FeatureGate feature="ai_coach">
          <Card className="flex-1 p-4 mb-3 overflow-y-auto border-border/50 min-h-[300px] max-h-[50vh]">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mb-3">
                  <Logo size="lg" showText={false} className="opacity-50" />
                </div>
                <p className="font-semibold mb-1">
                  {language === "hi" ? "नमस्ते! मैं Beat हूं 👋" : "Hello! I'm Beat 👋"}
                </p>
                <p className="text-xs text-muted-foreground max-w-xs mb-4">
                  {voiceMode 
                    ? (language === "hi" ? "बोलकर मुझसे बात करें।" : "Speak to chat with me.")
                    : (language === "hi" ? "अपने स्वास्थ्य के बारे में कुछ भी पूछें।" : "Ask me anything about your health.")}
                </p>
                
                {/* Suggested Questions (hide in active voice mode) */}
                {!voiceMode && (
                  <div className="flex flex-wrap gap-2 justify-center">
                    {suggestedQuestions.map((q, i) => (
                      <button
                        key={i}
                        onClick={() => setInput(q)}
                        className="px-3 py-1.5 text-xs bg-muted hover:bg-muted/80 rounded-full transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}

                {/* Voice mode hint */}
                {voiceMode && voiceState === "idle" && (
                  <p className="text-xs text-primary animate-pulse">
                    {language === "hi" ? "माइक बटन दबाकर बोलें" : "Tap mic or just speak..."}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((msg, idx) => (
                  <div key={idx} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    {msg.role === "assistant" && (
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0">
                        <Logo size="sm" showText={false} />
                      </div>
                    )}
                    <div
                      className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                        msg.role === "user" 
                          ? "bg-primary text-primary-foreground" 
                          : "bg-muted"
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                      {/* Speak button for assistant messages */}
                      {msg.role === "assistant" && (
                        <div className="flex justify-end mt-1">
                          <SpeakButton 
                            text={msg.content} 
                            language={language as "en" | "hi"} 
                            size="sm"
                            className="opacity-50 hover:opacity-100"
                          />
                        </div>
                      )}
                    </div>
                    {msg.role === "user" && (
                      <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center shrink-0">
                        <User className="w-3.5 h-3.5 text-secondary-foreground" />
                      </div>
                    )}
                  </div>
                ))}
                {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
                  <div className="flex gap-2">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0">
                      <Logo size="sm" showText={false} />
                    </div>
                    <div className="bg-muted rounded-2xl px-3 py-2">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </Card>
        </FeatureGate>

        {/* Input Area */}
        <div className="flex gap-2 items-center">
          {/* Camera OCR for device readings */}
          <ChatImageCapture
            onReadingDetected={(reading, summary) => {
              // Auto-send the detected reading to chat
              if (summary) {
                setInput(summary);
                setTimeout(() => handleSendWithVoice(summary), 100);
              }
            }}
            disabled={isLoading}
          />
          
          {/* Voice state badge when active */}
          {voiceMode && voiceState !== "idle" && (
            <VoiceStateBadge 
              state={voiceState} 
              language={language as "en" | "hi"}
              onTap={voiceState === "speaking" ? interrupt : undefined}
            />
          )}
          
          {/* Text input (shrinks when voice state is showing) */}
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSend()}
            placeholder={
              voiceMode 
                ? (language === "hi" ? "या टाइप करें..." : "Or type here...")
                : (language === "hi" ? "अपना सवाल पूछें..." : "Ask your question...")
            }
            disabled={isLoading || voiceState === "listening"}
            className={cn(
              "h-12 text-base flex-1 rounded-xl transition-all",
              voiceMode && voiceState !== "idle" && "w-24"
            )}
          />
          
          {/* Voice toggle / Send button */}
          {voiceMode ? (
            <Button 
              onClick={toggleVoiceMode}
              variant={voiceState === "listening" ? "default" : "outline"}
              size="icon" 
              className={cn(
                "h-12 w-12 rounded-xl transition-all",
                voiceState === "listening" && "bg-primary animate-pulse"
              )}
            >
              <Mic className="h-5 w-5" />
            </Button>
          ) : (
            <>
              {voiceSupported && (
                <Button 
                  onClick={toggleVoiceMode}
                  variant="outline"
                  size="icon" 
                  className="h-12 w-12 rounded-xl"
                  title={language === "hi" ? "आवाज़ मोड चालू करें" : "Start voice mode"}
                >
                  <Mic className="h-5 w-5" />
                </Button>
              )}
              <Button 
                onClick={handleSend} 
                disabled={!input.trim() || isLoading} 
                size="icon" 
                className="h-12 w-12 rounded-xl"
              >
                <Send className="h-5 w-5" />
              </Button>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default AICoach;
