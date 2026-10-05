import React, { useState, useEffect } from 'react';
import VoiceBulletinPlayer from '../components/VoiceBulletinPlayer';

/* ─────────────────────────────────────────────
   Landing Page — CommAI
   • Enables page scroll via html.landing-active
   • Smooth-scrolls to sections on nav-link click
   • Light, premium product design
───────────────────────────────────────────── */

const LANGS = ['Hindi', 'Marathi', 'Tamil', 'Bengali', 'Telugu', 'Kannada'];

const FOOTER_RESOURCES = {
  'API Documentation': {
    eyebrow: 'Developer tools',
    title: 'API Documentation',
    body: 'CommAI APIs use JSON payloads and bearer-token authentication. Integrate audience segments, templates, campaigns, delivery status, and audit records with your approved service account.',
    details: ['Base URL: your CommAI deployment URL', 'Authentication: Bearer token', 'Formats: JSON requests and responses'],
  },
  'Developer sandbox': {
    eyebrow: 'Developer tools',
    title: 'Developer sandbox',
    body: 'Use the interactive campaign simulator on this page to model audience reach, language selection, and delivery channels before connecting a production integration.',
    details: ['No messages are sent from the simulator', 'Choose a segment, language, and channels', 'Estimated reach updates from your selected channels'],
    action: { label: 'Open interactive sandbox', target: 'simulator' },
  },
  Changelog: {
    eyebrow: 'Developer tools',
    title: 'Changelog',
    body: 'Recent platform updates include the interactive campaign simulator, delivery reach estimator, citizen feedback workflows, and integration diagnostics for connected services.',
    details: ['Campaign planning and message safety improvements', 'Expanded multilingual communication support', 'Operational diagnostics and audit-trail enhancements'],
  },
  'Integration Diagnostics': {
    eyebrow: 'Developer tools',
    title: 'Integration Diagnostics',
    body: 'Diagnostics are available to authorised operators in the platform settings. They check service connectivity and help validate SMTP, SMS gateway, and AI service configuration.',
    details: ['Available after operator sign-in', 'Checks connection status and latency', 'Does not dispatch campaigns or messages'],
  },
  'DPDP Act Privacy Policy': {
    eyebrow: 'Compliance',
    title: 'DPDP Act Privacy Policy',
    body: 'CommAI processes personal data only for authorised public-information and campaign-delivery purposes. Access is role-based, activity is auditable, and data handling follows applicable DPDP obligations.',
    details: ['Purpose limitation and data minimisation', 'Role-based access and audit logs', 'Consent and communication preferences are recorded'],
  },
  'Terms of Service': {
    eyebrow: 'Compliance',
    title: 'Terms of Service',
    body: 'Use CommAI only for authorised, lawful communications. Account holders are responsible for campaign content, recipient permissions, and protecting their credentials.',
    details: ['Use approved audience segments only', 'Keep account credentials secure', 'Follow applicable communications and privacy requirements'],
  },
  'Maker-Checker Guidelines': {
    eyebrow: 'Compliance',
    title: 'Maker-Checker Guidelines',
    body: 'High-impact and emergency campaigns are subject to a four-eye review. A maker prepares the campaign, while an authorised checker independently approves or rejects it before dispatch.',
    details: ['Required for emergency and high-reach campaigns', 'Approval decisions are recorded in the audit trail', 'Rejected campaigns must be corrected and resubmitted'],
  },
  'Consent registers': {
    eyebrow: 'Compliance',
    title: 'Consent registers',
    body: 'Consent registers help operators maintain a traceable record of recipient communication permissions and preferences for each approved communication channel.',
    details: ['Record consent status by recipient and channel', 'Respect opt-outs and suppression lists', 'Review registers before sending campaigns'],
  },
};

const TRANSLATIONS = {
  farmers: {
    Hindi:   'प्रिय किसान, कृषि विभाग ने भारी बारिश की चेतावनी दी है। अपनी फसल सुरक्षित करें।',
    Marathi: 'प्रिय शेतकरी, कृषी विभागाने मुसळधार पावसाचा इशारा दिला आहे. पीक सुरक्षित ठेवा.',
    Tamil:   'அன்புள்ள விவசாயி, கடுமையான மழை எச்சரிக்கை விடுத்துள்ளது. பயிர்களைப் பாதுகாக்கவும்.',
    Bengali: 'প্রিয় কৃষক, ভারী বৃষ্টির সতর্কতা দেওয়া হয়েছে। অনুগ্রহ করে ফসল সুরক্ষিত রাখুন।',
    Telugu:  'ప్రియమైన రైతు, భారీ వర్షాల హెచ్చరిక జారీ చేయబడింది. పంటలను రక్షించుకోండి.',
    Kannada: 'ಆತ್ಮೀಯ ರೈತ, ಭಾರೀ ಮಳೆ ಎಚ್ಚರಿಕೆ ನೀಡಲಾಗಿದೆ. ಬೆಳೆ ಸುರಕ್ಷಿತ ಇರಿಸಿ.',
  },
  students: {
    Hindi:   'अलर्ट: प्रशासनिक आदेशों से कल सभी विद्यालय बंद रहेंगे। परीक्षाएं स्थगित हैं।',
    Marathi: 'अलर्ट: उद्या सर्व शाळा बंद राहतील. परीक्षा पुढे ढकलण्यात आल्या आहेत.',
    Tamil:   'எச்சரிக்கை: நாளை அனைத்து பள்ளிகளும் மூடப்படும். தேர்வுகள் மாற்றியமைக்கப்பட்டுள்ளன.',
    Bengali: 'সতর্কতা: আগামীকাল সকল বিদ্যালয় বন্ধ। পরীক্ষা পুনঃতফসিল করা হয়েছে।',
    Telugu:  'హెచ్చరిక: రేపు అన్ని పాఠశాలలు మూసివేయబడతాయి. పరీక్షలు వాయిదా పడ్డాయి.',
    Kannada: 'ಎಚ್ಚರಿಕೆ: ನಾಳೆ ಎಲ್ಲ ಶಾಲೆಗಳು ಬಂದ್. ಪರೀಕ್ಷೆಗಳನ್ನು ಮುಂದೂಡಲಾಗಿದೆ.',
  },
  health: {
    Hindi:   'टीकाकरण शिविर: इस शुक्रवार, सुबह 9 बजे से, उप-जिला अस्पताल में मुफ्त टीका उपलब्ध।',
    Marathi: 'लसीकरण शिबिर: या शुक्रवारी सकाळी ९ वाजल्यापासून उपजिल्हा रुग्णालयात विनामूल्य लस.',
    Tamil:   'தடுப்பூசி முகாம்: இந்த வெள்ளிக்கிழமை காலை 9 மணி முதல் இலவச தடுப்பூசி.',
    Bengali: 'টিকাকরণ শিবির: এই শুক্রবার সকাল ৯টা থেকে বিনামূল্যে টিকা পাওয়া যাবে।',
    Telugu:  'వ్యాక్సినేషన్ క్యాంప్: ఈ శుక్రవారం ఉదయం 9 నుండి ఉచిత వ్యాక్సినేషన్ అందుబాటులో ఉంది.',
    Kannada: 'ಲಸಿಕೆ ಶಿಬಿರ: ಈ ಶುಕ್ರವಾರ ಬೆಳಿಗ್ಗೆ 9 ಗಂಟೆಯಿಂದ ಉಚಿತ ಲಸಿಕೆ ಲಭ್ಯ.',
  },
};

const SEGMENTS = {
  farmers: { label: 'Farmers', emoji: '🌾', size: 14500, region: 'Maharashtra & Bihar' },
  students: { label: 'Students', emoji: '🎓', size: 8200, region: 'Uttar Pradesh & Delhi' },
  health: { label: 'Health Workers', emoji: '🏥', size: 48900, region: 'Pan India' },
};

const FEATURES = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        <line x1="12" y1="19" x2="12" y2="23"/>
        <line x1="8" y1="23" x2="16" y2="23"/>
      </svg>
    ),
    accent: '#8b5cf6', bg: '#f3e8ff',
    title: 'Jarvis AI Voice Cockpit',
    desc: 'Hands-free voice assistant. Control campaign creation, target segments, send staff messages, issue state emergency alerts, and audit approvals using natural speech and "Hey Jarvis" wake word.',
    badge: 'FLAGSHIP 🔥',
    isKiller: true,
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    ),
    accent: '#dc2626', bg: '#fef2f2',
    title: 'AI Fact Shield',
    desc: 'Misinformation defense hub. Monitor social rumors, perform vector database lookups, generate automated fact-checking campaigns, and route them to the approvals queue.',
    badge: 'NEW 🛡️',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>
    ),
    accent: '#0891b2', bg: '#ecfeff',
    title: 'AI Poster Studio',
    desc: 'Visual campaign generation. Compose public warning flyers, banners, and infographics in any regional language with dark/light themes and instant custom typography canvas overlays.',
    badge: 'CREATIVE 🎨',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="10" r="3"/>
        <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"/>
      </svg>
    ),
    accent: '#eab308', bg: '#fef9c3',
    title: 'Geospatial Sentiment Map',
    desc: 'Geographical telemetry. Track public sentiment metrics and emergency reports dynamically across states and districts on an interactive visual heat map.',
    badge: 'ANALYTICS 🗺️',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    ),
    accent: '#ef4444', bg: '#fef2f2',
    title: 'Distress SOS Signals',
    desc: 'Real-time incident triage. Citizens can report localized hazards (fire, medical, flood) with live GPS coordinates, landmarks, and photos for instant dispatch resolution.',
    badge: 'CRITICAL 🚨',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
      </svg>
    ),
    accent: '#10b981', bg: '#ecfdf5',
    title: 'NL Segment Builder',
    desc: 'Natural language target segmentation. Construct dynamic recipient lists (e.g. "Farmers in Pune district speaking Marathi") using plain conversational English text.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        <line x1="9" y1="3" x2="9" y2="21"/>
      </svg>
    ),
    accent: '#3b82f6', bg: '#eff6ff',
    title: 'PWA Mobile Standalone',
    desc: 'Offline-ready standalone application. Fully PWA-compliant with service worker static caching, automatic updates, and lag-free native-feel transition performance.',
    badge: 'PWA 📱',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
    accent: '#ec4899', bg: '#fdf2f8',
    title: 'RAG AI Help Desk',
    desc: 'Knowledge-base retrieval assistant. Direct citizen queries fetch context from uploaded government manuals and advisory documents to draft prompt, verified answers.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    accent: '#3b82f6', bg: '#eff6ff',
    title: 'Inter-Operator Staff Chat',
    desc: 'Real-time operational collaboration. Active operators can coordinate mass broadcasts in a shared WebSocket room, featuring customizable channels and voice alerts.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
        <line x1="8" y1="21" x2="16" y2="21"/>
        <line x1="12" y1="17" x2="12" y2="21"/>
      </svg>
    ),
    accent: '#6366f1', bg: '#e0e7ff',
    title: 'Zero-Config LAN Testing',
    desc: 'Zero-configuration regional testing. Developers can run diagnostics and test notification templates on physical mobile devices over local Wi-Fi without ENV changes.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        <path d="M9 11l2 2 4-4"/>
      </svg>
    ),
    accent: '#ef4444', bg: '#fef2f2',
    title: 'Four-Eye Governance Queue',
    desc: 'Rigid maker-checker broadcast rules. Any campaign exceeding 100 targets or marked as an Emergency escalates to checker validation before dispatch.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h16v12H4z"/><path d="M8 20h8"/><path d="M12 16v4"/>
      </svg>
    ),
    accent: '#10b981', bg: '#ecfdf5',
    title: 'Omnichannel Mass Dispatch',
    desc: 'Simultaneous, high-delivery message broadcasting across SMS, Voice Call, Email (with CID attachments), Telegram, and Push notifications.',
  },
];

