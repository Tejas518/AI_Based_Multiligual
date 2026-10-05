import React, { useState, useRef, useEffect } from 'react';

const INDIAN_SPEECH_LANGUAGES = [
  { code: 'hi-IN', label: '🇮🇳 Hindi (हिंदी)' },
  { code: 'en-IN', label: '🇬🇧 English (India)' },
  { code: 'ta-IN', label: '🇮🇳 Tamil (தமிழ்)' },
  { code: 'te-IN', label: '🇮🇳 Telugu (తెలుగు)' },
  { code: 'mr-IN', label: '🇮🇳 Marathi (मराठी)' },
  { code: 'bn-IN', label: '🇮🇳 Bengali (বাংলা)' },
  { code: 'gu-IN', label: '🇮🇳 Gujarati (ગુજરાતી)' },
  { code: 'kn-IN', label: '🇮🇳 Kannada (કન્નડ)' },
  { code: 'ml-IN', label: '🇮🇳 Malayalam (മലയാളം)' },
  { code: 'pa-IN', label: '🇮🇳 Punjabi (ਪੰਜਾਬੀ)' },
  { code: 'or-IN', label: '🇮🇳 Odia (ଓଡ଼ିଆ)' },
  { code: 'ur-IN', label: '🇮🇳 Urdu (اردو)' },
  { code: 'as-IN', label: '🇮🇳 Assamese (অসমীয়া)' }
];

