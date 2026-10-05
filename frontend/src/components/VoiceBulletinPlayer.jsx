import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const INDIC_LANGUAGES = [
  { code: 'hi', name: 'Hindi', native: 'हिंदी', flag: '🇮🇳' },
  { code: 'en', name: 'English', native: 'English', flag: '🇬🇧' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা', flag: '🇮🇳' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்', flag: '🇮🇳' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు', flag: '🇮🇳' },
  { code: 'mr', name: 'Marathi', native: 'मराठी', flag: '🇮🇳' },
  { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી', flag: '🇮🇳' },
  { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ', flag: '🇮🇳' },
  { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ', flag: '🇮🇳' },
  { code: 'ml', name: 'Malayalam', native: 'മലയാളം', flag: '🇮🇳' },
  { code: 'or', name: 'Odia', native: 'ଓଡ଼ିଆ', flag: '🇮🇳' },
  { code: 'as', name: 'Assamese', native: 'অসমীয়া', flag: '🇮🇳' },
  { code: 'ur', name: 'Urdu', native: 'اردو', flag: '🇮🇳' },
  { code: 'mai', name: 'Maithili', native: 'मैथिली', flag: '🇮🇳' },
  { code: 'sat', name: 'Santali', native: 'संथाली', flag: '🇮🇳' },
  { code: 'ks', name: 'Kashmiri', native: 'कॉशुर', flag: '🇮🇳' },
  { code: 'ne', name: 'Nepali', native: 'नेपाली', flag: '🇮🇳' },
  { code: 'kok', name: 'Konkani', native: 'कोंकणी', flag: '🇮🇳' },
  { code: 'sd', name: 'Sindhi', native: 'सिंधी', flag: '🇮🇳' },
  { code: 'doi', name: 'Dogri', native: 'डोगरी', flag: '🇮🇳' },
  { code: 'mni', name: 'Manipuri', native: 'मणिपुरी', flag: '🇮🇳' },
  { code: 'brx', name: 'Bodo', native: 'बोडो', flag: '🇮🇳' },
  { code: 'sa', name: 'Sanskrit', native: 'संस्कृतम्', flag: '🇮🇳' },
];

const resolveApiBase = (providedUrl) => {
  if (providedUrl && providedUrl !== 'http://127.0.0.1:8000') return providedUrl;
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL;
  }
  return 'http://localhost:8001';
};

const VoiceBulletinPlayer = ({
  text,
  userPreferredLang = 'Hindi',
  backendUrl,
  compact = false,
}) => {
  const getInitialLanguage = () => {
    const saved = localStorage.getItem('commai_preferred_language');
    const target = saved || userPreferredLang || 'Hindi';
    const cleanPref = String(target).toLowerCase().trim();
    return INDIC_LANGUAGES.find(
      l => l.name.toLowerCase() === cleanPref || l.code.toLowerCase() === cleanPref || l.native.toLowerCase() === cleanPref
    ) || INDIC_LANGUAGES[0];
  };

  const [selectedLang, setSelectedLang] = useState(getInitialLanguage());

  // Listen for global language changes across portal sub-pages
  useEffect(() => {
    const handleLangChange = (e) => {
      const newLangName = e.detail;
      const match = INDIC_LANGUAGES.find(l => l.name.toLowerCase() === String(newLangName).toLowerCase().trim());
      if (match) {
        setSelectedLang(match);
      }
    };
    window.addEventListener('commai_language_changed', handleLangChange);
    return () => window.removeEventListener('commai_language_changed', handleLangChange);
  }, []);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1.0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [audioUrl, setAudioUrl] = useState(null);
  const [showPlayerModal, setShowPlayerModal] = useState(false);

  const audioRef = useRef(null);
  const dropdownRef = useRef(null);
  const speechTimerRef = useRef(null);

  const userHasPickedLang = useRef(false);

  const filteredLanguages = INDIC_LANGUAGES.filter(
    lang =>
      lang.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lang.native.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lang.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    if (!userHasPickedLang.current) {
      setSelectedLang(getInitialLanguage());
    }
  }, [userPreferredLang]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      if (speechTimerRef.current) clearInterval(speechTimerRef.current);
    };
  }, []);

  const chunkTextForSpeech = (text) => {
    if (!text) return [];
    // Split on sentence boundaries, punctuation, and newlines
    const rawSentences = text.split(/(?<=[.!?\n।])\s+/);
    const chunks = [];
    let currentChunk = '';

    for (const sentence of rawSentences) {
      if ((currentChunk + ' ' + sentence).length > 120) {
        if (currentChunk.trim()) chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk = currentChunk ? currentChunk + ' ' + sentence : sentence;
      }
    }
    if (currentChunk.trim()) chunks.push(currentChunk.trim());
    return chunks;
  };

  const heartbeatRef = useRef(null);

  const stopAllAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (speechTimerRef.current) {
      clearInterval(speechTimerRef.current);
      speechTimerRef.current = null;
    }
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    setCurrentTime(0);
    setIsPlaying(false);
  };

  const handlePlayVoice = async (langToPlay = selectedLang) => {
    // If clicking same language while currently playing, stop & pause
    if (isPlaying && langToPlay.code === selectedLang.code) {
      stopAllAudio();
      return;
    }

    stopAllAudio();
    setLoading(true);
    setTranslatedText(''); // Clear previous language text
    userHasPickedLang.current = true;
    setSelectedLang(langToPlay);
    setDropdownOpen(false);

    const apiBase = resolveApiBase(backendUrl);

    try {
      const response = await fetch(`${apiBase}/api/voice/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text,
          language: langToPlay.code,
          slow: speed < 1.0,
          source_lang: 'en'
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const fullUrl = `${apiBase}${data.audio_url}?t=${Date.now()}`;
        setAudioUrl(fullUrl);
        const newText = data.translated_text || text;
        setTranslatedText(newText);
        
        if (audioRef.current) {
          audioRef.current.src = fullUrl;
          audioRef.current.playbackRate = speed;
          audioRef.current.load();
          try {
            await audioRef.current.play();
            setIsPlaying(true);
          } catch (pErr) {
            console.warn('Audio element play error, attempting speech synthesis fallback:', pErr);
            setIsPlaying(false);
          } finally {
            setLoading(false);
          }
          return;
        }
      } else {
        const errData = await response.json().catch(() => ({}));
        console.error('Voice synth backend error:', errData);
      }
    } catch (err) {
      console.warn('Backend voice synth failed, using browser voice fallback:', err);
    }

    // Fallback: Robust Mobile-Safe Web Speech Synthesis with Chunk Queue & Heartbeat
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      let textToSpeak = translatedText || text;

      if (langToPlay.code !== 'en' && (textToSpeak === text || !translatedText)) {
        try {
          const gtxUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${langToPlay.code}&dt=t&q=${encodeURIComponent(text)}`;
          const res = await fetch(gtxUrl);
          if (res.ok) {
            const data = await res.json();
            const parts = data[0]?.map(p => p[0]).filter(Boolean);
            if (parts && parts.length > 0) {
              textToSpeak = parts.join('');
              setTranslatedText(textToSpeak);
            }
          }
        } catch (e) {
          console.warn('Browser fallback translation failed:', e);
        }
      }

      const chunks = chunkTextForSpeech(textToSpeak);
      if (chunks.length === 0) {
        setLoading(false);
        return;
      }

      const wordCount = textToSpeak.split(/\s+/).length;
      const estimatedDuration = Math.max(3, Math.ceil(wordCount / (2.2 * speed)));
      setDuration(estimatedDuration);
      setCurrentTime(0);

      const voices = window.speechSynthesis.getVoices();
      const cleanCode = langToPlay.code.toLowerCase();
      const cleanName = langToPlay.name.toLowerCase();

      const matchingVoice = voices.find(v => 
        v.lang.toLowerCase().startsWith(cleanCode) || 
        v.name.toLowerCase().includes(cleanName)
      );

      let chunkIndex = 0;

      const speakNextChunk = () => {
        if (chunkIndex >= chunks.length) {
          stopAllAudio();
          return;
        }

        const currentChunkText = chunks[chunkIndex];
        const utterance = new SpeechSynthesisUtterance(currentChunkText);
        utterance.lang = langToPlay.code === 'hi' ? 'hi-IN' : langToPlay.code === 'en' ? 'en-IN' : langToPlay.code;
        utterance.rate = speed;
        if (matchingVoice) utterance.voice = matchingVoice;

        utterance.onend = () => {
          chunkIndex++;
          if (chunkIndex < chunks.length) {
            speakNextChunk();
          } else {
            stopAllAudio();
          }
        };

        utterance.onerror = (e) => {
          console.warn('Utterance speech error:', e);
          chunkIndex++;
          if (chunkIndex < chunks.length) {
            speakNextChunk();
          } else {
            stopAllAudio();
          }
        };

        window.speechSynthesis.speak(utterance);
      };

      // Timer update
      if (speechTimerRef.current) clearInterval(speechTimerRef.current);
      const startTime = Date.now();
      speechTimerRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        if (elapsed >= estimatedDuration) {
          setCurrentTime(estimatedDuration);
        } else {
          setCurrentTime(elapsed);
        }
      }, 250);

      // Heartbeat keep-alive timer for iOS Safari / Chrome idle timeouts
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = setInterval(() => {
        if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }
      }, 5000);

      speakNextChunk();
      setIsPlaying(true);
      setLoading(false);
    }
  };

  const handleAudioTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      if (audioRef.current.duration && !isNaN(audioRef.current.duration) && isFinite(audioRef.current.duration)) {
        setDuration(audioRef.current.duration);
      }
    }
  };

  const handleAudioLoadedMetadata = () => {
    if (audioRef.current && audioRef.current.duration && !isNaN(audioRef.current.duration) && isFinite(audioRef.current.duration)) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (e) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  const handleSpeedChange = (newSpeed) => {
    setSpeed(newSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = newSpeed;
    }
  };

  const renderPlayerContent = () => {
    return (
      <div className="voice-bulletin-card" style={{
        backdropFilter: 'blur(16px)',
        borderRadius: '14px',
        padding: '14px 18px',
        position: 'relative',
        zIndex: dropdownOpen ? 99999 : 1
      }}>
        
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            
            <button
              onClick={() => handlePlayVoice(selectedLang)}
              disabled={loading}
              title={isPlaying ? "Pause voice bulletin" : `Listen bulletin in ${selectedLang.name}`}
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                border: 'none',
                background: isPlaying 
                  ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' 
                  : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: isPlaying 
                  ? '0 0 16px rgba(239, 68, 68, 0.5)' 
                  : '0 4px 16px rgba(99, 102, 241, 0.4)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                flexShrink: 0
              }}
            >
              {loading ? (
                <div style={{
                  width: '16px',
                  height: '16px',
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTop: '2px solid #ffffff',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite'
                }} />
              ) : isPlaying ? (
                <span style={{ fontSize: '1.1rem' }}>⏸</span>
              ) : (
                <span style={{ fontSize: '1.1rem', marginLeft: '2px' }}>▶</span>
              )}
            </button>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontWeight: 700, fontSize: '0.94rem', color: '#f8fafc' }}>
                  🔊 Listen Bulletin
                </span>
                {isPlaying && (
                  <span style={{
                    fontSize: '0.68rem',
                    background: 'rgba(16, 185, 129, 0.2)',
                    color: '#10b981',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontWeight: 700,
                    border: '1px solid rgba(16, 185, 129, 0.3)'
                  }}>
                    PLAYING
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                Voice synthesis powered by Indic AI Engine
              </div>
            </div>

          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', position: 'relative' }} ref={dropdownRef}>
            
            <button
              type="button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '24px',
                background: dropdownOpen ? 'rgba(99, 102, 241, 0.35)' : 'rgba(255, 255, 255, 0.08)',
                border: dropdownOpen ? '1.5px solid #818cf8' : '1px solid rgba(255, 255, 255, 0.18)',
                color: '#f1f5f9',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
              }}
            >
              <span>{selectedLang.flag}</span>
              <span>{selectedLang.name} ({selectedLang.native})</span>
              <span style={{ fontSize: '0.72rem', color: '#818cf8', fontWeight: 700 }}>▼ Select Language</span>
            </button>

            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              background: 'rgba(255, 255, 255, 0.06)',
              padding: '3px',
              borderRadius: '20px',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              {[0.75, 1.0, 1.25].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSpeedChange(s)}
                  style={{
                    padding: '3px 8px',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    borderRadius: '16px',
                    border: 'none',
                    background: speed === s ? '#6366f1' : 'transparent',
                    color: speed === s ? '#ffffff' : '#94a3b8',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {s}x
                </button>
              ))}
            </div>

            {dropdownOpen && (
              <div 
                className="voice-bulletin-dropdown"
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '6px',
                  width: '300px',
                  maxHeight: '280px',
                  background: 'rgba(15, 23, 42, 0.98)',
                  backdropFilter: 'blur(20px)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '12px',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
                  padding: '12px',
                  zIndex: 9999999,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="text"
                  placeholder="Search 22 official languages..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '0.8rem',
                    outline: 'none'
                  }}
                />

                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {filteredLanguages.map((lang) => {
                    const isLangSelected = selectedLang.code === lang.code;
                    return (
                      <button
                        key={lang.code}
                        type="button"
                        onClick={() => {
                          handlePlayVoice(lang);
                          setDropdownOpen(false);
                        }}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          border: 'none',
                          background: isLangSelected ? 'rgba(99, 102, 241, 0.25)' : 'transparent',
                          color: isLangSelected ? '#818cf8' : '#e2e8f0',
                          fontSize: '0.8rem',
                          textAlign: 'left',
                          cursor: 'pointer',
                          fontWeight: isLangSelected ? 700 : 500,
                          transition: 'all 0.1s ease'
                        }}
                      >
                        <span style={{ fontSize: '1rem' }}>{lang.flag}</span>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <div>{lang.name} ({lang.native})</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {(translatedText || text) && (
          <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.12)' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '0.92rem',
              fontWeight: 700,
              color: '#ffffff',
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.35) 0%, rgba(139, 92, 246, 0.3) 100%)',
              padding: '12px 16px',
              borderRadius: '10px',
              borderLeft: '4px solid #818cf8',
              border: '1px solid rgba(129, 140, 248, 0.45)',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
              lineHeight: '1.6',
              letterSpacing: '0.01em'
            }}>
              {isPlaying && (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '16px', flexShrink: 0 }}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      style={{
                        width: '3px',
                        height: `${Math.floor(Math.random() * 12) + 4}px`,
                        background: '#818cf8',
                        borderRadius: '2px',
                        transition: 'height 0.15s ease'
                      }}
                    />
                  ))}
                </div>
              )}
              <div style={{ overflowWrap: 'break-word', wordBreak: 'break-word', whiteSpace: 'normal', color: '#ffffff' }}>
                📖 <strong style={{ color: '#ffffff' }}>Spoken Speech ({selectedLang.native || selectedLang.name}):</strong> <span style={{ fontWeight: 800, color: '#ffffff' }}>"{translatedText || text}"</span>
              </div>
            </div>
          </div>
        )}

      </div>
    );
  };

  return (
    <div className="voice-player-wrapper" style={{ display: 'inline-block', position: 'relative' }}>
      <audio
        ref={audioRef}
        onTimeUpdate={handleAudioTimeUpdate}
        onLoadedMetadata={handleAudioLoadedMetadata}
        onDurationChange={handleAudioLoadedMetadata}
        onCanPlay={handleAudioLoadedMetadata}
        onPlay={() => setIsPlaying(true)}
        onPause={() => {
          if (audioRef.current && !audioRef.current.seeking) {
            setIsPlaying(false);
          }
        }}
        onError={() => stopAllAudio()}
        onEnded={stopAllAudio}
      />

      {compact ? (
        <>
          <button
            onClick={() => setShowPlayerModal(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '20px',
              background: isPlaying ? 'rgba(239, 68, 68, 0.15)' : 'rgba(99, 102, 241, 0.12)',
              border: isPlaying ? '1.5px solid rgba(239, 68, 68, 0.45)' : '1px solid rgba(99, 102, 241, 0.35)',
              color: isPlaying ? '#ff4d4d' : '#818cf8',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = isPlaying ? 'rgba(239, 68, 68, 0.25)' : 'rgba(99, 102, 241, 0.22)';
              e.currentTarget.style.transform = 'scale(1.02)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = isPlaying ? 'rgba(239, 68, 68, 0.15)' : 'rgba(99, 102, 241, 0.12)';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            <span>{isPlaying ? '⏸ Playing' : '▶️ Listen Bulletin'}</span>
          </button>

          {showPlayerModal && createPortal(
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(15, 23, 42, 0.55)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 999999,
              padding: '20px'
            }} onClick={() => {
              setShowPlayerModal(false);
              setDropdownOpen(false);
            }}>
              <div style={{
                width: '100%',
                maxWidth: '600px',
                background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.96) 100%)',
                borderRadius: '18px',
                border: '1.5px solid rgba(255, 255, 255, 0.18)',
                padding: '20px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.65)',
                position: 'relative'
              }} onClick={(e) => e.stopPropagation()}>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px' }}>
                  <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    🔊 Indic AI Voice Bulletin Player
                  </h4>
                  <button 
                    onClick={() => {
                      setShowPlayerModal(false);
                      setDropdownOpen(false);
                    }}
                    style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.4rem', cursor: 'pointer' }}
                  >
                    &times;
                  </button>
                </div>

                {renderPlayerContent()}

              </div>
            </div>,
            document.body
          )}
        </>
      ) : (
        renderPlayerContent()
      )}
    </div>
  );
};

export default VoiceBulletinPlayer;


