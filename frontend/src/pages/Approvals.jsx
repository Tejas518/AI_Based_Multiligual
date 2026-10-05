import React, { useState, useEffect, useCallback } from 'react';
import GlassCard from '../components/GlassCard';
import { formatIST } from '../utils/dateUtils';

const Approvals = ({ user, backendUrl, headers }) => {
  const isAdmin = user?.role === 'admin';
  const [activeReviewTab, setActiveReviewTab] = useState(isAdmin ? 'maker_checker' : 'citizen_proposals');
  const [pendingCampaigns, setPendingCampaigns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedCamp, setSelectedCamp] = useState(null);
  const [selectedCampaignIds, setSelectedCampaignIds] = useState([]);
  const [reviewNote, setReviewNote] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const handleToggleSelectAll = () => {
    if (selectedCampaignIds.length === pendingCampaigns.length) {
      setSelectedCampaignIds([]);
    } else {
      setSelectedCampaignIds(pendingCampaigns.map(c => c.id));
    }
  };

  const handleToggleSelect = (id, e) => {
    e.stopPropagation();
    setSelectedCampaignIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleBatchApprove = async () => {
    if (selectedCampaignIds.length === 0) return;
    if (!window.confirm(`Approve ${selectedCampaignIds.length} campaign(s) in batch?`)) return;

    setActionLoading(true);
    setActionError('');
    setActionSuccess('');

    try {
      const response = await fetch(`${backendUrl}/api/campaigns/batch-approve`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_ids: selectedCampaignIds })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'Batch approval failed');
      }

      setActionSuccess(`Batch approved ${data.approved_count} campaign(s) successfully!`);
      setSelectedCampaignIds([]);
      fetchPendingCampaigns();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Lists fetched from DB for dropdown selection
  const [segments, setSegments] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const fetchPendingCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${backendUrl}/api/campaigns`, { headers });
      if (!response.ok) throw new Error('Failed to load campaigns');
      const data = await response.json();
      
      // Filter campaigns based on active review tab selection
      const targetStatus = activeReviewTab === 'maker_checker' ? 'pending_approval' : 'pending_review';
      const pending = data.filter(c => c.status === targetStatus);
      setPendingCampaigns(pending);
      
      // Auto-select first if none selected, or keep selected if still exists
      if (pending.length > 0) {
        if (selectedCamp) {
          const stillExists = pending.find(c => c.id === selectedCamp.id);
          if (!stillExists) {
            setSelectedCamp(pending[0]);
          }
        } else {
          setSelectedCamp(pending[0]);
        }
      } else {
        setSelectedCamp(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [backendUrl, headers, selectedCamp?.id, activeReviewTab]);

  const fetchSegmentsAndTemplates = useCallback(async () => {
    try {
      const segRes = await fetch(`${backendUrl}/api/segments`, { headers });
      const tplRes = await fetch(`${backendUrl}/api/templates`, { headers });
      if (segRes.ok && tplRes.ok) {
        setSegments(await segRes.json());
        setTemplates(await tplRes.json());
      }
    } catch (err) {
      console.error(err);
    }
  }, [backendUrl, headers]);

  useEffect(() => {
    fetchPendingCampaigns();
    fetchSegmentsAndTemplates();
  }, [fetchPendingCampaigns, fetchSegmentsAndTemplates, activeReviewTab]);

  // Fetch audit logs when campaign selection changes
  useEffect(() => {
    if (!selectedCamp?.id) {
      setAuditLogs([]);
      return;
    }
    const fetchCampaignAuditLogs = async () => {
      setAuditLoading(true);
      try {
        const response = await fetch(`${backendUrl}/api/campaigns/${selectedCamp.id}/audit-logs`, { headers });
        if (response.ok) {
          const logs = await response.json();
          setAuditLogs(logs);
        }
      } catch (err) {
        console.error('Error fetching audit logs:', err);
      } finally {
        setAuditLoading(false);
      }
    };
    fetchCampaignAuditLogs();
    setReviewNote('');
    setActionError('');
    setActionSuccess('');
  }, [selectedCamp?.id, backendUrl, headers]);

  const handleApprove = async () => {
    if (!selectedCamp) return;
    if (!window.confirm(`Approve campaign "${selectedCamp.title}"?`)) return;

    setActionLoading(true);
    setActionError('');
    setActionSuccess('');

    try {
      let response;
      if (activeReviewTab === 'maker_checker') {
        response = await fetch(`${backendUrl}/api/campaigns/${selectedCamp.id}/approve`, {
          method: 'POST',
          headers
        });
      } else {
        response = await fetch(`${backendUrl}/api/campaigns/${selectedCamp.id}/review`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'approve', remark: reviewNote.trim() || 'Approved by operator' })
        });
      }

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'Approval failed');
      }

      setActionSuccess(activeReviewTab === 'maker_checker' ? 'Campaign approved successfully!' : 'Citizen campaign proposal approved and moved to draft.');
      setReviewNote('');
      fetchPendingCampaigns();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selectedCamp) return;
    if (!reviewNote.trim()) {
      setActionError('Please document a rejection reason in the comments section.');
      return;
    }

    if (!window.confirm(`Reject campaign "${selectedCamp.title}"?`)) return;

    setActionLoading(true);
    setActionError('');
    setActionSuccess('');

    try {
      let response;
      if (activeReviewTab === 'maker_checker') {
        response = await fetch(`${backendUrl}/api/campaigns/${selectedCamp.id}/reject`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: reviewNote.trim() })
        });
      } else {
        response = await fetch(`${backendUrl}/api/campaigns/${selectedCamp.id}/review`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reject', remark: reviewNote.trim() })
        });
      }

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'Rejection failed');
      }

      setActionSuccess(activeReviewTab === 'maker_checker' ? 'Campaign rejected and returned to draft.' : 'Citizen campaign proposal rejected.');
      setReviewNote('');
      fetchPendingCampaigns();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const getCampaignTypeLabel = (val) => {
    switch (val) {
      case 'awareness_drive': return 'Awareness Drive';
      case 'emergency_alert': return 'Emergency Alert';
      case 'educational_notification': return 'Educational Bulletin';
      case 'organizational_announcement': return 'Organizational Announcement';
      default: return val;
    }
  };

  // Find linked segment name
  const getSegmentName = (segId) => {
    const seg = segments.find(s => s.id === segId);
    return seg ? seg.name : 'Unknown Segment';
  };

  // Render comparative side-by-side modifications (Diff View)
  const renderTemplateDiff = () => {
    if (!selectedCamp) return null;

    let originalSubject = "N/A";
    let originalBody = selectedCamp.description || selectedCamp.objective || "N/A";
    
    if (selectedCamp.template_id) {
      const origTpl = templates.find(t => t.id === selectedCamp.template_id);
      if (origTpl) {
        originalSubject = origTpl.subject_template || "(No Subject)";
        originalBody = origTpl.body_template || "";
      }
    }

    const modifiedSubject = selectedCamp.custom_subject || originalSubject;
    const modifiedBody = selectedCamp.custom_body || originalBody;

    const isSubjectModified = selectedCamp.custom_subject && selectedCamp.custom_subject !== originalSubject;
    const isBodyModified = selectedCamp.custom_body && selectedCamp.custom_body !== originalBody;

    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '12px' }}>
        <div>
          <h4 style={{ fontSize: '0.85rem', color: 'hsl(var(--text-secondary))', textTransform: 'uppercase', marginBottom: '8px', fontWeight: 600 }}>Baseline Template</h4>
          <div style={{ padding: '12px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '8px', minHeight: '150px' }}>
            <div style={{ fontSize: '0.85rem', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '6px', marginBottom: '8px' }}>
              <strong>Subject:</strong> <span style={{ color: 'hsl(var(--text-muted))' }}>{originalSubject}</span>
            </div>
            <div style={{ fontSize: '0.82rem', whiteSpace: 'pre-wrap', color: 'hsl(var(--text-muted))', lineHeight: '1.4' }}>
              {originalBody}
            </div>
          </div>
        </div>
        <div>
          <h4 style={{ fontSize: '0.85rem', color: 'hsl(var(--text-secondary))', textTransform: 'uppercase', marginBottom: '8px', fontWeight: 600 }}>Proposed Modifications (Diff)</h4>
          <div style={{ 
            padding: '12px', 
            background: 'rgba(0, 212, 255, 0.01)', 
            border: '1px solid',
            borderColor: isSubjectModified || isBodyModified ? 'rgba(0, 212, 255, 0.15)' : 'rgba(255,255,255,0.04)', 
            borderRadius: '8px', 
            minHeight: '150px' 
          }}>
            <div style={{ 
              fontSize: '0.85rem', 
              borderBottom: '1px solid rgba(255,255,255,0.06)', 
              paddingBottom: '6px', 
              marginBottom: '8px',
              color: isSubjectModified ? '#38bdf8' : 'inherit'
            }}>
              <strong>Subject:</strong> <span>{modifiedSubject}</span>
            </div>
            <div style={{ 
              fontSize: '0.82rem', 
              whiteSpace: 'pre-wrap', 
              color: isBodyModified ? '#38bdf8' : 'hsl(var(--text-secondary))',
              lineHeight: '1.4' 
            }}>
              {modifiedBody}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderAuditHistory = () => {
    if (auditLoading) return <p style={{ fontSize: '0.85rem', color: 'hsl(var(--text-muted))' }}>Loading audit trials...</p>;
    if (auditLogs.length === 0) return <p style={{ fontSize: '0.85rem', color: 'hsl(var(--text-muted))' }}>No audit history records available.</p>;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto', border: '1px solid rgba(255,255,255,0.04)', padding: '10px', borderRadius: '8px', background: 'rgba(0,0,0,0.1)' }}>
        {auditLogs.map(log => {
          let changes = null;
          try {
            changes = JSON.parse(log.changes || '{}');
          } catch {
            changes = null;
          }

          return (
            <div key={log.id} style={{ fontSize: '0.82rem', paddingBottom: '6px', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'hsl(var(--text-secondary))' }}>
                <strong>{log.user_name} ({log.action})</strong>
                <span style={{ color: 'hsl(var(--text-muted))', fontSize: '0.75rem' }}>{new Date(log.timestamp).toLocaleString()}</span>
              </div>
              {log.new_status && (
                <div style={{ color: 'hsl(var(--text-muted))', marginTop: '2px' }}>
                  Status transition: <span className="badge badge-manager" style={{ fontSize: '0.65rem', padding: '1px 4px' }}>{log.old_status || 'none'}</span> ➜ <span className="badge badge-communicator" style={{ fontSize: '0.65rem', padding: '1px 4px' }}>{log.new_status}</span>
                </div>
              )}
              {changes && Object.keys(changes).length > 0 && (
                <div style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.78rem', marginTop: '4px', fontFamily: 'monospace', background: 'rgba(255,255,255,0.02)', padding: '4px 6px', borderRadius: '4px' }}>
                  {Object.keys(changes).map(field => (
                    <div key={field}>
                      - {field}: {changes[field].old !== undefined ? `${String(changes[field].old)} ➜ ` : ''}<strong>{String(changes[field].new)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="animate-fade-in" style={{ padding: '8px 4px', paddingBottom: '32px' }}>
      {/* Page Header Description */}
      <div style={{ marginBottom: '24px' }}>
        <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.88rem', margin: '4px 0 0', lineHeight: 1.5 }}>
          <strong>Maker-Checker Compliance Desk:</strong> Under standard government communications protocol, high-severity outreach and emergency alerts require dual-authorization. A campaign manager (Maker) drafts the campaign, and a system administrator (Checker) must audit target size, estimated costs, template diffs, and compliance history here before approving broadcast.
        </p>
      </div>

      <div className="approvals-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
        
        {/* Left Side: Pending Campaigns Queue */}
        <div>
          <GlassCard style={{ padding: '16px', height: '100%', minHeight: '400px' }}>
            <h3 style={{ fontSize: '1.1rem', margin: '0 0 16px 0', borderBottom: '1px solid var(--border-color-glass)', paddingBottom: '10px', fontWeight: 700 }}>
              Approvals Inbox ({pendingCampaigns.length})
            </h3>
            {isAdmin && (
              <>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                  <button
                    className={`btn ${activeReviewTab === 'maker_checker' ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ flex: '1 1 auto', minWidth: '120px', fontSize: '0.78rem', padding: '8px 10px', fontWeight: '700', whiteSpace: 'nowrap', textTransform: 'none' }}
                    onClick={() => {
                      setActiveReviewTab('maker_checker');
                      setSelectedCamp(null);
                    }}
                  >
                    Maker-Checker
                  </button>
                  <button
                    className={`btn ${activeReviewTab === 'citizen_proposals' ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ flex: '1 1 auto', minWidth: '120px', fontSize: '0.78rem', padding: '8px 10px', fontWeight: '700', whiteSpace: 'nowrap', textTransform: 'none' }}
                    onClick={() => {
                      setActiveReviewTab('citizen_proposals');
                      setSelectedCamp(null);
                    }}
                  >
                    Citizen Proposals
                  </button>
                </div>

                {activeReviewTab === 'maker_checker' && pendingCampaigns.length > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', background: 'rgba(255,255,255,0.03)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.8rem', color: 'hsl(var(--text-secondary))', fontWeight: 600, userSelect: 'none' }}>
                      <input
                        type="checkbox"
                        checked={pendingCampaigns.length > 0 && selectedCampaignIds.length === pendingCampaigns.length}
                        onChange={handleToggleSelectAll}
                        style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: 'hsl(var(--primary))' }}
                      />
                      Select All ({pendingCampaigns.length})
                    </label>
                    {selectedCampaignIds.length > 0 && (
                      <button
                        className="btn btn-primary"
                        onClick={handleBatchApprove}
                        disabled={actionLoading}
                        style={{ fontSize: '0.78rem', padding: '4px 12px', background: 'rgba(16, 185, 129, 0.2)', border: '1px solid rgba(16, 185, 129, 0.4)', color: '#10b981', fontWeight: 700 }}
                      >
                        ⚡ Approve ({selectedCampaignIds.length})
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
            {loading && pendingCampaigns.length === 0 ? (
              <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.9rem', textAlign: 'center', marginTop: '24px' }}>Scanning approvals...</p>
            ) : pendingCampaigns.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'hsl(var(--text-muted))' }}>
                <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🎉</div>
                <p style={{ fontSize: '0.85rem', margin: 0 }}>Approvals queue is clear! No campaigns pending.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {pendingCampaigns.map(camp => (
                  <div
                    key={camp.id}
                    onClick={() => setSelectedCamp(camp)}
                    style={{
                      padding: '12px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      border: '1px solid',
                      borderColor: selectedCamp?.id === camp.id ? 'hsl(var(--primary))' : 'rgba(255,255,255,0.04)',
                      background: selectedCamp?.id === camp.id ? 'rgba(0, 212, 255, 0.04)' : 'rgba(255,255,255,0.01)',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px'
                    }}
                  >
                    {isAdmin && activeReviewTab === 'maker_checker' && (
                      <input
                        type="checkbox"
                        checked={selectedCampaignIds.includes(camp.id)}
                        onChange={(e) => handleToggleSelect(camp.id, e)}
                        onClick={(e) => e.stopPropagation()}
                        style={{ cursor: 'pointer', width: '16px', height: '16px', marginTop: '2px', accentColor: 'hsl(var(--primary))' }}
                      />
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '700', fontSize: '0.92rem', color: selectedCamp?.id === camp.id ? 'hsl(var(--primary))' : 'inherit' }}>
                        {camp.title}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'hsl(var(--text-muted))', marginTop: '4px' }}>
                        Type: {getCampaignTypeLabel(camp.campaign_type)}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'hsl(var(--text-muted))', marginTop: '8px' }}>
                        <span>Target: {camp.target_audience_count}</span>
                        {camp.review_remark && <span style={{ color: '#ef4444', fontWeight: 600 }}>Has Revision Note</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        </div>

        {/* Right Side: Detailed Compare & Approve Panel */}
        <div style={{ flex: '2' }}>
          {selectedCamp ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Campaign Summary & Cost Card */}
              <GlassCard style={{ padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '12px' }}>
                  <div>
                    <span className="badge" style={{ background: activeReviewTab === 'maker_checker' ? 'hsl(35, 92%, 50%)' : 'hsl(142, 70%, 45%)', color: '#fff', fontSize: '0.75rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px' }}>
                      {activeReviewTab === 'maker_checker' ? 'Requires Administrator Verification' : 'Citizen Propose Campaign Review'}
                    </span>
                    <h2 style={{ fontSize: '1.45rem', fontWeight: 800, margin: '8px 0 4px 0' }}>{selectedCamp.title}</h2>
                    <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.9rem', margin: 0 }}>{selectedCamp.description || 'No description supplied.'}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))', textTransform: 'uppercase', display: 'block' }}>Estimated Cost</span>
                    <span style={{ fontSize: '1.4rem', fontWeight: '800', color: '#10b981' }}>${selectedCamp.estimated_cost}</span>
                  </div>
                </div>

                {selectedCamp.review_remark && (
                  <div style={{ marginTop: '16px', padding: '12px 16px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', color: '#fca5a5', fontSize: '0.85rem' }}>
                    <strong>📌 Previous Revision Remark / Rejection Note:</strong>
                    <p style={{ margin: '4px 0 0', color: '#fff', fontStyle: 'italic', background: 'rgba(0,0,0,0.2)', padding: '8px 10px', borderRadius: '6px' }}>
                      "{selectedCamp.review_remark}"
                    </p>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginTop: '16px' }}>
                  <div>
                    <span style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))' }}>Audience Segment</span>
                    <strong style={{ display: 'block', fontSize: '0.95rem', marginTop: '2px' }}>
                      {getSegmentName(selectedCamp.segment_id)}
                    </strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))' }}>Target Size / Reach</span>
                    <strong style={{ display: 'block', fontSize: '0.95rem', marginTop: '2px' }}>
                      {selectedCamp.target_audience_count} users ({selectedCamp.estimated_reach} reachable)
                    </strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))' }}>Channels Requested</span>
                    <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                      {selectedCamp.channel_preferences.map(ch => (
                        <span key={ch} style={{ fontSize: '0.7rem', padding: '1px 6px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', textTransform: 'uppercase' }}>{ch}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))' }}>Launch Schedule</span>
                    <strong style={{ display: 'block', fontSize: '0.95rem', marginTop: '2px', color: selectedCamp.scheduled_at ? 'hsl(var(--primary))' : 'inherit' }}>
                      {selectedCamp.scheduled_at ? formatIST(selectedCamp.scheduled_at) : 'Immediate Dispatch'}
                    </strong>
                  </div>
                </div>
              </GlassCard>

              {/* Template Modifications Comparison (Diff Check) */}
              <GlassCard style={{ padding: '20px' }}>
                <h3 style={{ fontSize: '1.1rem', margin: '0 0 4px 0', fontWeight: 700 }}>Message Design Comparative Diffs</h3>
                <p style={{ fontSize: '0.82rem', color: 'hsl(var(--text-secondary))', margin: '0 0 12px 0' }}>Inspect the modifications proposed by the creator against baseline defaults.</p>
                {renderTemplateDiff()}
              </GlassCard>

              {/* Audit trail / Change History */}
              <GlassCard style={{ padding: '20px' }}>
                <h3 style={{ fontSize: '1.1rem', margin: '0 0 12px 0', fontWeight: 700 }}>Audit & Proposal Log Trails</h3>
                {renderAuditHistory()}
              </GlassCard>

              {/* Approval & Review Comments Panel */}
              <GlassCard style={{ padding: '20px' }}>
                <h3 style={{ fontSize: '1.1rem', margin: '0 0 12px 0', fontWeight: 700 }}>Reviewer Governance Assessment</h3>
                
                {actionError && (
                  <div className="alert alert-danger" style={{ marginBottom: '16px', fontSize: '0.88rem' }}>
                    ⚠️ {actionError}
                  </div>
                )}
                {actionSuccess && (
                  <div className="alert alert-success" style={{ marginBottom: '16px', fontSize: '0.88rem' }}>
                    ✅ {actionSuccess}
                  </div>
                )}

                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label className="form-label" style={{ fontWeight: 600, fontSize: '0.88rem', margin: 0 }}>
                      Review/Decision Comments (Mandatory for rejection)
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                    {[
                      "⚠️ Target count too broad — split into focused sub-segments",
                      "📞 Missing helpline phone number in emergency body",
                      "📝 Message tone needs formal phrasing",
                      "🏷️ Dynamic variable mismatch (check {{city}} tags)"
                    ].map(pill => (
                      <button
                        key={pill}
                        type="button"
                        style={{
                          fontSize: '0.72rem', padding: '3px 8px', borderRadius: '12px',
                          background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)',
                          color: '#fca5a5', cursor: 'pointer', textAlign: 'left'
                        }}
                        onClick={() => setReviewNote(pill)}
                      >
                        {pill}
                      </button>
                    ))}
                  </div>
                  <textarea
                    rows={3}
                    className="text-input"
                    value={reviewNote}
                    onChange={(e) => setReviewNote(e.target.value)}
                    placeholder="e.g. Approved: Copy reviewed and compliance verified. OR Rejected: Emergency alert text has duplicate warnings."
                    style={{ resize: 'vertical', fontSize: '0.88rem' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                  <button
                    className="btn btn-danger"
                    disabled={actionLoading}
                    onClick={handleReject}
                    style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', padding: '10px 20px', cursor: 'pointer', borderRadius: '8px', fontWeight: 600 }}
                  >
                    Reject Campaign
                  </button>
                  <button
                    className="btn btn-primary"
                    disabled={actionLoading}
                    onClick={handleApprove}
                    style={{ background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#10b981', padding: '10px 20px', cursor: 'pointer', borderRadius: '8px', fontWeight: 600 }}
                  >
                    {actionLoading ? 'Approving...' : 'Approve for Broadcast'}
                  </button>
                </div>
              </GlassCard>

            </div>
          ) : (
            <GlassCard style={{ padding: '32px', minHeight: '600px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0 0 8px', color: 'hsl(var(--text-primary))', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  🔒 Maker-Checker Compliance Protocol
                </h2>
                <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.9rem', lineHeight: '1.6', margin: 0 }}>
                  CommAI enforces dual-authorization (Maker-Checker mechanism) for high-impact communication. This dashboard ensures that all outgoing alerts are verified, cross-checked, and compliant with safety guidelines.
                </p>
              </div>

              {/* Protocol elements grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: '1.25rem', marginBottom: '8px' }}>✍️</div>
                  <h4 style={{ margin: '0 0 6px', fontSize: '0.9rem', fontWeight: 600 }}>1. The Maker (Creator)</h4>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'hsl(var(--text-muted))', lineHeight: '1.4' }}>
                    An operator or campaign manager sets target segments, chooses dispatch templates, and writes custom override messages. They submit it for approval.
                  </p>
                </div>

                <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: '1.25rem', marginBottom: '8px' }}>🔎</div>
                  <h4 style={{ margin: '0 0 6px', fontSize: '0.9rem', fontWeight: 600 }}>2. The Checker (Auditor)</h4>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'hsl(var(--text-muted))', lineHeight: '1.4' }}>
                    The system administrator audits the proposed modifications, checks estimated transmission costs, examines diff maps, and looks for compliance risks.
                  </p>
                </div>

                <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: '1.25rem', marginBottom: '8px' }}>⚖️</div>
                  <h4 style={{ margin: '0 0 6px', fontSize: '0.9rem', fontWeight: 600 }}>3. Approval or Rejection</h4>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'hsl(var(--text-muted))', lineHeight: '1.4' }}>
                    If safe, click <strong>Approve for Broadcast</strong> to queue delivery. If details are incorrect, enter review comments and click <strong>Reject Campaign</strong> to return it to draft.
                  </p>
                </div>

                <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: '1.25rem', marginBottom: '8px' }}>📝</div>
                  <h4 style={{ margin: '0 0 6px', fontSize: '0.9rem', fontWeight: 600 }}>4. Audit Trails</h4>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'hsl(var(--text-muted))', lineHeight: '1.4' }}>
                    Every approval action, rejection reason, and campaign status transition is immutable and stored in database logs for full accountability.
                  </p>
                </div>
              </div>

              {/* Tips for demo */}
              <div style={{ 
                padding: '16px', 
                borderRadius: '10px', 
                background: 'rgba(16, 185, 129, 0.05)', 
                border: '1px solid rgba(16, 185, 129, 0.15)',
                color: '#10b981',
                fontSize: '0.85rem',
                lineHeight: '1.5'
              }}>
                <strong>💡 Quick Start:</strong> Select a pending campaign from the <strong>Pending Inbox</strong> panel on the left. The auditor tools, diff checker, cost estimator, and log history will immediately render.
              </div>
            </GlassCard>
          )}
        </div>

      </div>
    </div>
  );
};

export default Approvals;
