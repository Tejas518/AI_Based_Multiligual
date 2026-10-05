import React, { useState, useEffect, useCallback } from 'react';
import GlassCard from '../components/GlassCard';

const SupportQueries = ({ _user, backendUrl, headers }) => {
  const [queries, setQueries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('open'); // default to 'open'
  const [message, setMessage] = useState(null);
  
  // State for typing replies
  const [replyTexts, setReplyTexts] = useState({});
  const [replyStatuses, setReplyStatuses] = useState({});
  const [generatingAI, setGeneratingAI] = useState({});

  const fetchQueries = useCallback(async () => {
    setLoading(true);
    try {
      let url = `${backendUrl}/api/queries`;
      if (filterStatus && filterStatus !== 'all') {
        url += `?status_filter=${filterStatus}`;
      }
      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error('Failed to load support queries');
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

      setQueries(data);
      setMessage(prev => (prev && prev.text === 'Error loading queries queue.' ? null : prev));
    } catch (err) {
      console.error(err);
      setMessage({ text: 'Error loading queries queue.', type: 'danger' });
    } finally {
      setLoading(false);
    }
  }, [backendUrl, headers, filterStatus, search]);

  useEffect(() => {
    fetchQueries();
    // Poll every 10 seconds for updates
    const interval = setInterval(fetchQueries, 10000);
    return () => clearInterval(interval);
  }, [fetchQueries]);

  const handleSendReply = async (queryId) => {
    const text = replyTexts[queryId]?.trim();
    if (!text) {
      alert('Please enter a response message before sending.');
      return;
    }

    const nextStatus = replyStatuses[queryId] || 'resolved'; // default to resolved when replied

    try {
      const response = await fetch(`${backendUrl}/api/queries/${queryId}/reply`, {
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

      setMessage({ text: 'Response logged successfully. Query status updated.', type: 'success' });
      // Clear reply box
      setReplyTexts(prev => ({ ...prev, [queryId]: '' }));
      fetchQueries();
    } catch (err) {
      setMessage({ text: err.message, type: 'danger' });
    }
  };

  const handleGenerateAIDraft = async (queryId) => {
    setGeneratingAI(prev => ({ ...prev, [queryId]: true }));
    try {
      const response = await fetch(`${backendUrl}/api/queries/${queryId}/ai-reply`, {
        method: 'POST',
        headers: { ...headers }
      });
      
      if (!response.ok) throw new Error('Could not draft AI suggested response');
      const data = await response.json();
      
      setReplyTexts(prev => ({
        ...prev,
        [queryId]: data.draft_reply
      }));
    } catch (err) {
      alert(err.message);
    } finally {
      setGeneratingAI(prev => ({ ...prev, [queryId]: false }));
    }
  };

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '32px' }}>
      <div style={{ marginBottom: '28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.88rem', margin: '4px 0 0' }}>
            Answer general questions, troubleshoot template confusion, and assist users navigating campaigns.
          </p>
        </div>
        <button 
          className="btn btn-secondary" 
          onClick={fetchQueries} 
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '10px' }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '16px', height: '16px' }}>
            <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
          Refresh Queue
        </button>
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

      {/* Query Filters */}
      <GlassCard style={{ padding: '20px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
          
          <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
            <input
              type="text"
              placeholder="Search by username, subject, or message content..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px 10px 40px',
                borderRadius: '10px',
                border: '1px solid var(--input-border)',
                background: 'var(--input-bg)',
                color: 'hsl(var(--text-primary))',
                outline: 'none',
                fontSize: '0.88rem'
              }}
            />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ position: 'absolute', left: '14px', top: '12px', width: '16px', height: '16px', color: 'hsl(var(--text-muted))' }}>
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {['all', 'open', 'acknowledged', 'resolved'].map(status => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`btn ${filterStatus === status ? 'btn-primary' : 'btn-secondary'}`}
                style={{ 
                  textTransform: 'capitalize', 
                  padding: '8px 16px', 
                  borderRadius: '10px',
                  fontWeight: 600,
                  fontSize: '0.82rem'
                }}
              >
                {status}
              </button>
            ))}
          </div>

        </div>
      </GlassCard>

      {/* Main Table or Card List */}
      {loading && queries.length === 0 ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'hsl(var(--text-muted))' }}>Loading support desk queue...</div>
      ) : queries.length === 0 ? (
        <GlassCard style={{ padding: '60px 0', textAlign: 'center', color: 'hsl(var(--text-muted))' }}>
          <div style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '6px' }}>No Queries Found</div>
          <div>Queue is currently empty for active filters.</div>
        </GlassCard>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {queries.map((q) => (
            <GlassCard key={q.id} style={{ padding: '24px', borderLeft: `4px solid ${q.status === 'open' ? 'hsl(var(--primary))' : q.status === 'acknowledged' ? 'hsl(var(--warning))' : 'hsl(var(--accent))'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'hsl(var(--text-primary))' }}>{q.subject}</h3>
                    <span className={`badge badge-${q.status === 'open' ? 'danger' : q.status === 'acknowledged' ? 'warning' : 'success'}`} style={{ textTransform: 'capitalize' }}>
                      {q.status}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'hsl(var(--text-muted))', fontWeight: 500 }}>
                    Submitted by: <strong style={{ color: 'hsl(var(--text-secondary))' }}>{q.user_name || 'Audience Member'}</strong> • {new Date(q.created_at).toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Message Details */}
              <div 
                style={{ 
                  padding: '16px', 
                  borderRadius: '12px', 
                  background: 'rgba(255, 255, 255, 0.02)', 
                  border: '1px solid rgba(255, 255, 255, 0.04)',
                  fontSize: '0.9rem',
                  lineHeight: '1.5',
                  color: 'hsl(var(--text-secondary))',
                  marginBottom: '20px',
                  whiteSpace: 'pre-line'
                }}
              >
                {q.message}
              </div>

              {/* Reply Section */}
              {q.status !== 'resolved' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderTop: '1px solid var(--border-color-glass)', paddingTop: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'hsl(var(--text-primary))' }}>Send Response</span>
                    <button
                      className="btn btn-secondary"
                      disabled={generatingAI[q.id]}
                      onClick={() => handleGenerateAIDraft(q.id)}
                      style={{ fontSize: '0.78rem', padding: '6px 12px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      {generatingAI[q.id] ? (
                        'Generating reply...'
                      ) : (
                        <>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ width: '14px', height: '14px', color: 'hsl(var(--primary))' }}>
                            <polygon points="12 2 2 22 22 22"></polygon>
                          </svg>
                          Draft Response with Groq AI
                        </>
                      )}
                    </button>
                  </div>
                  
                  <textarea
                    rows={4}
                    value={replyTexts[q.id] || ''}
                    onChange={(e) => setReplyTexts(prev => ({ ...prev, [q.id]: e.target.value }))}
                    placeholder="Type your reply to the user here..."
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '10px',
                      border: '1px solid var(--input-border)',
                      background: 'var(--input-bg)',
                      color: 'hsl(var(--text-primary))',
                      fontSize: '0.88rem',
                      outline: 'none',
                      resize: 'none',
                      fontFamily: 'inherit'
                    }}
                  />

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '0.82rem', color: 'hsl(var(--text-muted))', fontWeight: 600 }}>Set Status:</span>
                      <select
                        value={replyStatuses[q.id] || 'resolved'}
                        onChange={(e) => setReplyStatuses(prev => ({ ...prev, [q.id]: e.target.value }))}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '8px',
                          border: '1px solid var(--input-border)',
                          background: 'var(--input-bg)',
                          color: 'hsl(var(--text-primary))',
                          fontSize: '0.8rem',
                          outline: 'none'
                        }}
                      >
                        <option value="resolved">Resolved</option>
                        <option value="acknowledged">Acknowledged</option>
                      </select>
                    </div>

                    <button
                      className="btn btn-primary"
                      onClick={() => handleSendReply(q.id)}
                      style={{ padding: '8px 20px', borderRadius: '8px', fontWeight: 700, fontSize: '0.82rem' }}
                    >
                      Send Message & Update
                    </button>
                  </div>
                </div>
              ) : (
                // Display past reply
                <div style={{ borderTop: '1px solid var(--border-color-glass)', paddingTop: '16px', fontSize: '0.88rem' }}>
                  <div style={{ fontWeight: 700, color: 'hsl(var(--accent))', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '16px', height: '16px' }}>
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    Manager Reply ({q.replied_at ? new Date(q.replied_at).toLocaleString() : 'N/A'}):
                  </div>
                  <div 
                    style={{ 
                      padding: '12px 16px', 
                      borderRadius: '8px', 
                      background: 'rgba(34, 197, 94, 0.02)', 
                      border: '1px solid rgba(34, 197, 94, 0.1)',
                      color: 'hsl(var(--text-secondary))',
                      fontStyle: 'italic',
                      lineHeight: '1.4'
                    }}
                  >
                    "{q.admin_reply}"
                  </div>
                </div>
              )}
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
};

export default SupportQueries;
