import React, { useState, useEffect, useCallback } from 'react';
import GlassCard from '../components/GlassCard';

export default function Feedback({ user, backendUrl, headers, _unreadRepliesCount = 0, setUnreadRepliesCount }) {
  const [activeSubTab, setActiveSubTab] = useState('received'); // 'received', 'submitted', 'emergency', 'dashboard' (mgr/admin)
  const [campaigns, setCampaigns] = useState([]);
  
  // Citizen campaign proposal states
  const [proposedCampaigns, setProposedCampaigns] = useState([]);
  const [loadingProposed, setLoadingProposed] = useState(false);
  
  const [propTitle, setPropTitle] = useState('');
  const [propCategory, setPropCategory] = useState('awareness_drive');
  const [propDesc, setPropDesc] = useState('');
  const [propObjective, setPropObjective] = useState('');
  const [propSubject, setPropSubject] = useState('');
  const [propBody, setPropBody] = useState('');
  const [propChannels, setPropChannels] = useState(['email']);
  const [propScheduledAt, setPropScheduledAt] = useState('');
  
  // AI generation states
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiTone, setAiTone] = useState('friendly');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState('');
  const [submittedFeedback, setSubmittedFeedback] = useState([]);
  const [emergencyContacts, setEmergencyContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [emergencyError, setEmergencyError] = useState('');

  // Feedback form state
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [feedbackType, setFeedbackType] = useState('helpful');
  const [comment, setComment] = useState('');

  // Emergency contact state
  const [emergencySubject, setEmergencySubject] = useState('');
  const [emergencyMessage, setEmergencyMessage] = useState('');
  const [emergencyUrgency, setEmergencyUrgency] = useState('normal');

  // Manager dashboard state
  const [selectedDashboardCampaign, setSelectedDashboardCampaign] = useState(null);
  const [dashboardSummary, setDashboardSummary] = useState(null);
  const [campaignFeedbackList, setCampaignFeedbackList] = useState([]);
  const [mgrLoading, setMgrLoading] = useState(false);

  const isAudience = user.role === 'audience';

  useEffect(() => {
    // If admin or manager, default to dashboard. Else, default to received campaigns list.
    if (!isAudience) {
      setActiveSubTab('dashboard');
    } else {
      setActiveSubTab('received');
    }
  }, [user, isAudience]);

  // Auto-dismiss success and error messages after 6 seconds
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(''), 6000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 8000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  useEffect(() => {
    if (emergencyError) {
      const timer = setTimeout(() => setEmergencyError(''), 10000);
      return () => clearTimeout(timer);
    }
  }, [emergencyError]);

  // Load campaigns available for feedback
  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${backendUrl}/api/feedback/campaigns-available`, { headers });
      if (!res.ok) throw new Error('Failed to load campaigns');
      const data = await res.json();
      setCampaigns(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [backendUrl, headers]);

  // Load user's submitted feedback
  const loadSubmittedFeedback = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${backendUrl}/api/feedback/my`, { headers });
      if (!res.ok) throw new Error('Failed to load submitted feedback');
      const data = await res.json();
      setSubmittedFeedback(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [backendUrl, headers]);

  // Load emergency contacts (own for audience, all for manager)
  const loadEmergencyContacts = useCallback(async () => {
    setLoading(true);
    setEmergencyError('');
    try {
      const res = await fetch(`${backendUrl}/api/emergency-contact`, { headers });
      if (!res.ok) {
        const statusText = res.status === 401 ? 'Session expired. Please log in again.' 
          : res.status === 403 ? 'You do not have permission to view this resource.'
          : res.status >= 500 ? 'Server error. Our team has been notified.'
          : 'Could not load emergency requests. Please check your connection.';
        throw new Error(statusText);
      }
      const data = await res.json();
      
      let combinedData = data;
      if (isAudience) {
        try {
          const queriesRes = await fetch(`${backendUrl}/api/queries`, { headers });
          if (queriesRes.ok) {
            const queriesData = await queriesRes.json();
            const annotatedQueries = queriesData.map(q => ({ ...q, isSupportQuery: true }));
            combinedData = [...data, ...annotatedQueries];
            // Sort by created_at descending
            combinedData.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
          }
        } catch (qErr) {
          console.error("Failed to load support queries:", qErr);
        }
      }
      
      setEmergencyContacts(combinedData);

      if (isAudience) {
        const ackList = JSON.parse(localStorage.getItem('acknowledged_emergencies') || '[]');
        let updated = false;
        combinedData.forEach(ec => {
          const isTargetTab = (activeSubTab === 'emergency' && !ec.isSupportQuery) || (activeSubTab === 'queries' && ec.isSupportQuery);
          if (isTargetTab && ec.status === 'resolved' && ec.admin_reply && !ackList.includes(ec.id)) {
            ackList.push(ec.id);
            updated = true;
          }
        });
        if (updated) {
          localStorage.setItem('acknowledged_emergencies', JSON.stringify(ackList));
        }
        // Recalculate remaining total unread counts
        const remainingUnread = combinedData.filter(ec => ec.status === 'resolved' && ec.admin_reply && !ackList.includes(ec.id));
        if (setUnreadRepliesCount) {
          setUnreadRepliesCount(remainingUnread.length);
        }
      }
    } catch (err) {
      setEmergencyError(err.message || 'Could not load emergency requests. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [backendUrl, headers, isAudience, activeSubTab, setUnreadRepliesCount]);

  // Load dashboard stats for a campaign
  const loadDashboardData = async (campaignId) => {
    setMgrLoading(true);
    setError('');
    try {
      const summaryRes = await fetch(`${backendUrl}/api/feedback/summary/${campaignId}`, { headers });
      const feedbackRes = await fetch(`${backendUrl}/api/feedback/campaign/${campaignId}`, { headers });
      
      if (!summaryRes.ok || !feedbackRes.ok) throw new Error('Failed to load feedback analytics');
      
      const summary = await summaryRes.json();
      const feedbacks = await feedbackRes.json();
      
      setDashboardSummary(summary);
      setCampaignFeedbackList(feedbacks);
    } catch (err) {
      setError(err.message);
    } finally {
      setMgrLoading(false);
    }
  };

  const loadMyProposedCampaigns = useCallback(async () => {
    setLoadingProposed(true);
    try {
      const res = await fetch(`${backendUrl}/api/campaigns/mine`, { headers });
      if (res.ok) {
        setProposedCampaigns(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingProposed(false);
    }
  }, [backendUrl, headers]);

  const handleAIGenerate = async () => {
    if (!aiPrompt.trim()) {
      setAiError('Please enter a prompt instruction for the AI model first.');
      return;
    }
    setAiGenerating(true);
    setAiError('');
    try {
      const res = await fetch(`${backendUrl}/api/ai/generate`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: aiPrompt.trim(),
          category: propCategory,
          channel: propChannels[0] || 'email',
          tone: aiTone
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'AI Content Generation Failed');
      }
      setPropSubject(data.subject || '');
      setPropBody(data.body || '');
      setSuccess('AI generated content successfully filled into custom fields!');
    } catch (err) {
      setAiError(err.message);
    } finally {
      setAiGenerating(false);
    }
  };

  const handleProposalSubmit = async (e) => {
    e.preventDefault();
    if (!propTitle.trim() || !propDesc.trim() || !propSubject.trim() || !propBody.trim()) {
      setError('Please populate Title, Description, Subject, and Body fields before submitting.');
      return;
    }
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${backendUrl}/api/campaigns/propose`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: propTitle.trim(),
          description: propDesc.trim(),
          objective: propObjective.trim(),
          campaign_type: propCategory,
          channel_preferences: propChannels,
          override_channel_preferences: true,
          custom_subject: propSubject.trim(),
          custom_body: propBody.trim(),
          scheduled_at: propScheduledAt ? new Date(propScheduledAt).toISOString() : null
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to submit proposal.');
      }
      setSuccess('Campaign proposal submitted successfully for Administrative Review!');
      
      // Clear form
      setPropTitle('');
      setPropDesc('');
      setPropObjective('');
      setPropSubject('');
      setPropBody('');
      setPropScheduledAt('');
      setAiPrompt('');
      
      // Reload proposals history
      loadMyProposedCampaigns();
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    if (activeSubTab === 'received' && isAudience) {
      loadCampaigns();
    } else if (activeSubTab === 'submitted' && isAudience) {
      loadSubmittedFeedback();
    } else if (activeSubTab === 'emergency' || activeSubTab === 'queries') {
      loadEmergencyContacts();
    } else if (activeSubTab === 'propose' || activeSubTab === 'proposed_campaigns') {
      loadMyProposedCampaigns();
    } else if (activeSubTab === 'dashboard' && !isAudience) {
      loadCampaigns(); // Load all active/completed campaigns to let managers select one
    }
  }, [activeSubTab, isAudience, loadCampaigns, loadSubmittedFeedback, loadEmergencyContacts, loadMyProposedCampaigns]);

  // Submit feedback handler
  const handleFeedbackSubmit = async (e) => {
    e.preventDefault();
    if (!selectedCampaign) return;
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${backendUrl}/api/feedback`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: selectedCampaign.id,
          rating,
          feedback_type: feedbackType,
          comment: comment || null
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to submit feedback');
      
      setSuccess('Thank you! Your feedback has been submitted successfully.');
      setSelectedCampaign(null);
      setComment('');
      setRating(5);
      setFeedbackType('helpful');
      loadCampaigns();
    } catch (err) {
      setError(err.message);
    }
  };

  // Delete feedback handler
  const handleFeedbackDelete = async (fbId) => {
    if (!window.confirm('Are you sure you want to remove this feedback?')) return;
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${backendUrl}/api/feedback/${fbId}`, {
        method: 'DELETE',
        headers
      });
      if (!res.ok) throw new Error('Failed to remove feedback');
      setSuccess('Feedback removed.');
      loadSubmittedFeedback();
    } catch (err) {
      setError(err.message);
    }
  };

  // Submit emergency contact handler
  const handleEmergencySubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
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
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to submit contact request');
      
      setSuccess('Your request has been forwarded to campaign managers. They will contact you shortly.');
      setEmergencySubject('');
      setEmergencyMessage('');
      setEmergencyUrgency('normal');
      loadEmergencyContacts();
    } catch (err) {
      setError(err.message);
    }
  };

  // Update emergency request status (Manager/Admin)
  const handleUpdateEmergencyStatus = async (contactId, status) => {
    setError('');
    try {
      const res = await fetch(`${backendUrl}/api/emergency-contact/${contactId}/status?new_status=${status}`, {
        method: 'PUT',
        headers
      });
      if (!res.ok) {
        const errText = await res.text();
        let errMsg = 'Failed to update status';
        try { errMsg = JSON.parse(errText).detail || errMsg; } catch (_) {}
        throw new Error(errMsg);
      }
      setSuccess(`Status updated to '${status}' successfully.`);
      setTimeout(() => setSuccess(''), 3000);
      loadEmergencyContacts();
    } catch (err) {
      setError(err.message);
    }
  };

  const unreadEmergencyCount = isAudience ? emergencyContacts.filter(
    ec => !ec.isSupportQuery && ec.status === 'resolved' && ec.admin_reply && !JSON.parse(localStorage.getItem('acknowledged_emergencies') || '[]').includes(ec.id)
  ).length : 0;

  const unreadQueriesCount = isAudience ? emergencyContacts.filter(
    ec => ec.isSupportQuery && ec.status === 'resolved' && ec.admin_reply && !JSON.parse(localStorage.getItem('acknowledged_emergencies') || '[]').includes(ec.id)
  ).length : 0;

  const displayedEmergencyContacts = isAudience
    ? emergencyContacts.filter(ec => !ec.isSupportQuery)
    : emergencyContacts;

  const displayedSupportQueries = isAudience
    ? emergencyContacts.filter(ec => ec.isSupportQuery)
    : [];

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      
      {/* Sub Tabs Navigation */}
      <div className="subtabs-scroll-container" style={{ display: 'flex', gap: '10px', marginBottom: '24px', borderBottom: '1px solid var(--border-color-glass)', paddingBottom: '14px', overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }}>
        {isAudience ? (
          <>
            <button 
              onClick={() => setActiveSubTab('received')}
              className={`btn ${activeSubTab === 'received' ? 'btn-primary' : 'btn-dark'}`}
            >
              📬 Received Campaigns
            </button>
            <button 
              onClick={() => setActiveSubTab('submitted')}
              className={`btn ${activeSubTab === 'submitted' ? 'btn-primary' : 'btn-dark'}`}
            >
              ⭐ My Feedback History
            </button>
            <button 
              onClick={() => setActiveSubTab('queries')}
              className={`btn ${activeSubTab === 'queries' ? 'btn-primary' : 'btn-dark'}`}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <span>💬 Chatbot Queries</span>
              {unreadQueriesCount > 0 && (
                <span 
                  style={{ 
                    background: '#ef4444', 
                    color: '#ffffff', 
                    borderRadius: '50%', 
                    width: '18px', 
                    height: '18px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    fontSize: '0.7rem', 
                    fontWeight: '800',
                    lineHeight: '1',
                    boxShadow: '0 2px 4px rgba(239, 68, 68, 0.4)',
                  }}
                >
                  {unreadQueriesCount}
                </span>
              )}
            </button>
            <button 
              onClick={() => setActiveSubTab('emergency')}
              className={`btn ${activeSubTab === 'emergency' ? 'btn-primary' : 'btn-dark'}`}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <span>🚨 Emergency Support</span>
              {unreadEmergencyCount > 0 && (
                <span 
                  style={{ 
                    background: '#ef4444', 
                    color: '#ffffff', 
                    borderRadius: '50%', 
                    width: '18px', 
                    height: '18px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    fontSize: '0.7rem', 
                    fontWeight: '800',
                    lineHeight: '1',
                    boxShadow: '0 2px 4px rgba(239, 68, 68, 0.4)',
                  }}
                >
                  {unreadEmergencyCount}
                </span>
              )}
            </button>
            <button 
              onClick={() => setActiveSubTab('proposed_campaigns')}
              className={`btn ${activeSubTab === 'proposed_campaigns' ? 'btn-primary' : 'btn-dark'}`}
            >
              📢 Propose Campaign
            </button>
          </>
        ) : (
          <>
            <button 
              onClick={() => setActiveSubTab('dashboard')}
              className={`btn ${activeSubTab === 'dashboard' ? 'btn-primary' : 'btn-dark'}`}
            >
              📊 Feedback Sentiment Analytics
            </button>
            <button 
              onClick={() => setActiveSubTab('emergency')}
              className={`btn ${activeSubTab === 'emergency' ? 'btn-primary' : 'btn-dark'}`}
            >
              🚨 Emergency Assistance Requests
            </button>
          </>
        )}
      </div>

      {error && (
        <div className="glass-card danger-text" style={{ padding: '16px', marginBottom: '20px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.05)' }}>
          ⚠️ {error}
        </div>
      )}
      {success && (
        <div className="glass-card success-text" style={{ padding: '16px', marginBottom: '20px', borderRadius: '12px', background: 'rgba(34, 197, 94, 0.05)' }}>
          ✓ {success}
        </div>
      )}

      {/* ─── AUDIENCE: RECEIVED CAMPAIGNS ─── */}
      {activeSubTab === 'received' && isAudience && (
        <div className="animate-fade-in">
          <h3 style={{ marginBottom: '16px', fontWeight: 800 }}>Broadcast Message Hub</h3>
          <p style={{ color: 'hsl(var(--text-muted))', marginBottom: '24px' }}>
            Browse through active and past awareness warnings sent to your devices. Click "Give Feedback" to let organizers know if the message was helpful.
          </p>

          {loading ? (
            <div>Loading inbox...</div>
          ) : campaigns.length === 0 ? (
            <div className="glass-card" style={{ padding: '36px', textAlign: 'center', color: 'hsl(var(--text-muted))' }}>
              🎈 You haven't received any campaigns yet. As soon as warnings are sent, they'll populate here.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
              {campaigns.map(camp => (
                <GlassCard key={camp.id} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '1.4rem' }}>
                        {camp.campaign_type === 'emergency_alert' ? '🚨' : camp.campaign_type === 'awareness_drive' ? '🌾' : '📣'}
                      </span>
                      <h4 style={{ fontWeight: 800, fontSize: '1.15rem' }}>{camp.title}</h4>
                    </div>
                    <span className={`badge ${camp.status === 'completed' ? 'badge-communicator' : 'badge-manager'}`} style={{ textTransform: 'capitalize' }}>
                      {camp.status}
                    </span>
                  </div>

                  <p style={{ fontSize: '0.92rem', color: 'hsl(var(--text-secondary))', lineHeight: 1.5 }}>
                    {camp.description || 'No description provided.'}
                  </p>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px' }}>
                    <span style={{ fontSize: '0.78rem', color: 'hsl(var(--text-muted))' }}>
                      Received: {new Date(camp.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                    </span>
                    
                    {camp.has_feedback ? (
                      <span style={{ color: 'var(--success)', fontSize: '0.86rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        ✓ Feedback Submitted
                      </span>
                    ) : (
                      <button 
                        onClick={() => setSelectedCampaign(camp)} 
                        className="btn btn-primary btn-sm"
                      >
                        ✍ Give Feedback
                      </button>
                    )}
                  </div>
                </GlassCard>
              ))}
            </div>
          )}

          {/* Feedback Form Modal Overlay */}
          {selectedCampaign && (
            <div style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)',
              zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
            }}>
              <GlassCard style={{ width: '100%', maxWidth: '500px', padding: '32px', position: 'relative' }}>
                <button 
                  onClick={() => setSelectedCampaign(null)}
                  style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: 'hsl(var(--text-primary))', fontSize: '1.5rem', cursor: 'pointer' }}
                >
                  &times;
                </button>

                <h4 style={{ fontWeight: 800, fontSize: '1.3rem', marginBottom: '8px' }}>Rate Campaign</h4>
                <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.88rem', marginBottom: '24px' }}>
                  Provide critical sentiment data regarding: <b>{selectedCampaign.title}</b>
                </p>

                <form onSubmit={handleFeedbackSubmit}>
                  {/* Stars rating selection */}
                  <div className="form-group" style={{ textAlign: 'center', marginBottom: '24px' }}>
                    <label className="form-label" style={{ display: 'block', marginBottom: '10px', fontSize: '0.9rem' }}>Overall helpfulness rating</label>
                    <div style={{ display: 'inline-flex', gap: '8px' }}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <span
                          key={star}
                          onMouseEnter={() => setHoverRating(star)}
                          onMouseLeave={() => setHoverRating(0)}
                          onClick={() => setRating(star)}
                          style={{
                            fontSize: '2rem', cursor: 'pointer',
                            color: star <= (hoverRating || rating) ? '#f59e0b' : 'rgba(255, 255, 255, 0.15)',
                            transition: 'transform 0.15s ease, color 0.15s ease',
                            transform: star <= (hoverRating || rating) ? 'scale(1.15)' : 'none'
                          }}
                        >
                          ★
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Feedback Type Pips */}
                  <div className="form-group" style={{ marginBottom: '20px' }}>
                    <label className="form-label">How would you classify this broadcast?</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                      {[
                        { value: 'helpful', label: '👍 Helpful Info' },
                        { value: 'excellent', label: '⭐ Outstanding Alert' },
                        { value: 'not_relevant', label: '🤷 Not Relevant' },
                        { value: 'too_frequent', label: '⏰ Too Frequent' },
                        { value: 'confusing', label: '❓ Confusing Content' }
                      ].map(type => (
                        <div
                          key={type.value}
                          onClick={() => setFeedbackType(type.value)}
                          style={{
                            padding: '6px 12px', borderRadius: '20px', cursor: 'pointer',
                            fontSize: '0.82rem', fontWeight: 650, transition: 'all 0.2s',
                            border: `1.5px solid ${feedbackType === type.value ? 'var(--primary)' : 'rgba(255, 255, 255, 0.08)'}`,
                            background: feedbackType === type.value ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                            color: feedbackType === type.value ? 'var(--text-primary)' : 'var(--text-secondary)'
                          }}
                        >
                          {type.label}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Comments */}
                  <div className="form-group">
                    <label className="form-label">Detailed Suggestions (Optional)</label>
                    <textarea
                      className="form-control"
                      placeholder="Share your thoughts or request modifications..."
                      value={comment}
                      onChange={e => setComment(e.target.value)}
                      rows={3}
                      style={{ width: '100%', resize: 'none' }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '12px', marginTop: '28px' }}>
                    <button type="submit" className="btn btn-primary" style={{ flexGrow: 1, padding: '12px' }}>
                      Submit Feedback
                    </button>
                    <button type="button" className="btn btn-dark" style={{ padding: '12px' }} onClick={() => setSelectedCampaign(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              </GlassCard>
            </div>
          )}
        </div>
      )}

      {/* ─── AUDIENCE: SUBMITTED FEEDBACK HISTORY ─── */}
      {activeSubTab === 'submitted' && isAudience && (
        <div className="animate-fade-in">
          <h3 style={{ marginBottom: '16px', fontWeight: 800 }}>Feedback History Log</h3>
          <p style={{ color: 'hsl(var(--text-muted))', marginBottom: '24px' }}>
            Review feedback reports you have previously dispatched. You can remove records if necessary.
          </p>

          {loading ? (
            <div>Loading submission history...</div>
          ) : submittedFeedback.length === 0 ? (
            <div className="glass-card" style={{ padding: '36px', textAlign: 'center', color: 'hsl(var(--text-muted))' }}>
              ⭐ No feedback entries logged in your system account.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {submittedFeedback.map(fb => (
                <GlassCard key={fb.id} style={{ padding: '20px', position: 'relative' }}>
                  <button 
                    onClick={() => handleFeedbackDelete(fb.id)}
                    style={{ position: 'absolute', top: '16px', right: '16px', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.86rem' }}
                    title="Remove feedback logs"
                  >
                    🗑 Remove
                  </button>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                      <h4 style={{ fontWeight: 800, fontSize: '1.05rem', margin: 0 }}>{fb.campaign_title}</h4>
                      <span style={{ color: '#f59e0b', fontWeight: 'bold', fontSize: '0.92rem' }}>
                        {'★'.repeat(fb.rating)}{'☆'.repeat(5 - fb.rating)}
                      </span>
                    </div>
                    
                    <span style={{
                      fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', width: 'fit-content',
                      background: 'rgba(255,255,255,0.04)', padding: '2px 8px', borderRadius: '4px', color: 'hsl(var(--text-muted))'
                    }}>
                      Classification: {fb.feedback_type.replace('_', ' ')}
                    </span>

                    {fb.comment && (
                      <p style={{ fontSize: '0.9rem', color: 'hsl(var(--text-secondary))', background: 'rgba(0,0,0,0.1)', padding: '10px 14px', borderRadius: '8px', margin: '6px 0 0 0', lineHeight: 1.4 }}>
                        "{fb.comment}"
                      </p>
                    )}

                    <span style={{ fontSize: '0.74rem', color: 'hsl(var(--text-muted))', marginTop: '8px' }}>
                      Submitted on: {new Date(fb.created_at).toLocaleString()}
                    </span>
                  </div>
                </GlassCard>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── AUDIENCE: CHATBOT SUPPORT QUERIES ─── */}
      {activeSubTab === 'queries' && isAudience && (
        <div className="animate-fade-in">
          <h3 style={{ marginBottom: '8px', fontWeight: 800 }}>Chatbot Support Queries</h3>
          <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.88rem', marginBottom: '24px', lineHeight: 1.4 }}>
            Track open chatbot escalations and responses from campaign operators.
          </p>
          
          {loading ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'hsl(var(--text-muted))' }}>
              <div style={{ display: 'inline-block', width: '24px', height: '24px', border: '3px solid rgba(255,255,255,0.1)', borderTop: '3px solid hsl(var(--primary))', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '12px' }}></div>
              <div>Loading chatbot support queries...</div>
            </div>
          ) : emergencyError ? (
            <div className="glass-card" style={{ padding: '28px', textAlign: 'center' }}>
              <div style={{ color: 'var(--danger, #ef4444)', fontSize: '0.92rem', marginBottom: '16px', fontWeight: 605 }}>
                ⚠️ {emergencyError}
              </div>
              <button 
                onClick={loadEmergencyContacts} 
                className="btn btn-primary" 
                style={{ padding: '8px 20px', fontSize: '0.85rem' }}
              >
                🔄 Retry
              </button>
            </div>
          ) : displayedSupportQueries.length === 0 ? (
            <div className="glass-card" style={{ padding: '36px', textAlign: 'center', color: 'hsl(var(--text-muted))' }}>
              💬 No chatbot support queries found.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
              {displayedSupportQueries.map(ec => (
                <GlassCard key={ec.id} style={{ padding: '24px', borderLeft: '4px solid hsl(var(--primary))' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '10px' }}>
                    <div>
                      <h4 style={{ fontWeight: 800, fontSize: '1.05rem', margin: '0 0 4px 0' }}>{ec.subject}</h4>
                      <span style={{ fontSize: '0.74rem', color: 'hsl(var(--text-muted))' }}>
                        Submitted: {new Date(ec.created_at).toLocaleString()}
                      </span>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span className="badge" style={{
                        background: 'rgba(59, 130, 246, 0.12)',
                        color: 'hsl(var(--primary))',
                        border: '1px solid rgba(59, 130, 246, 0.3)'
                      }}>
                        Chatbot Escalation
                      </span>
                      <span className={`badge ${ec.status === 'resolved' ? 'badge-communicator' : 'badge-manager'}`} style={{ textTransform: 'uppercase' }}>
                        {ec.status}
                      </span>
                    </div>
                  </div>

                  <p style={{ fontSize: '0.9rem', color: 'hsl(var(--text-secondary))', lineHeight: 1.5, background: 'rgba(0,0,0,0.1)', padding: '12px', borderRadius: '8px', margin: '10px 0 12px 0' }}>
                    {ec.message}
                  </p>

                  {ec.admin_reply && (
                    <div style={{
                      marginTop: '12px',
                      padding: '12px 14px',
                      borderRadius: '8px',
                      background: 'rgba(59, 130, 246, 0.08)',
                      border: '1px solid rgba(59, 130, 246, 0.15)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      marginBottom: '10px'
                    }}>
                      <span style={{ fontSize: '0.74rem', color: 'hsl(var(--primary))', fontWeight: '800', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        💬 Operator Response:
                      </span>
                      <p style={{ margin: 0, fontSize: '0.88rem', color: 'hsl(var(--text-primary))', lineHeight: 1.4 }}>
                        {ec.admin_reply}
                      </p>
                      {ec.replied_at && (
                        <span style={{ fontSize: '0.68rem', color: 'hsl(var(--text-muted))', alignSelf: 'flex-end', marginTop: '2px' }}>
                          Replied on: {new Date(ec.replied_at).toLocaleString()}
                        </span>
                      )}
                    </div>
                  )}

                  {ec.status === 'resolved' && (
                    <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px', marginTop: '12px' }}>
                      {(!JSON.parse(localStorage.getItem('acknowledged_emergencies') || '[]').includes(ec.id)) ? (
                        <button 
                          onClick={() => {
                            const ackList = JSON.parse(localStorage.getItem('acknowledged_emergencies') || '[]');
                            if (!ackList.includes(ec.id)) {
                              ackList.push(ec.id);
                              localStorage.setItem('acknowledged_emergencies', JSON.stringify(ackList));
                              loadEmergencyContacts();
                            }
                          }}
                          className="btn btn-primary btn-sm"
                          style={{ padding: '6px 12px', fontSize: '0.78rem', background: 'var(--success)', borderColor: 'var(--success)' }}
                        >
                          ✓ Acknowledge Response
                        </button>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: 'bold' }}>✓ Response Acknowledged</span>
                      )}
                    </div>
                  )}
                </GlassCard>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── AUDIENCE & MANAGERS: EMERGENCY SUPPORT CENTER ─── */}
      {activeSubTab === 'emergency' && (
        <div className="animate-fade-in">
          <div style={{ display: 'grid', gridTemplateColumns: isAudience ? '1.1fr 1fr' : '1fr', gap: '32px' }}>
            
            {/* Audience Form */}
            {isAudience && (
              <GlassCard style={{ padding: '32px' }}>
                <h3 style={{ marginBottom: '8px', fontWeight: 800 }}>Submit Urgent Request</h3>
                <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.88rem', marginBottom: '24px', lineHeight: 1.4 }}>
                  In case of urgent emergency evacuations, flood hazards, or critical issues with warnings, write a direct contact request to our active regional operators.
                </p>

                <form onSubmit={handleEmergencySubmit}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: '600' }}>Subject Summary *</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Rising water level in village near river bed"
                      value={emergencySubject}
                      onChange={e => setEmergencySubject(e.target.value)}
                      required
                      style={{ width: '100%', fontSize: '0.95rem' }}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: '600' }}>Urgency Priority</label>
                    <select
                      className="form-control"
                      value={emergencyUrgency}
                      onChange={e => setEmergencyUrgency(e.target.value)}
                      style={{ width: '100%', fontSize: '0.95rem' }}
                    >
                      <option value="normal">🟢 Normal Priority</option>
                      <option value="urgent">🟡 Urgent Assistance</option>
                      <option value="critical">🔴 Critical Emergency</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: '600' }}>Detailed Message Description *</label>
                    <textarea
                      className="form-control"
                      placeholder="Explain your situation in detail. Provide location, landmark and number of affected people if applicable..."
                      value={emergencyMessage}
                      onChange={e => setEmergencyMessage(e.target.value)}
                      required
                      rows={5}
                      style={{ width: '100%', resize: 'none' }}
                    />
                  </div>

                  <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '12px', marginTop: '16px' }}>
                    Send Emergency Message
                  </button>
                </form>
              </GlassCard>
            )}

            {/* Support history / Manager queue */}
            <div>
              <h3 style={{ marginBottom: '8px', fontWeight: 800 }}>
                {isAudience ? 'My Support Requests' : 'Operator Support Assistance Queue'}
              </h3>
              <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.88rem', marginBottom: '24px', lineHeight: 1.4 }}>
                {isAudience 
                  ? 'Track open helpdesk coordinates and responses from active officials.' 
                  : 'Review direct messages sent by citizen profiles. Acknowledge and mark resolved to update logs.'}
              </p>

              {loading ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'hsl(var(--text-muted))' }}>
                  <div style={{ display: 'inline-block', width: '24px', height: '24px', border: '3px solid rgba(255,255,255,0.1)', borderTop: '3px solid hsl(var(--primary))', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '12px' }}></div>
                  <div>Loading support requests...</div>
                </div>
              ) : emergencyError ? (
                <div className="glass-card" style={{ padding: '28px', textAlign: 'center' }}>
                  <div style={{ color: 'var(--danger, #ef4444)', fontSize: '0.92rem', marginBottom: '16px', fontWeight: 600 }}>
                    ⚠️ {emergencyError}
                  </div>
                  <button 
                    onClick={loadEmergencyContacts} 
                    className="btn btn-primary" 
                    style={{ padding: '8px 20px', fontSize: '0.85rem' }}
                  >
                    🔄 Retry
                  </button>
                </div>
              ) : displayedEmergencyContacts.length === 0 ? (
                <div className="glass-card" style={{ padding: '36px', textAlign: 'center', color: 'hsl(var(--text-muted))' }}>
                  📪 Support queue is currently empty.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {displayedEmergencyContacts.map(ec => {
                    const isSupport = ec.isSupportQuery;
                    const isUrgent = !isSupport && ec.urgency === 'urgent';
                    const isCritical = !isSupport && ec.urgency === 'critical';
                    
                    return (
                      <GlassCard key={ec.id} style={{ padding: '20px', borderLeft: `4px solid ${isSupport ? 'hsl(var(--primary))' : isCritical ? 'var(--danger)' : isUrgent ? 'var(--warning)' : 'var(--success)'}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '10px' }}>
                          <div>
                            <h4 style={{ fontWeight: 800, fontSize: '1rem', margin: '0 0 4px 0' }}>{ec.subject}</h4>
                            <span style={{ fontSize: '0.74rem', color: 'hsl(var(--text-muted))' }}>
                              From: <b>{ec.user_name}</b> · {new Date(ec.created_at).toLocaleString()}
                            </span>
                          </div>
                          
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            {isSupport ? (
                              <span className="badge" style={{
                                background: 'rgba(59, 130, 246, 0.12)',
                                color: 'hsl(var(--primary))',
                                border: '1px solid rgba(59, 130, 246, 0.3)'
                              }}>
                                Support Query
                              </span>
                            ) : (
                              <span className="badge" style={{
                                background: isCritical ? 'rgba(239, 68, 68, 0.12)' : isUrgent ? 'rgba(245, 158, 11, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                                color: isCritical ? 'var(--danger)' : isUrgent ? 'var(--warning)' : 'var(--success)'
                              }}>
                                {ec.urgency.toUpperCase()}
                              </span>
                            )}
                            <span className={`badge ${ec.status === 'resolved' ? 'badge-communicator' : 'badge-manager'}`} style={{ textTransform: 'uppercase' }}>
                              {ec.status}
                            </span>
                          </div>
                        </div>

                        <p style={{ fontSize: '0.9rem', color: 'hsl(var(--text-secondary))', lineHeight: 1.5, background: 'var(--border-color-glass)', padding: '12px', borderRadius: '8px', margin: '10px 0 12px 0' }}>
                          {ec.message}
                        </p>

                        {ec.admin_reply && (
                          <div style={{
                            marginTop: '12px',
                            padding: '12px 14px',
                            borderRadius: '8px',
                            background: 'rgba(59, 130, 246, 0.08)',
                            border: '1px solid rgba(59, 130, 246, 0.15)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                            marginBottom: '10px'
                          }}>
                            <span style={{ fontSize: '0.74rem', color: 'hsl(var(--primary))', fontWeight: '800', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              💬 Official Response:
                            </span>
                            <p style={{ margin: 0, fontSize: '0.88rem', color: 'hsl(var(--text-primary))', lineHeight: 1.4 }}>
                              {ec.admin_reply}
                            </p>
                            {ec.replied_at && (
                              <span style={{ fontSize: '0.68rem', color: 'hsl(var(--text-muted))', alignSelf: 'flex-end', marginTop: '2px' }}>
                                Replied on: {new Date(ec.replied_at).toLocaleString()}
                              </span>
                            )}
                          </div>
                        )}

                        {isAudience && ec.status === 'resolved' && (
                          <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--border-color-glass)', paddingTop: '12px', marginTop: '12px' }}>
                            {(!JSON.parse(localStorage.getItem('acknowledged_emergencies') || '[]').includes(ec.id)) ? (
                              <button 
                                onClick={() => {
                                  const ackList = JSON.parse(localStorage.getItem('acknowledged_emergencies') || '[]');
                                  if (!ackList.includes(ec.id)) {
                                    ackList.push(ec.id);
                                    localStorage.setItem('acknowledged_emergencies', JSON.stringify(ackList));
                                    loadEmergencyContacts();
                                  }
                                }}
                                className="btn btn-primary btn-sm"
                                style={{ padding: '6px 12px', fontSize: '0.78rem', background: 'var(--success)', borderColor: 'var(--success)' }}
                              >
                                {isSupport ? '✓ Acknowledge Response' : '✓ Acknowledge & Clear Notification Badge'}
                              </button>
                            ) : (
                              <span style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: 'bold' }}>✓ Response Acknowledged</span>
                            )}
                          </div>
                        )}

                        {!isAudience && ec.status !== 'resolved' && (
                          <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--border-color-glass)', paddingTop: '12px' }}>
                            {ec.status === 'open' && (
                              <button 
                                onClick={() => handleUpdateEmergencyStatus(ec.id, 'acknowledged')}
                                className="btn btn-dark btn-sm"
                                style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                              >
                                🤝 Acknowledge
                              </button>
                            )}
                            <button 
                              onClick={() => handleUpdateEmergencyStatus(ec.id, 'resolved')}
                              className="btn btn-primary btn-sm"
                              style={{ padding: '4px 10px', fontSize: '0.78rem', background: 'var(--success)', borderColor: 'var(--success)' }}
                            >
                              ✓ Mark Resolved
                            </button>
                          </div>
                        )}
                      </GlassCard>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── CITIZENS: PROPOSE CAMPAIGNS & HISTORY ─── */}
      {activeSubTab === 'proposed_campaigns' && isAudience && (
        <div className="animate-fade-in">
          <h3 style={{ marginBottom: '8px', fontWeight: 800 }}>Propose Awareness Campaign</h3>
          <p style={{ color: 'hsl(var(--text-muted))', marginBottom: '24px' }}>
            Submit a proposal for a public welfare or educational campaign. Administrators will review and schedule approved proposals.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', alignItems: 'start' }}>
            
            {/* Left side: Proposal Form */}
            <GlassCard style={{ padding: '24px' }}>
              <h4 style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: '16px', color: 'var(--primary)' }}>Campaign Details</h4>
              <form onSubmit={handleProposalSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>Campaign Title</label>
                  <input
                    type="text"
                    className="text-input"
                    value={propTitle}
                    onChange={(e) => setPropTitle(e.target.value)}
                    placeholder="e.g. Clean Drinking Water Hygiene Drive"
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>Category Type</label>
                    <select
                      className="text-input"
                      value={propCategory}
                      onChange={(e) => setPropCategory(e.target.value)}
                      style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                    >
                      <option value="awareness_drive">Awareness Drive</option>
                      <option value="emergency_alert">Emergency Alert</option>
                      <option value="educational_notification">Educational Notification</option>
                      <option value="organizational_announcement">Announcement</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>Preferred Channels</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                      {['email', 'sms', 'voice', 'telegram'].map(ch => (
                        <label key={ch} style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={propChannels.includes(ch)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setPropChannels([...propChannels, ch]);
                              } else {
                                setPropChannels(propChannels.filter(c => c !== ch));
                              }
                            }}
                          />
                          <span style={{ textTransform: 'capitalize' }}>{ch}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>Description & Purpose</label>
                  <textarea
                    rows={2}
                    className="text-input"
                    value={propDesc}
                    onChange={(e) => setPropDesc(e.target.value)}
                    placeholder="Describe the target problem and who will benefit..."
                    required
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>Campaign Objective</label>
                  <input
                    type="text"
                    className="text-input"
                    value={propObjective}
                    onChange={(e) => setPropObjective(e.target.value)}
                    placeholder="e.g. Educate 500 households on water filters."
                  />
                </div>

                {/* AI Content Generator Sub-panel */}
                <div style={{ padding: '16px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', marginTop: '4px' }}>
                  <h5 style={{ margin: '0 0 8px 0', fontSize: '0.88rem', fontWeight: 700, color: 'hsl(var(--primary))', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    ✨ AI Message Copy Generator (Groq Powered)
                  </h5>
                  <p style={{ margin: '0 0 12px 0', fontSize: '0.78rem', color: 'hsl(var(--text-muted))' }}>
                    Provide instructions, select a tone, and auto-generate subjects & body text instantly.
                  </p>
                  
                  {aiError && (
                    <div className="alert alert-danger" style={{ padding: '8px 12px', fontSize: '0.75rem', marginBottom: '8px' }}>
                      ⚠️ {aiError}
                    </div>
                  )}

                  <div style={{ marginBottom: '10px' }}>
                    <textarea
                      rows={2}
                      className="text-input"
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      placeholder="Prompt instructions, e.g. Write a friendly notification warning citizens about water filter installation..."
                      style={{ fontSize: '0.8rem' }}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))' }}>Tone:</span>
                      <select
                        className="text-input"
                        value={aiTone}
                        onChange={(e) => setAiTone(e.target.value)}
                        style={{ fontSize: '0.75rem', padding: '2px 6px', width: '110px', background: '#1e293b', color: '#fff' }}
                      >
                        <option value="friendly">Friendly</option>
                        <option value="urgent">Urgent</option>
                        <option value="professional">Professional</option>
                        <option value="persuasive">Persuasive</option>
                        <option value="direct">Direct</option>
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={handleAIGenerate}
                      disabled={aiGenerating}
                      className="btn btn-primary btn-sm"
                      style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                    >
                      {aiGenerating ? 'Generating Copy...' : '⚡ Generate Campaign Copy'}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>Proposed Message Subject</label>
                  <input
                    type="text"
                    className="text-input"
                    value={propSubject}
                    onChange={(e) => setPropSubject(e.target.value)}
                    placeholder="Generated or custom subject text..."
                    required
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>Proposed Message Body</label>
                  <textarea
                    rows={4}
                    className="text-input"
                    value={propBody}
                    onChange={(e) => setPropBody(e.target.value)}
                    placeholder="Generated or custom message body copy details..."
                    required
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>Desired Launch Date (Optional)</label>
                  <input
                    type="datetime-local"
                    className="text-input"
                    value={propScheduledAt}
                    onChange={(e) => setPropScheduledAt(e.target.value)}
                  />
                </div>

                <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '12px', fontWeight: 'bold', fontSize: '0.92rem', marginTop: '8px' }}>
                  🚀 Propose Awareness Campaign
                </button>
              </form>
            </GlassCard>

            {/* Right side: History Queue */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <GlassCard style={{ padding: '24px' }}>
                <h4 style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: '16px' }}>My Proposal History</h4>
                {loadingProposed && proposedCampaigns.length === 0 ? (
                  <p style={{ color: 'hsl(var(--text-muted))' }}>Scanning proposals...</p>
                ) : proposedCampaigns.length === 0 ? (
                  <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.88rem' }}>No campaign proposals submitted yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '600px', overflowY: 'auto' }}>
                    {proposedCampaigns.map(camp => {
                      let badgeColor = 'rgba(245, 158, 11, 0.15)';
                      let badgeText = 'Pending Review';
                      let textColor = '#f59e0b';
                      
                      if (camp.status === 'draft' || camp.status === 'scheduled') {
                        badgeColor = 'rgba(16, 185, 129, 0.15)';
                        badgeText = 'Approved';
                        textColor = '#10b981';
                      } else if (camp.status === 'rejected') {
                        badgeColor = 'rgba(239, 68, 68, 0.15)';
                        badgeText = 'Rejected';
                        textColor = '#ef4444';
                      }

                      return (
                        <div
                          key={camp.id}
                          style={{
                            padding: '16px',
                            background: 'rgba(255,255,255,0.01)',
                            border: '1px solid rgba(255,255,255,0.04)',
                            borderRadius: '10px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <strong style={{ fontSize: '0.95rem' }}>{camp.title}</strong>
                            <span style={{ fontSize: '0.74rem', padding: '2px 8px', borderRadius: '4px', background: badgeColor, color: textColor, fontWeight: 'bold' }}>
                              {badgeText}
                            </span>
                          </div>
                          
                          <p style={{ margin: 0, fontSize: '0.82rem', color: 'hsl(var(--text-muted))', lineHeight: '1.4' }}>
                            {camp.description}
                          </p>

                          <div style={{ fontSize: '0.78rem', display: 'flex', gap: '12px', color: 'hsl(var(--text-muted))', marginTop: '4px' }}>
                            <span>Category: <b style={{ textTransform: 'capitalize' }}>{camp.campaign_type.replace('_', ' ')}</b></span>
                            <span>Channels: <b>{camp.channel_preferences.join(', ')}</b></span>
                          </div>

                          {camp.review_remark && (
                            <div style={{ 
                              marginTop: '8px', 
                              padding: '10px 12px', 
                              background: camp.status === 'rejected' ? 'rgba(239, 68, 68, 0.04)' : 'rgba(255,255,255,0.02)', 
                              borderLeft: `3px solid ${camp.status === 'rejected' ? '#ef4444' : 'var(--primary)'}`,
                              borderRadius: '4px',
                              fontSize: '0.8rem' 
                            }}>
                              <span style={{ display: 'block', fontWeight: 'bold', marginBottom: '2px', color: 'hsl(var(--text-secondary))' }}>Reviewer Remark Note:</span>
                              <span style={{ color: 'hsl(var(--text-muted))', fontStyle: 'italic' }}>{camp.review_remark}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </GlassCard>
            </div>
          </div>
        </div>
      )}

      {/* ─── MANAGERS/ADMINS: FEEDBACK ANALYTICS DASHBOARD ─── */}
      {activeSubTab === 'dashboard' && !isAudience && (
        <div className="animate-fade-in">
          <h3 style={{ marginBottom: '8px', fontWeight: 800 }}>Campaign Outreach Insights</h3>
          <p style={{ color: 'hsl(var(--text-muted))', marginBottom: '24px' }}>
            Select an active or completed warning campaign to check citizen sentiment reviews.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '32px', alignItems: 'start' }}>
            
            {/* Campaigns Sidebar */}
            <GlassCard style={{ padding: '20px' }}>
              <h4 style={{ fontWeight: 800, fontSize: '1.05rem', marginBottom: '16px' }}>Campaigns List</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '450px', overflowY: 'auto' }}>
                {campaigns.map(c => {
                  const isSelected = selectedDashboardCampaign?.id === c.id;
                  return (
                    <div
                      key={c.id}
                      onClick={() => {
                        setSelectedDashboardCampaign(c);
                        loadDashboardData(c.id);
                      }}
                      style={{
                        padding: '12px 14px', borderRadius: '10px', cursor: 'pointer',
                        background: isSelected ? 'rgba(59, 130, 246, 0.1)' : 'rgba(255,255,255,0.01)',
                        border: `1.5px solid ${isSelected ? 'var(--primary)' : 'rgba(255,255,255,0.05)'}`,
                        transition: 'all 0.2s'
                      }}
                    >
                      <div style={{ fontWeight: '700', fontSize: '0.88rem', color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                        {c.title}
                      </div>
                      <div style={{ fontSize: '0.74rem', color: 'hsl(var(--text-muted))', marginTop: '4px' }}>
                        Status: <b style={{ textTransform: 'capitalize' }}>{c.status}</b>
                      </div>
                    </div>
                  );
                })}
              </div>
            </GlassCard>

            {/* Dashboard Content */}
            <div>
              {mgrLoading ? (
                <div>Loading analytical summary data...</div>
              ) : !selectedDashboardCampaign ? (
                <div className="glass-card" style={{ padding: '40px', textAlign: 'center', color: 'hsl(var(--text-muted))' }}>
                  📊 Click on a campaign from the sidebar to visualize rating parameters and audit suggestions.
                </div>
              ) : !dashboardSummary ? (
                <div>No summary details returned for selected campaign.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  
                  {/* Stats Row */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                    <GlassCard style={{ padding: '20px', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.78rem', color: 'hsl(var(--text-muted))', fontWeight: 700, textTransform: 'uppercase', marginBottom: '8px' }}>Total Reviews</div>
                      <div style={{ fontSize: '2.2rem', fontWeight: 900, color: 'var(--primary)' }}>{dashboardSummary.total_feedback}</div>
                    </GlassCard>
                    <GlassCard style={{ padding: '20px', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.78rem', color: 'hsl(var(--text-muted))', fontWeight: 700, textTransform: 'uppercase', marginBottom: '8px' }}>Average Rating</div>
                      <div style={{ fontSize: '2.2rem', fontWeight: 900, color: '#f59e0b' }}>
                        {dashboardSummary.average_rating} <span style={{ fontSize: '1.2rem' }}>★</span>
                      </div>
                    </GlassCard>
                    <GlassCard style={{ padding: '20px', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.78rem', color: 'hsl(var(--text-muted))', fontWeight: 700, textTransform: 'uppercase', marginBottom: '8px' }}>Helpfulness Ratio</div>
                      <div style={{ fontSize: '2.2rem', fontWeight: 900, color: 'var(--success)' }}>
                        {dashboardSummary.total_feedback > 0 
                          ? `${Math.round(((dashboardSummary.type_distribution.helpful + dashboardSummary.type_distribution.excellent) / dashboardSummary.total_feedback) * 100)}%` 
                          : '0%'}
                      </div>
                    </GlassCard>
                  </div>

                  {/* Rating Distribution and Feedback Types Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    
                    <GlassCard style={{ padding: '24px' }}>
                      <h4 style={{ fontWeight: 800, fontSize: '1rem', marginBottom: '16px' }}>Rating Parameter Grid</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {[5, 4, 3, 2, 1].map(stars => {
                          const count = dashboardSummary.rating_distribution[stars.toString()] || 0;
                          const pct = dashboardSummary.total_feedback > 0 ? (count / dashboardSummary.total_feedback) * 100 : 0;
                          
                          return (
                            <div key={stars} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{ fontSize: '0.86rem', color: 'hsl(var(--text-secondary))', width: '40px', fontWeight: 650 }}>{stars} Star</span>
                              <div style={{ flexGrow: 1, height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{ width: `${pct}%`, height: '100%', background: '#f59e0b', borderRadius: '4px' }}></div>
                              </div>
                              <span style={{ fontSize: '0.82rem', color: 'hsl(var(--text-muted))', width: '30px', textAlign: 'right' }}>{count}</span>
                            </div>
                          );
                        })}
                      </div>
                    </GlassCard>

                    <GlassCard style={{ padding: '24px' }}>
                      <h4 style={{ fontWeight: 800, fontSize: '1rem', marginBottom: '16px' }}>Sentiment Classification Breakdown</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {Object.entries(dashboardSummary.type_distribution).map(([type, count]) => {
                          const pct = dashboardSummary.total_feedback > 0 ? (count / dashboardSummary.total_feedback) * 100 : 0;
                          return (
                            <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{ fontSize: '0.86rem', color: 'hsl(var(--text-secondary))', width: '100px', fontWeight: 650, textTransform: 'capitalize' }}>
                                {type.replace('_', ' ')}
                              </span>
                              <div style={{ flexGrow: 1, height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{ width: `${pct}%`, height: '100%', background: 'var(--primary)', borderRadius: '4px' }}></div>
                              </div>
                              <span style={{ fontSize: '0.82rem', color: 'hsl(var(--text-muted))', width: '30px', textAlign: 'right' }}>{count}</span>
                            </div>
                          );
                        })}
                      </div>
                    </GlassCard>

                  </div>

                  {/* Reviews Feed */}
                  <GlassCard style={{ padding: '24px' }}>
                    <h4 style={{ fontWeight: 800, fontSize: '1.05rem', marginBottom: '20px' }}>Reviews and Submissions Feed</h4>
                    
                    {campaignFeedbackList.length === 0 ? (
                      <div style={{ textAlign: 'center', color: 'hsl(var(--text-muted))', padding: '20px' }}>
                        No reviews logged yet.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {campaignFeedbackList.map(item => (
                          <div key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '6px' }}>
                              <div>
                                <span style={{ fontWeight: '700', fontSize: '0.9rem' }}>{item.user_name}</span>
                                <span style={{ fontSize: '0.72rem', color: 'hsl(var(--text-muted))', marginLeft: '10px' }}>
                                  {new Date(item.created_at).toLocaleString()}
                                </span>
                              </div>
                              <span style={{ color: '#f59e0b', fontSize: '0.84rem' }}>
                                {'★'.repeat(item.rating)}{'☆'.repeat(5 - item.rating)}
                              </span>
                            </div>
                            
                            <span style={{
                              fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase',
                              background: 'rgba(59,130,246,0.1)', color: 'var(--primary)', padding: '1px 6px', borderRadius: '3px'
                            }}>
                              {item.feedback_type.replace('_', ' ')}
                            </span>

                            {item.comment && (
                              <p style={{ fontSize: '0.88rem', color: 'hsl(var(--text-secondary))', lineHeight: 1.4, margin: '8px 0 0 0' }}>
                                "{item.comment}"
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </GlassCard>

                </div>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
