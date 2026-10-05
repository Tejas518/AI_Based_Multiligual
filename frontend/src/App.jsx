import React, { useState, useEffect, useRef, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import Audiences from './pages/Audiences';
import Templates from './pages/Templates';
import Campaigns from './pages/Campaigns';
import AuditLogs from './pages/AuditLogs';
import Settings from './pages/Settings';
import Users from './pages/Users';
import Approvals from './pages/Approvals';
import Feedback from './pages/Feedback';
import Managers from './pages/Managers';
import EmergencyInbox from './pages/EmergencyInbox';
import SupportQueries from './pages/SupportQueries';
import FactShield from './pages/FactShield';
import ChatbotWidget from './components/ChatbotWidget';
import VoiceCommandCenter from './components/VoiceCommandCenter';
import PosterStudio from './pages/PosterStudio';
import SentimentMap from './pages/SentimentMap';
import CitizenConversations from './pages/CitizenConversations';
import LiveBulletins from './pages/LiveBulletins';
import OperatorChat from './pages/OperatorChat';
import BottomNavBar from './components/BottomNavBar';
import SOSReports from './pages/SOSReports';




// Connect dynamically to the backend API services (auto-resolves mobile phone LAN/hotspot hostname)
const getDynamicBackendUrl = () => {
  let backendUrl = import.meta.env.VITE_BACKEND_URL || '';
  
  if (typeof window !== 'undefined' && window.location.hostname) {
    const currentHost = window.location.hostname;
    const currentProtocol = window.location.protocol;

    // 1. If explicit env var is set, use it (and auto-adapt localhost IP if accessed over LAN)
    if (backendUrl) {
      try {
        const urlObj = new URL(backendUrl);
        if ((urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1') && 
            (currentHost !== 'localhost' && currentHost !== '127.0.0.1')) {
          urlObj.hostname = currentHost;
          return urlObj.origin;
        }
        return backendUrl.replace(/\/+$/, '');
      } catch (e) {
        return backendUrl.replace(/\/+$/, '');
      }
    }

    // 2. If accessed over local network IP (e.g. 192.168.x.x, 10.x.x.x, 172.x.x.x) or localhost
    // backend is running on port 8001
    if (currentHost !== 'localhost' && currentHost !== '127.0.0.1') {
      // If hosted on a public domain like vercel.app without backend proxy:
      if (currentHost.includes('vercel.app') || currentHost.includes('netlify.app')) {
        return window.location.origin;
      }
      return `${currentProtocol}//${currentHost}:8001`;
    }
  }
  return backendUrl || 'http://localhost:8001';
};

const BACKEND_URL = getDynamicBackendUrl();

function App() {
  const [token, setToken] = useState(sessionStorage.getItem('token') || '');
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [initialLoading, setInitialLoading] = useState(true);
  const [theme, setTheme] = useState(localStorage.getItem('comm-theme') || 'dark');
  const [view, setView] = useState('landing');
  const [viewRegister, setViewRegister] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState(() => {
    return localStorage.getItem('commai_preferred_language') || 'Hindi';
  });

  const handleLanguageChange = (newLang) => {
    setSelectedLanguage(newLang);
    localStorage.setItem('commai_preferred_language', newLang);
    window.dispatchEvent(new CustomEvent('commai_language_changed', { detail: newLang }));
  };

  useEffect(() => {
    if (user && user.preferred_languages && user.preferred_languages.length > 0) {
      const saved = localStorage.getItem('commai_preferred_language');
      if (!saved) {
        localStorage.setItem('commai_preferred_language', user.preferred_languages[0]);
        setSelectedLanguage(user.preferred_languages[0]);
      }
    }
  }, [user]);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('comm-theme', newTheme);
  };

  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light-theme');
    } else {
      document.documentElement.classList.remove('light-theme');
    }
  }, [theme]);

  // Browser History Navigation Synchronization (popstate listener)
  useEffect(() => {
    const handlePopState = (event) => {
      if (event.state) {
        const { view: targetView, activeTab: targetTab } = event.state;
        if (targetView) setView(targetView);
        if (targetTab) setActiveTab(targetTab);
      } else {
        setView('landing');
        setActiveTab('dashboard');
      }
    };

    window.addEventListener('popstate', handlePopState);
    
    // Replace initial state so the first page load has a history entry
    window.history.replaceState({ view: 'landing', activeTab: 'dashboard' }, '', '');

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // Push state to browser history when view or activeTab changes
  useEffect(() => {
    const currentHistoryState = window.history.state;
    if (currentHistoryState) {
      if (currentHistoryState.view !== view || currentHistoryState.activeTab !== activeTab) {
        window.history.pushState({ view, activeTab }, '', '');
      }
    }
  }, [view, activeTab]);


  // Compile auth headers
  const authHeaders = {
    'Authorization': `Bearer ${token}`
  };

  const verifyToken = async (savedToken) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${savedToken}` }
      });
      if (!response.ok) {
        throw new Error('Session expired');
      }
      const userData = await response.json();
      
      if (userData.role === 'audience') {
        try {
          const profileRes = await fetch(`${BACKEND_URL}/api/auth/profile/audience`, {
            headers: { 'Authorization': `Bearer ${savedToken}` }
          });
          if (profileRes.ok) {
            const profileData = await profileRes.json();
            Object.assign(userData, profileData);
          }
        } catch (profileErr) {
          console.warn("Failed to fetch audience profile:", profileErr);
        }
      }

      setUser(userData);
      setToken(savedToken);
    } catch (err) {
      console.warn(err.message);
      handleLogout();
    } finally {
      setInitialLoading(false);
    }
  };

  useEffect(() => {
    const savedToken = sessionStorage.getItem('token');
    if (savedToken) {
      verifyToken(savedToken);
    } else {
      setInitialLoading(false);
    }
  }, []);

  const handleLoginSuccess = async (newToken, userData) => {
    sessionStorage.setItem('token', newToken);
    setToken(newToken);
    
    let mergedUser = { ...userData };
    if (userData.role === 'audience') {
      try {
        const profileRes = await fetch(`${BACKEND_URL}/api/auth/profile/audience`, {
          headers: { 'Authorization': `Bearer ${newToken}` }
        });
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          Object.assign(mergedUser, profileData);
        }
      } catch (profileErr) {
        console.warn("Failed to fetch audience profile on login:", profileErr);
      }
    }

    setUser(mergedUser);
    setActiveTab('dashboard');
  };

  const handleLogout = () => {
    sessionStorage.removeItem('token');
    setToken('');
    setUser(null);
    setActiveTab('dashboard');
    setView('landing');
    setViewRegister(false);
  };

  const [emergencyCount, setEmergencyCount] = useState(0);
  const [sosCount, setSosCount] = useState(0);
  const [queriesCount, setQueriesCount] = useState(0);
  const [unreadRepliesCount, setUnreadRepliesCount] = useState(0);
  const [bulletinCount, setBulletinCount] = useState(0);
  const [operatorChatCount, setOperatorChatCount] = useState(0);
  const [liveAlert, setLiveAlert] = useState(null);
  const [autofillPosterData, setAutofillPosterData] = useState(null);
  const [pendingVoicePlan, setPendingVoicePlan] = useState(null);
  const [pendingVoiceAlert, setPendingVoiceAlert] = useState(null);
  const [pendingOperatorChatTarget, setPendingOperatorChatTarget] = useState(null);
  const activeSirenRef = useRef(null);

  const handleAutoCreateCampaign = (plan) => {
    setPendingVoicePlan(plan);
    setActiveTab('campaigns');
  };

  const handleExecuteVoiceCommand = (voiceResult) => {
    if (!voiceResult) return;

    const targetTab = voiceResult.navigation_target || 'campaigns';

    // Special case for Sentiment Map emergency alert voice command
    if (targetTab === 'sentiment_map') {
      setPendingVoiceAlert({
        state: voiceResult.location_selected || 'Uttar Pradesh',
        title: voiceResult.title || 'Emergency Alert',
        description: voiceResult.description || voiceResult.body || 'Emergency alert for area.',
        recipients: voiceResult.recipients_selected || 'Students',
        urgency: voiceResult.urgency || 'critical',
        channels: (voiceResult.channels && voiceResult.channels.length > 0) ? voiceResult.channels : ['email'],
        user_confirmed: voiceResult.user_confirmed || false
      });
      setActiveTab('sentiment_map');
      return;
    }

    // For campaign/emergency/wizard actions, build a full voice plan and switch to campaigns
    const isCampaignAction = ['emergency_broadcast', 'create_campaign', 'send_alert'].includes(voiceResult.action) || voiceResult.open_wizard;

    if (isCampaignAction) {
      const voicePlan = voiceResult.full_plan
        ? { ...voiceResult.full_plan, _voice_filled: true }
        : {
            _voice_filled: true,
            campaign: {
              title: voiceResult.title || 'Voice Command Campaign',
              objective: voiceResult.objective || voiceResult.description || 'Generated via Voice Cockpit',
              campaign_type: voiceResult.category || (voiceResult.action === 'emergency_broadcast' ? 'emergency_alert' : 'awareness_drive'),
              description: voiceResult.description || ''
            },
            message: {
              subject: voiceResult.subject || `[${voiceResult.location_selected || 'Notice'}] ${voiceResult.title || 'Important Alert'}`,
              body: voiceResult.body || voiceResult.description || `Dear {{first_name}}, important notice for citizens in ${voiceResult.location_selected || 'your area'}.`
            },
            delivery: {
              channels: voiceResult.channels || ['email', 'push'],
              audiences: [voiceResult.recipients_selected || 'All Citizens'],
              location: voiceResult.location_selected || 'All Locations'
            },
            kpis: voiceResult.kpis || {
              expected_reach_pct: 88,
              ctr_goal_pct: 28,
              delivery_goal_pct: 98,
              awareness_goal_description: `Achieve high awareness for ${voiceResult.title || 'the campaign'}`
            },
            risks: voiceResult.risks || [],
            metadata: voiceResult.metadata || {
              confidence: 0.94,
              reasoning: { campaign_type: 'Voice command intent', channels: 'Selected for target demographic' },
              suggestions: ['Verify audience segment before dispatch']
            },
            user_confirmed: voiceResult.user_confirmed || false
          };


      setPendingVoicePlan(voicePlan);
      setActiveTab('campaigns');
    } else {
      // For navigation-only actions (approvals, audiences, operator_chat, etc.)
      if (targetTab === 'operator_chat') {
        setPendingOperatorChatTarget({
          channel: voiceResult.target_channel || 'general',
          targetManager: voiceResult.target_manager || null,
          initialMessage: voiceResult.message_text || voiceResult.body || null
        });
      }
      setActiveTab(targetTab);
    }
  };

  const activeTabRef = useRef(activeTab);
  useEffect(() => {
    activeTabRef.current = activeTab;
    if (activeTab === 'operator_chat') {
      setOperatorChatCount(0);
    }
  }, [activeTab]);

  // Audio Context reference & unlock listener for modern browsers
  const audioCtxRef = useRef(null);

  const getAudioContext = () => {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        audioCtxRef.current = new AudioCtx();
      }
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  };

  useEffect(() => {
    const handleUserInteraction = () => {
      getAudioContext();
    };
    window.addEventListener('click', handleUserInteraction);
    window.addEventListener('keydown', handleUserInteraction);
    return () => {
      window.removeEventListener('click', handleUserInteraction);
      window.removeEventListener('keydown', handleUserInteraction);
    };
  }, []);

  // Real-time Notification System & Audio Sound Settings
  const [notifications, setNotifications] = useState(() => {
    try {
      const saved = localStorage.getItem('commai_notifications');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.length > 0) return parsed;
      }
    } catch (e) {}
    // Default initial notification to show count badge immediately
    return [
      {
        id: 'init_welcome_1',
        type: 'info',
        title: '🔔 CommAI Gateway Active',
        message: 'Real-time alert engine connected and monitoring communications.',
        timestamp: new Date().toISOString(),
        read: false,
        linkTab: 'dashboard'
      }
    ];
  });

  const [notificationDrawerOpen, setNotificationDrawerOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem('comm_notification_sound') !== 'disabled';
  });
  const [notificationFilter, setNotificationFilter] = useState('all');

  const toggleSound = () => {
    const nextState = !soundEnabled;
    setSoundEnabled(nextState);
    localStorage.setItem('comm_notification_sound', nextState ? 'enabled' : 'disabled');
    if (nextState) {
      playSound('chime');
    }
  };

  // Play real-time audio sound alert using Web Audio API
  const playSound = (urgency = 'normal') => {
    if (localStorage.getItem('comm_notification_sound') === 'disabled') return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      const now = ctx.currentTime;
      if (urgency === 'critical' || urgency === 'emergency') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, now);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.55);
      } else if (urgency === 'chat' || urgency === 'message') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.4);
      } else {
        // High crisp double chime (D5 -> A5)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.18);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
        osc.start(now);
        osc.stop(now + 0.6);
      }
    } catch (e) {
      console.warn("Audio chime play error:", e);
    }
  };



  const addNotification = (item) => {
    const newNotif = {
      id: item.id || `notif_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      type: item.type || 'info',
      title: item.title || 'System Notification',
      message: item.message || '',
      timestamp: item.timestamp || new Date().toISOString(),
      read: false,
      linkTab: item.linkTab || null
    };

    setNotifications(prev => {
      if (prev.some(n => n.id === newNotif.id)) return prev;
      const updated = [newNotif, ...prev.slice(0, 49)];
      try { localStorage.setItem('commai_notifications', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });

    playSound(item.type);
  };

  const markAllNotificationsRead = () => {
    setNotifications(prev => {
      const updated = prev.map(n => ({ ...n, read: true }));
      try { localStorage.setItem('commai_notifications', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
  };

  const clearAllNotifications = () => {
    setNotifications([]);
    try { localStorage.setItem('commai_notifications', JSON.stringify([])); } catch (e) {}
  };

  const markNotificationRead = (id) => {
    setNotifications(prev => {
      const updated = prev.map(n => n.id === id ? { ...n, read: true } : n);
      try { localStorage.setItem('commai_notifications', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
  };

  const totalUnreadNotifications = notifications.filter(n => !n.read).length;

  // Play a synthesized dual-tone siren
  const playSiren = () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      const ctx = new AudioContext();
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);
      
      osc1.type = 'sawtooth';
      osc2.type = 'sine';
      
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      
      osc1.frequency.setValueAtTime(500, ctx.currentTime);
      osc2.frequency.setValueAtTime(500, ctx.currentTime);
      osc1.start();
      osc2.start();
      
      let high = true;
      const sweep = setInterval(() => {
        const time = ctx.currentTime;
        if (high) {
          osc1.frequency.exponentialRampToValueAtTime(900, time + 0.35);
          osc2.frequency.exponentialRampToValueAtTime(900, time + 0.35);
        } else {
          osc1.frequency.exponentialRampToValueAtTime(500, time + 0.35);
          osc2.frequency.exponentialRampToValueAtTime(500, time + 0.35);
        }
        high = !high;
      }, 400);
      
      return {
        stop: () => {
          clearInterval(sweep);
          try {
            osc1.stop();
            osc2.stop();
            ctx.close();
          } catch (e) {}
        }
      };
    } catch (e) {
      console.warn(e);
      return null;
    }
  };

  // Helper to interpolate template placeholders on frontend
  const interpolateFrontendText = useCallback((text) => {
    if (!text || !user) return text || '';
    
    const replacements = {
      first_name: user.first_name || user.full_name?.split(' ')[0] || '',
      last_name: user.last_name || user.full_name?.split(' ').slice(1).join(' ') || '',
      name: user.first_name || user.full_name || 'Citizen',
      place: user.city || user.district || user.state || 'your area',
      email: user.email || '',
      phone: user.phone || '',
      city: user.city || '',
      district: user.district || '',
      state: user.state || '',
      occupation: user.occupation || '',
      age: user.age ? String(user.age) : '',
      gender: user.gender || '',
      organization: user.organization || '',
      department: user.department || '',
      designation: user.designation || '',
    };

    let result = text;
    Object.entries(replacements).forEach(([key, value]) => {
      const regexDouble = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
      const regexSingle = new RegExp(`\\{\\s*${key}\\s*\\}`, 'gi');
      result = result.replace(regexDouble, value).replace(regexSingle, value);
    });
    
    return result;
  }, [user]);

  // Text to Speech
  const speakText = (text) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.85;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  };

  // Centralized WebSocket Connection
  useEffect(() => {
    if (!token || !user) return;

    const rawUrl = BACKEND_URL;
    const wsUrl = rawUrl.replace(/^http/, 'ws') + `/ws/bulletins?token=${encodeURIComponent(token)}`;

    let ws;
    let reconnectTimeout;
    let active = true;

    const connect = () => {
      if (!active) return;
      ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        if (!active) return;
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'campaign_alert') {
            setBulletinCount(prev => prev + 1);
            addNotification({
              type: 'bulletin',
              title: '📢 Live Bulletin Alert',
              message: data.title || data.message || 'New campaign bulletin broadcasted.',
              linkTab: 'live_bulletins'
            });
            
            // If critical/urgent, trigger popup alert modal
            if (data.urgency === 'critical' || data.urgency === 'urgent') {
              setLiveAlert({
                id: data.id,
                title: data.title || 'Emergency alert',
                message: data.message || data.description || '',
                urgency: data.urgency,
                created_at: data.created_at || new Date().toISOString(),
              });
            }
          } else if (data.type === 'emergency_contact') {
            if (user.role === 'admin' || user.role === 'campaign_manager') {
              setEmergencyCount(prev => prev + 1);
              addNotification({
                type: 'emergency',
                title: '🚨 Emergency Assistance Request',
                message: `New SOS emergency report from ${data.citizen_name || 'Citizen'}`,
                linkTab: 'emergency_inbox'
              });
            }
          } else if (data.type === 'operator_chat') {
            if (user.role === 'admin' || user.role === 'campaign_manager') {
              const isDm = data.channel && data.channel.startsWith('dm:');
              let isTargetOfDm = false;
              if (isDm) {
                const parts = data.channel.split(':');
                if (parts.length === 3 && (parts[1] === user.id || parts[2] === user.id)) {
                  isTargetOfDm = true;
                }
              }

              if (!isDm || isTargetOfDm) {
                if (data.sender_id !== user.id) {
                  if (activeTabRef.current !== 'operator_chat') {
                    setOperatorChatCount(prev => prev + 1);
                  }
                  addNotification({
                    id: `op_${data.id}_${Date.now()}`,
                    type: 'operator_chat',
                    title: isDm ? `🔒 Private DM from ${data.sender_name}` : `💬 Staff Chat (#${data.channel || 'general'})`,
                    message: isDm ? data.message : `${data.sender_name}: ${data.message}`,
                    timestamp: data.created_at || new Date().toISOString(),
                    linkTab: 'operator_chat'
                  });
                }
                window.dispatchEvent(new CustomEvent('commai_operator_chat_msg', { detail: data }));
              }
            }
          } else if (data.type === 'operator_chat_delete') {
            if (user.role === 'admin' || user.role === 'campaign_manager') {
              window.dispatchEvent(new CustomEvent('commai_operator_chat_delete', { detail: data }));
            }
          }
        } catch (err) {
          console.error('[WS] App message parse error:', err);
        }
      };

      ws.onclose = () => {
        if (active) {
          reconnectTimeout = setTimeout(connect, 4000);
        }
      };
    };

    connect();

    return () => {
      active = false;
      if (ws) ws.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [token, user]);

  // Handle active liveAlert sound/speech triggers
  useEffect(() => {
    if (liveAlert) {
      // Start warning siren
      if (activeSirenRef.current) activeSirenRef.current.stop();
      activeSirenRef.current = playSiren();
      
      // Speech
      setTimeout(() => {
        speakText(`Warning: ${interpolateFrontendText(liveAlert.title)}. ${interpolateFrontendText(liveAlert.message)}`);
      }, 400);
    } else {
      if (activeSirenRef.current) {
        activeSirenRef.current.stop();
        activeSirenRef.current = null;
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    }
  }, [liveAlert, interpolateFrontendText]);

  // Check for any unacknowledged emergency alerts on login / load
  useEffect(() => {
    if (!token || !user) return;
    if (user.role !== 'audience') return;

    const checkExistingEmergencies = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/poster/available`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          const emergencyFlyers = data.filter(p => p.category === 'emergency');
          if (emergencyFlyers.length > 0) {
            const latest = emergencyFlyers[0];
            const ackList = JSON.parse(localStorage.getItem('acknowledged_emergencies') || '[]');
            if (!ackList.includes(latest.id)) {
              setLiveAlert({
                id: latest.id,
                title: latest.title,
                message: latest.description,
                urgency: 'critical',
                created_at: latest.created_at
              });
            }
          }
        }
      } catch (err) {
        console.error('Error checking existing emergencies:', err);
      }
    };

    checkExistingEmergencies();
  }, [token, user]);

  // Reset bulletin count when live_bulletins is viewed, reset sosCount when sos_reports is viewed
  useEffect(() => {
    if (activeTab === 'live_bulletins') {
      setBulletinCount(0);
    }
    if (activeTab === 'sos_reports') {
      setSosCount(0);
    }
  }, [activeTab]);

  // Poll for admin/manager unread counts & sync notifications in real-time
  useEffect(() => {
    if (!token || !user) return;
    if (user.role !== 'admin' && user.role !== 'campaign_manager') return;

    const fetchCount = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/emergency-contact?status_filter=open`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setEmergencyCount(data.length);

          // Real-time sync open items to notifications
          data.forEach(item => {
            addNotification({
              id: `ec_${item.id}`,
              type: 'emergency',
              title: '🚨 Emergency Assistance Request',
              message: `${item.citizen_name || 'Citizen'}: ${item.message || 'Urgent SOS assistance requested'} (${item.category || 'General'})`,
              timestamp: item.created_at || new Date().toISOString(),
              linkTab: 'emergency_inbox'
            });
          });
        }
      } catch (err) {
        console.error('Error fetching emergency count:', err);
      }
    };

    const fetchSosCount = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/sos?status_filter=reported`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setSosCount(data.length);
        }
      } catch (err) {
        console.error('Error fetching SOS count:', err);
      }
    };

    const fetchQueriesCount = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/queries?status_filter=open`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setQueriesCount(data.length);

          // Real-time sync open queries to notifications
          data.forEach(item => {
            addNotification({
              id: `query_${item.id}`,
              type: 'query',
              title: '💬 Support Query Pending',
              message: `${item.name || 'Citizen'}: ${item.subject || item.message || 'Support query awaiting response'}`,
              timestamp: item.created_at || new Date().toISOString(),
              linkTab: 'support_queries'
            });
          });
        }
      } catch (err) {
        console.error('Error fetching queries count:', err);
      }
    };

    fetchCount();
    fetchSosCount();
    fetchQueriesCount();
    const interval = setInterval(() => {
      fetchCount();
      fetchSosCount();
      fetchQueriesCount();
    }, 5000);
    return () => clearInterval(interval);
  }, [token, user]);

  // Poll for audience unread replies
  useEffect(() => {
    if (!token || !user) return;
    if (user.role !== 'audience') return;

    const fetchUnreadReplies = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/emergency-contact`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          let combinedData = data;
          
          try {
            const queriesResponse = await fetch(`${BACKEND_URL}/api/queries`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (queriesResponse.ok) {
              const queriesData = await queriesResponse.json();
              combinedData = [...combinedData, ...queriesData];
            }
          } catch (qErr) {
            console.error('Error polling support queries:', qErr);
          }

          const ackList = JSON.parse(localStorage.getItem('acknowledged_emergencies') || '[]');
          const unread = combinedData.filter(ec => ec.status === 'resolved' && ec.admin_reply && !ackList.includes(ec.id));
          
          setUnreadRepliesCount(unread.length);
        }
      } catch (err) {
        console.error('Error fetching unread replies:', err);
      }
    };

    fetchUnreadReplies();
    const interval = setInterval(fetchUnreadReplies, 5000);
    return () => clearInterval(interval);
  }, [token, user]);

  if (initialLoading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100vw',
        height: '100vh',
        backgroundColor: '#090b14',
        color: 'hsl(187, 92%, 50%)',
        fontSize: '1.25rem',
        fontWeight: 'bold',
        fontFamily: 'sans-serif'
      }}>
        Initializing CommAI Services...
      </div>
    );
  }

  if (!token || !user) {
    if (view === 'landing') {
      return (
        <Landing 
          theme={theme}
          toggleTheme={toggleTheme}
          onNavigateToLogin={() => {
            setView('login');
            setViewRegister(false);
          }}
          onNavigateToRegister={() => {
            setView('login');
            setViewRegister(true);
          }}
        />
      );
    }
    return (
      <Login 
        theme={theme}
        toggleTheme={toggleTheme}
        onLoginSuccess={handleLoginSuccess} 
        backendUrl={BACKEND_URL} 
        onBackToLanding={() => setView('landing')}
        initialRegister={viewRegister}
      />
    );
  }

  const renderActiveView = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <Dashboard
            user={user}
            setActiveTab={setActiveTab}
            backendUrl={BACKEND_URL}
            headers={authHeaders}
            token={token}
            bulletinCount={bulletinCount}
          />
        );
      case 'audiences':
        return (
          <Audiences
            user={user}
            backendUrl={BACKEND_URL}
            headers={authHeaders}
          />
        );
      case 'templates':
        return (
          <Templates
            user={user}
            backendUrl={BACKEND_URL}
            headers={authHeaders}
          />
        );
      case 'campaigns':
        return (
          <Campaigns
            user={user}
            backendUrl={BACKEND_URL}
            headers={authHeaders}
            setActiveTab={setActiveTab}
            setAutofillPosterData={setAutofillPosterData}
            initialVoicePlan={pendingVoicePlan}
            clearInitialVoicePlan={() => setPendingVoicePlan(null)}
          />
        );
      case 'approvals':
        if (user.role !== 'admin') return <div className="glass-card" style={{ padding: '24px', margin: '24px', color: 'hsl(var(--danger))' }}>Access Denied: Approvals queue restricted to Administrators.</div>;
        return (
          <Approvals
            user={user}
            backendUrl={BACKEND_URL}
            headers={authHeaders}
          />
        );
      case 'audit_logs':
        if (user.role !== 'admin') return <div className="glass-card" style={{ padding: '24px', margin: '24px', color: 'hsl(var(--danger))' }}>Access Denied: Audit trails restricted to Administrators.</div>;
        return (
          <AuditLogs
            user={user}
            backendUrl={BACKEND_URL}
            headers={authHeaders}
          />
        );
      case 'users':
        return (
          <Users
            user={user}
            backendUrl={BACKEND_URL}
            headers={authHeaders}
          />
        );
      case 'managers':
        if (user.role !== 'admin') return <div className="glass-card" style={{ padding: '24px', margin: '24px', color: 'hsl(var(--danger))' }}>Access Denied: Campaign Managers directory restricted to Administrators.</div>;
        return (
          <Managers
            user={user}
            backendUrl={BACKEND_URL}
            headers={authHeaders}
          />
        );
      case 'settings':
        return (
          <Settings
            user={user}
            backendUrl={BACKEND_URL}
            headers={authHeaders}
          />
        );
      case 'sos_reports':
        return (
          <SOSReports
            user={user}
            backendUrl={BACKEND_URL}
            headers={authHeaders}
            setActiveTab={setActiveTab}
          />
        );
      case 'emergency_inbox':
        if (user.role !== 'admin' && user.role !== 'campaign_manager') {
          return <div className="glass-card" style={{ padding: '24px', margin: '24px', color: 'hsl(var(--danger))' }}>Access Denied: Restricted to operators.</div>;
        }
        return (
          <EmergencyInbox
            user={user}
            backendUrl={BACKEND_URL}
            headers={authHeaders}
          />
        );
      case 'feedback':
        return (
          <Feedback
            user={user}
            backendUrl={BACKEND_URL}
            headers={authHeaders}
            unreadRepliesCount={unreadRepliesCount}
            setUnreadRepliesCount={setUnreadRepliesCount}
          />
        );
      case 'fact_shield':
        if (user.role !== 'admin' && user.role !== 'campaign_manager') {
          return <div className="glass-card" style={{ padding: '24px', margin: '24px', color: 'hsl(var(--danger))' }}>Access Denied: Fact Shield restricted to operators.</div>;
        }
        return (
          <FactShield
            user={user}
            backendUrl={BACKEND_URL}
            headers={authHeaders}
            setActiveTab={setActiveTab}
          />
        );
      case 'support_queries':
        if (user.role !== 'admin' && user.role !== 'campaign_manager') {
          return <div className="glass-card" style={{ padding: '24px', margin: '24px', color: 'hsl(var(--danger))' }}>Access Denied: Restricted to operators.</div>;
        }
        return (
          <SupportQueries
            user={user}
            backendUrl={BACKEND_URL}
            headers={authHeaders}
          />
        );
      case 'poster_studio':
        if (user.role !== 'admin' && user.role !== 'campaign_manager') {
          return <div className="glass-card" style={{ padding: '24px', margin: '24px', color: 'hsl(var(--danger))' }}>Access Denied: Poster Studio restricted to operators.</div>;
        }
        return (
          <PosterStudio
            user={user}
            backendUrl={BACKEND_URL}
            headers={authHeaders}
            autofillPosterData={autofillPosterData}
            setAutofillPosterData={setAutofillPosterData}
          />
        );
      case 'sentiment_map':
        if (user.role !== 'admin' && user.role !== 'campaign_manager') {
          return <div className="glass-card" style={{ padding: '24px', margin: '24px', color: 'hsl(var(--danger))' }}>Access Denied: Sentiment Map restricted to operators.</div>;
        }
        return (
          <SentimentMap
            user={user}
            backendUrl={BACKEND_URL}
            headers={authHeaders}
            setActiveTab={setActiveTab}
            setAutofillPosterData={setAutofillPosterData}
            initialVoiceAlert={pendingVoiceAlert}
            clearInitialVoiceAlert={() => setPendingVoiceAlert(null)}
          />
        );
      case 'citizen_conversations':
        return (
          <CitizenConversations
            user={user}
            backendUrl={BACKEND_URL}
            headers={authHeaders}
          />
        );
      case 'live_bulletins':
        return (
          <LiveBulletins
            backendUrl={BACKEND_URL}
            user={user}
            token={token}
          />
        );
      case 'operator_chat':
        if (user.role !== 'admin' && user.role !== 'campaign_manager') {
          return <div className="glass-card" style={{ padding: '24px', margin: '24px', color: 'hsl(var(--danger))' }}>Access Denied: Operator Staff Chat is strictly restricted to Admins and Campaign Managers.</div>;
        }
        return (
          <OperatorChat
            user={user}
            backendUrl={BACKEND_URL}
            headers={authHeaders}
            initialChannel={pendingOperatorChatTarget?.channel}
            initialTargetManager={pendingOperatorChatTarget?.targetManager}
            initialMessage={pendingOperatorChatTarget?.initialMessage}
          />
        );
      default:
        return <div>Tab not found</div>;
    }
  };

  const getHeaderBreadcrumb = () => {
    switch (activeTab) {
      case 'dashboard': return { category: 'Core Dashboard', item: user?.role === 'audience' ? 'Your Portal' : 'Overview' };
      case 'live_bulletins': return { category: 'Core Dashboard', item: 'Live Bulletins' };
      
      case 'campaigns': return { category: 'Campaigns & Broadcasts', item: 'Wizard' };
      case 'templates': return { category: 'Campaigns & Broadcasts', item: 'Templates Library' };
      case 'approvals': return { category: 'Campaigns & Broadcasts', item: 'Approvals Queue' };
      case 'poster_studio': return { category: 'Campaigns & Broadcasts', item: 'Poster Studio' };
      
      case 'audiences': return { category: 'Audience & Insights', item: 'Audience & Segments' };
      case 'users': return { category: 'Audience & Insights', item: 'Audience Directory' };
      case 'sentiment_map': return { category: 'Audience & Insights', item: 'Sentiment Alarms Map' };
      case 'feedback': return { category: 'Audience & Insights', item: 'Campaign Feedback' };
      
      case 'sos_reports': return { category: 'Emergency Operations', item: 'SOS Reports' };
      case 'emergency_inbox': return { category: 'Emergency Operations', item: 'Emergency Inbox' };
      case 'fact_shield': return { category: 'Emergency Operations', item: 'AI Fact Shield' };
      
      case 'operator_chat': return { category: 'Help Desk & Chat', item: 'Operator Staff Chat' };
      case 'support_queries': return { category: 'Help Desk & Chat', item: 'Support Queries Desk' };
      case 'citizen_conversations': return { category: 'Help Desk & Chat', item: 'Citizen Chat' };
      
      case 'managers': return { category: 'System Governance', item: 'Managers Directory' };
      case 'audit_logs': return { category: 'System Governance', item: 'Audit Trail Logs' };
      
      case 'settings': return { category: 'Preferences', item: 'System Settings' };
      
      default: return { category: 'CommAI', item: 'Platform' };
    }
  };


  return (
    <div className={`app-container ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${mobileSidebarOpen ? 'sidebar-mobile-open' : ''}`}>
      {mobileSidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setMobileSidebarOpen(false)}></div>
      )}
      <Sidebar
        user={user}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLogout={handleLogout}
        sidebarCollapsed={sidebarCollapsed}
        setSidebarCollapsed={setSidebarCollapsed}
        closeMobileSidebar={() => setMobileSidebarOpen(false)}
        emergencyCount={user?.role === 'audience' ? unreadRepliesCount : emergencyCount}
        sosCount={sosCount}
        queriesCount={queriesCount}
        bulletinCount={bulletinCount}
        operatorChatCount={operatorChatCount}
      />
      <div className="main-content">
        <header className="header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Mobile Toggle Button */}
            <button 
              className="icon-btn mobile-menu-btn" 
              onClick={() => {
                const willOpen = !mobileSidebarOpen;
                setMobileSidebarOpen(willOpen);
                if (willOpen) setSidebarCollapsed(false);
              }}
              title="Toggle Navigation Menu"
            >
              {mobileSidebarOpen ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              )}
            </button>

            {/* Desktop Toggle Button */}
            <button 
              className="icon-btn desktop-menu-btn" 
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              title={sidebarCollapsed ? "Expand Navigation Sidebar" : "Collapse Navigation Sidebar"}
            >
              {sidebarCollapsed ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              )}
            </button>

            <h2 className="header-title" style={{ fontSize: '1.35rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', margin: 0, letterSpacing: '-0.01em' }}>
              <span className="header-breadcrumb-category" style={{ color: 'hsl(var(--text-secondary))', fontWeight: '500' }}>{getHeaderBreadcrumb().category}</span>
              <svg className="header-breadcrumb-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'hsl(var(--text-secondary))', opacity: 0.6 }}><polyline points="9 18 15 12 9 6"></polyline></svg>
              <span className="header-breadcrumb-item">{getHeaderBreadcrumb().item}</span>
            </h2>
          </div>

          <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '0.9rem', color: 'hsl(var(--text-secondary))' }}>
            <span className="header-date" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'hsl(var(--primary))', width: '1.1rem', height: '1.1rem' }}>
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              {new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
            <span className="header-date" style={{ height: '14px', width: '1px', background: 'var(--border-color-glass)' }}></span>
            
            {/* Custom Theme Switch Pill */}
            <div 
              className={`theme-switch-pill ${theme}`} 
              onClick={toggleTheme} 
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            >
              <div className="theme-switch-slider"></div>
              <div className="theme-switch-icon dark-icon">
                <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '14px', height: '14px' }}>
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              </div>
              <div className="theme-switch-icon light-icon">
                <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '14px', height: '14px' }}>
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              </div>
            </div>
            
            <span className="header-divider" style={{ height: '14px', width: '1px', background: 'var(--border-color-glass)' }}></span>
            
            {/* Notification Bell Symbol & Drawer (Placed after theme symbols) */}
            <div className="notification-container" style={{ position: 'relative' }}>
              <button 
                className="notification-bell-btn" 
                onClick={() => {
                  if ('Notification' in window && Notification.permission !== 'granted') {
                    Notification.requestPermission();
                  }
                  setNotificationDrawerOpen(!notificationDrawerOpen);
                }}
                title={`Notifications (${totalUnreadNotifications} Unread)`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px' }}>
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {totalUnreadNotifications > 0 && (
                  <span className="notification-badge-pulse" style={{
                    position: 'absolute',
                    top: '-4px',
                    right: '-4px',
                    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                    color: '#ffffff',
                    fontSize: '0.68rem',
                    fontWeight: '800',
                    minWidth: '18px',
                    height: '18px',
                    borderRadius: '9px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 4px',
                    border: '2px solid var(--bg-dark, #090b14)'
                  }}>
                    {totalUnreadNotifications > 99 ? '99+' : totalUnreadNotifications}
                  </span>
                )}
              </button>

              {notificationDrawerOpen && (
                <>
                  <div className="dropdown-backdrop" onClick={() => setNotificationDrawerOpen(false)} />
                  <div className="notification-drawer-card">
                    <div className="notification-drawer-header">
                      <div className="notification-drawer-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px', color: 'hsl(var(--primary))' }}>
                          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                        </svg>
                        <span>Notifications</span>
                        {totalUnreadNotifications > 0 && (
                          <span className="badge badge-admin" style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '10px' }}>
                            {totalUnreadNotifications} new
                          </span>
                        )}
                      </div>

                      <div className="notification-drawer-actions">
                        <button
                          className="notif-action-btn"
                          onClick={() => {
                            playSound('critical');
                            addNotification({
                              type: 'bulletin',
                              title: '🔔 Live Sound & Alert Verified',
                              message: 'Real-time notification audio chime and count badge working smoothly!',
                              linkTab: 'dashboard'
                            });
                          }}
                          title="Test Real-Time Notification Sound & Count"
                          style={{ color: 'hsl(var(--primary))', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          ▶ Test Sound
                        </button>

                        <button 
                          className="notif-action-btn" 
                          onClick={toggleSound}
                          title={soundEnabled ? "Mute Sound Alerts" : "Enable Sound Alerts"}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          {soundEnabled ? '🔔 Sound ON' : '🔕 Sound OFF'}
                        </button>
                        {notifications.length > 0 && (
                          <>
                            <button className="notif-action-btn" onClick={markAllNotificationsRead}>Mark read</button>
                            <button className="notif-action-btn" onClick={clearAllNotifications}>Clear</button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="notification-tabs">
                      <button 
                        className={`notif-tab-btn ${notificationFilter === 'all' ? 'active' : ''}`}
                        onClick={() => setNotificationFilter('all')}
                      >
                        All ({notifications.length})
                      </button>
                      <button 
                        className={`notif-tab-btn ${notificationFilter === 'emergency' ? 'active' : ''}`}
                        onClick={() => setNotificationFilter('emergency')}
                      >
                        🚨 Emergencies ({notifications.filter(n => n.type === 'emergency').length})
                      </button>
                      <button 
                        className={`notif-tab-btn ${notificationFilter === 'bulletin' ? 'active' : ''}`}
                        onClick={() => setNotificationFilter('bulletin')}
                      >
                        📢 Bulletins ({notifications.filter(n => n.type === 'bulletin').length})
                      </button>
                      <button 
                        className={`notif-tab-btn ${notificationFilter === 'query' ? 'active' : ''}`}
                        onClick={() => setNotificationFilter('query')}
                      >
                        💬 Queries ({notifications.filter(n => n.type === 'query').length})
                      </button>
                      {(user?.role === 'admin' || user?.role === 'campaign_manager') && (
                        <button 
                          className={`notif-tab-btn ${notificationFilter === 'operator_chat' ? 'active' : ''}`}
                          onClick={() => setNotificationFilter('operator_chat')}
                        >
                          💬 Staff Chat ({notifications.filter(n => n.type === 'operator_chat').length})
                        </button>
                      )}
                    </div>

                    <div className="notif-list">
                      {notifications
                        .filter(n => notificationFilter === 'all' || n.type === notificationFilter)
                        .map(notif => (
                          <div 
                            key={notif.id}
                            className={`notif-item ${!notif.read ? 'unread' : ''}`}
                            onClick={() => {
                              markNotificationRead(notif.id);
                              if (notif.linkTab) {
                                setActiveTab(notif.linkTab);
                                setNotificationDrawerOpen(false);
                              }
                            }}
                          >
                            <div className={`notif-icon-box notif-icon-${notif.type || 'info'}`}>
                              {notif.type === 'emergency' ? '🚨' : notif.type === 'bulletin' ? '📢' : (notif.type === 'query' || notif.type === 'operator_chat') ? '💬' : 'ℹ️'}
                            </div>

                            <div className="notif-content">
                              <div className="notif-title">
                                <span>{notif.title}</span>
                                {!notif.read && <span className="notif-unread-dot" />}
                              </div>
                              <div className="notif-message">{notif.message}</div>
                              <div className="notif-time">
                                {new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>
                          </div>
                        ))}

                      {notifications.filter(n => notificationFilter === 'all' || n.type === notificationFilter).length === 0 && (
                        <div className="notif-empty">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: '32px', height: '32px', opacity: 0.5 }}>
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                          </svg>
                          <span>No notifications in this category</span>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
            
            <span className="header-divider" style={{ height: '14px', width: '1px', background: 'var(--border-color-glass)' }}></span>
            
            {/* Profile settings dropdown */}
            <div className="profile-dropdown-container">
              <div 
                className="profile-avatar-btn" 
                onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                title={`${user?.full_name} — Profile & Settings`}
                style={{ overflow: 'hidden', padding: 0 }}
              >
                <img src="/logo.jpeg" alt="User Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              
              {profileMenuOpen && (
                <>
                  <div className="dropdown-backdrop" onClick={() => setProfileMenuOpen(false)} />
                  <div className="profile-dropdown-card">
                    <div className="profile-dropdown-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                        <img src="/logo.jpeg" alt="CommAI Logo" style={{ width: '22px', height: '22px', borderRadius: '4px', objectFit: 'cover' }} />
                        <span style={{ fontWeight: 800, fontSize: '0.8rem', color: 'hsl(var(--text-primary))', textTransform: 'uppercase', letterSpacing: '0.04em' }}>CommAI Gateway</span>
                      </div>
                      <span className="profile-dropdown-name">{user?.full_name}</span>
                      <span className="profile-dropdown-email">{user?.email}</span>
                      <span className="profile-dropdown-org">{user?.organization || 'General Public Services'}</span>
                      <span className={`badge badge-${user?.role === 'admin' ? 'admin' : user?.role === 'campaign_manager' ? 'manager' : 'audience'}`} style={{ textTransform: 'capitalize', width: 'fit-content', marginTop: '6px' }}>
                        {user?.role === 'admin' ? 'Admin' : user?.role === 'campaign_manager' ? 'Manager' : 'Audience'}
                      </span>
                    </div>
                    
                    <button 
                      className="profile-dropdown-item" 
                      onClick={() => {
                        setActiveTab('settings');
                        setProfileMenuOpen(false);
                      }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                      </svg>
                      Profile Settings
                    </button>
                    
                    <button 
                      className="profile-dropdown-item logout" 
                      onClick={() => {
                        setProfileMenuOpen(false);
                        handleLogout();
                      }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                      </svg>
                      Log Out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>
        <main className="view-container">
          {renderActiveView()}
        </main>
      </div>
      <ChatbotWidget 
        user={user} 
        backendUrl={BACKEND_URL} 
        token={token} 
        onAutoCreateCampaign={handleAutoCreateCampaign} 
        setActiveTab={setActiveTab}
        onExecuteVoiceCommand={handleExecuteVoiceCommand}
      />
      <VoiceCommandCenter
        user={user}
        backendUrl={BACKEND_URL}
        token={token}
        activeTab={activeTab}
        onExecuteVoiceCommand={handleExecuteVoiceCommand}
      />
      <BottomNavBar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        unreadNotifCount={totalUnreadNotifications}
        emergencyCount={user?.role === 'audience' ? unreadRepliesCount : emergencyCount}
        closeMobileSidebar={() => setMobileSidebarOpen(false)}
      />
      
      {liveAlert && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(5, 7, 13, 0.9)',
          backdropFilter: 'blur(16px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999999,
          padding: '24px',
          animation: 'fadeIn 0.3s ease'
        }}>
          <div style={{
            position: 'relative',
            width: '100%',
            maxWidth: '560px',
            background: 'rgba(239, 68, 68, 0.05)',
            border: '2px solid #ef4444',
            boxShadow: '0 0 30px rgba(239, 68, 68, 0.3)',
            borderRadius: '20px',
            padding: '36px',
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
            color: 'white',
            backdropFilter: 'blur(8px)',
            animation: 'scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
            overflow: 'hidden'
          }}>
            <div style={{
              position: 'absolute',
              top: '-60px',
              right: '-60px',
              width: '180px',
              height: '180px',
              background: 'rgba(239, 68, 68, 0.2)',
              borderRadius: '50%',
              filter: 'blur(60px)',
              pointerEvents: 'none'
            }}></div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{
                background: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                borderRadius: '12px',
                width: '54px',
                height: '54px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2.2rem',
                animation: 'pulse 1s infinite'
              }}>
                🚨
              </div>
              <div>
                <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.1em' }}>CRITICAL EMERGENCY ALERT</span>
                <h3 style={{ margin: '4px 0 0', fontSize: '1.4rem', fontWeight: '800', letterSpacing: '-0.02em', color: '#f1f5f9' }}>{interpolateFrontendText(liveAlert.title)}</h3>
              </div>
            </div>

            <div style={{
              background: 'rgba(15, 23, 42, 0.95)',
              borderRadius: '12px',
              padding: '20px',
              border: '1.5px solid rgba(255, 255, 255, 0.2)',
              lineHeight: '1.7',
              fontSize: '1.08rem',
              color: '#ffffff',
              fontWeight: 700,
              maxHeight: '240px',
              overflowY: 'auto',
              boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.5)'
            }}>
              <span style={{ color: '#ffffff', fontWeight: 700 }}>
                {interpolateFrontendText(liveAlert.message)}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: '#ffffff', fontWeight: 600 }}>
              <span style={{ display: 'inline-flex', gap: '2px', alignItems: 'center' }}>
                <span className="speech-bar" style={{ width: '3px', height: '12px', background: '#ef4444', display: 'inline-block', animation: 'bounceBar 0.8s infinite ease-in-out' }}></span>
                <span className="speech-bar" style={{ width: '3px', height: '18px', background: '#ef4444', display: 'inline-block', animation: 'bounceBar 0.8s infinite 0.2s ease-in-out' }}></span>
                <span className="speech-bar" style={{ width: '3px', height: '10px', background: '#ef4444', display: 'inline-block', animation: 'bounceBar 0.8s infinite 0.4s ease-in-out' }}></span>
              </span>
              <span style={{ color: '#ffffff', fontWeight: 700 }}>Reading message aloud...</span>
            </div>

            <button
              onClick={() => {
                const ackList = JSON.parse(localStorage.getItem('acknowledged_emergencies') || '[]');
                ackList.push(liveAlert.id);
                localStorage.setItem('acknowledged_emergencies', JSON.stringify(ackList));
                setLiveAlert(null);
              }}
              style={{
                width: '100%',
                padding: '16px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                color: 'white',
                border: 'none',
                fontSize: '1.05rem',
                fontWeight: '700',
                cursor: 'pointer',
                boxShadow: '0 4px 15px rgba(239, 68, 68, 0.4)',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(239, 68, 68, 0.6)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 15px rgba(239, 68, 68, 0.4)'; }}
            >
              Acknowledge & Close Alert
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { transform: scale(0.9); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        @keyframes bounceBar {
          0%, 100% { transform: scaleY(1); }
          50% { transform: scaleY(1.8); }
        }
      `}</style>
    </div>
  );
}

export default App;
