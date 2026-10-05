import React from 'react';

const Sidebar = ({ user, activeTab, setActiveTab, onLogout, sidebarCollapsed: _sidebarCollapsed, setSidebarCollapsed, closeMobileSidebar, emergencyCount, sosCount = 0, queriesCount, bulletinCount, operatorChatCount }) => {
  const menuItems = [
    { 
      id: 'dashboard', 
      label: 'Dashboard', 
      icon: (
        <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="9" />
          <rect x="14" y="3" width="7" height="5" />
          <rect x="14" y="12" width="7" height="9" />
          <rect x="3" y="16" width="7" height="5" />
        </svg>
      ), 
      roles: ['admin', 'campaign_manager', 'audience'] 
    },
    { 
      id: 'audiences', 
      label: 'Audience & Segments', 
      icon: (
        <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ), 
      roles: ['admin', 'campaign_manager'] 
    },
    { 
      id: 'templates', 
      label: 'Templates Library', 
      icon: (
        <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      ), 
      roles: ['admin', 'campaign_manager'] 
    },
    { 
      id: 'feedback', 
      label: 'Campaign Feedback', 
      icon: (
        <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ), 
      roles: ['admin', 'campaign_manager', 'audience'] 
    },
    { 
      id: 'campaigns', 
      label: 'Campaign Planner', 
      icon: (
        <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 2L11 13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      ), 
      // Communicators can view but not create campaigns — restrict at page level
      roles: ['admin', 'campaign_manager'] 
    },
    { 
      id: 'approvals', 
      label: 'Approvals Queue', 
      icon: (
        <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <path d="M9 15l2 2 4-4" />
        </svg>
      ), 
      roles: ['admin', 'campaign_manager'] 
    },
    { 
      id: 'users', 
      label: 'Audience Directory', 
      icon: (
        <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      ), 
      roles: ['admin', 'campaign_manager'] 
    },
    { 
      id: 'managers', 
      label: 'Campaign Managers', 
      icon: (
        <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="8.5" cy="7" r="4" />
          <line x1="20" y1="8" x2="20" y2="14" />
          <line x1="23" y1="11" x2="17" y2="11" />
        </svg>
      ), 
      roles: ['admin'] 
    },
    {
      id: 'emergency_inbox',
      label: 'Emergency Inbox',
      icon: (
        <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      ),
      roles: ['admin', 'campaign_manager']
    },
    {
      id: 'fact_shield',
      label: 'AI Fact Shield',
      icon: (
        <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      ),
      roles: ['admin', 'campaign_manager']
    },
    {
      id: 'support_queries',
      label: 'Support Queries',
      icon: (
        <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
      ),
      roles: ['admin', 'campaign_manager']
    },
    { 
      id: 'audit_logs', 
      label: 'Audit Logs', 
      icon: (
        <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      ), 
      roles: ['admin'] 
    },

    {
      id: 'poster_studio',
      label: 'Poster Studio',
      icon: (
        <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      ),
      roles: ['admin', 'campaign_manager']
    },
    {
      id: 'sentiment_map',
      label: 'Sentiment Map',
      icon: (
        <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="10" r="3" />
          <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z" />
        </svg>
      ),
      roles: ['admin', 'campaign_manager']
    },
    {
      id: 'citizen_conversations',
      label: 'Citizen RAG Chat',
      icon: (
        <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      ),
      roles: ['admin', 'campaign_manager', 'audience']
    },
    {
      id: 'operator_chat',
      label: 'Operator Staff Chat',
      icon: (
        <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
      roles: ['admin', 'campaign_manager']
    },
    {
      id: 'live_bulletins',
      label: 'Live Bulletins',
      icon: (
        <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 11a9 9 0 0 1 9 9" />
          <path d="M4 4a16 16 0 0 1 16 16" />
          <circle cx="5" cy="19" r="1" />
        </svg>
      ),
      roles: ['admin', 'campaign_manager', 'audience']
    },
    { 
      id: 'settings', 
      label: 'Settings', 
      icon: (
        <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      ), 
      roles: ['admin', 'campaign_manager', 'audience'] 
    },
    {
      id: 'sos_reports',
      label: 'SOS Reports',
      icon: (
        <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      ),
      roles: ['admin', 'campaign_manager', 'audience']
    },
  ];

  const categories = [
    {
      id: 'core',
      label: 'Core Dashboard',
      items: ['dashboard', 'live_bulletins']
    },
    {
      id: 'campaigns',
      label: 'Campaigns & Broadcasts',
      items: ['campaigns', 'templates', 'approvals', 'poster_studio']
    },
    {
      id: 'outreach',
      label: 'Audience & Insights',
      items: ['audiences', 'users', 'sentiment_map', 'feedback']
    },
    {
      id: 'emergency',
      label: 'Emergency Operations',
      items: ['sos_reports', 'emergency_inbox', 'fact_shield']
    },
    {
      id: 'support',
      label: 'Help Desk & Chat',
      items: ['citizen_conversations', 'support_queries', 'operator_chat']
    },
    {
      id: 'governance',
      label: 'System Governance',
      items: ['managers', 'audit_logs']
    },
    {
      id: 'settings',
      label: 'Preferences',
      items: ['settings']
    }
  ];

  const getRoleBadge = (role) => {
    switch (role) {
      case 'admin':
        return <span className="badge badge-admin">Admin</span>;
      case 'campaign_manager':
        return <span className="badge badge-manager">Manager</span>;
      case 'audience':
        return <span className="badge badge-audience" style={{ background: 'rgba(6, 182, 212, 0.12)', color: '#06b6d4', border: '1px solid rgba(6, 182, 212, 0.3)' }}>Audience</span>;
      default:
        return <span className="badge badge-communicator">Staff</span>;
    }
  };

  const getInitials = (name) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const renderedCategories = categories
    .map(cat => ({
      ...cat,
      items: menuItems.filter(item => cat.items.includes(item.id) && item.roles.includes(user.role))
    }))
    .filter(cat => cat.items.length > 0);

  return (
    <div className="sidebar animate-slide-left">
      <div className="sidebar-logo" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
            <img src="/logo.jpeg" alt="CommAI Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <span style={{ fontSize: '1.3rem', fontWeight: 700 }}>CommAI</span>
        </div>
        
        {/* Collapse / Close Trigger */}
        <button 
          className="icon-btn sidebar-collapse-btn" 
          onClick={() => {
            setSidebarCollapsed(true);
            if (closeMobileSidebar) closeMobileSidebar();
          }} 
          title="Close Navigation Sidebar"
          style={{ 
            padding: '6px', 
            borderRadius: '8px',
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            color: 'hsl(var(--text-primary))',
            cursor: 'pointer'
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      
      <div className="nav-menu-container" style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexGrow: 1, overflowY: 'auto', paddingBottom: '24px' }}>
        {renderedCategories.map(cat => (
          <div key={cat.id} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {!_sidebarCollapsed ? (
              <div style={{
                padding: '6px 14px 2px 14px',
                fontSize: '0.68rem',
                fontWeight: '900',
                textTransform: 'uppercase',
                color: 'hsl(var(--text-primary))',
                letterSpacing: '0.08em',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                opacity: 0.95
              }}>
                <span>{cat.label}</span>
                <div style={{ flexGrow: 1, height: '1.5px', background: 'rgba(255, 255, 255, 0.08)' }}></div>
              </div>
            ) : (
              <div style={{ margin: '4px 12px 2px 12px', borderTop: '1.5px solid rgba(255, 255, 255, 0.05)' }}></div>
            )}
            
            <ul className="nav-menu" style={{ gap: '2px', margin: 0, padding: 0, listStyle: 'none' }}>
              {cat.items.map(item => (
                <li
                  key={item.id}
                  className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab(item.id);
                    if (closeMobileSidebar) closeMobileSidebar();
                  }}
                  style={{ margin: '0 8px' }}
                >
                  <span className="nav-item-icon">
                    {item.icon}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between', width: '100%' }}>
                    <span>{item.label}</span>
                    {((item.id === 'emergency_inbox' && user.role !== 'audience') || (item.id === 'feedback' && user.role === 'audience')) && emergencyCount > 0 && (
                      <span 
                        style={{ 
                          background: '#ef4444', 
                          color: '#ffffff', 
                          borderRadius: '50%', 
                          width: '20px', 
                          height: '20px', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          fontSize: '0.75rem', 
                          fontWeight: '800',
                          lineHeight: '1',
                          boxShadow: '0 2px 5px rgba(239, 68, 68, 0.4)',
                          animation: 'pulse 2s infinite'
                        }}
                      >
                        {emergencyCount}
                      </span>
                    )}
                    {item.id === 'support_queries' && queriesCount > 0 && (
                      <span 
                        style={{ 
                          background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--secondary)) 100%)', 
                          color: '#ffffff', 
                          borderRadius: '50%', 
                          width: '20px', 
                          height: '20px', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          fontSize: '0.75rem', 
                          fontWeight: '800',
                          lineHeight: '1',
                          boxShadow: '0 2px 5px rgba(76, 140, 252, 0.3)',
                          animation: 'pulse 2s infinite'
                        }}
                      >
                        {queriesCount}
                      </span>
                    )}
                    {item.id === 'live_bulletins' && bulletinCount > 0 && (
                      <span 
                        style={{ 
                          background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)', 
                          color: '#ffffff', 
                          borderRadius: '50%', 
                          width: '20px', 
                          height: '20px', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          fontSize: '0.75rem', 
                          fontWeight: '800',
                          lineHeight: '1',
                          boxShadow: '0 2px 5px rgba(239, 68, 68, 0.4)',
                          animation: 'pulse 2s infinite'
                        }}
                      >
                        {bulletinCount}
                      </span>
                    )}
                    {item.id === 'operator_chat' && operatorChatCount > 0 && (
                      <span 
                        style={{ 
                          background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', 
                          color: '#ffffff', 
                          borderRadius: '50%', 
                          width: '20px', 
                          height: '20px', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          fontSize: '0.75rem', 
                          fontWeight: '800',
                          lineHeight: '1',
                          boxShadow: '0 2px 5px rgba(239, 68, 68, 0.4)',
                          animation: 'pulse 2s infinite'
                        }}
                      >
                        {operatorChatCount}
                      </span>
                    )}
                    {item.id === 'sos_reports' && sosCount > 0 && (
                      <span 
                        style={{ 
                          background: '#ef4444', 
                          color: '#ffffff', 
                          borderRadius: '50%', 
                          width: '20px', 
                          height: '20px', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          fontSize: '0.75rem', 
                          fontWeight: '800',
                          lineHeight: '1',
                          boxShadow: '0 2px 5px rgba(239, 68, 68, 0.4)',
                          animation: 'pulse 2s infinite'
                        }}
                      >
                        {sosCount}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      
      <div 
        className="sidebar-user" 
        onClick={(e) => {
          if (e.target.closest('.logout-btn')) return;
          setActiveTab('settings');
          if (closeMobileSidebar) closeMobileSidebar();
        }}
        style={{ cursor: 'pointer', transition: 'background 0.2s ease' }}
      >
        <div className="user-avatar" title={user.full_name}>
          {getInitials(user.full_name)}
        </div>
        <div className="user-info">
          <span className="user-name" title={user.full_name}>{user.full_name}</span>
          <span className="user-role" style={{ marginTop: '2px' }}>{getRoleBadge(user.role)}</span>
        </div>
        <button 
          className="logout-btn" 
          onClick={onLogout} 
          title="Log Out"
          style={{ width: '34px', height: '34px', flexShrink: 0 }}
        >
          <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '1.15rem', height: '1.15rem' }}>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
