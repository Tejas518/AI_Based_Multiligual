import React, { useEffect, useRef, useState, useCallback } from 'react';
import GlassCard from '../components/GlassCard';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const SentimentMap = ({ user, backendUrl, headers, setActiveTab, setAutofillPosterData, initialVoiceAlert, clearInitialVoiceAlert }) => {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersGroupRef = useRef(null);
  const tileLayerRef = useRef(null);

  const [mapData, setMapData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState({
    total: 0,
    critical: 0,
    urgent: 0,
    normal: 0,
  });

  const [selectedStateForBroadcast, setSelectedStateForBroadcast] = useState('');
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [broadcastState, setBroadcastState] = useState('');
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastDescription, setBroadcastDescription] = useState('');
  const [broadcastUrgency, setBroadcastUrgency] = useState('critical');
  const [broadcastChannels, setBroadcastChannels] = useState(['email', 'push']);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [submittingBroadcast, setSubmittingBroadcast] = useState(false);
  const [broadcastSuccess, setBroadcastSuccess] = useState('');
  const [broadcastError, setBroadcastError] = useState('');

  const indianStates = [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Delhi", "Goa", "Gujarat", 
    "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", 
    "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", 
    "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Jammu and Kashmir", "Ladakh", "New Delhi"
  ];

  // Auto-open or auto-broadcast emergency modal when initiated via Jarvis AI Voice Command
  useEffect(() => {
    if (initialVoiceAlert) {
      const targetState = initialVoiceAlert.state || 'Uttar Pradesh';
      const targetTitle = initialVoiceAlert.title || 'Emergency Alert';
      let targetDesc = initialVoiceAlert.description || initialVoiceAlert.body || `Emergency alert issued for ${initialVoiceAlert.recipients || 'citizens'}.`;
      const targetUrgency = initialVoiceAlert.urgency || 'critical';
      const targetChannels = (initialVoiceAlert.channels && initialVoiceAlert.channels.length > 0) ? initialVoiceAlert.channels : ['email', 'push'];

      // If description is short or copied from title, fallback to rich emergency advisory text immediately
      if (!targetDesc || targetDesc.length < 80 || targetDesc === targetTitle) {
        targetDesc = `🚨 EMERGENCY ADVISORY: A critical alert has been issued for citizens in ${targetState}. Move to higher ground NOW. Avoid traveling to low-lying areas, rivers, and streams. Keep phone charged and follow evacuation routes instructed by local authorities. Contact {{phone_number}} for emergency assistance. This is an official public notice.`;
      }

      setBroadcastState(targetState);
      setBroadcastTitle(targetTitle);
      setBroadcastDescription(targetDesc);
      setBroadcastUrgency(targetUrgency);
      setBroadcastChannels(targetChannels);
      setBroadcastSuccess('');
      setBroadcastError('');
      setShowBroadcastModal(true);

      // Fetch full Groq AI generated description via API key asynchronously
      fetch(`${backendUrl}/api/ai/generate`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: targetTitle, category: 'emergency', channel: 'email', tone: 'urgent' })
      }).then(res => res.ok ? res.json() : null).then(data => {
        if (data && data.body) {
          setBroadcastDescription(data.body);
        }
      }).catch(() => {});

      // If manager verbally confirmed ("yes send it"), immediately trigger the direct broadcast dispatch!
      if (initialVoiceAlert.user_confirmed) {
        handleDirectVoiceBroadcast({
          state: targetState,
          title: targetTitle,
          description: targetDesc,
          channels: targetChannels,
          urgency: targetUrgency
        });
      }

      if (clearInitialVoiceAlert) clearInitialVoiceAlert();
    }
  }, [initialVoiceAlert, clearInitialVoiceAlert]);

  const handleDirectVoiceBroadcast = async (alertPayload) => {
    setSubmittingBroadcast(true);
    setBroadcastSuccess('');
    setBroadcastError('');

    try {
      const res = await fetch(`${backendUrl}/api/sentiment-map/broadcast-emergency`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(alertPayload)
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to broadcast emergency alert');
      }

      setBroadcastSuccess(`🚀 Emergency alert successfully broadcasted to ${alertPayload.state}!`);
      setTimeout(() => {
        setShowBroadcastModal(false);
        setBroadcastSuccess('');
        setBroadcastTitle('');
        setBroadcastDescription('');
      }, 3500);
    } catch (err) {
      setBroadcastError(err.message);
    } finally {
      setSubmittingBroadcast(false);
    }
  };

  const handleOpenModalForState = useCallback((stateName) => {
    setBroadcastState(stateName);
    setBroadcastTitle('');
    setBroadcastDescription('');
    setBroadcastUrgency('critical');
    setBroadcastChannels(['email', 'push']);
    setBroadcastSuccess('');
    setBroadcastError('');
    setShowBroadcastModal(true);
  }, []);

  const handleGenerateDescriptionWithAI = async () => {
    if (!broadcastTitle.trim()) {
      setBroadcastError('Please enter an alert title first.');
      return;
    }
    setAiGenerating(true);
    setBroadcastError('');
    try {
      const res = await fetch(`${backendUrl}/api/ai/generate`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: broadcastTitle,
          category: 'emergency',
          channel: 'email',
          tone: 'urgent'
        })
      });
      if (!res.ok) throw new Error('AI generation failed');
      const data = await res.json();
      if (data.body) {
        setBroadcastDescription(data.body);
      } else if (data.error) {
        setBroadcastError(data.error);
      }
    } catch (err) {
      setBroadcastError('Failed to generate description with AI. Please write manually.');
    } finally {
      setAiGenerating(false);
    }
  };

  const handleRedirectToPosterStudio = () => {
    setAutofillPosterData({
      title: broadcastTitle,
      description: broadcastDescription,
      category: 'emergency'
    });
    setActiveTab('poster_studio');
  };

  const handleBroadcastSubmit = async (e) => {
    e.preventDefault();
    if (!broadcastTitle.trim() || !broadcastDescription.trim()) return;

    setSubmittingBroadcast(true);
    setBroadcastSuccess('');
    setBroadcastError('');

    try {
      const res = await fetch(`${backendUrl}/api/sentiment-map/broadcast-emergency`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          state: broadcastState,
          title: broadcastTitle,
          description: broadcastDescription,
          channels: broadcastChannels,
          urgency: broadcastUrgency
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to broadcast emergency alert');
      }

      setBroadcastSuccess(`Emergency alert successfully broadcasted to ${broadcastState}!`);
      setTimeout(() => {
        setShowBroadcastModal(false);
        setBroadcastSuccess('');
        setBroadcastTitle('');
        setBroadcastDescription('');
      }, 3000);
    } catch (err) {
      setBroadcastError(err.message);
    } finally {
      setSubmittingBroadcast(false);
    }
  };

  const [theme, setTheme] = useState(document.documentElement.classList.contains('light-theme') ? 'light' : 'dark');

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const currentTheme = document.documentElement.classList.contains('light-theme') ? 'light' : 'dark';
      setTheme(currentTheme);
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch(`${backendUrl}/api/sentiment-map/data`, { headers });
      if (!response.ok) {
        throw new Error('Failed to load geographic sentiment map data');
      }
      const data = await response.json();
      setMapData(data);

      // Compute summary metrics
      let total = 0, critical = 0, urgent = 0, normal = 0;
      data.forEach(item => {
        total += item.total;
        critical += item.critical_count;
        urgent += item.urgent_count;
        normal += item.normal_count;
      });

      setSummary({ total, critical, urgent, normal });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [backendUrl, headers]);

  useEffect(() => {
    fetchData();
    const intervalId = setInterval(() => {
      fetchData();
    }, 10000);
    return () => clearInterval(intervalId);
  }, [fetchData]);

  // Map initialization and updates
  useEffect(() => {
    if (loading || error || !mapContainerRef.current) return;

    // Initialize Leaflet map centered on India if not already initialized
    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [22.9734, 78.6569], // Central India coordinates
        zoom: 5,
        minZoom: 4,
        maxZoom: 8,
      });

      mapInstanceRef.current = map;
      markersGroupRef.current = L.layerGroup().addTo(map);
    }

    const map = mapInstanceRef.current;

    // Update tile layer based on current theme
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    const isLight = theme === 'light';
    const tileUrl = isLight 
      ? 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

    tileLayerRef.current = L.tileLayer(tileUrl, {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(map);

    // Clear existing markers
    if (markersGroupRef.current) {
      markersGroupRef.current.clearLayers();
    }

    // Add circle markers for states
    mapData.forEach((state) => {
      if (!state.lat || !state.lng) return;

      // Color mapping: Red (critical), Amber (concerning/urgent), Green (stable)
      let color = 'hsl(142, 72%, 45%)'; // Stable Green
      if (state.sentiment === 'critical') {
        color = 'hsl(0, 84%, 60%)'; // Critical Red
      } else if (state.sentiment === 'concerning') {
        color = 'hsl(38, 92%, 50%)'; // Concerning Amber
      }

      // Radius scaled exponentially between 8 and 30
      const radius = Math.min(30, Math.max(8, 8 + Math.log2(state.total) * 4));

      const circle = L.circleMarker([state.lat, state.lng], {
        radius,
        fillColor: color,
        color: isLight ? '#fff' : '#000',
        weight: 1.5,
        opacity: 0.8,
        fillOpacity: 0.6,
      });

      // Construct popup HTML using theme variables
      const popupHtml = `
        <div style="font-family: var(--font-body), sans-serif; color: hsl(var(--text-primary)); padding: 4px; line-height: 1.4;">
          <h4 style="margin: 0 0 6px; font-size: 0.95rem; font-weight: 700; color: ${color}; border-bottom: 1px solid var(--border-color-glass); padding-bottom: 4px;">
            ${state.state}
          </h4>
          <div style="font-size: 0.8rem; margin-bottom: 8px;">
            <div><strong>Total Alerts:</strong> ${state.total}</div>
            <div style="color: hsl(0, 84%, 60%);">🚨 Critical: ${state.critical_count}</div>
            <div style="color: hsl(38, 92%, 55%);">⚠️ Urgent: ${state.urgent_count}</div>
            <div style="color: hsl(142, 72%, 50%);">✓ Normal: ${state.normal_count}</div>
          </div>
          <div style="font-size: 0.72rem; opacity: 0.8;">
            <strong>Recent Issues:</strong>
            <ul style="margin: 4px 0 0; padding-left: 14px; list-style-type: circle;">
              ${state.recent_subjects.map(sub => `<li style="margin-bottom: 2px;">${sub}</li>`).join('')}
            </ul>
          </div>
          <button
            class="popup-broadcast-btn"
            data-state="${state.state}"
            style="
              margin-top: 10px;
              width: 100%;
              padding: 7px 10px;
              border: 1.5px solid rgba(239, 68, 68, 0.5);
              border-radius: 8px;
              background: rgba(239, 68, 68, 0.12);
              color: hsl(0, 84%, 65%);
              font-weight: 700;
              font-size: 0.72rem;
              cursor: pointer;
              letter-spacing: 0.02em;
              transition: background 0.2s;
            "
          >🚨 Launch State Emergency Alert</button>
        </div>
      `;

      circle.bindPopup(popupHtml, {
        className: 'glass-leaflet-popup',
        closeButton: false,
        maxWidth: 260,
      });

      circle.on('mouseover', function (e) {
        this.openPopup();
      });

      circle.on('popupopen', function () {
        const popup = this.getPopup();
        const container = popup.getElement();
        if (container) {
          const btn = container.querySelector('.popup-broadcast-btn');
          if (btn) {
            btn.onclick = () => {
              handleOpenModalForState(btn.getAttribute('data-state'));
              this.closePopup();
            };
          }
        }
      });

      markersGroupRef.current.addLayer(circle);
    });

  }, [mapData, loading, error, theme, handleOpenModalForState]);

  // Inject Leaflet popup customized styles into the head
  useEffect(() => {
    const styleId = 'leaflet-popup-override-style';
    let style = document.getElementById(styleId);
    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      style.innerHTML = `
        .glass-leaflet-popup .leaflet-popup-content-wrapper {
          background: rgba(13, 16, 28, 0.94) !important;
          backdrop-filter: blur(12px) !important;
          border: 1px solid rgba(255,255,255,0.12) !important;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5) !important;
          border-radius: 12px !important;
        }
        .glass-leaflet-popup .leaflet-popup-tip {
          background: rgba(13, 16, 28, 0.94) !important;
          border-left: 1px solid rgba(255,255,255,0.06) !important;
          border-bottom: 1px solid rgba(255,255,255,0.06) !important;
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  if (loading) {
    return <div style={{ color: 'hsl(var(--text-secondary))', textAlign: 'center', padding: '40px', fontWeight: 600 }}>Assembling Geographic Sentiment Maps...</div>;
  }

  if (error) {
    return <div className="danger-text" style={{ padding: '16px', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.05)' }}>Error loading maps: {error}</div>;
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 1.2fr', gap: '24px', height: '620px' }}>
        
        {/* Map View Card */}
        <GlassCard style={{ padding: '16px', position: 'relative', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', padding: '0 8px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'hsl(var(--text-primary))' }}>India Real-time Emergency Clusters</h3>
            <span style={{ fontSize: '0.75rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', padding: '3px 10px', borderRadius: '12px', fontWeight: '600' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981', display: 'inline-block', boxShadow: '0 0 8px #10b981' }}></span>
              ⚡ Live Geo-Sync Active (10s)
            </span>
          </div>

          <div
            ref={mapContainerRef}
            style={{
              flex: 1,
              width: '100%',
              borderRadius: '12px',
              overflow: 'hidden',
              border: '1px solid var(--border-color-glass)',
              background: 'transparent'
            }}
          ></div>
        </GlassCard>

        {/* Stats and Urgency Breakdown Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto' }}>
          
          {/* Quick Broadcast Dropdown */}
          <GlassCard style={{ padding: '20px' }}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: '700', marginBottom: '12px', color: 'hsl(var(--danger))' }}>
              🚨 Quick State Broadcast
            </h4>
            <p style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', marginBottom: '12px', lineHeight: 1.4 }}>
              Select a state and directly broadcast an emergency alert to all citizens in that region.
            </p>
            <select
              className="form-control"
              value={selectedStateForBroadcast}
              onChange={(e) => setSelectedStateForBroadcast(e.target.value)}
              style={{ width: '100%', marginBottom: '10px', fontSize: '0.85rem' }}
            >
              <option value="">— Select a State —</option>
              {indianStates.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button
              className="btn btn-primary"
              disabled={!selectedStateForBroadcast}
              onClick={() => handleOpenModalForState(selectedStateForBroadcast)}
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '0.85rem',
                fontWeight: '700',
                background: selectedStateForBroadcast ? 'hsl(var(--danger))' : 'rgba(239,68,68,0.2)',
                borderColor: selectedStateForBroadcast ? 'hsl(var(--danger))' : 'transparent',
                cursor: selectedStateForBroadcast ? 'pointer' : 'not-allowed',
                opacity: selectedStateForBroadcast ? 1 : 0.5,
              }}
            >
              🚨 Broadcast Alert to State
            </button>
          </GlassCard>

          <GlassCard style={{ padding: '20px' }}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: '700', marginBottom: '16px', color: 'hsl(var(--primary))' }}>
              Platform Sentiment Summary
            </h4>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: '8px', background: 'var(--border-color-glass)' }}>
                <span style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))' }}>Active Alarms</span>
                <span style={{ fontSize: '1.1rem', fontWeight: '700', color: 'hsl(var(--text-primary))' }}>{summary.total}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
                <span style={{ fontSize: '0.8rem', color: 'hsl(var(--danger))', fontWeight: '600' }}>🚨 Critical Cases</span>
                <span style={{ fontSize: '1.1rem', fontWeight: '700', color: 'hsl(var(--danger))' }}>{summary.critical}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245,158,11,0.15)' }}>
                <span style={{ fontSize: '0.8rem', color: 'hsl(38, 92%, 55%)', fontWeight: '600' }}>⚠️ Urgent Issues</span>
                <span style={{ fontSize: '1.1rem', fontWeight: '700', color: 'hsl(38, 92%, 55%)' }}>{summary.urgent}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16,185,129,0.15)' }}>
                <span style={{ fontSize: '0.8rem', color: 'hsl(142, 72%, 50%)', fontWeight: '600' }}>✓ Normal Status</span>
                <span style={{ fontSize: '1.1rem', fontWeight: '700', color: 'hsl(142, 72%, 50%)' }}>{summary.normal}</span>
              </div>
            </div>
          </GlassCard>

          <GlassCard style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: '700', marginBottom: '12px', color: 'hsl(var(--text-primary))' }}>
              Incident Metrics by State
            </h4>
            
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
              {mapData.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'hsl(var(--text-muted))', padding: '20px', fontSize: '0.8rem' }}>
                  No emergency locations registered.
                </div>
              ) : (
                mapData.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => handleOpenModalForState(item.state)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      background: 'var(--border-color-glass)',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      transition: 'background 0.15s',
                      borderLeft: `3px solid ${
                        item.sentiment === 'critical'
                          ? 'hsl(0, 84%, 60%)'
                          : item.sentiment === 'concerning'
                          ? 'hsl(38, 92%, 50%)'
                          : 'hsl(142, 72%, 45%)'
                      }`
                    }}
                  >
                    <span style={{ fontWeight: '600' }}>{item.state}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700' }}>
                      {item.total}
                      {item.critical_count > 0 && <span style={{ color: 'hsl(var(--danger))', fontSize: '0.72rem' }}>({item.critical_count}🚨)</span>}
                    </span>
                  </div>
                ))
              )}
            </div>
          </GlassCard>

        </div>
      </div>

      {/* Emergency Broadcast Modal */}
      {showBroadcastModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <GlassCard style={{ padding: '32px', width: '100%', maxWidth: '560px', position: 'relative' }}>
            <button 
              onClick={() => setShowBroadcastModal(false)}
              style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                background: 'none',
                border: 'none',
                color: 'hsl(var(--text-muted))',
                fontSize: '1.4rem',
                cursor: 'pointer',
                fontWeight: '600'
              }}
            >
              &times;
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
              <div style={{ 
                background: 'rgba(239, 68, 68, 0.12)', 
                borderRadius: '10px', 
                width: '40px', 
                height: '40px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                fontSize: '1.2rem'
              }}>🚨</div>
              <div>
                <h3 style={{ margin: 0, fontWeight: 800, color: 'hsl(var(--danger))', fontSize: '1.1rem' }}>Broadcast Emergency Alert</h3>
                <p style={{ margin: 0, color: 'hsl(var(--text-muted))', fontSize: '0.78rem' }}>Target: <strong style={{ color: 'hsl(var(--text-primary))' }}>{broadcastState}</strong></p>
              </div>
            </div>
            <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.82rem', marginBottom: '20px', lineHeight: 1.4 }}>
              This alert will be broadcast to all registered citizens in <strong>{broadcastState}</strong> via selected channels and appear as a real-time notification on their dashboards.
            </p>

            {broadcastSuccess ? (
              <div style={{
                padding: '18px',
                background: 'rgba(34, 197, 94, 0.08)',
                border: '1px solid rgba(34, 197, 94, 0.2)',
                borderRadius: '10px',
                color: 'hsl(var(--accent))',
                fontSize: '0.92rem',
                textAlign: 'center',
                fontWeight: '600'
              }}>
                ✓ {broadcastSuccess}
              </div>
            ) : (
              <form onSubmit={handleBroadcastSubmit}>
                <div className="form-group" style={{ marginBottom: '14px' }}>
                  <label className="form-label" style={{ fontWeight: '600', fontSize: '0.85rem' }}>Alert Title / Subject</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Flash Flood Warning in Pune District"
                    value={broadcastTitle}
                    onChange={e => setBroadcastTitle(e.target.value)}
                    required
                    style={{ width: '100%' }}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label className="form-label" style={{ fontWeight: '600', fontSize: '0.85rem', margin: 0 }}>Alert Description</label>
                    <button
                      type="button"
                      onClick={handleGenerateDescriptionWithAI}
                      disabled={aiGenerating || !broadcastTitle.trim()}
                      style={{
                        padding: '4px 12px',
                        borderRadius: '6px',
                        border: '1px solid hsl(var(--primary) / 40%)',
                        background: 'hsl(var(--primary) / 8%)',
                        color: 'hsl(var(--primary))',
                        fontWeight: '700',
                        fontSize: '0.72rem',
                        cursor: aiGenerating || !broadcastTitle.trim() ? 'not-allowed' : 'pointer',
                        opacity: aiGenerating || !broadcastTitle.trim() ? 0.5 : 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}
                    >
                      {aiGenerating ? (
                        <>
                          <span className="spinner-dot" style={{ width: '10px', height: '10px', borderRadius: '50%', border: '2px solid hsl(var(--primary))', borderTopColor: 'transparent', display: 'inline-block', animation: 'spin 0.8s linear infinite' }}></span>
                          Generating...
                        </>
                      ) : '✨ Generate with AI'}
                    </button>
                  </div>
                  <textarea
                    className="form-control"
                    placeholder="Detailed emergency alert message for citizens..."
                    value={broadcastDescription}
                    onChange={e => setBroadcastDescription(e.target.value)}
                    required
                    rows={4}
                    style={{ width: '100%', resize: 'none' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: '600', fontSize: '0.85rem' }}>Urgency Level</label>
                    <select
                      className="form-control"
                      value={broadcastUrgency}
                      onChange={e => setBroadcastUrgency(e.target.value)}
                      style={{ width: '100%' }}
                    >
                      <option value="critical">🚨 Critical</option>
                      <option value="urgent">⚠️ Urgent</option>
                      <option value="normal">✓ Normal</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: '600', fontSize: '0.85rem' }}>Channels</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                      {['email', 'voice', 'sms', 'push', 'telegram'].map(ch => (
                        <label key={ch} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', cursor: 'pointer', color: 'hsl(var(--text-secondary))' }}>
                          <input
                            type="checkbox"
                            checked={broadcastChannels.includes(ch)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setBroadcastChannels(prev => [...prev, ch]);
                              } else {
                                setBroadcastChannels(prev => prev.filter(c => c !== ch));
                              }
                            }}
                            style={{ accentColor: 'hsl(var(--primary))' }}
                          />
                          {ch === 'email' ? '📧 Email' : ch === 'voice' ? '📞 Call' : ch === 'sms' ? '📱 SMS' : ch === 'push' ? '🚀 Push' : '📢 Telegram'}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                {broadcastError && (
                  <div style={{
                    padding: '10px 14px',
                    background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    borderRadius: '8px',
                    color: 'hsl(var(--danger))',
                    fontSize: '0.82rem',
                    marginBottom: '14px',
                    fontWeight: '500'
                  }}>
                    {broadcastError}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button 
                    type="submit" 
                    className="btn btn-primary" 
                    disabled={submittingBroadcast || !broadcastTitle.trim() || !broadcastDescription.trim()}
                    style={{ 
                      flex: 1, 
                      padding: '12px', 
                      background: 'hsl(var(--danger))', 
                      borderColor: 'hsl(var(--danger))', 
                      fontWeight: '700',
                      fontSize: '0.9rem'
                    }}
                  >
                    {submittingBroadcast ? 'Broadcasting Alert...' : '🚨 Broadcast Now'}
                  </button>
                  <button
                    type="button"
                    onClick={handleRedirectToPosterStudio}
                    disabled={!broadcastTitle.trim()}
                    className="btn"
                    style={{
                      padding: '12px 16px',
                      background: 'hsl(var(--primary) / 10%)',
                      border: '1px solid hsl(var(--primary) / 30%)',
                      color: 'hsl(var(--primary))',
                      fontWeight: '700',
                      fontSize: '0.82rem',
                      borderRadius: '8px',
                      cursor: !broadcastTitle.trim() ? 'not-allowed' : 'pointer',
                      opacity: !broadcastTitle.trim() ? 0.5 : 1,
                    }}
                    title="Open Poster Studio with these alert details pre-filled"
                  >
                    🎨 Create Poster
                  </button>
                </div>
              </form>
            )}
          </GlassCard>
        </div>
      )}
    </div>
  );
};

export default SentimentMap;
