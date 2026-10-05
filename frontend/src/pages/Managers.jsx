import React, { useState, useEffect, useCallback } from 'react';
import GlassCard from '../components/GlassCard';

const Managers = ({ user, backendUrl, headers }) => {
  const [activeSubTab, setActiveSubTab] = useState('active'); // 'active' or 'past'
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState('');
  const [message, setMessage] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [managerStats, setManagerStats] = useState({});

  // Real-Time Popup Modal State
  const [deletionPopup, setDeletionPopup] = useState(null); // { title: string, text: string }

  const fetchManagers = useCallback(async () => {
    setLoading(true);
    try {
      let url = `${backendUrl}/api/managers/detailed?is_deleted=${activeSubTab === 'past' ? 'true' : 'false'}`;
      const params = [];
      if (filterActive !== '') params.push(`is_active=${filterActive}`);
      if (search) params.push(`search=${encodeURIComponent(search)}`);
      
      if (params.length > 0) {
        url += `&${params.join('&')}`;
      }

      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error('Failed to load campaign managers');
      const data = await response.json();
      setManagers(data);
    } catch (err) {
      console.error(err);
      setMessage({ text: 'Error loading campaign managers list.', type: 'danger' });
    } finally {
      setLoading(false);
    }
  }, [backendUrl, headers, activeSubTab, filterActive, search]);

  const fetchManagerStats = useCallback(async () => {
    try {
      const response = await fetch(`${backendUrl}/api/dashboard/stats`, { headers });
      if (response.ok) {
        const data = await response.json();
        setManagerStats(data);
      }
    } catch (err) {
      console.error(err);
    }
  }, [backendUrl, headers]);

  useEffect(() => {
    fetchManagers();
    fetchManagerStats();
  }, [fetchManagers, fetchManagerStats]);

  const handleToggleActive = async (mgr) => {
    try {
      const response = await fetch(`${backendUrl}/api/users/${mgr.id}`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !mgr.is_active })
      });
      if (!response.ok) throw new Error('Failed to update status');
      setMessage({ text: `${mgr.full_name} has been ${mgr.is_active ? 'deactivated' : 'activated'}.`, type: 'success' });
      fetchManagers();
    } catch (err) {
      setMessage({ text: err.message, type: 'danger' });
    }
  };

  // Soft-Delete Campaign Manager
  const handleSoftDeleteManager = async (mgr) => {
    if (!window.confirm(`Are you sure you want to remove Campaign Manager ${mgr.full_name}? They will be moved to Past Campaign Managers.`)) {
      return;
    }
    try {
      const response = await fetch(`${backendUrl}/api/users/${mgr.id}`, {
        method: 'DELETE',
        headers
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Failed to soft delete manager');
      }

      // Real-Time State Update: remove manager from active view
      setManagers(prev => prev.filter(m => m.id !== mgr.id));

      // Trigger Real-Time Deletion Confirmation Popup Modal
      setDeletionPopup({
        title: 'Manager Moved to Past Campaign Managers',
        text: `Campaign Manager '${mgr.full_name}' (${mgr.email}) has been soft-deleted and moved to Past Campaign Managers. Account credentials have been deactivated and historical performance metrics preserved.`
      });
    } catch (err) {
      setMessage({ text: err.message, type: 'danger' });
    }
  };

  // Restore Campaign Manager
  const handleRestoreManager = async (mgr) => {
    try {
      const response = await fetch(`${backendUrl}/api/users/${mgr.id}/restore`, {
        method: 'POST',
        headers
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Failed to restore manager');
      }

      // Real-Time State Update: remove manager from past view
      setManagers(prev => prev.filter(m => m.id !== mgr.id));

      // Trigger Real-Time Restoration Confirmation Popup Modal
      setDeletionPopup({
        title: 'Manager Restored to Active Directory',
        text: `Campaign Manager '${mgr.full_name}' (${mgr.email}) has been successfully restored to the Active Campaign Managers Directory.`
      });
    } catch (err) {
      setMessage({ text: err.message, type: 'danger' });
    }
  };

  const activeCount = managers.filter(m => m.is_active).length;
  const inactiveCount = managers.filter(m => !m.is_active).length;

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <p style={{ color: 'hsl(var(--text-secondary))' }}>Manage and monitor all campaign manager accounts on the platform.</p>
        </div>
      </div>

      {/* Directory Sub-Tabs */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', borderBottom: '1px solid rgba(255,255,255,0.08)', pb: '12px' }}>
        <button
          onClick={() => setActiveSubTab('active')}
          style={{
            padding: '10px 20px',
            borderRadius: '10px',
            fontSize: '0.92rem',
            fontWeight: 700,
            cursor: 'pointer',
            background: activeSubTab === 'active' ? 'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--secondary)) 100%)' : 'var(--input-bg, rgba(255,255,255,0.04))',
            color: activeSubTab === 'active' ? '#ffffff' : 'hsl(var(--text-primary))',
            border: activeSubTab === 'active' ? 'none' : '1px solid var(--input-border, rgba(255,255,255,0.12))',
            transition: 'all 0.2s ease'
          }}
        >
          👔 Active Campaign Managers
        </button>
        <button
          onClick={() => setActiveSubTab('past')}
          style={{
            padding: '10px 20px',
            borderRadius: '10px',
            fontSize: '0.92rem',
            fontWeight: 700,
            cursor: 'pointer',
            background: activeSubTab === 'past' ? 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)' : 'var(--input-bg, rgba(255,255,255,0.04))',
            color: activeSubTab === 'past' ? '#ffffff' : 'hsl(var(--text-primary))',
            border: activeSubTab === 'past' ? 'none' : '1px solid var(--input-border, rgba(255,255,255,0.12))',
            transition: 'all 0.2s ease'
          }}
        >
          📁 Past Campaign Managers Archive
        </button>
      </div>

      {message && (
        <div 
          className={`glass-card animate-fade-in`} 
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

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '28px' }}>
        <GlassCard style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '0.82rem', color: 'hsl(var(--text-muted))', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {activeSubTab === 'past' ? 'Archived Managers' : 'Total Managers'}
          </span>
          <span style={{ fontSize: '2rem', fontWeight: '800', color: 'hsl(var(--text-primary))' }}>{managers.length}</span>
        </GlassCard>
        <GlassCard style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '0.82rem', color: 'hsl(var(--text-muted))', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active</span>
          <span style={{ fontSize: '2rem', fontWeight: '800', color: 'hsl(var(--accent))' }}>{activeCount}</span>
        </GlassCard>
        <GlassCard style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '0.82rem', color: 'hsl(var(--text-muted))', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Inactive</span>
          <span style={{ fontSize: '2rem', fontWeight: '800', color: 'hsl(var(--danger))' }}>{inactiveCount}</span>
        </GlassCard>
        <GlassCard style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '0.82rem', color: 'hsl(var(--text-muted))', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Campaigns</span>
          <span style={{ fontSize: '2rem', fontWeight: '800', color: 'hsl(var(--primary))' }}>{managerStats.total_campaigns || 0}</span>
        </GlassCard>
      </div>

      {/* Filters */}
      <GlassCard>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '24px', alignItems: 'center' }}>
          <input
            type="text"
            className="form-control"
            placeholder="Search by name, email, organization..."
            style={{ minWidth: '280px', flexGrow: 1 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="form-control" value={filterActive} onChange={(e) => setFilterActive(e.target.value)}>
            <option value="">All Status</option>
            <option value="true">Active Only</option>
            <option value="false">Inactive Only</option>
          </select>
        </div>

        {/* Manager Cards */}
        <div className="table-container">
          {loading ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'hsl(var(--text-secondary))' }}>
              Loading campaign manager profiles...
            </div>
          ) : managers.length === 0 ? (
            <p style={{ color: 'hsl(var(--text-muted))', textAlign: 'center', padding: '32px' }}>
              {activeSubTab === 'past' ? 'No soft-deleted campaign managers in archive.' : 'No campaign managers found.'}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {managers.map(mgr => {
                const isExpanded = expandedId === mgr.id;
                return (
                  <div
                    key={mgr.id}
                    style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      borderRadius: '14px',
                      padding: '20px',
                      transition: 'all 0.2s ease',
                      cursor: 'pointer'
                    }}
                    onClick={() => setExpandedId(isExpanded ? null : mgr.id)}
                  >
                    {/* Header Row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{
                          width: '44px',
                          height: '44px',
                          borderRadius: '12px',
                          background: mgr.is_deleted ? 'rgba(245, 158, 11, 0.15)' : mgr.is_active ? 'rgba(59, 130, 246, 0.12)' : 'rgba(244, 63, 94, 0.1)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: '800',
                          fontSize: '1rem',
                          color: mgr.is_deleted ? '#f59e0b' : mgr.is_active ? 'hsl(var(--primary))' : 'hsl(var(--danger))',
                          flexShrink: 0
                        }}>
                          {mgr.full_name ? mgr.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'M'}
                        </div>
                        <div>
                          <div style={{ fontWeight: '700', fontSize: '1rem', color: 'hsl(var(--text-primary))' }}>{mgr.full_name}</div>
                          <div style={{ fontSize: '0.85rem', color: 'hsl(var(--text-muted))' }}>{mgr.email}</div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{
                          padding: '4px 12px',
                          borderRadius: '100px',
                          fontSize: '0.78rem',
                          fontWeight: '700',
                          background: activeSubTab === 'past' ? 'rgba(245, 158, 11, 0.15)' : mgr.is_active ? 'rgba(34, 197, 94, 0.1)' : 'rgba(244, 63, 94, 0.1)',
                          color: activeSubTab === 'past' ? '#f59e0b' : mgr.is_active ? 'hsl(var(--accent))' : 'hsl(var(--danger))',
                          border: `1px solid ${activeSubTab === 'past' ? 'rgba(245, 158, 11, 0.3)' : mgr.is_active ? 'rgba(34, 197, 94, 0.2)' : 'rgba(244, 63, 94, 0.2)'}`
                        }}>
                          {activeSubTab === 'past' ? 'Archived (Past)' : mgr.is_active ? 'Active' : 'Inactive'}
                        </span>
                        <svg
                          className="svg-icon"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          style={{
                            width: '16px',
                            height: '16px',
                            color: 'hsl(var(--text-muted))',
                            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 0.2s ease'
                          }}
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <div className="animate-fade-in" style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                          <div>
                            <div style={{ fontSize: '0.78rem', color: 'hsl(var(--text-muted))', fontWeight: '600', textTransform: 'uppercase', marginBottom: '4px' }}>Organization</div>
                            <div style={{ fontSize: '0.92rem', fontWeight: '600', color: 'hsl(var(--text-secondary))' }}>{mgr.organization || 'Not specified'}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '0.78rem', color: 'hsl(var(--text-muted))', fontWeight: '600', textTransform: 'uppercase', marginBottom: '4px' }}>Designation</div>
                            <div style={{ fontSize: '0.92rem', fontWeight: '600', color: 'hsl(var(--text-secondary))' }}>{mgr.designation || 'Not specified'}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '0.78rem', color: 'hsl(var(--text-muted))', fontWeight: '600', textTransform: 'uppercase', marginBottom: '4px' }}>Joined Date</div>
                            <div style={{ fontSize: '0.92rem', fontWeight: '600', color: 'hsl(var(--text-secondary))' }}>
                              {mgr.created_at ? new Date(mgr.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' }) : 'N/A'}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                          <div>
                            <div style={{ fontSize: '0.78rem', color: 'hsl(var(--text-muted))', fontWeight: '600', textTransform: 'uppercase', marginBottom: '4px' }}>Campaigns Created</div>
                            <div style={{ fontSize: '1.25rem', fontWeight: '800', color: 'hsl(var(--primary))' }}>{mgr.campaigns_created}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '0.78rem', color: 'hsl(var(--text-muted))', fontWeight: '600', textTransform: 'uppercase', marginBottom: '4px' }}>Templates Created</div>
                            <div style={{ fontSize: '1.25rem', fontWeight: '800', color: 'hsl(var(--secondary))' }}>{mgr.templates_created}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '0.78rem', color: 'hsl(var(--text-muted))', fontWeight: '600', textTransform: 'uppercase', marginBottom: '4px' }}>Dispatches (Sent / Failed)</div>
                            <div style={{ fontSize: '0.92rem', fontWeight: '600', color: 'hsl(var(--text-secondary))' }}>
                              <span style={{ color: 'hsl(var(--accent))' }}>{mgr.total_sent}</span> / <span style={{ color: 'hsl(var(--danger))' }}>{mgr.total_failed}</span>
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                          {activeSubTab === 'active' ? (
                            <>
                              <button
                                className={`btn ${mgr.is_active ? 'btn-danger' : 'btn-primary'}`}
                                style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                                onClick={() => handleToggleActive(mgr)}
                              >
                                {mgr.is_active ? 'Deactivate Account' : 'Activate Account'}
                              </button>
                              <button
                                className="btn btn-danger"
                                style={{ padding: '8px 16px', fontSize: '0.85rem', background: 'rgba(239, 68, 68, 0.1)', color: 'hsl(var(--danger))', border: '1px solid rgba(239, 68, 68, 0.2)' }}
                                onClick={() => handleSoftDeleteManager(mgr)}
                              >
                                Move to Past Managers
                              </button>
                            </>
                          ) : (
                            <button
                              className="btn btn-primary"
                              style={{ padding: '8px 18px', fontSize: '0.85rem', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#ffffff' }}
                              onClick={() => handleRestoreManager(mgr)}
                            >
                              ↩️ Restore Campaign Manager
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </GlassCard>

      {/* REAL-TIME DELETION / RESTORATION POPUP MODAL */}
      {deletionPopup && (
        <div className="modal-backdrop animate-fade-in" style={{ zIndex: 120 }}>
          <div className="modal-content animate-zoom-in" style={{ maxWidth: '480px', width: '100%', textAlign: 'center', padding: '32px' }}>
            <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(6, 182, 212, 0.15)', color: '#06b6d4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', margin: '0 auto 16px auto' }}>
              ℹ️
            </div>
            <h3 style={{ margin: 0, fontWeight: 800, fontSize: '1.35rem' }}>{deletionPopup.title}</h3>
            <p style={{ margin: '12px 0 24px 0', color: 'hsl(var(--text-secondary))', fontSize: '0.92rem', lineHeight: '1.5' }}>
              {deletionPopup.text}
            </p>
            <button className="primary-btn" onClick={() => setDeletionPopup(null)} style={{ width: '100%' }}>
              Acknowledge
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Managers;
