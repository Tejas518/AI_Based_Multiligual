import React, { useState, useEffect, useCallback } from 'react';
import GlassCard from '../components/GlassCard';

const FactShield = ({ _user, backendUrl, headers, setActiveTab }) => {
  const [rumors, setRumors] = useState([]);
  const [selectedRumor, setSelectedRumor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('pending'); // default to pending rumors
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState(null);

  // Editing workspace states
  const [editedFactCheck, setEditedFactCheck] = useState('');
  const [editedCity, setEditedCity] = useState('');
  const [editedDistrict, setEditedDistrict] = useState('');
  const [editedState, setEditedState] = useState('');
  const [selectedChannels, setSelectedChannels] = useState(['sms', 'email']);

  const selectRumor = useCallback((rumor) => {
    setSelectedRumor(rumor);
    setEditedFactCheck(rumor.official_fact_check || '');
    setEditedCity(rumor.city || '');
    setEditedDistrict(rumor.district || '');
    setEditedState(rumor.state || '');
  }, []);

  const fetchRumors = useCallback(async () => {
    setLoading(true);
    try {
      let url = `${backendUrl}/api/fact-shield/rumors`;
      if (filterStatus && filterStatus !== 'all') {
        url += `?status_filter=${filterStatus}`;
      }
      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error('Failed to fetch rumors list');
      let data = await response.json();

      if (search) {
        const query = search.toLowerCase();
        data = data.filter(r => 
          r.claim_summary.toLowerCase().includes(query) ||
          r.suspected_rumor_text.toLowerCase().includes(query) ||
          (r.district && r.district.toLowerCase().includes(query)) ||
          (r.city && r.city.toLowerCase().includes(query))
        );
      }

      setRumors(data);
      
      // Auto-select first rumor if none selected, or update selected rumor ID reference without resetting active form edits
      if (data.length > 0) {
        setSelectedRumor(prev => {
          if (!prev) {
            const first = data[0];
            setEditedFactCheck(first.official_fact_check || '');
            setEditedCity(first.city || '');
            setEditedDistrict(first.district || '');
            setEditedState(first.state || '');
            return first;
          } else {
            const updated = data.find(r => r.id === prev.id);
            return updated || data[0];
          }
        });
      } else {
        setSelectedRumor(null);
      }
    } catch (err) {
      console.error(err);
      setMessage({ text: 'Error loading rumor alerts database.', type: 'danger' });
    } finally {
      setLoading(false);
    }
  }, [backendUrl, headers, filterStatus, search]);

  useEffect(() => {
    fetchRumors();
    const interval = setInterval(fetchRumors, 12000);
    return () => clearInterval(interval);
  }, [fetchRumors]);

  const handleUpdateRumorDetails = async () => {
    if (!selectedRumor) return;
    setActionLoading(true);
    try {
      const response = await fetch(`${backendUrl}/api/fact-shield/rumors/${selectedRumor.id}`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          official_fact_check: editedFactCheck,
          city: editedCity,
          district: editedDistrict,
          state: editedState
        })
      });

      if (!response.ok) throw new Error('Failed to update rumor details.');
      
      setMessage({ text: 'Official fact-check details updated successfully.', type: 'success' });
      fetchRumors();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleNeutralize = async () => {
    if (!selectedRumor) return;
    if (!editedFactCheck.trim()) {
      alert('Please provide an official fact check text first.');
      return;
    }

    // Save changes first
    await handleUpdateRumorDetails();

    setActionLoading(true);
    try {
      const response = await fetch(`${backendUrl}/api/fact-shield/rumors/${selectedRumor.id}/neutralize`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channels: selectedChannels
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        const errMsg = typeof errData.detail === 'object' ? JSON.stringify(errData.detail) : errData.detail;
        throw new Error(errMsg || 'Neutralization broadcast failed.');
      }

      const resData = await response.json();
      setMessage({ 
        text: `🛡️ Rumor neutralized! Emergency broadcast launched successfully to geofenced area. (${resData.target_count} target recipients).`, 
        type: 'success' 
      });
      fetchRumors();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDismiss = async () => {
    if (!selectedRumor) return;
    if (!window.confirm('Are you sure you want to dismiss and ignore this rumor query?')) return;

    setActionLoading(true);
    try {
      const response = await fetch(`${backendUrl}/api/fact-shield/rumors/${selectedRumor.id}`, {
        method: 'DELETE',
        headers
      });

      if (!response.ok) throw new Error('Failed to dismiss rumor.');

      setMessage({ text: 'Rumor dismissed and archived.', type: 'success' });
      fetchRumors();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSeedDemoData = async () => {
    setActionLoading(true);
    try {
      const response = await fetch(`${backendUrl}/api/fact-shield/seed-demo`, {
        method: 'POST',
        headers
      });
      if (!response.ok) throw new Error('Failed to seed demo data');
      await response.json();
      setMessage({ text: '⚡ System-wide demo data loaded! AI Fact Shield, Approvals Queue, Emergency Inbox, Support Desk, and Sentiment Map are now fully populated.', type: 'success' });
      fetchRumors();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const toggleChannel = (ch) => {
    if (selectedChannels.includes(ch)) {
      if (selectedChannels.length > 1) {
        setSelectedChannels(prev => prev.filter(c => c !== ch));
      }
    } else {
      setSelectedChannels(prev => [...prev, ch]);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending':
        return <span className="badge badge-warning" style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '4px 8px', borderRadius: '6px' }}>🚨 Pending Scan</span>;
      case 'verified_fake':
        return <span className="badge badge-success" style={{ background: 'rgba(34, 197, 94, 0.12)', color: '#22c55e', border: '1px solid rgba(34, 197, 94, 0.3)', padding: '4px 8px', borderRadius: '6px' }}>🛡️ Neutralized</span>;
      case 'ignored':
        return <span className="badge badge-secondary" style={{ background: 'rgba(255, 255, 255, 0.08)', color: '#94a3b8', border: '1px solid rgba(255, 255, 255, 0.15)', padding: '4px 8px', borderRadius: '6px' }}>Dismissed</span>;
      default:
        return <span className="badge">{status}</span>;
    }
  };

  const getCategoryBadge = (cat) => {
    const colorMap = {
      water: '#38bdf8',
      medical: '#ec4899',
      disaster: '#f43f5e',
      security: '#a855f7',
      infrastructure: '#eab308'
    };
    const color = colorMap[cat] || '#94a3b8';
    return (
      <span style={{ 
        fontSize: '0.75rem', 
        fontWeight: 'bold', 
        textTransform: 'uppercase', 
        padding: '2px 6px', 
        borderRadius: '4px', 
        background: `${color}15`, 
        color: color, 
        border: `1px solid ${color}35` 
      }}>
        {cat}
      </span>
    );
  };

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '32px' }}>
      {/* Upper header summary */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.88rem', margin: '4px 0 0' }}>
            Identify crisis-related fake news spreading in the community, auto-verify with RAG databases, and push containment updates.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            className="btn btn-secondary" 
            onClick={handleSeedDemoData} 
            disabled={actionLoading}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              padding: '10px 16px', 
              borderRadius: '10px', 
              background: 'rgba(56, 189, 248, 0.1)', 
              color: '#38bdf8', 
              border: '1px solid rgba(56, 189, 248, 0.3)',
              cursor: 'pointer'
            }}
          >
            ⚡ Seed Demo Data
          </button>
          <button 
            className="btn btn-secondary" 
            onClick={fetchRumors} 
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '10px' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '16px', height: '16px' }}>
              <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
            Sync Feed
          </button>
        </div>
      </div>

      {message && (
        <div 
          className={`alert alert-${message.type}`} 
          style={{ 
            padding: '16px', 
            borderRadius: '12px', 
            marginBottom: '24px', 
            background: message.type === 'success' ? 'rgba(34, 197, 94, 0.05)' : 'rgba(239, 68, 68, 0.05)',
            border: message.type === 'success' ? '1px solid rgba(34, 197, 94, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)',
            color: message.type === 'success' ? 'hsl(var(--accent))' : 'hsl(var(--danger))',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{message.text}</span>
          <button 
            onClick={() => setMessage(null)} 
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 'bold' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Control bar */}
      <GlassCard style={{ padding: '16px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          {/* Filters */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {['pending', 'verified_fake', 'ignored', 'all'].map(status => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`btn ${filterStatus === status ? 'btn-primary' : 'btn-secondary'}`}
                style={{ textTransform: 'capitalize', padding: '6px 14px', fontSize: '0.85rem', borderRadius: '8px' }}
              >
                {status === 'pending' ? '🚨 Suspected' : status === 'verified_fake' ? '🛡️ Neutralized' : status}
              </button>
            ))}
          </div>

          {/* Search bar */}
          <div style={{ position: 'relative', width: '300px', maxWidth: '100%' }}>
            <input
              type="text"
              placeholder="Search by claim, location or text..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchRumors()}
              style={{
                width: '100%',
                padding: '10px 16px 10px 38px',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.04)',
                color: 'hsl(var(--text-primary))',
                fontSize: '0.88rem'
              }}
            />
            <svg 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', width: '16px', height: '16px', opacity: 0.6 }}
            >
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </div>
        </div>
      </GlassCard>

      {/* Main split display */}
      <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: '24px', minHeight: '500px' }}>
        
        {/* Left Side: Rumors list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '700px', overflowY: 'auto' }}>
          {loading && rumors.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'hsl(var(--text-muted))' }}>Checking rumor database...</div>
          ) : rumors.length === 0 ? (
            <div className="glass-card" style={{ padding: '32px', textAlign: 'center', color: 'hsl(var(--text-muted))' }}>
              No rumors flagged in this category.
            </div>
          ) : (
            rumors.map(r => (
              <div 
                key={r.id} 
                onClick={() => selectRumor(r)}
                className="glass-card"
                style={{
                  padding: '16px',
                  cursor: 'pointer',
                  borderLeft: selectedRumor?.id === r.id ? '4px solid hsl(var(--primary))' : '1px solid rgba(255,255,255,0.06)',
                  background: selectedRumor?.id === r.id ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255,255,255,0.01)',
                  transition: 'all 0.2s ease',
                  position: 'relative'
                }}
              >
                {/* Flame indicator for virality */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  {getCategoryBadge(r.category)}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span title="Report count (Virality)" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: '#ff6f00', fontWeight: 'bold' }}>
                      🔥 {r.virality_score} Reports
                    </span>
                  </div>
                </div>

                <h4 style={{ margin: '0 0 6px', fontSize: '0.92rem', fontWeight: 600, color: 'hsl(var(--text-primary))' }}>
                  {r.claim_summary}
                </h4>

                <p style={{ margin: '0 0 10px', fontSize: '0.82rem', color: 'hsl(var(--text-muted))', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.4 }}>
                  "{r.suspected_rumor_text}"
                </p>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', color: 'hsl(var(--text-muted))' }}>
                  <span>
                    📍 {r.city || r.district || 'Unspecified'}
                  </span>
                  <span>
                    {new Date(r.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Right Side: Refutation workspace */}
        <div>
          {selectedRumor ? (
            <GlassCard style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Workspace Header */}
              <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
                      Rumor Assessment Workspace
                    </h2>
                    {getStatusBadge(selectedRumor.status)}
                  </div>
                  {selectedRumor.campaign_id && (
                    <button 
                      className="btn btn-secondary" 
                      onClick={() => setActiveTab('campaigns')}
                      style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                    >
                      View Campaign 🔗
                    </button>
                  )}
                </div>
                <h3 style={{ fontSize: '1rem', fontWeight: 500, color: 'hsl(var(--primary))', margin: '4px 0 0' }}>
                  Core Claim: "{selectedRumor.claim_summary}"
                </h3>
              </div>

              {/* Inbound vs Fact-check side by side */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 'bold', textTransform: 'uppercase', color: '#f43f5e', display: 'block', marginBottom: '6px' }}>
                    🚩 Suspected Rumor Broadcasted:
                  </label>
                  <div style={{
                    padding: '16px',
                    borderRadius: '8px',
                    background: 'rgba(244, 63, 94, 0.04)',
                    border: '1px solid rgba(244, 63, 94, 0.15)',
                    color: 'hsl(var(--text-primary))',
                    fontSize: '0.88rem',
                    lineHeight: 1.5,
                    fontStyle: 'italic',
                    minHeight: '120px'
                  }}>
                    "{selectedRumor.suspected_rumor_text}"
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 'bold', textTransform: 'uppercase', color: '#10b981', display: 'block', marginBottom: '6px' }}>
                    ✏️ Official Fact-Check Correction:
                  </label>
                  <textarea
                    value={editedFactCheck}
                    onChange={(e) => setEditedFactCheck(e.target.value)}
                    disabled={selectedRumor.status !== 'pending' || actionLoading}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: 'hsl(var(--text-primary))',
                      fontSize: '0.88rem',
                      lineHeight: 1.5,
                      minHeight: '120px',
                      resize: 'vertical'
                    }}
                    placeholder="Enter the official fact-checking refutation copy..."
                  />
                </div>
              </div>

              {/* Geotargeting parameters */}
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 'bold', textTransform: 'uppercase', color: 'hsl(var(--text-muted))', display: 'block', marginBottom: '8px' }}>
                  📍 Geofencing & Broadcast Containment Scope
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '0.78rem', color: 'hsl(var(--text-muted))', display: 'block', marginBottom: '4px' }}>City / Pincode</label>
                    <input
                      type="text"
                      value={editedCity}
                      onChange={(e) => setEditedCity(e.target.value)}
                      disabled={selectedRumor.status !== 'pending' || actionLoading}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: '1px solid rgba(255,255,255,0.08)',
                        background: 'rgba(255,255,255,0.02)',
                        color: 'hsl(var(--text-primary))',
                        fontSize: '0.85rem'
                      }}
                      placeholder="e.g. Sector 5"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.78rem', color: 'hsl(var(--text-muted))', display: 'block', marginBottom: '4px' }}>District</label>
                    <input
                      type="text"
                      value={editedDistrict}
                      onChange={(e) => setEditedDistrict(e.target.value)}
                      disabled={selectedRumor.status !== 'pending' || actionLoading}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: '1px solid rgba(255,255,255,0.08)',
                        background: 'rgba(255,255,255,0.02)',
                        color: 'hsl(var(--text-primary))',
                        fontSize: '0.85rem'
                      }}
                      placeholder="e.g. Pune"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.78rem', color: 'hsl(var(--text-muted))', display: 'block', marginBottom: '4px' }}>State</label>
                    <input
                      type="text"
                      value={editedState}
                      onChange={(e) => setEditedState(e.target.value)}
                      disabled={selectedRumor.status !== 'pending' || actionLoading}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: '1px solid rgba(255,255,255,0.08)',
                        background: 'rgba(255,255,255,0.02)',
                        color: 'hsl(var(--text-primary))',
                        fontSize: '0.85rem'
                      }}
                      placeholder="e.g. Maharashtra"
                    />
                  </div>
                </div>
              </div>

              {/* Channels preference checkbox */}
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 'bold', textTransform: 'uppercase', color: 'hsl(var(--text-muted))', display: 'block', marginBottom: '8px' }}>
                  📡 Broadcast Channels
                </label>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  {['voice', 'sms', 'email', 'telegram', 'push', 'website'].map(ch => (
                    <button
                      key={ch}
                      onClick={() => toggleChannel(ch)}
                      disabled={selectedRumor.status !== 'pending' || actionLoading}
                      className={`btn ${selectedChannels.includes(ch) ? 'btn-primary' : 'btn-secondary'}`}
                      style={{
                        padding: '6px 14px',
                        fontSize: '0.8rem',
                        borderRadius: '8px',
                        textTransform: 'uppercase',
                        opacity: selectedRumor.status !== 'pending' && !selectedChannels.includes(ch) ? 0.3 : 1
                      }}
                    >
                      {ch}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '16px', marginTop: '8px' }}>
                <div style={{ display: 'flex', gap: '12px' }}>
                  {selectedRumor.status === 'pending' && (
                    <button
                      onClick={handleDismiss}
                      disabled={actionLoading}
                      className="btn btn-secondary"
                      style={{
                        background: 'rgba(239, 68, 68, 0.08)',
                        color: '#ef4444',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '8px',
                        padding: '10px 20px',
                        fontSize: '0.9rem'
                      }}
                    >
                      Dismiss & Archive
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  {selectedRumor.status === 'pending' && (
                    <>
                      <button
                        onClick={handleUpdateRumorDetails}
                        disabled={actionLoading}
                        className="btn btn-secondary"
                        style={{ padding: '10px 20px', fontSize: '0.9rem', borderRadius: '8px' }}
                      >
                        Save Draft
                      </button>
                      
                      <button
                        onClick={handleNeutralize}
                        disabled={actionLoading}
                        className="btn btn-primary"
                        style={{
                          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                          color: '#ffffff',
                          border: 'none',
                          boxShadow: '0 4px 14px rgba(16, 185, 129, 0.25)',
                          padding: '10px 24px',
                          fontSize: '0.92rem',
                          fontWeight: 'bold',
                          borderRadius: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '16px', height: '16px' }}>
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        </svg>
                        Neutralize & Broadcast Alert
                      </button>
                    </>
                  )}
                </div>
              </div>

            </GlassCard>
          ) : (
            <GlassCard style={{ padding: '32px', minHeight: '550px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0 0 8px', color: 'hsl(var(--text-primary))', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  🛡️ AI Fact Shield Command Room
                </h2>
                <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.9rem', lineHeight: '1.6', margin: 0 }}>
                  A localized rumor containment center. AI monitors community channels, cross-references unverified notifications with official guides, and prepares instant broadcasts.
                </p>
              </div>

              {/* Steps grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: '1.25rem', marginBottom: '8px' }}>🚨</div>
                  <h4 style={{ margin: '0 0 6px', fontSize: '0.9rem', fontWeight: 600 }}>1. Monitor Claims</h4>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'hsl(var(--text-muted))', lineHeight: '1.4' }}>
                    View panic reports flagged in incoming SMS/Voice channels. Higher flame icons denote viral claims.
                  </p>
                </div>

                <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: '1.25rem', marginBottom: '8px' }}>🤖</div>
                  <h4 style={{ margin: '0 0 6px', fontSize: '0.9rem', fontWeight: 600 }}>2. Verify with RAG</h4>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'hsl(var(--text-muted))', lineHeight: '1.4' }}>
                    AI verifies claims by scanning official circulars, documents, and FAQs. It automatically drafts the refutation text.
                  </p>
                </div>

                <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: '1.25rem', marginBottom: '8px' }}>📍</div>
                  <h4 style={{ margin: '0 0 6px', fontSize: '0.9rem', fontWeight: 600 }}>3. Geofence Affected Zone</h4>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'hsl(var(--text-muted))', lineHeight: '1.4' }}>
                    Select targeted locations (City, District, State) to restrict warnings to affected areas and prevent widespread panic.
                  </p>
                </div>

                <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: '1.25rem', marginBottom: '8px' }}>📡</div>
                  <h4 style={{ margin: '0 0 6px', fontSize: '0.9rem', fontWeight: 600 }}>4. Multi-Channel Push</h4>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'hsl(var(--text-muted))', lineHeight: '1.4' }}>
                    Publish and broadcast verified alerts instantly to targeted citizens via Voice Call, Telegram, SMS, and Email.
                  </p>
                </div>
              </div>

              {/* Helper alert card */}
              <div style={{ 
                padding: '24px', 
                borderRadius: '10px', 
                background: 'rgba(56, 189, 248, 0.05)', 
                border: '1px solid rgba(56, 189, 248, 0.15)',
                color: '#38bdf8',
                fontSize: '0.88rem',
                lineHeight: '1.5'
              }}>
                <strong>💡 Tip for Presentation:</strong> Click the <strong>⚡ Seed Demo Data</strong> button in the top right header to instantly load pre-made rumor cards. Select one of the cards on the left panel to open the assessment workspace and try out the neutralization broadcast.
              </div>
            </GlassCard>
          )}
        </div>

      </div>
    </div>
  );
};

export default FactShield;