const ROLES = [
  {
    emoji: '🛡️',
    title: 'Administrator',
    badge: '#7c3aed',
    badgeBg: '#f5f3ff',
    borderActive: '#c4b5fd',
    desc: 'Full-access superuser. Exercises final four-eye maker-checker approval authority, manages campaign managers, audits security logs, and configures integration diagnostics.',
    sees: [
      'All 19 Workspace Panels',
      'Dashboard Overview & Live Bulletins',
      'Campaigns, Templates & Poster Studio',
      'Approvals Queue (Final Approval Authority)',
      'Audience Segments & Directory',
      'Emergency SOS Reports & Inbox',
      'AI Fact Shield & Support Queries',
      'Operator Staff Chat',
      'Campaign Managers Directory (Admin Only)',
      'Audit Trail Logs (Admin Only)',
      'System Settings & Latency Diagnostics'
    ],
    hidden: [],
  },
  {
    emoji: '💼',
    title: 'Campaign Manager',
    badge: '#2563eb',
    badgeBg: '#eff6ff',
    borderActive: '#93c5fd',
    highlighted: true,
    desc: 'Core workspace operator. Dictates templates, runs audience segmentation, drafts AI counter-campaigns, designs regional posters, monitors local SOS alerts, and collaborates with staff.',
    sees: [
      '17 Workspace Panels',
      'Dashboard Overview & Live Bulletins',
      'Campaigns, Templates & Poster Studio',
      'Approvals Queue (View/Submit)',
      'Audience Segments & Directory',
      'Emergency SOS Reports & Inbox',
      'AI Fact Shield & Support Queries',
      'Operator Staff Chat',
      'Settings & Preferences'
    ],
    hidden: [],
  },
  {
    emoji: '📣',
    title: 'Audience Member',
    badge: '#06b6d4',
    badgeBg: '#ecfeff',
    borderActive: '#a5f3fc',
    desc: 'Public citizen user. Listens to regional voice bulletins, provides campaign feedback, submits distress SOS signals, and communicates with RAG-based AI chat assistants.',
    sees: [
      'Personal Dashboard Portal',
      'Live Audio Bulletins',
      'Campaign Feedback Logs',
      'Citizen RAG Chat Support',
      'Distress SOS Submissions'
    ],
    hidden: [],
  },
];

function smoothScrollTo(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  else window.scrollTo({ top: 0, behavior: 'smooth' });
}

