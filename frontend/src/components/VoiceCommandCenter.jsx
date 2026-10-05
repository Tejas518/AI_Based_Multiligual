import React, { useState, useEffect, useRef } from 'react';

const VoiceCommandCenter = ({ user, backendUrl, token, activeTab, onExecuteVoiceCommand }) => {
  const isManagerOrAdmin = user && (user.role === 'admin' || user.role === 'campaign_manager');
  if (!isManagerOrAdmin) return null;

  const [isOpen, setIsOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [statusMessage, setStatusMessage] = useState('Voice Cockpit Standby');
  // Wake-Word Listener State ("Hey Jarvis" / "Hey Jarvis AI")
  const [wakeWordEnabled, setWakeWordEnabled] = useState(true);
  const wakeWordRecognitionRef = useRef(null);

  // Microphone permission popup state after login
  const [showMicBanner, setShowMicBanner] = useState(() => {
    return !sessionStorage.getItem('jarvis_mic_notice_shown');
  });

  // Background Wake-Word listener effect ("Hey Jarvis" / "Hey Jarvis AI")
  useEffect(() => {
    if (!isManagerOrAdmin || !wakeWordEnabled || isOpen) {
      if (wakeWordRecognitionRef.current) {
        try { wakeWordRecognitionRef.current.abort(); } catch (e) {}
        wakeWordRecognitionRef.current = null;
      }
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    let isActive = true;
    let retryTimer = null;

    const startWakeWordListener = () => {
      if (!isActive || !wakeWordEnabled || isOpenRef.current || window.__commai_copilot_mic_active) return;

      try {
        if (wakeWordRecognitionRef.current) {
          try { wakeWordRecognitionRef.current.abort(); } catch (e) {}
          wakeWordRecognitionRef.current = null;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = localStorage.getItem('comm_speech_lang') || 'en-IN';
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = (event) => {
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const text = event.results[i][0].transcript.toLowerCase();
            // Flexible, robust matching for "hey jarvis", "hey jarvis ai", "jarvis", "ok jarvis", "hi jarvis", etc.
            const hasWakeWord = text.includes('jarvis') || 
                                text.includes('jervis') || 
                                text.includes('jarves') || 
                                /\b(hey|ok|hello|hi)?\s*j[a|e]rv/i.test(text);

            if (hasWakeWord) {
              try { recognition.abort(); } catch (e) {}
              wakeWordRecognitionRef.current = null;
              // Wake word detected! Open Cockpit hands-free
              setIsOpen(true);
              const greeting = "Hello admin, what do you want to do?";
              setStatusMessage('⚡ Jarvis Activated • Listening...');
              speakAloud(greeting, true);
              break;
            }
          }
        };

        recognition.onerror = (err) => {
          console.log('[Jarvis Wake-Word] Recognition event error:', err?.error);
        };

        recognition.onend = () => {
          wakeWordRecognitionRef.current = null;
          if (isActive && wakeWordEnabled && !isOpenRef.current && !window.__commai_copilot_mic_active) {
            retryTimer = setTimeout(() => {
              if (isActive && !isOpenRef.current && !window.__commai_copilot_mic_active) {
                startWakeWordListener();
              }
            }, 800);
          }
        };

        wakeWordRecognitionRef.current = recognition;
        recognition.start();
      } catch (e) {
        console.warn('[Jarvis Wake-Word] Mic start delayed/busy, retrying in 1.2s:', e);
        wakeWordRecognitionRef.current = null;
        if (isActive && !isOpenRef.current && !window.__commai_copilot_mic_active) {
          retryTimer = setTimeout(() => {
            if (isActive && !isOpenRef.current && !window.__commai_copilot_mic_active) {
              startWakeWordListener();
            }
          }, 1200);
        }
      }
    };

    // Small initial delay to ensure previous mic instance is fully freed by browser
    const initTimer = setTimeout(() => {
      startWakeWordListener();
    }, 400);

    return () => {
      isActive = false;
      if (initTimer) clearTimeout(initTimer);
      if (retryTimer) clearTimeout(retryTimer);
      if (wakeWordRecognitionRef.current) {
        try { wakeWordRecognitionRef.current.abort(); } catch (e) {}
        wakeWordRecognitionRef.current = null;
      }
    };
  }, [wakeWordEnabled, isOpen, isManagerOrAdmin]);

  // Condition A: Silence Jarvis on manual UI interaction or input focus
  useEffect(() => {
    const handleSilence = () => {
      stopSpeaking();
      stopListening();
      setStatusMessage('🔇 Muted — Manual Dashboard Edit Detected');
    };

    const handleStopAll = () => {
      stopSpeaking();
      if (wakeWordRecognitionRef.current) {
        try { wakeWordRecognitionRef.current.abort(); } catch (e) {}
        wakeWordRecognitionRef.current = null;
      }
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) {}
      }
      setIsListening(false);
    };

    window.addEventListener('commai_silence_jarvis', handleSilence);
    window.addEventListener('commai_stop_all_speech', handleStopAll);

    const handleGlobalInputInteraction = (e) => {
      const target = e.target;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        const isInsideCockpit = target.closest && target.closest('#jarvis-cockpit-modal');
        // Don't silence when the Co-Pilot mic textarea is being voice-filled
        const isCoPilotMicTarget = target.getAttribute && target.getAttribute('data-copilot-mic') === 'true';
        if (!isInsideCockpit && !isCoPilotMicTarget) {
          handleSilence();
        }
      }
    };

    window.addEventListener('focusin', handleGlobalInputInteraction);
    window.addEventListener('input', handleGlobalInputInteraction);

    return () => {
      window.removeEventListener('commai_silence_jarvis', handleSilence);
      window.removeEventListener('commai_stop_all_speech', handleStopAll);
      window.removeEventListener('focusin', handleGlobalInputInteraction);
      window.removeEventListener('input', handleGlobalInputInteraction);
    };
  }, []);

  // Active command result state
  const [activeResult, setActiveResult] = useState(null);
  const [pendingConfirmation, setPendingConfirmation] = useState(null);
  // STALE-CLOSURE FIX: Mirror pendingConfirmation in a ref so that event-handler
  // closures (recognition.onresult → handleProcessVoiceCommand) always read the
  // live value, not the snapshot captured when speakAloud() was called.
  const pendingConfirmationRef = useRef(null);

  // Interactive dropdown states
  const [selectedLocation, setSelectedLocation] = useState('All Locations');
  const [selectedRecipients, setSelectedRecipients] = useState('All Citizens');
  const [locationsList, setLocationsList] = useState(['All Locations', 'Assam', 'Uttar Pradesh', 'Varanasi', 'Delhi', 'Maharashtra', 'Gujarat']);
  const [recipientsList, setRecipientsList] = useState(['All Citizens', 'Farmers', 'Healthcare Workers', 'Local Authorities']);

  const recognitionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const lastSpokenTextRef = useRef('');
  const lastSpokeTimestampRef = useRef(0);
  const isTtsSpeakingRef = useRef(false);

  const getDisplayName = () => {
    if (!user) return 'Manager';
    const roleTitle = user.role === 'admin' ? 'Admin' : 'Manager';
    const namePart = user.full_name ? user.full_name.split(' ')[0] : '';
    return namePart ? `${roleTitle} ${namePart}` : roleTitle;
  };

  const ttsTimeoutRef = useRef(null);
  const ttsPingRef = useRef(null);
  const isOpenRef = useRef(isOpen);
  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  // Keep pendingConfirmationRef in sync with state on every render
  useEffect(() => {
    pendingConfirmationRef.current = pendingConfirmation;
  }, [pendingConfirmation]);

  const clearTtsPing = () => {
    if (ttsPingRef.current) {
      clearInterval(ttsPingRef.current);
      ttsPingRef.current = null;
    }
  };

  // Text-to-Speech playback helper with auto-listen callback
  const speakAloud = (text, autoListenAfter = false) => {
    stopListening();
    isTtsSpeakingRef.current = true;
    if (ttsTimeoutRef.current) {
      clearTimeout(ttsTimeoutRef.current);
      ttsTimeoutRef.current = null;
    }
    clearTtsPing();

    if (!('speechSynthesis' in window)) {
      isTtsSpeakingRef.current = false;
      if (autoListenAfter && isOpenRef.current) startListening();
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const cleanText = text.replace(/[*#_`]/g, '');
      lastSpokenTextRef.current = cleanText;

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      
      const speechLang = localStorage.getItem('comm_speech_lang') || 'en-IN';
      utterance.lang = speechLang;

      let triggered = false;
      const triggerListenOnce = () => {
        isTtsSpeakingRef.current = false;
        clearTtsPing();
        if (!triggered) {
          triggered = true;
          if (ttsTimeoutRef.current) {
            clearTimeout(ttsTimeoutRef.current);
            ttsTimeoutRef.current = null;
          }
          setIsSpeaking(false);
          lastSpokeTimestampRef.current = Date.now();
          if (autoListenAfter && isOpenRef.current) {
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 992;
            if (!isMobile) {
              setTimeout(() => {
                startListening();
              }, 2500);
            }
          }
        }
      };

      utterance.onstart = () => {
        setIsSpeaking(true);
        isTtsSpeakingRef.current = true;
        // FIX: Chrome/Edge 15-second TTS cutoff keepalive.
        // CRITICAL: Do NOT call pause() here — it causes Chrome to re-emit onstart
        // and repeat the utterance from the beginning (the double-speaking bug).
        // Instead: only call resume() if Chrome has silently paused on its own.
        // Interval is 14s — just under Chrome's 15s cutoff — so we never need to force-pause.
        ttsPingRef.current = setInterval(() => {
          if (!window.speechSynthesis) { clearTtsPing(); return; }
          if (window.speechSynthesis.paused) {
            // Chrome paused it by itself (15s bug) — safe to resume
            console.log('[Jarvis TTS] Chrome auto-paused detected — resuming');
            window.speechSynthesis.resume();
          } else if (!window.speechSynthesis.speaking) {
            // Speech ended naturally — clean up interval
            clearTtsPing();
          }
          // If speaking && !paused — do nothing. Let it speak uninterrupted.
        }, 14000);
      };

      utterance.onend = () => triggerListenOnce();
      utterance.onerror = () => triggerListenOnce();

      // Dynamic safety timeout proportional to text length (never cut off active speech!)
      const dynamicMs = Math.max(12000, Math.ceil((cleanText.length / 8) * 1000) + 6000);
      ttsTimeoutRef.current = setTimeout(() => {
        triggerListenOnce();
      }, dynamicMs);

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      isTtsSpeakingRef.current = false;
      clearTtsPing();
      console.error('Speech synthesis error:', e);
      if (autoListenAfter && isOpenRef.current) startListening();
    }
  };

  const stopSpeaking = () => {
    isTtsSpeakingRef.current = false;
    clearTtsPing();
    if (ttsTimeoutRef.current) {
      clearTimeout(ttsTimeoutRef.current);
      ttsTimeoutRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  // Toggle Cockpit Modal & Greeting
  const toggleCockpit = () => {
    if (!isOpen) {
      setIsOpen(true);
      const greeting = "Hello admin, what do you want to do?";
      setStatusMessage('⚡ Jarvis Active • Listening...');
      speakAloud(greeting, true);
    } else {
      setIsOpen(false);
      stopSpeaking();
      stopListening();
    }
  };

  // Speech Recognition Start/Stop
  const startListening = () => {
    // Stop any ongoing speech synthesis immediately so user can dictate
    stopSpeaking();

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) {}
    }

    try {
      setTranscript('');
      const recognition = new SpeechRecognition();
      const speechLang = localStorage.getItem('comm_speech_lang') || 'en-IN';
      recognition.lang = speechLang;
      recognition.interimResults = true;
      recognition.continuous = true;

      let lastCapturedTranscript = '';

      recognition.onstart = () => {
        setIsListening(true);
        setTranscript('');
        setStatusMessage('🎙️ Listening to your voice command...');
      };

      recognition.onresult = (event) => {
        if (isTtsSpeakingRef.current) {
          console.log('[Jarvis Voice] Speech recognition result discarded: TTS is actively speaking.');
          return;
        }

        let finalTranscript = '';
        let interimTranscript = '';
        for (let i = 0; i < event.results.length; i++) {
          const piece = event.results[i][0].transcript || '';
          if (event.results[i].isFinal) {
            finalTranscript += piece + ' ';
          } else {
            interimTranscript += piece;
          }
        }
        const trimmed = (finalTranscript + ' ' + interimTranscript).replace(/\s+/g, ' ').trim();
        if (!trimmed) return;

        // Echo feedback suppression: only suppress if TTS stopped less than 1.5s ago AND input is long verbatim overlap
        const timeSinceTTS = Date.now() - lastSpokeTimestampRef.current;
        const cleanSpoken = (lastSpokenTextRef.current || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
        const cleanCaptured = trimmed.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();

        if (timeSinceTTS < 1500 && cleanSpoken && cleanCaptured && cleanCaptured.length > 15) {
          const spokenWords = new Set(cleanSpoken.split(/\s+/).filter(w => w.length > 2));
          const capturedWords = cleanCaptured.split(/\s+/).filter(w => w.length > 2);
          const overlap = capturedWords.filter(w => spokenWords.has(w));

          const isSubstringMatch = cleanSpoken.includes(cleanCaptured);
          const isHighOverlap = capturedWords.length > 0 && (overlap.length / capturedWords.length) > 0.7;

          if (isSubstringMatch || isHighOverlap) {
            console.log('[Jarvis Voice] Echo feedback suppressed:', cleanCaptured);
            return;
          }
        }

        lastCapturedTranscript = trimmed;
        setTranscript(trimmed);
        setStatusMessage(`🎙️ Listening: "${trimmed}"`);

        // Reset silence timer on every new speech input fragment
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
        }

        // Wait for 1.8 seconds of natural silence after speaking before processing command
        silenceTimerRef.current = setTimeout(() => {
          const finalPrompt = lastCapturedTranscript.trim();
          if (finalPrompt && (finalPrompt.length >= 2 || pendingConfirmation)) {
            stopListening();
            handleProcessVoiceCommand(finalPrompt);
          }
        }, 1800);
      };

      recognition.onerror = (e) => {
        console.warn("Voice recognition error:", e.error);
        if (e.error !== 'no-speech') {
          setIsListening(false);
          setStatusMessage('Listening paused. Click mic or speak again.');
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error(err);
      setIsListening(false);
    }
  };

  const stopListening = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) {}
    }
    setIsListening(false);
  };

  // Send Spoken Command to Backend
  const handleProcessVoiceCommand = async (commandText) => {
    if (!commandText || !commandText.trim()) return;
    const cleanCmdRaw = commandText.trim().toLowerCase();
    const cleanCmd = cleanCmdRaw.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

    // Check if user is confirming or cancelling an active voice action
    const isTargetedSend = cleanCmd.includes('send to') || cleanCmd.includes('send this to') || cleanCmd.includes('send message to');
    const isNewCommandIntent = ['create', 'launch', 'open', 'message', 'chat', 'navigate', 'search', 'show', 'find', 'go to'].some(w => cleanCmd.includes(w));

    // Always read from ref — not from state — to avoid stale closure bug
    // (speakAloud captures handleProcessVoiceCommand before setPendingConfirmation re-renders)
    if (isNewCommandIntent && pendingConfirmationRef.current) {
      setPendingConfirmation(null);
      pendingConfirmationRef.current = null;
      setActiveResult(null);
    }

    const activeCtx = isNewCommandIntent ? null : pendingConfirmationRef.current;

    if (activeCtx && !isTargetedSend) {
      const confirmWords = [
        'yes', 'yeah', 'yep', 'sure', 'confirm', 'proceed', 'go ahead', 'do it', 'ok', 'okay',
        'send', 'send now', 'send alert', 'send message', 'broadcast', 'do broadcast',
        'yes send', 'yes broadcast', 'yes do it', 'broadcast alert', 'send it', 'yes send it',
        'ha', 'haan', 'ha send kr de', 'ha send kar de', 'haan send kr de', 'bhej do', 'ha bhej do', 'send kar do'
      ];
      const editWords = ['no', 'edit', 'cancel', 'stop', 'modify', 'dont', "don't"];

      // Precise matching: exact match OR starts/ends/contains confirm word
      const isConfirm = confirmWords.some(w => {
        if (cleanCmd === w) return true;
        if (cleanCmd.startsWith(w + ' ') || cleanCmd.endsWith(' ' + w) || cleanCmd.includes(' ' + w + ' ')) return true;
        if (/\b(yes|confirm|proceed|ok|okay|send|bhej)\b/.test(cleanCmd)) return true;
        return false;
      });
      const isEdit = editWords.some(w => cleanCmd.includes(w) && !cleanCmd.includes('yes') && !cleanCmd.includes('send'));

      if (isConfirm) {
        if (activeCtx.type === 'operator_chat') {
          const msgPayload = activeCtx.data?.message_text || activeCtx.data?.body || activeCtx.data?.description;
          const chanPayload = activeCtx.data?.target_channel || 'general';

          // 1. Dispatch event with detail payload to active OperatorChat page
          window.dispatchEvent(new CustomEvent('commai_voice_send_operator_chat', {
            detail: { message: msgPayload, channel: chanPayload }
          }));

          const targetName = activeCtx.data?.target_manager || 'staff';
          const confirmText = `Confirmed ${getDisplayName()}! Message sent to ${targetName}.`;
          setStatusMessage(`🚀 Message Sent to ${targetName}`);
          setPendingConfirmation(null);
          setActiveResult(null);
          speakAloud(confirmText, false);
          return;
        } else {
          // Campaign / sentiment — proceed with normal action
          handleProceedAction();
          return;
        }
      } else if (isEdit) {
        const cancelText = `Got it ${getDisplayName()}. You can edit the text directly on screen. What else can I help you with?`;
        setStatusMessage('✏️ Edit Mode Active');
        setPendingConfirmation(null);
        setActiveResult(null);
        speakAloud(cancelText, false);
        return;
      } else {
        // Ambiguous / echo text while in confirmation mode — re-prompt instead of sending to backend
        console.log('[Jarvis Voice] Ambiguous input during confirmation, re-prompting:', cleanCmd);
        const reprompt = activeCtx.type === 'operator_chat'
          ? `${getDisplayName()}, should I send this message, or would you like to edit it?`
          : `${getDisplayName()}, do you want to proceed, or would you like to edit?`;
        speakAloud(reprompt, true);
        return;
      }
    }

    // Otherwise, process as a new command with backend AI Intent Engine
    // IMPORTANT: Clear pending state BEFORE sending. Do NOT pass stale activeCtx to backend
    // — that would cause the AI to treat new commands as confirmations and route to wrong pages.
    setPendingConfirmation(null);
    setActiveResult(null);
    setLoading(true);
    setStatusMessage('🧠 AI Intent Engine analyzing command...');

    const requestContext = {
      active_tab: activeTab || 'dashboard',
      navigation_target: activeTab || 'dashboard',
      ...(activeCtx || {})
    };

    try {
      const response = await fetch(`${backendUrl}/api/ai/voice-command`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          command: commandText,
          active_context: requestContext
        })
      });

      if (!response.ok) throw new Error('Voice command processing failed');

      const data = await response.json();
      setActiveResult(data);

      if (data.location_selected) setSelectedLocation(data.location_selected);
      if (data.locations_list && data.locations_list.length > 0) {
        setLocationsList(Array.from(new Set([data.location_selected, ...data.locations_list])));
      }
      if (data.recipients_selected) setSelectedRecipients(data.recipients_selected);
      if (data.recipients_list && data.recipients_list.length > 0) {
        setRecipientsList(Array.from(new Set([data.recipients_selected, ...data.recipients_list])));
      }

      setStatusMessage(`✅ Action Identified: ${data.action.replace('_', ' ').toUpperCase()}`);

      // Execute navigation & pre-filling on main UI immediately so results render on the dashboard screen!
      if (onExecuteVoiceCommand) {
        onExecuteVoiceCommand(data);
      }

      if (data.action === 'send_operator_chat_message') {
        const msgPayload = data.message_text || data.body || data.description;
        const chanPayload = data.target_channel || 'general';
        window.dispatchEvent(new CustomEvent('commai_voice_send_operator_chat', {
          detail: { message: msgPayload, channel: chanPayload }
        }));
        setPendingConfirmation(null);
        setActiveResult(null);
      } else {
        const isConfirmationRequired = !data.user_confirmed && (data.requires_confirmation || ['create_campaign', 'emergency_broadcast', 'send_alert'].includes(data.action) || (data.navigation_target === 'operator_chat' && (data.message_text || data.body || data.description)));

        if (isConfirmationRequired) {
          const confType = (data.navigation_target === 'operator_chat') ? 'operator_chat' : 'campaign';
          setPendingConfirmation({ type: confType, data });
        } else {
          setPendingConfirmation(null);
          if (data.user_confirmed) {
            setIsOpen(false);
          }
        }
      }

      // Speak back response to manager and auto-open microphone for next command / confirmation!
      if (data.spoken_response) {
        speakAloud(data.spoken_response, !data.user_confirmed);
      }
    } catch (err) {
      console.error('Voice Command Error:', err);
      const errReply = `Sorry ${getDisplayName()}, I couldn't process that command. Please try speaking again.`;
      setStatusMessage('⚠️ Processing Error');
      speakAloud(errReply, true);
    } finally {
      setLoading(false);
    }
  };

  // Manager Proceed / Confirm Action
  const handleProceedAction = () => {
    const targetResult = activeResult || pendingConfirmation?.data;
    if (!targetResult) return;
    stopSpeaking();

    const actionType = pendingConfirmation?.type || 'campaign';

    // Special case: operator_chat — dispatch send event & fetch fallback, do NOT re-navigate
    if (actionType === 'operator_chat' || targetResult.navigation_target === 'operator_chat') {
      const msgPayload = targetResult.message_text || targetResult.body || targetResult.description;
      const chanPayload = targetResult.target_channel || 'general';

      window.dispatchEvent(new CustomEvent('commai_voice_send_operator_chat', {
        detail: { message: msgPayload, channel: chanPayload }
      }));

      const targetName = targetResult.target_manager || 'staff';
      const confirmText = `Confirmed ${getDisplayName()}! Message sent to ${targetName}.`;
      setStatusMessage(`🚀 Message Sent to ${targetName}`);
      setActiveResult(null);
      setPendingConfirmation(null);
      speakAloud(confirmText, false);
      return;
    }

    // Campaign / Sentiment alert flow
    const updatedResult = {
      ...targetResult,
      location_selected: selectedLocation,
      recipients_selected: selectedRecipients,
      user_confirmed: true
    };

    const confirmSpeech = `Confirmed ${getDisplayName()}! Executing ${updatedResult.title || 'campaign'} for ${selectedLocation}.`;
    speakAloud(confirmSpeech, false);

    if (onExecuteVoiceCommand) {
      onExecuteVoiceCommand(updatedResult);
    }

    setActiveResult(null);
    setPendingConfirmation(null);
    setIsOpen(false);
  };

  return (
    <>
      {/* Post-Login Microphone Permission Toast Banner */}
      {showMicBanner && (
        <div
          style={{
            position: 'fixed',
            bottom: '80px',
            right: '24px',
            zIndex: 9999,
            maxWidth: '380px',
            background: 'var(--chatbot-bg)',
            backdropFilter: 'blur(20px)',
            border: '1px solid var(--chatbot-border)',
            boxShadow: 'var(--chatbot-shadow)',
            borderRadius: '16px',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            color: 'hsl(var(--text-primary))'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.2rem' }}>🎙️</span>
              <span style={{ fontWeight: 800, fontSize: '0.88rem', color: 'hsl(var(--text-primary))', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Jarvis AI Voice Cockpit
              </span>
            </div>
            <button
              onClick={() => {
                setShowMicBanner(false);
                sessionStorage.setItem('jarvis_mic_notice_shown', 'true');
              }}
              style={{ background: 'none', border: 'none', color: 'hsl(var(--text-muted))', cursor: 'pointer', fontSize: '0.9rem' }}
            >
              ✕
            </button>
          </div>

          <p style={{ margin: 0, fontSize: '0.82rem', color: 'hsl(var(--text-secondary))', lineHeight: '1.5' }}>
            Make sure your <strong style={{ color: 'hsl(var(--text-primary))', fontWeight: 700 }}>microphone permission is allowed</strong> in the browser to use <strong style={{ color: 'hsl(var(--text-primary))', fontWeight: 700 }}>Jarvis AI</strong> hands-free (say <em style={{ color: 'hsl(var(--text-primary))' }}>"Hey Jarvis"</em> anytime)!
          </p>

          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <button
              onClick={() => {
                if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                  navigator.mediaDevices.getUserMedia({ audio: true })
                    .then(() => {
                      alert("Microphone permission granted! Jarvis AI is active and ready.");
                      setShowMicBanner(false);
                      sessionStorage.setItem('jarvis_mic_notice_shown', 'true');
                    })
                    .catch(() => {
                      alert("Please allow microphone access in your browser location settings.");
                    });
                } else {
                  alert("Microphone access is managed in your browser settings.");
                  setShowMicBanner(false);
                  sessionStorage.setItem('jarvis_mic_notice_shown', 'true');
                }
              }}
              style={{
                flex: 1,
                padding: '8px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
                color: 'white',
                border: 'none',
                fontWeight: 700,
                fontSize: '0.78rem',
                cursor: 'pointer'
              }}
            >
              🎙️ Enable & Test Mic
            </button>

            <button
              onClick={() => {
                setShowMicBanner(false);
                sessionStorage.setItem('jarvis_mic_notice_shown', 'true');
              }}
              style={{
                padding: '8px 12px',
                borderRadius: '10px',
                background: 'var(--chatbot-btn-bg)',
                color: 'hsl(var(--text-primary))',
                border: '1px solid var(--chatbot-border)',
                fontWeight: 600,
                fontSize: '0.78rem',
                cursor: 'pointer'
              }}
            >
              Got it!
            </button>
          </div>
        </div>
      )}

      <div className="floating-voice-cockpit" style={{ position: 'fixed', bottom: '24px', right: '92px', zIndex: 1000, fontFamily: 'var(--font-body)' }}>
      {/* Dedicated Floating Voice Launcher Button */}
      <button
        onClick={toggleCockpit}
        style={{
          height: '42px',
          padding: '0 14px',
          borderRadius: '21px',
          background: isOpen 
            ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' 
            : 'linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%)',
          border: 'none',
          cursor: 'pointer',
          boxShadow: isListening 
            ? '0 0 20px rgba(239, 68, 68, 0.7)' 
            : '0 4px 20px rgba(139, 92, 246, 0.35)',
          display: 'flex',
          alignItems: 'center',
          gap: '7px',
          color: 'white',
          fontWeight: 700,
          fontSize: '0.82rem',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          transform: isOpen ? 'scale(1.02)' : 'scale(1)',
          animation: isListening ? 'pulseGlowing 1.5s infinite ease-in-out' : 'none'
        }}
        title="Open AI Voice Command Cockpit (Admin / Manager)"
      >
        <span style={{ fontSize: '1rem', display: 'flex', alignItems: 'center' }}>
          {isListening ? '🎙️' : '⚡'}
        </span>
        <span>{isOpen ? 'Close' : 'Voice Cockpit'}</span>
        <span 
          style={{ 
            background: 'rgba(255, 255, 255, 0.22)', 
            padding: '2px 6px', 
            borderRadius: '8px', 
            fontSize: '0.62rem', 
            textTransform: 'uppercase', 
            letterSpacing: '0.04em' 
          }}
        >
          Jarvis AI
        </span>
      </button>

      {/* Voice Cockpit Modal Card */}
      {isOpen && (
        <div
          id="jarvis-cockpit-modal"
          style={{
            position: 'absolute',
            bottom: '68px',
            right: '0px',
            width: '360px',
            maxWidth: 'calc(100vw - 24px)',
            maxHeight: 'min(520px, calc(100vh - 100px))',
            borderRadius: '20px',
            background: 'var(--chatbot-bg)',
            backdropFilter: 'blur(24px)',
            border: '2px solid #000000',
            boxShadow: '0 12px 36px rgba(0, 0, 0, 0.35), var(--chatbot-shadow)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'cockpitSlide 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            zIndex: 9999
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '12px 16px',
              background: 'linear-gradient(90deg, rgba(139, 92, 246, 0.18), rgba(59, 130, 246, 0.18))',
              borderBottom: '1px solid var(--chatbot-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.95rem',
                  boxShadow: '0 0 10px rgba(139, 92, 246, 0.5)'
                }}
              >
                🎙️
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: 'hsl(var(--text-primary))' }}>
                  CommAI Voice Cockpit
                </h4>
                <span style={{ fontSize: '0.68rem', color: 'hsl(var(--text-muted))', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: wakeWordEnabled ? '#22c55e' : '#64748b' }}></span>
                  {wakeWordEnabled ? 'Wake-Word Active ("Hey Jarvis")' : 'Manager Mode • Manual Mic'}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                onClick={() => setWakeWordEnabled(!wakeWordEnabled)}
                style={{
                  background: wakeWordEnabled ? 'rgba(34, 197, 94, 0.15)' : 'var(--chatbot-btn-bg)',
                  border: wakeWordEnabled ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid var(--chatbot-border)',
                  color: wakeWordEnabled ? '#16a34a' : 'hsl(var(--text-muted))',
                  padding: '3px 8px',
                  borderRadius: '10px',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
                title="Toggle Background Wake-Word Detection ('Hey Jarvis')"
              >
                {wakeWordEnabled ? '👂 Wake: ON' : '🔇 Wake: OFF'}
              </button>

              <button
                onClick={() => setIsOpen(false)}
                style={{
                  background: 'var(--chatbot-btn-bg)',
                  border: '1px solid var(--chatbot-border)',
                  color: 'hsl(var(--text-muted))',
                  width: '26px',
                  height: '26px',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.8rem'
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Body Content */}
          <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
            
            {/* Status & Speech Visualization */}
            <div 
              style={{ 
                background: 'var(--chatbot-msg-bg)', 
                border: '1px solid var(--chatbot-border)', 
                borderRadius: '14px', 
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem', color: 'hsl(var(--text-secondary))', fontWeight: 600 }}>
                <span>{statusMessage}</span>
                {isSpeaking && (
                  <span style={{ color: '#8b5cf6', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    🔊 Speaking...
                  </span>
                )}
              </div>

              {/* Sound Equalizer Bars */}
              {(isListening || isSpeaking) && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', height: '24px', margin: '4px 0' }}>
                  {[0.1, 0.3, 0.2, 0.5, 0.2, 0.4, 0.1].map((delay, idx) => (
                    <span
                      key={idx}
                      style={{
                        width: '4px',
                        height: '100%',
                        borderRadius: '2px',
                        background: isListening ? '#ef4444' : '#8b5cf6',
                        animation: `equalizeBar 0.8s infinite ease-in-out ${delay}s`
                      }}
                    />
                  ))}
                </div>
              )}

              {/* Live Dictation & Transcript Display */}
              {(isListening || transcript) && (
                <div 
                  style={{ 
                    fontSize: '0.88rem', 
                    color: 'hsl(var(--text-primary))', 
                    background: 'var(--chatbot-btn-bg)', 
                    padding: '10px 14px', 
                    borderRadius: '10px',
                    border: isListening ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid var(--chatbot-border)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {transcript ? (
                    <span>🗣️ <strong style={{ color: 'hsl(var(--primary))', fontWeight: 700 }}>"{transcript}"</strong></span>
                  ) : (
                    <span style={{ color: 'hsl(var(--text-muted))', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ animation: 'pulseGlowing 1s infinite', color: '#ef4444' }}>🔴</span> Speak now... (e.g. "Hello", "Create a new awareness campaign")
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Live State Indicator Bar */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              borderRadius: '10px',
              background: isSpeaking
                ? 'rgba(139, 92, 246, 0.12)'
                : isListening
                  ? 'rgba(239, 68, 68, 0.1)'
                  : 'var(--chatbot-msg-bg)',
              border: isSpeaking
                ? '1px solid rgba(139, 92, 246, 0.3)'
                : isListening
                  ? '1px solid rgba(239, 68, 68, 0.35)'
                  : '1px solid var(--chatbot-border)',
              fontSize: '0.76rem',
              fontWeight: 700,
              color: isSpeaking ? '#8b5cf6' : isListening ? '#ef4444' : 'hsl(var(--text-muted))'
            }}>
              <span style={{ fontSize: '1rem' }}>
                {isSpeaking ? '🔊' : isListening ? '🎙️' : '💤'}
              </span>
              <span>
                {isSpeaking ? 'Jarvis is speaking — wait or mute' : isListening ? 'Mic active — speak your command' : 'Standby — tap mic or say "Hey Jarvis"'}
              </span>
              {loading && <span style={{ marginLeft: 'auto', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '4px' }}>⏳ Processing...</span>}
            </div>

            {/* Mic Controls */}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              {isListening ? (
                <button
                  onClick={stopListening}
                  style={{
                    flex: 1,
                    padding: '13px 16px',
                    borderRadius: '14px',
                    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                    color: 'white',
                    border: '2px solid rgba(239, 68, 68, 0.4)',
                    fontWeight: 800,
                    fontSize: '0.88rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 20px rgba(239, 68, 68, 0.5), 0 0 30px rgba(239, 68, 68, 0.25)',
                    animation: 'pulseGlowing 1.5s infinite ease-in-out',
                    letterSpacing: '0.01em'
                  }}
                >
                  🛑 Stop Recording
                </button>
              ) : (
                <button
                  onClick={startListening}
                  disabled={isSpeaking}
                  style={{
                    flex: 1,
                    padding: '13px 16px',
                    borderRadius: '14px',
                    background: isSpeaking
                      ? '#9ca3af'
                      : 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                    color: 'white',
                    border: 'none',
                    fontWeight: 800,
                    fontSize: '0.88rem',
                    cursor: isSpeaking ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: isSpeaking ? 'none' : '0 4px 16px rgba(34, 197, 94, 0.4)',
                    opacity: isSpeaking ? 0.6 : 1,
                    letterSpacing: '0.01em',
                    transition: 'all 0.2s'
                  }}
                  title={isSpeaking ? 'Wait for Jarvis to finish speaking first' : 'Start voice input'}
                >
                  🎤 {isSpeaking ? 'Wait for Jarvis...' : 'Speak Command'}
                </button>
              )}

              {isSpeaking && (
                <button
                  onClick={stopSpeaking}
                  style={{
                    padding: '13px 18px',
                    borderRadius: '14px',
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    color: 'white',
                    border: '2px solid rgba(245, 158, 11, 0.4)',
                    cursor: 'pointer',
                    fontSize: '0.88rem',
                    fontWeight: 800,
                    boxShadow: '0 4px 16px rgba(245, 158, 11, 0.4)',
                    transition: 'all 0.2s',
                    whiteSpace: 'nowrap'
                  }}
                  title="Stop Jarvis speaking now"
                >
                  🔇 Mute
                </button>
              )}
            </div>

            {/* Voice Cockpit Command Prompts */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* Wake Word Banner */}
              <div style={{ background: 'rgba(34, 197, 94, 0.12)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: '12px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: 'hsl(var(--text-primary))' }}>
                <span style={{ fontSize: '1.1rem' }}>🎙️</span>
                <span><strong style={{ color: '#16a34a' }}>Hands-Free:</strong> Say <em>"Hey Jarvis"</em> anytime to open!</span>
              </div>

              <span style={{ fontSize: '0.73rem', fontWeight: 700, color: 'hsl(var(--text-secondary))', marginTop: '2px', letterSpacing: '0.03em', textTransform: 'uppercase' }}>
                💡 Quick Command Chips — click to run:
              </span>

              {/* Color-coded command chips */}
              {[
                { prompt: 'Emergency! Flash flood warning for Assam, send immediately to all audiences', color: '#ef4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)', icon: '🚨' },
                { prompt: 'Create an agricultural water drive campaign for Uttar Pradesh farmers',       color: '#22c55e', bg: 'rgba(34,197,94,0.1)',  border: 'rgba(34,197,94,0.3)',  icon: '🌾' },
                { prompt: 'Show me all pending approvals',                                              color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', icon: '📋' },
                { prompt: 'Open audience directory to see registered citizens',                         color: '#06b6d4', bg: 'rgba(6,182,212,0.1)',  border: 'rgba(6,182,212,0.3)',  icon: '👥' },
                { prompt: 'Show audit trail logs for system activity',                                  color: '#ec4899', bg: 'rgba(236,72,153,0.1)', border: 'rgba(236,72,153,0.3)', icon: '📜' },
                { prompt: 'Open operator staff chat and message the team',                              color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)', border: 'rgba(139,92,246,0.3)', icon: '💬' }
              ].map(({ prompt, color, bg, border, icon }, sIdx) => (
                <button
                  key={sIdx}
                  onClick={() => {
                    setTranscript(prompt);
                    handleProcessVoiceCommand(prompt);
                  }}
                  style={{
                    textAlign: 'left',
                    background: bg,
                    border: `1px solid ${border}`,
                    color: color,
                    padding: '9px 12px',
                    borderRadius: '10px',
                    fontSize: '0.77rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.18s ease',
                    lineHeight: '1.4',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.filter = 'brightness(1.12)';
                    e.currentTarget.style.transform = 'translateX(2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.filter = 'none';
                    e.currentTarget.style.transform = 'none';
                  }}
                >
                  <span style={{ fontSize: '1rem', flexShrink: 0 }}>{icon}</span>
                  <span>{prompt}</span>
                </button>
              ))}
            </div>

          </div>
        </div>
      )}

      <style>{`
        @keyframes pulseGlowing {
          0%, 100% { boxShadow: 0 0 20px rgba(239, 68, 68, 0.6); }
          50% { boxShadow: 0 0 35px rgba(239, 68, 68, 0.9); }
        }
        @keyframes cockpitSlide {
          from { transform: translateY(20px) scale(0.95); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes equalizeBar {
          0%, 100% { transform: scaleY(0.3); }
          50% { transform: scaleY(1); }
        }
      `}</style>
    </div>
    </>
  );
};

export default VoiceCommandCenter;
