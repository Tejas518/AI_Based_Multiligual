import React, { useState } from 'react';
import GlassCard from '../components/GlassCard';

const Login = ({ onLoginSuccess, backendUrl, onBackToLanding, initialRegister, theme = 'dark', toggleTheme }) => {
  const [isRegister, setIsRegister] = useState(initialRegister || false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  
  // Audience-specific profile details
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [occupation, setOccupation] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('Male');
  const [stateName, setStateName] = useState('');
  const [districtName, setDistrictName] = useState('');
  const [cityName, setCityName] = useState('');
  const [preferredChannels, setPreferredChannels] = useState(['email']);

  const [selectedRole, setSelectedRole] = useState('audience');
  const [organization, setOrganization] = useState('');
  const [designation, setDesignation] = useState('');
  const [orgSelect, setOrgSelect] = useState('Ministry of Health');
  const [desigSelect, setDesigSelect] = useState('Director');
  const [preferredLangs, setPreferredLangs] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [otpMode, setOtpMode] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpMessage, setOtpMessage] = useState('');
  const [activeTab, setActiveTab] = useState('password'); // 'password', 'otp', or 'forgot_password'
  const [forgotPasswordStep, setForgotPasswordStep] = useState('email'); // 'email' or 'reset'
  const [resetOtpCode, setResetOtpCode] = useState('');
  const [newPasswordReset, setNewPasswordReset] = useState('');

  // Public SOS Modal states
  const [showSosModal, setShowSosModal] = useState(false);
  const [sosTitle, setSosTitle] = useState('');
  const [sosDesc, setSosDesc] = useState('');
  const [sosType, setSosType] = useState('medical');
  const [sosLat, setSosLat] = useState('');
  const [sosLng, setSosLng] = useState('');
  const [sosLocName, setSosLocName] = useState('');
  const [sosName, setSosName] = useState('');
  const [sosPhone, setSosPhone] = useState('');
  const [sosEmail, setSosEmail] = useState('');
  const [sosLocLoading, setSosLocLoading] = useState(false);
  const [sosSubmitting, setSosSubmitting] = useState(false);
  const [sosModalSuccess, setSosModalSuccess] = useState('');
  const [sosModalError, setSosModalError] = useState('');

  const handleAnonymousSOSSubmit = async (e) => {
    e.preventDefault();
    if (!sosTitle.trim() || !sosDesc.trim()) {
      setSosModalError('Please specify title and description of the emergency hazard.');
      return;
    }
    setSosSubmitting(true);
    setSosModalError('');
    setSosModalSuccess('');
    try {
      const res = await fetch(`${backendUrl}/api/sos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: sosTitle.trim(),
          description: sosDesc.trim(),
          report_type: sosType,
          latitude: sosLat ? parseFloat(sosLat) : null,
          longitude: sosLng ? parseFloat(sosLng) : null,
          location_name: sosLocName.trim(),
          reporter_name: sosName.trim(),
          reporter_phone: sosPhone.trim(),
          reporter_email: sosEmail.trim()
        })
      });
      const text = await res.text();
      let data = {};
      if (text) {
        try {
          data = JSON.parse(text);
        } catch (e) {
          throw new Error(`Invalid response format: ${text.substring(0, 100)}`);
        }
      } else {
        throw new Error(`Empty response from server (Status: ${res.status})`);
      }
      if (!res.ok) {
        let errStr = 'Emergency distress call failed.';
        if (Array.isArray(data.detail)) {
          errStr = data.detail.map(d => d.msg || JSON.stringify(d)).join(', ');
        } else if (data.detail && typeof data.detail === 'object') {
          errStr = data.detail.message || JSON.stringify(data.detail);
        } else if (data.detail) {
          errStr = String(data.detail);
        }
        throw new Error(errStr);
      }
      setSosModalSuccess('Distress report submitted successfully! Dispatch operators have been notified.');
      
      // Reset form
      setSosTitle('');
      setSosDesc('');
      setSosLat('');
      setSosLng('');
      setSosLocName('');
      setSosName('');
      setSosPhone('');
      setSosEmail('');
      
      // Close modal after a short delay
      setTimeout(() => {
        setShowSosModal(false);
        setSosModalSuccess('');
      }, 3500);
    } catch (err) {
      setSosModalError(err.message);
    } finally {
      setSosSubmitting(false);
    }
  };

  const handleGrabSosLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }
    setSosLocLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setSosLat(pos.coords.latitude.toFixed(6));
        setSosLng(pos.coords.longitude.toFixed(6));
        setSosLocName(`GPS: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
        setSosLocLoading(false);
      },
      (err) => {
        console.error(err);
        alert('Could not retrieve GPS coordinates. Please enter location manually.');
        setSosLocLoading(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const demoAccounts = [
    { label: '🛡️ Admin Account', email: 'admin@example.com', password: 'AdminPassword123!' },
    { label: '💼 Campaign Manager', email: 'manager@example.com', password: 'ManagerPassword123!' },
    { label: '📣 Audience Member', email: 'audience@example.com', password: 'AudiencePass123!' }
  ];

  const handlePreFill = (demo) => {
    setIsRegister(false);
    setActiveTab('password');
    setOtpMode(false);
    setEmail(demo.email);
    setPassword(demo.password);
    setError('');
  };

  const handlePasswordLogin = async (e) => {
    if (e) e.preventDefault();
    if (!email || !password) {
      setError('Please provide email and password credentials');
      return;
    }
    setError('');
    setLoading(true);

    try {
      const formData = new URLSearchParams();
      formData.append('username', email);
      formData.append('password', password);

      const response = await fetch(`${backendUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData
      });

      const text = await response.text();
      let data = {};
      if (text) {
        try {
          data = JSON.parse(text);
        } catch (e) {
          // Server returned non-JSON (likely a Vercel/CDN 404 page or proxy error)
          if (text.includes('NOT_FOUND') || text.includes('<!DOCTYPE') || text.includes('<html')) {
            throw new Error('Backend server is unreachable. Please ensure the API server is running.');
          }
          throw new Error(`Invalid server response format: ${text.substring(0, 100)}`);
        }
      } else {
        throw new Error(`Empty response from server (Status: ${response.status})`);
      }

      if (!response.ok) {
        throw new Error(data.detail || 'Login failed');
      }

      onLoginSuccess(data.access_token, data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (selectedRole === 'audience') {
      if (!firstName || !email || !password || !phone) {
        setError('First Name, Email, Password, and Phone number are required');
        return;
      }
    } else {
      if (!email || !password || !fullName) {
        setError('Full Name, Email, and Password are required');
        return;
      }
    }
    setError('');
    setLoading(true);

    try {
      const payload = {
        email,
        password,
        full_name: selectedRole === 'audience' ? `${firstName} ${lastName}` : fullName,
        role: selectedRole,
        organization: selectedRole === 'audience' ? null : (orgSelect === 'Other' ? (organization || null) : (orgSelect || null)),
        designation: selectedRole === 'audience' ? null : (desigSelect === 'Other' ? (designation || null) : (desigSelect || null)),
        preferred_languages: preferredLangs,
        
        // Audience fields
        first_name: selectedRole === 'audience' ? firstName : null,
        last_name: selectedRole === 'audience' ? lastName : null,
        phone: selectedRole === 'audience' ? phone : null,
        occupation: selectedRole === 'audience' ? (occupation || 'General') : null,
        age: selectedRole === 'audience' ? (parseInt(age) || null) : null,
        gender: selectedRole === 'audience' ? gender : null,
        state: selectedRole === 'audience' ? stateName : null,
        district: selectedRole === 'audience' ? districtName : null,
        city: selectedRole === 'audience' ? cityName : null,
        preferred_channels: selectedRole === 'audience' ? preferredChannels : []
      };

      const response = await fetch(`${backendUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const text = await response.text();
      let data = {};
      if (text) {
        try {
          data = JSON.parse(text);
        } catch (e) {
          throw new Error(`Invalid response format: ${text.substring(0, 100)}`);
        }
      } else {
        throw new Error(`Empty response from server (Status: ${response.status})`);
      }
      if (!response.ok) {
        throw new Error(data.detail || 'Registration failed');
      }

      // Automatically login on successful sign up
      const formData = new URLSearchParams();
      formData.append('username', email);
      formData.append('password', password);

      const loginResponse = await fetch(`${backendUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData
      });

      const loginText = await loginResponse.text();
      let loginData = {};
      if (loginText) {
        try {
          loginData = JSON.parse(loginText);
        } catch (e) {
          throw new Error(`Invalid response format: ${loginText.substring(0, 100)}`);
        }
      } else {
        throw new Error(`Empty response from server (Status: ${loginResponse.status})`);
      }
      if (!loginResponse.ok) {
        throw new Error(loginData.detail || 'Login auto-trigger failed');
      }

      onLoginSuccess(loginData.access_token, loginData.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestOTP = async (e) => {
    if (e) e.preventDefault();
    if (!email) {
      setError('Please enter your email address first');
      return;
    }
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${backendUrl}/api/auth/request-otp?email=${encodeURIComponent(email)}`, {
        method: 'POST'
      });

      const text = await response.text();
      let data = {};
      if (text) {
        try {
          data = JSON.parse(text);
        } catch (e) {
          throw new Error(`Invalid response format: ${text.substring(0, 100)}`);
        }
      } else {
        throw new Error(`Empty response from server (Status: ${response.status})`);
      }
      if (!response.ok) {
        throw new Error(data.detail || 'OTP Request failed');
      }

      setOtpMode(true);
      if (data.mocked && data.otp) {
        setOtpMessage(`${data.message}. (For testing, enter OTP code: ${data.otp})`);
      } else {
        setOtpMessage(`${data.message}. Check your email box for the verification code.`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  const handleForgotPasswordRequestOTP = async (e) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter your email address to receive reset OTP');
      return;
    }
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${backendUrl}/api/auth/request-otp?email=${encodeURIComponent(email)}`, {
        method: 'POST'
      });

      const text = await response.text();
      let data = {};
      if (text) {
        try {
          data = JSON.parse(text);
        } catch (e) {
          throw new Error(`Invalid response format: ${text.substring(0, 100)}`);
        }
      } else {
        throw new Error(`Empty response from server (Status: ${response.status})`);
      }
      if (!response.ok) {
        throw new Error(data.detail || 'Failed to request reset OTP');
      }

      setForgotPasswordStep('reset');
      if (data.mocked && data.otp) {
        setOtpMessage(`Reset code sent! (Sandbox mode OTP: ${data.otp})`);
      } else {
        setOtpMessage('Reset code sent! Please check your registered email box.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPasswordReset = async (e) => {
    e.preventDefault();
    if (!resetOtpCode || !newPasswordReset) {
      setError('OTP code and New Password are required');
      return;
    }
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${backendUrl}/api/auth/reset-password-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: resetOtpCode, new_password: newPasswordReset })
      });

      const text = await response.text();
      let data = {};
      if (text) {
        try {
          data = JSON.parse(text);
        } catch (e) {
          throw new Error(`Invalid response format: ${text.substring(0, 100)}`);
        }
      } else {
        throw new Error(`Empty response from server (Status: ${response.status})`);
      }
      if (!response.ok) {
        throw new Error(data.detail || 'Reset failed');
      }

      // Success! Back to login
      setActiveTab('password');
      setForgotPasswordStep('email');
      setResetOtpCode('');
      setNewPasswordReset('');
      setOtpMessage('');
      setError('');
      alert(data.message || 'Password reset successfully! You can now log in.');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    if (!otpCode) {
      setError('Please enter the verification OTP code');
      return;
    }
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${backendUrl}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: otpCode })
      });

      const text = await response.text();
      let data = {};
      if (text) {
        try {
          data = JSON.parse(text);
        } catch (e) {
          throw new Error(`Invalid response format: ${text.substring(0, 100)}`);
        }
      } else {
        throw new Error(`Empty response from server (Status: ${response.status})`);
      }
      if (!response.ok) {
        throw new Error(data.detail || 'OTP verification failed');
      }

      onLoginSuccess(data.access_token, data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container" style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100vw',
      height: '100vh',
      padding: '24px',
      overflowY: 'auto',
      position: 'relative'
    }}>
      <button
        onClick={() => {
          setShowSosModal(true);
          setSosModalError('');
          setSosModalSuccess('');
        }}
        title="Report Emergency Safety Hazard / SOS Distress Call"
        style={{
          position: 'fixed',
          top: '24px',
          right: '80px',
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1.5px solid rgba(239, 68, 68, 0.4)',
          borderRadius: '24px',
          padding: '0 16px',
          height: '42px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
          color: '#ff4d4d',
          boxShadow: '0 4px 14px rgba(239, 68, 68, 0.25)',
          transition: 'all 0.2s ease',
          zIndex: 9999,
          fontWeight: 'bold',
          fontSize: '0.85rem'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.04)';
          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.25)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
        }}
      >
        <span style={{ display: 'inline-block', width: '8px', height: '8px', background: '#ff4d4d', borderRadius: '50%' }}></span>
        🚨 Report Hazard (SOS)
      </button>

      {toggleTheme && (
        <button
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          style={{
            position: 'fixed',
            top: '24px',
            right: '24px',
            background: 'var(--bg-glass, rgba(255, 255, 255, 0.08))',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '50%',
            width: '42px',
            height: '42px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'hsl(var(--text-primary))',
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.2)',
            transition: 'all 0.2s ease',
            zIndex: 9999
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.08)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          {theme === 'dark' ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>
      )}
      <GlassCard className="animate-fade-in" style={{ width: '100%', maxWidth: '440px', padding: '36px', margin: 'auto' }}>
        <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          {onBackToLanding ? (
            <span 
              onClick={onBackToLanding}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '0.88rem',
                color: 'hsl(var(--text-secondary))',
                cursor: 'pointer',
                fontWeight: '600',
                transition: 'var(--transition-fast)'
              }}
              onMouseEnter={(e) => e.target.style.color = 'hsl(var(--primary))'}
              onMouseLeave={(e) => e.target.style.color = 'hsl(var(--text-secondary))'}
            >
              ← Back to Overview
            </span>
          ) : <div />}

          {toggleTheme && (
            <button
              onClick={toggleTheme}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--border-color-glass)',
                borderRadius: '10px',
                padding: '6px 12px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                color: 'hsl(var(--text-secondary))',
                fontSize: '0.82rem',
                fontWeight: '600',
                transition: 'var(--transition-fast)'
              }}
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            >
              {theme === 'dark' ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="5"/>
                    <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                  </svg>
                  <span>Light</span>
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                  </svg>
                  <span>Dark</span>
                </>
              )}
            </button>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25)', flexShrink: 0 }}>
              <img src="/logo.jpeg" alt="CommAI Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <span style={{
              fontSize: '2.3rem',
              fontWeight: '800',
              fontFamily: 'var(--font-display)',
              color: 'hsl(var(--text-primary))',
              letterSpacing: '-0.03em'
            }}>
              CommAI
            </span>
          </div>
          <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.95rem', fontWeight: '500' }}>
            Multilingual Mass Campaigns Gateway
          </p>
        </div>

        {/* Custom Authentication Selector Tabs */}
        {!isRegister && !otpMode && activeTab !== 'forgot_password' && (
          <div style={{
            display: 'flex',
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderRadius: '10px',
            padding: '4px',
            marginBottom: '28px'
          }}>
            <button
              onClick={() => { setActiveTab('password'); setError(''); }}
              style={{
                flex: 1,
                padding: '8px 12px',
                border: 'none',
                background: activeTab === 'password' ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
                color: activeTab === 'password' ? 'hsl(var(--text-primary))' : 'hsl(var(--text-muted))',
                borderRadius: '8px',
                fontSize: '0.88rem',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              Password Sign In
            </button>
            <button
              onClick={() => { setActiveTab('otp'); setError(''); }}
              style={{
                flex: 1,
                padding: '8px 12px',
                border: 'none',
                background: activeTab === 'otp' ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
                color: activeTab === 'otp' ? 'hsl(var(--text-primary))' : 'hsl(var(--text-muted))',
                borderRadius: '8px',
                fontSize: '0.88rem',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              OTP Code Login
            </button>
          </div>
        )}

        {error && (
          <div className="glass-card danger-text animate-fade-in" style={{ padding: '12px 16px', marginBottom: '24px', fontSize: '0.88rem', background: 'rgba(239, 68, 68, 0.06)', borderColor: 'rgba(239, 68, 68, 0.15)', borderRadius: '12px' }}>
            <span style={{ marginRight: '6px' }}>⚠️</span> {error}
          </div>
        )}

        {otpMessage && (
          <div className="glass-card success-text animate-fade-in" style={{ padding: '12px 16px', marginBottom: '24px', fontSize: '0.88rem', background: 'rgba(34, 197, 94, 0.06)', borderColor: 'rgba(34, 197, 94, 0.15)', borderRadius: '12px' }}>
            <span style={{ marginRight: '6px' }}>ℹ️</span> {otpMessage}
          </div>
        )}

        {otpMode ? (
          <form onSubmit={handleVerifyOTP}>
            <div className="form-group">
              <label className="form-label" style={{ fontWeight: '600' }}>OTP Verification Code</label>
              <input
                type="text"
                className="form-control"
                placeholder="123456"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                disabled={loading}
                autoFocus
                style={{ width: '100%', textAlign: 'center', letterSpacing: '0.4em', fontSize: '1.25rem', fontWeight: 'bold' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '28px' }}>
              <button type="submit" className="btn btn-primary" style={{ flexGrow: 1, padding: '12px' }} disabled={loading}>
                {loading ? 'Verifying...' : 'Verify OTP Code'}
              </button>
              <button type="button" className="btn btn-dark" style={{ padding: '12px' }} onClick={() => setOtpMode(false)} disabled={loading}>
                Cancel
              </button>
            </div>
          </form>
        ) : isRegister ? (
          <form onSubmit={handleRegister}>
            {selectedRole === 'audience' ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: '600' }}>First Name *</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Ramesh"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      disabled={loading}
                      required
                      style={{ width: '100%', fontSize: '0.95rem' }}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: '600' }}>Last Name</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Kumar"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      disabled={loading}
                      style={{ width: '100%', fontSize: '0.95rem' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: '600' }}>Email Address *</label>
                    <input
                      type="email"
                      className="form-control"
                      placeholder="ramesh@gov.in"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={loading}
                      required
                      style={{ width: '100%', fontSize: '0.95rem' }}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: '600' }}>Phone Number *</label>
                    <input
                      type="tel"
                      className="form-control"
                      placeholder="e.g. 9876543210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      disabled={loading}
                      required
                      style={{ width: '100%', fontSize: '0.95rem' }}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: '600' }}>Password *</label>
                  <input
                    type="password"
                    className="form-control"
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    required
                    style={{ width: '100%', fontSize: '0.95rem' }}
                  />
                </div>

                {/* Additional profile info for segmentation */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: '600' }}>Occupation</label>
                    <select
                      className="form-control"
                      value={occupation}
                      onChange={(e) => setOccupation(e.target.value)}
                      style={{ width: '100%', fontSize: '0.95rem' }}
                    >
                      <option value="">Select Occupation</option>
                      <option value="Farmer">Farmer</option>
                      <option value="Student">Student</option>
                      <option value="Healthcare Worker">Healthcare Worker</option>
                      <option value="Teacher">Teacher</option>
                      <option value="Business Owner">Business Owner</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: '600' }}>Age</label>
                    <input
                      type="number"
                      className="form-control"
                      placeholder="e.g. 25"
                      value={age}
                      onChange={(e) => setAge(e.target.value)}
                      disabled={loading}
                      style={{ width: '100%', fontSize: '0.95rem' }}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: '600' }}>Gender</label>
                    <select
                      className="form-control"
                      value={gender}
                      onChange={(e) => setGender(e.target.value)}
                      style={{ width: '100%', fontSize: '0.95rem' }}
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: '600' }}>State</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Bihar"
                      value={stateName}
                      onChange={(e) => setStateName(e.target.value)}
                      disabled={loading}
                      style={{ width: '100%', fontSize: '0.95rem' }}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: '600' }}>District</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Patna"
                      value={districtName}
                      onChange={(e) => setDistrictName(e.target.value)}
                      disabled={loading}
                      style={{ width: '100%', fontSize: '0.95rem' }}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: '600' }}>City</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Patna"
                      value={cityName}
                      onChange={(e) => setCityName(e.target.value)}
                      disabled={loading}
                      style={{ width: '100%', fontSize: '0.95rem' }}
                    />
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label className="form-label" style={{ fontWeight: '600' }}>Preferred Delivery Channels</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '6px' }}>
                    {[['email','📧 Email'], ['sms','📱 SMS'], ['voice','📞 Call'], ['push','🔔 Push'], ['website','🌐 Website'], ['telegram','✈️ Telegram']].map(([channel, label]) => {
                      const isSelected = preferredChannels.includes(channel);
                      return (
                        <div
                          key={channel}
                          onClick={() => {
                            if (isSelected) {
                              setPreferredChannels(preferredChannels.filter(c => c !== channel));
                            } else {
                              setPreferredChannels([...preferredChannels, channel]);
                            }
                          }}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '20px',
                            border: `1.5px solid ${isSelected ? 'hsl(var(--primary))' : 'rgba(255, 255, 255, 0.05)'}`,
                            background: isSelected ? 'rgba(59, 130, 246, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                            color: isSelected ? 'hsl(var(--text-primary))' : 'hsl(var(--text-secondary))',
                            fontSize: '0.78rem',
                            cursor: 'pointer',
                            fontWeight: isSelected ? '700' : '500',
                            textTransform: 'uppercase',
                            transition: 'all 0.2s ease'
                          }}
                        >
                          {label}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: '600' }}>Full Name *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Ramesh Kumar"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    disabled={loading}
                    required
                    style={{ width: '100%', fontSize: '0.95rem' }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: '600' }}>Email Address *</label>
                  <input
                    type="email"
                    className="form-control"
                    placeholder="ramesh@gov.in"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    required
                    style={{ width: '100%', fontSize: '0.95rem' }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: '600' }}>Password *</label>
                  <input
                    type="password"
                    className="form-control"
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    required
                    style={{ width: '100%', fontSize: '0.95rem' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: '600' }}>Organization</label>
                    <select
                      className="form-control"
                      value={orgSelect}
                      onChange={(e) => setOrgSelect(e.target.value)}
                      disabled={loading}
                      style={{ width: '100%', fontSize: '0.95rem' }}
                    >
                      <option value="Ministry of Health">Ministry of Health</option>
                      <option value="Indian Meteorological Department">Indian Meteorological Department</option>
                      <option value="National Disaster Management Authority">National Disaster Management Authority</option>
                      <option value="Department of Agriculture">Department of Agriculture</option>
                      <option value="District Administration">District Administration</option>
                      <option value="Municipal Corporation">Municipal Corporation</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: '600' }}>Designation</label>
                    <select
                      className="form-control"
                      value={desigSelect}
                      onChange={(e) => setDesigSelect(e.target.value)}
                      disabled={loading}
                      style={{ width: '100%', fontSize: '0.95rem' }}
                    >
                      <option value="Director">Director</option>
                      <option value="Chief Medical Officer">Chief Medical Officer</option>
                      <option value="Meteorologist">Meteorologist</option>
                      <option value="Agricultural Officer">Agricultural Officer</option>
                      <option value="District Magistrate">District Magistrate</option>
                      <option value="Municipal Commissioner">Municipal Commissioner</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  {orgSelect === 'Other' && (
                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: '600' }}>Custom Organization *</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="e.g. Red Cross Society"
                        value={organization}
                        onChange={(e) => setOrganization(e.target.value)}
                        disabled={loading}
                        required
                        style={{ width: '100%', fontSize: '0.95rem' }}
                      />
                    </div>
                  )}
                  {desigSelect === 'Other' && (
                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: '600' }}>Custom Designation *</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="e.g. Volunteer Lead"
                        value={designation}
                        onChange={(e) => setDesignation(e.target.value)}
                        disabled={loading}
                        required
                        style={{ width: '100%', fontSize: '0.95rem' }}
                      />
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="form-group">
              <label className="form-label" style={{ fontWeight: '600' }}>Platform Role *</label>
              <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
                <div 
                  onClick={() => { setSelectedRole('audience'); setPreferredLangs([]); }}
                  style={{
                    flex: 1,
                    padding: '14px 10px',
                    borderRadius: '12px',
                    border: `1.5px solid ${selectedRole === 'audience' ? 'hsl(var(--accent))' : 'rgba(255,255,255,0.06)'}`,
                    background: selectedRole === 'audience' ? 'rgba(34, 197, 94, 0.08)' : 'rgba(255,255,255,0.02)',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ fontSize: '1.25rem', marginBottom: '4px' }}>📣</div>
                  <div style={{ fontWeight: '700', fontSize: '0.84rem', color: selectedRole === 'audience' ? 'hsl(var(--accent))' : 'hsl(var(--text-secondary))' }}>Audience</div>
                  <div style={{ fontSize: '0.68rem', color: 'hsl(var(--text-muted))', marginTop: '2px', lineHeight: '1.2' }}>Receives warnings, views analytics & gives feedback.</div>
                </div>
                <div 
                  onClick={() => setSelectedRole('campaign_manager')}
                  style={{
                    flex: 1,
                    padding: '14px 10px',
                    borderRadius: '12px',
                    border: `1.5px solid ${selectedRole === 'campaign_manager' ? 'hsl(var(--primary))' : 'rgba(255,255,255,0.06)'}`,
                    background: selectedRole === 'campaign_manager' ? 'rgba(59, 130, 246, 0.08)' : 'rgba(255,255,255,0.02)',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ fontSize: '1.25rem', marginBottom: '4px' }}>💼</div>
                  <div style={{ fontWeight: '700', fontSize: '0.84rem', color: selectedRole === 'campaign_manager' ? 'hsl(var(--primary))' : 'hsl(var(--text-secondary))' }}>Manager</div>
                  <div style={{ fontSize: '0.68rem', color: 'hsl(var(--text-muted))', marginTop: '2px', lineHeight: '1.2' }}>Schedules and dispatches broadcasts.</div>
                </div>
              </div>
            </div>

            {selectedRole === 'audience' && (
              <div className="form-group" style={{ marginTop: '16px' }}>
                <label className="form-label" style={{ fontWeight: '600' }}>Preferred Languages *</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginTop: '6px' }}>
                  {['Hindi', 'English', 'Marathi', 'Tamil', 'Bengali', 'Telugu', 'Kannada', 'Gujarati', 'Malayalam'].map(lang => {
                    const isSelected = preferredLangs.includes(lang);
                    return (
                      <div
                        key={lang}
                        onClick={() => {
                          if (isSelected) {
                            setPreferredLangs(preferredLangs.filter(l => l !== lang));
                          } else {
                            setPreferredLangs([...preferredLangs, lang]);
                          }
                        }}
                        style={{
                          padding: '6px',
                          borderRadius: '8px',
                          border: `1.5px solid ${isSelected ? 'hsl(var(--primary))' : 'rgba(255, 255, 255, 0.05)'}`,
                          background: isSelected ? 'rgba(59, 130, 246, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                          color: isSelected ? 'hsl(var(--text-primary))' : 'hsl(var(--text-secondary))',
                          fontSize: '0.82rem',
                          textAlign: 'center',
                          cursor: 'pointer',
                          fontWeight: isSelected ? '700' : '500',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        {lang}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '12px', marginTop: '24px' }} disabled={loading}>
              {loading ? 'Creating Account...' : 'Register & Sign Up'}
            </button>

            <p style={{ fontSize: '0.88rem', color: 'hsl(var(--text-secondary))', textAlign: 'center', marginTop: '20px' }}>
              Already have an account?{' '}
              <span style={{ color: 'hsl(var(--primary))', cursor: 'pointer', fontWeight: '600' }} onClick={() => setIsRegister(false)}>
                Sign In
              </span>
            </p>
          </form>
        ) : activeTab === 'password' ? (
          <form onSubmit={handlePasswordLogin}>
            <div className="form-group">
              <label className="form-label" style={{ fontWeight: '600' }}>Email Address</label>
              <input
                type="email"
                className="form-control"
                placeholder="operator@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                style={{ width: '100%', fontSize: '0.95rem' }}
              />
            </div>

            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label" style={{ fontWeight: '600', margin: 0 }}>Password</label>
                <span 
                  onClick={() => { setActiveTab('forgot_password'); setForgotPasswordStep('email'); setError(''); setOtpMessage(''); }} 
                  style={{ color: 'hsl(var(--primary))', fontSize: '0.82rem', cursor: 'pointer', fontWeight: '600' }}
                >
                  Forgot Password?
                </span>
              </div>
              <input
                type="password"
                className="form-control"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                style={{ width: '100%', fontSize: '0.95rem', marginTop: '6px' }}
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '12px', marginTop: '24px' }} disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>

            <p style={{ fontSize: '0.88rem', color: 'hsl(var(--text-secondary))', textAlign: 'center', marginTop: '20px' }}>
              Don't have an account?{' '}
              <span style={{ color: 'hsl(var(--primary))', cursor: 'pointer', fontWeight: '600' }} onClick={() => setIsRegister(true)}>
                Register here
              </span>
            </p>
          </form>
        ) : activeTab === 'forgot_password' ? (
          forgotPasswordStep === 'email' ? (
            <form onSubmit={handleForgotPasswordRequestOTP}>
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: '600' }}>Email Address</label>
                <input
                  type="email"
                  className="form-control"
                  placeholder="operator@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  required
                  style={{ width: '100%', fontSize: '0.95rem' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button type="submit" className="btn btn-primary" style={{ flexGrow: 1, padding: '12px' }} disabled={loading}>
                  {loading ? 'Sending...' : 'Send Reset OTP'}
                </button>
                <button type="button" className="btn btn-dark" style={{ padding: '12px' }} onClick={() => { setActiveTab('password'); setError(''); setOtpMessage(''); }} disabled={loading}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleForgotPasswordReset}>
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: '600' }}>Email Address</label>
                <input
                  type="email"
                  disabled
                  className="form-control"
                  value={email}
                  style={{ width: '100%', fontSize: '0.95rem', opacity: 0.6 }}
                />
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontWeight: '600' }}>Reset OTP Code</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="123456"
                  value={resetOtpCode}
                  onChange={(e) => setResetOtpCode(e.target.value)}
                  disabled={loading}
                  required
                  style={{ width: '100%', fontSize: '0.95rem' }}
                />
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontWeight: '600' }}>New Password</label>
                <input
                  type="password"
                  className="form-control"
                  placeholder="Min 6 characters"
                  value={newPasswordReset}
                  onChange={(e) => setNewPasswordReset(e.target.value)}
                  disabled={loading}
                  required
                  style={{ width: '100%', fontSize: '0.95rem' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button type="submit" className="btn btn-primary" style={{ flexGrow: 1, padding: '12px' }} disabled={loading}>
                  {loading ? 'Resetting...' : 'Reset Password'}
                </button>
                <button type="button" className="btn btn-dark" style={{ padding: '12px' }} onClick={() => { setForgotPasswordStep('email'); setError(''); setOtpMessage(''); }} disabled={loading}>
                  Back
                </button>
              </div>
            </form>
          )
        ) : (
          <form onSubmit={handleRequestOTP}>
            <div className="form-group">
              <label className="form-label" style={{ fontWeight: '600' }}>Email Address</label>
              <input
                type="email"
                className="form-control"
                placeholder="operator@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                style={{ width: '100%', fontSize: '0.95rem' }}
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '12px', marginTop: '24px' }} disabled={loading}>
              {loading ? 'Sending code...' : 'Send OTP verification code'}
            </button>

            <p style={{ fontSize: '0.88rem', color: 'hsl(var(--text-secondary))', textAlign: 'center', marginTop: '20px' }}>
              Don't have an account?{' '}
              <span style={{ color: 'hsl(var(--primary))', cursor: 'pointer', fontWeight: '600' }} onClick={() => setIsRegister(true)}>
                Register here
              </span>
            </p>
          </form>
        )}

        <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid var(--border-color-glass)' }}>
          <span style={{ fontSize: '0.88rem', color: 'hsl(var(--text-muted))', fontWeight: '600', display: 'block', marginBottom: '14px' }}>
            Demo Operator Accounts (Click to Auto-Fill)
          </span>
          <div className="role-selector-grid">
            {demoAccounts.map((demo) => {
              const isActive = email === demo.email;
              const isManager = demo.email.includes('manager');
              const isAdmin = demo.email.includes('admin');
              const roleClass = isAdmin ? 'admin' : isManager ? 'manager' : 'audience';
              
              let iconSvg;
              let label;
              
              if (isAdmin) {
                label = 'Admin';
                iconSvg = (
                  <svg className="svg-icon" style={{ width: '1.15rem', height: '1.15rem' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                );
              } else if (isManager) {
                label = 'Manager';
                iconSvg = (
                  <svg className="svg-icon" style={{ width: '1.15rem', height: '1.15rem' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
                    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
                  </svg>
                );
              } else {
                label = 'Audience';
                iconSvg = (
                  <svg className="svg-icon" style={{ width: '1.15rem', height: '1.15rem' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M23 7a2 2 0 0 0-2.45-1.45L11 8H4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2v4l4-2h1l10 2.45A2 2 0 0 0 23 17V7z"/>
                    <path d="M6 10v4"/>
                  </svg>
                );
              }
              
              return (
                <div
                  key={demo.email}
                  className={`role-card ${isActive ? 'active' : ''} ${roleClass}`}
                  onClick={() => handlePreFill(demo)}
                  style={{
                    padding: '12px 8px',
                    borderRadius: '10px',
                    transition: 'all 0.2s ease',
                    boxShadow: isActive ? '0 4px 12px rgba(59, 130, 246, 0.15)' : 'none'
                  }}
                >
                  <div className="role-card-icon">{iconSvg}</div>
                  <div className="role-card-title">{label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </GlassCard>

      {/* ─── PUBLIC ANONYMOUS SOS MODAL ─── */}
      {showSosModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100000,
          padding: '24px'
        }}>
          <div style={{
            background: 'rgba(30, 41, 59, 0.85)',
            border: '1.5px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '520px',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
            padding: '24px',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#ff4d4d', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🚨 Submit Distress Alert / SOS (Anonymous)
              </h3>
              <button 
                onClick={() => setShowSosModal(false)}
                style={{ background: 'none', border: 'none', color: '#ffffff', fontSize: '1.5rem', cursor: 'pointer', fontWeight: 'bold' }}
              >
                &times;
              </button>
            </div>

            {sosModalError && (
              <div className="alert alert-danger" style={{ padding: '8px 12px', fontSize: '0.8rem', marginBottom: '12px', background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                ⚠️ {sosModalError}
              </div>
            )}
            {sosModalSuccess && (
              <div className="alert alert-success" style={{ padding: '8px 12px', fontSize: '0.8rem', marginBottom: '12px', background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
                ✅ {sosModalSuccess}
              </div>
            )}

            <form onSubmit={handleAnonymousSOSSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem', color: '#ffffff' }}>Incident Title / Safety Hazard *</label>
                <input
                  type="text"
                  className="form-control"
                  value={sosTitle}
                  onChange={(e) => setSosTitle(e.target.value)}
                  placeholder="e.g. Broken live electrical wire on pavement"
                  required
                  style={{ width: '100%', fontSize: '0.88rem' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem', color: '#ffffff' }}>Hazard Type</label>
                  <select
                    className="form-control"
                    value={sosType}
                    onChange={(e) => setSosType(e.target.value)}
                    style={{ background: '#1e293b', color: '#fff', fontSize: '0.88rem', border: '1px solid rgba(255,255,255,0.1)' }}
                  >
                    <option value="fire">🔥 Fire / Hazard</option>
                    <option value="flood">🌊 Flood / Waterlogging</option>
                    <option value="medical">🚑 Medical Distress</option>
                    <option value="roadblock">🚧 Roadblock / Obstruction</option>
                    <option value="other">⚠️ Other Danger</option>
                  </select>
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem', color: '#ffffff' }}>Location Coordinates</label>
                  <button
                    type="button"
                    onClick={handleGrabSosLocation}
                    disabled={sosLocLoading}
                    className="btn btn-dark btn-sm"
                    style={{ width: '100%', fontSize: '0.78rem', height: '38px', fontWeight: 'bold' }}
                  >
                    {sosLocLoading ? 'Retrieving...' : '📍 Share Live GPS'}
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem', color: '#ffffff' }}>Latitude</label>
                  <input
                    type="text"
                    className="form-control"
                    value={sosLat}
                    onChange={(e) => setSosLat(e.target.value)}
                    placeholder="e.g. 28.6139"
                    style={{ width: '100%', fontSize: '0.88rem' }}
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem', color: '#ffffff' }}>Longitude</label>
                  <input
                    type="text"
                    className="form-control"
                    value={sosLng}
                    onChange={(e) => setSosLng(e.target.value)}
                    placeholder="e.g. 77.2090"
                    style={{ width: '100%', fontSize: '0.88rem' }}
                  />
                </div>
              </div>

              <div>
                <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem', color: '#ffffff' }}>Landmark / Location Details *</label>
                <input
                  type="text"
                  className="form-control"
                  value={sosLocName}
                  onChange={(e) => setSosLocName(e.target.value)}
                  placeholder="e.g. Outside Metro Station gate, near water kiosk"
                  required
                  style={{ width: '100%', fontSize: '0.88rem' }}
                />
              </div>

              <div>
                <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem', color: '#ffffff' }}>Distress / Hazard Description *</label>
                <textarea
                  rows={3}
                  className="form-control"
                  value={sosDesc}
                  onChange={(e) => setSosDesc(e.target.value)}
                  placeholder="Describe the severity, roadblock details, and current danger status..."
                  required
                  style={{ width: '100%', fontSize: '0.88rem', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem', color: '#ffffff' }}>Reporter Name (Optional)</label>
                  <input
                    type="text"
                    className="form-control"
                    value={sosName}
                    onChange={(e) => setSosName(e.target.value)}
                    placeholder="e.g. Guest Citizen"
                    style={{ width: '100%', fontSize: '0.88rem' }}
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem', color: '#ffffff' }}>Contact Phone (Optional)</label>
                  <input
                    type="text"
                    className="form-control"
                    value={sosPhone}
                    onChange={(e) => setSosPhone(e.target.value)}
                    placeholder="e.g. 9876543210"
                    style={{ width: '100%', fontSize: '0.88rem' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button 
                  type="button" 
                  onClick={() => setShowSosModal(false)} 
                  className="btn btn-dark"
                  style={{ padding: '8px 16px' }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={sosSubmitting}
                  className="btn btn-primary"
                  style={{ padding: '8px 24px', background: '#ff4d4d', borderColor: '#ff4d4d', color: '#fff', fontWeight: 'bold' }}
                >
                  {sosSubmitting ? 'Submitting Distress...' : '🚨 Broadcast Distress (SOS)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;
