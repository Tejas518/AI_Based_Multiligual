import React, { useState, useEffect, useCallback } from 'react';
import GlassCard from '../components/GlassCard';

const EmergencyInbox = ({ user, backendUrl, headers }) => {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('open'); // default to 'open' (Remaining)
  const [filterUrgency, setFilterUrgency] = useState('');
  const [message, setMessage] = useState(null);
  
  // State for typing replies
  const [replyTexts, setReplyTexts] = useState({});
  const [replyStatuses, setReplyStatuses] = useState({});
  const [generatingAI, setGeneratingAI] = useState({});

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      let url = `${backendUrl}/api/emergency-contact`;
      if (filterStatus && filterStatus !== 'all') {
        url += `?status_filter=${filterStatus}`;
      }
      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error('Failed to load emergency contacts');
      let data = await response.json();

      // Apply client-side search if any
      if (search) {
        const query = search.toLowerCase();
        data = data.filter(c => 
          c.subject.toLowerCase().includes(query) || 
          c.message.toLowerCase().includes(query) ||
          (c.user_name && c.user_name.toLowerCase().includes(query))
        );
      }

      // Apply client-side urgency filter if any
      if (filterUrgency) {
        data = data.filter(c => c.urgency === filterUrgency);
      }

      setContacts(data);
      setMessage(prev => (prev && prev.text === 'Error loading emergency queue.' ? null : prev));
    } catch (err) {
      console.error(err);
      setMessage({ text: 'Error loading emergency queue.', type: 'danger' });
    } finally {
      setLoading(false);
    }
  }, [backendUrl, headers, filterStatus, filterUrgency, search]);

  useEffect(() => {
    fetchContacts();
    // Poll every 10 seconds for real-time notifications
    const interval = setInterval(fetchContacts, 10000);
    return () => clearInterval(interval);
  }, [fetchContacts]);

  const handleSendReply = async (contactId) => {
    const text = replyTexts[contactId]?.trim();
    if (!text) {
      alert('Please enter a response message before sending.');
      return;
    }

    const nextStatus = replyStatuses[contactId] || 'resolved'; // default to resolved when replied

    try {
      const response = await fetch(`${backendUrl}/api/emergency-contact/${contactId}/reply`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_reply: text,
          status: nextStatus
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Failed to send reply');
      }

      setMessage({ text: 'Reply sent successfully. Request updated.', type: 'success' });
      // Clear reply box
      setReplyTexts(prev => ({ ...prev, [contactId]: '' }));
      fetchContacts();
    } catch (err) {
      setMessage({ text: err.message, type: 'danger' });
    }
  };

  const handleGenerateAIDraft = async (contactId) => {
    setGeneratingAI(prev => ({ ...prev, [contactId]: true }));
    try {
      const response = await fetch(`${backendUrl}/api/emergency-contact/${contactId}/generate-draft`, {
        method: 'POST',
        headers: { ...headers }
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate AI response');
      }
      
      const data = await response.json();
      setReplyTexts(prev => ({ ...prev, [contactId]: data.draft }));
      setMessage({ text: 'AI response drafted. You can review and edit before sending.', type: 'success' });
    } catch (err) {
      console.error(err);
      setMessage({ text: err.message, type: 'danger' });
    } finally {
      setGeneratingAI(prev => ({ ...prev, [contactId]: false }));
    }
  };

  const getUrgencyBadge = (urgency) => {
    switch (urgency) {
      case 'critical':
        return <span className="badge" style={{ background: 'rgba(239, 68, 68, 0.12)', color: 'hsl(var(--danger))', border: '1px solid rgba(239, 68, 68, 0.3)' }}>Critical</span>;
      case 'urgent':
        return <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.12)', color: 'hsl(var(--warning))', border: '1px solid rgba(245, 158, 11, 0.3)' }}>Urgent</span>;
      default:
        return <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.12)', color: 'hsl(var(--primary))', border: '1px solid rgba(59, 130, 246, 0.3)' }}>Normal</span>;
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'resolved':
        return <span className="badge" style={{ background: 'rgba(34, 197, 94, 0.12)', color: 'hsl(var(--accent))', border: '1px solid rgba(34, 197, 94, 0.3)' }}>Replied / Resolved</span>;
      case 'acknowledged':
        return <span className="badge" style={{ background: 'rgba(168, 85, 247, 0.12)', color: 'hsl(var(--secondary))', border: '1px solid rgba(168, 85, 247, 0.3)' }}>Acknowledged</span>;
      default:
        return <span className="badge" style={{ background: 'rgba(239, 68, 68, 0.12)', color: 'hsl(var(--danger))', border: '1px solid rgba(239, 68, 68, 0.3)' }}>Remaining (Open)</span>;
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <p style={{ color: 'hsl(var(--text-secondary))' }}>
            Monitor and respond to direct emergency requests submitted by citizen profiles in real-time.
          </p>
        </div>
      </div>

      {message && (
        <div 
          className="glass-card animate-fade-in" 
          style={{ 
            padding: '12px 16px', 
            marginBottom: '20px', 
            fontSize: '0.88rem', 
            background: message.type === 'danger' ? 'rgba(239, 68, 68, 0.06)' : 'rgba(34, 197, 94, 0.06)',
            border: `1px solid ${message.type === 'danger' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)'}`,
            borderRadius: '12px',
            color: message.type === 'danger' ? 'hsl(var(--danger))' : 'hsl(var(--accent))'
          }}
        >
          {message.text}
        </div>
      )}

      {/* Filters */}
      <GlassCard style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
          <input
            type="text"
            className="form-control"
            placeholder="Search by citizen name, subject, message content..."
            style={{ minWidth: '280px', flexGrow: 1 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="form-control" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="open">Remaining (Open)</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="resolved">Replied / Resolved</option>
          </select>
          <select className="form-control" value={filterUrgency} onChange={(e) => setFilterUrgency(e.target.value)}>
            <option value="">All urgencies</option>
            <option value="critical">Critical</option>
            <option value="urgent">Urgent</option>
            <option value="normal">Normal</option>
          </select>
          <button className="btn btn-dark" onClick={fetchContacts} style={{ padding: '8px 16px' }}>
            Refresh
          </button>
        </div>
      </GlassCard>

      {/* Queue items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {loading && contacts.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'hsl(var(--text-secondary))' }}>
            Loading emergency queue...
          </div>
        ) : contacts.length === 0 ? (
          <GlassCard style={{ padding: '32px', textAlign: 'center', color: 'hsl(var(--text-muted))' }}>
            No matching emergency requests found in this view.
          </GlassCard>
        ) : (
          contacts.map(c => {
            const isResolved = c.status === 'resolved';
            return (
              <GlassCard 
                key={c.id} 
                style={{ 
                  padding: '24px', 
                  borderLeft: `4px solid ${c.urgency === 'critical' ? 'hsl(var(--danger))' : c.urgency === 'urgent' ? 'hsl(var(--warning))' : 'hsl(var(--primary))'}`
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                  <div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '800', margin: '0 0 6px 0', color: 'hsl(var(--text-primary))' }}>
                      {c.subject}
                    </h3>
                    <span style={{ fontSize: '0.82rem', color: 'hsl(var(--text-muted))', fontWeight: '500' }}>
                      Submitted by: <span style={{ color: 'hsl(var(--text-secondary))', fontWeight: '600' }}>{c.user_name}</span> · {new Date(c.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {getUrgencyBadge(c.urgency)}
                    {getStatusBadge(c.status)}
                  </div>
                </div>

                <div 
                  style={{ 
                    fontSize: '0.92rem', 
                    color: 'hsl(var(--text-secondary))', 
                    lineHeight: 1.55, 
                    background: 'rgba(255, 255, 255, 0.02)', 
                    padding: '16px', 
                    borderRadius: '10px', 
                    margin: '12px 0 16px 0',
                    border: '1px solid rgba(255, 255, 255, 0.04)'
                  }}
                >
                  {c.message}
                </div>

                {/* Display Official Response if already replied */}
                {c.admin_reply && (
                  <div 
                    style={{ 
                      fontSize: '0.92rem', 
                      lineHeight: 1.55, 
                      background: 'rgba(34, 197, 94, 0.03)', 
                      padding: '16px', 
                      borderRadius: '10px', 
                      margin: '0 0 16px 0',
                      border: '1px solid rgba(34, 197, 94, 0.1)'
                    }}
                  >
                    <div style={{ fontWeight: '700', color: 'hsl(var(--accent))', marginBottom: '4px', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Official Reply (Sent {c.replied_at ? new Date(c.replied_at).toLocaleString() : ''})
                    </div>
                    <div style={{ color: 'hsl(var(--text-secondary))' }}>
                      {c.admin_reply}
                    </div>
                  </div>
                )}

                {/* Reply Form */}
                <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '16px', marginTop: '16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={{ fontSize: '0.85rem', fontWeight: '700', color: 'hsl(var(--text-muted))', margin: 0 }}>
                        {isResolved ? 'Update Official Response' : 'Write Official Response'}
                      </label>
                      <button 
                        className="btn" 
                        style={{ 
                          fontSize: '0.8rem', 
                          padding: '6px 14px', 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '6px',
                          background: 'rgba(59, 130, 246, 0.15)',
                          color: '#60a5fa',
                          border: '1px solid rgba(59, 130, 246, 0.4)',
                          borderRadius: '6px',
                          cursor: generatingAI[c.id] ? 'not-allowed' : 'pointer',
                          fontWeight: '600'
                        }}
                        onClick={() => handleGenerateAIDraft(c.id)}
                        disabled={generatingAI[c.id]}
                      >
                        {generatingAI[c.id] ? 'Generating...' : '✨ Generate with AI'}
                      </button>
                    </div>
                    <textarea
                      className="form-control"
                      placeholder="Type your response to send to the citizen..."
                      rows={3}
                      value={replyTexts[c.id] || ''}
                      onChange={(e) => setReplyTexts(prev => ({ ...prev, [c.id]: e.target.value }))}
                      style={{ resize: 'none', fontSize: '0.9rem' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.82rem', color: 'hsl(var(--text-muted))', fontWeight: '600' }}>Mark status as:</span>
                        <select
                          className="form-control"
                          style={{ padding: '4px 8px', fontSize: '0.82rem', minWidth: '130px' }}
                          value={replyStatuses[c.id] || 'resolved'}
                          onChange={(e) => setReplyStatuses(prev => ({ ...prev, [c.id]: e.target.value }))}
                        >
                          <option value="resolved">Resolved</option>
                          <option value="acknowledged">Acknowledged</option>
                          <option value="open">Remaining (Open)</option>
                        </select>
                      </div>
                      <button 
                        className="btn btn-primary"
                        onClick={() => handleSendReply(c.id)}
                        style={{ padding: '6px 16px', fontSize: '0.85rem' }}
                      >
                        Submit Response
                      </button>
                    </div>
                  </div>
                </div>
              </GlassCard>
            );
          })
        )}
      </div>
    </div>
  );
};

export default EmergencyInbox;