export default function Landing({ onNavigateToLogin, onNavigateToRegister, theme = 'dark', toggleTheme }) {
  const [activeResource, setActiveResource] = useState(null);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User response to the install prompt: ${outcome}`);
      setDeferredPrompt(null);
    } else {
      alert(
        "To install CommAI on your device:\n\n" +
        "• Desktop (Chrome/Edge): Click the Install icon in the address bar.\n" +
        "• Mobile (iOS Safari): Tap 'Share' icon and select 'Add to Home Screen'.\n" +
        "• Mobile (Android Chrome): Tap the menu (3 dots) and select 'Install app'."
      );
    }
  };
  /* ── enable page scroll ── */
  useEffect(() => {
    document.documentElement.classList.add('landing-active');
    document.body.classList.add('landing-active');
    return () => {
      document.documentElement.classList.remove('landing-active');
      document.body.classList.remove('landing-active');
    };
  }, []);

  /* ── nav active section tracking ── */
  const [activeSection, setActiveSection] = useState('hero');
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 30);
      const sections = ['hero', 'platform', 'emergency-alerts', 'use-cases', 'security-compliance', 'faqs', 'simulator', 'estimator', 'roles'];
      for (const id of [...sections].reverse()) {
        const el = document.getElementById(id);
        if (el && window.scrollY >= el.offsetTop - 120) {
          setActiveSection(id);
          break;
        }
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* ── live counter ── */
  const [sentCount, setSentCount] = useState(142504);
  useEffect(() => {
    const t = setInterval(() => setSentCount(p => p + Math.floor(Math.random() * 4) + 1), 3200);
    return () => clearInterval(t);
  }, []);

  /* ── simulator ── */
  const [segment, setSegment]       = useState('farmers');
  const [lang, setLang]             = useState('Hindi');
  const [channels, setChannels]     = useState(['sms', 'voice']);
  const [simRunning, setSimRunning] = useState(false);
  const [simStep, setSimStep]       = useState(0);
  const [simResult, setSimResult]   = useState(null);

  function toggleChannel(ch) {
    setChannels(p => p.includes(ch) ? (p.length > 1 ? p.filter(c => c !== ch) : p) : [...p, ch]);
  }

  function runSim() {
    setSimRunning(true); setSimStep(1); setSimResult(null);
    setTimeout(() => { setSimStep(2);
      setTimeout(() => { setSimStep(3);
        setTimeout(() => {
          setSimRunning(false); setSimStep(0);
          const n = SEGMENTS[segment].size;
          const r = Math.floor(n * (channels.length === 1 ? 0.76 : channels.length === 2 ? 0.92 : 0.98));
          setSimResult({ target: n, reach: r, lang });
        }, 900);
      }, 900);
    }, 800);
  }

  /* ── estimator ── */
  const [audienceSize, setAudienceSize] = useState(25000);
  const [predCh, setPredCh] = useState({ email: true, sms: true, voice: true, telegram: true, push: false, website: false });
  const activeChs = Object.values(predCh).filter(Boolean).length;
  const reachPct  = activeChs === 0 ? 0 : Math.min(97, 44 + activeChs * 10.6);
  const estReach  = Math.floor(audienceSize * reachPct / 100);

  const [openFaqIndex, setOpenFaqIndex] = useState(null);
  const [activeUseSector, setActiveUseSector] = useState('agri');

  /* ── design tokens ── */
  const T_light = {
    bg:         '#f8fafc',
    white:      '#ffffff',
    border:     '#e2e8f0',
    borderHov:  '#cbd5e1',
    borderFocus:'#818cf8',
    text:       '#0f172a',
    textSec:    '#334155',
    textMuted:  '#64748b',
    blue:       '#4f46e5',
    blueDark:   '#3730a3',
    blueLight:  '#eef2ff',
    blueMid:    '#c7d2fe',
    green:      '#0d9488',
    greenLight: '#f0fdf4',
    amber:      '#d97706',
    amberLight: '#fffbeb',
    red:        '#e11d48',
    shadow:     '0 1px 3px rgba(0,0,0,.08), 0 4px 12px rgba(0,0,0,.05)',
    shadowLg:   '0 4px 6px rgba(0,0,0,.05), 0 10px 30px rgba(0,0,0,.08)',
    radius:     16,
    radiusSm:   10,
  };

  const T_dark = {
    bg:         '#090d16',
    white:      'rgba(18, 24, 39, 0.75)',
    border:     'rgba(255, 255, 255, 0.08)',
    borderHov:  'rgba(255, 255, 255, 0.16)',
    borderFocus:'rgba(99, 102, 241, 0.5)',
    text:       '#f8fafc',
    textSec:    'rgba(248, 250, 252, 0.75)',
    textMuted:  'rgba(248, 250, 252, 0.45)',
    blue:       '#6366f1',
    blueDark:   '#4f46e5',
    blueLight:  'rgba(99, 102, 241, 0.15)',
    blueMid:    'rgba(99, 102, 241, 0.35)',
    green:      '#14b8a6',
    greenLight: 'rgba(20, 184, 166, 0.15)',
    amber:      '#f59e0b',
    amberLight: 'rgba(245, 158, 11, 0.15)',
    red:        '#f43f5e',
    shadow:     '0 8px 32px rgba(0, 0, 0, 0.4)',
    shadowLg:   '0 16px 48px rgba(0, 0, 0, 0.65)',
    radius:     16,
    radiusSm:   10,
  };

  const T = theme === 'dark' ? T_dark : T_light;

  const NAV_LINKS = [
    { id: 'platform', label: 'Product' },
    { id: 'emergency-alerts', label: 'Emergency Alerts' },
    { id: 'use-cases', label: 'Solutions' },
    { id: 'security-compliance', label: 'Security' },
    { id: 'faqs', label: 'Resources' },
  ];

  return (
    <div style={{ background: theme === 'dark' ? 'linear-gradient(135deg, #05070f 0%, #0c0f1d 50%, #05070f 100%)' : '#f4f6fb', color: T.text, fontFamily: "'Outfit','Inter',system-ui,sans-serif", minHeight: '100vh', transition: 'background 0.3s, color 0.3s' }}>

      {/* ══════════════════════ NAVBAR ══════════════════════ */}
      <nav className="landing-nav" style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 999,
        background: theme === 'dark'
          ? (scrolled ? 'rgba(5, 7, 15, 0.92)' : 'rgba(5, 7, 15, 0.7)')
          : (scrolled ? 'rgba(255, 255, 255, 0.92)' : 'rgba(255, 255, 255, 0.75)'),
        backdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${scrolled ? T.border : 'transparent'}`,
        padding: '0 24px',
        minHeight: 64,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        transition: 'all .25s ease',
        boxShadow: scrolled ? '0 8px 30px rgba(0, 0, 0, 0.12)' : 'none',
      }}>
        {/* Logo — always scrolls to top */}
        <button onClick={() => smoothScrollTo('hero')}
          style={{ display:'flex', alignItems:'center', gap:10, background:'none', border:'none', cursor:'pointer', padding:0 }}>
          <div style={{ width:40, height:40, borderRadius:12, overflow: 'hidden', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <img src="/logo.jpeg" alt="CommAI Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <span style={{ fontWeight:800, fontSize:'1.3rem', color:T.text, letterSpacing:'-0.03em' }}>CommAI</span>
          <span style={{ fontSize:'0.7rem', background:T.blueLight, color:T.blue, border:`1px solid ${T.blueMid}`, borderRadius:20, padding:'2px 8px', fontWeight:700, letterSpacing:'0.04em' }}>BETA</span>
        </button>

        {/* Nav links — smooth scroll */}
        <div className="landing-nav-links" style={{ display:'flex', alignItems:'center', gap:4 }}>
          {NAV_LINKS.map(({ id, label }) => {
            const isActive = activeSection === id;
            return (
              <button key={id} onClick={() => smoothScrollTo(id)}
                style={{
                  background: isActive ? T.blueLight : 'none',
                  border: 'none',
                  padding: '8px 18px',
                  borderRadius: T.radiusSm,
                  fontSize: '0.9rem',
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? T.blue : (theme === 'dark' ? '#ffffff' : '#0f172a'),
                  cursor: 'pointer',
                  transition: 'all .25s cubic-bezier(0.4, 0, 0.2, 1)',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'; e.currentTarget.style.color = T.text; }}}
                onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = theme === 'dark' ? '#ffffff' : '#0f172a'; }}}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* CTAs */}
        <div className="landing-nav-ctas" style={{ display:'flex', gap:8, alignItems:'center' }}>
          {/* Theme toggle icon button */}
          <button 
            onClick={toggleTheme}
            className="theme-toggle-btn"
            style={{ 
              background: 'none', 
              cursor: 'pointer', 
              color: T.text, 
              padding: '8px', 
              borderRadius: '10px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              marginRight: '2px',
              transition: 'background 0.2s',
              border: `1px solid ${T.border}`
            }}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            onMouseEnter={e => e.currentTarget.style.background = theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            {theme === 'dark' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
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
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
          
          <button onClick={handleInstallClick}
            style={{ 
              padding: '8px 16px', 
              borderRadius: T.radiusSm, 
              border: `1px solid ${T.blue}`, 
              background: T.blueLight, 
              color: T.blue, 
              fontWeight: 700, 
              fontSize: '0.85rem', 
              cursor: 'pointer', 
              fontFamily: 'inherit', 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: 6, 
              transition: 'all 0.2s ease' 
            }}
            onMouseEnter={e => { e.currentTarget.style.background = T.blue; e.currentTarget.style.color = '#fff'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = T.blueLight; e.currentTarget.style.color = T.blue; e.currentTarget.style.transform = 'none'; }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Install App
          </button>
          
          <button onClick={onNavigateToLogin}
            style={{ padding:'8px 16px', borderRadius:T.radiusSm, border:`1px solid ${T.border}`, background:T.white, color:T.text, fontWeight:600, fontSize:'0.85rem', cursor:'pointer', fontFamily:'inherit', transition:'all 0.2s ease' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = T.borderHov; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.transform = 'none'; }}>
            Sign In
          </button>
          <button onClick={onNavigateToRegister}
            style={{ padding:'8px 18px', borderRadius:T.radiusSm, border:'none', background:`linear-gradient(135deg, ${T.blue} 0%, #7c3aed 100%)`, color:'#fff', fontWeight:700, fontSize:'0.85rem', cursor:'pointer', fontFamily:'inherit', transition:'all 0.2s ease', boxShadow:`0 4px 14px rgba(37,99,235,.3)` }}
            onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.1)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={e => { e.currentTarget.style.filter = 'none'; e.currentTarget.style.transform = 'none'; }}>
            Get Started →
          </button>

          {/* Hamburger toggle button for mobile */}
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)} 
            className="landing-nav-mobile-toggle" 
            style={{
              display: 'none',
              background: 'none',
              border: 'none',
              color: T.text,
              cursor: 'pointer',
              padding: '8px',
              borderRadius: '10px',
              alignItems: 'center',
              justifyContent: 'center',
              border: `1px solid ${T.border}`,
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => e.currentTarget.style.background = theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            {mobileMenuOpen ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            )}
          </button>
        </div>
      </nav>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div style={{
          position: 'fixed',
          top: 64,
          left: 0,
          right: 0,
          bottom: 0,
          background: theme === 'dark' ? 'rgba(5, 7, 15, 0.98)' : 'rgba(255, 255, 255, 0.98)',
          backdropFilter: 'blur(20px)',
          zIndex: 998,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 24,
          padding: 40,
          animation: 'fadeIn 0.2s ease-in-out',
        }}>
          {/* Nav links */}
          {NAV_LINKS.map(({ id, label }) => (
            <button key={id} onClick={() => { smoothScrollTo(id); setMobileMenuOpen(false); }}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '1.25rem',
                fontWeight: 600,
                color: T.text,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}>
              {label}
            </button>
          ))}
          
          <div style={{ width: '80%', height: '1px', background: T.border, margin: '8px 0' }} />

          {/* Action buttons */}
          <button onClick={() => { handleInstallClick(); setMobileMenuOpen(false); }}
            style={{ 
              width: '100%', 
              maxWidth: 260, 
              padding: '12px 24px', 
              borderRadius: 12, 
              border: `1px solid ${T.blue}`, 
              background: T.blueLight, 
              color: T.blue, 
              fontWeight: 700, 
              fontSize: '1rem', 
              cursor: 'pointer', 
              fontFamily: 'inherit', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              gap: 8 
            }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Install App
          </button>

          <button onClick={() => { onNavigateToLogin(); setMobileMenuOpen(false); }}
            style={{ 
              width: '100%', 
              maxWidth: 260, 
              padding: '12px 24px', 
              borderRadius: 12, 
              border: `1px solid ${T.border}`, 
              background: T.white, 
              color: T.text, 
              fontWeight: 600, 
              fontSize: '1rem', 
              cursor: 'pointer', 
              fontFamily: 'inherit' 
            }}>
            Sign In
          </button>

          <button onClick={() => { onNavigateToRegister(); setMobileMenuOpen(false); }}
            style={{ 
              width: '100%', 
              maxWidth: 260, 
              padding: '12px 24px', 
              borderRadius: 12, 
              border: 'none', 
              background: `linear-gradient(135deg, ${T.blue} 0%, #7c3aed 100%)`, 
              color: '#fff', 
              fontWeight: 700, 
              fontSize: '1rem', 
              cursor: 'pointer', 
              fontFamily: 'inherit', 
              boxShadow: `0 4px 14px rgba(37,99,235,.3)` 
            }}>
            Get Started →
          </button>
        </div>
      )}

      {/* ══════════════════════ HERO ══════════════════════ */}
      <section id="hero" className="landing-hero-section" style={{ maxWidth:1140, margin:'0 auto', padding:'80px 32px 80px', position:'relative' }}>
        {/* Hero background blobs */}
        <div style={{ position:'absolute', top:-60, left:-80, width:550, height:550, borderRadius:'50%', background:'radial-gradient(circle, rgba(76,78,243,0.14) 0%, transparent 70%)', pointerEvents:'none', zIndex:0 }}></div>
        <div style={{ position:'absolute', top:80, right:-100, width:450, height:450, borderRadius:'50%', background:'radial-gradient(circle, rgba(168,85,247,0.1) 0%, transparent 70%)', pointerEvents:'none', zIndex:0 }}></div>
        <div style={{ position:'absolute', bottom:0, left:'40%', width:350, height:350, borderRadius:'50%', background:'radial-gradient(circle, rgba(34,197,94,0.06) 0%, transparent 70%)', pointerEvents:'none', zIndex:0 }}></div>
        <div className="landing-hero-grid" style={{ display:'grid', gridTemplateColumns:'1.05fr 1fr', gap:48, alignItems:'center', position:'relative', zIndex:1 }}>

          {/* Left copy */}
          <div>
            {/* Status pill */}
            <div style={{ display:'inline-flex', alignItems:'center', gap:8, background:T.greenLight, border:`1px solid ${T.green}30`, borderRadius:20, padding:'6px 16px', marginBottom:24 }}>
              <span style={{ width:8, height:8, borderRadius:'50%', background:T.green, display:'inline-block', boxShadow:`0 0 0 2px ${T.green}20`, animation: 'pulse 2s infinite' }}></span>
              <span style={{ fontSize:'0.78rem', fontWeight:700, color:T.green, letterSpacing:'0.04em', textTransform: 'uppercase' }}>System Active — {new Date().toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</span>
            </div>

            <h1 className="landing-hero-title" style={{ fontSize:'clamp(2.1rem, 5vw, 3.4rem)', fontWeight:800, lineHeight:1.1, letterSpacing:'-0.035em', color:T.text, marginBottom:22, overflowWrap: 'break-word', wordBreak: 'break-word' }}>
              Public communication<br/>
              <span style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #a855f7 48%, #ef4444 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>that moves at the speed of need.</span>
            </h1>

            <p className="landing-hero-sub" style={{ fontSize:'1.1rem', color:T.textSec, lineHeight:1.65, marginBottom:36, maxWidth:520 }}>
              CommAI helps government departments and NGOs plan, translate, and dispatch trusted campaigns—and trigger state-targeted emergency alerts—across Email, Voice Call, SMS, and Push in 23 languages (22 Scheduled Indic + English).
            </p>

            <div className="landing-hero-ctas" style={{ display:'flex', gap:14, flexWrap:'wrap', marginBottom:48 }}>
              <button onClick={onNavigateToRegister}
                style={{ padding:'14px 28px', borderRadius:12, border:'none', background:`linear-gradient(135deg, ${T.blue} 0%, #7c3aed 100%)`, color:'#fff', fontWeight:700, fontSize:'1rem', cursor:'pointer', fontFamily:'inherit', boxShadow:`0 6px 20px rgba(37,99,235,.3)`, transition:'all .2s ease' }}
                onMouseEnter={e => { e.currentTarget.style.filter='brightness(1.12)'; e.currentTarget.style.transform='translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.filter='none'; e.currentTarget.style.transform='none'; }}>
                Launch your workspace
              </button>
              <button onClick={() => smoothScrollTo('simulator')}
                style={{ padding:'14px 24px', borderRadius:12, border:`1px solid ${T.border}`, background:T.white, color:T.text, fontWeight:600, fontSize:'1rem', cursor:'pointer', fontFamily:'inherit', display:'inline-flex', alignItems:'center', gap:10, transition:'all 0.2s ease' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = T.borderHov; e.currentTarget.style.transform='translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.transform='none'; }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                Explore the platform
              </button>
              <button onClick={handleInstallClick}
                style={{ 
                  padding:'14px 24px', 
                  borderRadius:12, 
                  border:`1.5px solid ${T.blue}`, 
                  background:T.blueLight, 
                  color:T.blue, 
                  fontWeight:700, 
                  fontSize:'1rem', 
                  cursor:'pointer', 
                  fontFamily:'inherit', 
                  display:'inline-flex', 
                  alignItems:'center', 
                  gap:10, 
                  transition:'all 0.2s ease' 
                }}
                onMouseEnter={e => { e.currentTarget.style.background = T.blue; e.currentTarget.style.color = '#fff'; e.currentTarget.style.transform='translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = T.blueLight; e.currentTarget.style.color = T.blue; e.currentTarget.style.transform='none'; }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download App
              </button>
            </div>

            {/* Stats row */}
            <div className="landing-hero-stats" style={{ display:'flex', gap:0, borderTop:`1px solid ${T.border}`, paddingTop:28 }}>
              {[
                { value: sentCount.toLocaleString(), label: 'Sent', color: T.blue },
                { value: '98.9%',  label: 'Success',  color: T.green },
                { value: '23',     label: 'Languages',      color: T.amber },
                { value: '5',      label: 'Channels',       color: '#7c3aed' },
              ].map((s, i) => (
                <div key={s.label} className="landing-stat-item" style={{ flex:1, paddingRight:16, borderRight: i < 3 ? `1px solid ${T.border}` : 'none', marginRight:16 }}>
                  <div style={{ fontSize:'1.5rem', fontWeight:800, color:s.color, letterSpacing:'-0.02em', fontVariantNumeric:'tabular-nums', lineHeight:1 }}>{s.value}</div>
                  <div style={{ fontSize:'0.72rem', color:T.textMuted, fontWeight:700, marginTop:6, textTransform:'uppercase', letterSpacing:'0.08em' }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right — dashboard preview card */}
          <div style={{ background:T.white, border:`1px solid ${T.border}`, borderRadius:22, overflow:'hidden', boxShadow:'0 24px 70px rgba(0,0,0,.28), 0 0 0 1px rgba(59,130,246,.08)', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)' }}></div>
            {/* Fake window chrome */}
            <div style={{ background: theme==='dark'?'rgba(255,255,255,0.01)':'#f8fafc', borderBottom:`1px solid ${T.border}`, padding:'14px 20px', display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ display:'flex', gap:6 }}>
                {['#ff5f57','#ffbd2e','#28c840'].map(c => <div key={c} style={{ width:11, height:11, borderRadius:'50%', background:c }}></div>)}
              </div>
              <div style={{ flex:1, background: theme==='dark'?'rgba(255,255,255,0.04)':'#e2e8f0', borderRadius:6, height:24, display:'flex', alignItems:'center', paddingLeft:12, fontSize:'0.75rem', color:T.textMuted, fontFamily: 'monospace' }}>
                localhost:5173 — Campaign Manager
              </div>
            </div>
            <div style={{ padding:24 }}>
              <div style={{ background:'linear-gradient(135deg, #dc2626 0%, #7c3aed 100%)', borderRadius:14, padding:'14px 16px', marginBottom:18, color:'#fff', boxShadow:'0 10px 24px rgba(220,38,38,.22)' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
                  <div><div style={{ fontSize:'0.68rem', fontWeight:800, letterSpacing:'.1em', opacity:.82, textTransform:'uppercase', marginBottom:4 }}>Emergency command centre</div><div style={{ fontSize:'0.96rem', fontWeight:800 }}>Maharashtra flood advisory</div></div>
                  <div style={{ background:'rgba(255,255,255,.16)', border:'1px solid rgba(255,255,255,.28)', borderRadius:20, padding:'5px 9px', fontSize:'0.68rem', fontWeight:800, whiteSpace:'nowrap' }}>LIVE NOW</div>
                </div>
                <div style={{ display:'flex', gap:6, marginTop:10, flexWrap:'wrap' }}>{['Email','SMS','Voice Call','Telegram','Push'].map(channel => <span key={channel} style={{ fontSize:'0.65rem', fontWeight:700, padding:'3px 7px', borderRadius:9, background:'rgba(255,255,255,.14)' }}>{channel}</span>)}</div>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
                <span style={{ fontWeight:800, fontSize:'0.95rem', color:T.text }}>Live Campaign Monitor</span>
                <span style={{ fontSize:'0.72rem', background:T.greenLight, color:T.green, border:`1px solid ${T.green}40`, borderRadius:20, padding:'3px 12px', fontWeight:700, display:'inline-flex', alignItems:'center', gap:5 }}>
                  <span className="live-pulse" style={{ width:6, height:6, borderRadius:'50%', background:T.green, display:'inline-block' }}></span>
                  2 running
                </span>
              </div>
              {[
                { name:'Flood Alert — North region', pct:92, label:'18,400 citizens · SMS + Voice Call', color:T.blue },
                { name:'Farmer Subsidy Notice', pct:45, label:'4,500 farmers · Marathi · SMS', color:T.amber },
              ].map(row => (
                <div key={row.name} style={{ background:T.bg, borderRadius:12, padding:16, marginBottom:12, border: `1px solid ${T.border}` }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:9 }}>
                    <span style={{ fontWeight:700, fontSize:'0.9rem', color:T.text }}>{row.name}</span>
                    <span style={{ fontSize:'0.82rem', fontWeight:800, color:row.color }}>{row.pct}%</span>
                  </div>
                  <div style={{ height:5, borderRadius:4, background: theme==='dark'?'rgba(255,255,255,0.06)':'#e2e8f0', overflow:'hidden' }}>
                    <div style={{ width:`${row.pct}%`, height:'100%', background:row.color, borderRadius:4, transition:'width 0.6s ease' }}></div>
                  </div>
                  <div style={{ fontSize:'0.78rem', color:T.textMuted, marginTop:9 }}>{row.label}</div>
                </div>
              ))}
              <div style={{ background:T.bg, borderRadius:12, padding:16, border:`1px solid ${T.border}`, marginTop:12 }}>
                <div style={{ fontSize:'0.75rem', fontWeight:800, color:T.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>Channel Distribution</div>
                <div style={{ display:'flex', gap:3, height:8, borderRadius:8, overflow:'hidden', marginBottom:12 }}>
                  {[['#3b82f6','45%'],['#10b981','30%'],['#f59e0b','15%'],['#ef4444','10%']].map(([c,w])=>(
                    <div key={c} style={{ width:w, height:'100%', background:c }}></div>
                  ))}
                </div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:'8px 16px' }}>
                  {[['#3b82f6','Voice Call 45%'],['#10b981','SMS 30%'],['#f59e0b','Email 15%'],['#ef4444','Push 10%']].map(([c,l])=>(
                    <div key={l} style={{ display:'flex', alignItems:'center', gap:6, fontSize:'0.75rem', color:T.textSec, fontWeight:500 }}>
                      <span style={{ width:7, height:7, borderRadius:'50%', background:c, display:'inline-block' }}></span>{l}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════ TRUST BADGES & TESTIMONIAL ══════════════════════ */}
      <section style={{ 
        borderBottom: `1px solid ${T.border}`, 
        background: theme === 'dark' ? 'rgba(255, 255, 255, 0.01)' : 'rgba(0, 0, 0, 0.01)',
        padding: '50px 40px',
        position: 'relative'
      }}>
        <div style={{ maxWidth: 1140, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 32 }}>
          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 800, color: T.blue, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              Trusted Framework
            </span>
            <div style={{ fontSize: '0.85rem', color: T.textSec, fontWeight: 550, marginTop: 4 }}>
              Designed in alignment with national communication standardizations
            </div>
          </div>

          {/* Badges Grid */}
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: '30px 60px' }}>
            {[
              { label: 'NHM India', sub: 'National Health Mission', icon: '🏥' },
              { label: 'RuralGov', sub: 'Dept. of Rural Welfare', icon: '🌾' },
              { label: 'SDMA', sub: 'Disaster Management', icon: '🚨' },
              { label: 'Digital India', sub: 'e-Governance Partner', icon: '🇮🇳' }
            ].map(b => (
              <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: 0.85, transition: 'opacity 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.opacity = 1}
                onMouseLeave={e => e.currentTarget.style.opacity = 0.85}>
                <div style={{ fontSize: '1.6rem' }}>{b.icon}</div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 800, color: T.text, fontSize: '0.92rem', letterSpacing: '-0.01em' }}>{b.label}</div>
                  <div style={{ fontSize: '0.72rem', color: T.textSec, fontWeight: 500 }}>{b.sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Quick testimonial overlay */}
          <div style={{ 
            maxWidth: 720, 
            margin: '20px auto 0', 
            background: T.white, 
            border: `1px solid ${T.border}`, 
            borderRadius: T.radiusSm, 
            padding: '20px 28px', 
            boxShadow: T.shadow,
            display: 'flex',
            alignItems: 'center',
            gap: 20
          }}>
            <div style={{ fontSize: '2.5rem', color: T.blue, opacity: 0.25, fontFamily: 'Georgia, serif', lineHeight: 1, height: 20, transform: 'translateY(-10px)' }}>“</div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: '0.88rem', color: T.text, lineHeight: 1.5, fontStyle: 'italic', fontWeight: 500 }}>
                CommAI has cut our broadcast preparation times down from 4 hours to just 10 minutes. Translating critical emergency advisories into regional dialects is now incredibly fast and reliable.
              </p>
              <div style={{ fontSize: '0.78rem', color: T.textSec, marginTop: 8, fontWeight: 700 }}>
                — Regional Campaign Director, Disaster Management Division
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════ PLATFORM FEATURES ══════════════════════ */}
      <section id="platform" style={{ 
        background: theme === 'dark' 
          ? 'linear-gradient(180deg, #0e121e 0%, #05070f 100%)' 
          : 'linear-gradient(180deg, #ffffff 0%, #f4f6fb 100%)', 
        borderTop: `1px solid ${T.border}`, 
        borderBottom: `1px solid ${T.border}`, 
        padding:'100px 40px' 
      }}>
        <div style={{ maxWidth:1140, margin:'0 auto' }}>
          <div style={{ maxWidth:580, marginBottom:60 }}>
            <div style={{ fontSize:'0.78rem', fontWeight:800, color:T.blue, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:12 }}>Key Modules</div>
            <h2 style={{ fontSize:'2.4rem', fontWeight:800, letterSpacing:'-0.03em', color:T.text, lineHeight:1.15, marginBottom:16 }}>Unified Campaign Operations</h2>
            <p style={{ color:T.textSec, fontSize:'1.08rem', lineHeight:1.6 }}>Built for scale and simplicity — manage citizen registers, structure localized templates, and schedule deliveries under complete operator audit tracking.</p>
          </div>
          {/* ════ Jarvis AI Killer Feature Banner ════ */}
          <div className="jarvis-banner" style={{
            background: theme === 'dark'
              ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.22) 0%, rgba(59, 130, 246, 0.15) 50%, rgba(15, 23, 42, 0.95) 100%)'
              : 'linear-gradient(135deg, #f3e8ff 0%, #e0f2fe 50%, #ffffff 100%)',
            border: '1.5px solid rgba(139, 92, 246, 0.4)',
            borderRadius: 24,
            padding: '36px 40px',
            marginBottom: 48,
            boxShadow: '0 16px 40px rgba(139, 92, 246, 0.18)',
            display: 'grid',
            gridTemplateColumns: '1.2fr 1fr',
            gap: 32,
            alignItems: 'center',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{ position: 'absolute', top: -40, right: -40, width: 250, height: 250, borderRadius: '50%', background: 'radial-gradient(circle, rgba(139, 92, 246, 0.25) 0%, transparent 70%)', pointerEvents: 'none' }}></div>
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(139, 92, 246, 0.16)', border: '1px solid rgba(139, 92, 246, 0.4)', borderRadius: 20, padding: '4px 14px', marginBottom: 16 }}>
                <span style={{ fontSize: '0.9rem' }}>⚡</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Killer Feature</span>
              </div>
              <h3 style={{ fontSize: '2.1rem', fontWeight: 850, color: T.text, lineHeight: 1.15, marginBottom: 14, letterSpacing: '-0.03em' }}>
                Jarvis AI Voice Cockpit
              </h3>
              <p style={{ color: T.textSec, fontSize: '1.02rem', lineHeight: 1.65, marginBottom: 20 }}>
                Control your entire communication center hands-free. Simply say <strong>"Hey Jarvis"</strong> out loud to auto-compose campaigns, dispatch staff messages, query audience registers, and issue emergency alerts with real-time speech synthesis & confirmation.
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {[
                  '🎙️ Hands-Free "Hey Jarvis" Wake Word',
                  '🧠 Natural AI Intent Engine',
                  '💬 Staff Direct Chat Integration',
                  '🔊 Interactive Spoken Confirmations'
                ].map((tag, tIdx) => (
                  <span key={tIdx} style={{ fontSize: '0.78rem', fontWeight: 700, padding: '6px 12px', borderRadius: 10, background: theme === 'dark' ? 'rgba(255,255,255,0.06)' : '#ffffff', border: `1px solid ${T.border}`, color: T.text }}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            {/* Visual Speech Bubble Mockup */}
            <div style={{ background: theme === 'dark' ? 'rgba(10, 14, 26, 0.9)' : '#ffffff', border: '1px solid rgba(139, 92, 246, 0.35)', borderRadius: 20, padding: 22, boxShadow: '0 10px 30px rgba(0,0,0,0.25)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${T.border}`, paddingBottom: 12, marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }}></div>
                  <span style={{ fontSize: '0.82rem', fontWeight: 800, color: T.text }}>Jarvis AI Voice Cockpit</span>
                </div>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#a78bfa', background: 'rgba(139, 92, 246, 0.15)', padding: '2px 8px', borderRadius: 8 }}>LISTENING</span>
              </div>
              <div style={{ background: theme === 'dark' ? 'rgba(139, 92, 246, 0.14)' : '#f3e8ff', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#8b5cf6', marginBottom: 4 }}>🗣️ SPOKEN COMMAND</div>
                <div style={{ fontSize: '0.88rem', fontWeight: 600, color: T.text, fontStyle: 'italic' }}>
                  "Open operator staff chat and send a message 'hey managers all good'"
                </div>
              </div>
              <div style={{ background: theme === 'dark' ? 'rgba(34, 197, 94, 0.1)' : '#f0fdf4', border: '1px solid rgba(34, 197, 94, 0.25)', borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#22c55e', marginBottom: 4 }}>🤖 JARVIS ACTION</div>
                <div style={{ fontSize: '0.84rem', color: T.textSec, lineHeight: 1.4 }}>
                  Navigated to Operator Chat, drafted message to staff, and requested manager confirmation: <em>"Yes send it"</em> → 🚀 Sent!
                </div>
              </div>
            </div>
          </div>

          <div className="features-grid" style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:24 }}>
            {FEATURES.map(f => (
              <div key={f.title}
                style={{ 
                  background: f.isKiller 
                    ? (theme === 'dark' ? 'linear-gradient(135deg, rgba(139,92,246,0.14) 0%, rgba(59,130,246,0.08) 100%)' : 'linear-gradient(135deg, #f5f3ff 0%, #eff6ff 100%)')
                    : T.white, 
                  border: f.isKiller ? `1.5px solid rgba(139,92,246,0.45)` : `1px solid ${T.border}`, 
                  borderRadius: T.radius, 
                  padding: 28, 
                  cursor: 'default', 
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', 
                  position: 'relative', 
                  overflow: 'hidden',
                  boxShadow: f.isKiller ? '0 8px 25px rgba(139,92,246,0.15)' : 'none'
                }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = f.isKiller ? '0 12px 35px rgba(139,92,246,0.3)' : T.shadowLg; e.currentTarget.style.borderColor = f.isKiller ? '#8b5cf6' : T.blueMid; e.currentTarget.style.transform = 'translateY(-4px)'; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = f.isKiller ? '0 8px 25px rgba(139,92,246,0.15)' : 'none'; e.currentTarget.style.borderColor = f.isKiller ? 'rgba(139,92,246,0.45)' : T.border; e.currentTarget.style.transform = 'none'; }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${f.accent}, ${f.isKiller ? '#3b82f6' : 'transparent'})` }}></div>
                {f.badge && (
                  <span style={{ position: 'absolute', top: 16, right: 16, background: 'linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%)', color: '#fff', fontSize: '0.65rem', fontWeight: 800, padding: '3px 8px', borderRadius: 12, letterSpacing: '0.05em', textTransform: 'uppercase', boxShadow: '0 2px 8px rgba(139,92,246,0.4)' }}>
                    {f.badge}
                  </span>
                )}
                <div style={{ width: 46, height: 46, borderRadius: 12, background: f.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: f.accent, marginBottom: 18, boxShadow: `0 4px 10px ${f.accent}15` }}>
                  {f.icon}
                </div>
                <div style={{ fontWeight: 800, fontSize: '1.05rem', color: T.text, marginBottom: 10 }}>{f.title}</div>
                <div style={{ fontSize: '0.88rem', color: T.textSec, lineHeight: 1.6 }}>{f.desc}</div>
                <div style={{ marginTop: 18, color: f.accent, fontSize: '0.76rem', fontWeight: 800, letterSpacing: '.04em' }}>
                  {f.isKiller ? '⚡ VOICE ACTIVATED →' : 'BUILT INTO COMMAI →'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════ AI SPOTLIGHT ══════════════════════ */}
      <section id="emergency-alerts" style={{ padding: '100px 40px', background: theme === 'dark' ? 'linear-gradient(135deg, #170b12 0%, #080b15 56%, #101228 100%)' : 'linear-gradient(135deg, #fff5f5 0%, #f8faff 60%, #f5f3ff 100%)', borderBottom: `1px solid ${T.border}` }}>
        <div style={{ maxWidth: 1140, margin: '0 auto' }}>
          <div style={{ maxWidth: 700, marginBottom: 48 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: T.red, background: `${T.red}12`, border: `1px solid ${T.red}30`, borderRadius: 20, padding: '6px 12px', fontWeight: 800, fontSize: '0.75rem', letterSpacing: '0.09em', textTransform: 'uppercase' }}>Emergency response</span>
            <h2 style={{ fontSize: '2.55rem', fontWeight: 850, letterSpacing: '-0.04em', color: T.text, lineHeight: 1.1, margin: '18px 0 16px' }}>From state signal to citizen action—instantly.</h2>
            <p style={{ margin: 0, color: T.textSec, fontSize: '1.08rem', lineHeight: 1.65 }}>A controlled, direct-response workflow for verified emergencies. Campaign Managers and Administrators can target one state from the Sentiment Map, select delivery channels, and reach the right citizens without waiting in the normal campaign approval queue.</p>
          </div>
          <div className="steps-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
            {[
              { n: '01', title: 'Detect & target', text: 'Open the Geographic Sentiment Map and select an affected state—or choose it directly from the state selector.', color: T.red },
              { n: '02', title: 'Compose & deliver', text: 'Set urgency, generate an AI-backed emergency flyer, and dispatch through Email, SMS, Telegram, and Push.', color: T.amber },
              { n: '03', title: 'Alert citizens live', text: 'Connected citizens receive a critical chime and visual popup; the flyer stays in their Emergency Alerts centre.', color: T.blue },
            ].map(step => (
              <div key={step.n} style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 18, padding: 28, boxShadow: T.shadow }}>
                <div style={{ color: step.color, fontWeight: 900, fontSize: '0.78rem', letterSpacing: '0.12em', marginBottom: 28 }}>STEP {step.n}</div>
                <h3 style={{ margin: '0 0 10px', color: T.text, fontSize: '1.18rem', fontWeight: 800 }}>{step.title}</h3>
                <p style={{ margin: 0, color: T.textSec, lineHeight: 1.6, fontSize: '0.9rem' }}>{step.text}</p>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', color: T.textSec, fontSize: '0.86rem', fontWeight: 600 }}>
            <span style={{ color: T.red, fontWeight: 900 }}>Access control:</span>
            <span>Direct broadcasts are restricted to Campaign Managers and Administrators.</span>
            <span style={{ color: T.textMuted }}>•</span>
            <span>Only citizens in the selected state receive the live alert and saved flyer.</span>
          </div>
        </div>
      </section>

      <section id="ai-engine" style={{ 
        padding: '100px 40px', 
        maxWidth: 1140, 
        margin: '0 auto', 
        borderBottom: `1px solid ${T.border}` 
      }}>
        <div className="ai-engine-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center' }}>
          {/* Copy Column */}
          <div>
            <span style={{ fontSize: '0.78rem', fontWeight: 800, color: T.blue, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              The Multilingual Core
            </span>
            <h2 style={{ fontSize: '2.4rem', fontWeight: 800, color: T.text, letterSpacing: '-0.03em', marginTop: 12, marginBottom: 18, lineHeight: 1.15 }}>
              Demystifying the CommAI Translation Engine
            </h2>
            <p style={{ color: T.textSec, fontSize: '1.05rem', lineHeight: 1.68, marginBottom: 24 }}>
              Outreach campaigns are only effective if they resonate locally. CommAI combines state-of-the-art Large Language Models (LLMs) with specialized grammatical and cultural rules to preserve the exact context and tone across 23 languages (22 Scheduled Indian Languages + English).
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {[
                { title: 'GPU-Accelerated Inference', desc: 'Powered by low-latency Groq hardware pools, translating 1,000 campaigns takes under 250 milliseconds.', icon: '⚡' },
                { title: 'Regional Dialect Tuning', desc: 'Intelligently adapts vocabulary to fit rural contexts, moving beyond literal dictionaries to match local idioms.', icon: '🗣️' },
                { title: 'Maker-Checker Approved', desc: 'Combines algorithmic safeguards with a dual-signature workflow to ensure absolute message safety.', icon: '🛡️' }
              ].map(item => (
                <div key={item.title} style={{ display: 'flex', gap: 16 }}>
                  <div style={{ fontSize: '1.3rem', width: 36, height: 36, borderRadius: 10, background: T.blueLight, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {item.icon}
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontWeight: 800, fontSize: '0.98rem', color: T.text }}>{item.title}</h4>
                    <p style={{ margin: '4px 0 0 0', fontSize: '0.88rem', color: T.textSec, lineHeight: 1.5 }}>{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Interactive Translation Demo Column */}
          <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 20, padding: 32, boxShadow: T.shadow }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Translation Pipeline Sandbox
              </span>
              <span style={{ fontSize: '0.7rem', background: T.blueLight, color: T.blue, border: `1px solid ${T.blueMid}`, borderRadius: 20, padding: '2px 10px', fontWeight: 700 }}>
                LIVE VISUALIZATION
              </span>
            </div>

            {/* Input Row */}
            <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, padding: 16, marginBottom: 14 }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: 6 }}>Source Broadcast (English)</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: T.text, lineHeight: 1.5 }}>
                "Heavy rain warning in your district tomorrow. Avoid taking cattle near the riverbed."
              </div>
            </div>

            {/* Pipeline Step */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, margin: '14px 0' }}>
              <div style={{ width: 2, height: 20, background: `linear-gradient(180deg, ${T.blue}, ${T.green})` }}></div>
              <div style={{ fontSize: '0.72rem', background: T.greenLight, color: T.green, border: `1px solid ${T.green}40`, borderRadius: 20, padding: '3px 14px', fontWeight: 700, letterSpacing: '0.03em' }}>
                Groq LLM Pipeline · Context Preservation
              </div>
              <div style={{ width: 2, height: 20, background: `linear-gradient(180deg, ${T.green}, ${T.amber})` }}></div>
            </div>

            {/* Output Tabs */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {['Hindi (Standard)', 'Marathi (Regional)', 'Telugu (Rural)'].map((tab, idx) => (
                <button key={tab}
                  style={{
                    flex: 1, padding: '8px 4px', borderRadius: 8, border: `1.5px solid ${idx === 0 ? T.blue : T.border}`,
                    background: idx === 0 ? T.blueLight : T.bg, color: idx === 0 ? T.blue : T.textSec,
                    fontSize: '0.8rem', fontWeight: 700, cursor: 'default'
                  }}>
                  {tab}
                </button>
              ))}
            </div>

            {/* Translated Output */}
            <div style={{ background: T.bg, border: `1.5px solid ${T.blueMid}`, borderRadius: T.radiusSm, padding: 16 }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: T.blue, textTransform: 'uppercase', marginBottom: 6 }}>Localized output (Hindi Standard)</div>
              <p style={{ margin: 0, fontSize: '0.92rem', color: T.text, lineHeight: 1.5, fontWeight: 550 }}>
                "आपके जिले में कल भारी बारिश की चेतावनी है। कृपया पशुओं को नदी के पास ले जाने से बचें।"
              </p>
              
              {/* Indic AI Voice Bulletin Player */}
              <VoiceBulletinPlayer
                text="आपके जिले में कल भारी बारिश की चेतावनी है। कृपया पशुओं को नदी के पास ले जाने से बचें।"
                userPreferredLang="Hindi"
                compact={true}
              />

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTop: `1px dashed ${T.border}` }}>
                <span style={{ fontSize: '0.72rem', color: T.textMuted, fontWeight: 500 }}>Accuracy: <b>99.2%</b></span>
                <span style={{ fontSize: '0.72rem', color: T.textMuted, fontWeight: 500 }}>Inference: <b>182ms</b></span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════ SIMULATOR ══════════════════════ */}
      <section id="simulator" style={{ padding:'100px 40px', maxWidth:1140, margin:'0 auto', position:'relative' }}>
        <div style={{ maxWidth:580, marginBottom:60 }}>
          <div style={{ fontSize:'0.78rem', fontWeight:800, color:T.blue, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:12 }}>Interactive Sandbox</div>
          <h2 style={{ fontSize:'2.4rem', fontWeight:800, letterSpacing:'-0.03em', color:T.text, lineHeight:1.15, marginBottom:16 }}>Simulate Your Campaign</h2>
          <p style={{ color:T.textSec, fontSize:'1.08rem', lineHeight:1.6 }}>Select target parameters and run the wizard pipeline. Check live content rendering in the preview window.</p>
        </div>

        <div className="simulator-grid" style={{ display:'grid', gridTemplateColumns:'1.05fr 1fr', gap:32, alignItems:'start' }}>

          {/* Controls panel */}
          <div style={{ background:T.white, border:`1px solid ${T.border}`, borderRadius:20, padding:32, boxShadow:T.shadow }}>

            {/* Step 1 */}
            <div style={{ marginBottom:28 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
                <div style={{ width:24, height:24, borderRadius:'50%', background:T.blue, color:'#fff', fontSize:'0.78rem', fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', boxShadow: '0 2px 6px rgba(59, 130, 246, 0.3)' }}>1</div>
                <span style={{ fontWeight:700, fontSize:'0.95rem', color:T.text }}>Select Audience Segment</span>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
                {Object.entries(SEGMENTS).map(([k, s]) => (
                  <button key={k} onClick={() => setSegment(k)}
                    style={{ padding:'12px 8px', borderRadius:T.radiusSm, border:`1.5px solid ${segment===k ? T.blue : T.border}`, background:segment===k ? T.blueLight : T.bg, color:segment===k ? T.blue : T.textSec, fontWeight:segment===k ? 700 : 500, fontSize:'0.86rem', cursor:'pointer', fontFamily:'inherit', transition:'all 0.2s ease', textAlign:'center' }}
                    onMouseEnter={e => { if (segment!==k) { e.currentTarget.style.borderColor=T.borderHov; }}}
                    onMouseLeave={e => { if (segment!==k) { e.currentTarget.style.borderColor=T.border; }}}>
                    <div style={{ fontSize:'1.4rem', marginBottom:4 }}>{s.emoji}</div>
                    {s.label}
                  </button>
                ))}
              </div>
              <div style={{ fontSize:'0.8rem', color:T.textMuted, marginTop:10, fontWeight:500 }}>
                💡 Dynamic Reach: {SEGMENTS[segment].size.toLocaleString()} profiles in {SEGMENTS[segment].region}
              </div>
            </div>

            <div style={{ height:1, background:T.border, marginBottom:28 }}></div>

            {/* Step 2 */}
            <div style={{ marginBottom:28 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
                <div style={{ width:24, height:24, borderRadius:'50%', background:T.blue, color:'#fff', fontSize:'0.78rem', fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', boxShadow: '0 2px 6px rgba(59, 130, 246, 0.3)' }}>2</div>
                <span style={{ fontWeight:700, fontSize:'0.95rem', color:T.text }}>Translation Language</span>
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {LANGS.map(l => (
                  <button key={l} onClick={() => setLang(l)}
                    style={{ padding:'6px 16px', borderRadius:20, border:`1.5px solid ${lang===l ? T.blue : T.border}`, background:lang===l ? T.blue : T.white, color:lang===l ? '#fff' : T.textSec, fontWeight:lang===l ? 700 : 500, fontSize:'0.86rem', cursor:'pointer', fontFamily:'inherit', transition:'all 0.2s ease' }}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ height:1, background:T.border, marginBottom:28 }}></div>

            {/* Step 3 */}
            <div style={{ marginBottom:32 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
                <div style={{ width:24, height:24, borderRadius:'50%', background:T.blue, color:'#fff', fontSize:'0.78rem', fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', boxShadow: '0 2px 6px rgba(59, 130, 246, 0.3)' }}>3</div>
                <span style={{ fontWeight:700, fontSize:'0.95rem', color:T.text }}>Delivery Channels</span>
              </div>
              <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                {[['sms','SMS'],['voice','Voice Call'],['telegram','Telegram'],['email','Email'],['push','Push App']].map(([k,l]) => {
                  const on = channels.includes(k);
                  return (
                    <button key={k} onClick={() => toggleChannel(k)}
                      style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 16px', borderRadius:T.radiusSm, border:`1.5px solid ${on ? T.blue : T.border}`, background:on ? T.blueLight : T.white, color:on ? T.blue : T.textSec, fontWeight:on ? 700 : 500, fontSize:'0.86rem', cursor:'pointer', fontFamily:'inherit', transition:'all 0.2s ease' }}>
                      <svg width="14" height="14" viewBox="0 0 12 12" fill={on ? T.blue : T.border} style={{ transition: 'fill 0.2s' }}>
                        <circle cx="6" cy="6" r="6"/>
                        {on && <path d="M3.5 6l2 2 3-3" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none"/>}
                      </svg>
                      {l}
                    </button>
                  );
                })}
              </div>
            </div>

            <button onClick={runSim} disabled={simRunning}
              style={{ width:'100%', padding:'14px', borderRadius:12, border:'none', background:simRunning ? T.textMuted : T.blue, color:'#fff', fontWeight:700, fontSize:'1rem', cursor:simRunning ? 'not-allowed' : 'pointer', fontFamily:'inherit', transition:'all 0.2s ease', boxShadow: simRunning ? 'none' : `0 4px 16px rgba(59,130,246,.35)` }}
              onMouseEnter={e => { if(!simRunning) e.currentTarget.style.filter='brightness(1.1)'; }}
              onMouseLeave={e => { if(!simRunning) e.currentTarget.style.filter='none'; }}>
              {simRunning ? ['Filtering segment…','Translating message…','Estimating reach…'][simStep-1] || 'Processing…' : 'Run Campaign Simulation'}
            </button>

            {simRunning && (
              <div style={{ marginTop:14, height:4, background:T.border, borderRadius:4, overflow:'hidden' }}>
                <div style={{ width:`${simStep*33.3}%`, height:'100%', background:T.blue, borderRadius:4, transition:'width .4s ease' }}></div>
              </div>
            )}
          </div>

          {/* Preview + result */}
          <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

            {/* Message preview */}
            <div style={{ background:T.white, border:`1px solid ${T.border}`, borderRadius:20, padding:24, boxShadow:T.shadow, position: 'relative' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
                <span style={{ fontSize:'0.78rem', fontWeight:800, color:T.textMuted, textTransform:'uppercase', letterSpacing:'0.08em' }}>Preview rendering · {lang}</span>
                <span style={{ fontSize:'0.72rem', background:T.bg, border:`1px solid ${T.border}`, borderRadius:6, padding:'3px 10px', color:T.textSec, fontWeight:600 }}>{channels.join(', ').toUpperCase()}</span>
              </div>

              {/* WhatsApp-style bubble */}
              <div style={{ background: theme === 'dark' ? '#025c4c' : '#d9fdd3', borderRadius:'0 16px 16px 16px', padding:'14px 18px', marginBottom:10, position:'relative', maxWidth:'95%', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize:'0.75rem', color: theme === 'dark' ? '#32d4b4' : '#128c7e', fontWeight:700, marginBottom:6, letterSpacing:'0.03em' }}>CommAI Alert · {SEGMENTS[segment].label}</div>
                <p style={{ fontSize:'0.92rem', color: theme === 'dark' ? '#e9edef' : '#303030', lineHeight:1.6, margin:0, fontWeight: 400 }}>
                  {TRANSLATIONS[segment][lang]}
                </p>
                <div style={{ fontSize:'0.7rem', color: theme === 'dark' ? '#53bdeb' : '#34b7f1', textAlign:'right', marginTop:8, fontWeight: 550 }}>✓✓ Dispatched</div>
              </div>
              <div style={{ fontSize:'0.75rem', color:T.textMuted }}>Sent via {channels.includes('voice') ? 'Voice Gateway' : channels[0]?.toUpperCase() || 'SMS'} · {new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</div>
            </div>

            {/* Simulation result */}
            {simResult ? (
              <div style={{ background:T.greenLight, border:`1px solid ${T.green}40`, borderRadius:20, padding:24, animation: 'fadeIn 0.3s' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, fontWeight:800, color:T.green, marginBottom:18, fontSize:'1rem' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T.green} strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  Simulation Complete
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  {[
                    ['Target Recipients', simResult.target.toLocaleString()],
                    ['Estimated Reach', simResult.reach.toLocaleString()],
                    ['Delivery Confidence', 'High (98.4%)'],
                    ['Active Locale', simResult.lang],
                  ].map(([k,v]) => (
                    <div key={k} style={{ background:T.white, borderRadius:10, padding:'12px 14px', border:`1px solid ${T.border}` }}>
                      <div style={{ fontSize:'0.72rem', color:T.textMuted, marginBottom:4, fontWeight:600 }}>{k}</div>
                      <div style={{ fontWeight:800, color:T.text, fontSize:'0.95rem' }}>{v}</div>
                    </div>
                  ))}
                </div>
                <button onClick={onNavigateToLogin}
                  style={{ width:'100%', marginTop:18, padding:'12px', borderRadius:10, border:'none', background:T.green, color:'#fff', fontWeight:700, fontSize:'0.92rem', cursor:'pointer', fontFamily:'inherit', transition:'all 0.2s', boxShadow: `0 4px 12px ${T.green}30` }}>
                  Open Console & Send →
                </button>
              </div>
            ) : (
              <div style={{ background:T.bg, border:`1px dashed ${T.border}`, borderRadius:20, padding:32, textAlign:'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 140 }}>
                <div style={{ fontSize:'1.8rem', marginBottom:12 }}>⚡</div>
                <div style={{ fontSize:'0.88rem', color:T.textMuted, lineHeight:1.6, maxWidth: 280 }}>
                  Configure your segment options and run simulation to extract impact estimates.
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ══════════════════════ REAL-WORLD USE CASES ══════════════════════ */}
      <section id="use-cases" style={{ 
        background: theme === 'dark' ? 'linear-gradient(180deg, #05070f 0%, #0c101f 100%)' : 'linear-gradient(180deg, #f4f6fb 0%, #ffffff 100%)', 
        borderTop: `1px solid ${T.border}`, 
        borderBottom: `1px solid ${T.border}`, 
        padding: '100px 40px' 
      }}>
        <div style={{ maxWidth: 1140, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', marginBottom: 60, flexWrap: 'wrap', gap: 20 }}>
            <div style={{ maxWidth: 580 }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 800, color: T.blue, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                Outreach In Action
              </span>
              <h2 style={{ fontSize: '2.4rem', fontWeight: 800, color: T.text, letterSpacing: '-0.03em', marginTop: 12, marginBottom: 16, lineHeight: 1.15 }}>
                Real-World Sector Deployments
              </h2>
              <p style={{ color: T.textSec, fontSize: '1.08rem', lineHeight: 1.6, margin: 0 }}>
                See how different departments utilize CommAI's multilingual pathways to broadcast crucial utility campaigns.
              </p>
            </div>
            
            {/* Quick Sector Selector Tabs */}
            <div style={{ display: 'flex', gap: 8, background: T.bg, padding: 6, borderRadius: 12, border: `1px solid ${T.border}` }}>
              {[
                { id: 'agri', label: '🌾 Agriculture' },
                { id: 'health', label: '🏥 Healthcare' },
                { id: 'disaster', label: '🚨 Disaster Mgmt' }
              ].map(tab => (
                <button key={tab.id} onClick={() => setActiveUseSector(tab.id)}
                  style={{
                    padding: '8px 18px', borderRadius: 8, border: 'none',
                    background: activeUseSector === tab.id ? T.white : 'none',
                    color: activeUseSector === tab.id ? T.blue : T.textSec,
                    fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer', transition: 'all 0.2s'
                  }}>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Sector Display Content */}
          <div className="sector-display-grid" style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 48, alignItems: 'center' }}>
            {/* Info Block */}
            <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 20, padding: 40, boxShadow: T.shadow }}>
              {activeUseSector === 'agri' && (
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 800, color: T.blue, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Sector Spotlight: Agriculture</div>
                  <h3 style={{ fontSize: '1.6rem', fontWeight: 800, color: T.text, margin: '0 0 14px 0' }}>Weather Advisories & Sowing Subsidies</h3>
                  <p style={{ fontSize: '0.96rem', color: T.textSec, lineHeight: 1.6, marginBottom: 20 }}>
                    State agricultural boards require instantaneous dissemination of monsoon dates, pest warnings, and seed subsidy availabilities. CommAI allows operators to select farmers based on crop type/district and dispatch customized alerts in their native dialect.
                  </p>
                  <ul style={{ paddingLeft: 20, margin: 0, display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.9rem', color: T.textSec }}>
                    <li><b>Dynamic Targeting:</b> Filter by crop (e.g. Rice, Cotton) and location.</li>
                    <li><b>Subsidies awareness:</b> Boost government program registrations.</li>
                    <li><b>SMS & Voice Calls:</b> Delivers even to basic non-smartphone users.</li>
                  </ul>
                </div>
              )}
              {activeUseSector === 'health' && (
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 800, color: T.green, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Sector Spotlight: Healthcare</div>
                  <h3 style={{ fontSize: '1.6rem', fontWeight: 800, color: T.text, margin: '0 0 14px 0' }}>Immunization Campaigns & Health Alerts</h3>
                  <p style={{ fontSize: '0.96rem', color: T.textSec, lineHeight: 1.6, marginBottom: 20 }}>
                    National health campaigns depend on local language reminders to maximize vaccine turnouts. Health coordinators schedule automated pushes and SMS alerts to notify families of upcoming primary clinics and vaccination drives.
                  </p>
                  <ul style={{ paddingLeft: 20, margin: 0, display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.9rem', color: T.textSec }}>
                    <li><b>Polio & Vaccination Drives:</b> Scheduled micro-reminders to localized zipcodes.</li>
                    <li><b>Multilingual Voice Alerts:</b> Share health guidelines via automated calls.</li>
                    <li><b>Zero Spam:</b> Restricted templates prevent communication fatigue.</li>
                  </ul>
                </div>
              )}
              {activeUseSector === 'disaster' && (
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 800, color: T.red, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Sector Spotlight: Disaster Management</div>
                  <h3 style={{ fontSize: '1.6rem', fontWeight: 800, color: T.text, margin: '0 0 14px 0' }}>Urgent Weather Warnings & Evacuation Alerts</h3>
                  <p style={{ fontSize: '0.96rem', color: T.textSec, lineHeight: 1.6, marginBottom: 20 }}>
                    In times of flood, cyclone, or heatwaves, every second counts. Authorized Campaign Managers and Administrators can use the active Sentiment Map to launch a direct state emergency broadcast. This verified direct-response action bypasses the normal maker-checker campaign queue.
                  </p>
                  <ul style={{ paddingLeft: 20, margin: 0, display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.9rem', color: T.textSec }}>
                    <li><b>State-specific targeting:</b> Only citizens in the selected state receive the alert.</li>
                    <li><b>Four delivery channels:</b> Email, Voice Call, SMS, and Push are selectable per broadcast.</li>
                    <li><b>Real-time citizen response:</b> A live chime, visual popup, and saved emergency flyer appear on the audience dashboard.</li>
                  </ul>
                </div>
              )}
            </div>

            {/* Mobile Mockup Preview Column */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{ 
                width: 320, height: 580, borderRadius: 36, background: '#000', padding: 12, 
                boxShadow: '0 20px 50px rgba(0,0,0,0.3)', border: '4px solid #334155', position: 'relative'
              }}>
                {/* Speaker pill */}
                <div style={{ width: 100, height: 20, background: '#000', borderRadius: '0 0 14px 14px', position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}></div>
                
                {/* Screen */}
                <div style={{ 
                  width: '100%', height: '100%', background: '#111827', borderRadius: 28, overflow: 'hidden', 
                  position: 'relative', display: 'flex', flexDirection: 'column', padding: '30px 16px 16px' 
                }}>
                  {/* Top phone bar */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#6b7280', marginBottom: 12, fontWeight: 700 }}>
                    <span>14:34</span>
                    <span>📶 🛜 🔋</span>
                  </div>

                  {/* App Header */}
                  <div style={{ background: '#1f2937', padding: '10px 14px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: T.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem' }}>ℹ️</div>
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: '0.72rem', color: '#f9fafb', fontWeight: 800 }}>Gov-Alert Gateway</div>
                      <div style={{ fontSize: '0.58rem', color: '#9ca3af' }}>Verified Broadcast</div>
                    </div>
                  </div>

                  {/* Message bubble */}
                  {activeUseSector === 'agri' && (
                    <div style={{ background: '#065f46', borderRadius: '0 12px 12px 12px', padding: '12px 14px', maxWidth: '90%', textAlign: 'left' }}>
                      <div style={{ fontSize: '0.65rem', color: '#a7f3d0', fontWeight: 700, marginBottom: 4 }}>कृषि विभाग (Dept. of Agriculture)</div>
                      <p style={{ margin: 0, fontSize: '0.78rem', color: '#f3f4f6', lineHeight: 1.4 }}>
                        प्रिय किसान, मौसम विभाग ने कल जलना जिले में भारी वर्षा की चेतावनी दी है। कृपया खेतों में पानी जमा होने से रोकने के लिए जल निकासी की व्यवस्था करें।
                      </p>
                      <div style={{ fontSize: '0.55rem', color: '#6ee7b7', textAlign: 'right', marginTop: 6 }}>14:30 ✓✓</div>
                    </div>
                  )}
                  {activeUseSector === 'health' && (
                    <div style={{ background: '#1e3a8a', borderRadius: '0 12px 12px 12px', padding: '12px 14px', maxWidth: '90%', textAlign: 'left' }}>
                      <div style={{ fontSize: '0.65rem', color: '#bfdbfe', fontWeight: 700, marginBottom: 4 }}>राष्ट्रीय स्वास्थ्य मिशन (NHM Alerts)</div>
                      <p style={{ margin: 0, fontSize: '0.78rem', color: '#f3f4f6', lineHeight: 1.4 }}>
                        नमस्ते, इस रविवार सुबह 9 बजे से आपके प्राथमिक स्वास्थ्य केंद्र पर बच्चों के लिए मुफ्त पल्स पोलियो प्रतिरक्षण शिविर का आयोजन किया गया है।
                      </p>
                      <div style={{ fontSize: '0.55rem', color: '#93c5fd', textAlign: 'right', marginTop: 6 }}>14:30 ✓✓</div>
                    </div>
                  )}
                  {activeUseSector === 'disaster' && (
                    <div style={{ background: '#7f1d1d', borderRadius: '0 12px 12px 12px', padding: '12px 14px', maxWidth: '90%', textAlign: 'left' }}>
                      <div style={{ fontSize: '0.65rem', color: '#fca5a5', fontWeight: 700, marginBottom: 4 }}>🚨 आपदा प्रबंधन (Disaster Mgmt Authority)</div>
                      <p style={{ margin: 0, fontSize: '0.78rem', color: '#f3f4f6', lineHeight: 1.4 }}>
                        अति आवश्यक सूचना: नदी बेसिन में जलस्तर बढ़ने के कारण बाढ़ का खतरा है। कृपया सुरक्षित और ऊंचे स्थानों पर चले जाएं। हेल्पलाइन: 108.
                      </p>
                      <div style={{ fontSize: '0.55rem', color: '#fca5a5', textAlign: 'right', marginTop: 6 }}>14:30 ✓✓</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════ REACH ESTIMATOR ══════════════════════ */}
      <section id="estimator" style={{ background:'linear-gradient(135deg, #070913 0%, #0e1224 50%, #070913 100%)', borderTop:`1px solid ${T.border}`, borderBottom:`1px solid ${T.border}`, padding:'100px 40px' }}>
        <div style={{ maxWidth:1140, margin:'0 auto' }}>
          <div style={{ maxWidth:580, marginBottom:60 }}>
            <div style={{ fontSize:'0.78rem', fontWeight:800, color:'#93c5fd', textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:12 }}>Impact Modeler</div>
            <h2 style={{ fontSize:'2.4rem', fontWeight:800, letterSpacing:'-0.03em', color:'#f1f5f9', lineHeight:1.15, marginBottom:16 }}>Calculate Reach Real-Time</h2>
            <p style={{ color:'#94a3b8', fontSize:'1.08rem', lineHeight:1.6 }}>Drag the audience load to see how different active communication channels impact total citizen coverage.</p>
          </div>

          <div className="estimator-grid" style={{ display:'grid', gridTemplateColumns:'1.1fr 1fr', gap:40, alignItems:'start' }}>

            {/* Inputs */}
            <div style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:20, padding:32, backdropFilter:'blur(12px)' }}>
              <div style={{ marginBottom:32 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:16 }}>
                  <span style={{ fontWeight:700, color:'#f1f5f9', fontSize:'0.95rem' }}>Select Target Volume</span>
                  <span style={{ fontWeight:900, color:'#93c5fd', fontSize:'1.45rem', fontVariantNumeric:'tabular-nums' }}>{audienceSize.toLocaleString()}</span>
                </div>
                <input type="range" min={1000} max={100000} step={500} value={audienceSize} onChange={e=>setAudienceSize(+e.target.value)}
                  style={{ width:'100%', accentColor:'#3b82f6', cursor:'pointer', height:6 }}/>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.76rem', color:'#64748b', marginTop:8, fontWeight:500 }}>
                  <span>1,000</span><span>50,000</span><span>1,00,000</span>
                </div>
              </div>

              <div>
                <div style={{ fontWeight:700, color:'#f1f5f9', marginBottom:16, fontSize:'0.95rem' }}>Select Channels</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  {[['email','✉️ Email Broadcast'],['sms','📱 SMS Direct'],['voice','📞 Voice Call'],['telegram','📢 Telegram Channel'],['push','🔔 In-App Push'],['website','🌐 Gov Web Portal']].map(([k,l]) => (
                    <label key={k}
                      style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 16px', background:predCh[k] ? 'rgba(37,99,235,0.15)' : 'rgba(255,255,255,0.02)', border:`1.5px solid ${predCh[k] ? '#3b82f6' : 'rgba(255,255,255,0.06)'}`, borderRadius:T.radiusSm, cursor:'pointer', fontSize:'0.88rem', color:predCh[k] ? '#93c5fd' : '#94a3b8', fontWeight:predCh[k] ? 700 : 500, transition:'all 0.2s' }}>
                      <input type="checkbox" checked={predCh[k]} onChange={() => setPredCh(p=>({...p,[k]:!p[k]}))} style={{ accentColor:'#3b82f6', width:15, height:15 }}/>
                      {l}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Results */}
            <div style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:20, padding:32, backdropFilter:'blur(12px)' }}>
              <div style={{ fontSize:'0.78rem', fontWeight:800, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:16 }}>Total Estimated Reach</div>
              <div style={{ fontSize:'3.4rem', fontWeight:900, color:T.green, letterSpacing:'-0.03em', lineHeight:1 }}>~{estReach.toLocaleString()}</div>
              <div style={{ fontSize:'0.9rem', color:'#94a3b8', marginTop:8, marginBottom:24 }}>citizens reached ({reachPct.toFixed(1)}% of total load)</div>

              <div style={{ height:8, borderRadius:8, background:'rgba(255,255,255,0.05)', overflow:'hidden', marginBottom:28 }}>
                <div style={{ width:`${reachPct}%`, height:'100%', background:`linear-gradient(90deg, #3b82f6, ${T.green})`, borderRadius:8, transition:'width .4s ease' }}></div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                {[
                  ['Active Channels', activeChs || '—'],
                  ['Coverage Ratio', `${reachPct.toFixed(1)}%`],
                  ['Delivery Trust', activeChs>2?'High':activeChs>0?'Medium':'N/A'],
                  ['Locales supported', '22 Unicode'],
                ].map(([k,v]) => (
                  <div key={k} style={{ background:'rgba(255,255,255,0.02)', borderRadius:10, padding:'12px 14px', border:'1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ fontSize:'0.75rem', color:'#64748b', marginBottom:4, fontWeight:600 }}>{k}</div>
                    <div style={{ fontWeight:700, color:'#f1f5f9', fontSize:'0.92rem' }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════ ROLES ══════════════════════ */}
      <section id="roles" style={{ padding:'100px 40px', maxWidth:1140, margin:'0 auto', position:'relative' }}>
        <div style={{ maxWidth:580, marginBottom:60 }}>
          <div style={{ fontSize:'0.78rem', fontWeight:800, color:T.blue, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:12 }}>RBAC Compliance</div>
          <h2 style={{ fontSize:'2.4rem', fontWeight:800, letterSpacing:'-0.03em', color:T.text, lineHeight:1.15, marginBottom:16 }}>Hierarchical Role Boundaries</h2>
          <p style={{ color:T.textSec, fontSize:'1.08rem', lineHeight:1.6 }}>Fine-grained role configurations enforce strict boundaries between authors, managers, and system auditors.</p>
        </div>

        <div className="roles-grid" style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:24 }}>
          {ROLES.map(role => (
            <div key={role.title}
              style={{ background:T.white, border:`1.5px solid ${role.highlighted ? T.blue : T.border}`, borderRadius:20, padding:30, position:'relative', boxShadow:role.highlighted ? `0 0 0 3px ${T.blue}15, ${T.shadowLg}` : T.shadow }}>
              {role.highlighted && (
                <div style={{ position:'absolute', top:-11, left:'50%', transform:'translateX(-50%)', background: `linear-gradient(135deg, ${T.blue} 0%, #7c3aed 100%)`, color:'#fff', fontSize:'0.7rem', fontWeight:800, padding:'3px 14px', borderRadius:20, whiteSpace:'nowrap', letterSpacing:'0.05em' }}>
                  CORE OPERATOR
                </div>
              )}

              {/* Role header */}
              <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:20 }}>
                <div style={{ width:46, height:46, borderRadius:12, background:role.badgeBg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.3rem' }}>
                  {role.emoji}
                </div>
                <div>
                  <div style={{ fontWeight:800, color:T.text, fontSize:'1.05rem' }}>{role.title}</div>
                  <div style={{ fontSize:'0.78rem', color:role.badge, fontWeight:700, marginTop:2 }}>
                    {role.sees.length} active panels
                  </div>
                </div>
              </div>

              <p style={{ fontSize:'0.88rem', color:T.textSec, lineHeight:1.6, marginBottom:22 }}>{role.desc}</p>

              {/* Access list */}
              <div style={{ fontSize:'0.78rem', fontWeight:800, color:T.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>Permission Scope</div>
              <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:26 }}>
                {role.sees.map(item => (
                  <div key={item} style={{ display:'flex', alignItems:'center', gap:8, fontSize:'0.88rem', color:T.text, fontWeight:500 }}>
                    <div style={{ width:18, height:18, borderRadius:'50%', background:role.badgeBg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><polyline points="2 6 5 9 10 3" stroke={role.badge} strokeWidth="2.2" strokeLinecap="round"/></svg>
                    </div>
                    {item}
                  </div>
                ))}
              </div>

              <button onClick={onNavigateToLogin}
                style={{ width:'100%', padding:'12px', borderRadius:10, border:`1.5px solid ${role.highlighted ? T.blue : T.border}`, background:role.highlighted ? T.blue : T.white, color:role.highlighted ? '#fff' : T.text, fontWeight:700, fontSize:'0.9rem', cursor:'pointer', fontFamily:'inherit', transition:'all 0.2s', boxShadow: role.highlighted ? `0 4px 12px ${T.blue}20` : 'none' }}
                onMouseEnter={e => { if (!role.highlighted) { e.currentTarget.style.borderColor=role.badge; e.currentTarget.style.color=role.badge; e.currentTarget.style.transform='translateY(-1px)'; } else { e.currentTarget.style.filter='brightness(1.1)'; } }}
                onMouseLeave={e => { if (!role.highlighted) { e.currentTarget.style.borderColor=T.border; e.currentTarget.style.color=T.text; e.currentTarget.style.transform='none'; } else { e.currentTarget.style.filter='none'; } }}>
                Sign In as {role.title.split(' ')[0]}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════ SECURITY & COMPLIANCE ══════════════════════ */}
      <section id="security-compliance" style={{ 
        background: theme === 'dark' ? '#0b0f19' : '#f8fafc',
        borderTop: `1px solid ${T.border}`,
        borderBottom: `1px solid ${T.border}`,
        padding: '100px 40px'
      }}>
        <div className="security-grid" style={{ maxWidth: 1140, margin: '0 auto', display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 64, alignItems: 'center' }}>
          {/* Badge & Seal Column */}
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ 
              width: 100, height: 100, borderRadius: '50%', background: T.blueLight, display: 'flex', 
              alignItems: 'center', justifyContent: 'center', fontSize: '3rem', border: `2px solid ${T.blue}`,
              boxShadow: `0 8px 30px ${T.blue}20`, marginBottom: 20
            }}>
              🛡️
            </div>
            <h3 style={{ fontSize: '1.8rem', fontWeight: 900, color: T.text, margin: '0 0 8px 0', letterSpacing: '-0.02em' }}>
              Gov-Grade Compliance
            </h3>
            <span style={{ fontSize: '0.78rem', background: T.greenLight, color: T.green, border: `1px solid ${T.green}40`, borderRadius: 20, padding: '4px 16px', fontWeight: 700, letterSpacing: '0.04em' }}>
              DPDP ACT 2023 CERTIFIED ARCHITECTURE
            </span>
            <p style={{ fontSize: '0.86rem', color: T.textMuted, lineHeight: 1.5, marginTop: 14, maxWidth: 320 }}>
              CommAI meets strict localized data residency regulations, purpose limitation covenants, and citizen consent mandates.
            </p>
          </div>

          {/* Pillars List Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {[
              { title: 'Local Data Residency', desc: 'No citizen demographics ever leave geographical borders. All information is secured in encrypted local storage boundaries.', tag: 'DPDP COMPLIANT' },
              { title: 'Secure Cryptographic Relays', desc: 'Data in transit is fully encrypted using TLS 1.3 pipelines, safeguarding transmission paths to gateway providers.', tag: 'AES-256' },
              { title: 'Dual-Signature Verification', desc: 'Campaigns targeting critical volumes (>100 recipients) are held in state loops until approved by administrators to prevent accidental spams.', tag: 'MAKER-CHECKER' }
            ].map(pillar => (
              <div key={pillar.title} style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 16, padding: '20px 24px', boxShadow: T.shadow }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <h4 style={{ margin: 0, fontWeight: 800, fontSize: '1rem', color: T.text }}>{pillar.title}</h4>
                  <span style={{ fontSize: '0.65rem', background: T.blueLight, color: T.blue, borderRadius: 4, padding: '2px 8px', fontWeight: 700 }}>{pillar.tag}</span>
                </div>
                <p style={{ margin: 0, fontSize: '0.88rem', color: T.textSec, lineHeight: 1.5 }}>{pillar.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════ TECHNICAL FAQS ══════════════════════ */}
      <section id="faqs" style={{ padding: '100px 40px', maxWidth: 840, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 50 }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 800, color: T.blue, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            Common Queries
          </span>
          <h2 style={{ fontSize: '2.4rem', fontWeight: 800, color: T.text, letterSpacing: '-0.03em', marginTop: 12, marginBottom: 12 }}>
            Frequently Asked Questions
          </h2>
          <p style={{ color: T.textSec, fontSize: '1.05rem', margin: 0 }}>
            Resolve technical doubts regarding platform limits, fallback mechanisms, and cost models.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[
            { q: 'How accurate are the automated translations?', a: 'Translations are powered by domain-specific LLM models and optimized for regional contexts. For high-importance campaigns, operators can leverage our Built-in review editor to run a secondary manual check on all translations before dispatching.' },
            { q: 'Who can send a direct state emergency alert?', a: 'Only Campaign Managers and Administrators can launch the direct broadcast from the Geographic Sentiment Map. This verified emergency action bypasses the standard maker-checker campaign queue and is scoped to citizens in the selected state.' },
            { q: 'How do citizens receive critical alerts?', a: 'Citizens in the targeted state receive the selected Email, Voice Call, SMS, and Push deliveries. If they are currently connected, CommAI also presents a real-time chime and visual alert; the emergency flyer remains in their dashboard Alert Centre.' },
            { q: 'What happens if a Voice or SMS gateway fails?', a: 'CommAI utilizes an automated channel fallback queue. If a primary pathway (e.g. Voice API) fails or experiences high latencies, the dispatcher routes the warning through secondary SMS or push relays based on recipient preferences.' },
            { q: 'Can we restrict the maximum number of daily messages?', a: 'Yes. Administrators can define safety caps in the Settings panel to limit the total volume of daily emails/texts. Once reached, scheduled campaigns are automatically paused to prevent gateway cost spikes.' },
            { q: 'How is message delivery pricing calculated?', a: 'The estimator calculates potential expenditure based on typical local costs (SMS = $0.02, Voice Call = $0.04). No billing happens on CommAI itself; operators hook up their own Twilio, SMTP, or Voice API credentials.' }
          ].map((faq, idx) => {
            const isOpen = openFaqIndex === idx;
            return (
              <div key={faq.q} style={{ background: T.white, border: `1.5px solid ${isOpen ? T.blue : T.border}`, borderRadius: 12, overflow: 'hidden', transition: 'all 0.25s ease' }}>
                <button onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                  style={{
                    width: '100%', padding: '18px 24px', background: 'none', border: 'none', textAlign: 'left',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontFamily: 'inherit'
                  }}>
                  <span style={{ fontWeight: 800, color: T.text, fontSize: '0.98rem' }}>{faq.q}</span>
                  <span style={{ fontSize: '1.2rem', color: isOpen ? T.blue : T.textMuted, transform: isOpen ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s' }}>＋</span>
                </button>
                {isOpen && (
                  <div style={{ padding: '0 24px 20px 24px', fontSize: '0.88rem', color: T.textSec, lineHeight: 1.6, borderTop: `1px solid ${T.border}`, background: T.bg }}>
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ══════════════════════ CTA ══════════════════════ */}
      <section style={{ background:`linear-gradient(135deg, ${T.blue} 0%, #7c3aed 100%)`, padding:'80px 40px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position:'absolute', top:-40, right:-40, width:300, height:300, borderRadius:'50%', background:'radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 70%)', pointerEvents:'none' }}></div>
        <div style={{ maxWidth:640, margin:'0 auto', textAlign:'center', position: 'relative', zIndex: 1 }}>
          <h2 style={{ fontSize:'2.5rem', fontWeight:800, color:'#fff', letterSpacing:'-0.03em', marginBottom:18, lineHeight:1.15 }}>
            Ready to dispatch your campaign?
          </h2>
          <p style={{ color:'rgba(255,255,255,.85)', fontSize:'1.1rem', marginBottom:36, lineHeight:1.6 }}>
            Set up an operator account and launch a multilingual alert broadcast in under 5 minutes.
          </p>
          <div style={{ display:'flex', gap:14, justifyContent:'center', flexWrap:'wrap' }}>
            <button onClick={onNavigateToRegister}
              style={{ padding:'14px 32px', borderRadius:12, border:'none', background:'#fff', color:T.blue, fontWeight:800, fontSize:'1.05rem', cursor:'pointer', fontFamily:'inherit', boxShadow:'0 8px 24px rgba(0,0,0,.15)', transition:'all 0.2s' }}
              onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 10px 28px rgba(0,0,0,.2)';}}
              onMouseLeave={e=>{e.currentTarget.style.transform='none'; e.currentTarget.style.boxShadow='0 8px 24px rgba(0,0,0,.15)';}}>
              Create Free Account
            </button>
            <button onClick={onNavigateToLogin}
              style={{ padding:'14px 28px', borderRadius:12, border:'1.5px solid rgba(255,255,255,.3)', background:'rgba(255,255,255,.1)', color:'#fff', fontWeight:600, fontSize:'1.05rem', cursor:'pointer', fontFamily:'inherit', backdropFilter:'blur(8px)', transition:'all 0.2s' }}
              onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(255,255,255,.7)'; e.currentTarget.style.background='rgba(255,255,255,.15)';}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(255,255,255,.3)'; e.currentTarget.style.background='rgba(255,255,255,.1)';}}>
              Sign In to Platform
            </button>
          </div>
        </div>
      </section>

      {/* ══════════════════════ FOOTER ══════════════════════ */}
      <footer className="landing-footer" style={{ background: '#04060c', borderTop: `1px solid ${T.border}`, padding: '70px 40px 40px', color: '#ffffff' }}>
        <div style={{ maxWidth: 1140, margin: '0 auto' }}>
          {/* Main columns grid */}
          <div className="footer-grid" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', gap: 40, marginBottom: 50, textAlign: 'left' }}>
            {/* Column 1: Info */}
            <div>
              <button onClick={() => smoothScrollTo('hero')}
                style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 18, color: '#ffffff' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.15)' }}>
                  <img src="/logo.jpeg" alt="CommAI Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <span style={{ color: '#ffffff', fontWeight: 800, fontSize: '1.2rem', letterSpacing: '-0.02em' }}>CommAI</span>
              </button>
              <p style={{ color: '#ffffff', fontSize: '0.86rem', lineHeight: 1.6, marginBottom: 20, opacity: 0.95 }}>
                Unified mass communication platform for e-governance agencies and NGOs. Deploy alerts, advisories, and surveys in 23 regional languages (22 Scheduled Indic + English).
              </p>
              {/* Service status */}
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.35)', borderRadius: 20, padding: '4px 12px' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399' }}></span>
                <span className="status-text" style={{ fontSize: '0.72rem', color: '#34d399', fontWeight: 700 }}>ALL SYSTEMS OPERATIONAL</span>
              </div>
            </div>

            {/* Column 2: Quick Links */}
            <div>
              <h4 style={{ color: '#ffffff', fontWeight: 800, fontSize: '0.9rem', marginBottom: 18, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Platform</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { id: 'platform', label: 'Key Features' },
                  { id: 'simulator', label: 'Interactive Sandbox' },
                  { id: 'use-cases', label: 'Sector Use Cases' },
                  { id: 'roles', label: 'Access Roles' }
                ].map(link => (
                  <button key={link.id} onClick={() => smoothScrollTo(link.id)}
                    style={{ background: 'none', border: 'none', color: '#ffffff', fontSize: '0.84rem', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, textAlign: 'left', padding: 0, transition: 'color 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.color = '#60a5fa'}
                    onMouseLeave={e => e.currentTarget.style.color = '#ffffff'}>
                    {link.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Column 3: Tech Resources */}
            <div>
              <h4 style={{ color: '#ffffff', fontWeight: 800, fontSize: '0.9rem', marginBottom: 18, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Developer Tools</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {['API Documentation', 'Developer sandbox', 'Changelog', 'Integration Diagnostics'].map(link => (
                  <button key={link} type="button" onClick={() => setActiveResource(link)}
                    style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', color: '#ffffff', fontFamily: 'inherit', fontSize: '0.84rem', fontWeight: 500, cursor: 'pointer', transition: 'color 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.color = '#60a5fa'}
                    onMouseLeave={e => e.currentTarget.style.color = '#ffffff'}>
                    {link}
                  </button>
                ))}
              </div>
            </div>

            {/* Column 4: Legal & Compliance */}
            <div>
              <h4 style={{ color: '#ffffff', fontWeight: 800, fontSize: '0.9rem', marginBottom: 18, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Compliance</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {['DPDP Act Privacy Policy', 'Terms of Service', 'Maker-Checker Guidelines', 'Consent registers'].map(link => (
                  <button key={link} type="button" onClick={() => setActiveResource(link)}
                    style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', color: '#ffffff', fontFamily: 'inherit', fontSize: '0.84rem', fontWeight: 500, cursor: 'pointer', transition: 'color 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.color = '#60a5fa'}
                    onMouseLeave={e => e.currentTarget.style.color = '#ffffff'}>
                    {link}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom row */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 30, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
            <span style={{ color: '#ffffff', fontSize: '0.82rem', fontWeight: 500 }}>
              © {new Date().getFullYear()} CommAI · National information awareness gateway initiative.
            </span>
            <span style={{ color: '#ffffff', fontSize: '0.82rem', fontWeight: 500 }}>
              Designed for public trust & compliance.
            </span>
          </div>
        </div>
      </footer>

      {activeResource && (() => {
        const resource = FOOTER_RESOURCES[activeResource];
        return (
          <div
            role="presentation"
            onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveResource(null); }}
            style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'grid', placeItems: 'center', padding: 20, background: 'rgba(15, 23, 42, 0.64)' }}
          >
            <section role="dialog" aria-modal="true" aria-labelledby="footer-resource-title" style={{ width: 'min(100%, 590px)', borderRadius: 18, padding: '28px', background: '#fff', color: '#0f172a', boxShadow: '0 24px 60px rgba(15, 23, 42, 0.3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
                <div>
                  <div style={{ color: '#2563eb', fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{resource.eyebrow}</div>
                  <h2 id="footer-resource-title" style={{ margin: '7px 0 0', fontSize: '1.45rem' }}>{resource.title}</h2>
                </div>
                <button type="button" aria-label="Close resource" onClick={() => setActiveResource(null)} style={{ border: 'none', background: '#f1f5f9', color: '#334155', borderRadius: 8, width: 34, height: 34, fontSize: '1.35rem', cursor: 'pointer' }}>×</button>
              </div>
              <p style={{ margin: '20px 0 16px', color: '#475569', lineHeight: 1.65 }}>{resource.body}</p>
              <ul style={{ margin: 0, paddingLeft: 20, color: '#334155', lineHeight: 1.75 }}>
                {resource.details.map(detail => <li key={detail}>{detail}</li>)}
              </ul>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
                {resource.action && <button type="button" onClick={() => { setActiveResource(null); smoothScrollTo(resource.action.target); }} style={{ border: 'none', borderRadius: 8, padding: '10px 14px', background: '#2563eb', color: '#fff', fontFamily: 'inherit', fontWeight: 700, cursor: 'pointer' }}>{resource.action.label}</button>}
                <button type="button" onClick={() => setActiveResource(null)} style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: '10px 14px', background: '#fff', color: '#334155', fontFamily: 'inherit', fontWeight: 700, cursor: 'pointer' }}>Close</button>
              </div>
            </section>
          </div>
        );
      })()}

    </div>
  );
}
