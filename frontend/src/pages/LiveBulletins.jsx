import React, { useEffect, useState, useRef, useCallback } from 'react';
import GlassCard from '../components/GlassCard';
import VoiceBulletinPlayer from '../components/VoiceBulletinPlayer';

const LiveBulletins = ({ backendUrl, user, token }) => {
  const interpolateText = (text) => {
    if (!text || !user) return text || '';
    const replacements = {
      first_name: user.first_name || user.full_name?.split(' ')[0] || '',
      last_name: user.last_name || user.full_name?.slice(user.full_name?.indexOf(' ') + 1) || '',
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
  };

  const [bulletins, setBulletins] = useState([]);
  const [status, setStatus] = useState('connecting');
  const [filterUrgency, setFilterUrgency] = useState('all');
  const [soundEnabled, setSoundEnabled] = useState(false); // start disabled to force user interaction
  const [loading, setLoading] = useState(true);
  
  const wsRef = useRef(null);
  const audioCtxRef = useRef(null);

  const toggleSound = () => {
    if (!soundEnabled) {
      if (!audioCtxRef.current) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          audioCtxRef.current = new AudioContext();
        }
      }
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
    }
    setSoundEnabled(!soundEnabled);
  };

  const fetchHistoricalBulletins = useCallback(async () => {
    setLoading(true);
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      
      const postersRes = await fetch(`${backendUrl}/api/poster/available`, { headers });
      let postersData = [];
      if (postersRes.ok) {
        postersData = await postersRes.json();
      }
      
      const contactsRes = await fetch(`${backendUrl}/api/emergency-contact`, { headers });
      let contactsData = [];
      if (contactsRes.ok) {
        contactsData = await contactsRes.json();
      }

      const campaignsRes = await fetch(`${backendUrl}/api/campaigns/active-bulletins`, { headers });
      let campaignsData = [];
      if (campaignsRes.ok) {
        campaignsData = await campaignsRes.json();
      }
      
      const formattedPosters = postersData.map(p => ({
        id: p.id,
        type: 'campaign_alert',
        title: p.category === 'emergency' ? `🚨 EMERGENCY: ${p.title}` : p.title,
        message: p.description,
        urgency: p.category === 'emergency' ? 'critical' : 'normal',
        created_at: p.created_at
      }));
      
      const formattedContacts = contactsData.map(c => ({
        id: c.id,
        type: 'emergency_contact',
        title: `🆘 Urgent Support Request: ${c.subject}`,
        message: c.message,
        urgency: c.urgency || 'normal',
        created_at: c.created_at
      }));

      const formattedCampaigns = campaignsData.map(c => ({
        id: c.id,
        type: 'campaign_broadcast',
        title: c.campaign_type === 'emergency_alert' || c.urgency === 'critical' ? `🚨 ${c.title}` : c.title,
        message: c.custom_body || c.description || c.title,
        urgency: c.campaign_type === 'emergency_alert' ? 'critical' : (c.urgency || 'normal'),
        created_at: c.created_at || c.dispatched_at || new Date().toISOString()
      }));
      
      const combined = [...formattedCampaigns, ...formattedPosters, ...formattedContacts];
      combined.sort((a, b) => {
        const da = new Date(a.created_at);
        const db = new Date(b.created_at);
        const ta = isNaN(da.getTime()) ? 0 : da.getTime();
        const tb = isNaN(db.getTime()) ? 0 : db.getTime();
        return tb - ta;
      });
      
      setBulletins(combined);
    } catch (err) {
      console.error("Failed to fetch historical bulletins:", err);
    } finally {
      setLoading(false);
    }
  }, [backendUrl, token]);

  useEffect(() => {
    fetchHistoricalBulletins();
  }, [fetchHistoricalBulletins]);

  // Play a synthesized chime using Web Audio API (extremely reliable, zero assets needed!)
  const playChime = useCallback((urgency) => {
    if (!soundEnabled || !audioCtxRef.current) return;
    try {
      const ctx = audioCtxRef.current;
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      // Critical gets a double high-pitch alert, normal gets a pleasant chime
      if (urgency === 'critical') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc.start();
        osc.stop(ctx.currentTime + 0.45);
        
        // Second beep
        setTimeout(() => {
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.type = 'sawtooth';
          osc2.frequency.setValueAtTime(880, ctx.currentTime);
          gain2.gain.setValueAtTime(0.15, ctx.currentTime);
          gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
          osc2.start();
          osc2.stop(ctx.currentTime + 0.45);
        }, 150);
      } else {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
        osc.frequency.exponentialRampToValueAtTime(659.25, ctx.currentTime + 0.15); // E5
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.start();
        osc.stop(ctx.currentTime + 0.6);
      }
    } catch (e) {
      console.warn("Web Audio chime failed to execute:", e);
    }
  }, [soundEnabled]);

  useEffect(() => {
    // Resolve ws/wss protocol from backendUrl
    const rawUrl = backendUrl || 'http://localhost:8001';
    let wsUrl = rawUrl.replace(/^http/, 'ws') + '/ws/bulletins';
    if (token) {
      wsUrl += `?token=${encodeURIComponent(token)}`;
    }

    let active = true;

    const connectWebSocket = () => {
      if (!active) return;
      setStatus('connecting');
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (active) setStatus('connected');
      };

      ws.onmessage = (event) => {
        if (!active) return;
        try {
          const data = JSON.parse(event.data);
          
          // Play notification sound
          playChime(data.urgency || (data.campaign_type === 'emergency_alert' ? 'critical' : 'normal'));
          
          setBulletins((prev) => {
            if (data.id && prev.some(b => b.id === data.id)) return prev;
            return [
              {
                id: data.id || Math.random().toString(36).slice(2, 9),
                type: data.type || 'campaign_alert',
                title: data.title || data.subject || 'Broadcast Alert',
                message: data.message || data.description || '',
                urgency: data.urgency || (data.campaign_type === 'emergency_alert' ? 'critical' : 'normal'),
                created_at: data.created_at || new Date().toISOString()
              },
              ...prev
            ];
          });
        } catch (err) {
          console.error('Error parsing WS message:', err);
        }
      };

      ws.onclose = () => {
        if (active) {
          setStatus('disconnected');
          // Auto-reconnect after 4 seconds
          setTimeout(connectWebSocket, 4000);
        }
      };

      ws.onerror = () => {
        if (active) {
          setStatus('error');
          ws.close();
        }
      };
    };

    connectWebSocket();

    return () => {
      active = false;
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [backendUrl, token, playChime]);

  const filteredBulletins = bulletins.filter(b => {
    if (filterUrgency === 'all') return true;
    return b.urgency === filterUrgency;
  });

  return (
    <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto' }}>
      
      {/* Control Header */}
      <GlassCard style={{ padding: '16px 24px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <span style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: status === 'connected' ? 'hsl(142, 72%, 45%)' : status === 'connecting' ? 'hsl(38, 92%, 50%)' : 'hsl(0, 84%, 60%)',
              display: 'inline-block',
              animation: status === 'connecting' ? 'pulse 1.4s infinite' : 'none'
            }}></span>
            {status === 'connected' && (
              <span style={{
                position: 'absolute',
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                backgroundColor: 'hsl(142, 72%, 45%)',
                animation: 'ping 1.6s cubic-bezier(0, 0, 0.2, 1) infinite',
                opacity: 0.6
              }}></span>
            )}
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Web Broadcast Bulletins
            </h3>
            <span style={{ fontSize: '0.72rem', color: 'hsl(var(--text-muted))' }}>
              Status: <span style={{ fontWeight: '600', color: status === 'connected' ? 'hsl(142, 72%, 50%)' : 'inherit' }}>{status.toUpperCase()}</span>
            </span>
          </div>
        </div>

        {/* Filters and Sound Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          
          {/* Sound Toggle */}
          <button
            onClick={toggleSound}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1.5px solid rgba(255, 255, 255, 0.2)',
              background: soundEnabled ? 'rgba(99, 102, 241, 0.3)' : 'rgba(255, 255, 255, 0.06)',
              color: '#ffffff',
              fontSize: '0.82rem',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {soundEnabled ? '🔊 Sound On' : '🔇 Muted'}
          </button>

          {/* Urgency Filter Dropdown */}
          <select
            value={filterUrgency}
            onChange={(e) => setFilterUrgency(e.target.value)}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1.5px solid rgba(255, 255, 255, 0.25)',
              background: '#0f172a',
              color: '#ffffff',
              fontSize: '0.82rem',
              fontWeight: '700',
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            <option value="all" style={{ background: '#0f172a', color: '#ffffff', fontWeight: '700' }}>ALL BULLETINS</option>
            <option value="critical" style={{ background: '#0f172a', color: '#ff4d4d', fontWeight: '700' }}>CRITICAL ALERTS</option>
            <option value="urgent" style={{ background: '#0f172a', color: '#fbbf24', fontWeight: '700' }}>URGENT BULLETINS</option>
            <option value="normal" style={{ background: '#0f172a', color: '#60a5fa', fontWeight: '700' }}>NORMAL ANNOUNCEMENTS</option>
          </select>
        </div>
      </GlassCard>

      {/* Bulletins Feed */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {loading ? (
          <GlassCard style={{ padding: '40px', textAlign: 'center', color: 'hsl(var(--text-muted))' }}>
            <div style={{ display: 'inline-block', width: '24px', height: '24px', border: '3px solid rgba(255,255,255,0.1)', borderTop: '3px solid hsl(var(--primary))', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '12px' }}></div>
            <p style={{ fontSize: '0.85rem' }}>Loading active bulletins feed...</p>
          </GlassCard>
        ) : filteredBulletins.length === 0 ? (
          <GlassCard style={{ padding: '40px', textAlign: 'center', color: 'hsl(var(--text-muted))' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: '48px', height: '48px', margin: '0 auto 12px', opacity: 0.4 }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <p style={{ fontSize: '0.85rem' }}>
              Waiting for live bulletins... Inbound emergency contacts and dispatched alerts will appear here in real-time.
            </p>
          </GlassCard>
        ) : (
          filteredBulletins.map((b) => {
            const isCritical = b.urgency === 'critical';
            const isUrgent = b.urgency === 'urgent';
            
            let color = 'hsl(var(--primary))';
            let bgGlow = 'rgba(76, 140, 252, 0.03)';
            if (isCritical) {
              color = 'hsl(var(--danger))';
              bgGlow = 'rgba(239, 68, 68, 0.05)';
            } else if (isUrgent) {
              color = 'hsl(38, 92%, 50%)';
              bgGlow = 'rgba(245, 158, 11, 0.04)';
            }

            return (
              <GlassCard
                key={b.id}
                style={{
                  padding: '20px',
                  background: bgGlow,
                  borderLeft: `4px solid ${color}`,
                  animation: 'animate-slide-up 0.3s ease-out'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {isCritical && (
                      <span className="bulletin-pulse" style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: 'hsl(var(--danger))',
                        boxShadow: '0 0 8px hsl(var(--danger))',
                        animation: 'pulse 1s infinite'
                      }}></span>
                    )}
                    <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: isCritical ? 'hsl(var(--danger))' : 'hsl(var(--text-primary))' }}>
                      {interpolateText(b.title)}
                    </h4>
                  </div>
                  
                  <span style={{ fontSize: '0.72rem', color: 'hsl(var(--text-muted))', fontWeight: '600' }}>
                    {(() => {
                      const d = new Date(b.created_at);
                      return !isNaN(d.getTime()) ? d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }) : '';
                    })()}
                  </span>
                </div>

                <p style={{ margin: '0 0 12px', fontSize: '0.92rem', lineHeight: '1.6', color: '#ffffff', fontWeight: 600 }}>
                  {interpolateText(b.message)}
                </p>

                {/* Indic AI Voice Bulletin Player */}
                <VoiceBulletinPlayer
                  text={`${interpolateText(b.title)}. ${interpolateText(b.message)}`}
                  campaignId={b.id}
                  userPreferredLang={user?.preferred_languages?.[0] || 'Hindi'}
                  backendUrl={backendUrl}
                  compact={true}
                />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem' }}>
                  <span style={{
                    padding: '3px 8px',
                    borderRadius: '4px',
                    background: isCritical ? 'rgba(239, 68, 68, 0.12)' : isUrgent ? 'rgba(245, 158, 11, 0.12)' : 'rgba(76, 140, 252, 0.12)',
                    color,
                    fontWeight: '700',
                    textTransform: 'uppercase'
                  }}>
                    {b.urgency.toUpperCase()} ALERT
                  </span>
                  
                  <span style={{ color: 'hsl(var(--text-muted))' }}>
                    Origin: {b.type === 'emergency_contact' ? 'Citizen Direct Feed' : 'Operator Dispatch'}
                  </span>
                </div>
              </GlassCard>
            );
          })
        )}
      </div>
      
      {/* Audio style keyframes injected inline */}
      <style>{`
        @keyframes ping {
          75%, 100% {
            transform: scale(2.2);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
};

export default LiveBulletins;
