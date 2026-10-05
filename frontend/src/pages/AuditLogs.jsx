import React, { useState, useEffect, useCallback } from 'react';
import GlassCard from '../components/GlassCard';

const AuditLogs = ({ user: _user, backendUrl, headers }) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [inspectLog, setInspectLog] = useState(null);
  const [copiedJson, setCopiedJson] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${backendUrl}/api/campaigns/audit-logs/all`, { headers });
      if (!response.ok) throw new Error('Failed to load audit logs');
      const data = await response.json();
      setLogs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [backendUrl, headers]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const getActionBadge = (action) => {
    switch (action) {
      case 'CREATE':
        return <span className="badge badge-communicator" style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'hsl(142, 70%, 50%)', fontWeight: 'bold' }}>CREATE</span>;
      case 'STATUS_CHANGE':
        return <span className="badge badge-manager" style={{ background: 'rgba(245, 158, 11, 0.15)', color: 'hsl(37, 90%, 55%)', fontWeight: 'bold' }}>STATUS</span>;
      case 'UPDATE':
        return <span className="badge badge-admin" style={{ background: 'rgba(59, 130, 246, 0.15)', color: 'hsl(217, 91%, 60%)', fontWeight: 'bold' }}>UPDATE</span>;
      case 'DELETE':
        return <span className="badge badge-danger" style={{ background: 'rgba(244, 63, 94, 0.15)', color: 'hsl(342, 90%, 60%)', fontWeight: 'bold' }}>DELETE</span>;
      default:
        return <span className="badge">{action}</span>;
    }
  };

  // Render pretty JSON diff representation
  const renderChanges = (changesJson) => {
    if (!changesJson) return <span style={{ color: 'hsl(var(--text-muted))' }}>No field details</span>;
    try {
      const diff = JSON.parse(changesJson);
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem' }}>
          {Object.entries(diff).map(([field, detail]) => {
            if (detail && typeof detail === 'object' && 'old' in detail && 'new' in detail) {
              return (
                <div key={field} style={{ background: 'rgba(0,0,0,0.15)', padding: '6px 10px', borderRadius: '6px', borderLeft: '3px solid hsl(var(--primary))' }}>
                  <strong style={{ color: 'hsl(var(--text-secondary))', textTransform: 'capitalize' }}>{field}: </strong>
                  <span className="danger-text" style={{ textDecoration: 'line-through', marginRight: '6px', fontSize: '0.8rem' }}>
                    {detail.old === null || detail.old === '' ? 'None' : String(detail.old)}
                  </span>
                  <span style={{ color: 'hsl(var(--text-muted))', marginRight: '6px' }}>➡️</span>
                  <span className="success-text" style={{ fontWeight: 'bold' }}>
                    {detail.new === null || detail.new === '' ? 'None' : String(detail.new)}
                  </span>
                </div>
              );
            }
            return (
              <div key={field} style={{ background: 'rgba(0,0,0,0.15)', padding: '6px 10px', borderRadius: '6px' }}>
                <strong style={{ color: 'hsl(var(--text-secondary))', textTransform: 'capitalize' }}>{field}: </strong>
                <span>{JSON.stringify(detail)}</span>
              </div>
            );
          })}
        </div>
      );
    } catch {
      return <code style={{ fontSize: '0.8rem' }}>{changesJson}</code>;
    }
  };

  const filteredLogs = logs.filter(log => {
    const matchesAction = !actionFilter || log.action === actionFilter;
    const matchesSearch = !search || 
      log.user_name.toLowerCase().includes(search.toLowerCase()) ||
      log.action.toLowerCase().includes(search.toLowerCase()) ||
      (log.changes && log.changes.toLowerCase().includes(search.toLowerCase()));
    return matchesAction && matchesSearch;
  });

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '24px' }}>
        <p style={{ color: 'hsl(var(--text-secondary))' }}>Inspect system events, campaign creations, configuration edits, and user logs.</p>
      </div>

      <GlassCard>
        <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
          <input
            type="text"
            className="form-control"
            placeholder="Search by operator, field name, changes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flexGrow: 1, minWidth: '240px' }}
          />
          <select 
            className="form-control" 
            value={actionFilter} 
            onChange={(e) => setActionFilter(e.target.value)}
            style={{ width: '200px' }}
          >
            <option value="">All Actions</option>
            <option value="CREATE">CREATE</option>
            <option value="UPDATE">UPDATE</option>
            <option value="STATUS_CHANGE">STATUS_CHANGE</option>
            <option value="DELETE">DELETE</option>
          </select>
          <button className="btn btn-dark" onClick={fetchLogs} disabled={loading}>
            Refresh
          </button>
          <button 
            className="btn btn-primary" 
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(0, 188, 212, 0.2)', border: '1px solid rgba(0, 188, 212, 0.4)', color: '#00e5ff' }}
            onClick={async () => {
              try {
                const queryParams = new URLSearchParams();
                if (actionFilter) queryParams.append('action_type', actionFilter);
                if (search) queryParams.append('search', search);

                const response = await fetch(`${backendUrl}/api/campaigns/audit-logs/export/all?${queryParams.toString()}`, { headers });
                if (!response.ok) {
                  const errData = await response.json().catch(() => ({}));
                  throw new Error(errData.detail || 'Export failed');
                }
                const blob = await response.blob();
                const downloadUrl = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = `audit_logs_${actionFilter ? actionFilter.toLowerCase() : 'filtered'}_${new Date().toISOString().slice(0, 10)}.csv`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(downloadUrl);
              } catch (err) {
                console.error('CSV Export Error:', err);
                alert(`CSV Export failed: ${err.message}`);
              }
            }}
            title="Export filtered operational audit logs to CSV"
          >
            📥 Export CSV ({filteredLogs.length})
          </button>
        </div>

        <div className="table-container">
          {loading ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'hsl(var(--text-secondary))' }}>
              Loading audit logs trail...
            </div>
          ) : filteredLogs.length === 0 ? (
            <p style={{ color: 'hsl(var(--text-muted))', textAlign: 'center', padding: '32px' }}>
              No audit logs match current filters.
            </p>
          ) : (
            <table className="custom-table" style={{ verticalAlign: 'top' }}>
              <thead>
                <tr>
                  <th style={{ width: '160px' }}>Timestamp</th>
                  <th style={{ width: '160px' }}>Operator</th>
                  <th style={{ width: '130px' }}>Action Type</th>
                  <th style={{ width: '160px' }}>State Details</th>
                  <th>Modified Property Details</th>
                  <th style={{ width: '120px' }}>Inspect</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map(log => (
                  <tr key={log.id}>
                    <td style={{ fontSize: '0.85rem', color: 'hsl(var(--text-secondary))' }}>
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: '600' }}>{log.user_name}</span>
                        <span style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))' }}>ID: {log.user_id.slice(0, 8)}...</span>
                      </div>
                    </td>
                    <td>{getActionBadge(log.action)}</td>
                    <td>
                      {log.action === 'STATUS_CHANGE' && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem' }}>
                          <span style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px', textTransform: 'capitalize' }}>
                            {log.old_status || 'none'}
                          </span>
                          <span>➡️</span>
                          <span className="badge badge-manager" style={{ textTransform: 'capitalize' }}>
                            {log.new_status}
                          </span>
                        </div>
                      )}
                      {log.action !== 'STATUS_CHANGE' && (
                        <span style={{ color: 'hsl(var(--text-muted))', fontSize: '0.85rem' }}>General</span>
                      )}
                    </td>
                    <td>{renderChanges(log.changes)}</td>
                    <td>
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: '0.75rem', padding: '4px 8px', color: '#00e5ff', background: 'rgba(0, 229, 255, 0.08)', border: '1px solid rgba(0, 229, 255, 0.2)', borderRadius: '6px' }}
                        onClick={() => setInspectLog(log)}
                      >
                        🔍 View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </GlassCard>

      {/* Interactive JSON Inspection Modal Overlay */}
      {inspectLog && (
        <div className="modal-overlay" style={{ zIndex: 1000, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
          <GlassCard className="modal-content animate-fade-in" style={{ width: '90%', maxWidth: '750px', maxHeight: '85vh', overflowY: 'auto', padding: '24px', background: 'rgba(18, 24, 38, 0.95)', border: '1px solid rgba(0, 212, 255, 0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '12px', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: '#00e5ff' }}>
                  🔍 Audit Event Inspection Drawer
                </h3>
                <span style={{ fontSize: '0.78rem', color: 'hsl(var(--text-muted))' }}>
                  Log ID: {inspectLog.id}
                </span>
              </div>
              <button className="btn btn-dark" style={{ padding: '4px 10px' }} onClick={() => setInspectLog(null)}>
                ✕
              </button>
            </div>

            {/* Log Metadata Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', background: 'rgba(0,0,0,0.3)', padding: '14px', borderRadius: '10px', marginBottom: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', display: 'block' }}>Operator / Actor</span>
                <strong style={{ fontSize: '0.9rem', color: '#fff' }}>{inspectLog.user_name}</strong>
                <div style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))' }}>User ID: {inspectLog.user_id}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', display: 'block' }}>Timestamp</span>
                <strong style={{ fontSize: '0.9rem', color: '#fff' }}>{new Date(inspectLog.timestamp).toLocaleString()}</strong>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', display: 'block' }}>Action Type</span>
                {getActionBadge(inspectLog.action)}
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', display: 'block' }}>Target Campaign ID</span>
                <span style={{ fontSize: '0.85rem', fontFamily: 'monospace', color: '#38bdf8' }}>{inspectLog.campaign_id || 'Global System Event'}</span>
              </div>
            </div>

            {/* Formatted Field Changes */}
            <div style={{ marginBottom: '16px' }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '8px', color: '#fff' }}>Field Changes & State Diffs</h4>
              {renderChanges(inspectLog.changes)}
            </div>

            {/* Raw JSON Payload Viewer */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: '#fff' }}>Raw Audit JSON Payload</h4>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: '0.75rem', padding: '4px 10px', color: copiedJson ? '#10b981' : '#00e5ff', background: 'rgba(0,229,255,0.1)', border: '1px solid rgba(0,229,255,0.3)', borderRadius: '6px' }}
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(inspectLog, null, 2));
                    setCopiedJson(true);
                    setTimeout(() => setCopiedJson(false), 2000);
                  }}
                >
                  {copiedJson ? '✅ Copied to Clipboard!' : '📋 Copy JSON Payload'}
                </button>
              </div>
              <pre style={{ background: '#0d1117', color: '#38bdf8', padding: '14px', borderRadius: '8px', fontSize: '0.8rem', overflowX: 'auto', maxHeight: '220px', border: '1px solid rgba(255,255,255,0.1)' }}>
                {JSON.stringify(inspectLog, null, 2)}
              </pre>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
};

export default AuditLogs;