const ChatbotWidget = ({ user, backendUrl, token, onAutoCreateCampaign, setActiveTab, onExecuteVoiceCommand }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hello! I'm your CommAI Assistant. Ask me anything or speak to create campaigns!",
      timestamp: new Date(),
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Voice Recognition & Speech Synthesis states
  const [isListening, setIsListening] = useState(false);
  const [speechLang, setSpeechLang] = useState(() => localStorage.getItem('comm_speech_lang') || 'en-IN');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const recognitionRef = useRef(null);

  const handleSpeechLangChange = (code) => {
    setSpeechLang(code);
    localStorage.setItem('comm_speech_lang', code);
  };
  
  // Escalation state
  const [showEscalateForm, setShowEscalateForm] = useState(false);
  const [escalateSubject, setEscalateSubject] = useState('');
  const [escalateMessage, setEscalateMessage] = useState('');
  const [escalating, setEscalating] = useState(false);
  const [escalationSuccess, setEscationSuccess] = useState(false);
  const [feedbackGivenIndex, setFeedbackGivenIndex] = useState(null);

  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (user) {
      const isAudience = user.role === 'audience';
      const displayName = user.full_name || (user.role === 'admin' ? 'System Administrator' : user.role === 'manager' ? 'Campaign Manager' : 'there');
      const initialGreeting = isAudience
        ? `Hello ${displayName}! I'm your CommAI Assistant. Ask me anything about emergency warnings, campaign alerts, or tap below to file a location pin-point SOS alert!`
        : `Hello ${displayName}! Click the 🎤 Mic button or speak to me: "Create a flood alert campaign for Varanasi in Hindi" and I will auto-generate it and switch to Campaign Planner in the background!`;

      setMessages([
        {
          role: 'assistant',
          content: initialGreeting,
          timestamp: new Date(),
        }
      ]);
    }
  }, [user]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, showEscalateForm]);

  // Voice Playback (SpeechSynthesis)
  const speakText = (text) => {
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const cleanText = text.replace(/[*#_`]/g, '').replace(/\{\{[^}]+\}\}/g, 'recipient');
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = speechLang || 'hi-IN';
      utterance.rate = 1.0;
      
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.error('SpeechSynthesis error:', e);
      setIsSpeaking(false);
    }
  };

  const stopSpeaking = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  const silenceTimerRef = useRef(null);

  const stopListening = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) {}
    }
    window.__commai_copilot_mic_active = false;
    setIsListening(false);
  };

  // Speech Recognition (Microphone)
  const startListening = () => {
    stopSpeaking(); // Cancel any active TTS playback so it doesn't feed back into mic

    // Silence background Jarvis wake-word listener so Chrome frees the microphone stream
    window.dispatchEvent(new CustomEvent('commai_silence_jarvis'));
    window.__commai_copilot_mic_active = true;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser. Please use Google Chrome or Microsoft Edge.");
      window.__commai_copilot_mic_active = false;
      return;
    }

    if (isListening && recognitionRef.current) {
      stopListening();
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = speechLang;
      recognition.interimResults = true;
      recognition.continuous = true;

      let lastCaptured = '';

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }

        const trimmed = transcript.trim();
        if (trimmed) {
          lastCaptured = trimmed;
          setInputValue(trimmed);

          // Reset silence timer on every new spoken phrase fragment
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
          }

          // Automatically send after 1.6s of natural silence
          silenceTimerRef.current = setTimeout(() => {
            const finalPrompt = lastCaptured.trim();
            if (finalPrompt) {
              stopListening();
              handleProcessUserPrompt(finalPrompt);
            }
          }, 1600);
        }
      };

      recognition.onerror = (e) => {
        console.warn("Chatbot speech recognition error:", e.error);
        if (e.error !== 'no-speech') {
          stopListening();
        }
      };

      recognition.onend = () => {
        window.__commai_copilot_mic_active = false;
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error(err);
      window.__commai_copilot_mic_active = false;
      setIsListening(false);
    }
  };

  const handleProcessUserPrompt = async (userText) => {
    if (!userText || !userText.trim()) return;

    const textToSend = userText.trim();
    setInputValue('');
    setMessages(prev => [...prev, { role: 'user', content: textToSend, timestamp: new Date() }]);

    // ----------------------------------------------------------------
    // OPERATOR / ADMIN FLOW: route through the same AI intent engine
    // as Jarvis (/api/ai/voice-command) so navigation, chat, approvals
    // etc. all work — not just campaign creation.
    // ----------------------------------------------------------------
    if (user?.role === 'admin' || user?.role === 'campaign_manager') {
      setLoading(true);
      try {
        const intentRes = await fetch(`${backendUrl}/api/ai/voice-command`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            command: textToSend,
            active_context: { active_tab: 'dashboard', navigation_target: 'dashboard' }
          })
        });

        if (intentRes.ok) {
          const intentData = await intentRes.json();
          const action = intentData.action || '';

          // Pure Q&A — no navigation needed, fall through to chat
          const isQnA = action === 'answer_question' || action === 'general_chat' || action === 'faq';

          if (!isQnA) {
            // Campaign wizard actions — hand off to campaign planner
            const isCampaignAction = ['emergency_broadcast', 'create_campaign', 'send_alert'].includes(action) || intentData.open_wizard;
            if (isCampaignAction && onAutoCreateCampaign) {
              const aiReply = `🚀 Campaign generated! Taking you to Campaign Planner now...`;
              setMessages(prev => [...prev, { role: 'assistant', content: aiReply, timestamp: new Date() }]);
              speakText('Navigating to Campaign Planner.');
              setTimeout(() => { onAutoCreateCampaign(intentData); }, 600);
              setLoading(false);
              return;
            }

            // Navigation / operator actions — use the same router as Jarvis
            if (onExecuteVoiceCommand) {
              onExecuteVoiceCommand(intentData);
            }

            const reply = intentData.spoken_response
              || `📍 Done! ${intentData.title || action.replace(/_/g, ' ')}. I've navigated you there.`;
            setMessages(prev => [...prev, { role: 'assistant', content: reply, timestamp: new Date(), showFeedback: true }]);
            speakText(reply);
            setLoading(false);
            return;
          }
        }
        // isQnA or intent call failed — fall through to standard chat below
      } catch (err) {
        console.warn('[ChatbotWidget] Intent engine error, falling back to chat:', err);
        // fall through to standard chat
      } finally {
        setLoading(false);
      }
    }

    // ----------------------------------------------------------------
    // STANDARD AI CHAT FLOW (Q&A, audience users, fallback)
    // ----------------------------------------------------------------
    setLoading(true);
    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));

      const res = await fetch(`${backendUrl}/api/ai/chat`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: textToSend,
          history: history.slice(-6)
        })
      });

      if (!res.ok) throw new Error('API communication error');
      const data = await res.json();
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: data.reply, timestamp: new Date(), showFeedback: true }
      ]);
      if (isListening) speakText(data.reply);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: "Sorry, I'm having trouble connecting right now. Please try again.", timestamp: new Date() }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = (e) => {
    e.preventDefault();
    if (!inputValue.trim() || loading) return;
    handleProcessUserPrompt(inputValue);
  };

  const handleQuickAction = (actionText) => {
    handleProcessUserPrompt(actionText);
  };

  const handleFeedback = (index, satisfied) => {
    setFeedbackGivenIndex(index);
    if (!satisfied) {
      const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
      setEscalateSubject(`Confusion regarding: ${lastUserMsg?.content.slice(0, 40) || 'Platform Help'}...`);
      setEscalateMessage(`User confusion prompt: "${lastUserMsg?.content || ''}"\n\nAI reply was not satisfactory. Please help.`);
      setShowEscalateForm(true);
    } else {
      setMessages(prev => prev.map((msg, i) => i === index ? { ...msg, showFeedback: false } : msg));
      alert("Thank you for your feedback! Glad I could help.");
    }
  };

  const handleEscalationSubmit = async (e) => {
    e.preventDefault();
    if (!escalateSubject.trim() || !escalateMessage.trim()) return;

    setEscalating(true);
    try {
      const res = await fetch(`${backendUrl}/api/queries`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          subject: escalateSubject,
          message: escalateMessage
        })
      });

      if (!res.ok) throw new Error('Failed to submit support query');

      setEscationSuccess(true);
      setTimeout(() => {
        setShowEscalateForm(false);
        setEscationSuccess(false);
        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: "I have successfully submitted your query to our Campaign Managers. You can track this in your queries history or wait for a reply.",
            timestamp: new Date()
          }
        ]);
      }, 2000);
    } catch (err) {
      alert(err.message);
    } finally {
      setEscalating(false);
    }
  };

  return (
    <div className="floating-chatbot-widget" style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 1000, fontFamily: 'var(--font-body)' }}>
      {/* Floating Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--secondary)) 100%)',
          border: 'none',
          cursor: 'pointer',
          boxShadow: '0 8px 32px rgba(76, 140, 252, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          transform: isOpen ? 'rotate(180deg) scale(0.95)' : 'scale(1)'
        }}
      >
        {isOpen ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '24px', height: '24px' }}>
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '26px', height: '26px' }}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
        )}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            bottom: '70px',
            right: 0,
            width: '380px',
            maxHeight: '580px',
            height: 'calc(100vh - 120px)',
            borderRadius: '20px',
            background: 'var(--chatbot-bg)',
            backdropFilter: 'blur(20px)',
            border: '1px solid var(--chatbot-border)',
            boxShadow: 'var(--chatbot-shadow)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '16px 20px',
              background: 'linear-gradient(90deg, rgba(76, 140, 252, 0.15), rgba(168, 85, 247, 0.15))',
              borderBottom: '1px solid var(--border-color-glass)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.9rem'
                }}
              >
                🤖
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'hsl(var(--text-primary))' }}>
                  CommAI Assistant
                </h4>
                <span style={{ fontSize: '0.7rem', color: 'hsl(var(--text-muted))', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e' }}></span>
                  Online • Voice AI Enabled
                </span>
              </div>
            </div>
            
            {/* Language Selector Dropdown */}
            <select
              value={speechLang}
              onChange={(e) => handleSpeechLangChange(e.target.value)}
              title="Select Voice Language"
              style={{
                background: 'var(--chatbot-btn-bg)',
                color: 'hsl(var(--text-primary))',
                border: '1px solid var(--chatbot-border)',
                borderRadius: '8px',
                padding: '4px 8px',
                fontSize: '0.75rem',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              {INDIAN_SPEECH_LANGUAGES.map(l => (
                <option key={l.code} value={l.code} style={{ background: 'var(--input-bg)', color: 'hsl(var(--text-primary))' }}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          {/* Messages Container */}
          <div
            style={{
              flex: 1,
              padding: '16px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}
          >
            {messages.map((msg, idx) => (
              <div
                key={idx}
                style={{
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%'
                }}
              >
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: msg.role === 'user' ? '16px 16px 2px 16px' : '16px 16px 16px 2px',
                    background: msg.role === 'user'
                      ? 'linear-gradient(135deg, hsl(var(--primary)) 0%, #3b82f6 100%)'
                      : 'var(--chatbot-msg-bg)',
                    color: 'hsl(var(--text-primary))',
                    fontSize: '0.85rem',
                    lineHeight: '1.4',
                    border: msg.role === 'user' ? 'none' : '1px solid var(--chatbot-border)',
                    boxShadow: msg.role === 'user' ? '0 4px 12px rgba(59, 130, 246, 0.2)' : 'none'
                  }}
                >
                  {msg.content}
                </div>
                
                {/* Speaker TTS Icon */}
                {msg.role === 'assistant' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', paddingLeft: '4px' }}>
                    <button
                      type="button"
                      onClick={() => isSpeaking ? stopSpeaking() : speakText(msg.content)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'hsl(var(--text-muted))',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                      title="Read response aloud"
                    >
                      {isSpeaking ? '🔊 Speaking...' : '🔈 Read aloud'}
                    </button>

                    {msg.showFeedback && (
                      <span style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))' }}>
                        Helpful? 
                        <button onClick={() => handleFeedback(idx, true)} style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: '4px' }}>👍</button>
                        <button onClick={() => handleFeedback(idx, false)} style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: '2px' }}>👎</button>
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div style={{ alignSelf: 'flex-start', background: 'var(--chatbot-msg-bg)', padding: '10px 14px', borderRadius: '16px', fontSize: '0.8rem', color: 'hsl(var(--text-muted))', border: '1px solid var(--chatbot-border)' }}>
                🤖 Processing voice intent...
              </div>
            )}

            {/* Escalation Form */}
            {showEscalateForm && (
              <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '12px', borderRadius: '12px', marginTop: '8px' }}>
                <h5 style={{ margin: '0 0 8px 0', fontSize: '0.85rem', color: 'hsl(var(--danger))' }}>Escalate Query to Manager</h5>
                {escalationSuccess ? (
                  <div style={{ fontSize: '0.8rem', color: '#22c55e' }}>✓ Support query submitted!</div>
                ) : (
                  <form onSubmit={handleEscalationSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <input
                      type="text"
                      placeholder="Subject"
                      value={escalateSubject}
                      onChange={(e) => setEscalateSubject(e.target.value)}
                      required
                      style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'hsl(var(--text-primary))', fontSize: '0.8rem' }}
                    />
                    <textarea
                      placeholder="Explain what was confusing..."
                      value={escalateMessage}
                      onChange={(e) => setEscalateMessage(e.target.value)}
                      required
                      rows={2}
                      style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'hsl(var(--text-primary))', fontSize: '0.8rem', resize: 'none' }}
                    />
                    <button
                      type="submit"
                      disabled={escalating}
                      style={{ padding: '6px 12px', borderRadius: '6px', background: 'hsl(var(--danger))', color: '#fff', border: 'none', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}
                    >
                      {escalating ? 'Submitting...' : '✉ Send to Manager'}
                    </button>
                  </form>
                )}
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Actions */}
          {messages.length <= 2 && (
            <div style={{ padding: '0 16px 8px 16px', display: 'flex', gap: '6px', overflowX: 'auto' }}>
              <button
                onClick={() => {
                  if (setActiveTab) setActiveTab('sos');
                  setIsOpen(false);
                }}
                style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#ef4444', padding: '5px 10px', borderRadius: '12px', fontSize: '0.74rem', whiteSpace: 'nowrap', cursor: 'pointer', fontWeight: 700 }}
              >
                🚨 Report Emergency SOS (Pin Location)
              </button>

              {(user?.role === 'admin' || user?.role === 'campaign_manager') && (
                <button
                  onClick={() => handleQuickAction("Create an emergency flood alert campaign for Varanasi in Hindi")}
                  style={{ background: 'var(--chatbot-btn-bg)', border: '1px solid var(--chatbot-border)', color: 'hsl(var(--primary))', padding: '5px 10px', borderRadius: '12px', fontSize: '0.74rem', whiteSpace: 'nowrap', cursor: 'pointer' }}
                >
                  🎙️ Auto-Create Flood Alert (Hindi)
                </button>
              )}
            </div>
          )}

          {/* Input Form at bottom */}
          {!showEscalateForm && (
            <form
              onSubmit={handleSend}
              style={{
                padding: '12px 16px',
                borderTop: '1px solid var(--border-color-glass)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'var(--chatbot-msg-bg)'
              }}
            >
              {/* Voice Microphone Button */}
              <button
                type="button"
                onClick={startListening}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: isListening ? '#ef4444' : 'var(--chatbot-btn-bg)',
                  border: isListening ? '2px solid #f87171' : '1px solid var(--chatbot-border)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: isListening ? '#ffffff' : 'hsl(var(--primary))',
                  transition: 'all 0.2s',
                  boxShadow: isListening ? '0 0 12px rgba(239, 68, 68, 0.6)' : 'none'
                }}
                title={isListening ? "Listening... Click to stop" : "Click to speak your campaign instruction"}
              >
                🎙️
              </button>

              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={isListening ? "Listening to your voice..." : "Ask or speak: 'Create campaign...'"}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: '12px',
                  border: isListening ? '1px solid #ef4444' : '1px solid var(--input-border)',
                  background: 'var(--input-bg)',
                  color: 'hsl(var(--text-primary))',
                  fontSize: '0.85rem',
                  outline: 'none',
                  transition: 'border-color 0.2s'
                }}
              />

              <button
                type="submit"
                disabled={loading || !inputValue.trim()}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: 'hsl(var(--primary))',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  transition: 'background 0.2s',
                  opacity: inputValue.trim() ? 1 : 0.6
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '16px', height: '16px' }}>
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
};

export default ChatbotWidget;
