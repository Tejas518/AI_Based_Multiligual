import React, { useState, useEffect, useCallback } from 'react';
import GlassCard from '../components/GlassCard';
import { parseApiError } from '../utils/apiError';

const Users = ({ user: _currentUser, backendUrl, headers }) => {
  const [activeSubTab, setActiveSubTab] = useState('active'); // 'active' or 'past'
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState('');
  const [message, setMessage] = useState(null);

  // Profile Modal State
  const [profileModalUser, setProfileModalUser] = useState(null);

  // Deletion Confirmation Popup Modal State
  const [deletionPopup, setDeletionPopup] = useState(null); // { title: string, text: string }

  // Form Modals
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState('create'); // 'create', 'edit', 'reset_pwd'
  const [selectedUser, setSelectedUser] = useState(null);

  // Form inputs
  const [formEmail, setFormEmail] = useState('');
  const [formFullName, setFormFullName] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formOrg, setFormOrg] = useState('');
  const [formDept, setFormDept] = useState('');
  const [formDesig, setFormDesig] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formTelegramUsername, setFormTelegramUsername] = useState('');
  const [formOccupation, setFormOccupation] = useState('');
  const [formAge, setFormAge] = useState(25);
  const [formGender, setFormGender] = useState('Other');
  const [formState, setFormState] = useState('');
  const [formDistrict, setFormDistrict] = useState('');
  const [formCity, setFormCity] = useState('');
  const [formPreferredChannels, setFormPreferredChannels] = useState(['email']);
  const [formPreferredLanguages, setFormPreferredLanguages] = useState(['English', 'Hindi']);
  const [activeModalTab, setActiveModalTab] = useState('personal'); // 'personal', 'location', 'channels'
  const [formActive, setFormActive] = useState(true);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const AVAILABLE_CHANNELS = [
    { id: 'email', label: 'Email', icon: '📧' },
    { id: 'voice', label: 'Call', icon: '📞' },
    { id: 'telegram', label: 'Telegram', icon: '✈️' },
    { id: 'sms', label: 'SMS', icon: '📱' },
    { id: 'push', label: 'Web/Push', icon: '🔔' },
  ];

  const POPULAR_LANGUAGES = [
    'English', 'Hindi', 'Bengali', 'Marathi', 'Telugu', 'Tamil', 'Gujarati', 'Urdu', 'Kannada', 'Odia', 'Malayalam', 'Punjabi'
  ];

  const toggleChannel = (channelId) => {
    setFormPreferredChannels(prev => 
      prev.includes(channelId)
        ? prev.filter(c => c !== channelId)
        : [...prev, channelId]
    );
  };

  const toggleLanguage = (lang) => {
    setFormPreferredLanguages(prev =>
      prev.includes(lang)
        ? prev.filter(l => l !== lang)
        : [...prev, lang]
    );
  };

  // Fetch Audience Users (Active or Past)
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      let url = `${backendUrl}/api/users?role=audience&is_deleted=${activeSubTab === 'past' ? 'true' : 'false'}`;
      const params = [];
      if (filterActive !== '') params.push(`is_active=${filterActive}`);
      if (search) params.push(`search=${encodeURIComponent(search)}`);
      
      if (params.length > 0) {
        url += `&${params.join('&')}`;
      }

      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error('Failed to load audience directory');
      const data = await response.json();
      setUsers(data);
    } catch (err) {
      console.error(err);
      setMessage({ text: 'Error loading audience records.', type: 'danger' });
    } finally {
      setLoading(false);
    }
  }, [backendUrl, headers, activeSubTab, filterActive, search]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Open Create Dialog
  const handleOpenCreate = () => {
    setModalType('create');
    setSelectedUser(null);
    setFormEmail('');
    setFormFullName('');
    setFormPassword('');
    setFormOrg('General Public');
    setFormDept('');
    setFormDesig('Citizen Recipient');
    setFormPhone('');
    setFormTelegramUsername('');
    setFormOccupation('General Public');
    setFormAge(25);
    setFormGender('Female');
    setFormState('Delhi');
    setFormDistrict('Central');
    setFormCity('New Delhi');
    setFormPreferredChannels(['email']); // Default email only
    setFormPreferredLanguages(['English', 'Hindi']);
    setFormActive(true);
    setFormError('');
    setActiveModalTab('personal');
    setModalOpen(true);
  };

  // Open Edit Dialog
  const handleOpenEdit = (u) => {
    setModalType('edit');
    setSelectedUser(u);
    setFormEmail(u.email);
    setFormFullName(u.full_name);
    setFormPassword('');
    setFormOrg(u.organization || '');
    setFormDept(u.department || '');
    setFormDesig(u.designation || '');
    setFormPhone(u.phone || '');
    setFormTelegramUsername(u.telegram_username ? u.telegram_username.replace(/^@/, '') : '');
    setFormOccupation(u.occupation || '');
    setFormAge(u.age || 25);
    setFormGender(u.gender || 'Other');
    setFormState(u.state || '');
    setFormDistrict(u.district || '');
    setFormCity(u.city || '');
    setFormPreferredChannels(u.preferred_channels && u.preferred_channels.length ? u.preferred_channels : ['email']);
    setFormPreferredLanguages(u.preferred_languages && u.preferred_languages.length ? u.preferred_languages : ['English']);
    setFormActive(u.is_active);
    setFormError('');
    setActiveModalTab('personal');
    setModalOpen(true);
  };

  // Open Password Reset Dialog
  const handleOpenResetPwd = (u) => {
    setModalType('reset_pwd');
    setSelectedUser(u);
    setFormPassword('');
    setFormError('');
    setModalOpen(true);
  };

  // Submit User Create / Edit / Password Reset
  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);

    try {
      if (modalType === 'create') {
        const response = await fetch(`${backendUrl}/api/users`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: formEmail,
            full_name: formFullName,
            password: formPassword,
            role: 'audience',
            organization: formOrg,
            department: formDept,
            designation: formDesig,
            phone: formPhone,
            telegram_username: formTelegramUsername ? `@${formTelegramUsername.replace(/^@/, '')}` : '',
            occupation: formOccupation,
            age: Number(formAge),
            gender: formGender,
            state: formState,
            district: formDistrict,
            city: formCity,
            preferred_channels: formPreferredChannels,
            preferred_languages: formPreferredLanguages,
          }),
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(parseApiError(errData, 'Failed to create audience user'));
        }

        setMessage({ text: `Audience user ${formFullName} created successfully!`, type: 'success' });
        setModalOpen(false);
        fetchUsers();
      } else if (modalType === 'edit') {
        const nameParts = formFullName.trim().split(/\s+/);
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        const response = await fetch(`${backendUrl}/api/users/${selectedUser.id}`, {
          method: 'PUT',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            full_name: formFullName,
            first_name: firstName,
            last_name: lastName,
            organization: formOrg,
            department: formDept,
            designation: formDesig,
            phone: formPhone,
            telegram_username: formTelegramUsername ? `@${formTelegramUsername.replace(/^@/, '')}` : '',
            occupation: formOccupation,
            age: Number(formAge),
            gender: formGender,
            state: formState,
            district: formDistrict,
            city: formCity,
            preferred_channels: formPreferredChannels,
            preferred_languages: formPreferredLanguages,
            is_active: formActive,
          }),
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.detail || 'Failed to update audience details');
        }

        setMessage({ text: 'Audience member updated successfully!', type: 'success' });
        setModalOpen(false);
        fetchUsers();
      } else if (modalType === 'reset_pwd') {
        if (!formPassword || formPassword.length < 6) {
          throw new Error('Password must be at least 6 characters long');
        }

        const response = await fetch(`${backendUrl}/api/users/${selectedUser.id}`, {
          method: 'PUT',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: formPassword }),
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.detail || 'Failed to reset password');
        }

        setMessage({ text: `Password reset successfully for ${selectedUser.full_name}!`, type: 'success' });
        setModalOpen(false);
      }
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Toggle Block / Activate
  const handleToggleBlock = async (u) => {
    try {
      const response = await fetch(`${backendUrl}/api/users/${u.id}`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !u.is_active })
      });
      if (!response.ok) throw new Error('Failed to update status');
      
      const newStatusText = u.is_active ? 'blocked / deactivated' : 'activated';
      setMessage({ text: `Audience user ${u.full_name} is now ${newStatusText}.`, type: 'success' });
      fetchUsers();
    } catch (err) {
      setMessage({ text: err.message, type: 'danger' });
    }
  };

  // Soft-Delete Audience User (Move to Past Audience)
  const handleSoftDelete = async (u) => {
    if (!window.confirm(`Are you sure you want to remove ${u.full_name}? They will be moved to Past Audience and all alerts suppressed.`)) {
      return;
    }

    try {
      const response = await fetch(`${backendUrl}/api/users/${u.id}`, {
        method: 'DELETE',
        headers,
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Failed to soft delete user');
      }

      // Real-Time state update: remove user from active view immediately
      setUsers(prev => prev.filter(x => x.id !== u.id));

      // Trigger Real-Time Deletion Confirmation Popup Modal
      setDeletionPopup({
        title: 'User Moved to Past Audience',
        text: `Audience member '${u.full_name}' (${u.email}) has been soft-deleted and moved to Past Audience. Data is preserved for historical reference, and all campaign alert deliveries have been permanently suppressed.`
      });
    } catch (err) {
      setMessage({ text: err.message, type: 'danger' });
    }
  };

  // Restore Audience User from Past Archive
  const handleRestore = async (u) => {
    try {
      const response = await fetch(`${backendUrl}/api/users/${u.id}/restore`, {
        method: 'POST',
        headers,
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Failed to restore user');
      }

      // Real-Time state update: remove user from past view
      setUsers(prev => prev.filter(x => x.id !== u.id));

      // Trigger Real-Time Restoration Confirmation Popup Modal
      setDeletionPopup({
        title: 'User Restored to Active Directory',
        text: `Audience member '${u.full_name}' (${u.email}) has been successfully restored to the Active Audience Directory.`
      });
    } catch (err) {
      setMessage({ text: err.message, type: 'danger' });
    }
  };

  // Stats calculation
  const totalAudience = users.length;
  const activeCount = users.filter(u => u.is_active).length;
  const blockedCount = users.filter(u => !u.is_active).length;

  return (
    <div className="tab-container animate-fade-in" style={{ padding: '8px 4px' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <p style={{ margin: '4px 0 0 0', color: 'hsl(var(--text-secondary))', fontSize: '0.95rem' }}>
            Manage platform audience members, credentials, detailed profiles, and account authorizations.
          </p>
        </div>
        <button className="add-audience-btn" onClick={handleOpenCreate}>
          <span>+ Add Audience Member</span>
        </button>
      </div>

      {/* Directory Sub-Tabs (Active vs Past Archive) */}
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
          👥 Active Audience Directory
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
          📦 Past Audience Archive
        </button>
      </div>

      {message && (
        <div 
          className={`alert alert-${message.type} animate-slide-left`} 
          style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <span>{message.text}</span>
          <button 
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold', color: 'inherit' }}
            onClick={() => setMessage(null)}
          >
            ×
          </button>
        </div>
      )}

      {/* Stats Counter Section */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '24px' }}>
        <GlassCard>
          <div style={{ padding: '8px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'hsl(var(--text-secondary))', textTransform: 'uppercase' }}>
              {activeSubTab === 'past' ? 'Archived Records' : 'Total Audience'}
            </span>
            <h3 style={{ fontSize: '2.2rem', fontWeight: 800, margin: '8px 0 0 0' }}>{totalAudience}</h3>
          </div>
        </GlassCard>
        <GlassCard>
          <div style={{ padding: '8px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'hsl(var(--text-secondary))', textTransform: 'uppercase' }}>Active Accounts</span>
            <h3 style={{ fontSize: '2.2rem', fontWeight: 800, margin: '8px 0 0 0', color: '#10b981' }}>{activeCount}</h3>
          </div>
        </GlassCard>
        <GlassCard>
          <div style={{ padding: '8px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'hsl(var(--text-secondary))', textTransform: 'uppercase' }}>Blocked / Inactive</span>
            <h3 style={{ fontSize: '2.2rem', fontWeight: 800, margin: '8px 0 0 0', color: '#ef4444' }}>{blockedCount}</h3>
          </div>
        </GlassCard>
      </div>

      {/* Filters & Search */}
      <GlassCard style={{ marginBottom: '24px', padding: '16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
          <div style={{ flex: '1', minWidth: '240px', position: 'relative' }}>
            <input
              type="text"
              placeholder="Search audience by name, email, organization..."
              className="text-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: '36px' }}
            />
            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'hsl(var(--text-secondary))' }}>🔍</span>
          </div>

          <div style={{ minWidth: '160px' }}>
            <select className="select-input" value={filterActive} onChange={(e) => setFilterActive(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="true">Active Only</option>
              <option value="false">Blocked / Inactive Only</option>
            </select>
          </div>
        </div>
      </GlassCard>

      {/* Audience Table List */}
      <GlassCard style={{ overflow: 'hidden' }}>
        {loading && users.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'hsl(var(--text-secondary))', fontWeight: 600 }}>
            Loading audience records...
          </div>
        ) : users.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'hsl(var(--text-secondary))' }}>
            {activeSubTab === 'past' ? 'No soft-deleted audience records in archive.' : 'No audience members found matching criteria.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
                  <th style={{ padding: '16px', fontWeight: 600 }}>Audience Member</th>
                  <th style={{ padding: '16px', fontWeight: 600 }}>Contact Info</th>
                  <th style={{ padding: '16px', fontWeight: 600 }}>Demographics</th>
                  <th style={{ padding: '16px', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '16px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr 
                    key={u.id} 
                    style={{ 
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                      opacity: u.is_active ? 1 : 0.65,
                      background: !u.is_active ? 'rgba(239,68,68,0.02)' : 'transparent',
                      transition: 'all 0.2s'
                    }}
                  >
                    <td style={{ padding: '16px' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.98rem' }}>{u.full_name}</div>
                      <div style={{ fontSize: '0.82rem', color: 'hsl(var(--text-secondary))', marginTop: '2px' }}>{u.organization || 'General Public'}</div>
                    </td>
                    <td style={{ padding: '16px' }}>
                      <div style={{ fontSize: '0.9rem' }}>{u.email}</div>
                      {u.phone && <div style={{ fontSize: '0.82rem', color: 'hsl(var(--text-secondary))', marginTop: '2px' }}>📞 {u.phone}</div>}
                    </td>
                    <td style={{ padding: '16px' }}>
                      <div style={{ fontSize: '0.88rem', fontWeight: 500 }}>
                        {u.occupation || 'Public'} • {u.age ? `${u.age} yrs` : 'N/A'} • {u.gender || 'N/A'}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'hsl(var(--text-secondary))', marginTop: '2px' }}>
                        📍 {[u.city, u.district, u.state].filter(Boolean).join(', ') || 'India'}
                      </div>
                    </td>
                    <td style={{ padding: '16px' }}>
                      {activeSubTab === 'past' ? (
                        <span style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.88rem', fontWeight: 600 }}>
                          <span style={{ width: '8px', height: '8px', background: '#f59e0b', borderRadius: '50%' }}></span>
                          Past / Archived
                        </span>
                      ) : u.is_active ? (
                        <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.88rem', fontWeight: 600 }}>
                          <span style={{ width: '8px', height: '8px', background: '#10b981', borderRadius: '50%' }}></span>
                          Active
                        </span>
                      ) : (
                        <span style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.88rem', fontWeight: 600 }}>
                          <span style={{ width: '8px', height: '8px', background: '#ef4444', borderRadius: '50%' }}></span>
                          Blocked / Inactive
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
                        {/* View Full Profile */}
                        <button 
                          className="btn-action-view" 
                          onClick={() => setProfileModalUser(u)} 
                          title="View Full Detailed Profile"
                        >
                          👁️ View Profile
                        </button>

                        {activeSubTab === 'active' ? (
                          <>
                            <button className="btn-action-edit" onClick={() => handleOpenEdit(u)} title="Edit Profile Details">
                              Edit
                            </button>
                            <button className="btn-action-key" onClick={() => handleOpenResetPwd(u)} title="Reset Password">
                              Key
                            </button>
                            <button 
                              className={u.is_active ? 'btn-action-block' : 'btn-action-unblock'}
                              onClick={() => handleToggleBlock(u)} 
                            >
                              {u.is_active ? 'Block' : 'Unblock'}
                            </button>
                            <button 
                              className="btn-action-delete"
                              onClick={() => handleSoftDelete(u)} 
                            >
                              Delete
                            </button>
                          </>
                        ) : (
                          <button 
                            className="btn-action-restore"
                            onClick={() => handleRestore(u)} 
                          >
                            ↩️ Restore Account
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {/* FULL PROFILE INSPECTION MODAL */}
      {profileModalUser && (
        <div className="modal-backdrop animate-fade-in" style={{ zIndex: 110 }}>
          <div className="modal-content animate-zoom-in" style={{ maxWidth: '650px', width: '100%' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', pb: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontWeight: 800, fontSize: '1.4rem', color: '#06b6d4' }}>
                  Audience Profile: {profileModalUser.full_name}
                </h3>
                <span style={{ fontSize: '0.82rem', color: 'hsl(var(--text-secondary))' }}>
                  System ID: {profileModalUser.id}
                </span>
              </div>
              <button 
                onClick={() => setProfileModalUser(null)} 
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.6rem', color: 'hsl(var(--text-secondary))' }}
              >
                ×
              </button>
            </div>

            <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Account Overview Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'hsl(var(--text-secondary))', textTransform: 'uppercase' }}>Email Address</label>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, marginTop: '2px' }}>{profileModalUser.email}</div>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'hsl(var(--text-secondary))', textTransform: 'uppercase' }}>Phone Number</label>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, marginTop: '2px' }}>{profileModalUser.phone || 'Not provided'}</div>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'hsl(var(--text-secondary))', textTransform: 'uppercase' }}>Telegram Username</label>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, marginTop: '2px', color: '#38bdf8' }}>
                    {profileModalUser.telegram_username ? `@${profileModalUser.telegram_username.replace(/^@+/, '')}` : 'Not linked'}
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'hsl(var(--text-secondary))', textTransform: 'uppercase' }}>Account Status</label>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, marginTop: '2px', color: profileModalUser.is_deleted ? '#f59e0b' : profileModalUser.is_active ? '#10b981' : '#ef4444' }}>
                    {profileModalUser.is_deleted ? 'Archived (Past)' : profileModalUser.is_active ? 'Active' : 'Blocked / Deactivated'}
                  </div>
                </div>
              </div>

              {/* Demographics & Location Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'hsl(var(--text-secondary))', textTransform: 'uppercase' }}>Age</label>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, marginTop: '2px' }}>{profileModalUser.age ? `${profileModalUser.age} years` : 'N/A'}</div>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'hsl(var(--text-secondary))', textTransform: 'uppercase' }}>Gender</label>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, marginTop: '2px' }}>{profileModalUser.gender || 'N/A'}</div>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'hsl(var(--text-secondary))', textTransform: 'uppercase' }}>Occupation</label>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, marginTop: '2px' }}>{profileModalUser.occupation || 'N/A'}</div>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'hsl(var(--text-secondary))', textTransform: 'uppercase' }}>City / Town</label>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, marginTop: '2px' }}>{profileModalUser.city || 'N/A'}</div>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'hsl(var(--text-secondary))', textTransform: 'uppercase' }}>District</label>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, marginTop: '2px' }}>{profileModalUser.district || 'N/A'}</div>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'hsl(var(--text-secondary))', textTransform: 'uppercase' }}>State</label>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, marginTop: '2px' }}>{profileModalUser.state || 'N/A'}</div>
                </div>
              </div>

              {/* Preferences & Affiliations */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'hsl(var(--text-secondary))', textTransform: 'uppercase' }}>Preferred Languages</label>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                    {profileModalUser.preferred_languages && profileModalUser.preferred_languages.length > 0 ? (
                      profileModalUser.preferred_languages.map(lang => (
                        <span key={lang} style={{ padding: '3px 10px', borderRadius: '6px', fontSize: '0.8rem', background: 'rgba(6, 182, 212, 0.15)', color: '#06b6d4', fontWeight: 600 }}>
                          {lang}
                        </span>
                      ))
                    ) : (
                      <span style={{ fontSize: '0.88rem', color: 'hsl(var(--text-secondary))' }}>English (default)</span>
                    )}
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'hsl(var(--text-secondary))', textTransform: 'uppercase' }}>Preferred Channels</label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                    {profileModalUser.preferred_channels && profileModalUser.preferred_channels.length > 0 ? (
                      profileModalUser.preferred_channels.map(ch => (
                        <span key={ch} className={`channel-badge channel-badge-${ch.toLowerCase()}`}>
                          {ch === 'email' ? '📧 Email' : ch === 'voice' ? '📞 Call' : ch === 'telegram' ? '✈️ Telegram' : ch === 'sms' ? '📱 SMS' : '🔔 Push'}
                        </span>
                      ))
                    ) : (
                      <span className="channel-badge channel-badge-email">📧 Email</span>
                    )}
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'hsl(var(--text-secondary))', textTransform: 'uppercase' }}>Organization</label>
                  <div style={{ fontSize: '0.92rem', fontWeight: 600, marginTop: '2px' }}>{profileModalUser.organization || 'General Public'}</div>
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'hsl(var(--text-secondary))', textTransform: 'uppercase' }}>Designation</label>
                  <div style={{ fontSize: '0.92rem', fontWeight: 600, marginTop: '2px' }}>{profileModalUser.designation || 'Citizen Recipient'}</div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '16px' }}>
              <button className="btn-close-profile" onClick={() => setProfileModalUser(null)}>
                Close Profile
              </button>
            </div>
          </div>
        </div>
      )}

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
            <button className="btn-acknowledge" onClick={() => setDeletionPopup(null)} style={{ width: '100%' }}>
              Acknowledge
            </button>
          </div>
        </div>
      )}

      {/* Create / Edit / Key Modal */}
      {modalOpen && (
        <div className="modal-backdrop animate-fade-in" style={{ zIndex: 100 }}>
          <div className="modal-content animate-zoom-in" style={{ maxWidth: '680px', width: '100%' }}>
            <div className="modal-header">
              <div>
                <h3 style={{ margin: 0, fontWeight: 700, fontSize: '1.35rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {modalType === 'create' ? '👤 Add New Audience Member' : modalType === 'edit' ? '✏️ Edit Audience Profile' : '🔑 Reset Account Password'}
                </h3>
                {modalType !== 'reset_pwd' && (
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'hsl(var(--text-secondary))' }}>
                    Configure personal profile, demography, delivery channels, and social handle coordinates.
                  </p>
                )}
              </div>
              <button 
                onClick={() => setModalOpen(false)} 
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.4rem', color: 'hsl(var(--text-secondary))' }}
              >
                ×
              </button>
            </div>
            
            <form onSubmit={handleSubmit} style={{ marginTop: '16px' }}>
              {formError && (
                <div className="alert alert-danger" style={{ marginBottom: '16px', fontSize: '0.88rem' }}>
                  ⚠️ {formError}
                </div>
              )}

              {modalType !== 'reset_pwd' && (
                <>
                  {/* Tab Navigation Header */}
                  <div className="audience-modal-tabs">
                    <button
                      type="button"
                      className={`audience-tab-btn ${activeModalTab === 'personal' ? 'active' : ''}`}
                      onClick={() => setActiveModalTab('personal')}
                    >
                      <span>👤</span> 1. Personal Profile
                    </button>
                    <button
                      type="button"
                      className={`audience-tab-btn ${activeModalTab === 'location' ? 'active' : ''}`}
                      onClick={() => setActiveModalTab('location')}
                    >
                      <span>📍</span> 2. Location & Job
                    </button>
                    <button
                      type="button"
                      className={`audience-tab-btn ${activeModalTab === 'channels' ? 'active' : ''}`}
                      onClick={() => setActiveModalTab('channels')}
                    >
                      <span>💬</span> 3. Channels & Handles
                    </button>
                  </div>

                  {/* TAB 1: PERSONAL PROFILE */}
                  {activeModalTab === 'personal' && (
                    <div className="animate-fade-in">
                      <div style={{ marginBottom: '14px' }}>
                        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'hsl(var(--text-secondary))', marginBottom: '6px' }}>Full Name *</label>
                        <input 
                          type="text" 
                          required 
                          className="text-input" 
                          value={formFullName} 
                          onChange={(e) => setFormFullName(e.target.value)} 
                          placeholder="e.g. Riyanshi Verma"
                        />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'hsl(var(--text-secondary))', marginBottom: '6px' }}>Email Address *</label>
                          <input 
                            type="email" 
                            required 
                            disabled={modalType === 'edit'}
                            className="text-input" 
                            value={formEmail} 
                            onChange={(e) => setFormEmail(e.target.value)} 
                            placeholder="riyanshi@example.com"
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'hsl(var(--text-secondary))', marginBottom: '6px' }}>Phone Number *</label>
                          <input 
                            type="text" 
                            required
                            className="text-input" 
                            value={formPhone} 
                            onChange={(e) => setFormPhone(e.target.value)} 
                            placeholder="919897157640"
                          />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'hsl(var(--text-secondary))', marginBottom: '6px' }}>Age</label>
                          <input 
                            type="number" 
                            className="text-input" 
                            value={formAge} 
                            onChange={(e) => setFormAge(e.target.value)} 
                            placeholder="25"
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'hsl(var(--text-secondary))', marginBottom: '6px' }}>Gender</label>
                          <select className="select-input" value={formGender} onChange={(e) => setFormGender(e.target.value)}>
                            <option value="Female">Female</option>
                            <option value="Male">Male</option>
                            <option value="Non-Binary">Non-Binary</option>
                            <option value="Prefer Not to Say">Prefer Not to Say</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                      </div>

                      {modalType === 'create' && (
                        <div style={{ marginBottom: '14px' }}>
                          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'hsl(var(--text-secondary))', marginBottom: '6px' }}>Set Account Password *</label>
                          <div style={{ position: 'relative' }}>
                            <input 
                              type={showPassword ? 'text' : 'password'}
                              required 
                              className="text-input" 
                              value={formPassword} 
                              onChange={(e) => setFormPassword(e.target.value)} 
                              placeholder="Min 6 characters"
                              style={{ paddingRight: '45px' }}
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              style={{
                                position: 'absolute',
                                right: '10px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '1rem',
                                color: 'hsl(var(--text-secondary))',
                                padding: '4px'
                              }}
                              title={showPassword ? "Hide password" : "Show password"}
                            >
                              {showPassword ? '🙈' : '👁️'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 2: LOCATION & DEMOGRAPHICS */}
                  {activeModalTab === 'location' && (
                    <div className="animate-fade-in">
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'hsl(var(--text-secondary))', marginBottom: '6px' }}>Occupation</label>
                          <input 
                            type="text" 
                            className="text-input" 
                            value={formOccupation} 
                            onChange={(e) => setFormOccupation(e.target.value)} 
                            placeholder="e.g. Student / Software Developer"
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'hsl(var(--text-secondary))', marginBottom: '6px' }}>Organization / Company</label>
                          <input 
                            type="text" 
                            className="text-input" 
                            value={formOrg} 
                            onChange={(e) => setFormOrg(e.target.value)} 
                            placeholder="e.g. Delhi University / Acme Corp"
                          />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'hsl(var(--text-secondary))', marginBottom: '6px' }}>Department</label>
                          <input 
                            type="text" 
                            className="text-input" 
                            value={formDept} 
                            onChange={(e) => setFormDept(e.target.value)} 
                            placeholder="e.g. Computer Science"
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'hsl(var(--text-secondary))', marginBottom: '6px' }}>Designation / Title</label>
                          <input 
                            type="text" 
                            className="text-input" 
                            value={formDesig} 
                            onChange={(e) => setFormDesig(e.target.value)} 
                            placeholder="e.g. Student / Lead Engineer"
                          />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'hsl(var(--text-secondary))', marginBottom: '6px' }}>State</label>
                          <input 
                            type="text" 
                            className="text-input" 
                            value={formState} 
                            onChange={(e) => setFormState(e.target.value)} 
                            placeholder="e.g. Uttar Pradesh"
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'hsl(var(--text-secondary))', marginBottom: '6px' }}>District</label>
                          <input 
                            type="text" 
                            className="text-input" 
                            value={formDistrict} 
                            onChange={(e) => setFormDistrict(e.target.value)} 
                            placeholder="e.g. Meerut"
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'hsl(var(--text-secondary))', marginBottom: '6px' }}>City</label>
                          <input 
                            type="text" 
                            className="text-input" 
                            value={formCity} 
                            onChange={(e) => setFormCity(e.target.value)} 
                            placeholder="e.g. Meerut"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 3: CHANNELS & HANDLES */}
                  {activeModalTab === 'channels' && (
                    <div className="animate-fade-in">
                      <div style={{ marginBottom: '18px' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'hsl(var(--text-primary))', marginBottom: '4px' }}>
                          Preferred Delivery Channels
                        </label>
                        <span style={{ fontSize: '0.78rem', color: 'hsl(var(--text-muted))' }}>
                          Select active channels for broadcast routing (Default: Email)
                        </span>

                        <div className="channel-pill-grid">
                          {AVAILABLE_CHANNELS.map(ch => {
                            const isSelected = formPreferredChannels.includes(ch.id);
                            return (
                              <div
                                key={ch.id}
                                className={`channel-pill-card channel-${ch.id} ${isSelected ? 'selected' : ''}`}
                                onClick={() => toggleChannel(ch.id)}
                              >
                                <span style={{ fontSize: '1.1rem' }}>{ch.icon}</span>
                                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{ch.label}</span>
                                {isSelected && <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'hsl(var(--accent))' }}>✓</span>}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Social Handles / Coordinates */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '18px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'hsl(var(--text-secondary))', marginBottom: '6px' }}>
                            ✈️ Telegram Username
                          </label>
                          <div className="input-addon-group">
                            <div className="input-addon-prefix">@</div>
                            <input
                              type="text"
                              className="text-input"
                              value={formTelegramUsername}
                              onChange={(e) => setFormTelegramUsername(e.target.value.replace(/^@/, ''))}
                              placeholder="username (only)"
                            />
                          </div>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'hsl(var(--text-secondary))', marginBottom: '6px' }}>
                            📱 Primary Mobile / SMS Number
                          </label>
                          <input
                            type="text"
                            className="text-input"
                            value={formPhone}
                            onChange={(e) => setFormPhone(e.target.value)}
                            placeholder="e.g. 919897157640"
                          />
                        </div>
                      </div>

                      {/* Preferred Languages */}
                      <div style={{ marginBottom: '14px' }}>
                        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'hsl(var(--text-secondary))', marginBottom: '4px' }}>
                          🌐 Preferred Communication Languages
                        </label>
                        <div className="chip-select-group">
                          {POPULAR_LANGUAGES.map(lang => {
                            const isSel = formPreferredLanguages.includes(lang);
                            return (
                              <div
                                key={lang}
                                className={`chip-tag ${isSel ? 'active' : ''}`}
                                onClick={() => toggleLanguage(lang)}
                              >
                                {isSel ? '✓ ' : '+ '}{lang}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Password Reset Only Layout */}
              {modalType === 'reset_pwd' && (
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'hsl(var(--text-secondary))', marginBottom: '6px' }}>
                    New Password
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input 
                      type={showPassword ? 'text' : 'password'} 
                      required 
                      className="text-input" 
                      value={formPassword} 
                      onChange={(e) => setFormPassword(e.target.value)} 
                      placeholder="Min 6 characters"
                      style={{ paddingRight: '45px' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '1rem',
                        color: 'hsl(var(--text-secondary))',
                        padding: '4px'
                      }}
                      title={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>
              )}

              {/* Modal Footer Controls */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '16px', marginTop: '20px' }}>
                <div style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))' }}>
                  {modalType !== 'reset_pwd' && (
                    <span>Channels Selected: <strong>{formPreferredChannels.join(', ') || 'None'}</strong></span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="button" className="modal-btn-cancel" onClick={() => setModalOpen(false)}>
                    Cancel
                  </button>
                  
                  {modalType !== 'reset_pwd' && activeModalTab !== 'channels' && (
                    <button
                      type="button"
                      className="modal-btn-next"
                      onClick={() => setActiveModalTab(activeModalTab === 'personal' ? 'location' : 'channels')}
                    >
                      Next Step →
                    </button>
                  )}

                  <button type="submit" className="modal-btn-submit" disabled={submitting}>
                    {submitting ? 'Processing...' : modalType === 'create' ? 'Create Audience' : modalType === 'edit' ? 'Save Profile Changes' : 'Update Password'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Users;
