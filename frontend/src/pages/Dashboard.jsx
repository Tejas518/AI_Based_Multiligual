import React, { useEffect, useState, useCallback } from 'react';
import GlassCard from '../components/GlassCard';

const formatAlertDateTime = (timestamp) => {
  if (!timestamp) return '';
  // Earlier API responses stored UTC without an offset. Treat those values as
  // UTC so an emergency alert is never displayed in the server's local time.
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(timestamp);
  const date = new Date(hasTimezone ? timestamp : `${timestamp}Z`);
  if (Number.isNaN(date.getTime())) return '';
  return `${new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)} IST`;
};

const Dashboard = ({ user, setActiveTab, backendUrl, headers, token, bulletinCount }) => {
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

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [posters, setPosters] = useState([]);
  const [fullscreenPoster, setFullscreenPoster] = useState(null);
  const [newPosterNotification, setNewPosterNotification] = useState(null);
  const [alertTab, setAlertTab] = useState('emergency');
  const [liveCriticalAlerts, setLiveCriticalAlerts] = useState([]);

  // List modal drill-down state
  const [listModalType, setListModalType] = useState(null);
  const [modalItems, setModalItems] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);

  const fetchModalItems = async (type) => {
    setListModalType(type);
    setModalLoading(true);
    setModalItems([]);
    
    let endpoint = '';
    if (type === 'audiences') endpoint = '/api/audiences';
    else if (type === 'segments') endpoint = '/api/segments';
    else if (type === 'drafts') endpoint = '/api/campaigns';
    else if (type === 'templates') endpoint = '/api/templates';
    else if (type === 'delivered') endpoint = '/api/dashboard/delivery-logs?status=sent';
    else if (type === 'failed') endpoint = '/api/dashboard/delivery-logs?status=failed';

    try {
      const response = await fetch(`${backendUrl}${endpoint}`, { headers });
      if (response.ok) {
        let data = await response.json();
        if (type === 'drafts') {
          data = data.filter(c => c.status === 'draft');
        }
        setModalItems(data);
      }
    } catch (err) {
      console.error(`Failed to load items for modal:`, err);
    } finally {
      setModalLoading(false);
    }
  };

  // Emergency modal state
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [emergencySubject, setEmergencySubject] = useState('');
  const [emergencyMessage, setEmergencyMessage] = useState('');
  const [emergencyUrgency, setEmergencyUrgency] = useState('normal');
  const [emergencySubmitting, setEmergencySubmitting] = useState(false);
  const [emergencySuccess, setEmergencySuccess] = useState('');

  const handleEmergencySubmit = async (e) => {
    e.preventDefault();
    if (!emergencySubject.trim() || !emergencyMessage.trim()) return;

    setEmergencySubmitting(true);
    setEmergencySuccess('');
    try {
      const res = await fetch(`${backendUrl}/api/emergency-contact`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: emergencySubject,
          message: emergencyMessage,
          urgency: emergencyUrgency
        })
      });

      if (!res.ok) {
        throw new Error('Failed to submit emergency alert');
      }

      setEmergencySuccess('Your emergency alert has been sent to our operators in real time.');
      setEmergencySubject('');
      setEmergencyMessage('');
      setEmergencyUrgency('normal');
      // Hide modal after 3 seconds
      setTimeout(() => {
        setShowEmergencyModal(false);
        setEmergencySuccess('');
      }, 3000);
    } catch (err) {
      alert(err.message);
    } finally {
      setEmergencySubmitting(false);
    }
  };

  const fetchPosters = useCallback(async () => {
    if (user.role !== 'audience') return;
    try {
      const response = await fetch(`${backendUrl}/api/poster/available`, { headers });
      if (response.ok) {
        const data = await response.json();
        setPosters(data);
      }
    } catch (err) {
      console.error("Failed to fetch dashboard posters:", err);
    }
  }, [backendUrl, headers, user.role]);

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(`${backendUrl}/api/dashboard/stats`, { headers });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to load dashboard statistics`);
      }
      const data = await response.json();
      setStats(data);
      setError('');
    } catch (err) {
      console.error("Failed to fetch dashboard stats:", err);
      setError(err.message || 'Failed to connect to backend server');
    } finally {
      setLoading(false);
    }
  }, [backendUrl, headers]);

  useEffect(() => {
    fetchStats();
    fetchPosters();
  }, [fetchStats, fetchPosters, bulletinCount]);

  // Auto-retry fetchStats when error occurs
  useEffect(() => {
    if (!error) return;
    const interval = setInterval(() => {
      fetchStats();
      fetchPosters();
    }, 5000);
    return () => clearInterval(interval);
  }, [error, fetchStats, fetchPosters]);


  if (loading) {
    return <div style={{ color: 'hsl(var(--text-secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', fontWeight: 600 }}>Gathering dashboard metrics...</div>;
  }

  if (error) {
    return (
      <div className="danger-text animate-fade-in" style={{ padding: '24px', border: '1.5px solid rgba(239, 68, 68, 0.3)', borderRadius: '16px', background: 'rgba(239, 68, 68, 0.06)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', margin: '40px 0', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.1rem', fontWeight: 700, color: '#ef4444' }}>
          <span>⚠️</span> Connection Error: {error}
        </div>
        <p style={{ fontSize: '0.88rem', color: 'hsl(var(--text-secondary))', margin: 0, maxWidth: '500px', lineHeight: '1.45' }}>
          The dashboard could not reach the backend service at <code>{backendUrl}</code>. Retrying automatically...
        </p>
        <button
          type="button"
          className="btn btn-primary"
          style={{ padding: '8px 20px', fontSize: '0.85rem', marginTop: '6px' }}
          onClick={() => {
            setLoading(true);
            setError('');
            fetchStats();
            fetchPosters();
          }}
        >
          🔄 Retry Connection Now
        </button>
      </div>
    );
  }

  const s = stats || {
    total_audiences: 0,
    active_audiences: 0,
    total_segments: 0,
    draft_campaigns: 0,
    total_campaigns: 0,
    total_templates: 0,
    recent_activities: []
  };

  const getRoleLabel = (role) => {
    switch (role) {
      case 'admin': return 'Administrator';
      case 'campaign_manager': return 'Campaign Manager';
      default: return 'Communications staff';
    }
  };

  const totalDelivered = s.total_delivered || 0;
  const totalFailed = s.total_failed || 0;
  const totalMessages = totalDelivered + totalFailed;
  const successRate = totalMessages > 0 ? Math.round((totalDelivered / totalMessages) * 100) : 0;

  // ----- Audience-specific portal -----
  if (user.role === 'audience') {
    const emergencyFlyers = posters.filter(
      poster => poster.category === 'emergency' || poster.tone === 'urgent'
    );
    const posterIds = new Set(emergencyFlyers.map(poster => poster.id));
    const emergencyAlerts = [
      ...liveCriticalAlerts.filter(alert => !posterIds.has(alert.id)),
      ...emergencyFlyers,
    ];
    const displayedAlerts = alertTab === 'emergency' ? emergencyAlerts : posters;

    return (
      <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ marginBottom: '36px' }}>
          <h1 style={{ fontSize: '2.4rem', fontWeight: '800', marginBottom: '8px', letterSpacing: '-0.03em', color: 'hsl(var(--text-primary))' }}>
            Welcome, {user.full_name}
          </h1>
          <p style={{ color: 'hsl(var(--text-muted))', fontSize: '1.05rem', fontWeight: '500' }}>
            Your communication portal — Stay connected and share your feedback.
          </p>
        </div>

        {/* Profile Summary + Quick Actions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px', order: 2 }}>
          <GlassCard style={{ padding: '28px' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '20px', color: 'hsl(var(--text-primary))', letterSpacing: '-0.02em' }}>
              Your Profile
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {[
                { label: 'Name', value: user.full_name },
                { label: 'Email', value: user.email },
                { label: 'Organization', value: user.organization || 'Not specified' },
                { label: 'Designation', value: user.designation || 'Not specified' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ fontSize: '0.88rem', color: 'hsl(var(--text-muted))', fontWeight: '600' }}>{item.label}</span>
                  <span style={{ fontSize: '0.92rem', color: 'hsl(var(--text-secondary))', fontWeight: '600' }}>{item.value}</span>
                </div>
              ))}
            </div>
          </GlassCard>

          <GlassCard style={{ padding: '28px' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '20px', color: 'hsl(var(--text-primary))', letterSpacing: '-0.02em' }}>
              Quick Actions
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div
                className="toolcard"
                onClick={() => setActiveTab('feedback')}
                style={{ padding: '18px', borderRadius: '14px', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ background: 'hsl(var(--primary) / 8%)', padding: '10px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg className="svg-icon" style={{ color: 'hsl(var(--primary))', width: '20px', height: '20px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  </div>
                  <div>
                    <span style={{ fontWeight: '700', fontSize: '1rem', color: 'hsl(var(--text-primary))' }}>Campaign Feedback</span>
                    <p style={{ fontSize: '0.82rem', color: 'hsl(var(--text-muted))', margin: 0, marginTop: '2px' }}>
                      Share your feedback on campaigns and communications you received.
                    </p>
                  </div>
                </div>
              </div>
              <div
                className="toolcard"
                onClick={() => setActiveTab('settings')}
                style={{ padding: '18px', borderRadius: '14px', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ background: 'hsl(var(--accent) / 8%)', padding: '10px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg className="svg-icon" style={{ color: 'hsl(var(--accent))', width: '20px', height: '20px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                    </svg>
                  </div>
                  <div>
                    <span style={{ fontWeight: '700', fontSize: '1rem', color: 'hsl(var(--text-primary))' }}>Profile Settings</span>
                    <p style={{ fontSize: '0.82rem', color: 'hsl(var(--text-muted))', margin: 0, marginTop: '2px' }}>
                      Update your preferences, personal details, and notification settings.
                    </p>
                  </div>
                </div>
              </div>
              <div
                className="toolcard"
                onClick={() => setActiveTab('citizen_conversations')}
                style={{ padding: '18px', borderRadius: '14px', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ background: 'hsl(var(--primary) / 8%)', padding: '10px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg className="svg-icon" style={{ color: 'hsl(var(--primary))', width: '20px', height: '20px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                    </svg>
                  </div>
                  <div>
                    <span style={{ fontWeight: '700', fontSize: '1rem', color: 'hsl(var(--text-primary))' }}>Citizen RAG Chat</span>
                    <p style={{ fontSize: '0.82rem', color: 'hsl(var(--text-muted))', margin: 0, marginTop: '2px' }}>
                      Interact with our Grounded RAG assistant to get campaign answers.
                    </p>
                  </div>
                </div>
              </div>

              {/* Emergency Alert Shortcut */}
              <div
                className="toolcard"
                onClick={() => {
                  setEmergencySubject('');
                  setEmergencyMessage('');
                  setEmergencyUrgency('normal');
                  setEmergencySuccess('');
                  setShowEmergencyModal(true);
                }}
                style={{ 
                  padding: '18px', 
                  borderRadius: '14px', 
                  cursor: 'pointer',
                  border: '1.5px dashed rgba(239, 68, 68, 0.3)',
                  background: 'rgba(239, 68, 68, 0.02)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ background: 'rgba(239, 68, 68, 0.08)', padding: '10px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg className="svg-icon" style={{ color: 'hsl(var(--danger))', width: '20px', height: '20px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  </div>
                  <div>
                    <span style={{ fontWeight: '700', fontSize: '1rem', color: 'hsl(var(--danger))' }}>Send Emergency Alert</span>
                    <p style={{ fontSize: '0.82rem', color: 'hsl(var(--text-muted))', margin: 0, marginTop: '2px' }}>
                      Directly submit an urgent emergency alert request to operators.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Modal Overlay */}
        {showEmergencyModal && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px'
          }}>
            <GlassCard style={{ padding: '32px', width: '100%', maxWidth: '500px', position: 'relative' }}>
              <button 
                onClick={() => setShowEmergencyModal(false)}
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

              <h3 style={{ marginBottom: '8px', fontWeight: 800, color: 'hsl(var(--danger))' }}>Send Emergency Alert</h3>
              <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.85rem', marginBottom: '24px', lineHeight: 1.4 }}>
                Alert campaign operators regarding evacuations, natural disasters, or critical hazards.
              </p>

              {emergencySuccess ? (
                <div style={{
                  padding: '16px',
                  background: 'rgba(34, 197, 94, 0.08)',
                  border: '1px solid rgba(34, 197, 94, 0.2)',
                  borderRadius: '10px',
                  color: 'hsl(var(--accent))',
                  fontSize: '0.9rem',
                  textAlign: 'center',
                  fontWeight: '600'
                }}>
                  {emergencySuccess}
                </div>
              ) : (
                <form onSubmit={handleEmergencySubmit}>
                  <div className="form-group" style={{ marginBottom: '16px' }}>
                    <label className="form-label" style={{ fontWeight: '600', fontSize: '0.85rem' }}>Subject Summary</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Severe flooding near North block riverbed"
                      value={emergencySubject}
                      onChange={e => setEmergencySubject(e.target.value)}
                      required
                      style={{ width: '100%' }}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: '16px' }}>
                    <label className="form-label" style={{ fontWeight: '600', fontSize: '0.85rem' }}>Urgency Level</label>
                    <select
                      className="form-control"
                      value={emergencyUrgency}
                      onChange={e => setEmergencyUrgency(e.target.value)}
                      style={{ width: '100%' }}
                    >
                      <option value="normal">Normal priority</option>
                      <option value="urgent">Urgent assistance</option>
                      <option value="critical">Critical emergency</option>
                    </select>
                  </div>

                  <div className="form-group" style={{ marginBottom: '24px' }}>
                    <label className="form-label" style={{ fontWeight: '600', fontSize: '0.85rem' }}>Detailed Message Description</label>
                    <textarea
                      className="form-control"
                      placeholder="Explain your situation in detail. Provide location, landmarks, and details of help required..."
                      value={emergencyMessage}
                      onChange={e => setEmergencyMessage(e.target.value)}
                      required
                      rows={4}
                      style={{ width: '100%', resize: 'none' }}
                    />
                  </div>

                  <button 
                    type="submit" 
                    className="btn btn-primary" 
                    disabled={emergencySubmitting}
                    style={{ width: '100%', padding: '12px', background: 'hsl(var(--danger))', borderColor: 'hsl(var(--danger))' }}
                  >
                    {emergencySubmitting ? 'Submitting Alert...' : 'Submit Emergency Alert'}
                  </button>
                </form>
              )}
            </GlassCard>
          </div>
        )}

        <div className="grid-two-cols" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px', order: 1 }}>
          {/* Recent Communications */}
          <GlassCard style={{ position: 'relative', overflow: 'hidden', padding: '28px', gridColumn: 2, gridRow: 1 }}>
            <h2 style={{ fontSize: '1.3rem', borderBottom: '1px solid var(--border-color-glass)', paddingBottom: '16px', marginBottom: '24px', fontWeight: '700', color: 'hsl(var(--text-primary))', letterSpacing: '-0.02em' }}>
              Recent Communications
            </h2>
            {s.recent_activities.length === 0 ? (
              <p style={{ color: 'hsl(var(--text-muted))', textAlign: 'center', padding: '36px 0', fontSize: '0.92rem', fontWeight: '500' }}>
                No recent communications to display.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {s.recent_activities.slice(0, 5).map((act, index) => (
                  <div key={index} className="animate-fade-in" style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'hsl(var(--primary))', flexShrink: 0 }}></div>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: '0.92rem', fontWeight: '600', color: 'hsl(var(--text-secondary))' }}>{act.message}</span>
                      <div style={{ fontSize: '0.78rem', color: 'hsl(var(--text-muted))', marginTop: '2px', fontWeight: '500' }}>
                        {new Date(act.timestamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>

          {/* Citizen alert centre: urgent alerts are persistent and separated from regular flyers. */}
          <GlassCard style={{ position: 'relative', overflow: 'hidden', padding: '28px', display: 'flex', flexDirection: 'column', gridColumn: 1, gridRow: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', borderBottom: '1px solid var(--border-color-glass)', paddingBottom: '16px', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '1.3rem', margin: 0, fontWeight: '700', color: 'hsl(var(--text-primary))', letterSpacing: '-0.02em' }}>
                Your Alerts
              </h2>
              {emergencyAlerts.length > 0 && (
                <span style={{ background: 'hsl(var(--danger))', color: 'white', borderRadius: '999px', fontSize: '0.72rem', fontWeight: '800', padding: '4px 9px' }}>
                  {emergencyAlerts.length} {emergencyAlerts.length === 1 ? 'EMERGENCY' : 'EMERGENCIES'}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
              <button
                type="button"
                onClick={() => setAlertTab('emergency')}
                style={{ padding: '8px 12px', borderRadius: '8px', border: `1px solid ${alertTab === 'emergency' ? 'hsl(var(--danger))' : 'var(--border-color-glass)'}`, background: alertTab === 'emergency' ? 'hsl(var(--danger) / 12%)' : 'transparent', color: alertTab === 'emergency' ? 'hsl(var(--danger))' : 'hsl(var(--text-muted))', fontWeight: '800', fontSize: '0.78rem', cursor: 'pointer' }}
              >
                🚨 Emergency Alerts {emergencyAlerts.length ? `(${emergencyAlerts.length})` : ''}
              </button>
              <button
                type="button"
                onClick={() => setAlertTab('all')}
                style={{ padding: '8px 12px', borderRadius: '8px', border: `1px solid ${alertTab === 'all' ? 'hsl(var(--primary))' : 'var(--border-color-glass)'}`, background: alertTab === 'all' ? 'hsl(var(--primary) / 12%)' : 'transparent', color: alertTab === 'all' ? 'hsl(var(--primary))' : 'hsl(var(--text-muted))', fontWeight: '800', fontSize: '0.78rem', cursor: 'pointer' }}
              >
                All Flyers ({posters.length})
              </button>
            </div>
            {displayedAlerts.length === 0 ? (
              <p style={{ color: 'hsl(var(--text-muted))', textAlign: 'center', padding: '36px 0', fontSize: '0.92rem', fontWeight: '500' }}>
                {alertTab === 'emergency'
                  ? 'No active emergency alerts for your area.'
                  : 'No flyers matching your preferred language are available.'}
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', maxHeight: '350px' }}>
                {displayedAlerts.map((poster) => (
                  <div key={poster.id} className="animate-fade-in" style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px', borderRadius: '10px', background: alertTab === 'emergency' ? 'hsl(var(--danger) / 6%)' : 'rgba(255,255,255,0.02)', border: `1px solid ${alertTab === 'emergency' ? 'hsl(var(--danger) / 32%)' : 'rgba(255,255,255,0.04)'}` }}>
                    <div style={{ width: '60px', height: '60px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color-glass)', flexShrink: 0, background: '#090b14', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>
                      {poster.image_url
                        ? <img src={poster.image_url} alt={poster.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : '🚨'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: '700', color: 'hsl(var(--text-primary))' }}>{interpolateText(poster.title)}</h4>
                      <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: 'hsl(var(--text-muted))' }}>{interpolateText(poster.description).slice(0, 70)}...</p>
                      {poster.created_at && <p style={{ margin: '5px 0 0', fontSize: '0.68rem', color: 'hsl(var(--text-muted))' }}>{formatAlertDateTime(poster.created_at)}</p>}
                      <button
                        onClick={() => setFullscreenPoster(poster)}
                        style={{
                          display: 'inline-block',
                          marginTop: '6px',
                          fontSize: '0.72rem',
                          color: 'hsl(var(--accent))',
                          fontWeight: '700',
                          textDecoration: 'none',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: 0
                        }}
                      >
                        👁 View Fullscreen
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        </div>

        {fullscreenPoster && (
          <div 
            onClick={() => setFullscreenPoster(null)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              background: 'rgba(3, 7, 18, 0.95)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 99999,
              cursor: 'pointer'
            }}
          >
            <div 
              onClick={(e) => e.stopPropagation()} 
              style={{ 
                position: 'relative', 
                maxWidth: '600px', 
                width: '90%', 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center',
                background: '#0e1222',
                border: '1px solid rgba(255,255,255,0.1)',
                padding: '24px',
                borderRadius: '16px',
                boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
              }}
            >
              {fullscreenPoster.image_url ? (
                <img
                  src={fullscreenPoster.image_url}
                  alt={fullscreenPoster.title}
                  style={{ maxWidth: '100%', maxHeight: '60vh', borderRadius: '8px', objectFit: 'contain' }}
                />
              ) : (
                <div style={{ width: '96px', height: '96px', borderRadius: '50%', background: 'hsl(var(--danger) / 12%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem', color: 'hsl(var(--danger))' }}>🚨</div>
              )}
              <h3 style={{ color: '#ffffff', marginTop: '16px', fontSize: '1.2rem', textAlign: 'center', fontWeight: '700' }}>{interpolateText(fullscreenPoster.title)}</h3>
              <p style={{ color: '#ffffff', marginTop: '8px', fontSize: '0.92rem', textAlign: 'center', lineHeight: '1.5', fontWeight: 600 }}>{interpolateText(fullscreenPoster.description)}</p>
              <button 
                onClick={() => setFullscreenPoster(null)}
                style={{
                  marginTop: '20px',
                  padding: '8px 28px',
                  borderRadius: '8px',
                  background: 'hsl(var(--primary))',
                  color: 'white',
                  border: 'none',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        )}

        {newPosterNotification && (
          <div style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            width: '320px',
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            border: '1.5px solid hsl(var(--primary))',
            borderRadius: '12px',
            padding: '16px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            zIndex: 10000,
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            backdropFilter: 'blur(8px)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: '800', color: 'hsl(var(--primary))', textTransform: 'uppercase', letterSpacing: '0.05em' }}>New Visual Alert</span>
              <button onClick={() => setNewPosterNotification(null)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.2rem', padding: 0, lineHieght: 1 }}>&times;</button>
            </div>
            <h4 style={{ color: 'white', margin: 0, fontSize: '0.95rem', fontWeight: '700' }}>{newPosterNotification.title}</h4>
            <p style={{ color: 'hsl(var(--text-muted))', margin: 0, fontSize: '0.78rem', lineHeight: '1.4' }}>{newPosterNotification.description.slice(0, 100)}...</p>
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button 
                onClick={() => {
                  setFullscreenPoster(newPosterNotification);
                  setNewPosterNotification(null);
                }}
                style={{
                  flex: 1,
                  padding: '6px 12px',
                  borderRadius: '6px',
                  background: 'hsl(var(--primary))',
                  color: 'white',
                  border: 'none',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                View Poster
              </button>
              <button 
                onClick={() => setNewPosterNotification(null)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  background: 'rgba(255,255,255,0.05)',
                  color: 'white',
                  border: '1px solid rgba(255,255,255,0.1)',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

      </div>
    );
  }

  // ----- Admin / Campaign Manager dashboard -----
  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: '800', marginBottom: '4px', letterSpacing: '-0.03em', color: 'hsl(var(--text-primary))' }}>
          Welcome back, {user.full_name}
        </h1>
        <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.92rem', fontWeight: '500' }}>
          Platform role: <span style={{ color: 'hsl(var(--primary))', fontWeight: '600' }}>{getRoleLabel(user.role)}</span> at <span style={{ color: 'hsl(var(--text-secondary))', fontWeight: '600' }}>{user.organization || 'General Public Services'}</span>
        </p>
      </div>

      <div className="dashboard-grid">
        <GlassCard 
          className="stat-card" 
          onClick={() => setActiveTab('audiences')}
          title="Open Audience Directory"
          style={{ cursor: 'pointer', transition: 'border-color 0.2s' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="stat-title">Audience Directory</span>
            <div style={{ background: 'hsl(var(--primary) / 8%)', padding: '5px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg className="svg-icon" style={{ color: 'hsl(var(--primary))', width: '16px', height: '16px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
          </div>
          <div>
            <span className="stat-number">{s.total_audiences}</span>
            <span style={{ fontSize: '0.72rem', color: 'hsl(var(--text-muted))', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px', fontWeight: '500', whiteSpace: 'nowrap' }}>
              <span style={{ display: 'inline-block', width: '5px', height: '5px', borderRadius: '50%', backgroundColor: 'hsl(var(--accent))' }}></span>
              {s.active_audiences} active recipients
            </span>
          </div>
        </GlassCard>

        <GlassCard 
          className="stat-card" 
          onClick={() => setActiveTab('managers')}
          title="Open Campaign Managers"
          style={{ cursor: 'pointer', transition: 'border-color 0.2s' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="stat-title">Campaign Managers</span>
            <div style={{ background: 'hsl(var(--secondary) / 8%)', padding: '5px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg className="svg-icon" style={{ color: 'hsl(var(--secondary))', width: '16px', height: '16px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
                <polyline points="16 11 18 13 22 9" />
              </svg>
            </div>
          </div>
          <div>
            <span className="stat-number">{s.total_managers ?? 0}</span>
            <span style={{ fontSize: '0.72rem', color: 'hsl(var(--text-muted))', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px', fontWeight: '500', whiteSpace: 'nowrap' }}>
              <span style={{ display: 'inline-block', width: '5px', height: '5px', borderRadius: '50%', backgroundColor: 'hsl(var(--secondary))' }}></span>
              Active operators & admins
            </span>
          </div>
        </GlassCard>

        <GlassCard 
          className="stat-card" 
          onClick={() => setActiveTab('audiences')}
          title="Open Audience Directory"
          style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '8px', cursor: 'pointer', transition: 'border-color 0.2s' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="stat-title">Dynamic Segments</span>
            <div style={{ background: 'hsl(var(--secondary) / 8%)', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg className="svg-icon" style={{ color: 'hsl(var(--secondary))', width: '18px', height: '18px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="6" />
                <circle cx="12" cy="12" r="2" />
              </svg>
            </div>
          </div>
          <div>
            <span className="stat-number">{s.total_segments}</span>
            <span style={{ fontSize: '0.78rem', color: 'hsl(var(--text-muted))', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', fontWeight: '500' }}>
              <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'hsl(var(--secondary))' }}></span>
              Target queries synced
            </span>
          </div>
        </GlassCard>

        <GlassCard 
          className="stat-card" 
          onClick={() => setActiveTab('campaigns')}
          title="Open Campaigns"
          style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '8px', cursor: 'pointer', transition: 'border-color 0.2s' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="stat-title">Draft Campaigns</span>
            <div style={{ background: 'hsl(var(--accent) / 8%)', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg className="svg-icon" style={{ color: 'hsl(var(--accent))', width: '18px', height: '18px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </div>
          </div>
          <div>
            <span className="stat-number">{s.draft_campaigns}</span>
            <span style={{ fontSize: '0.78rem', color: 'hsl(var(--text-muted))', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', fontWeight: '500' }}>
              <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'hsl(var(--primary))' }}></span>
              {s.total_campaigns} campaigns total
            </span>
          </div>
        </GlassCard>

        <GlassCard 
          className="stat-card" 
          onClick={() => setActiveTab('templates')}
          title="Open Templates Library"
          style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '8px', cursor: 'pointer', transition: 'border-color 0.2s' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="stat-title">Templates Library</span>
            <div style={{ background: 'hsl(var(--warning) / 8%)', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg className="svg-icon" style={{ color: 'hsl(var(--warning))', width: '18px', height: '18px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </div>
          </div>
          <div>
            <span className="stat-number">{s.total_templates}</span>
            <span style={{ fontSize: '0.78rem', color: 'hsl(var(--text-muted))', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', fontWeight: '500' }}>
              <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'hsl(var(--warning))' }}></span>
              Message blocks ready
            </span>
          </div>
        </GlassCard>

        <GlassCard 
          className="stat-card" 
          onClick={() => setActiveTab('campaigns')}
          title="View Campaigns & Delivery Stats"
          style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '8px', cursor: 'pointer', transition: 'border-color 0.2s' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="stat-title">Messages Delivered</span>
            <div style={{ background: 'rgba(34, 197, 94, 0.08)', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg className="svg-icon" style={{ color: 'hsl(var(--accent))', width: '18px', height: '18px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          </div>
          <div>
            <span className="stat-number" style={{ color: 'hsl(var(--accent))' }}>{totalDelivered}</span>
            <div style={{ marginTop: '4px' }}>
              <div style={{ height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden', marginBottom: '4px' }}>
                <div style={{ width: `${successRate}%`, height: '100%', background: 'hsl(var(--accent))' }}></div>
              </div>
              <span style={{ fontSize: '0.78rem', color: 'hsl(var(--text-muted))', fontWeight: '600' }}>
                {totalMessages > 0 ? `${successRate}% Delivery Success Rate` : 'No dispatches recorded'}
              </span>
            </div>
          </div>
        </GlassCard>

        <GlassCard 
          className="stat-card" 
          onClick={() => setActiveTab('campaigns')}
          title="View Failed Dispatches"
          style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '8px', cursor: 'pointer', transition: 'border-color 0.2s' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="stat-title">Failed Dispatches</span>
            <div style={{ background: 'rgba(239, 68, 68, 0.08)', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg className="svg-icon" style={{ color: 'hsl(var(--danger))', width: '18px', height: '18px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>
          </div>
          <div>
            <span className="stat-number" style={{ color: 'hsl(var(--danger))' }}>{totalFailed}</span>
            <span style={{ fontSize: '0.78rem', color: 'hsl(var(--text-muted))', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', fontWeight: '500' }}>
              <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'hsl(var(--danger))' }}></span>
              Rejected or configuration errors
            </span>
          </div>
        </GlassCard>

        <GlassCard 
          className="stat-card animate-fade-in" 
          onClick={() => setActiveTab('emergency_inbox')}
          style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '8px', cursor: 'pointer', border: '1px dashed hsl(var(--danger) / 40%)', background: 'hsl(var(--danger) / 2%)', transition: 'border-color 0.2s' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="stat-title" style={{ color: 'hsl(var(--danger))', fontWeight: 'bold' }}>Emergency Alerts</span>
            <div style={{ background: 'rgba(239, 68, 68, 0.08)', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg className="svg-icon" style={{ color: 'hsl(var(--danger))', width: '18px', height: '18px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
          </div>
          <div>
            <span className="stat-number" style={{ color: 'hsl(var(--danger))' }}>{s.open_emergencies_count || 0}</span>
            <span style={{ fontSize: '0.78rem', color: 'hsl(var(--text-muted))', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', fontWeight: '500' }}>
              <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'hsl(var(--danger))' }}></span>
              Open emergency inbox tickets
            </span>
          </div>
        </GlassCard>

        <GlassCard 
          className="stat-card animate-fade-in" 
          onClick={() => setActiveTab('support_queries')}
          style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '8px', cursor: 'pointer', border: '1px dashed hsl(var(--primary) / 40%)', background: 'hsl(var(--primary) / 2%)', transition: 'border-color 0.2s' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="stat-title" style={{ color: 'hsl(var(--primary))', fontWeight: 'bold' }}>Support Queries</span>
            <div style={{ background: 'rgba(76, 140, 252, 0.08)', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg className="svg-icon" style={{ color: 'hsl(var(--primary))', width: '18px', height: '18px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
            </div>
          </div>
          <div>
            <span className="stat-number" style={{ color: 'hsl(var(--primary))' }}>{s.open_queries_count || 0}</span>
            <span style={{ fontSize: '0.78rem', color: 'hsl(var(--text-muted))', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', fontWeight: '500' }}>
              <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'hsl(var(--primary))' }}></span>
              Unresolved support requests
            </span>
          </div>
        </GlassCard>
      </div>

      {/* Language-Wise Analytics Chart Widget */}
      <GlassCard style={{ padding: '20px 24px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color-glass)', paddingBottom: '12px', marginBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'hsl(var(--text-primary))', margin: 0, letterSpacing: '-0.02em' }}>
              🌐 Language-Wise Reach & Delivery Analytics
            </h2>
            <p style={{ fontSize: '0.78rem', color: 'hsl(var(--text-muted))', margin: 0, marginTop: '2px' }}>
              Audience target distribution and message deliveries broken down by preferred Indian language.
            </p>
          </div>
          <span style={{ fontSize: '0.72rem', background: 'hsl(var(--primary) / 10%)', color: 'hsl(var(--primary))', padding: '3px 10px', borderRadius: '16px', fontWeight: '700' }}>
            {(s.language_analytics || []).length} Languages Tracked
          </span>
        </div>

        {(() => {
          const langList = s.language_analytics || [];
          const totalReachAll = langList.reduce((acc, l) => acc + (l.reach || 0), 0) || 1;
          const colors = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'];
          const circumference = 2 * Math.PI * 52; // r=52 -> ~326.72
          let accumDashOffset = 0;

          return (
            <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr', gap: '24px', alignItems: 'center' }}>
              {/* Left Column: Language Cards (2-column grid when > 3 items) */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: langList.length > 3 ? 'repeat(2, 1fr)' : '1fr',
                gap: '8px'
              }}>
                {langList.map((langItem, idx) => {
                  const maxReach = Math.max(...langList.map(l => l.reach), 1);
                  const reachPct = Math.round((langItem.reach / maxReach) * 100);
                  const sharePct = Math.round((langItem.reach / totalReachAll) * 100);
                  const deliveryRate = langItem.reach > 0 ? Math.round((langItem.delivered / langItem.reach) * 100) : 0;
                  const color = colors[idx % colors.length];

                  return (
                    <div key={langItem.language} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color-glass)', borderRadius: '8px', padding: '8px 10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', overflow: 'hidden' }}>
                          <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: color, display: 'inline-block', flexShrink: 0 }}></span>
                          <span style={{ fontWeight: '700', fontSize: '0.82rem', color: 'hsl(var(--text-primary))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{langItem.language}</span>
                          <span style={{ fontSize: '0.68rem', color: 'hsl(var(--text-muted))', fontWeight: '500', flexShrink: 0 }}>({sharePct}%)</span>
                        </div>
                        <span style={{ fontSize: '0.66rem', fontWeight: '800', color: color, background: `${color}18`, padding: '1px 5px', borderRadius: '4px', flexShrink: 0 }}>
                          {deliveryRate}%
                        </span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'hsl(var(--text-muted))', marginBottom: '4px' }}>
                        <span>Reach: <strong style={{ color: 'hsl(var(--text-primary))' }}>{langItem.reach}</strong></span>
                        <span>Delivered: <strong style={{ color: 'hsl(var(--accent))' }}>{langItem.delivered}</strong></span>
                      </div>

                      <div style={{ height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ width: `${reachPct}%`, height: '100%', background: color, borderRadius: '2px' }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Right Column: Eye-Catching SVG Donut/Pie Chart */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px' }}>
                <div style={{ position: 'relative', width: '180px', height: '180px' }}>
                  <svg width="180" height="180" viewBox="0 0 160 160" style={{ transform: 'rotate(-90deg)', overflow: 'visible' }}>
                    {/* Background Ring */}
                    <circle cx="80" cy="80" r="52" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="18" />
                    {/* Segment Arcs */}
                    {langList.map((langItem, idx) => {
                      const color = colors[idx % colors.length];
                      const pct = (langItem.reach || 0) / totalReachAll;
                      const dashLen = pct * circumference;
                      const dashArray = `${dashLen} ${circumference - dashLen}`;
                      const dashOffset = -accumDashOffset;
                      accumDashOffset += dashLen;

                      return (
                        <circle
                          key={langItem.language}
                          cx="80"
                          cy="80"
                          r="52"
                          fill="none"
                          stroke={color}
                          strokeWidth="18"
                          strokeDasharray={dashArray}
                          strokeDashoffset={dashOffset}
                          style={{ transition: 'all 0.5s ease' }}
                        />
                      );
                    })}
                  </svg>
                  {/* Center Donut Label */}
                  <div style={{
                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    pointerEvents: 'none'
                  }}>
                    <span style={{ fontSize: '1.4rem', fontWeight: '800', color: 'hsl(var(--text-primary))', lineHeight: 1 }}>
                      {totalReachAll}
                    </span>
                    <span style={{ fontSize: '0.68rem', color: 'hsl(var(--text-muted))', fontWeight: '600', marginTop: '2px' }}>
                      Target Reach
                    </span>
                  </div>
                </div>

                {/* Compact Legend */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 12px', justifyContent: 'center', marginTop: '12px' }}>
                  {langList.map((langItem, idx) => {
                    const color = colors[idx % colors.length];
                    return (
                      <div key={langItem.language} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: 'hsl(var(--text-muted))' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: color, display: 'inline-block' }}></span>
                        <span>{langItem.language}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}
      </GlassCard>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '32px' }}>
        <GlassCard style={{ display: 'flex', flexDirection: 'column', gap: '24px', padding: '28px' }}>
          <h2 style={{ fontSize: '1.3rem', borderBottom: '1px solid var(--border-color-glass)', paddingBottom: '16px', fontWeight: '700', color: 'hsl(var(--text-primary))', letterSpacing: '-0.02em' }}>
            Quick Shortcuts
          </h2>
          <div className="toolcard-grid">
            <div
              className="toolcard"
              onClick={() => setActiveTab('audiences')}
              style={{ padding: '20px', borderRadius: '16px' }}
            >
              <div className="toolcard-icon-container" style={{ background: 'hsl(var(--primary) / 8%)', color: 'hsl(var(--primary))', borderRadius: '10px', width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg className="svg-icon" style={{ width: '20px', height: '20px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <span className="toolcard-title" style={{ fontSize: '1rem', fontWeight: '700', marginTop: '6px' }}>Manage Audiences</span>
              <p style={{ fontSize: '0.82rem', color: 'hsl(var(--text-muted))', lineHeight: '1.5', margin: 0 }}>
                Review subscriber directories, states, occupations, and profile filters.
              </p>
            </div>
            
            <div
              className="toolcard"
              onClick={() => setActiveTab('campaigns')}
              style={{ padding: '20px', borderRadius: '16px' }}
            >
              <div className="toolcard-icon-container" style={{ background: 'hsl(var(--secondary) / 8%)', color: 'hsl(var(--secondary))', borderRadius: '10px', width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg className="svg-icon" style={{ width: '20px', height: '20px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 2L11 13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </div>
              <span className="toolcard-title" style={{ fontSize: '1rem', fontWeight: '700', marginTop: '6px' }}>Create Campaign</span>
              <p style={{ fontSize: '0.82rem', color: 'hsl(var(--text-muted))', lineHeight: '1.5', margin: 0 }}>
                Launch a new multi-channel messaging broadcast using the planner wizard.
              </p>
            </div>
            
            <div
              className="toolcard"
              onClick={() => setActiveTab('templates')}
              style={{ padding: '20px', borderRadius: '16px' }}
            >
              <div className="toolcard-icon-container" style={{ background: 'hsl(var(--warning) / 8%)', color: 'hsl(var(--warning))', borderRadius: '10px', width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg className="svg-icon" style={{ width: '20px', height: '20px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <span className="toolcard-title" style={{ fontSize: '1rem', fontWeight: '700', marginTop: '6px' }}>Templates Library</span>
              <p style={{ fontSize: '0.82rem', color: 'hsl(var(--text-muted))', lineHeight: '1.5', margin: 0 }}>
                Write reusable templates, set variables, and manage localized layouts.
              </p>
            </div>
            
            <div
              className="toolcard"
              onClick={() => setActiveTab('audiences')}
              style={{ padding: '20px', borderRadius: '16px' }}
            >
              <div className="toolcard-icon-container" style={{ background: 'hsl(var(--accent) / 8%)', color: 'hsl(var(--accent))', borderRadius: '10px', width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg className="svg-icon" style={{ width: '20px', height: '20px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <span className="toolcard-title" style={{ fontSize: '1rem', fontWeight: '700', marginTop: '6px' }}>CSV Bulk Importer</span>
              <p style={{ fontSize: '0.82rem', color: 'hsl(var(--text-muted))', lineHeight: '1.5', margin: 0 }}>
                Upload spreadsheet files to mass seed recipient records with validation.
              </p>
            </div>

            <div
              className="toolcard"
              onClick={() => setActiveTab('citizen_conversations')}
              style={{ padding: '20px', borderRadius: '16px' }}
            >
              <div className="toolcard-icon-container" style={{ background: 'hsl(var(--primary) / 8%)', color: 'hsl(var(--primary))', borderRadius: '10px', width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg className="svg-icon" style={{ width: '20px', height: '20px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
              </div>
              <span className="toolcard-title" style={{ fontSize: '1rem', fontWeight: '700', marginTop: '6px' }}>Citizen RAG Chat</span>
              <p style={{ fontSize: '0.82rem', color: 'hsl(var(--text-muted))', lineHeight: '1.5', margin: 0 }}>
                Simulate two-way citizen communications and test grounded RAG answers.
              </p>
            </div>
          </div>
        </GlassCard>

        <GlassCard style={{ position: 'relative', overflow: 'hidden', padding: '28px' }}>
          <h2 style={{ fontSize: '1.3rem', borderBottom: '1px solid var(--border-color-glass)', paddingBottom: '16px', marginBottom: '24px', fontWeight: '700', color: 'hsl(var(--text-primary))', letterSpacing: '-0.02em' }}>
            Recent Activities
          </h2>
          {s.recent_activities.length === 0 ? (
            <p style={{ color: 'hsl(var(--text-muted))', textAlign: 'center', padding: '36px 0', fontSize: '0.92rem', fontWeight: '500' }}>
              No recent changes recorded.
            </p>
          ) : (
            <div style={{ position: 'relative', paddingLeft: '4px' }}>
              <div className="timeline-line" style={{ top: '16px', bottom: '16px' }}></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {s.recent_activities.map((act, index) => {
                  const nodeClass = act.activity_type === 'campaign' ? 'campaign' : act.activity_type === 'template' ? 'template' : 'audience';
                  
                  let nodeSvg;
                  if (act.activity_type === 'campaign') {
                    nodeSvg = (
                      <svg className="svg-icon" style={{ width: '10px', height: '10px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                      </svg>
                    );
                  } else if (act.activity_type === 'template') {
                    nodeSvg = (
                      <svg className="svg-icon" style={{ width: '10px', height: '10px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <path d="M14 2v6h6"/>
                      </svg>
                    );
                  } else {
                    nodeSvg = (
                      <svg className="svg-icon" style={{ width: '10px', height: '10px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                      </svg>
                    );
                  }

                  return (
                    <div key={index} className="timeline-item-wrapper animate-fade-in" style={{ paddingLeft: '34px', marginBottom: '20px' }}>
                      <div className={`timeline-node ${nodeClass}`} style={{ left: '0px', width: '24px', height: '24px', borderWidth: '2px' }}>
                        {nodeSvg}
                      </div>
                      <div className="activity-content">
                        <span className="activity-msg" style={{ fontSize: '0.92rem', fontWeight: '600', color: 'hsl(var(--text-secondary))' }}>{act.message}</span>
                        <span className="activity-time" style={{ fontSize: '0.78rem', color: 'hsl(var(--text-muted))', marginTop: '2px', fontWeight: '500' }}>
                          {new Date(act.timestamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </GlassCard>
      </div>

      {listModalType && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <GlassCard style={{ 
            padding: '32px', 
            width: '100%', 
            maxWidth: '850px', 
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <button 
              onClick={() => setListModalType(null)}
              style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                background: 'none',
                border: 'none',
                color: 'hsl(var(--text-muted))',
                fontSize: '1.5rem',
                cursor: 'pointer',
                fontWeight: '600',
                zIndex: 10
              }}
            >
              &times;
            </button>

            <h3 style={{ 
              marginBottom: '4px', 
              fontWeight: 800, 
              color: 'hsl(var(--text-primary))',
              fontSize: '1.5rem',
              textTransform: 'capitalize' 
            }}>
              {listModalType === 'drafts' ? 'Draft Campaigns' : listModalType === 'delivered' ? 'Messages Delivered' : listModalType === 'failed' ? 'Failed Dispatches' : listModalType}
            </h3>
            <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.88rem', marginBottom: '24px' }}>
              Showing the current records stored in the database.
            </p>

            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px', minHeight: '300px' }}>
              {modalLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px', color: 'hsl(var(--text-secondary))', fontWeight: 600 }}>
                  Loading records...
                </div>
              ) : modalItems.length === 0 ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px', color: 'hsl(var(--text-muted))' }}>
                  No records found.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1.5px solid rgba(255,255,255,0.08)', color: 'hsl(var(--text-muted))', textAlign: 'left' }}>
                      {listModalType === 'audiences' && (
                        <>
                          <th style={{ padding: '12px 8px' }}>Name</th>
                          <th style={{ padding: '12px 8px' }}>Contact</th>
                          <th style={{ padding: '12px 8px' }}>Occupation</th>
                          <th style={{ padding: '12px 8px' }}>State</th>
                          <th style={{ padding: '12px 8px' }}>Languages</th>
                        </>
                      )}
                      {listModalType === 'segments' && (
                        <>
                          <th style={{ padding: '12px 8px' }}>Segment Name</th>
                          <th style={{ padding: '12px 8px' }}>Filter Criteria</th>
                        </>
                      )}
                      {listModalType === 'drafts' && (
                        <>
                          <th style={{ padding: '12px 8px' }}>Campaign Title</th>
                          <th style={{ padding: '12px 8px' }}>Channels</th>
                          <th style={{ padding: '12px 8px' }}>Est. Reach</th>
                          <th style={{ padding: '12px 8px' }}>Created At</th>
                        </>
                      )}
                      {listModalType === 'templates' && (
                        <>
                          <th style={{ padding: '12px 8px' }}>Template Name</th>
                          <th style={{ padding: '12px 8px' }}>Channel</th>
                          <th style={{ padding: '12px 8px' }}>Content Preview</th>
                        </>
                      )}
                      {(listModalType === 'delivered' || listModalType === 'failed') && (
                        <>
                          <th style={{ padding: '12px 8px' }}>Recipient</th>
                          <th style={{ padding: '12px 8px' }}>Campaign</th>
                          <th style={{ padding: '12px 8px' }}>Channel</th>
                          <th style={{ padding: '12px 8px' }}>Time</th>
                          {listModalType === 'failed' && <th style={{ padding: '12px 8px' }}>Error Details</th>}
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {modalItems.map((item, index) => (
                      <tr 
                        key={item.id || index} 
                        style={{ 
                          borderBottom: '1px solid var(--border-color-glass)', 
                          color: 'hsl(var(--text-secondary))',
                          background: index % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent' 
                        }}
                      >
                        {listModalType === 'audiences' && (
                          <>
                            <td style={{ padding: '12px 8px', fontWeight: '600', color: 'hsl(var(--text-primary))' }}>{item.first_name} {item.last_name}</td>
                            <td style={{ padding: '12px 8px' }}>
                              <div style={{ fontSize: '0.85rem' }}>{item.email}</div>
                              <div style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))' }}>{item.phone}</div>
                            </td>
                            <td style={{ padding: '12px 8px' }}>{item.occupation || 'N/A'}</td>
                            <td style={{ padding: '12px 8px' }}>{item.state || 'N/A'}</td>
                            <td style={{ padding: '12px 8px' }}>
                              {(() => {
                                try {
                                  const parsed = typeof item.preferred_languages === 'string' ? JSON.parse(item.preferred_languages) : item.preferred_languages;
                                  return Array.isArray(parsed) ? parsed.join(', ') : String(parsed || '');
                                } catch (e) {
                                  return String(item.preferred_languages || '');
                                }
                              })()}
                            </td>
                          </>
                        )}
                        {listModalType === 'segments' && (
                          <>
                            <td style={{ padding: '12px 8px', fontWeight: '600', color: 'hsl(var(--text-primary))' }}>{item.name}</td>
                            <td style={{ padding: '12px 8px', fontSize: '0.8rem', color: 'hsl(var(--text-muted))' }}>
                              {typeof item.filter_criteria === 'string' ? item.filter_criteria : JSON.stringify(item.filter_criteria || {})}
                            </td>
                          </>
                        )}
                        {listModalType === 'drafts' && (
                          <>
                            <td style={{ padding: '12px 8px', fontWeight: '600', color: 'hsl(var(--text-primary))' }}>{item.title}</td>
                            <td style={{ padding: '12px 8px' }}>
                              {(() => {
                                try {
                                  const parsed = typeof item.channels === 'string' ? JSON.parse(item.channels) : item.channels;
                                  return Array.isArray(parsed) ? parsed.join(', ') : String(parsed || '');
                                } catch (e) {
                                  return String(item.channels || '');
                                }
                              })()}
                            </td>
                            <td style={{ padding: '12px 8px' }}>{item.estimated_reach || 0} / {item.target_audience_size || 0}</td>
                            <td style={{ padding: '12px 8px', fontSize: '0.8rem' }}>
                              {item.created_at ? new Date(item.created_at).toLocaleString() : 'N/A'}
                            </td>
                          </>
                        )}
                        {listModalType === 'templates' && (
                          <>
                            <td style={{ padding: '12px 8px', fontWeight: '600', color: 'hsl(var(--text-primary))' }}>{item.title}</td>
                            <td style={{ padding: '12px 8px', textTransform: 'uppercase', fontSize: '0.8rem', fontWeight: 'bold' }}>{item.channel}</td>
                            <td style={{ padding: '12px 8px', fontSize: '0.8rem', color: 'hsl(var(--text-muted))', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.body || item.description || ''}
                            </td>
                          </>
                        )}
                        {(listModalType === 'delivered' || listModalType === 'failed') && (
                          <>
                            <td style={{ padding: '12px 8px', fontWeight: '600', color: 'hsl(var(--text-primary))' }}>{item.recipient_name}</td>
                            <td style={{ padding: '12px 8px' }}>{item.campaign_title}</td>
                            <td style={{ padding: '12px 8px', textTransform: 'uppercase', fontSize: '0.8rem', fontWeight: 'bold' }}>{item.channel}</td>
                            <td style={{ padding: '12px 8px', fontSize: '0.8rem' }}>
                              {item.sent_at ? new Date(item.sent_at).toLocaleString() : 'N/A'}
                            </td>
                            {listModalType === 'failed' && (
                              <td style={{ padding: '12px 8px', color: 'hsl(var(--danger))', fontSize: '0.8rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {item.error_details || 'Unknown Error'}
                              </td>
                            )}
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button 
                onClick={() => setListModalType(null)}
                className="btn"
                style={{
                  padding: '8px 24px',
                  borderRadius: '8px',
                  background: 'rgba(255,255,255,0.05)',
                  color: 'hsl(var(--text-primary))',
                  border: '1px solid var(--border-color-glass)',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
