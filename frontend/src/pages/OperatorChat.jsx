import React, { useState, useEffect, useCallback, useRef } from 'react';
import GlassCard from '../components/GlassCard';

const OperatorChat = ({ user, backendUrl, headers, initialChannel, initialTargetManager, initialMessage }) => {
  const [messages, setMessages] = useState([]);
  const [channel, setChannel] = useState(initialChannel || 'general');
  const [staffMembers, setStaffMembers] = useState([]);
  const [activeDmUser, setActiveDmUser] = useState(null);
  const [staffSearchQuery, setStaffSearchQuery] = useState('');
  const [inputMsg, setInputMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attachedFile, setAttachedFile] = useState(null);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const chatListContainerRef = useRef(null);

  // Audio Chime Synthesis using Web Audio API
  const playMessageChime = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch (e) {}
  }, []);

  // Notification Permission Request on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Track incoming message audio ping & desktop notifications
  const prevMsgCountRef = useRef(0);
  useEffect(() => {
    if (messages.length > prevMsgCountRef.current && prevMsgCountRef.current > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && lastMsg.user_id !== user?.id) {
        playMessageChime();
        if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
          new Notification('New Operator Staff Message', {
            body: `${lastMsg.sender_name || 'Operator'}: ${lastMsg.message}`
          });
        }
      }
    }
    prevMsgCountRef.current = messages.length;
  }, [messages, user, playMessageChime]);

  const publicChannels = [
    { id: 'general', label: '💬 #general-ops', desc: 'General internal coordination & team updates' },
    { id: 'emergency', label: '🚨 #emergency-triage', desc: 'Urgent emergency alert responses & state signals' },
    { id: 'campaigns', label: '📋 #campaign-approvals', desc: 'Campaign wizard reviews & maker-checker sign-offs' },
  ];

  // Fetch available staff members (Admins & Managers) for 1-on-1 private DMs
  const fetchStaff = useCallback(async () => {
    try {
      const response = await fetch(`${backendUrl}/api/operator-chat/staff`, { headers });
      if (response.ok) {
        const data = await response.json();
        setStaffMembers(data);
      }
    } catch (err) {
      console.error('Error fetching staff list for DMs:', err);
    }
  }, [backendUrl, headers]);

  // Update on-screen message input whenever a new voice command initialMessage arrives
  const lastProcessedMsgRef = useRef('');
  useEffect(() => {
    if (initialMessage && initialMessage !== lastProcessedMsgRef.current) {
      setInputMsg(initialMessage);
      lastProcessedMsgRef.current = initialMessage;
    }
  }, [initialMessage]);

  // Handle voice command auto-selection of Channel or 1-on-1 Private DM
  useEffect(() => {
    if (initialChannel && !initialTargetManager) {
      setChannel(initialChannel);
    }
  }, [initialChannel, initialTargetManager]);

  useEffect(() => {
    if (initialTargetManager && staffMembers.length > 0 && user) {
      const query = initialTargetManager.toLowerCase();
      const queryWords = query.split(/\s+/).filter(w => w.length > 2);
      const matched = staffMembers.find(s => {
        const fullNameLower = (s.full_name || '').toLowerCase();
        const firstNameLower = fullNameLower.split(' ')[0] || '';
        const emailLower = (s.email || '').toLowerCase();

        return (
          fullNameLower.includes(query) ||
          query.includes(fullNameLower) ||
          queryWords.some(w => w !== 'manager' && w !== 'admin' && (firstNameLower === w || fullNameLower.includes(w) || emailLower.includes(w)))
        );
      });

      if (matched) {
        const sortedIds = [user.id, matched.id].sort();
        const dmChannelId = `dm:${sortedIds[0]}:${sortedIds[1]}`;
        setActiveDmUser(matched);
        setChannel(dmChannelId);
      }
    }
  }, [initialTargetManager, staffMembers, user]);

  const fetchMessages = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    try {
      const response = await fetch(`${backendUrl}/api/operator-chat/messages?channel=${encodeURIComponent(channel)}`, { headers });
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Access Restricted: Operator Staff Chat is strictly for Admins & Campaign Managers.');
        }
        throw new Error('Failed to load operator chat messages.');
      }
      const data = await response.json();
      setMessages(data);
      setError('');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Error loading messages');
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [backendUrl, headers, channel]);

  // Periodic fetch staff roster (10s)
  useEffect(() => {
    fetchStaff();
    const staffInterval = setInterval(() => {
      fetchStaff();
    }, 10000);
    return () => clearInterval(staffInterval);
  }, [fetchStaff]);

  // Fetch messages on channel change or initial load + continuous 3s real-time poll
  useEffect(() => {
    fetchMessages(true);
    const msgInterval = setInterval(() => {
      fetchMessages(false);
    }, 3000);
    return () => clearInterval(msgInterval);
  }, [fetchMessages]);

  // Listen for real-time WebSocket events from App.jsx without requiring refresh
  useEffect(() => {
    const handleWsMsg = (e) => {
      const newMsg = e.detail;
      if (!newMsg) return;
      if (newMsg.channel === channel) {
        setMessages(prev => {
          if (prev.some(m => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
      }
    };

    const handleWsDelete = (e) => {
      const delData = e.detail;
      if (delData && delData.id) {
        setMessages(prev => prev.filter(m => m.id !== delData.id));
      }
    };

    window.addEventListener('commai_operator_chat_msg', handleWsMsg);
    window.addEventListener('commai_operator_chat_delete', handleWsDelete);
    return () => {
      window.removeEventListener('commai_operator_chat_msg', handleWsMsg);
      window.removeEventListener('commai_operator_chat_delete', handleWsDelete);
    };
  }, [channel]);

  // Scroll inner chat box container ONLY to bottom on new message (never auto-slide main page window)
  useEffect(() => {
    if (chatListContainerRef.current) {
      chatListContainerRef.current.scrollTop = chatListContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSelectChannel = (chId) => {
    setActiveDmUser(null);
    setChannel(chId);
  };

  const handleStartDm = (staff) => {
    if (!user || !staff) return;
    const sortedIds = [user.id, staff.id].sort();
    const dmChannelId = `dm:${sortedIds[0]}:${sortedIds[1]}`;
    setActiveDmUser(staff);
    setChannel(dmChannelId);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      setAttachedFile({
        name: file.name,
        type: file.type,
        dataUrl: evt.target.result
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSendMessage = async (e, overrideMsg = null, overrideChan = null) => {
    e?.preventDefault?.();
    const rawMsg = overrideMsg || (e && typeof e === 'object' && (e.detail?.message || e.detail?.message_text)) || inputMsg;
    if ((!rawMsg || !rawMsg.trim()) && !attachedFile) return;

    let textToSend = (rawMsg || '').trim();
    if (attachedFile) {
      textToSend = textToSend 
        ? `${textToSend}\n\n📎 Attachment: [${attachedFile.name}](${attachedFile.dataUrl})`
        : `📎 Attachment: [${attachedFile.name}](${attachedFile.dataUrl})`;
    }

    const targetChannel = overrideChan || (e && typeof e === 'object' && e.detail?.channel) || channel;
    setInputMsg('');
    setAttachedFile(null);
    setSending(true);

    try {
      const response = await fetch(`${backendUrl}/api/operator-chat/messages`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: textToSend,
          channel: targetChannel,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to send message');
      }

      const createdMsg = await response.json();
      setMessages(prev => {
        if (prev.some(m => m.id === createdMsg.id)) return prev;
        return [...prev, createdMsg];
      });
    } catch (err) {
      console.error(err);
      setError(err.message || 'Error sending message');
      setInputMsg(rawMsg); // Restore on error
    } finally {
      setSending(false);
    }
  };

  // Voice confirmation listener: triggers send when user confirms verbally via voice cockpit
  const handleSendMessageRef = useRef(handleSendMessage);
  useEffect(() => {
    handleSendMessageRef.current = handleSendMessage;
  });

  useEffect(() => {
    const handleVoiceSend = (e) => {
      const detailMsg = e?.detail?.message || e?.detail?.message_text || null;
      const detailChan = e?.detail?.channel || null;
      const targetChan = (channel && channel.startsWith('dm:')) ? channel : (detailChan || channel);
      handleSendMessageRef.current?.(e, detailMsg, targetChan);
    };
    window.addEventListener('commai_voice_send_operator_chat', handleVoiceSend);
    return () => window.removeEventListener('commai_voice_send_operator_chat', handleVoiceSend);
  }, [channel]);

  const handleDeleteMessage = async (msgId) => {
    if (!window.confirm('Are you sure you want to delete this message?')) return;
    try {
      const response = await fetch(`${backendUrl}/api/operator-chat/messages/${msgId}`, {
        method: 'DELETE',
        headers,
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to delete message');
      }
      setMessages(prev => prev.filter(m => m.id !== msgId));
    } catch (err) {
      alert(err.message);
    }
  };

  const getRoleBadge = (role) => {
    if (role === 'admin') {
      return (
        <span className="badge" style={{ background: 'rgba(168, 85, 247, 0.16)', color: 'hsl(270, 95%, 75%)', border: '1px solid rgba(168, 85, 247, 0.35)', fontSize: '0.68rem', padding: '1px 6px' }}>
          🛡️ ADMIN
        </span>
      );
    }
    return (
      <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.16)', color: 'hsl(217, 91%, 70%)', border: '1px solid rgba(59, 130, 246, 0.35)', fontSize: '0.68rem', padding: '1px 6px' }}>
        👔 MANAGER
      </span>
    );
  };

  const getInitials = (name) => {
    if (!name) return 'OP';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const formatTimestamp = (ts) => {
    if (!ts) return '';
    const date = new Date(ts);
    return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) + ' · ' + date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  };

  const otherStaff = staffMembers.filter(s => s.id !== user?.id);
  const filteredStaff = otherStaff.filter(staff => {
    if (!staffSearchQuery.trim()) return true;
    const q = staffSearchQuery.toLowerCase().trim();
    return (
      staff.full_name?.toLowerCase().includes(q) ||
      staff.email?.toLowerCase().includes(q) ||
      staff.role?.toLowerCase().includes(q) ||
      staff.designation?.toLowerCase().includes(q)
    );
  });
  const currentPublicChannelObj = publicChannels.find(c => c.id === channel);

  const getHeaderInfo = () => {
    if (currentPublicChannelObj) {
      return {
        label: currentPublicChannelObj.label,
        desc: currentPublicChannelObj.desc
      };
    }
    if (activeDmUser) {
      return {
        label: `🔒 Private DM with ${activeDmUser.full_name}`,
        desc: `Private end-to-end encrypted staff conversation with ${activeDmUser.full_name} (${activeDmUser.role === 'admin' ? 'Admin' : 'Campaign Manager'})`
      };
    }
    return {
      label: '🔒 Private Staff Direct Message',
      desc: 'Private 1-on-1 staff conversation between operators'
    };
  };

  const headerInfo = getHeaderInfo();

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingBottom: '0' }}>
      
      {/* Privacy & Scope Disclaimer Banner */}
      <div style={{
        padding: '8px 14px',
        borderRadius: '10px',
        background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(168, 85, 247, 0.12) 100%)',
        border: '1px solid rgba(168, 85, 247, 0.25)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '8px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ fontSize: '1.1rem' }}>🔒</div>
          <div>
            <div style={{ fontWeight: '700', fontSize: '0.88rem', color: 'hsl(var(--text-primary))' }}>
              Internal Staff & Operator Command Channel
            </div>
            <div style={{ fontSize: '0.76rem', color: 'hsl(var(--text-secondary))', marginTop: '1px' }}>
              Private workspace for <strong>Admins</strong> & <strong>Campaign Managers</strong> with 1-on-1 DMs.
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <span className="badge" style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#10b981', border: '1px solid rgba(34, 197, 94, 0.3)', padding: '2px 8px', borderRadius: '10px', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }}></span>
            ⚡ Continuous Sync (3s)
          </span>
        </div>
      </div>

      {/* Channel & Private DM Switcher */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', color: 'hsl(var(--text-muted))', letterSpacing: '0.05em', marginRight: '2px' }}>
            Channels:
          </span>
          {publicChannels.map(ch => (
            <button
              key={ch.id}
              type="button"
              onClick={() => handleSelectChannel(ch.id)}
              style={{
                padding: '4px 12px',
                borderRadius: '8px',
                border: channel === ch.id ? '1px solid hsl(var(--primary))' : '1px solid var(--border-color-glass)',
                background: channel === ch.id ? 'rgba(59, 130, 246, 0.15)' : 'rgba(99, 102, 241, 0.06)',
                color: channel === ch.id ? 'hsl(var(--primary))' : 'hsl(var(--text-secondary))',
                fontWeight: channel === ch.id ? '700' : '500',
                cursor: 'pointer',
                fontSize: '0.8rem',
                transition: 'all 0.2s ease'
              }}
            >
              {ch.label}
            </button>
          ))}
        </div>

        {/* Private Direct Messages with Staff Section */}
        {otherStaff.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.08), rgba(99, 102, 241, 0.06))', padding: '8px 12px', borderRadius: '10px', border: '1px solid rgba(139, 92, 246, 0.18)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
              <span style={{ fontSize: '0.74rem', fontWeight: '700', textTransform: 'uppercase', color: 'hsl(270, 95%, 75%)', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '4px' }}>
                🔒 Private DMs ({otherStaff.length}):
              </span>
              
              {/* Search Filter Input Bar */}
              <div style={{ position: 'relative', minWidth: '180px' }}>
                <input
                  type="text"
                  placeholder="🔍 Search staff..."
                  value={staffSearchQuery}
                  onChange={(e) => setStaffSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '3px 10px 3px 24px',
                    borderRadius: '6px',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    background: 'rgba(139, 92, 246, 0.08)',
                    color: 'hsl(var(--text-primary))',
                    fontSize: '0.78rem',
                    outline: 'none'
                  }}
                />
                <span style={{ position: 'absolute', left: '6px', top: '50%', transform: 'translateY(-50%)', opacity: 0.6, fontSize: '0.75rem' }}>🔍</span>
                {staffSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setStaffSearchQuery('')}
                    style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'hsl(var(--text-muted))', cursor: 'pointer', fontSize: '0.7rem' }}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
              {filteredStaff.length === 0 ? (
                <span style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', fontStyle: 'italic' }}>
                  No staff matching "{staffSearchQuery}"
                </span>
              ) : (
                filteredStaff.map(staff => {
                  const dmId = `dm:${[user?.id, staff.id].sort().join(':')}`;
                  const isSelected = channel === dmId;
                  return (
                    <button
                      key={staff.id}
                      type="button"
                      onClick={() => handleStartDm(staff)}
                      style={{
                        padding: '3px 10px',
                        borderRadius: '16px',
                        border: isSelected ? '1px solid rgba(236, 72, 153, 0.8)' : '1px solid rgba(255, 255, 255, 0.08)',
                        background: isSelected ? 'rgba(236, 72, 153, 0.2)' : 'rgba(139, 92, 246, 0.06)',
                        color: isSelected ? '#ec4899' : 'hsl(var(--text-secondary))',
                        fontWeight: isSelected ? '700' : '500',
                        cursor: 'pointer',
                        fontSize: '0.78rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: staff.role === 'admin' ? '#a855f7' : '#3b82f6', display: 'inline-block' }} />
                      <span>{staff.full_name} ({staff.role === 'admin' ? 'Admin' : 'Manager'})</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Main Chat Box Container */}
      <GlassCard style={{ padding: '0', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 240px)', minHeight: '380px', maxHeight: '510px', overflow: 'hidden' }}>
        
        {/* Chat Header Bar */}
        <div style={{
          padding: '10px 16px',
          borderBottom: '1px solid var(--border-color-glass)',
          background: channel.startsWith('dm:') ? 'linear-gradient(90deg, rgba(236, 72, 153, 0.15) 0%, rgba(168, 85, 247, 0.15) 100%)' : 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(6, 182, 212, 0.08) 100%)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ fontWeight: '700', fontSize: '0.92rem', color: 'hsl(var(--text-primary))', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>{headerInfo.label}</span>
              {channel.startsWith('dm:') ? (
                <span className="badge" style={{ background: 'rgba(236, 72, 153, 0.2)', color: '#ec4899', border: '1px solid rgba(236, 72, 153, 0.4)', fontSize: '0.7rem' }}>
                  PRIVATE DM
                </span>
              ) : null}
            </div>
            <div style={{ fontSize: '0.76rem', color: 'hsl(var(--text-secondary))', marginTop: '1px' }}>
              {headerInfo.desc}
            </div>
          </div>
          <button
            type="button"
            className="pill-chip"
            onClick={() => fetchMessages(true)}
            style={{ fontSize: '0.75rem', padding: '4px 10px', background: 'rgba(255, 255, 255, 0.06)' }}
          >
            🔄 Sync Chat
          </button>
        </div>

        {/* Messages List Area */}
        <div ref={chatListContainerRef} style={{ flexGrow: 1, padding: '14px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '30px', color: 'hsl(var(--text-muted))', fontSize: '0.85rem' }}>
              Loading operator messages...
            </div>
          ) : error ? (
            <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '10px', color: 'hsl(var(--danger))', fontSize: '0.85rem' }}>
              ⚠️ {error}
            </div>
          ) : messages.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 16px', color: 'hsl(var(--text-muted))' }}>
              <div style={{ fontSize: '2rem', marginBottom: '8px', opacity: 0.5 }}>💬</div>
              <div style={{ fontWeight: '600', fontSize: '0.92rem', color: 'hsl(var(--text-primary))' }}>
                {channel.startsWith('dm:') ? `No private messages with ${activeDmUser?.full_name || 'this staff member'} yet` : 'No messages in this channel yet'}
              </div>
              <div style={{ fontSize: '0.8rem', marginTop: '2px' }}>Be the first operator to start the conversation!</div>
            </div>
          ) : (
            messages.map((msg) => {
              const isSelf = msg.sender_id === user?.id;
              return (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    gap: '10px',
                    alignItems: 'flex-start',
                    flexDirection: isSelf ? 'row-reverse' : 'row'
                  }}
                >
                  {/* Sender Avatar */}
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: msg.sender_role === 'admin' ? 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)' : 'linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: '800',
                    fontSize: '0.78rem',
                    flexShrink: 0,
                    boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
                  }}>
                    {getInitials(msg.sender_name)}
                  </div>

                  {/* Message Bubble Card */}
                  <div style={{
                    maxWidth: '80%',
                    background: isSelf ? 'rgba(59, 130, 246, 0.16)' : 'rgba(139, 92, 246, 0.07)',
                    border: `1px solid ${isSelf ? 'rgba(59, 130, 246, 0.35)' : 'var(--border-color-glass)'}`,
                    borderRadius: isSelf ? '12px 2px 12px 12px' : '2px 12px 12px 12px',
                    padding: '10px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: '700', fontSize: '0.82rem', color: 'hsl(var(--text-primary))' }}>
                        {msg.sender_name}
                      </span>
                      {getRoleBadge(msg.sender_role)}
                      <span style={{ fontSize: '0.68rem', color: 'hsl(var(--text-muted))', marginLeft: 'auto' }}>
                        {formatTimestamp(msg.created_at)}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.88rem', color: 'hsl(var(--text-primary))', lineHeight: '1.45', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {msg.message}
                    </div>

                    {/* Delete action for owner or admin */}
                    {(isSelf || user?.role === 'admin') && (
                      <div style={{ alignSelf: 'flex-end', marginTop: '2px' }}>
                        <button
                          type="button"
                          onClick={() => handleDeleteMessage(msg.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'hsl(var(--text-muted))',
                            fontSize: '0.68rem',
                            cursor: 'pointer',
                            padding: '1px 3px',
                            opacity: 0.7
                          }}
                          onMouseEnter={(e) => e.target.style.color = 'hsl(var(--danger))'}
                          onMouseLeave={(e) => e.target.style.color = 'hsl(var(--text-muted))'}
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Operators Presets */}
        <div style={{ padding: '6px 14px', background: 'linear-gradient(90deg, rgba(99, 102, 241, 0.06) 0%, rgba(139, 92, 246, 0.06) 100%)', borderTop: '1px solid rgba(99, 102, 241, 0.12)', display: 'flex', gap: '6px', overflowX: 'auto', alignItems: 'center' }}>
          <span style={{ fontSize: '0.72rem', color: 'hsl(var(--text-muted))', fontWeight: '600', flexShrink: 0 }}>Quick Actions:</span>
          {[
            { label: '🚨 Shift Alert: Flood Warning', text: '🚨 Shift Alert: Heavy flood warning triggered. Please review Emergency Bulletins.' },
            { label: '✅ Campaign Approved', text: '✅ Campaign draft has been reviewed and approved for delivery.' },
            { label: '📊 Shift Handover', text: '📊 Shift handover update: All active queues cleared for the hour.' },
            { label: '🤖 AI Template Check', text: '🤖 Please verify AI Poster Studio templates before broadcasting.' }
          ].map((preset, idx) => (
            <button
              key={idx}
              type="button"
              className="pill-chip"
              onClick={() => setInputMsg(preset.text)}
              style={{ fontSize: '0.72rem', padding: '3px 8px', whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Attachment preview chip */}
        {attachedFile && (
          <div style={{ padding: '4px 12px', background: 'rgba(99, 102, 241, 0.15)', borderTop: '1px solid rgba(99, 102, 241, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem', color: '#38bdf8' }}>
            <span>📎 Attached File: <strong>{attachedFile.name}</strong></span>
            <button type="button" onClick={() => setAttachedFile(null)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold' }}>✕ Remove</button>
          </div>
        )}

        {/* Input Bar Form */}
        <form onSubmit={handleSendMessage} style={{ padding: '10px 14px', background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.85), rgba(30, 27, 75, 0.6))', borderTop: '1px solid rgba(99, 102, 241, 0.15)', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => fileInputRef.current?.click()}
            style={{ fontSize: '1.1rem', padding: '6px 10px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
            title="Attach image or document"
          >
            📎
          </button>
          <input
            type="text"
            className="form-control"
            placeholder={activeDmUser ? `Private DM with ${activeDmUser.full_name}...` : `Message #${headerInfo.label.split(' ')[0]} (Admins & Managers)...`}
            value={inputMsg}
            onChange={(e) => setInputMsg(e.target.value)}
            style={{ borderRadius: '8px', padding: '8px 12px', fontSize: '0.85rem', background: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.2)', flex: 1 }}
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={(!inputMsg.trim() && !attachedFile) || sending}
            style={{ padding: '8px 18px', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}
          >
            {sending ? 'Sending...' : 'Send 🚀'}
          </button>
        </form>
      </GlassCard>
    </div>
  );
};

export default OperatorChat;
