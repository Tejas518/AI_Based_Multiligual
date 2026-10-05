import React, { useState, useEffect, useRef, useCallback } from 'react';
import GlassCard from '../components/GlassCard';
import VoiceBulletinPlayer from '../components/VoiceBulletinPlayer';
import { parseApiError } from '../utils/apiError';
import { formatIST, formatShortIST } from '../utils/dateUtils';

const Campaigns = ({ user, backendUrl, headers, setActiveTab, setAutofillPosterData, initialVoicePlan, clearInitialVoicePlan }) => {
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'create'
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(false);

  // Lists fetched from DB for dropdown selection
  const [segments, setSegments] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [recipients, setRecipients] = useState([]);
  const [selectedRecipientId, setSelectedRecipientId] = useState('');
  const [selectedRecipientIds, setSelectedRecipientIds] = useState([]);
  const [recipientSearchTerm, setRecipientSearchTerm] = useState('');

  const getPreferredChannelsText = (rec) => {
    if (!rec.preferred_channels) return 'None';
    try {
      const channels = typeof rec.preferred_channels === 'string' 
        ? JSON.parse(rec.preferred_channels) 
        : rec.preferred_channels;
      return Array.isArray(channels) ? channels.join(', ') : 'None';
    } catch (e) {
      return 'None';
    }
  };

  const getPreferredLanguagesText = (rec) => {
    if (!rec.preferred_languages) return 'None';
    try {
      const langs = typeof rec.preferred_languages === 'string' 
        ? JSON.parse(rec.preferred_languages) 
        : rec.preferred_languages;
      return Array.isArray(langs) ? langs.join(', ') : 'None';
    } catch (e) {
      return 'None';
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    let formatted = String(dateStr);
    if (!formatted.endsWith('Z') && !formatted.includes('+') && !formatted.includes('-')) {
      formatted += 'Z';
    }
    const d = new Date(formatted);
    return isNaN(d.getTime()) ? dateStr : d.toLocaleString();
  };

  const cleanPlaceholderSignoffs = (str) => {
    if (!str) return '';
    return str.replace(/[\r\n]+\s*(?:Regards|Sincerely|Warm regards|Best regards|Thanks|अभिनंदन|सधन्यवाद|शुभकामनाएं)?\s*,?\s*\[[^\]]{1,35}\]\s*$/gi, '').trim();
  };

  // --- WIZARD STATES ---
  const [step, setStep] = useState(1);
  const [targetType, setTargetType] = useState('segment'); // 'segment' or 'recipient'
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formObjective, setFormObjective] = useState('');
  const [formType, setFormType] = useState('awareness_drive');
  const [selectedSegId, setSelectedSegId] = useState('');
  const [selectedTplId, setSelectedTplId] = useState('');
  const [customSubject, setCustomSubject] = useState('');
  const [customBody, setCustomBody] = useState('');
  const [placeholders] = useState([
    { label: 'Recipient Name', tag: '{{first_name}}' },
    { label: 'Surname', tag: '{{last_name}}' },
    { label: 'Location City', tag: '{{city}}' },
    { label: 'Occupation', tag: '{{occupation}}' },
    { label: 'Organization', tag: '{{organization}}' },
    { label: 'Department', tag: '{{department}}' }
  ]);
  const bodyTextareaRef = useRef(null);

  const [inlineTranslationLang, setInlineTranslationLang] = useState('Hindi');
  const [inlineTranslationResult, setInlineTranslationResult] = useState('');
  const [inlineTranslationSubjectResult, setInlineTranslationSubjectResult] = useState('');
  const [inlineTranslationLoading, setInlineTranslationLoading] = useState(false);
  const [inlineTranslationError, setInlineTranslationError] = useState('');

  const [selectedChannels, setSelectedChannels] = useState(['email']);
  const [overrideChannelPreferences, setOverrideChannelPreferences] = useState(false);
  const [evalBreakdowns, setEvalBreakdowns] = useState({});
  const [wizardError, setWizardError] = useState('');
  const [previewLang, setPreviewLang] = useState('English');
  const [previewTranslatedText, setPreviewTranslatedText] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [evalReach, setEvalReach] = useState({ target: 0, reach: 0 });
  const [evalLoading, setEvalLoading] = useState(false);
  const [segmentPreviewUsers, setSegmentPreviewUsers] = useState([]);
  const [showSegmentUsersModal, setShowSegmentUsersModal] = useState(false);
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledTime, setScheduledTime] = useState('');

  // --- INLINE POSTER STUDIO STATES ---
  const [inlinePosterUrl, setInlinePosterUrl] = useState('');
  const [inlinePosterLoading, setInlinePosterLoading] = useState(false);
  const [inlinePosterError, setInlinePosterError] = useState('');
  const [inlinePosterLanguage, setInlinePosterLanguage] = useState('Hindi');
  const [inlinePosterTone, setInlinePosterTone] = useState('formal');

  // --- NEW WORKFLOW STATES ---
  const [listTab, setListTab] = useState('all'); // 'all' or 'drafts'
  const [editingCampId, setEditingCampId] = useState(null);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [selectedCampaignForAudit, setSelectedCampaignForAudit] = useState(null);
  const [auditLoading, setAuditLoading] = useState(false);

  // Delivery Modal States
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [publishedResultModal, setPublishedResultModal] = useState(null);
  const [selectedCampaignForDelivery, setSelectedCampaignForDelivery] = useState(null);
  const [deliverySummary, setDeliverySummary] = useState(null);
  const [deliveryLogs, setDeliveryLogs] = useState([]);
  const [deliveryLoading, setDeliveryLoading] = useState(false);

  // AI Assist Panel State
  const [campAiPanelOpen, setCampAiPanelOpen] = useState(false);
  const [campAiTab, setCampAiTab] = useState('generate');
  const [campAiLoading, setCampAiLoading] = useState(false);
  const [campAiError, setCampAiError] = useState('');
  const [campAiPrompt, setCampAiPrompt] = useState('');
  const [campAiTone, setCampAiTone] = useState('formal');
  const [campAiAudienceProfile, setCampAiAudienceProfile] = useState('general');
  const [campAiObjective, setCampAiObjective] = useState('awareness');
  const [campAiResult, setCampAiResult] = useState(null);
  const [campAiComplianceResult, setCampAiComplianceResult] = useState(null);

  // --- ENTERPRISE AI CO-PILOT STATES ---
  const [coPilotOpen, setCoPilotOpen] = useState(false);
  const [coPilotPrompt, setCoPilotPrompt] = useState('');
  const [coPilotCategory, setCoPilotCategory] = useState('awareness_drive');
  const [coPilotLoading, setCoPilotLoading] = useState(false);
  const [coPilotError, setCoPilotError] = useState('');
  const [currentAiPlan, setCurrentAiPlan] = useState(null);
  const [coPilotHistory, setCoPilotHistory] = useState([]);
  const [refineInstruction, setRefineInstruction] = useState('');
  const [refineLoading, setRefineLoading] = useState(false);
  const [coPilotSelectedLang, setCoPilotSelectedLang] = useState('Hindi');

  const INDIAN_SPEECH_LANGUAGES = [
    { code: 'en-IN', label: '🇬🇧 English (India)' },
    { code: 'hi-IN', label: '🇮🇳 Hindi (हिंदी)' },
    { code: 'ta-IN', label: '🇮🇳 Tamil (தமிழ்)' },
    { code: 'te-IN', label: '🇮🇳 Telugu (తెలుగు)' },
    { code: 'mr-IN', label: '🇮🇳 Marathi (मराठी)' },
    { code: 'bn-IN', label: '🇮🇳 Bengali (বাংলা)' },
    { code: 'gu-IN', label: '🇮🇳 Gujarati (ગુજરાતી)' },
    { code: 'kn-IN', label: '🇮🇳 Kannada (ಕನ್ನಡ)' },
    { code: 'ml-IN', label: '🇮🇳 Malayalam (മലയാളം)' },
    { code: 'pa-IN', label: '🇮🇳 Punjabi (ਪੰਜਾਬੀ)' },
    { code: 'or-IN', label: '🇮🇳 Odia (ଓଡ଼ିଆ)' },
    { code: 'ur-IN', label: '🇮🇳 Urdu (اردو)' },
    { code: 'as-IN', label: '🇮🇳 Assamese (অসমীয়া)' }
  ];

  const [coPilotLang, setCoPilotLang] = useState(() => localStorage.getItem('comm_speech_lang') || 'en-IN');

  const handleSpeechLangChange = (langCode) => {
    setCoPilotLang(langCode);
    localStorage.setItem('comm_speech_lang', langCode);
  };

  const ALL_LANGUAGES = [
    "English", "Hindi", "Assamese", "Bengali", "Bodo", "Dogri", "Gujarati", 
    "Kannada", "Kashmiri", "Konkani", "Maithili", "Malayalam", "Manipuri", 
    "Marathi", "Nepali", "Odia", "Punjabi", "Sanskrit", "Santali", "Sindhi", 
    "Tamil", "Telugu", "Urdu"
  ];

  const handleTranslateViewLanguage = (targetLang) => {
    if (!targetLang) return;
    if (targetLang === 'English') {
      handleRefineCampaignPlan("Translate the campaign title, objective, email subject, and message body back into English, preserving all placeholder tags like {{first_name}}.");
    } else {
      handleRefineCampaignPlan(`Translate the campaign title, objective, email subject, and message body into ${targetLang}, strictly preserving all placeholder tags like {{first_name}}.`);
    }
  };

  const applyAiPlanToForm = (plan) => {
    // Ensure metadata and KPIs are present with valid defaults so NaN% Confidence never displays
    const safePlan = {
      ...plan,
      _voice_filled: !!plan._voice_filled,
      metadata: {
        confidence: plan.metadata?.confidence ?? 0.92,
        reasoning: plan.metadata?.reasoning || { campaign_type: 'Voice command intent', channels: 'Multi-channel dispatch' },
        suggestions: plan.metadata?.suggestions || ['Verify recipient list before launching']
      },
      kpis: {
        expected_reach_pct: plan.kpis?.expected_reach_pct ?? 88,
        ctr_goal_pct: plan.kpis?.ctr_goal_pct ?? 28,
        delivery_goal_pct: plan.kpis?.delivery_goal_pct ?? 98,
        awareness_goal_description: plan.kpis?.awareness_goal_description || 'Achieve high public engagement'
      }
    };

    setCurrentAiPlan(safePlan);
    setStep(1);

    if (plan.campaign) {
      let rawTitle = plan.campaign.title || '';
      let rawObj = plan.campaign.objective || '';
      let rawDesc = plan.campaign.description || '';

      // Clean up raw spoken command strings if present
      if (rawTitle.toLowerCase().startsWith('create me a campaign') || rawTitle.toLowerCase().startsWith('create a campaign')) {
        const topic = rawTitle.replace(/^(?:create|launch|send)\s+(?:me\s+)?(?:a\s+)?(?:new\s+)?(?:campaign|drive|alert)?\s*(?:on|for|about)?\s*/i, '').trim();
        rawTitle = topic ? `${topic.charAt(0).toUpperCase() + topic.slice(1)} Campaign` : 'Awareness Campaign';
      }
      if (rawObj.toLowerCase().startsWith('create me a campaign') || rawObj.toLowerCase().startsWith('create a campaign')) {
        const topic = rawObj.replace(/^(?:create|launch|send)\s+(?:me\s+)?(?:a\s+)?(?:new\s+)?(?:campaign|drive|alert)?\s*(?:on|for|about)?\s*/i, '').trim();
        rawObj = topic ? `Promote awareness and share official information regarding ${topic}.` : 'Promote citizen awareness.';
      }
      if (rawDesc.toLowerCase().startsWith('create me a campaign')) {
        rawDesc = `Targeted campaign regarding ${rawTitle}.`;
      }

      setFormTitle(rawTitle);
      setFormObjective(rawObj);
      if (plan.campaign.campaign_type) setFormType(plan.campaign.campaign_type);
      setFormDesc(rawDesc);
    }
    if (plan.delivery && plan.delivery.channels) {
      const validChs = plan.delivery.channels.filter(ch => channelsList.includes(ch));
      if (validChs.length > 0) setSelectedChannels(validChs);
    }
    if (plan.message) {
      let rawSubj = plan.message.subject || '';
      let rawBody = plan.message.body || '';

      if (rawSubj.toLowerCase().includes('create me a campaign')) {
        rawSubj = `[All Locations] ${formTitle || 'Important Notice'}`;
      }
      if (rawBody.toLowerCase().startsWith('create me a campaign')) {
        rawBody = `Dear {{first_name}},\n\nThis is an official communication regarding ${formTitle || 'this campaign'}. Please review the guidelines and stay informed.\n\nBest regards,\nCommAI Team`;
      }

      setCustomSubject(rawSubj);
      setCustomBody(rawBody);
      setSelectedTplId('custom');
    }

    if (plan.delivery && plan.delivery.audiences && recipients && recipients.length > 0) {
      const auds = plan.delivery.audiences;
      const matchedIds = [];
      recipients.forEach(r => {
        const fullName = `${r.first_name} ${r.last_name || ''}`.trim().toLowerCase();
        if (auds.some(a => typeof a === 'string' && (fullName.includes(a.toLowerCase()) || a.toLowerCase().includes(r.first_name.toLowerCase())))) {
          matchedIds.push(r.id);
        }
      });
      if (matchedIds.length > 0) {
        setTargetType('recipient');
        setSelectedRecipientIds(matchedIds);
        setSelectedRecipientId(matchedIds[0]);
      }
    }

    // Smart segment matching: try to match voice plan recipients to a known segment by name keyword
    if (segments && segments.length > 0) {
      const recipientHint = (plan.delivery?.audiences?.[0] || '').toLowerCase();
      let matchedSeg = null;

      if (recipientHint) {
        // Try exact name match first
        matchedSeg = segments.find(s => s.name.toLowerCase() === recipientHint);
        // Then try keyword-contains match (e.g. "farmers" matches segment "Farmers - Assam")
        if (!matchedSeg) {
          matchedSeg = segments.find(s =>
            s.name.toLowerCase().includes(recipientHint) ||
            recipientHint.includes(s.name.toLowerCase())
          );
        }
        // Try word-level match — e.g. "All Citizens" matches segment containing "citizens"
        if (!matchedSeg) {
          const words = recipientHint.split(/\s+/).filter(w => w.length > 3);
          matchedSeg = segments.find(s =>
            words.some(w => s.name.toLowerCase().includes(w))
          );
        }
      }

      // Fallback: pick first segment if no match found
      setSelectedSegId((matchedSeg || segments[0]).id);
    }
  };


  useEffect(() => {
    if (initialVoicePlan) {
      setViewMode('create');
      applyAiPlanToForm(initialVoicePlan);
      if (initialVoicePlan.user_confirmed) {
        setTimeout(() => {
          handlePublishCampaign(true);
        }, 400);
      }
      if (clearInitialVoicePlan) clearInitialVoicePlan();
    }
  }, [initialVoicePlan, clearInitialVoicePlan]);

  const [coPilotListening, setCoPilotListening] = useState(false);
  const coPilotListeningRef = useRef(false);
  const coPilotRecognitionRef = useRef(null);
  const coPilotSilenceTimerRef = useRef(null);

  useEffect(() => {
    coPilotListeningRef.current = coPilotListening;
  }, [coPilotListening]);

  const formatIndianTime = (dateStr) => {
    if (!dateStr) return '';
    let normalized = dateStr;
    if (typeof dateStr === 'string' && !dateStr.endsWith('Z') && !dateStr.includes('+')) {
      normalized = dateStr.replace(' ', 'T') + 'Z';
    }
    try {
      return new Date(normalized).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
    } catch (e) {
      return new Date(dateStr).toLocaleString();
    }
  };

  const getLangNameFromCode = (code) => {
    const map = {
      'en-IN': 'English',
      'hi-IN': 'Hindi',
      'ta-IN': 'Tamil',
      'te-IN': 'Telugu',
      'mr-IN': 'Marathi',
      'bn-IN': 'Bengali',
      'gu-IN': 'Gujarati',
      'kn-IN': 'Kannada',
      'ml-IN': 'Malayalam',
      'pa-IN': 'Punjabi',
      'or-IN': 'Odia',
      'ur-IN': 'Urdu',
      'as-IN': 'Assamese'
    };
    return map[code] || 'English';
  };

  const handleGenerateCampaignPlan = async (overridePrompt) => {
    const promptToUse = (typeof overridePrompt === 'string' && overridePrompt.trim()) ? overridePrompt.trim() : coPilotPrompt.trim();
    if (!promptToUse) return;
    setCoPilotLoading(true);
    setCoPilotError('');
    try {
      const response = await fetch(`${backendUrl}/api/ai/plan`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptToUse,
          category: coPilotCategory,
          target_language: getLangNameFromCode(coPilotLang)
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Failed to auto-plan campaign');
      if (data.error) throw new Error(data.error);

      setCoPilotHistory(prev => [
        {
          brief: promptToUse,
          category: coPilotCategory,
          plan: data,
          timestamp: new Date().toISOString()
        },
        ...prev
      ]);

      applyAiPlanToForm(data);
    } catch (err) {
      setCoPilotError(err.message);
    } finally {
      setCoPilotLoading(false);
    }
  };

  const startCoPilotListening = async () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser. Please use Google Chrome or Microsoft Edge.");
      return;
    }

    // Toggle off: if already listening, stop and return
    if (coPilotListening) {
      if (coPilotSilenceTimerRef.current) clearTimeout(coPilotSilenceTimerRef.current);
      if (coPilotRecognitionRef.current) {
        try { coPilotRecognitionRef.current.abort(); } catch (e) {}
        coPilotRecognitionRef.current = null;
      }
      setCoPilotListening(false);
      coPilotListeningRef.current = false;
      window.__commai_copilot_mic_active = false;
      return;
    }

    setCoPilotError('');

    // Step 1: Set global flag FIRST so wake-word listener won't restart and steal the mic
    window.__commai_copilot_mic_active = true;

    // Step 2: Kill Jarvis VoiceCommandCenter wake-word listener so it releases the mic hardware
    window.dispatchEvent(new CustomEvent('commai_stop_all_speech'));

    // Step 3: Verify mic permission exists (but do NOT hold the stream open — let WebSpeech manage it)
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Release immediately — we only needed to trigger the permission prompt
        stream.getTracks().forEach(track => track.stop());
      }
    } catch (permErr) {
      console.warn('[Co-Pilot Mic] Microphone permission denied:', permErr);
      setCoPilotError('Microphone access denied. Please click the mic/lock icon near your browser address bar and select "Allow Microphone".');
      setCoPilotListening(false);
      window.__commai_copilot_mic_active = false;
      return;
    }

    // Step 4: Longer delay to let the hardware mic fully release from Jarvis/getUserMedia before WebSpeech claims it
    await new Promise(resolve => setTimeout(resolve, 600));

    // Step 5: Set listening state BEFORE starting recognition so ref is up-to-date for onend restart logic
    setCoPilotListening(true);
    coPilotListeningRef.current = true;

    // Step 6: Initialize WebSpeech SpeechRecognition with continuous auto-restart loop
    const createAndStartRecognition = () => {
      // Guard: if user toggled off while we were setting up, bail out
      if (!coPilotListeningRef.current) {
        setCoPilotListening(false);
        window.__commai_copilot_mic_active = false;
        return;
      }

      try {
        const recognition = new SpeechRecognition();
        recognition.lang = coPilotLang || 'en-IN';
        recognition.interimResults = true;
        recognition.continuous = true;
        recognition.maxAlternatives = 1;

        let fullTranscript = '';
        let isManualStop = false;

        recognition.onstart = () => {
          console.log('[Co-Pilot Mic] Recognition started, mic is live. Lang:', recognition.lang);
        };

        recognition.onaudiostart = () => {
          console.log('[Co-Pilot Mic] Audio capture started — mic hardware is actively streaming audio.');
        };

        recognition.onresult = (event) => {
          let currentTranscript = '';
          for (let i = 0; i < event.results.length; i++) {
            currentTranscript += event.results[i][0].transcript;
          }

          console.log('[Co-Pilot Mic] onresult:', currentTranscript);

          if (currentTranscript.trim()) {
            fullTranscript = currentTranscript;
            setCoPilotPrompt(currentTranscript);
          }

          // Reset silence timer on every new speech input fragment
          if (coPilotSilenceTimerRef.current) {
            clearTimeout(coPilotSilenceTimerRef.current);
          }

          // Wait for 2.5 seconds of natural silence after speaking before generating the campaign plan
          coPilotSilenceTimerRef.current = setTimeout(() => {
            const finalPrompt = fullTranscript.trim();
            if (finalPrompt) {
              isManualStop = true;
              try { recognition.stop(); } catch (e) {}
              coPilotRecognitionRef.current = null;
              setCoPilotListening(false);
              coPilotListeningRef.current = false;
              window.__commai_copilot_mic_active = false;
              handleGenerateCampaignPlan(finalPrompt);
            }
          }, 2500);
        };

        recognition.onerror = (event) => {
          console.warn('[Co-Pilot Mic] Speech recognition error:', event.error, event.message);
          if (event.error === 'no-speech') {
            // Chrome fires this after ~5-8s of silence — ignore and let onend restart
            return;
          }
          if (event.error === 'aborted') {
            // Aborted intentionally (by us or browser), don't show error
            return;
          }
          if (event.error === 'not-allowed' || event.error === 'permission-denied') {
            setCoPilotError('Microphone permission blocked. Please click the mic/lock icon in your browser address bar and allow Microphone access.');
            setCoPilotListening(false);
            coPilotListeningRef.current = false;
            coPilotRecognitionRef.current = null;
            window.__commai_copilot_mic_active = false;
          } else if (event.error === 'audio-capture') {
            setCoPilotError('No microphone detected. Please connect a microphone to your device.');
            setCoPilotListening(false);
            coPilotListeningRef.current = false;
            coPilotRecognitionRef.current = null;
            window.__commai_copilot_mic_active = false;
          } else {
            console.error('[Co-Pilot Mic] Unexpected error:', event.error);
          }
        };

        recognition.onend = () => {
          console.log('[Co-Pilot Mic] onend fired. isManualStop:', isManualStop, 'listeningRef:', coPilotListeningRef.current);
          // If Chrome automatically closes recognition while user is still listening, create a fresh instance and restart
          if (coPilotListeningRef.current && !isManualStop) {
            setTimeout(() => {
              if (coPilotListeningRef.current) {
                console.log('[Co-Pilot Mic] Auto-restarting with fresh instance...');
                createAndStartRecognition();
              } else {
                window.__commai_copilot_mic_active = false;
              }
            }, 300);
          } else if (!coPilotListeningRef.current) {
            window.__commai_copilot_mic_active = false;
          }
        };

        coPilotRecognitionRef.current = recognition;
        recognition.start();
        console.log('[Co-Pilot Mic] recognition.start() called successfully.');
      } catch (err) {
        console.error('[Co-Pilot Mic] Exception starting recognition:', err);
        setCoPilotListening(false);
        coPilotListeningRef.current = false;
        coPilotRecognitionRef.current = null;
        window.__commai_copilot_mic_active = false;
        setCoPilotError(`Microphone access error: ${err.message || 'Permission denied or browser restricted'}`);
      }
    };

    createAndStartRecognition();
  };

  const handleRefineCampaignPlan = async (instructionText) => {
    if (!currentAiPlan || !instructionText.trim()) return;
    setRefineLoading(true);
    setCoPilotError('');
    try {
      const response = await fetch(`${backendUrl}/api/ai/plan/refine`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_plan: currentAiPlan,
          instruction: instructionText
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Failed to refine campaign plan');
      if (data.error) throw new Error(data.error);

      applyAiPlanToForm(data);
      setRefineInstruction('');
    } catch (err) {
      console.error(err);
      setCoPilotError(err.message);
    } finally {
      setRefineLoading(false);
    }
  };


  const campaignTypes = [
    { value: 'awareness_drive', label: 'Awareness Campaign' },
    { value: 'emergency_alert', label: 'Emergency Alert' },
    { value: 'educational_notification', label: 'Educational Bulletin' },
    { value: 'organizational_announcement', label: 'Organizational Announcement' }
  ];

  const channelsList = ["email", "sms", "push", "website", "telegram", "voice"];

  const aiTones = [
    { value: 'formal', label: 'Formal' },
    { value: 'urgent', label: 'Urgent' },
    { value: 'empathetic', label: 'Empathetic' },
    { value: 'simplified', label: 'Simplified' },
  ];
  const aiAudienceProfiles = [
    { value: 'general', label: 'General Public' },
    { value: 'healthcare_worker', label: 'Healthcare Workers' },
    { value: 'student', label: 'Students' },
    { value: 'rural_audience', label: 'Rural Audience' },
    { value: 'senior_citizen', label: 'Senior Citizens' },
  ];
  const aiCategories = ["emergency", "awareness", "education", "announcement"];

  const fetchCampaigns = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch(`${backendUrl}/api/campaigns`, { headers });
      if (!response.ok) throw new Error('Failed to load campaigns');
      const data = await response.json();
      setCampaigns(data);
    } catch (err) {
      console.error(err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [backendUrl, headers]);

  const fetchSegmentsAndTemplates = useCallback(async () => {
    try {
      const segRes = await fetch(`${backendUrl}/api/segments`, { headers });
      const tplRes = await fetch(`${backendUrl}/api/templates`, { headers });
      if (segRes.ok && tplRes.ok) {
        const segData = await segRes.json();
        const tplData = await tplRes.json();
        setSegments(segData);
        setTemplates(tplData);
        if (segData && segData.length > 0) {
          setSelectedSegId(prev => prev || segData[0].id);
        }
      }
      
      const recRes = await fetch(`${backendUrl}/api/audiences?limit=500`, { headers });
      if (recRes.ok) {
        const recData = await recRes.json();
        setRecipients(recData.results || []);
      }
    } catch (err) {
      console.error(err);
    }
  }, [backendUrl, headers]);

  useEffect(() => {
    if (viewMode === 'list') {
      fetchCampaigns(false);
      const intervalId = setInterval(() => {
        fetchCampaigns(true);
      }, 8000);
      return () => clearInterval(intervalId);
    } else {
      fetchSegmentsAndTemplates();
      if (!editingCampId && !initialVoicePlan && !currentAiPlan) {
        setStep(1);
        setFormTitle('');
        setFormDesc('');
        setFormObjective('');
        setFormType('awareness_drive');
        setSelectedSegId('');
        setSelectedTplId('');
        setSelectedChannels(['email']);
        setWizardError('');
        setEvalReach({ target: 0, reach: 0 });
        setSegmentPreviewUsers([]);
        setIsScheduled(false);
        setScheduledTime('');
        setTargetType('segment');
        setSelectedRecipientId('');
        
        // Clear Co-pilot states
        setCoPilotOpen(false);
        setCoPilotPrompt('');
        setCoPilotCategory('awareness_drive');
        setCoPilotLoading(false);
        setCoPilotError('');
        setCurrentAiPlan(null);
        setRefineInstruction('');
      }
    }
  }, [viewMode, backendUrl, editingCampId, fetchCampaigns, fetchSegmentsAndTemplates]);

  const configLanguages = ["English", "Hindi", "Assamese", "Bengali", "Bodo", "Dogri", "Gujarati", "Kannada", "Kashmiri", "Konkani", "Maithili", "Malayalam", "Manipuri", "Marathi", "Nepali", "Odia", "Punjabi", "Sanskrit", "Santali", "Sindhi", "Tamil", "Telugu", "Urdu"];

  // Insert placeholder at cursor position
  const handleInsertPlaceholder = (tag) => {
    const el = bodyTextareaRef.current;
    if (!el) {
      setCustomBody(prev => prev + tag);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const text = el.value;
    const before = text.substring(0, start);
    const after = text.substring(end, text.length);
    setCustomBody(before + tag + after);
    
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + tag.length, start + tag.length);
    }, 0);
  };

  const handleCustomTranslate = async () => {
    if (!customBody) return;
    setInlineTranslationLoading(true);
    setInlineTranslationError('');
    setInlineTranslationResult('');
    setInlineTranslationSubjectResult('');
    
    try {
      const response = await fetch(`${backendUrl}/api/translate`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: customBody,
          target_language: inlineTranslationLang,
          source_language: 'English'
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Body translation failed');
      
      setInlineTranslationResult(data.translated_text);
      
      const isEmail = selectedChannels.includes('email');
      if (isEmail && customSubject) {
        const subResponse = await fetch(`${backendUrl}/api/translate`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: customSubject,
            target_language: inlineTranslationLang,
            source_language: 'English'
          })
        });
        const subData = await subResponse.json();
        if (subResponse.ok) {
          setInlineTranslationSubjectResult(subData.translated_text);
        }
      }
    } catch (err) {
      setInlineTranslationError(err.message);
    } finally {
      setInlineTranslationLoading(false);
    }
  };

  const handleApplyCustomTranslation = () => {
    if (inlineTranslationResult) {
      setCustomBody(inlineTranslationResult);
    }
    if (inlineTranslationSubjectResult) {
      setCustomSubject(inlineTranslationSubjectResult);
    }
    setPreviewLang(inlineTranslationLang);
    setInlineTranslationResult('');
    setInlineTranslationSubjectResult('');
  };

  // Reset preview language whenever template changes
  useEffect(() => {
    if (selectedTplId === 'custom') {
      setPreviewLang('English');
      setPreviewTranslatedText('');
      return;
    }
    const activeTpl = templates.find(t => t.id === selectedTplId);
    if (activeTpl) {
      setPreviewLang(activeTpl.default_language);
      setPreviewTranslatedText('');
    }
  }, [selectedTplId, templates]);

  // Load template translation in real-time
  useEffect(() => {
    const fetchPreviewTranslation = async () => {
      if (selectedTplId === 'custom') {
        if (previewLang === 'English' || !customBody) {
          setPreviewTranslatedText('');
          return;
        }
        setPreviewLoading(true);
        try {
          const response = await fetch(`${backendUrl}/api/translate`, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: customBody,
              target_language: previewLang,
              source_language: 'English'
            })
          });
          const data = await response.json();
          if (response.ok) {
            setPreviewTranslatedText(data.translated_text);
          }
        } catch (e) {
          console.error(e);
        } finally {
          setPreviewLoading(false);
        }
        return;
      }

      const activeTpl = templates.find(t => t.id === selectedTplId);
      if (!activeTpl) {
        setPreviewTranslatedText('');
        return;
      }
      
      // Default to template's default language first
      if (previewLang === activeTpl.default_language) {
        setPreviewTranslatedText('');
        return;
      }
      
      // Check if translation is cached in database
      let parsed = {};
      try {
        parsed = typeof activeTpl.translations === 'string' ? JSON.parse(activeTpl.translations || '{}') : (activeTpl.translations || {});
      } catch {
        parsed = {};
      }
      
      if (parsed[previewLang] && parsed[previewLang].body) {
        setPreviewTranslatedText(parsed[previewLang].body);
        return;
      }
      
      // Not cached, fetch on-the-fly via API
      setPreviewLoading(true);
      try {
        const response = await fetch(`${backendUrl}/api/translate`, {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            text: activeTpl.body_template,
            target_language: previewLang,
            source_language: activeTpl.default_language
          })
        });
        const data = await response.json();
        if (response.ok) {
          setPreviewTranslatedText(data.translated_text);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setPreviewLoading(false);
      }
    };
    
    fetchPreviewTranslation();
  }, [previewLang, selectedTplId, templates, backendUrl, customBody, headers]);

  const evaluateReachMetrics = useCallback(async () => {
    if (!selectedSegId) return;
    setEvalLoading(true);
    try {
      const response = await fetch(`${backendUrl}/api/segments/${selectedSegId}/preview?limit=500`, { headers });
      if (!response.ok) throw new Error('Failed to preview reach');
      const data = await response.json();
      
      const targetCount = data.estimated_size;
      setSegmentPreviewUsers(data.preview || []);
      setEvalBreakdowns(data.breakdowns || {});
      
      let reachFactor = 1.0;
      if (selectedChannels.length === 1) {
        if (selectedChannels[0] === 'email') reachFactor = 0.65;
        else if (selectedChannels[0] === 'sms') reachFactor = 0.85;
        else reachFactor = 0.50;
      } else if (selectedChannels.length === 2) {
        reachFactor = 0.92;
      }
      
      const estimatedReach = Math.round(targetCount * reachFactor);
      setEvalReach({ target: targetCount, reach: overrideChannelPreferences ? targetCount : Math.min(targetCount, estimatedReach) });
    } catch (err) {
      console.error(err);
    } finally {
      setEvalLoading(false);
    }
  }, [backendUrl, headers, selectedSegId, selectedChannels, overrideChannelPreferences]);

  useEffect(() => {
    if (step === 2 && selectedSegId) {
      evaluateReachMetrics();
    }
  }, [selectedSegId, selectedChannels, step, evaluateReachMetrics]);

  const handleNextStep = async () => {
    if (step === 1) {
      if (!formTitle || !formObjective) {
        setWizardError('Campaign Title and Objective are mandatory fields');
        return;
      }
      if (isScheduled) {
        if (!scheduledTime) {
          setWizardError('Please select a valid future date and time for the schedule');
          return;
        }
        const schedDate = new Date(scheduledTime);
        if (schedDate <= new Date()) {
          setWizardError('Scheduled time must be in the future');
          return;
        }
      }
      setWizardError('');
      setStep(2);
    } else if (step === 2) {
      if (targetType === 'recipient') {
        const activeIds = selectedRecipientIds.length > 0 
          ? selectedRecipientIds 
          : (selectedRecipientId ? [selectedRecipientId] : []);

        if (activeIds.length === 0) {
          setWizardError('Please select at least one individual recipient');
          return;
        }
        
        const matchedRecipients = recipients.filter(r => activeIds.includes(r.id));
        if (matchedRecipients.length === 0) {
          setWizardError('Selected recipient(s) not found');
          return;
        }

        let expectedSegmentName = '';
        if (matchedRecipients.length === 1) {
          const rName = `${matchedRecipients[0].first_name} ${matchedRecipients[0].last_name || ''}`.trim();
          expectedSegmentName = `Direct: ${rName} (${matchedRecipients[0].id.substring(0, 8)})`;
        } else {
          const firstRName = `${matchedRecipients[0].first_name} ${matchedRecipients[0].last_name || ''}`.trim();
          expectedSegmentName = `Direct Group: ${firstRName} + ${matchedRecipients.length - 1} others (${matchedRecipients[0].id.substring(0, 6)})`;
        }
        
        const existingSeg = segments.find(s => s.name === expectedSegmentName);
        if (existingSeg) {
          setSelectedSegId(existingSeg.id);
        } else {
          setEvalLoading(true);
          try {
            const res = await fetch(`${backendUrl}/api/segments`, {
              method: 'POST',
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: expectedSegmentName,
                description: `Direct message target for ${matchedRecipients.length} recipient(s)`,
                filter_criteria: { ids: activeIds },
                is_dynamic: true
              })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Failed to create direct segment');
            
            setSegments(prev => [...prev, data]);
            setSelectedSegId(data.id);
          } catch (err) {
            setWizardError(err.message);
            setEvalLoading(false);
            return;
          } finally {
            setEvalLoading(false);
          }
        }
      } else {
        if (!selectedSegId) {
          setWizardError('Please select a target segment');
          return;
        }
      }

      if (selectedChannels.length === 0) {
        setWizardError('Select at least one delivery channel');
        return;
      }
      setWizardError('');
      setStep(3);
    } else if (step === 3) {
      if (!selectedTplId) {
        setWizardError('Please select or write a message template');
        return;
      }
      if (selectedTplId === 'custom' && !customBody) {
        setWizardError('Please write a custom message body');
        return;
      }
      setWizardError('');
      setStep(4);
    }
  };

  const handleSaveCampaignDraft = async () => {
    const payload = {
      title: formTitle,
      description: formDesc || null,
      objective: formObjective,
      campaign_type: formType,
      segment_id: selectedSegId || null,
      template_id: selectedTplId === 'custom' ? null : (selectedTplId || null),
      custom_subject: selectedTplId === 'custom' ? customSubject : null,
      custom_body: selectedTplId === 'custom' ? customBody : null,
      channel_preferences: selectedChannels,
      override_channel_preferences: overrideChannelPreferences,
      scheduled_at: null
    };

    try {
      const url = editingCampId 
        ? `${backendUrl}/api/campaigns/${editingCampId}`
        : `${backendUrl}/api/campaigns`;
      const method = editingCampId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'Failed to save campaign');
      }

      setEditingCampId(null);
      setViewMode('list');
    } catch (err) {
      setWizardError(err.message);
    }
  };

  const handlePublishCampaign = async (bypassConfirm = false) => {
    let activeSegId = selectedSegId;
    if (!activeSegId && segments && segments.length > 0) {
      activeSegId = segments[0].id;
      setSelectedSegId(activeSegId);
    }

    let activeTplId = selectedTplId || 'custom';

    const targetStatus = isScheduled ? 'scheduled' : 'active';
    const scheduleDateStr = isScheduled && scheduledTime ? new Date(scheduledTime).toLocaleString() : '';
    
    const reachCount = evalReach.reach || (targetType === 'recipient' ? (selectedRecipientId ? 1 : 0) : 0);
    const isEmergency = formType.includes('emergency') || formType === 'emergency_broadcast';
    const isManagerEscalation = user?.role !== 'admin' && (isEmergency || reachCount >= 100);

    if (!bypassConfirm) {
      let confirmMessage = '';
      if (isManagerEscalation) {
        confirmMessage = `🛡️ MAKER-CHECKER APPROVAL ESCALATION NOTICE:\n\nAs a Campaign Manager, launching a campaign reaching ${reachCount} citizen(s) or containing emergency advisories will submit it to the Admin Approvals Queue (pending_approval).\n\nDo you want to submit this campaign for Admin review?`;
      } else if (isScheduled) {
        confirmMessage = `⚠️ SCHEDULE CAMPAIGN:\n\nThis will schedule this campaign to trigger deliveries to approximately ${reachCount} citizen(s) via ${selectedChannels.join(', ').toUpperCase()} at ${scheduleDateStr}.\n\nDo you want to proceed?`;
      } else {
        confirmMessage = `⚠️ LAUNCH CAMPAIGN:\n\nLaunching this campaign will trigger REAL deliveries to approximately ${reachCount} citizen(s) via ${selectedChannels.join(', ').toUpperCase()}.\n\nDo you want to proceed?`;
      }

      if (!window.confirm(confirmMessage)) {
        return;
      }
    }

    const payload = {
      title: formTitle,
      description: formDesc || null,
      objective: formObjective,
      campaign_type: formType,
      segment_id: activeSegId,
      template_id: activeTplId === 'custom' ? null : (activeTplId || null),
      custom_subject: activeTplId === 'custom' ? customSubject : null,
      custom_body: activeTplId === 'custom' ? customBody : null,
      channel_preferences: selectedChannels,
      override_channel_preferences: overrideChannelPreferences,
      status: targetStatus,
      scheduled_at: isScheduled && scheduledTime ? new Date(scheduledTime).toISOString() : null
    };

    try {
      let targetId = editingCampId;

      if (!targetId) {
        const createRes = await fetch(`${backendUrl}/api/campaigns`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, status: 'draft' })
        });
        const createData = await createRes.json();
        if (!createRes.ok) {
          throw new Error(createData.detail || 'Failed to save initial draft');
        }
        targetId = createData.id;
      }

      const publishRes = await fetch(`${backendUrl}/api/campaigns/${targetId}`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const publishData = await publishRes.json();
      if (!publishRes.ok) {
        throw new Error(publishData.detail || 'Publishing failed');
      }

      setEditingCampId(null);
      setViewMode('list');

      // Set explicit outcome modal so operator clearly knows if it went live or to pending_approval!
      setPublishedResultModal({
        id: publishData.id,
        title: publishData.title,
        status: publishData.status,
        reach: publishData.estimated_reach || reachCount,
        scheduledAt: publishData.scheduled_at,
        isMakerChecker: publishData.status === 'pending_approval'
      });
    } catch (err) {
      setWizardError(err.message);
    }
  };

  const handleResumeEditCampaign = (camp) => {
    setFormTitle(camp.title);
    setFormDesc(camp.description || '');
    setFormObjective(camp.objective || '');
    setFormType(camp.campaign_type);
    setSelectedSegId(camp.segment_id || '');
    
    if (camp.custom_body) {
      setSelectedTplId('custom');
      setCustomSubject(camp.custom_subject || '');
      setCustomBody(camp.custom_body || '');
    } else {
      setSelectedTplId(camp.template_id || '');
      setCustomSubject('');
      setCustomBody('');
    }
    
    setSelectedChannels(camp.channel_preferences || ['email']);
    setOverrideChannelPreferences(!!camp.override_channel_preferences);
    setEditingCampId(camp.id);
    setIsScheduled(!!camp.scheduled_at);
    setScheduledTime(camp.scheduled_at ? camp.scheduled_at.substring(0, 16) : '');
    setViewMode('create');

    if (!camp.title || !camp.objective) {
      setStep(1);
    } else if (!camp.segment_id || !camp.channel_preferences || camp.channel_preferences.length === 0) {
      setStep(2);
    } else if (!camp.template_id) {
      setStep(3);
    } else {
      setStep(4);
    }
  };

  const handleOpenAuditModal = async (camp) => {
    setSelectedCampaignForAudit(camp);
    setShowAuditModal(true);
    setAuditLoading(true);
    try {
      const response = await fetch(`${backendUrl}/api/campaigns/${camp.id}/audit-logs`, { headers });
      if (!response.ok) throw new Error('Failed to fetch audit logs');
      const data = await response.json();
      setAuditLogs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setAuditLoading(false);
    }
  };

  const handleOpenDeliveryModal = async (camp) => {
    setSelectedCampaignForDelivery(camp);
    setShowDeliveryModal(true);
    setDeliveryLoading(true);
    
    const fetchDeliveryData = async () => {
      try {
        const sumRes = await fetch(`${backendUrl}/api/campaigns/${camp.id}/delivery-summary`, { headers });
        const logRes = await fetch(`${backendUrl}/api/campaigns/${camp.id}/delivery-logs`, { headers });
        if (sumRes.ok && logRes.ok) {
          const sumData = await sumRes.json();
          const logData = await logRes.json();
          setDeliverySummary(sumData);
          setDeliveryLogs(logData);
          
          if (sumData.status === 'active') {
            return true; // Keep polling
          }
        }
      } catch (err) {
        console.error('Error fetching delivery report:', err);
      }
      return false; // Stop polling
    };

    const isSending = await fetchDeliveryData();
    setDeliveryLoading(false);

    if (isSending) {
      if (window.activeDeliveryInterval) {
        clearInterval(window.activeDeliveryInterval);
      }
      const interval = setInterval(async () => {
        const keepPolling = await fetchDeliveryData();
        if (!keepPolling) {
          clearInterval(interval);
          window.activeDeliveryInterval = null;
          fetchCampaigns();
        }
      }, 2500);
      window.activeDeliveryInterval = interval;
    }
  };

  const handleCloseDeliveryModal = () => {
    setShowDeliveryModal(false);
    setSelectedCampaignForDelivery(null);
    setDeliverySummary(null);
    setDeliveryLogs([]);
    if (window.activeDeliveryInterval) {
      clearInterval(window.activeDeliveryInterval);
      window.activeDeliveryInterval = null;
    }
    fetchCampaigns();
  };


  const renderAuditChanges = (changesStr) => {
    if (!changesStr) return null;
    try {
      const changes = JSON.parse(changesStr);
      return (
        <div style={{ marginTop: '6px', fontSize: '0.85rem', color: 'hsl(var(--text-secondary))', background: 'rgba(0,0,0,0.15)', padding: '6px 10px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.02)' }}>
          {Object.keys(changes).map(field => {
            const val = changes[field];
            return (
              <div key={field} style={{ marginBottom: '2px' }}>
                <span style={{ fontFamily: 'monospace', color: 'hsl(var(--primary))' }}>{field}</span>: {' '}
                <span style={{ textDecoration: 'line-through', opacity: 0.6 }}>{String(val.old)}</span>{' '}
                ➜ <strong>{String(val.new)}</strong>
              </div>
            );
          })}
        </div>
      );
    } catch {
      return <span style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))' }}>{changesStr}</span>;
    }
  };

  const handleDeleteCampaign = async (id) => {
    if (!window.confirm('Are you sure you want to soft delete this campaign?')) return;
    try {
      const response = await fetch(`${backendUrl}/api/campaigns/${id}`, {
        method: 'DELETE',
        headers
      });
      if (!response.ok) throw new Error('Failed to delete campaign');
      fetchCampaigns();
    } catch (err) {
      alert(err.message);
    }
  };

  const overlayTextOnPoster = (imageUrl, titleText, descText, catText, langText) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = imageUrl;
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');
        
        // 1. Draw original AI background image
        ctx.drawImage(img, 0, 0, 1024, 1024);
        
        // 2. Draw styled glassmorphism panel at the bottom
        const cardX = 40;
        const cardY = 660;
        const cardW = 944;
        const cardH = 320;
        
        ctx.fillStyle = "rgba(10, 12, 22, 0.92)"; 
        ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
        ctx.lineWidth = 3;
        
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(cardX, cardY, cardW, cardH, 20);
        } else {
          ctx.rect(cardX, cardY, cardW, cardH);
        }
        ctx.fill();
        ctx.stroke();
        
        // 3. Accent indicator bar
        ctx.fillStyle = "hsl(190, 90%, 50%)"; // cyan
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(cardX + 25, cardY + 30, 6, 45, 3);
        } else {
          ctx.rect(cardX + 25, cardY + 30, 6, 45);
        }
        ctx.fill();
        
        // 4. Header Category Tag
        ctx.font = "bold 20px 'Segoe UI', Arial, sans-serif";
        ctx.fillStyle = "hsl(190, 90%, 50%)";
        ctx.fillText(`${catText.toUpperCase()} ADVISORY • ${langText.toUpperCase()}`, cardX + 45, cardY + 60);
        
        // 5. Title Text
        ctx.font = "bold 38px 'Segoe UI', Arial, sans-serif";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(titleText, cardX + 25, cardY + 115);
        
        // 6. Message Body text wrapping function
        ctx.font = "normal 22px 'Segoe UI', Arial, sans-serif";
        ctx.fillStyle = "#cbd5e1"; // text-slate-300
        
        const wrapText = (context, text, x, y, maxWidth, lineHeight) => {
          const words = text.split(' ');
          let line = '';
          let currentY = y;
          for (let n = 0; n < words.length; n++) {
            let testLine = line + words[n] + ' ';
            let metrics = context.measureText(testLine);
            let testWidth = metrics.width;
            if (testWidth > maxWidth && n > 0) {
              context.fillText(line, x, currentY);
              line = words[n] + ' ';
              currentY += lineHeight;
            } else {
              line = testLine;
            }
          }
          context.fillText(line, x, currentY);
        };
        
        wrapText(ctx, descText, cardX + 25, cardY + 175, cardW - 50, 32);
        
        try {
          const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
          resolve(dataUrl);
        } catch (e) {
          console.error("Failed to generate data URL from canvas:", e);
          resolve(imageUrl); // fallback
        }
      };
      
      img.onerror = () => {
        resolve(imageUrl); // fallback
      };
    });
  };

  const handleGenerateCampaignPoster = async () => {
    if (!formTitle.trim()) return;
    const posterDesc = customBody || formDesc || formObjective || "Public awareness notice warning.";
    const posterCat = formType === 'emergency_alert' ? 'emergency' : 'awareness';
    
    if (setAutofillPosterData && setActiveTab) {
      setAutofillPosterData({
        title: formTitle,
        description: posterDesc,
        category: posterCat,
        tone: inlinePosterTone,
        language: inlinePosterLanguage
      });
      setActiveTab('poster_studio');
    }
  };

  const toggleChannelSelection = (ch) => {
    setSelectedChannels(prev => 
      prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch]
    );
  };

  const interpolateTemplate = (templateText, audience) => {
    if (!templateText) return "";
    const replacements = audience ? {
      "first_name": audience.first_name || "",
      "last_name": audience.last_name || "",
      "email": audience.email || "",
      "phone": audience.phone || "",
      "city": audience.city || "",
      "district": audience.district || "",
      "state": audience.state || "",
      "occupation": audience.occupation || "",
      "age": String(audience.age || ""),
      "gender": audience.gender || "",
      "organization": audience.organization || "National Informatics Centre",
      "department": audience.department || "Information Technology",
      "designation": audience.designation || "",
    } : {
      "first_name": "Suresh",
      "last_name": "Patil",
      "email": "suresh.patil@ruralmail.in",
      "phone": "9900112233",
      "city": "Varanasi",
      "district": "Varanasi",
      "state": "Uttar Pradesh",
      "occupation": "Farmer",
      "age": "45",
      "gender": "Male",
      "organization": "Rural Welfare Cooperative",
      "department": "Agriculture Advisory",
      "designation": "Regional Advisor"
    };

    let result = templateText;
    Object.keys(replacements).forEach(key => {
      const val = replacements[key];
      result = result.split(`{{${key}}}`).join(val);
      result = result.split(`{${key}}`).join(val);
    });
    return result;
  };

  const renderCampaignMockup = () => {
    const activeTpl = templates.find(t => t.id === selectedTplId);
    if (!activeTpl && selectedTplId !== 'custom') return <p style={{ color: 'hsl(var(--text-muted))', padding: '16px 0', fontWeight: '500' }}>Select a template to view preview.</p>;

    const previewUser = segmentPreviewUsers.length > 0 ? segmentPreviewUsers[0] : null;
    
    let rawBody = "";
    let rawSubject = "";
    
    if (selectedTplId === 'custom') {
      rawBody = previewTranslatedText || customBody;
      rawSubject = customSubject || "";
    } else {
      rawBody = previewTranslatedText || activeTpl.body_template;
      rawSubject = activeTpl.subject_template || '';
      if (previewTranslatedText) {
        let parsed = {};
        try {
          parsed = typeof activeTpl.translations === 'string' ? JSON.parse(activeTpl.translations || '{}') : (activeTpl.translations || {});
        } catch {
          parsed = {};
        }
        if (parsed[previewLang] && parsed[previewLang].subject) {
          rawSubject = parsed[previewLang].subject;
        }
      }
    }
    
    const body = interpolateTemplate(rawBody, previewUser);
    const subject = interpolateTemplate(rawSubject, previewUser);
    const recipientEmail = previewUser?.email || "suresh.patil@ruralmail.in";

    const chType = selectedTplId === 'custom' 
      ? (selectedChannels.length > 0 ? selectedChannels[0] : 'email')
      : activeTpl.channel;

    const isMobileChannel = ['sms', 'push', 'telegram'].includes(chType);

    if (chType === 'email') {
      return (
        <div className="email-mockup animate-fade-in" style={{ flexGrow: 1, minHeight: '220px', borderRadius: '16px', border: '1px solid var(--border-color-glass)' }}>
          <div className="email-browser-bar" style={{ padding: '12px 20px' }}>
            <div className="email-dots">
              <div className="email-dot red" style={{ width: '10px', height: '10px' }}></div>
              <div className="email-dot yellow" style={{ width: '10px', height: '10px' }}></div>
              <div className="email-dot green" style={{ width: '10px', height: '10px' }}></div>
            </div>
            <div className="email-address-bar" style={{ padding: '5px 14px', borderRadius: '8px', maxWidth: '500px' }}>
              <svg className="svg-icon" style={{ width: '13px', height: '13px', marginRight: '8px', color: 'hsl(var(--primary))' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              {recipientEmail}
            </div>
          </div>
          <div className="email-content-wrapper" style={{ padding: '24px' }}>
            <div className="email-headers" style={{ gap: '10px', paddingBottom: '16px' }}>
              {rawSubject && (
                <div className="email-header-line">
                  <span className="email-header-label" style={{ width: '70px', fontWeight: '700' }}>Subject:</span>
                  <span className="email-header-val" style={{ fontWeight: '700', color: 'hsl(var(--text-primary))' }}>{subject}</span>
                </div>
              )}
              <div className="email-header-line">
                <span className="email-header-label" style={{ width: '70px', fontWeight: '700' }}>From:</span>
                <span className="email-header-val">Alert Portal &lt;announcements@comm.gov.in&gt;</span>
              </div>
            </div>
            <div className="email-body-text" style={{ whiteSpace: 'pre-wrap', padding: '16px', background: 'rgba(255,255,255,0.01)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.03)', color: 'hsl(var(--text-secondary))', lineHeight: '1.6' }}>{body}</div>
          </div>
        </div>
      );
    }

    if (isMobileChannel) {
      if (chType === 'push') {
        return (
          <div className="phone-mockup animate-fade-in" style={{ height: '220px', width: '100%', minHeight: 'auto', borderBottomWidth: '11px', borderRadius: '24px' }}>
            <div className="phone-status-bar" style={{ background: 'transparent', height: '26px', padding: '8px 20px 0 20px' }}>
              <span style={{ fontWeight: '700' }}>10:42 AM</span>
              <span>📶 🔋</span>
            </div>
            <div className="phone-lockscreen" style={{ background: 'linear-gradient(180deg, #0a0b12 0%, #030407 100%)', padding: '20px 16px' }}>
              <div className="push-notification-card" style={{ padding: '12px 14px', borderRadius: '14px' }}>
                <div className="push-icon" style={{ borderRadius: '8px', width: '22px', height: '22px' }}>
                  <svg className="svg-icon" style={{ width: '13px', height: '13px', color: '#fff' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                </div>
                <div className="push-details">
                  <div className="push-header">
                    <span style={{ fontWeight: '800', letterSpacing: '0.04em' }}>COMMUNICATIONS SYSTEM</span>
                    <span>now</span>
                  </div>
                  <div className="push-title" style={{ fontSize: '0.8rem', fontWeight: '700', color: '#fff' }}>{formTitle || "Awareness advisory"}</div>
                  <div className="push-body" style={{ fontSize: '0.75rem', lineHeight: '1.4', color: 'rgba(255,255,255,0.85)' }}>{body}</div>
                </div>
              </div>
            </div>
          </div>
        );
      }

      if (chType === 'telegram') {
        return (
          <div className="phone-mockup animate-fade-in" style={{ height: '260px', width: '100%', minHeight: 'auto', borderBottomWidth: '11px', borderRadius: '24px' }}>
            <div className="phone-status-bar" style={{ height: '26px', padding: '8px 20px 0 20px' }}>
              <span style={{ fontWeight: '700' }}>10:42 AM</span>
              <span>📶 🔋</span>
            </div>
            <div className="phone-screen">
              <div className="phone-app-header" style={{ height: '42px', padding: '0 16px', gap: '10px', background: '#2481cc', display: 'flex', alignItems: 'center' }}>
                <div className="phone-avatar" style={{ width: '24px', height: '24px', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}>
                  <span style={{ fontSize: '0.75rem' }}>📢</span>
                </div>
                <div className="phone-header-info" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                  <div className="phone-header-title" style={{ fontSize: '0.85rem', fontWeight: '700', color: '#fff', lineHeight: 1 }}>Gov Alert Bot</div>
                  <div className="phone-header-subtitle" style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.7)', marginTop: '2px' }}>bot</div>
                </div>
              </div>
              <div className="phone-chat-bg" style={{ background: '#0e1621', padding: '10px', height: 'calc(100% - 42px)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', overflow: 'hidden' }}>
                <div style={{
                  background: '#182533',
                  color: '#f5f5f5',
                  padding: '10px 14px',
                  borderRadius: '14px 14px 14px 0px',
                  maxWidth: '85%',
                  fontSize: '0.8rem',
                  lineHeight: '1.4',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                  margin: '6px 0',
                  textAlign: 'left'
                }}>
                  {body}
                  <div style={{ textAlign: 'right', fontSize: '0.6rem', color: '#7f91a4', marginTop: '6px' }}>10:42 AM</div>
                </div>
              </div>
            </div>
          </div>
        );
      }

      const isWA = chType === 'whatsapp';
      const bubbleClass = isWA ? 'whatsapp-style' : 'sms-style';
      const senderName = isWA ? 'CommAI alert System' : 'Gov-Alert';

      return (
        <div className="phone-mockup animate-fade-in" style={{ height: '260px', width: '100%', minHeight: 'auto', borderBottomWidth: '11px', borderRadius: '24px' }}>
          <div className="phone-status-bar" style={{ height: '26px', padding: '8px 20px 0 20px' }}>
            <span style={{ fontWeight: '700' }}>10:42 AM</span>
            <span>📶 🔋</span>
          </div>
          <div className="phone-screen">
            <div className="phone-app-header" style={{ height: '42px', padding: '0 16px', gap: '10px' }}>
              <div className="phone-avatar" style={{ width: '24px', height: '24px', background: isWA ? 'hsl(var(--accent))' : 'hsl(var(--secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {isWA ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '13px', height: '13px', color: '#fff' }}>
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '13px', height: '13px', color: '#fff' }}>
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                )}
              </div>
              <div className="phone-contact-name">
                <span style={{ fontWeight: '700', fontSize: '0.78rem' }}>{senderName}</span>
                {isWA && <span className="phone-contact-status" style={{ fontSize: '0.6rem' }}>Online</span>}
              </div>
            </div>
            <div className={`phone-body ${isWA ? 'whatsapp' : ''}`} style={{ justifyContent: 'flex-start', padding: '12px' }}>
              <div className={`phone-bubble ${bubbleClass}`} style={{ padding: '8px 12px', fontSize: '0.78rem', borderTopLeftRadius: '0px', borderTopRightRadius: '12px', borderBottomRightRadius: '12px', borderBottomLeftRadius: '12px', boxShadow: '0 1px 2px rgba(0,0,0,0.15)' }}>
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.45' }}>{body}</div>
                <div className="phone-bubble-time" style={{ fontSize: '0.6rem', textAlign: 'right', marginTop: '4px', opacity: 0.7 }}>10:42 AM</div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Website toast mockup
    return (
      <div className="email-mockup animate-fade-in" style={{ flexGrow: 1, minHeight: '180px', borderRadius: '16px', border: '1px solid var(--border-color-glass)' }}>
        <div className="email-browser-bar" style={{ padding: '12px 20px' }}>
          <div className="email-dots">
            <div className="email-dot red" style={{ width: '10px', height: '10px' }}></div>
            <div className="email-dot yellow" style={{ width: '10px', height: '10px' }}></div>
            <div className="email-dot green" style={{ width: '10px', height: '10px' }}></div>
          </div>
          <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>https://comm-ai-nine.vercel.app/</span>
        </div>
        <div className="email-content-wrapper" style={{ background: 'rgba(5, 7, 15, 0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div className="website-toast-mockup" style={{ margin: 0, width: '100%', border: '1px solid hsl(var(--primary) / 25%)', padding: '16px', borderRadius: '12px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '6px' }}>
              <svg className="svg-icon" style={{ width: '14px', height: '14px', color: 'hsl(var(--primary))' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              <strong style={{ fontSize: '0.7rem', color: 'hsl(var(--primary))', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Public Security Advisory</strong>
            </div>
            <div style={{ fontSize: '0.82rem', color: '#f1f5f9', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>{body}</div>
          </div>
        </div>
      </div>
    );
  };

  const renderTemplatePreview = () => {
    return renderCampaignMockup();
  };

  const getCampaignTypeLabel = (val) => {
    const item = campaignTypes.find(c => c.value === val);
    return item ? item.label : val;
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'draft':
        return <span className="badge badge-manager">Draft</span>;
      case 'completed':
        return <span className="badge badge-communicator">Completed</span>;
      case 'active':
        return <span className="badge badge-admin" style={{ background: 'hsl(142, 60%, 45%)', color: '#fff' }}>Active</span>;
      case 'scheduled':
        return <span className="badge" style={{ background: 'hsl(271, 76%, 53%)', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 'bold' }}>Scheduled</span>;
      case 'pending_approval':
        return <span className="badge" style={{ background: 'hsl(35, 92%, 50%)', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 'bold' }}>Pending Approval</span>;
      case 'pending_review':
        return <span className="badge" style={{ background: 'hsl(27, 90%, 55%)', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 'bold' }}>Pending Review</span>;
      case 'cancelled':
        return <span className="badge" style={{ background: 'hsl(0, 0%, 40%)', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 'bold' }}>Cancelled</span>;
      default:
        return <span className="badge badge-admin">{status}</span>;
    }
  };

  const filteredCampaigns = campaigns.filter(c => {
    if (listTab === 'all') return true;
    if (listTab === 'ongoing') return c.status === 'active' || c.status === 'scheduled';
    if (listTab === 'pending') return c.status === 'pending_approval' || c.status === 'pending_review';
    if (listTab === 'past') return c.status === 'completed';
    if (listTab === 'drafts') return c.status === 'draft';
    if (listTab === 'cancelled') return c.status === 'cancelled';
    return true;
  });

  return (
    <div className="animate-fade-in">
      <div className="campaigns-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <p style={{ color: 'hsl(var(--text-secondary))', margin: 0 }}>Create, target, and monitor public awareness and emergency announcements.</p>
        </div>
        <div>
          {viewMode === 'list' ? (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                type="button"
                className="btn btn-dark" 
                onClick={() => fetchCampaigns(false)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                title="Manually refresh campaigns database"
              >
                🔄 Refresh
              </button>
              <button 
                type="button"
                className="btn btn-primary" 
                onClick={() => { setEditingCampId(null); setViewMode('create'); }} 
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '1rem', height: '1rem' }}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Plan New Campaign
              </button>
            </div>
          ) : (
            <button className="btn btn-dark" onClick={() => setViewMode('list')}>
              Cancel Wizard
            </button>
          )}
        </div>
      </div>

      {viewMode === 'list' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Tabs Filter Header */}
          <div className="campaigns-filter-tabs" style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color-glass)', paddingBottom: '8px', flexWrap: 'wrap' }}>
            <button 
              className={`btn ${listTab === 'all' ? 'btn-primary' : 'btn-dark'}`}
              style={{ padding: '8px 16px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              onClick={() => setListTab('all')}
            >
              All Campaigns ({campaigns.length})
            </button>
            <button 
              className={`btn ${listTab === 'ongoing' ? 'btn-primary' : 'btn-dark'}`}
              style={{ padding: '8px 16px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              onClick={() => setListTab('ongoing')}
            >
              🔄 Ongoing ({campaigns.filter(c => c.status === 'active' || c.status === 'scheduled').length})
            </button>
            <button 
              className={`btn ${listTab === 'pending' ? 'btn-primary' : 'btn-dark'}`}
              style={{ padding: '8px 16px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              onClick={() => setListTab('pending')}
            >
              ⏳ Pending Approvals ({campaigns.filter(c => c.status === 'pending_approval' || c.status === 'pending_review').length})
            </button>
            <button 
              className={`btn ${listTab === 'past' ? 'btn-primary' : 'btn-dark'}`}
              style={{ padding: '8px 16px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              onClick={() => setListTab('past')}
            >
              ✅ Past / Completed ({campaigns.filter(c => c.status === 'completed').length})
            </button>
            <button 
              className={`btn ${listTab === 'drafts' ? 'btn-primary' : 'btn-dark'}`}
              style={{ padding: '8px 16px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              onClick={() => setListTab('drafts')}
            >
              📝 Drafts ({campaigns.filter(c => c.status === 'draft').length})
            </button>
            <button 
              className={`btn ${listTab === 'cancelled' ? 'btn-primary' : 'btn-dark'}`}
              style={{ padding: '8px 16px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              onClick={() => setListTab('cancelled')}
            >
              🚫 Cancelled ({campaigns.filter(c => c.status === 'cancelled').length})
            </button>
          </div>

          <GlassCard>
            <div className="table-container">
              {loading ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'hsl(var(--text-secondary))' }}>
                  Fetching campaign database...
                </div>
              ) : campaigns.length === 0 ? (
                <p style={{ color: 'hsl(var(--text-muted))', textAlign: 'center', padding: '32px' }}>
                  No active or draft campaigns planned. Create one above!
                </p>
              ) : (
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40%', minWidth: '240px' }}>Campaign Info</th>
                      <th style={{ width: '12%', minWidth: '120px' }}>Audience Metrics</th>
                      <th style={{ width: '10%', minWidth: '100px' }}>Channels</th>
                      <th style={{ width: '12%', minWidth: '120px' }}>Type</th>
                      <th style={{ width: '10%', minWidth: '110px' }}>Status</th>
                      <th style={{ width: '10%', minWidth: '100px' }}>Created At</th>
                      <th style={{ width: '6%', minWidth: '80px' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCampaigns.map(camp => (
                      <tr key={camp.id} style={{ position: 'relative', overflow: 'visible' }}>
                        <td style={{ position: 'relative', overflow: 'visible' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
                            <strong 
                              title={camp.description || camp.objective}
                              style={{ 
                                fontSize: '0.94rem', 
                                color: 'hsl(var(--text-primary))', 
                                cursor: 'help',
                                marginBottom: '6px',
                                display: 'inline-block'
                              }}
                            >
                              {camp.title}
                            </strong>
                            {camp.review_remark && camp.status === 'rejected' && (
                              <div style={{
                                marginTop: '6px',
                                padding: '8px 12px',
                                borderRadius: '8px',
                                background: 'rgba(239, 68, 68, 0.1)',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                color: '#fca5a5',
                                fontSize: '0.78rem',
                                lineHeight: '1.4'
                              }}>
                                <strong style={{ color: '#ef4444', display: 'block', marginBottom: '2px' }}>❌ Admin Rejection Feedback:</strong>
                                "{camp.review_remark}"
                              </div>
                            )}
                            <VoiceBulletinPlayer
                              text={`${camp.title}. ${camp.description || camp.objective || ''}`}
                              campaignId={camp.id}
                              userPreferredLang={camp.default_language || camp.language || user?.preferred_languages?.[0] || 'Hindi'}
                              backendUrl={backendUrl}
                              compact={true}
                            />
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', fontSize: '0.8rem' }}>
                            <span>Target: <strong>{camp.target_audience_count}</strong></span>
                            <span style={{ color: 'hsl(var(--text-muted))' }}>Est. Reach: {camp.estimated_reach}</span>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {camp.channel_preferences.map(ch => (
                              <span key={ch} style={{ fontSize: '0.72rem', padding: '2px 8px', background: 'var(--border-color-glass)', borderRadius: '100px', textTransform: 'uppercase', color: 'hsl(var(--text-secondary))' }}>
                                {ch}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>
                          <span style={{ fontSize: '0.8rem' }}>{getCampaignTypeLabel(camp.campaign_type)}</span>
                        </td>
                        <td>{getStatusBadge(camp.status)}</td>
                        <td style={{ fontSize: '0.78rem', color: 'hsl(var(--text-muted))' }}>
                          {camp.status === 'scheduled' && camp.scheduled_at ? (
                            <div>
                              <span style={{ fontSize: '0.72rem', display: 'block', color: 'hsl(var(--primary))', fontWeight: 'bold' }}>⏰ Scheduled (IST):</span>
                              {formatIndianTime(camp.scheduled_at)}
                            </div>
                          ) : (
                            formatIndianTime(camp.created_at)
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            {camp.status === 'draft' && (
                              <button 
                                className="btn btn-primary" 
                                style={{
                                  padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '4px',
                                  background: camp.review_remark ? 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)' : undefined,
                                  borderColor: camp.review_remark ? '#ef4444' : undefined,
                                  color: '#fff', fontWeight: 600
                                }} 
                                onClick={() => handleResumeEditCampaign(camp)}
                                title={camp.review_remark ? "Revise rejected draft and resubmit for approval" : "Resume Stepper Wizard"}
                              >
                                <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '0.9rem', height: '0.9rem' }}>
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                                <span style={{ fontSize: '0.8rem' }}>{camp.review_remark ? '✏️ Revise & Resubmit' : 'Resume'}</span>
                              </button>
                            )}
                            {camp.status === 'scheduled' && (
                              <button 
                                className="btn btn-dark" 
                                style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '4px' }} 
                                onClick={async () => {
                                  if (window.confirm("Are you sure you want to cancel this scheduled campaign and return it to draft status?")) {
                                    try {
                                      const res = await fetch(`${backendUrl}/api/campaigns/${camp.id}`, {
                                        method: 'PUT',
                                        headers: { ...headers, 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ status: 'draft' })
                                      });
                                      if (res.ok) {
                                        fetchCampaigns();
                                      } else {
                                        const err = await res.json();
                                        alert(err.detail || "Failed to unschedule campaign");
                                      }
                                    } catch (err) {
                                      alert(err.message);
                                    }
                                  }
                                }}
                                title="Cancel schedule and edit draft"
                              >
                                <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '0.9rem', height: '0.9rem' }}>
                                  <circle cx="12" cy="12" r="10" />
                                  <line x1="8" y1="12" x2="16" y2="12" />
                                </svg>
                                <span style={{ fontSize: '0.8rem' }}>Unschedule</span>
                              </button>
                            )}
                            {camp.status === 'pending_approval' && (
                              <div style={{ display: 'flex', gap: '4px' }}>
                                {user.role === 'admin' ? (
                                  <>
                                    <button 
                                      className="btn btn-primary" 
                                      style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(16, 185, 129, 0.2)', border: '1px solid rgba(16, 185, 129, 0.4)', color: '#10b981' }} 
                                      onClick={async () => {
                                        if (window.confirm("Approve this campaign for immediate launch or scheduling?")) {
                                          try {
                                            const res = await fetch(`${backendUrl}/api/campaigns/${camp.id}/approve`, {
                                              method: 'POST',
                                              headers
                                            });
                                            if (res.ok) {
                                              fetchCampaigns();
                                            } else {
                                              const err = await res.json();
                                              alert(err.detail || "Approval failed");
                                            }
                                          } catch (err) {
                                            alert(err.message);
                                          }
                                        }
                                      }}
                                    >
                                      Approve
                                    </button>
                                    <button 
                                      className="btn btn-danger" 
                                      style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#ef4444' }} 
                                      onClick={async () => {
                                        const reason = window.prompt("Enter rejection reason:");
                                        if (reason !== null) {
                                          try {
                                            const res = await fetch(`${backendUrl}/api/campaigns/${camp.id}/reject`, {
                                              method: 'POST',
                                              headers: { ...headers, 'Content-Type': 'application/json' },
                                              body: JSON.stringify({ reason })
                                            });
                                            if (res.ok) {
                                              fetchCampaigns();
                                            } else {
                                              const err = await res.json();
                                              alert(err.detail || "Rejection failed");
                                            }
                                          } catch (err) {
                                            alert(err.message);
                                          }
                                        }
                                      }}
                                    >
                                      Reject
                                    </button>
                                  </>
                                ) : (
                                  <span style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))', padding: '6px', fontStyle: 'italic' }}>
                                    Awaiting Admin
                                  </span>
                                )}
                              </div>
                            )}
                            <button 
                              className="btn btn-dark" 
                              style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '4px' }} 
                              onClick={() => handleOpenAuditModal(camp)}
                              title="View Audit History Logs"
                            >
                              <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '0.9rem', height: '0.9rem' }}>
                                <circle cx="12" cy="12" r="10" />
                                <polyline points="12 6 12 12 16 14" />
                              </svg>
                              <span style={{ fontSize: '0.8rem' }}>Logs</span>
                            </button>
                            {(camp.status === 'active' || camp.status === 'completed') && (
                              <button 
                                className="btn btn-primary" 
                                style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(0, 188, 212, 0.2)', border: '1px solid rgba(0, 188, 212, 0.4)', color: '#00e5ff' }} 
                                onClick={() => handleOpenDeliveryModal(camp)}
                                title="View Real-Time Delivery Report & Logs"
                              >
                                <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '0.9rem', height: '0.9rem' }}>
                                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                                </svg>
                                <span style={{ fontSize: '0.8rem' }}>Report</span>
                              </button>
                            )}
                            {camp.failed_count > 0 && (
                              <button 
                                className="btn btn-warning" 
                                style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(245, 158, 11, 0.2)', border: '1px solid rgba(245, 158, 11, 0.4)', color: '#f59e0b' }} 
                                onClick={async () => {
                                  if (window.confirm(`Retry failed deliveries for "${camp.title}"?`)) {
                                    try {
                                      const res = await fetch(`${backendUrl}/api/campaigns/${camp.id}/retry-failed`, {
                                        method: 'POST',
                                        headers
                                      });
                                      if (res.ok) {
                                        const data = await res.json();
                                        alert(data.message || "Retry initiated!");
                                        fetchCampaigns();
                                      } else {
                                        const err = await res.json();
                                        alert(err.detail || "Retry failed");
                                      }
                                    } catch (err) {
                                      alert(err.message);
                                    }
                                  }
                                }}
                                title="Retry delivery for failed recipients"
                              >
                                <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '0.9rem', height: '0.9rem' }}>
                                  <path d="M23 4v6h-6" />
                                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                                </svg>
                                <span style={{ fontSize: '0.8rem' }}>Retry ({camp.failed_count})</span>
                              </button>
                            )}
                            <button 

                              className="btn btn-danger" 
                              style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', background: 'hsl(var(--danger) / 10%)' }} 
                              onClick={() => handleDeleteCampaign(camp.id)}
                              title="Delete Campaign"
                            >
                              <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '0.9rem', height: '0.9rem', color: 'hsl(var(--danger))' }}>
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </GlassCard>
        </div>
      ) : (
        <GlassCard style={{ maxWidth: currentAiPlan ? '1140px' : '780px', margin: '0 auto', transition: 'max-width 0.3s ease' }}>
          
          {/* Wizard Steps Visual tracker */}
          <div className="wizard-steps" style={{ position: 'relative' }}>
            <div className="wizard-progress-bar">
              <div className="wizard-progress-fill" style={{ width: `${((step - 1) / 3) * 100}%` }}></div>
            </div>
            <div className={`wizard-step ${step === 1 ? 'active' : step > 1 ? 'completed' : ''}`}>
              <div className="step-circle">1</div>
              <span className="step-label">Details</span>
            </div>
            <div className={`wizard-step ${step === 2 ? 'active' : step > 2 ? 'completed' : ''}`}>
              <div className="step-circle">2</div>
              <span className="step-label">Audience Target</span>
            </div>
            <div className={`wizard-step ${step === 3 ? 'active' : step > 3 ? 'completed' : ''}`}>
              <div className="step-circle">3</div>
              <span className="step-label">Template Bind</span>
            </div>
            <div className={`wizard-step ${step === 4 ? 'active' : ''}`}>
              <div className="step-circle">4</div>
              <span className="step-label">Review & Save</span>
            </div>
          </div>

          {/* Jarvis Voice Pre-fill Banner */}
          {currentAiPlan && currentAiPlan._voice_filled && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: '12px',
              padding: '14px 18px',
              marginBottom: '16px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(139,92,246,0.12) 0%, rgba(59,130,246,0.08) 100%)',
              border: '1px solid rgba(139,92,246,0.35)',
              boxShadow: '0 4px 20px rgba(139,92,246,0.1)',
              animation: 'fadeIn 0.4s ease'
            }}>
              <span style={{ fontSize: '1.5rem', flexShrink: 0 }}>🎙️</span>
              <div>
                <div style={{ fontWeight: '700', fontSize: '0.88rem', color: 'hsl(var(--primary))', marginBottom: '4px' }}>
                  Jarvis pre-filled this form from your voice command
                </div>
                <div style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))', lineHeight: '1.5' }}>
                  Campaign details, message, and channels have been auto-populated. Please review each step,
                  select your audience segment, then click <strong style={{ color: 'hsl(var(--text-primary))' }}>Launch Campaign</strong> to send.
                </div>
              </div>
              <button
                onClick={() => setCurrentAiPlan(prev => ({ ...prev, _voice_filled: false }))}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
                  color: 'hsl(var(--text-muted))', fontSize: '1.1rem', padding: '0 4px', flexShrink: 0 }}
                title="Dismiss"
              >×</button>
            </div>
          )}

          {wizardError && (

            <div className="glass-card danger-text" style={{ padding: '10px 14px', marginBottom: '20px', fontSize: '0.85rem', background: 'rgba(244, 63, 94, 0.1)', borderColor: 'rgba(244, 63, 94, 0.2)' }}>
              <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '1.1rem', height: '1.1rem', marginRight: '6px', display: 'inline-block', verticalAlign: 'middle' }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {wizardError}
            </div>
          )}

          {/* STEP 1: CAMPAIGN DETAILS */}
          {step === 1 && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* 🤖 Enterprise AI Co-Pilot Interceptor */}
              <div style={{
                background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.08) 0%, rgba(124, 58, 237, 0.05) 100%)',
                border: '1px solid rgba(37, 99, 235, 0.25)',
                borderRadius: '16px',
                padding: '20px',
                boxShadow: '0 8px 32px rgba(37, 99, 235, 0.05)',
                position: 'relative',
                overflow: 'hidden'
              }}>
                <div style={{
                  position: 'absolute', top: -50, right: -50, width: 150, height: 150,
                  background: 'rgba(37, 99, 235, 0.15)', borderRadius: '50%', filter: 'blur(40px)', pointerEvents: 'none'
                }}></div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '1.6rem' }}>🤖</span>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'hsl(var(--primary))' }}>Enterprise Campaign Co-Pilot</h3>
                      <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: 'hsl(var(--text-secondary))' }}>Describe your communication goal. AI will plan, write, audit, and estimate KPIs instantly.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-dark"
                    style={{ padding: '6px 12px', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                    onClick={() => setCoPilotOpen(!coPilotOpen)}
                  >
                    {coPilotOpen ? 'Collapse Co-Pilot' : 'Open Co-Pilot'}
                  </button>
                </div>

                {coPilotOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '10px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '14px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '14px' }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 0 }}>
                            Describe what you want to communicate (2-3 sentences) *
                          </label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <select
                              value={coPilotLang}
                              onChange={(e) => handleSpeechLangChange(e.target.value)}
                              title="Select Voice Speech Language"
                              style={{
                                background: 'rgba(255,255,255,0.08)',
                                color: 'hsl(var(--text-primary))',
                                border: '1px solid var(--border-color-glass)',
                                borderRadius: '8px',
                                padding: '3px 8px',
                                fontSize: '0.75rem',
                                outline: 'none',
                                cursor: 'pointer'
                              }}
                            >
                              {INDIAN_SPEECH_LANGUAGES.map(l => (
                                <option key={l.code} value={l.code} style={{ background: '#0f1420', color: '#fff' }}>
                                  {l.label}
                                </option>
                              ))}
                            </select>

                            <button
                              type="button"
                              onClick={startCoPilotListening}
                              style={{
                                background: coPilotListening ? '#ef4444' : 'rgba(76, 140, 252, 0.15)',
                                border: coPilotListening ? '1px solid #f87171' : '1px solid rgba(76, 140, 252, 0.4)',
                                color: coPilotListening ? '#fff' : 'hsl(var(--primary))',
                                padding: '4px 10px',
                                borderRadius: '8px',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                boxShadow: coPilotListening ? '0 0 10px rgba(239, 68, 68, 0.5)' : 'none',
                                transition: 'all 0.2s'
                              }}
                              title={coPilotListening ? "Listening... Click to stop" : "Click to speak your campaign request"}
                            >
                              🎙️ {coPilotListening ? 'Listening...' : 'Speak via Mic'}
                            </button>
                          </div>
                        </div>
                        <textarea
                          className="form-control"
                          data-copilot-mic="true"
                          style={{ minHeight: '80px', fontSize: '0.88rem', resize: 'vertical', background: 'rgba(0,0,0,0.2)', border: coPilotListening ? '1px solid #ef4444' : '1px solid var(--input-border)' }}
                          placeholder={coPilotListening ? "Listening to your voice..." : "e.g. Draft an awareness campaign about a dengue vaccine drive in Ludhiana for students..."}
                          value={coPilotPrompt}
                          onChange={(e) => setCoPilotPrompt(e.target.value)}
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 600 }}>Category Hint</label>
                        <select 
                          className="form-control" 
                          style={{ background: 'rgba(0,0,0,0.2)' }} 
                          value={coPilotCategory} 
                          onChange={(e) => setCoPilotCategory(e.target.value)}
                        >
                          {campaignTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                      {coPilotHistory.length > 0 ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))' }}>History:</span>
                          <select 
                            className="form-control" 
                            style={{ padding: '4px 8px', fontSize: '0.75rem', height: 'auto', minHeight: 'auto', width: '180px' }}
                            onChange={(e) => {
                              const histIdx = parseInt(e.target.value);
                              if (!isNaN(histIdx) && coPilotHistory[histIdx]) {
                                const selected = coPilotHistory[histIdx];
                                setCoPilotPrompt(selected.brief);
                                setCoPilotCategory(selected.category);
                                applyAiPlanToForm(selected.plan);
                              }
                            }}
                            defaultValue=""
                          >
                            <option value="" disabled>-- Duplicate Previous --</option>
                            {coPilotHistory.map((h, i) => (
                              <option key={i} value={i}>
                                {h.plan.campaign?.title || `Plan ${i + 1}`} ({new Date(h.timestamp).toLocaleTimeString()})
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : <div></div>}

                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ padding: '8px 20px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}
                        disabled={coPilotLoading || !coPilotPrompt.trim()}
                        onClick={handleGenerateCampaignPlan}
                      >
                        {coPilotLoading ? (
                          <>
                            <span style={{ display: 'inline-block', width: '12px', height: '12px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}></span>
                            <span>Analyzing...</span>
                          </>
                        ) : (
                          <>
                            <span>🤖</span>
                            <span>Auto-Generate Campaign Plan</span>
                          </>
                        )}
                      </button>
                    </div>

                    {coPilotError && (
                      <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444', fontSize: '0.82rem' }}>
                        ⚠️ {coPilotError}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {currentAiPlan ? (
                /* ══════════════════════ SPLIT-SCREEN WORKSPACE ══════════════════════ */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  
                  {/* Refinement Toolbar Bar */}
                  <div style={{
                    padding: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color-glass)',
                    borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '10px'
                  }}>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <input
                        type="text"
                        className="form-control"
                        style={{ background: 'rgba(0,0,0,0.15)' }}
                        placeholder="Instruct AI to refine this plan (e.g. 'shorten body', 'make subject catchier', 'translate to Hindi')"
                        value={refineInstruction}
                        onChange={(e) => setRefineInstruction(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && refineInstruction.trim() && !refineLoading) {
                            handleRefineCampaignPlan(refineInstruction);
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ padding: '0 20px', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
                        disabled={refineLoading || !refineInstruction.trim()}
                        onClick={() => handleRefineCampaignPlan(refineInstruction)}
                      >
                        {refineLoading ? 'Refining...' : 'Refine Plan'}
                      </button>
                    </div>

                    {/* Quick refinement presets */}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.78rem', color: 'hsl(var(--text-muted))', fontWeight: 600 }}>Quick Actions:</span>
                      {[
                        { label: '✂️ Shorten Copy', prompt: 'Shorten the message body copy considerably.' },
                        { label: '🚨 Make Urgent', prompt: 'Make the tone of the message highly urgent and action-oriented.' },
                        { label: '🤝 Make Empathetic', prompt: 'Make the tone of the message warm, reassuring, and empathetic.' },
                      ].map(preset => (
                        <button
                          key={preset.label}
                          type="button"
                          className="pill-chip"
                          style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                          disabled={refineLoading}
                          onClick={() => handleRefineCampaignPlan(preset.prompt)}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '24px' }}>
                    
                    {/* LEFT COLUMN: PARAMETERS & METRICS */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      
                      <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color-glass)', borderRadius: '12px', padding: '16px' }}>
                        <h4 style={{ margin: '0 0 14px 0', fontSize: '0.92rem', color: 'hsl(var(--primary))', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Campaign Parameters</h4>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label" style={{ fontSize: '0.75rem' }}>Campaign Title *</label>
                            <input type="text" className="form-control" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} required />
                          </div>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label" style={{ fontSize: '0.75rem' }}>Campaign Objective *</label>
                            <input type="text" className="form-control" value={formObjective} onChange={(e) => setFormObjective(e.target.value)} required />
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label" style={{ fontSize: '0.75rem' }}>Category Type</label>
                              <select className="form-control" value={formType} onChange={(e) => setFormType(e.target.value)}>
                                {campaignTypes.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                              </select>
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label" style={{ fontSize: '0.75rem' }}>AI Confidence Score</label>
                              <div style={{
                                padding: '8px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color-glass)',
                                borderRadius: '10px', fontSize: '0.9rem', fontWeight: 'bold', color: currentAiPlan.metadata?.confidence >= 0.85 ? '#10b981' : '#f59e0b',
                                display: 'flex', alignItems: 'center', gap: '6px'
                              }}>
                                🎯 {(currentAiPlan.metadata?.confidence * 100).toFixed(0)}% Confidence
                              </div>
                            </div>
                          </div>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label" style={{ fontSize: '0.75rem' }}>Detailed Notes / Description (Optional)</label>
                            <textarea className="form-control" style={{ minHeight: '60px', resize: 'vertical' }} value={formDesc} onChange={(e) => setFormDesc(e.target.value)} />
                          </div>
                        </div>
                      </div>

                      {/* KPI Performance Metrics */}
                      <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color-glass)', borderRadius: '12px', padding: '16px' }}>
                        <h4 style={{ margin: '0 0 14px 0', fontSize: '0.92rem', color: 'hsl(var(--primary))', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Estimated Success KPIs</h4>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '12px' }}>
                          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color-glass)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                            <span style={{ display: 'block', fontSize: '0.68rem', color: 'hsl(var(--text-muted))', fontWeight: 600 }}>EXPECTED REACH</span>
                            <span style={{ display: 'block', fontSize: '1.25rem', fontWeight: 800, marginTop: '4px', color: '#3b82f6' }}>{currentAiPlan.kpis?.expected_reach_pct}%</span>
                          </div>
                          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color-glass)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                            <span style={{ display: 'block', fontSize: '0.68rem', color: 'hsl(var(--text-muted))', fontWeight: 600 }}>CTR TARGET</span>
                            <span style={{ display: 'block', fontSize: '1.25rem', fontWeight: 800, marginTop: '4px', color: '#10b981' }}>{currentAiPlan.kpis?.ctr_goal_pct}%</span>
                          </div>
                          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color-glass)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                            <span style={{ display: 'block', fontSize: '0.68rem', color: 'hsl(var(--text-muted))', fontWeight: 600 }}>DELIVERY RATE</span>
                            <span style={{ display: 'block', fontSize: '1.25rem', fontWeight: 800, marginTop: '4px', color: '#8b5cf6' }}>{currentAiPlan.kpis?.delivery_goal_pct}%</span>
                          </div>
                        </div>

                        {currentAiPlan.kpis?.awareness_goal_description && (
                          <div style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                            <strong>Measurable Goal:</strong> {currentAiPlan.kpis.awareness_goal_description}
                          </div>
                        )}
                      </div>

                      {/* Suggested Targets & Dispatch Schedule */}
                      <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color-glass)', borderRadius: '12px', padding: '16px' }}>
                        <h4 style={{ margin: '0 0 14px 0', fontSize: '0.92rem', color: 'hsl(var(--primary))', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Suggested Audience & Send Schedule</h4>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <div>
                            <span style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Recommended Audience Demographics:</span>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              {currentAiPlan.delivery?.audiences?.map(aud => (
                                <span key={aud} style={{
                                  fontSize: '0.75rem', padding: '3px 8px', borderRadius: '6px', background: 'rgba(37,99,235,0.08)',
                                  color: '#3b82f6', border: '1px solid rgba(37,99,235,0.15)', fontWeight: 600
                                }}>
                                  ✓ {aud}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', fontWeight: 600 }}>Recommended Dispatch:</span>
                              <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#e5c07b' }}>
                                📅 {currentAiPlan.delivery?.schedule?.day || 'Tomorrow'} @ {currentAiPlan.delivery?.schedule?.time || '09:00 AM'}
                              </span>
                            </div>
                            {currentAiPlan.delivery?.schedule?.reason && (
                              <p style={{ margin: 0, fontSize: '0.75rem', color: 'hsl(var(--text-secondary))', fontStyle: 'italic', lineHeight: '1.4' }}>
                                💡 {currentAiPlan.delivery.schedule.reason}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Manual Dispatch Time Override */}
                      <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color-glass)', borderRadius: '12px', padding: '16px' }}>
                        <h4 style={{ margin: '0 0 10px 0', fontSize: '0.92rem', color: 'hsl(var(--primary))', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Schedule Configuration</h4>
                        
                        <div style={{ display: 'flex', gap: '10px', marginBottom: isScheduled ? '10px' : 0 }}>
                          <button
                            type="button"
                            className={`btn ${!isScheduled ? 'btn-primary' : 'btn-dark'}`}
                            style={{ flexGrow: 1, borderRadius: '8px', padding: '8px', fontSize: '0.8rem' }}
                            onClick={() => { setIsScheduled(false); setScheduledTime(''); }}
                          >
                            🚀 Send Immediately
                          </button>
                          <button
                            type="button"
                            className={`btn ${isScheduled ? 'btn-primary' : 'btn-dark'}`}
                            style={{ flexGrow: 1, borderRadius: '8px', padding: '8px', fontSize: '0.8rem' }}
                            onClick={() => {
                              setIsScheduled(true);
                              if (!scheduledTime) {
                                const now = new Date();
                                now.setMinutes(now.getMinutes() + 5);
                                const iso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString();
                                setScheduledTime(iso.substring(0, 16));
                              }
                            }}
                          >
                            📅 Schedule Future
                          </button>
                        </div>
                        {isScheduled && (
                          <input
                            type="datetime-local"
                            className="form-control"
                            value={scheduledTime}
                            min={new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().substring(0, 16)}
                            onChange={(e) => setScheduledTime(e.target.value)}
                            required
                          />
                        )}
                      </div>

                    </div>

                    {/* RIGHT COLUMN: MESSAGE EDITING & CO-PILOT AUDITING */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      
                      <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color-glass)', borderRadius: '12px', padding: '16px' }}>
                        <h4 style={{ margin: '0 0 14px 0', fontSize: '0.92rem', color: 'hsl(var(--primary))', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Message Copy Editor</h4>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {selectedChannels.includes('email') && (
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label" style={{ fontSize: '0.75rem' }}>Email Subject</label>
                              <input
                                type="text"
                                className="form-control"
                                value={customSubject}
                                onChange={(e) => setCustomSubject(e.target.value)}
                              />
                            </div>
                          )}
                          
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                              <label className="form-label" style={{ fontSize: '0.75rem', marginBottom: 0 }}>Message Body *</label>
                              <span style={{ fontSize: '0.72rem', color: 'hsl(var(--text-muted))' }}>Double braces variable tags</span>
                            </div>

                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px', padding: '6px', background: 'rgba(0,0,0,0.15)', borderRadius: '8px' }}>
                              {placeholders.map(p => (
                                <button
                                  key={p.tag}
                                  type="button"
                                  className="pill-chip"
                                  style={{ fontSize: '0.7rem', padding: '2px 6px' }}
                                  onClick={() => handleInsertPlaceholder(p.tag)}
                                >
                                  +{p.label}
                                </button>
                              ))}
                            </div>

                            <textarea
                              ref={bodyTextareaRef}
                              className="form-control"
                              style={{ width: '100%', minHeight: '150px', fontFamily: 'monospace', fontSize: '0.88rem', resize: 'vertical' }}
                              value={customBody}
                              onChange={(e) => setCustomBody(e.target.value)}
                              required
                            />
                          </div>
                        </div>
                      </div>

                      {/* AI Risk Radar */}
                      <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color-glass)', borderRadius: '12px', padding: '16px' }}>
                        <h4 style={{ margin: '0 0 12px 0', fontSize: '0.92rem', color: 'hsl(var(--primary))', textTransform: 'uppercase', letterSpacing: '0.04em' }}>AI Risk Radar</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {currentAiPlan.risks && currentAiPlan.risks.length > 0 ? (
                            currentAiPlan.risks.map((risk, index) => (
                              <div key={index} style={{
                                padding: '8px 12px', borderRadius: '8px', fontSize: '0.8rem', display: 'flex', gap: '8px', alignItems: 'flex-start',
                                background: risk.severity === 'error' ? 'rgba(239, 68, 68, 0.08)' : risk.severity === 'warning' ? 'rgba(245, 158, 11, 0.08)' : 'rgba(255,255,255,0.03)',
                                border: `1px solid ${risk.severity === 'error' ? 'rgba(239, 68, 68, 0.2)' : risk.severity === 'warning' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.06)'}`,
                                color: risk.severity === 'error' ? '#ef4444' : risk.severity === 'warning' ? '#f59e0b' : 'hsl(var(--text-secondary))'
                              }}>
                                <span>{risk.severity === 'error' ? '🚫' : risk.severity === 'warning' ? '⚠️' : 'ℹ️'}</span>
                                <span>{risk.message}</span>
                              </div>
                            ))
                          ) : (
                            <div style={{ padding: '8px 12px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)', color: '#10b981', fontSize: '0.8rem' }}>
                              ✅ Risk Radar clean: No formatting, spam word, or delivery length errors found.
                            </div>
                          )}
                        </div>
                      </div>

                      {/* AI Suggestions & Insights Panel */}
                      <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color-glass)', borderRadius: '12px', padding: '16px' }}>
                        <h4 style={{ margin: '0 0 12px 0', fontSize: '0.92rem', color: 'hsl(var(--primary))', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Proactive AI Suggestions</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {currentAiPlan.metadata?.suggestions && currentAiPlan.metadata?.suggestions.length > 0 ? (
                            currentAiPlan.metadata?.suggestions.map((suggestion, index) => (
                              <div key={index} style={{
                                padding: '6px 12px', background: 'rgba(59, 130, 246, 0.04)', border: '1px solid rgba(59, 130, 246, 0.1)', borderRadius: '8px',
                                fontSize: '0.78rem', color: 'hsl(var(--text-secondary))', display: 'flex', alignItems: 'center', gap: '8px'
                              }}>
                                <span style={{ color: '#3b82f6' }}>💡</span>
                                <span>{suggestion}</span>
                              </div>
                            ))
                          ) : (
                            <span style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))' }}>No suggestions available.</span>
                          )}
                        </div>
                      </div>

                    </div>

                  </div>
                </div>
              ) : (
                /* ══════════════════════ NORMAL MANUAL FORM ══════════════════════ */
                <>
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: '700', color: 'hsl(var(--primary))' }}>Select Campaign Template (Optional Pre-fill)</label>
                    <select
                      className="form-control"
                      value={selectedTplId}
                      onChange={(e) => {
                        const tplId = e.target.value;
                        setSelectedTplId(tplId);
                        if (tplId && tplId !== 'custom') {
                          const activeTpl = templates.find(t => t.id === tplId);
                          if (activeTpl) {
                            setFormTitle(activeTpl.title);
                            setFormObjective(activeTpl.description || activeTpl.title);
                            setCustomSubject(activeTpl.subject_template || '');
                            setCustomBody(activeTpl.body_template || '');
                            if (activeTpl.channel) {
                              setSelectedChannels([activeTpl.channel]);
                            }
                          }
                        }
                      }}
                      style={{ border: '1px solid rgba(76, 140, 252, 0.4)', background: 'rgba(76, 140, 252, 0.05)' }}
                    >
                      <option value="">-- Choose Template --</option>
                      <option value="custom">-- Write Custom Message (Direct) --</option>
                      {templates.map(tpl => (
                        <option key={tpl.id} value={tpl.id}>
                          [{tpl.channel.toUpperCase()}] {tpl.title} ({tpl.default_language})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Campaign Title *</label>
                    <input type="text" className="form-control" placeholder="e.g. Swachh Bharat Ludhiana Awareness 2026" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Campaign Objective *</label>
                    <input type="text" className="form-control" placeholder="e.g. Educate farmers on stubble burning alternatives" value={formObjective} onChange={(e) => setFormObjective(e.target.value)} required />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
                    <div className="form-group">
                      <label className="form-label">Campaign Category Type</label>
                      <select className="form-control" value={formType} onChange={(e) => setFormType(e.target.value)}>
                        {campaignTypes.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Detailed Notes / Description (Optional)</label>
                    <textarea className="form-control" style={{ minHeight: '80px', resize: 'vertical' }} placeholder="Targeting rural blocks inside Punjab during monsoon onset." value={formDesc} onChange={(e) => setFormDesc(e.target.value)} />
                  </div>

                  {/* Campaign Schedule Configuration */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '4px', borderTop: '1px solid var(--border-color-glass)', paddingTop: '16px' }}>
                    <div className="form-group">
                      <label className="form-label">Dispatch Schedule Option</label>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                          type="button"
                          className={`btn ${!isScheduled ? 'btn-primary' : 'btn-dark'}`}
                          style={{ flexGrow: 1, borderRadius: '10px', padding: '10px' }}
                          onClick={() => {
                            setIsScheduled(false);
                            setScheduledTime('');
                          }}
                        >
                          🚀 Send Immediately
                        </button>
                        <button
                          type="button"
                          className={`btn ${isScheduled ? 'btn-primary' : 'btn-dark'}`}
                          style={{ flexGrow: 1, borderRadius: '10px', padding: '10px' }}
                          onClick={() => {
                            setIsScheduled(true);
                            if (!scheduledTime) {
                              const now = new Date();
                              now.setMinutes(now.getMinutes() + 5); // default to 5 minutes from now
                              const iso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString();
                              setScheduledTime(iso.substring(0, 16));
                            }
                          }}
                        >
                          📅 Schedule Future
                        </button>
                      </div>
                    </div>

                    {isScheduled && (
                      <div className="form-group animate-fade-in" style={{ padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid var(--border-color-glass)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
                          <label className="form-label" style={{ margin: 0, fontWeight: 700 }}>
                            Select Date & Time *
                          </label>
                          <span style={{ fontSize: '0.75rem', background: 'rgba(59, 130, 246, 0.15)', color: '#38bdf8', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(59, 130, 246, 0.3)', fontWeight: 700 }}>
                            🇮🇳 IST (Indian Standard Time, UTC+05:30)
                          </span>
                        </div>
                        <input
                          type="datetime-local"
                          className="form-control"
                          value={scheduledTime}
                          min={new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().substring(0, 16)}
                          onChange={(e) => setScheduledTime(e.target.value)}
                          required
                        />
                        {scheduledTime && (
                          <div style={{ marginTop: '8px', fontSize: '0.8rem', color: '#10b981', background: 'rgba(16, 185, 129, 0.08)', padding: '6px 10px', borderRadius: '6px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                            ⏰ <strong>Target Dispatch:</strong> {formatIST(scheduledTime)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* STEP 2: CHOOSE AUDIENCE TARGET */}
          {step === 2 && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="form-group">
                <label className="form-label">Target Audience Type</label>
                <div style={{ display: 'flex', gap: '20px', marginBottom: '10px' }}>
                  <label style={{ display: 'flex', gap: '6px', alignItems: 'center', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="targetType"
                      value="segment"
                      checked={targetType === 'segment'}
                      onChange={() => {
                        setTargetType('segment');
                        setSelectedSegId('');
                      }}
                    />
                    Saved Dynamic Segment
                  </label>
                  <label style={{ display: 'flex', gap: '6px', alignItems: 'center', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="targetType"
                      value="recipient"
                      checked={targetType === 'recipient'}
                      onChange={() => {
                        setTargetType('recipient');
                        setSelectedSegId('');
                      }}
                    />
                    Individual Recipient (Direct)
                  </label>
                </div>
              </div>

              {targetType === 'segment' ? (
                <div className="form-group animate-fade-in">
                  <label className="form-label">Select Saved Dynamic Target Segment *</label>
                  <select className="form-control" value={selectedSegId} onChange={(e) => setSelectedSegId(e.target.value)} required>
                    <option value="">-- Choose Segment --</option>
                    {segments.map(seg => (
                      <option key={seg.id} value={seg.id}>
                        {seg.name} ({seg.estimated_size} members)
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="form-group animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="form-label" style={{ margin: 0 }}>
                      Select Direct Recipients * ({selectedRecipientIds.length || (selectedRecipientId ? 1 : 0)} selected)
                    </label>
                    {(selectedRecipientIds.length > 0 || selectedRecipientId) && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedRecipientIds([]);
                          setSelectedRecipientId('');
                          setSelectedSegId('');
                        }}
                        style={{
                          background: 'none', border: 'none', color: '#ef4444',
                          fontSize: '0.78rem', cursor: 'pointer', fontWeight: 600
                        }}
                      >
                        Clear All Selections
                      </button>
                    )}
                  </div>

                  {/* Search Input */}
                  <input
                    type="text"
                    className="form-control"
                    placeholder="🔍 Search recipients by name, phone, or email..."
                    value={recipientSearchTerm}
                    onChange={(e) => setRecipientSearchTerm(e.target.value)}
                    style={{ fontSize: '0.88rem' }}
                  />

                  {/* Selected Badges */}
                  {(selectedRecipientIds.length > 0 || selectedRecipientId) && (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', padding: '10px', background: 'rgba(139, 92, 246, 0.08)', border: '1px solid rgba(139, 92, 246, 0.25)', borderRadius: '12px' }}>
                      {recipients
                        .filter(r => selectedRecipientIds.includes(r.id) || r.id === selectedRecipientId)
                        .map(r => (
                          <span
                            key={r.id}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: '6px',
                              padding: '4px 10px', borderRadius: '16px',
                              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(59, 130, 246, 0.3))',
                              border: '1px solid rgba(139, 92, 246, 0.5)',
                              color: '#f8fafc', fontSize: '0.78rem', fontWeight: 600
                            }}
                          >
                            👤 {r.first_name} {r.last_name || ''} ({r.phone || r.email || 'No contact'})
                            <button
                              type="button"
                              onClick={() => {
                                const currentList = selectedRecipientIds.length > 0 ? selectedRecipientIds : (selectedRecipientId ? [selectedRecipientId] : []);
                                const updated = currentList.filter(id => id !== r.id);
                                setSelectedRecipientIds(updated);
                                setSelectedRecipientId(updated[0] || '');
                                setSelectedSegId('');
                              }}
                              style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: '0.85rem', padding: 0, marginLeft: '2px' }}
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                    </div>
                  )}

                  {/* Recipient Checkbox Select List */}
                  <div style={{ maxHeight: '240px', overflowY: 'auto', border: '1px solid var(--border-color-glass)', borderRadius: '12px', padding: '10px', background: 'rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {recipients
                      .filter(r => {
                        if (!recipientSearchTerm.trim()) return true;
                        const term = recipientSearchTerm.toLowerCase();
                        const name = `${r.first_name} ${r.last_name || ''}`.toLowerCase();
                        const phone = (r.phone || '').toLowerCase();
                        const email = (r.email || '').toLowerCase();
                        return name.includes(term) || phone.includes(term) || email.includes(term);
                      })
                      .map(rec => {
                        const isChecked = selectedRecipientIds.includes(rec.id) || rec.id === selectedRecipientId;
                        return (
                          <label
                            key={rec.id}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '12px',
                              padding: '8px 12px', borderRadius: '8px',
                              background: isChecked ? 'rgba(139, 92, 246, 0.15)' : 'rgba(255,255,255,0.02)',
                              border: `1px solid ${isChecked ? 'rgba(139, 92, 246, 0.35)' : 'rgba(255,255,255,0.05)'}`,
                              cursor: 'pointer', transition: 'all 0.2s'
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                const currentList = selectedRecipientIds.length > 0 ? selectedRecipientIds : (selectedRecipientId ? [selectedRecipientId] : []);
                                let updated;
                                if (isChecked) {
                                  updated = currentList.filter(id => id !== rec.id);
                                } else {
                                  updated = [...currentList, rec.id];
                                }
                                setSelectedRecipientIds(updated);
                                setSelectedRecipientId(updated[0] || '');
                                setSelectedSegId('');
                              }}
                            />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
                              <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#f8fafc' }}>
                                {rec.first_name} {rec.last_name || ''}
                              </span>
                              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                📞 {rec.phone || 'No phone'} | 📧 {rec.email || 'No email'} | 💬 Channels: {getPreferredChannelsText(rec)} | 🌐 Lang: {getPreferredLanguagesText(rec)}
                              </span>
                            </div>
                          </label>
                        );
                      })}
                  </div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Choose Active Communication Channels</label>
                <div style={{ display: 'flex', gap: '16px' }}>
                  {channelsList.map(ch => (
                    <label key={ch} style={{ display: 'flex', gap: '6px', cursor: 'pointer', alignItems: 'center', textTransform: 'capitalize' }}>
                      <input type="checkbox" checked={selectedChannels.includes(ch)} onChange={() => toggleChannelSelection(ch)} />
                      {ch}
                    </label>
                  ))}
                </div>
              </div>

              {((targetType === 'segment' && selectedSegId) || (targetType === 'recipient' && (selectedRecipientIds.length > 0 || selectedRecipientId))) && (
                <GlassCard style={{ background: 'transparent', padding: '24px', display: 'grid', gridTemplateColumns: '1fr 180px', alignItems: 'center', gap: '20px', borderColor: 'var(--border-color-glass)' }}>
                  <div>
                    <h4 style={{ fontSize: '1.1rem', color: 'hsl(var(--primary))', marginBottom: '6px', fontWeight: '500' }}>Target Reach Analysis</h4>
                    <p style={{ fontSize: '0.85rem', color: 'hsl(var(--text-secondary))', lineHeight: '1.5' }}>
                      {targetType === 'recipient' 
                        ? 'Targeting individual recipient(s) directly.' 
                        : 'Citizen contact overlap validation based on preferred channel details (phone and email indexes).'
                      }
                    </p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', borderLeft: '1px solid var(--border-color-glass)', paddingLeft: '20px' }}>
                    {targetType === 'recipient' ? (
                      <div style={{ textAlign: 'center' }}>
                        <span style={{ display: 'block', fontSize: '0.75rem', color: 'hsl(var(--text-muted))', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>EST. IMPACT REACH</span>
                        <span className="reach-card-value">{selectedRecipientIds.length || (selectedRecipientId ? 1 : 0)}</span>
                        <span style={{ display: 'block', fontSize: '0.8rem', color: 'hsl(var(--text-muted))', marginTop: '2px' }}>
                          {(selectedRecipientIds.length || (selectedRecipientId ? 1 : 0)) === 1 ? 'member targeted' : 'members targeted'}
                        </span>
                      </div>
                    ) : evalLoading ? (
                      <span style={{ fontSize: '0.85rem', color: 'hsl(var(--text-muted))' }}>Re-evaluating reach...</span>
                    ) : (
                      <div style={{ textAlign: 'center' }}>
                        <span style={{ display: 'block', fontSize: '0.75rem', color: 'hsl(var(--text-muted))', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>EST. IMPACT REACH</span>
                        <span className="reach-card-value">{evalReach.reach}</span>
                        <span style={{ display: 'block', fontSize: '0.8rem', color: 'hsl(var(--text-muted))', marginTop: '2px' }}>of {evalReach.target} members</span>
                        <button type="button" className="pill-chip" style={{ marginTop: '10px', fontSize: '0.75rem', padding: '6px 12px', background: 'rgba(255,255,255,0.05)' }} onClick={() => setShowSegmentUsersModal(true)}>Check Audience</button>
                      </div>
                    )}
                  </div>
                </GlassCard>
              )}

              {/* ⚠️ AUDIENCE CHANNEL PREFERENCE ALIGNMENT WARNING CARD */}
              {(() => {
                const getTargetBreakdown = () => {
                  if (targetType === 'recipient') {
                    const rec = recipients.find(r => r.id === selectedRecipientId);
                    if (!rec) return {};
                    let chans = [];
                    try {
                      chans = typeof rec.preferred_channels === 'string' ? JSON.parse(rec.preferred_channels) : rec.preferred_channels;
                    } catch (e) { chans = []; }
                    if (!Array.isArray(chans) || chans.length === 0) chans = ['email'];
                    const map = {};
                    chans.forEach(ch => { if (ch) map[String(ch).toLowerCase()] = 1; });
                    return map;
                  } else {
                    return evalBreakdowns.channels || {};
                  }
                };

                const targetBreakdown = getTargetBreakdown();
                const totalTarget = targetType === 'recipient' ? (selectedRecipientId ? 1 : 0) : (evalReach.target || 0);
                const mismatched = Object.entries(targetBreakdown).filter(([ch]) => !selectedChannels.includes(ch.toLowerCase()));
                const mismatchCount = mismatched.reduce((sum, [_, count]) => sum + count, 0);
                const hasMismatch = totalTarget > 0 && mismatched.length > 0;
                const mismatchPct = totalTarget > 0 ? Math.round((mismatchCount / totalTarget) * 100) : 0;

                if (!hasMismatch || ((targetType === 'segment' && !selectedSegId) || (targetType === 'recipient' && !selectedRecipientId))) return null;

                return (
                  <div style={{
                    marginTop: '16px',
                    padding: '18px 20px',
                    borderRadius: '16px',
                    background: 'rgba(245, 158, 11, 0.08)',
                    border: '1.5px solid rgba(245, 158, 11, 0.35)',
                    boxShadow: '0 8px 24px rgba(245, 158, 11, 0.1)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
                    animation: 'animate-fade-in 0.3s ease'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '1.5rem' }}>⚠️</span>
                        <div>
                          <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '800', color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Channel Preference Mismatch Notice
                          </h4>
                          <span style={{ fontSize: '0.8rem', color: 'hsl(var(--text-primary))', fontWeight: '500' }}>
                            You selected <strong>{selectedChannels.map(c => c.toUpperCase()).join(', ')}</strong>, but target audience members prefer other channels!
                          </span>
                        </div>
                      </div>
                      <span className="badge" style={{ background: '#f59e0b', color: '#000', fontWeight: '800', fontSize: '0.78rem', padding: '4px 10px' }}>
                        {mismatchPct}% Mismatch ({mismatchCount} / {totalTarget} members)
                      </span>
                    </div>

                    {/* Breakdown List */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                      {Object.entries(targetBreakdown).map(([ch, count]) => {
                        const chLower = ch.toLowerCase();
                        const isSelected = selectedChannels.includes(chLower);
                        const pct = totalTarget > 0 ? Math.round((count / totalTarget) * 100) : 0;
                        return (
                          <div key={ch} style={{
                            padding: '10px 14px',
                            borderRadius: '10px',
                            background: isSelected ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                            border: `1.5px solid ${isSelected ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}>
                            <div>
                              <span style={{ fontSize: '0.85rem', fontWeight: '800', textTransform: 'uppercase', color: isSelected ? '#22c55e' : '#ef4444' }}>
                                {isSelected ? '✓' : '⚠️'} {ch}
                              </span>
                              <span style={{ display: 'block', fontSize: '0.74rem', color: 'hsl(var(--text-muted))', fontWeight: '600', marginTop: '2px' }}>
                                {count} member(s) ({pct}%)
                              </span>
                            </div>
                            {!isSelected && (
                              <button
                                type="button"
                                className="btn btn-primary"
                                style={{ padding: '4px 10px', fontSize: '0.72rem', height: 'auto', whiteSpace: 'nowrap', textTransform: 'uppercase' }}
                                onClick={() => setSelectedChannels(prev => [...prev, chLower])}
                                title={`Add ${ch} to active campaign channels`}
                              >
                                + Add {ch}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Dispatcher Routing Explanation Notice */}
                    <div style={{
                      fontSize: '0.82rem',
                      lineHeight: '1.45',
                      background: 'rgba(0,0,0,0.3)',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      color: '#f8fafc',
                      borderLeft: '4px solid #f59e0b'
                    }}>
                      <strong>💡 Delivery Behavior Transparency:</strong> CommAI dispatcher checks recipient preferences.
                      {overrideChannelPreferences ? (
                        <span style={{ color: '#10b981', fontWeight: 'bold' }}>
                          {' '}⚡ Force Delivery ENABLED: Messages will be forced via {selectedChannels.join(', ').toUpperCase()} to all reachable members regardless of their preferred channels.
                        </span>
                      ) : (
                        <span>
                          {' '}Members with different preferred channels (e.g. Call/SMS) will be <strong>skipped</strong> for {selectedChannels.join(', ').toUpperCase()} unless you click <em>"+ Add Channel"</em> above or check <em>"Force Delivery"</em> below.
                        </span>
                      )}
                    </div>

                    {/* Quick Action Buttons & Toggle */}
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ fontSize: '0.8rem', padding: '6px 14px' }}
                        onClick={() => {
                          const allMismatched = Object.keys(targetBreakdown).map(c => c.toLowerCase());
                          const union = Array.from(new Set([...selectedChannels, ...allMismatched]));
                          setSelectedChannels(union);
                        }}
                      >
                        ➕ Include All Audience Preferred Channels
                      </button>

                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: '800', color: '#f59e0b', marginLeft: 'auto', background: 'rgba(245, 158, 11, 0.1)', padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                        <input
                          type="checkbox"
                          checked={overrideChannelPreferences}
                          onChange={(e) => setOverrideChannelPreferences(e.target.checked)}
                        />
                        ⚡ Force Delivery (Override Audience Preferences)
                      </label>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* STEP 3: TEMPLATE BINDING & PLACEHOLDERS PREVIEW */}
          {step === 3 && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="form-group">
                <label className="form-label">Bind Reusable Message Template *</label>
                <select className="form-control" value={selectedTplId} onChange={(e) => { setSelectedTplId(e.target.value); }} required>
                  <option value="">-- Choose Template --</option>
                  <option value="custom">-- Write Custom Message (Direct) --</option>
                  {templates.map(tpl => (
                    <option key={tpl.id} value={tpl.id}>
                      [{tpl.channel.toUpperCase()}] {tpl.title} ({tpl.default_language})
                    </option>
                  ))}
                </select>
              </div>

              {selectedTplId === 'custom' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', background: 'rgba(255,255,255,0.01)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color-glass)' }}>
                  <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'hsl(var(--primary))', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Compose Custom Campaign Message</h4>
                  
                  {selectedChannels.includes('email') && (
                    <div className="form-group">
                      <label className="form-label">Email Subject</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Emergency alert: heavy rain advisory for {{city}} region"
                        value={customSubject}
                        onChange={(e) => setCustomSubject(e.target.value)}
                      />
                    </div>
                  )}
                  
                  <div className="form-group" style={{ position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <label className="form-label">Message Body *</label>
                      <span style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))' }}>Insert Placeholders:</span>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px', padding: '8px', background: 'var(--border-color-glass)', borderRadius: '10px' }}>
                      {placeholders.map(p => (
                        <button
                          key={p.tag}
                          type="button"
                          className="pill-chip"
                          onClick={() => handleInsertPlaceholder(p.tag)}
                        >
                          +{p.label}
                        </button>
                      ))}
                    </div>

                    <textarea
                      ref={bodyTextareaRef}
                      className="form-control"
                      style={{ width: '100%', minHeight: '120px', fontFamily: 'monospace', fontSize: '0.9rem', resize: 'vertical' }}
                      placeholder="Type your message here. E.g. Dear {{first_name}}, please note that heavy rains are forecasted in {{city}}..."
                      value={customBody}
                      onChange={(e) => setCustomBody(e.target.value)}
                      required
                    />
                  </div>

                  {/* 🤖 AI Assist Panel Toggle */}
                  <button
                    type="button"
                    className="btn btn-dark"
                    style={{ marginTop: '10px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '6px 14px', background: campAiPanelOpen ? 'hsl(var(--primary) / 15%)' : undefined, border: campAiPanelOpen ? '1px solid hsl(var(--primary) / 30%)' : undefined }}
                    onClick={() => { setCampAiPanelOpen(!campAiPanelOpen); setCampAiError(''); setCampAiResult(null); setCampAiComplianceResult(null); }}
                  >
                    <span style={{ fontSize: '1rem' }}>🤖</span>
                    {campAiPanelOpen ? 'Close AI Assist' : 'AI Assist'}
                  </button>

                  {campAiPanelOpen && (
                    <div style={{ marginBottom: '10px', padding: '14px', background: 'rgba(37,99,235,0.04)', border: '1px solid hsl(var(--primary) / 15%)', borderRadius: '12px' }}>
                      {/* Tab Bar */}
                      <div style={{ display: 'flex', gap: '4px', marginBottom: '12px', borderBottom: '1px solid var(--border-color-glass)', paddingBottom: '8px', flexWrap: 'wrap' }}>
                        {[
                          { id: 'generate', label: '✨ Generate' },
                          { id: 'optimize', label: '🎯 Optimize' },
                          { id: 'personalize', label: '👥 Personalize' },
                          { id: 'compliance', label: '🛡️ Compliance' },
                        ].map(tab => (
                          <button
                            key={tab.id}
                            type="button"
                            style={{
                              padding: '5px 12px', fontSize: '0.78rem', borderRadius: '6px', cursor: 'pointer',
                              background: campAiTab === tab.id ? 'hsl(var(--primary) / 20%)' : 'transparent',
                              color: campAiTab === tab.id ? 'hsl(var(--primary))' : 'hsl(var(--text-secondary))',
                              border: campAiTab === tab.id ? '1px solid hsl(var(--primary) / 30%)' : '1px solid transparent',
                              fontWeight: campAiTab === tab.id ? 600 : 400,
                              transition: 'all 0.15s ease',
                            }}
                            onClick={() => { setCampAiTab(tab.id); setCampAiError(''); setCampAiResult(null); setCampAiComplianceResult(null); }}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>

                      {/* Generate Tab */}
                      {campAiTab === 'generate' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label" style={{ fontSize: '0.78rem' }}>Describe what you want to communicate</label>
                            <textarea
                              className="form-control"
                              style={{ minHeight: '60px', fontSize: '0.85rem', resize: 'vertical' }}
                              placeholder="e.g. Alert rural farmers about upcoming drought in Rajasthan with water conservation tips"
                              value={campAiPrompt}
                              onChange={(e) => setCampAiPrompt(e.target.value)}
                            />
                          </div>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                            <div className="form-group" style={{ marginBottom: 0, flex: '1 1 120px' }}>
                              <label className="form-label" style={{ fontSize: '0.72rem' }}>Tone</label>
                              <select className="form-control" style={{ fontSize: '0.8rem', height: 'auto', minHeight: 'auto', padding: '4px 8px' }} value={campAiTone} onChange={(e) => setCampAiTone(e.target.value)}>
                                {aiTones.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                              </select>
                            </div>
                            <button
                              type="button"
                              className="btn btn-primary"
                              style={{ padding: '6px 16px', fontSize: '0.8rem', height: 'auto', whiteSpace: 'nowrap' }}
                              disabled={campAiLoading || !campAiPrompt.trim()}
                              onClick={async () => {
                                setCampAiLoading(true); setCampAiError(''); setCampAiResult(null);
                                const ch = selectedChannels.length > 0 ? selectedChannels[0] : 'email';
                                try {
                                  const resp = await fetch(`${backendUrl}/api/ai/generate`, {
                                    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ prompt: campAiPrompt, category: aiCategories.includes(formType.split('_')[0]) ? formType.split('_')[0] : 'awareness', channel: ch, tone: campAiTone })
                                  });
                                  const data = await resp.json();
                                  if (!resp.ok) throw new Error(data.detail || 'Generation failed');
                                  if (data.error) throw new Error(data.error);
                                  setCampAiResult({ type: 'generate', subject: data.subject, body: data.body });
                                } catch (err) { setCampAiError(err.message); }
                                finally { setCampAiLoading(false); }
                              }}
                            >
                              {campAiLoading ? 'Generating...' : '✨ Generate'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Optimize Tab */}
                      {campAiTab === 'optimize' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <p style={{ fontSize: '0.78rem', color: 'hsl(var(--text-muted))', margin: 0 }}>Rewrite your current message body in a different tone. Placeholders will be preserved.</p>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                            <div className="form-group" style={{ marginBottom: 0, flex: '1 1 120px' }}>
                              <label className="form-label" style={{ fontSize: '0.72rem' }}>Target Tone</label>
                              <select className="form-control" style={{ fontSize: '0.8rem', height: 'auto', minHeight: 'auto', padding: '4px 8px' }} value={campAiTone} onChange={(e) => setCampAiTone(e.target.value)}>
                                {aiTones.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                              </select>
                            </div>
                            <button
                              type="button"
                              className="btn btn-primary"
                              style={{ padding: '6px 16px', fontSize: '0.8rem', height: 'auto', whiteSpace: 'nowrap' }}
                              disabled={campAiLoading || !customBody.trim()}
                              onClick={async () => {
                                setCampAiLoading(true); setCampAiError(''); setCampAiResult(null);
                                try {
                                  const resp = await fetch(`${backendUrl}/api/ai/optimize`, {
                                    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ text: customBody, target_tone: campAiTone })
                                  });
                                  const data = await resp.json();
                                  if (!resp.ok) throw new Error(data.detail || 'Optimization failed');
                                  if (data.error) throw new Error(data.error);
                                  setCampAiResult({ type: 'optimize', text: data.optimized_text });
                                } catch (err) { setCampAiError(err.message); }
                                finally { setCampAiLoading(false); }
                              }}
                            >
                              {campAiLoading ? 'Optimizing...' : '🎯 Optimize'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Personalize Tab */}
                      {campAiTab === 'personalize' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <p style={{ fontSize: '0.78rem', color: 'hsl(var(--text-muted))', margin: 0 }}>Adapt your message for a specific audience and objective.</p>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                            <div className="form-group" style={{ marginBottom: 0, flex: '1 1 140px' }}>
                              <label className="form-label" style={{ fontSize: '0.72rem' }}>Target Audience</label>
                              <select className="form-control" style={{ fontSize: '0.8rem', height: 'auto', minHeight: 'auto', padding: '4px 8px' }} value={campAiAudienceProfile} onChange={(e) => setCampAiAudienceProfile(e.target.value)}>
                                {aiAudienceProfiles.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                              </select>
                            </div>
                            <div className="form-group" style={{ marginBottom: 0, flex: '1 1 140px' }}>
                              <label className="form-label" style={{ fontSize: '0.72rem' }}>Objective</label>
                              <select className="form-control" style={{ fontSize: '0.8rem', height: 'auto', minHeight: 'auto', padding: '4px 8px' }} value={campAiObjective} onChange={(e) => setCampAiObjective(e.target.value)}>
                                {aiCategories.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                              </select>
                            </div>
                            <button
                              type="button"
                              className="btn btn-primary"
                              style={{ padding: '6px 16px', fontSize: '0.8rem', height: 'auto', whiteSpace: 'nowrap' }}
                              disabled={campAiLoading || !customBody.trim()}
                              onClick={async () => {
                                setCampAiLoading(true); setCampAiError(''); setCampAiResult(null);
                                try {
                                  const resp = await fetch(`${backendUrl}/api/ai/personalize`, {
                                    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ text: customBody, audience_profile: campAiAudienceProfile, communication_objective: campAiObjective })
                                  });
                                  const data = await resp.json();
                                  if (!resp.ok) throw new Error(data.detail || 'Personalization failed');
                                  if (data.error) throw new Error(data.error);
                                  setCampAiResult({ type: 'personalize', text: data.personalized_text });
                                } catch (err) { setCampAiError(err.message); }
                                finally { setCampAiLoading(false); }
                              }}
                            >
                              {campAiLoading ? 'Personalizing...' : '👥 Personalize'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Compliance Tab */}
                      {campAiTab === 'compliance' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <p style={{ fontSize: '0.78rem', color: 'hsl(var(--text-muted))', margin: 0 }}>Audit your message for compliance, readability, spam risks, and placeholder integrity.</p>
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ padding: '6px 16px', fontSize: '0.8rem', height: 'auto', alignSelf: 'flex-start' }}
                            disabled={campAiLoading || !customBody.trim()}
                            onClick={async () => {
                              setCampAiLoading(true); setCampAiError(''); setCampAiComplianceResult(null);
                              try {
                                const resp = await fetch(`${backendUrl}/api/ai/check-compliance`, {
                                  method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ text: customBody, category: aiCategories.includes(formType.split('_')[0]) ? formType.split('_')[0] : 'awareness' })
                                });
                                const data = await resp.json();
                                if (!resp.ok) throw new Error(data.detail || 'Compliance check failed');
                                setCampAiComplianceResult(data);
                              } catch (err) { setCampAiError(err.message); }
                              finally { setCampAiLoading(false); }
                            }}
                          >
                            {campAiLoading ? 'Checking...' : '🛡️ Run Compliance Audit'}
                          </button>

                          {campAiComplianceResult && (
                            <div style={{ padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border-color-glass)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'hsl(var(--text-primary))' }}>Quality Score</span>
                                <span style={{
                                  fontSize: '1.3rem', fontWeight: 700,
                                  color: campAiComplianceResult.score >= 80 ? 'hsl(var(--accent))' : campAiComplianceResult.score >= 50 ? 'hsl(var(--warning))' : 'hsl(var(--danger))'
                                }}>
                                  {campAiComplianceResult.score}/100
                                </span>
                              </div>
                              <div style={{ display: 'flex', gap: '12px', fontSize: '0.75rem', color: 'hsl(var(--text-muted))', marginBottom: '10px', flexWrap: 'wrap' }}>
                                <span>📝 {campAiComplianceResult.word_count} words</span>
                                <span>📄 {campAiComplianceResult.char_count} chars</span>
                                <span>🔗 {campAiComplianceResult.placeholder_count} placeholders</span>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {campAiComplianceResult.issues.map((issue, idx) => (
                                  <div key={idx} style={{
                                    display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '6px 10px', borderRadius: '6px', fontSize: '0.78rem',
                                    background: issue.severity === 'error' ? 'hsl(var(--danger) / 8%)' : issue.severity === 'warning' ? 'hsl(var(--warning) / 8%)' : issue.severity === 'success' ? 'hsl(var(--accent) / 8%)' : 'rgba(255,255,255,0.03)',
                                    color: issue.severity === 'error' ? 'hsl(var(--danger))' : issue.severity === 'warning' ? 'hsl(var(--warning))' : issue.severity === 'success' ? 'hsl(var(--accent))' : 'hsl(var(--text-secondary))',
                                  }}>
                                    <span>{issue.severity === 'error' ? '🚫' : issue.severity === 'warning' ? '⚠️' : issue.severity === 'success' ? '✅' : 'ℹ️'}</span>
                                    <span>{issue.message}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* AI Error */}
                      {campAiError && (
                        <div style={{ marginTop: '8px', padding: '8px 12px', borderRadius: '6px', background: 'hsl(var(--danger) / 8%)', color: 'hsl(var(--danger))', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          ⚠️ {campAiError}
                        </div>
                      )}

                      {/* AI Result Preview */}
                      {campAiResult && (
                        <div style={{ marginTop: '10px', padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border-color-glass)' }}>
                          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'hsl(var(--primary))', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            {campAiResult.type === 'generate' ? '✨ Generated Content' : campAiResult.type === 'optimize' ? '🎯 Optimized Text' : '👥 Personalized Text'}
                          </div>
                          {campAiResult.subject && (
                            <div style={{ fontSize: '0.8rem', color: 'hsl(var(--text-secondary))', marginBottom: '6px' }}>
                              <strong>Subject:</strong> {campAiResult.subject}
                            </div>
                          )}
                          <div style={{
                            padding: '10px', borderRadius: '6px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color-glass)',
                            fontSize: '0.85rem', color: 'hsl(var(--text-primary))', lineHeight: '1.45', whiteSpace: 'pre-wrap', maxHeight: '200px', overflowY: 'auto'
                          }}>
                            {campAiResult.body || campAiResult.text}
                          </div>
                          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                            <button
                              type="button"
                              className="btn btn-primary"
                              style={{ padding: '5px 12px', fontSize: '0.75rem', height: 'auto' }}
                              onClick={() => {
                                if (campAiResult.type === 'generate') {
                                  if (campAiResult.subject) setCustomSubject(campAiResult.subject);
                                  setCustomBody(campAiResult.body);
                                } else {
                                  setCustomBody(campAiResult.text);
                                }
                                setCampAiResult(null);
                              }}
                            >
                              ✅ Apply to Editor
                            </button>
                            <button
                              type="button"
                              className="btn btn-dark"
                              style={{ padding: '5px 12px', fontSize: '0.75rem', height: 'auto' }}
                              onClick={() => setCampAiResult(null)}
                            >
                              Dismiss
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Inline Translation Helper */}
                  <div style={{ padding: '12px', background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--border-color-glass)', borderRadius: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>🤖</span>
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'hsl(var(--text-secondary))' }}>Groq AI Translation Helper</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <select
                          className="form-control"
                          style={{ padding: '4px 8px', fontSize: '0.8rem', width: 'auto', height: 'auto', minHeight: 'auto' }}
                          value={inlineTranslationLang}
                          onChange={(e) => setInlineTranslationLang(e.target.value)}
                        >
                          {configLanguages.map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                        <button
                          type="button"
                          className="btn btn-dark"
                          style={{ padding: '4px 10px', fontSize: '0.78rem', height: 'auto' }}
                          onClick={handleCustomTranslate}
                          disabled={inlineTranslationLoading || !customBody}
                        >
                          {inlineTranslationLoading ? 'Translating...' : 'Translate'}
                        </button>
                      </div>
                    </div>

                    {inlineTranslationError && (
                      <div style={{ color: 'hsl(var(--danger))', fontSize: '0.78rem', marginTop: '8px' }}>
                        ⚠️ {inlineTranslationError}
                      </div>
                    )}

                    {inlineTranslationResult && (
                      <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {inlineTranslationSubjectResult && (
                          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '6px 10px', borderRadius: '4px', border: '1px solid var(--border-color-glass)', fontSize: '0.85rem' }}>
                            <strong>Subject:</strong> {inlineTranslationSubjectResult}
                          </div>
                        )}
                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-color-glass)', fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>
                          {inlineTranslationResult}
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ padding: '4px 10px', fontSize: '0.75rem', height: 'auto' }}
                            onClick={handleApplyCustomTranslation}
                          >
                            Use Translated Content
                          </button>
                          <button
                            type="button"
                            className="btn btn-dark"
                            style={{ padding: '4px 10px', fontSize: '0.75rem', height: 'auto' }}
                            onClick={() => { setInlineTranslationResult(''); setInlineTranslationSubjectResult(''); }}
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {selectedTplId && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                    <label className="form-label" style={{ margin: 0 }}>
                      🔍 Live Placeholder Preview (Demo sample profile)
                    </label>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.8rem', color: 'hsl(var(--text-secondary))' }}>Preview Language:</span>
                      <select
                        className="form-control"
                        style={{ padding: '4px 8px', fontSize: '0.8rem', width: 'auto', height: 'auto', minHeight: 'auto', display: 'inline-block' }}
                        value={previewLang}
                        onChange={(e) => setPreviewLang(e.target.value)}
                      >
                        {configLanguages.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                  </div>
                  {previewLoading ? (
                    <div style={{ padding: '36px', textAlign: 'center', background: 'rgba(255,255,255,0.01)', borderRadius: '12px', border: '1px dashed var(--border-color-glass)', color: 'hsl(var(--text-muted))', fontSize: '0.85rem' }}>
                      Translating preview dynamically...
                    </div>
                  ) : (
                    renderTemplatePreview()
                  )}
                </div>
              )}
            </div>
          )}

          {/* STEP 4: REVIEW & SAVE DRAFT */}
          {step === 4 && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="campaign-receipt">
                <div style={{ borderBottom: '1px dashed var(--border-color-glass)', paddingBottom: '16px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'hsl(var(--primary))', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>CAMPAIGN SPECIFICATION SHEET</span>
                  <h3 style={{ fontSize: '1.3rem', color: 'hsl(var(--text-primary))', marginTop: '4px', fontWeight: '500' }}>
                    {formTitle}
                  </h3>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div className="receipt-item">
                    <span className="receipt-label">Objective</span>
                    <span className="receipt-value" style={{ maxWidth: '60%', textAlign: 'right' }}>{formObjective}</span>
                  </div>

                  <div className="receipt-item">
                    <span className="receipt-label">Advisory Type</span>
                    <span className="receipt-value">{getCampaignTypeLabel(formType)}</span>
                  </div>

                  <div className="receipt-item">
                    <span className="receipt-label">Target Dynamic Segment</span>
                    <span className="receipt-value" style={{ color: 'hsl(var(--secondary))' }}>
                      {targetType === 'recipient'
                        ? (() => {
                            const rec = recipients.find(r => r.id === selectedRecipientId);
                            return rec ? `Direct: ${rec.first_name} ${rec.last_name || ''} (${rec.id.substring(0, 8)})` : 'Individual Recipient';
                          })()
                        : (segments.find(s => s.id === selectedSegId)?.name || 'Custom criteria query')
                      }
                    </span>
                  </div>

                  <div className="receipt-item">
                    <span className="receipt-label">Active Channel Mix</span>
                    <span className="receipt-value" style={{ textTransform: 'uppercase', fontSize: '0.85rem', color: 'hsl(var(--primary))' }}>
                      {selectedChannels.join(' • ')}
                    </span>
                  </div>

                  <div className="receipt-item">
                    <span className="receipt-label">Citizen Impact Count</span>
                    <span className="receipt-value" style={{ color: 'hsl(var(--accent))', fontWeight: '800' }}>
                      {targetType === 'recipient' ? (selectedRecipientId ? 1 : 0) : (evalReach.reach || 0)} Citizens
                    </span>
                  </div>

                  <div className="receipt-item">
                    <span className="receipt-label">Estimated Channel Budget</span>
                    <span className="receipt-value" style={{ color: 'hsl(var(--accent))', fontWeight: '800' }}>
                      ₹{(() => {
                        const count = targetType === 'recipient' ? (selectedRecipientId ? 1 : 0) : (evalReach.reach || 0);
                        let cost = 0;
                        selectedChannels.forEach(ch => {
                          if (ch === 'sms') cost += count * 0.02 * 83;
                          // whatsapp removed
                        });
                        return cost.toFixed(2);
                      })()}
                    </span>
                  </div>

                  <div className="receipt-item">
                    <span className="receipt-label">Execution Schedule</span>
                    <span className="receipt-value" style={{ color: isScheduled ? 'hsl(var(--warning))' : 'hsl(var(--accent))', fontWeight: 'bold' }}>
                      {isScheduled ? `📅 Scheduled: ${formatIST(scheduledTime)}` : '🚀 Send Immediately'}
                    </span>
                  </div>

                  <div className="receipt-item">
                    <span className="receipt-label">Channel Preference Strategy</span>
                    <span className="receipt-value" style={{ color: overrideChannelPreferences ? '#10b981' : '#f59e0b', fontWeight: 'bold' }}>
                      {overrideChannelPreferences ? '⚡ Override Mode (Force Selected Channels)' : '🛡️ Respect Audience Preferences'}
                    </span>
                  </div>
                </div>

                {(segmentPreviewUsers.length > 0 || (targetType === 'recipient' && selectedRecipientId)) && (
                  <div style={{ marginTop: '16px', borderTop: '1px dashed var(--border-color-glass)', paddingTop: '12px' }}>
                    <span style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '8px' }}>
                      👥 Target Recipients Preview:
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: 'rgba(255,255,255,0.02)', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)' }}>
                      {targetType === 'recipient' && selectedRecipientId ? (
                        (() => {
                          const u = recipients.find(r => r.id === selectedRecipientId);
                          return u ? (
                            <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem' }}>
                              <span style={{ fontWeight: '500', color: 'hsl(var(--text-primary))' }}>{u.first_name} {u.last_name || ''}</span>
                              <span style={{ color: 'hsl(var(--text-secondary))', fontFamily: 'monospace' }}>
                                {u.email || u.phone}
                              </span>
                            </div>
                          ) : null;
                        })()
                      ) : (
                        segmentPreviewUsers.map(u => (
                          <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem' }}>
                            <span style={{ fontWeight: '500', color: 'hsl(var(--text-primary))' }}>{u.first_name} {u.last_name}</span>
                            <span style={{ color: 'hsl(var(--text-secondary))', fontFamily: 'monospace' }}>
                              {u.email || u.phone}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {user?.role !== 'admin' && ((evalReach.reach || 0) >= 100 || formType.includes('emergency')) && (
                  <div style={{
                    marginTop: '16px',
                    padding: '16px 20px',
                    borderRadius: '14px',
                    background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(217, 119, 6, 0.12) 100%)',
                    border: '1.5px solid rgba(245, 158, 11, 0.4)',
                    boxShadow: '0 4px 16px rgba(245, 158, 11, 0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px'
                  }}>
                    <span style={{ fontSize: '1.6rem' }}>🛡️</span>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#f59e0b' }}>
                        MAKER-CHECKER APPROVAL ESCALATION NOTICE
                      </h4>
                      <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: '#cbd5e1', lineHeight: '1.45' }}>
                        As a Campaign Manager, submitting a campaign targeting ≥100 citizens ({evalReach.reach || 0} target count) or emergency advisories will submit it to the <strong>Admin Approvals Queue (Pending Approval)</strong>. An Administrator must review and approve it before real-time dispatch begins.
                      </p>
                    </div>
                  </div>
                )}

                {formDesc && (
                  <div style={{ fontSize: '0.9rem', borderTop: '1px solid var(--border-color-glass)', paddingTop: '12px', marginTop: '4px' }}>
                    <strong style={{ color: 'hsl(var(--text-muted))', display: 'block', marginBottom: '4px', fontWeight: '500' }}>Staff Notes:</strong>
                    <p style={{ color: 'hsl(var(--text-secondary))', lineHeight: '1.4' }}>{formDesc}</p>
                  </div>
                )}
              </div>

              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: '10px', fontWeight: '700' }}>
                  Live Variable Interpolation Preview
                </label>
                {renderCampaignMockup()}
              </div>

              {/* 🎨 Inline Visual Flyer Generation Box */}
              <div style={{
                marginTop: '16px',
                padding: '20px',
                background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.05) 0%, rgba(6, 182, 212, 0.03) 100%)',
                border: '1px solid rgba(37, 99, 235, 0.25)',
                borderRadius: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '1.5rem' }}>🎨</span>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: 'hsl(var(--primary))' }}>
                      Visual Campaign Flyer Studio
                    </h4>
                    <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: 'hsl(var(--text-secondary))' }}>
                      Generate an infographic visual poster for this campaign using the details you entered.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: '600' }}>Language</label>
                    <select
                      className="form-control"
                      value={inlinePosterLanguage}
                      onChange={(e) => setInlinePosterLanguage(e.target.value)}
                      style={{ fontSize: '0.82rem', padding: '6px 10px' }}
                    >
                      {configLanguages.map(lang => (
                        <option key={lang} value={lang}>{lang}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: '600' }}>Tone</label>
                    <select
                      className="form-control"
                      value={inlinePosterTone}
                      onChange={(e) => setInlinePosterTone(e.target.value)}
                      style={{ fontSize: '0.82rem', padding: '6px 10px' }}
                    >
                      <option value="formal">Formal</option>
                      <option value="urgent">Urgent</option>
                      <option value="empathetic">Empathetic</option>
                      <option value="simplified">Simplified</option>
                    </select>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleGenerateCampaignPoster}
                  style={{ width: '100%', padding: '10px', fontSize: '0.85rem', fontWeight: '600' }}
                >
                  ✨ Generate Flyer in Poster Studio &rarr;
                </button>

                {inlinePosterError && (
                  <div style={{ color: 'hsl(var(--danger))', fontSize: '0.8rem', marginTop: '4px' }}>
                    ⚠️ {inlinePosterError}
                  </div>
                )}

                {inlinePosterUrl && (
                  <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px', alignItems: 'center' }}>
                    
                    {/* ℹ️ AI Typography Text Disclaimer */}
                    <div style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      background: 'rgba(245, 158, 11, 0.08)',
                      border: '1px solid rgba(245, 158, 11, 0.25)',
                      fontSize: '0.82rem',
                      lineHeight: '1.45',
                      color: 'hsl(var(--text-primary))',
                      textAlign: 'left'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', color: 'hsl(38, 92%, 55%)', fontWeight: '700' }}>
                        <span>⚠️</span>
                        <span>AI Typography Note</span>
                      </div>
                      <div style={{ marginBottom: '6px' }}>
                        <strong>Problem:</strong> AI image generators (like Flux/Stable Diffusion) generate visual patterns rather than typography, causing text inside posters to look garbled or misspelled.
                      </div>
                      <div>
                        <strong>Solution:</strong> Use this generated poster as a graphic background and overlay clean, readable text on top using Canva, a PDF editor, or design software.
                      </div>
                    </div>

                    <div style={{ width: '100%', maxWidth: '380px', borderRadius: '12px', overflow: 'hidden', border: '1.5px solid var(--border-color-glass)', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
                      <img src={inlinePosterUrl} alt="Campaign Poster" style={{ width: '100%', height: 'auto', display: 'block' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <a href={inlinePosterUrl} target="_blank" rel="noopener noreferrer" className="btn btn-dark btn-sm" style={{ padding: '6px 12px', fontSize: '0.8rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        🔎 View Fullscreen
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          const link = document.createElement('a');
                          link.href = inlinePosterUrl;
                          link.download = `${formTitle.replace(/\s+/g, '_')}_flyer.png`;
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                        }}
                        className="btn btn-primary btn-sm"
                        style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                      >
                        💾 Download
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Navigation Controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', justifyItems: 'center', marginTop: '32px', borderTop: '1px solid var(--border-color-glass)', paddingTop: '20px' }}>
            <button type="button" className="btn btn-dark" onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1} style={{ marginRight: 'auto' }}>
              Previous
            </button>
            
            {step < 4 ? (
              <button type="button" className="btn btn-primary" onClick={handleNextStep}>
                Next Step
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '12px' }}>
                <button type="button" className="btn btn-secondary" onClick={handleSaveCampaignDraft}>
                  <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '1rem', height: '1rem' }}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                  Save Campaign Draft
                </button>
                {user && (user.role === 'admin' || user.role === 'campaign_manager') ? (
                  <button type="button" className="btn btn-primary" onClick={() => handlePublishCampaign(false)}>
                    <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '1rem', height: '1rem' }}><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                    {isScheduled 
                      ? '📅 Schedule Campaign' 
                      : (user.role !== 'admin' && ((evalReach.reach || 0) >= 100 || formType.includes('emergency'))
                          ? '📋 Submit for Admin Approval'
                          : '🚀 Launch Campaign (Broadcast Live)')}
                  </button>
                ) : (
                  <button type="button" className="btn btn-primary" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }} title="Only Campaign Managers can launch campaigns">
                    <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '1rem', height: '1rem' }}><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                    {isScheduled ? '📅 Schedule Campaign' : '🚀 Launch Campaign (Active)'}
                  </button>
                )}
              </div>
            )}
          </div>

        </GlassCard>
      )}

      {/* --- MAKER-CHECKER PUBLISH OUTCOME MODAL OVERLAY --- */}
      {publishedResultModal && (
        <div className="modal-overlay" style={{ zIndex: 999999 }}>
          <GlassCard className="modal-content animate-fade-in" style={{ width: '100%', maxWidth: '540px', padding: '28px', border: publishedResultModal.isMakerChecker ? '2px solid #f59e0b' : '2px solid #10b981' }}>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{
                width: '64px', height: '64px', borderRadius: '50%',
                background: publishedResultModal.isMakerChecker ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                border: publishedResultModal.isMakerChecker ? '2px solid #f59e0b' : '2px solid #10b981',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '2rem', marginBottom: '12px'
              }}>
                {publishedResultModal.isMakerChecker ? '📋' : publishedResultModal.status === 'scheduled' ? '📅' : '🚀'}
              </div>
              <h3 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '4px 0', color: '#f8fafc' }}>
                {publishedResultModal.isMakerChecker
                  ? 'Campaign Submitted to Admin Queue'
                  : publishedResultModal.status === 'scheduled'
                  ? 'Campaign Scheduled Successfully'
                  : 'Campaign Launched & Broadcasting!'}
              </h3>
              <span className="badge" style={{
                background: publishedResultModal.isMakerChecker ? 'rgba(245, 158, 11, 0.25)' : 'rgba(16, 185, 129, 0.25)',
                color: publishedResultModal.isMakerChecker ? '#f59e0b' : '#10b981',
                fontSize: '0.82rem', fontWeight: 800, padding: '4px 12px', borderRadius: '12px', marginTop: '6px'
              }}>
                STATUS: {publishedResultModal.status.toUpperCase().replace('_', ' ')}
              </span>
            </div>

            <p style={{ fontSize: '0.9rem', color: '#cbd5e1', lineHeight: '1.5', textAlign: 'center', marginBottom: '20px' }}>
              {publishedResultModal.isMakerChecker ? (
                <>Your campaign <strong>"{publishedResultModal.title}"</strong> has been saved with status <strong>PENDING APPROVAL</strong>. Because it reaches {publishedResultModal.reach} citizen(s), an Administrator must review and approve it from the Approvals Queue before real-time dispatch begins.</>
              ) : publishedResultModal.status === 'scheduled' ? (
                <>Your campaign <strong>"{publishedResultModal.title}"</strong> is scheduled to go live to {publishedResultModal.reach} citizen(s) at {new Date(publishedResultModal.scheduledAt).toLocaleString()}.</>
              ) : (
                <>Your campaign <strong>"{publishedResultModal.title}"</strong> is now ACTIVE and delivering to {publishedResultModal.reach} target citizens in real time!</>
              )}
            </p>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              {publishedResultModal.isMakerChecker && user?.role === 'admin' && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setPublishedResultModal(null);
                    if (setActiveTab) setActiveTab('approvals');
                  }}
                  style={{ background: '#f59e0b', borderColor: '#f59e0b', color: '#000', fontWeight: 700 }}
                >
                  📋 Open Approvals Queue
                </button>
              )}
              <button
                type="button"
                className="btn btn-dark"
                onClick={() => setPublishedResultModal(null)}
                style={{ fontWeight: 600 }}
              >
                📊 Back to Campaigns Directory
              </button>
            </div>
          </GlassCard>
        </div>
      )}

      {/* --- AUDIT TIMELINE MODAL OVERLAY --- */}
      {showAuditModal && selectedCampaignForAudit && (
        <div className="modal-overlay">
          <GlassCard className="modal-content animate-fade-in" style={{ width: '100%', maxWidth: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color-glass)', paddingBottom: '12px', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: '500', color: 'hsl(var(--primary))', margin: 0 }}>Campaign Audit History</h3>
                <span style={{ fontSize: '0.85rem', color: 'hsl(var(--text-secondary))' }}>
                  Campaign: <strong style={{ fontWeight: '500' }}>{selectedCampaignForAudit.title}</strong>
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  className="btn btn-primary" 
                  style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(0, 188, 212, 0.2)', border: '1px solid rgba(0, 188, 212, 0.4)', color: '#00e5ff' }} 
                  onClick={async () => {
                    try {
                      const response = await fetch(`${backendUrl}/api/campaigns/audit-logs/export/all?campaign_id=${selectedCampaignForAudit.id}`, { headers });
                      if (!response.ok) {
                        const errData = await response.json().catch(() => ({}));
                        throw new Error(errData.detail || 'Export failed');
                      }
                      const blob = await response.blob();
                      const downloadUrl = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = downloadUrl;
                      a.download = `audit_logs_campaign_${selectedCampaignForAudit.id.slice(0, 8)}.csv`;
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                      window.URL.revokeObjectURL(downloadUrl);
                    } catch (err) {
                      console.error('CSV Export Error:', err);
                      alert(`CSV Export failed: ${err.message}`);
                    }
                  }}
                  title="Export this campaign's audit logs to CSV"
                >
                  📥 Export CSV
                </button>
                <button className="btn btn-dark" style={{ padding: '6px 12px' }} onClick={() => setShowAuditModal(false)}>
                  ✕
                </button>
              </div>
            </div>

            {auditLoading ? (
              <div style={{ padding: '32px', textAlign: 'center', color: 'hsl(var(--text-secondary))' }}>
                Loading audit logs...
              </div>
            ) : auditLogs.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: 'hsl(var(--text-muted))' }}>
                No change history found for this campaign.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderLeft: '2px solid var(--border-color-glass)', paddingLeft: '16px', marginLeft: '8px', position: 'relative' }}>
                {auditLogs.map(log => (
                  <div key={log.id} style={{ position: 'relative', paddingBottom: '8px' }}>
                    {/* Timeline dot */}
                    <div style={{
                      position: 'absolute',
                      left: '-23px',
                      top: '4px',
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      background: log.action === 'CREATE' ? 'hsl(var(--primary))' : log.action === 'STATUS_CHANGE' ? 'hsl(var(--accent))' : 'hsl(var(--warning))'
                    }} />

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontSize: '0.85rem' }}>
                      <span style={{ fontWeight: '600', textTransform: 'uppercase', color: 'hsl(var(--primary))' }}>
                        {log.action.replace('_', ' ')}
                      </span>
                      <span style={{ color: 'hsl(var(--text-muted))', fontSize: '0.8rem' }}>
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.9rem', marginTop: '4px' }}>
                      Performed by: <strong>{log.user_name}</strong>
                    </div>

                    {log.action === 'STATUS_CHANGE' && (
                      <div style={{ marginTop: '4px', fontSize: '0.85rem', color: 'hsl(var(--text-secondary))' }}>
                        Status transitioned from <span style={{ textTransform: 'capitalize', color: 'hsl(var(--text-muted))' }}>{log.old_status}</span> ➜ <strong style={{ color: 'hsl(var(--text-primary))', textTransform: 'capitalize', fontWeight: '500' }}>{log.new_status}</strong>
                      </div>
                    )}

                    {log.changes && renderAuditChanges(log.changes)}
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        </div>
      )}

      {/* --- DELIVERY PROGRESS & REPORT MODAL OVERLAY --- */}
      {showDeliveryModal && selectedCampaignForDelivery && (
        <div className="modal-overlay">
          <GlassCard className="modal-content animate-fade-in" style={{ width: '100%', maxWidth: '750px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color-glass)', paddingBottom: '12px', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: '600', color: '#00e5ff', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                  <span>📢</span> Campaign Delivery Report
                </h3>
                <span style={{ fontSize: '0.85rem', color: 'hsl(var(--text-secondary))' }}>
                  Campaign: <strong style={{ fontWeight: '500', color: '#fff' }}>{selectedCampaignForDelivery.title}</strong>
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {deliverySummary && (
                  <button 
                    className="btn btn-primary" 
                    style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(0, 188, 212, 0.2)', border: '1px solid rgba(0, 188, 212, 0.4)', color: '#00e5ff' }} 
                    onClick={async () => {
                      try {
                        const response = await fetch(`${backendUrl}/api/campaigns/${selectedCampaignForDelivery.id}/export-delivery-logs`, { headers });
                        if (!response.ok) {
                          const errData = await response.json().catch(() => ({}));
                          throw new Error(errData.detail || 'Export failed');
                        }
                        const blob = await response.blob();
                        const downloadUrl = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = downloadUrl;
                        a.download = `delivery_logs_${selectedCampaignForDelivery.id.slice(0, 8)}.csv`;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        window.URL.revokeObjectURL(downloadUrl);
                      } catch (err) {
                        console.error('CSV Export Error:', err);
                        alert(`CSV Export failed: ${err.message}`);
                      }
                    }}
                    title="Export all recipient logs to CSV file"
                  >
                    📥 Export CSV
                  </button>
                )}
                <button className="btn btn-dark" style={{ padding: '6px 12px' }} onClick={handleCloseDeliveryModal}>
                  ✕
                </button>
              </div>
            </div>

            {deliveryLoading ? (
              <div style={{ padding: '48px', textAlign: 'center', color: 'hsl(var(--text-secondary))' }}>
                Fetching live delivery report...
              </div>
            ) : !deliverySummary ? (
              <div style={{ padding: '48px', textAlign: 'center', color: 'hsl(var(--text-muted))' }}>
                No delivery metrics available for this campaign.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto', paddingRight: '4px' }}>
                
                {/* Status and Progress Bar */}
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontSize: '0.9rem', color: 'hsl(var(--text-secondary))' }}>
                      Delivery status: <strong style={{ 
                        color: deliverySummary.status === 'completed' ? '#00e676' : deliverySummary.status === 'active' ? '#00e5ff' : '#ff9100',
                        textTransform: 'uppercase'
                      }}>{deliverySummary.status === 'active' ? 'Delivering...' : deliverySummary.status}</strong>
                    </span>
                    {deliverySummary.dispatched_at && (
                      <span style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))' }}>
                        Sent at: {new Date(deliverySummary.dispatched_at).toLocaleString()}
                      </span>
                    )}
                  </div>

                  {/* Visual Progress Bar */}
                  {(() => {
                    const totalCitizens = deliverySummary.target_count || 0;
                    const totalDispatches = deliverySummary.total_dispatches || deliverySummary.sent_count || 0;
                    const processedDispatches = (deliverySummary.sent_count || 0) + (deliverySummary.failed_count || 0);
                    const pct = totalDispatches > 0 ? Math.min(100, Math.round((processedDispatches / totalDispatches) * 100)) : 100;
                    return (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'hsl(var(--text-muted))', marginBottom: '6px' }}>
                          <span>Dispatch progress: {pct}%</span>
                          <span>
                            {processedDispatches} channel dispatches processed across {totalCitizens} target citizens
                          </span>
                        </div>
                        <div style={{ height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '100px', overflow: 'hidden' }}>
                          <div style={{ 
                            height: '100%', 
                            width: `${pct}%`, 
                            background: deliverySummary.status === 'completed' ? 'linear-gradient(90deg, #00b0ff, #00e676)' : 'linear-gradient(90deg, #00b0ff, #00e5ff)',
                            borderRadius: '100px',
                            transition: 'width 0.4s ease'
                          }} />
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Counters grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1.1fr 1fr 1fr', gap: '10px' }}>
                  <div style={{ background: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.25)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                    <span style={{ display: 'block', fontSize: '0.68rem', color: 'hsl(var(--text-muted))', fontWeight: 'bold' }}>EFFECTIVENESS</span>
                    <span style={{ fontSize: '1.3rem', fontWeight: '800', color: (deliverySummary.effectiveness_score || 0) >= 80 ? '#10b981' : (deliverySummary.effectiveness_score || 0) >= 50 ? '#f59e0b' : '#ef4444' }}>
                      {deliverySummary.effectiveness_score || 0}/100
                    </span>
                  </div>
                  <div style={{ background: 'rgba(0, 176, 255, 0.05)', border: '1px solid rgba(0, 176, 255, 0.15)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                    <span style={{ display: 'block', fontSize: '0.68rem', color: 'hsl(var(--text-muted))', fontWeight: 'bold' }}>TARGET CITIZENS</span>
                    <span style={{ fontSize: '1.3rem', fontWeight: '700', color: '#00b0ff' }}>{deliverySummary.target_count}</span>
                  </div>
                  <div style={{ background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                    <span style={{ display: 'block', fontSize: '0.68rem', color: 'hsl(var(--text-muted))', fontWeight: 'bold' }}>CITIZENS REACHED</span>
                    <span style={{ fontSize: '1.3rem', fontWeight: '700', color: '#10b981' }}>
                      {deliverySummary.unique_recipients_reached !== undefined ? deliverySummary.unique_recipients_reached : deliverySummary.target_count}
                    </span>
                  </div>
                  <div style={{ background: 'rgba(0, 230, 118, 0.05)', border: '1px solid rgba(0, 230, 118, 0.15)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                    <span style={{ display: 'block', fontSize: '0.68rem', color: 'hsl(var(--text-muted))', fontWeight: 'bold' }}>MESSAGES SENT</span>
                    <span style={{ fontSize: '1.3rem', fontWeight: '700', color: '#00e676' }}>{deliverySummary.sent_count}</span>
                  </div>
                  <div style={{ background: 'rgba(255, 23, 68, 0.05)', border: '1px solid rgba(255, 23, 68, 0.15)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                    <span style={{ display: 'block', fontSize: '0.68rem', color: 'hsl(var(--text-muted))', fontWeight: 'bold' }}>FAILED</span>
                    <span style={{ fontSize: '1.3rem', fontWeight: '700', color: '#ff1744' }}>{deliverySummary.failed_count}</span>
                  </div>
                </div>

                {/* Engagement & Participation Banner */}
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', color: 'hsl(var(--text-secondary))' }}>
                    <strong>Participation & Feedback:</strong> {deliverySummary.participation_count || 0} response(s) ({deliverySummary.participation_rate || 0}% participation rate)
                  </span>
                  {deliverySummary.failed_count > 0 && (
                    <button
                      className="btn btn-warning"
                      style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'rgba(245, 158, 11, 0.2)', border: '1px solid rgba(245, 158, 11, 0.4)', color: '#f59e0b', cursor: 'pointer' }}
                      onClick={async () => {
                        if (window.confirm(`Retry ${deliverySummary.failed_count} failed deliveries for this campaign?`)) {
                          try {
                            const res = await fetch(`${backendUrl}/api/campaigns/${deliverySummary.id}/retry-failed`, {
                              method: 'POST',
                              headers
                            });
                            if (res.ok) {
                              const data = await res.json();
                              alert(data.message || "Retry initiated!");
                              handleOpenDeliveryModal({ id: deliverySummary.id });
                            } else {
                              const err = await res.json();
                              alert(err.detail || "Retry failed");
                            }
                          } catch (err) {
                            alert(err.message);
                          }
                        }
                      }}
                    >
                      🔁 Retry {deliverySummary.failed_count} Failed Deliveries
                    </button>
                  )}
                </div>

                {/* Logs table */}
                <div>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: '600', marginBottom: '10px', color: 'hsl(var(--text-primary))' }}>Recipient Dispatch Log Details</h4>
                  
                  <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid var(--border-color-glass)', borderRadius: '6px' }}>
                    <table className="custom-table" style={{ margin: 0, fontSize: '0.85rem' }}>
                      <thead style={{ position: 'sticky', top: 0, background: '#0d111d', zIndex: 1 }}>
                        <tr>
                          <th>Recipient</th>
                          <th>Channel</th>
                          <th>Status</th>
                          <th>Address/Phone</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          if (deliveryLogs.length === 0) {
                            return (
                              <tr>
                                <td colSpan="4" style={{ textAlign: 'center', color: 'hsl(var(--text-muted))', padding: '16px' }}>
                                  No log entries found.
                                </td>
                              </tr>
                            );
                          }

                          // Group delivery logs by recipient to combine multi-channel dispatches on a single row
                          const groupedMap = new Map();
                          deliveryLogs.forEach(log => {
                            const key = log.audience_id || log.audience_name || log.id;
                            if (!groupedMap.has(key)) {
                              groupedMap.set(key, {
                                id: key,
                                audience_name: log.audience_name,
                                channels: [],
                                addresses: [],
                                allSent: true,
                                hasFailed: false,
                                errors: []
                              });
                            }
                            const group = groupedMap.get(key);
                            if (log.channel && !group.channels.includes(log.channel)) {
                              group.channels.push(log.channel);
                            }
                            if (log.recipient_info && !group.addresses.includes(log.recipient_info)) {
                              group.addresses.push(log.recipient_info);
                            }
                            if (log.status !== 'sent' && log.status !== 'delivered' && log.status !== 'read') {
                              group.allSent = false;
                            }
                            if (log.status === 'failed') {
                              group.hasFailed = true;
                              if (log.error_message && !group.errors.includes(log.error_message)) {
                                group.errors.push(log.error_message);
                              }
                            }
                          });

                          const groupedList = Array.from(groupedMap.values());

                          return groupedList.map(group => (
                            <tr key={group.id}>
                              <td style={{ fontWeight: '500' }}>{group.audience_name}</td>
                              <td style={{ textTransform: 'lowercase', fontSize: '0.78rem' }}>
                                <span style={{ padding: '3px 8px', background: 'rgba(0, 176, 255, 0.1)', color: '#00b0ff', border: '1px solid rgba(0, 176, 255, 0.25)', borderRadius: '4px', fontWeight: 'bold' }}>
                                  {group.channels.join(', ')}
                                </span>
                              </td>
                              <td>
                                <span style={{ 
                                  color: !group.hasFailed ? '#00e676' : '#ff1744', 
                                  fontWeight: 'bold',
                                  fontSize: '0.8rem'
                                }}>
                                  {!group.hasFailed ? '✓ SENT' : '✗ FAILED'}
                                </span>
                                {group.errors.length > 0 && (
                                  <span style={{ display: 'block', fontSize: '0.75rem', color: 'hsl(var(--text-muted))', marginTop: '2px' }}>
                                    {group.errors.join(' | ')}
                                  </span>
                                )}
                              </td>
                              <td style={{ fontFamily: 'monospace', color: 'hsl(var(--text-secondary))', fontSize: '0.8rem' }}>
                                {group.addresses.join(' | ') || 'N/A'}
                              </td>
                            </tr>
                          ));
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            )}
          </GlassCard>
        </div>
      )}
      {/* Segment Users Modal */}
      {showSegmentUsersModal && (
        <div className="modal-overlay animate-fade-in" onClick={() => setShowSegmentUsersModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', width: '90%' }}>
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>Target Audience Preview</h3>
              <button className="icon-btn" onClick={() => setShowSegmentUsersModal(false)}>
                <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {segmentPreviewUsers.length === 0 ? (
                <p style={{ color: 'hsl(var(--text-muted))', textAlign: 'center', padding: '20px 0' }}>No users found in this segment.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {segmentPreviewUsers.map((user, idx) => (
                    <div key={idx} style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                      <div style={{ fontWeight: '600', marginBottom: '4px' }}>{user.name || 'Unknown Citizen'}</div>
                      <div style={{ fontSize: '0.85rem', color: 'hsl(var(--text-secondary))', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        {user.phone && <span>📞 {user.phone}</span>}
                        {user.email && <span>✉️ {user.email}</span>}
                        {user.language_preference && <span style={{ textTransform: 'capitalize' }}>🌐 {user.language_preference}</span>}
                      </div>
                    </div>
                  ))}
                  {evalReach.target > segmentPreviewUsers.length && (
                    <div style={{ textAlign: 'center', padding: '10px 0', fontSize: '0.85rem', color: 'hsl(var(--text-muted))', fontStyle: 'italic' }}>
                      Showing {segmentPreviewUsers.length} of {evalReach.target} total members...
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Campaigns;

