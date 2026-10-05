import React, { useEffect, useState, useRef, useCallback } from 'react';
import GlassCard from '../components/GlassCard';

const CitizenConversations = ({ user, backendUrl, headers }) => {
  const [conversations, setConversations] = useState([]);
  const [activeConvoId, setActiveConvoId] = useState(null);
  const [activeConvoName, setActiveConvoName] = useState('');
  const [messages, setMessages] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);
  const [error, setError] = useState('');
  const [allAudiences, setAllAudiences] = useState([]);
  const [selectedAudienceIdForNewChat, setSelectedAudienceIdForNewChat] = useState('');
  const [simulateCitizen, setSimulateCitizen] = useState(false);

  const threadEndRef = useRef(null);

  const isOperator = user?.role === 'admin' || user?.role === 'campaign_manager';

  const fetchConversationsList = useCallback(async () => {
    if (!isOperator) return;
    try {
      const res = await fetch(`${backendUrl}/api/webhook/conversations`, { headers });
      if (!res.ok) throw new Error('Failed to load conversations list');
      const data = await res.json();
      setConversations(data);
      
      // Auto-select first conversation if none selected
      if (data.length > 0 && !activeConvoId) {
        setActiveConvoId(data[0].audience_id);
        setActiveConvoName(data[0].audience_name);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingList(false);
    }
  }, [backendUrl, headers, isOperator, activeConvoId]);

  const fetchThread = useCallback(async (audienceId) => {
    setLoadingThread(true);
    try {
      const res = await fetch(`${backendUrl}/api/webhook/conversations/${audienceId}`, { headers });
      if (!res.ok) throw new Error('Failed to fetch conversation thread');
      const data = await res.json();
      setMessages(data.messages || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingThread(false);
    }
  }, [backendUrl, headers]);

  // Load list on mount if operator
  useEffect(() => {
    if (isOperator) {
      fetchConversationsList();
      const fetchAllAudiences = async () => {
        try {
          const res = await fetch(`${backendUrl}/api/audiences?limit=100`, { headers });
          if (res.ok) {
            const data = await res.json();
            setAllAudiences(data.results || []);
          }
        } catch (err) {
          console.error("Failed to load audiences", err);
        }
      };
      fetchAllAudiences();
    } else {
      // If citizen, find audience record and load their own conversation
      const fetchCitizenProfile = async () => {
        try {
          const profileRes = await fetch(`${backendUrl}/api/auth/profile/audience`, { headers });
          if (profileRes.ok) {
            const record = await profileRes.json();
            if (record && record.id) {
              setActiveConvoId(record.id);
              setActiveConvoName(`${record.first_name} ${record.last_name}`);
              fetchThread(record.id);
            } else {
              setError("Could not resolve citizen profile record.");
            }
          } else {
            setError("Could not fetch citizen profile details.");
          }
        } catch (err) {
          setError(err.message);
        } finally {
          setLoadingList(false);
        }
      };
      fetchCitizenProfile();
    }
  }, [backendUrl, headers, isOperator, fetchConversationsList, fetchThread, user.email]);

  // Load thread when active changes
  useEffect(() => {
    if (activeConvoId) {
      fetchThread(activeConvoId);
    }
  }, [activeConvoId, fetchThread]);

  // Scroll to bottom on new messages
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || !activeConvoId) return;

    setSubmittingReply(true);
    const typedText = replyText;
    setReplyText('');

    const tempUserMsgId = `temp-user-${Date.now()}`;
    const tempAiMsgId = `temp-ai-${Date.now()}`;

    // Optimistically push user message & live AI thinking indicator
    setMessages(prev => [
      ...prev,
      {
        id: tempUserMsgId,
        content: typedText,
        direction: 'inbound',
        created_at: new Date().toISOString()
      },
      {
        id: tempAiMsgId,
        content: '🤖 Grok Indic RAG Engine: Searching public bulletin knowledgebase & translating response...',
        direction: 'outbound',
        created_at: new Date().toISOString(),
        isPending: true
      }
    ]);

    try {
      const useManualReply = isOperator && !simulateCitizen;
      const endpoint = useManualReply 
        ? `${backendUrl}/api/webhook/manual-reply`
        : `${backendUrl}/api/webhook/citizen-reply`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audience_id: activeConvoId,
          content: typedText,
          channel: 'whatsapp'
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'API communication error');
      }
      
      // Reload actual thread from database
      await fetchThread(activeConvoId);
      if (isOperator) {
        fetchConversationsList();
      }
    } catch (err) {
      // Remove pending thinking indicator on error
      setMessages(prev => prev.filter(m => m.id !== tempAiMsgId));
      alert(err.message);
    } finally {
      setSubmittingReply(false);
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: isOperator ? '1fr 2.5fr' : '1fr', gap: '24px', height: '620px' }}>
        
        {/* Conversations Sidebar (Operators only) */}
        {isOperator && (
          <GlassCard style={{ padding: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '16px', borderBottom: '1px solid var(--border-color-glass)', paddingBottom: '10px' }}>
              Citizen Threads
            </h3>

            {/* Start New Chat Simulation Dropdown */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.72rem', color: 'hsl(var(--text-muted))', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                + Start New Chat Simulation
              </label>
              <select
                value={selectedAudienceIdForNewChat}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedAudienceIdForNewChat(val);
                  if (val) {
                    const aud = allAudiences.find(a => a.id === val);
                    if (aud) {
                      setActiveConvoId(aud.id);
                      setActiveConvoName(`${aud.first_name} ${aud.last_name}`);
                      setMessages([]);
                    }
                  }
                }}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  background: 'var(--input-bg)',
                  border: '1px solid var(--border-color-glass)',
                  color: 'hsl(var(--text-primary))',
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  outline: 'none',
                  transition: 'border-color 0.2s'
                }}
              >
                <option value="" style={{ background: 'var(--bg-card)', color: 'hsl(var(--text-primary))' }}>Select a citizen to simulate...</option>
                {allAudiences
                  .filter(aud => !conversations.some(c => c.audience_id === aud.id))
                  .map(aud => (
                    <option key={aud.id} value={aud.id} style={{ background: 'var(--bg-card)', color: 'hsl(var(--text-primary))' }}>
                      {aud.first_name} {aud.last_name} ({aud.phone || aud.email})
                    </option>
                  ))}
              </select>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {loadingList ? (
                <div style={{ textAlign: 'center', padding: '20px', fontSize: '0.8rem', color: 'hsl(var(--text-muted))' }}>Loading...</div>
              ) : conversations.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px', fontSize: '0.8rem', color: 'hsl(var(--text-muted))' }}>
                  No threads created yet. Select a citizen above to start a new chat simulation.
                </div>
              ) : (
                conversations.map((c) => (
                  <div
                    key={c.audience_id}
                    onClick={() => {
                      setActiveConvoId(c.audience_id);
                      setActiveConvoName(c.audience_name);
                      setSelectedAudienceIdForNewChat('');
                    }}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '8px',
                      background: activeConvoId === c.audience_id ? 'hsl(var(--primary) / 12%)' : 'rgba(255,255,255,0.02)',
                      border: activeConvoId === c.audience_id ? '1px solid hsl(var(--primary) / 30%)' : '1px solid var(--border-color-glass)',
                      cursor: 'pointer',
                      transition: 'background 0.2s',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontWeight: '700', fontSize: '0.85rem' }}>{c.audience_name}</span>
                      <span style={{ fontSize: '0.7rem', color: 'hsl(var(--accent))', fontWeight: '600' }}>
                        {c.message_count} msgs
                      </span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'hsl(var(--text-muted))' }}>
                      {c.phone || c.email} ({c.state})
                    </div>
                  </div>
                ))
              )}
            </div>
          </GlassCard>
        )}

        {/* Conversation Thread Pane */}
        <GlassCard style={{ padding: '20px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {activeConvoId ? (
            <>
              {/* Thread Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color-glass)', paddingBottom: '12px', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '700' }}>
                    {activeConvoName}
                  </h3>
                  <span style={{ fontSize: '0.72rem', color: 'hsl(var(--accent))', fontWeight: '600' }}>
                    {isOperator ? 'Two-way Citizen RAG Simulator' : 'CommAI Grounded RAG Bot'}
                  </span>
                </div>
                
                <button
                  onClick={() => fetchThread(activeConvoId)}
                  disabled={loadingThread}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    background: 'var(--border-color-glass)',
                    border: '1px solid var(--border-color-glass)',
                    color: 'hsl(var(--text-primary))',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    fontWeight: '600'
                  }}
                >
                  {loadingThread ? 'Syncing...' : '🔄 Refresh'}
                </button>
              </div>

              {/* Messages Area */}
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', paddingRight: '8px', marginBottom: '16px' }}>
                {messages.length === 0 ? (
                  <div style={{ textAlign: 'center', margin: 'auto', color: 'hsl(var(--text-muted))', fontSize: '0.85rem' }}>
                    No messages in this conversation. Start typing below to interact.
                  </div>
                ) : (
                  messages.map((m) => {
                    const isInbound = m.direction === 'inbound';
                    return (
                      <div
                        key={m.id}
                        style={{
                          alignSelf: isInbound ? 'flex-end' : 'flex-start',
                          maxWidth: '75%',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: isInbound ? 'flex-end' : 'flex-start'
                        }}
                      >
                        <div
                          style={{
                            padding: '10px 14px',
                            borderRadius: isInbound ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                            background: m.isPending
                              ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(168, 85, 247, 0.2) 100%)'
                              : isInbound ? 'hsl(var(--primary))' : 'var(--border-color-glass)',
                            color: isInbound ? 'white' : 'hsl(var(--text-primary))',
                            fontSize: '0.82rem',
                            lineHeight: '1.4',
                            border: m.isPending ? '1.5px solid #818cf8' : isInbound ? 'none' : '1px solid var(--border-color-glass)',
                            animation: m.isPending ? 'pulse 1.2s infinite ease-in-out' : 'none'
                          }}
                        >
                          {m.content}
                        </div>
                        <span style={{ fontSize: '0.65rem', color: 'hsl(var(--text-muted))', marginTop: '4px' }}>
                          {m.isPending ? '⚡ Grok Indic AI processing...' : `${new Date(m.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })} ${isInbound ? '(Citizen)' : '(AI Assist)'}`}
                        </span>
                      </div>
                    );
                  })
                )}
                <div ref={threadEndRef} />
              </div>

              {/* Send Form */}
              {isOperator && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <input
                    type="checkbox"
                    id="simulate-citizen-toggle"
                    checked={simulateCitizen}
                    onChange={(e) => setSimulateCitizen(e.target.checked)}
                    style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                  />
                  <label 
                    htmlFor="simulate-citizen-toggle" 
                    style={{ 
                      fontSize: '0.8rem', 
                      color: 'hsl(var(--text-secondary))', 
                      cursor: 'pointer', 
                      userSelect: 'none',
                      fontWeight: '600'
                    }}
                  >
                    Simulate Citizen Inbound (triggers RAG Auto-reply)
                  </label>
                </div>
              )}
              <form onSubmit={handleSendReply} style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={isOperator ? (simulateCitizen ? "Type a citizen message simulation..." : "Type operator override reply...") : "Ask the RAG assistant..."}
                  disabled={submittingReply}
                  required
                  style={{
                    flex: 1,
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: '1px solid var(--input-border)',
                    background: 'var(--input-bg)',
                    color: 'hsl(var(--text-primary))',
                    fontSize: '0.85rem'
                  }}
                />
                <button
                  type="submit"
                  disabled={submittingReply || !replyText.trim()}
                  style={{
                    padding: '0 20px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--secondary)) 100%)',
                    border: 'none',
                    color: 'white',
                    fontWeight: '700',
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    opacity: submittingReply || !replyText.trim() ? 0.6 : 1
                  }}
                >
                  {submittingReply ? 'Sending...' : '⚡ Send'}
                </button>
              </form>
            </>
          ) : (
            <div style={{ textAlign: 'center', margin: 'auto', color: 'hsl(var(--text-muted))' }}>
              {error ? (
                <div style={{ color: 'hsl(var(--danger))', fontWeight: '600', marginBottom: '8px' }}>⚠️ {error}</div>
              ) : (
                isOperator ? "Select a citizen thread on the left to begin two-way communication simulations." : "Loading your grounded RAG profile..."
              )}
            </div>
          )}
        </GlassCard>

      </div>
    </div>
  );
};

export default CitizenConversations;
