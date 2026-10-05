import React, { useState, useEffect, useRef, useCallback } from 'react';
import GlassCard from '../components/GlassCard';
import { parseApiError } from '../utils/apiError';

const Templates = ({ user, backendUrl, headers }) => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [cardLanguages, setCardLanguages] = useState({});
  
  // Filters
  const [filterChan, setFilterChan] = useState('');
  const [filterCat, setFilterCat] = useState('');

  // Form Editor Modal
  const [editorOpen, setEditorOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formChan, setFormChan] = useState('sms');
  const [formCat, setFormCat] = useState('awareness');
  const [formLang, setFormLang] = useState('English');
  const [formSubject, setFormSubject] = useState('');
  const [formBody, setFormBody] = useState('');
  const [formError, setFormError] = useState('');
  const [translationLang, setTranslationLang] = useState('Hindi');
  const [translationLoading, setTranslationLoading] = useState(false);
  const [translationResult, setTranslationResult] = useState('');
  const [translationError, setTranslationError] = useState('');

  // AI Assist Panel State
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiTab, setAiTab] = useState('generate');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiTone, setAiTone] = useState('formal');
  const [aiAudienceProfile, setAiAudienceProfile] = useState('general');
  const [aiObjective, setAiObjective] = useState('awareness');
  const [aiResult, setAiResult] = useState(null);
  const [aiComplianceResult, setAiComplianceResult] = useState(null);

  const bodyTextareaRef = useRef(null);

  const tones = [
    { value: 'formal', label: 'Formal' },
    { value: 'urgent', label: 'Urgent' },
    { value: 'empathetic', label: 'Empathetic' },
    { value: 'simplified', label: 'Simplified' },
  ];
  const audienceProfiles = [
    { value: 'general', label: 'General Public' },
    { value: 'healthcare_worker', label: 'Healthcare Workers' },
    { value: 'student', label: 'Students' },
    { value: 'rural_audience', label: 'Rural Audience' },
    { value: 'senior_citizen', label: 'Senior Citizens' },
  ];

  const languages = ["English", "Hindi", "Assamese", "Bengali", "Bodo", "Dogri", "Gujarati", "Kannada", "Kashmiri", "Konkani", "Maithili", "Malayalam", "Manipuri", "Marathi", "Nepali", "Odia", "Punjabi", "Sanskrit", "Santali", "Sindhi", "Tamil", "Telugu", "Urdu"];
  const categories = ["emergency", "awareness", "education", "announcement"];
  const channels = ["email", "sms", "voice", "push", "website", "telegram"];
  
  const placeholders = [
    { label: 'Recipient Name', tag: '{{first_name}}' },
    { label: 'Surname', tag: '{{last_name}}' },
    { label: 'Location City', tag: '{{city}}' },
    { label: 'Occupation', tag: '{{occupation}}' },
    { label: 'Organization', tag: '{{organization}}' },
    { label: 'Department', tag: '{{department}}' }
  ];

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      let url = `${backendUrl}/api/templates`;
      const queryParams = [];
      if (filterChan) queryParams.push(`channel=${filterChan}`);
      if (filterCat) queryParams.push(`category=${filterCat}`);
      
      if (queryParams.length > 0) {
        url += '?' + queryParams.join('&');
      }

      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error('Failed to fetch templates');
      const data = await response.json();
      setTemplates(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [backendUrl, headers, filterChan, filterCat]);

  const handleTranslateAll = async (id) => {
    try {
      const response = await fetch(`${backendUrl}/api/templates/${id}/translate-all`, {
        method: 'POST',
        headers
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Translate task failed');
      alert('Background translation started for all 23 supported languages! It will complete shortly.');
      fetchTemplates();
    } catch (err) {
      alert('Error triggering translations: ' + err.message);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleOpenAdd = () => {
    setEditId(null);
    setFormTitle('');
    setFormDesc('');
    setFormChan('sms');
    setFormCat('awareness');
    setFormLang('English');
    setFormSubject('');
    setFormBody('');
    setFormError('');
    setTranslationLang('Hindi');
    setTranslationResult('');
    setTranslationError('');
    setEditorOpen(true);
  };

  const handleOpenEdit = (tpl) => {
    setEditId(tpl.id);
    setFormTitle(tpl.title);
    setFormDesc(tpl.description || '');
    setFormChan(tpl.channel);
    setFormCat(tpl.category);
    setFormLang(tpl.default_language);
    setFormSubject(tpl.subject_template || '');
    setFormBody(tpl.body_template);
    setFormError('');
    setTranslationLang('Hindi');
    setTranslationResult('');
    setTranslationError('');
    setEditorOpen(true);
  };

  const handleInsertPlaceholder = (tag) => {
    const textarea = bodyTextareaRef.current;
    if (!textarea) return;

    const startPos = textarea.selectionStart;
    const endPos = textarea.selectionEnd;
    const currentVal = textarea.value;

    const newVal = currentVal.substring(0, startPos) + tag + currentVal.substring(endPos, currentVal.length);
    setFormBody(newVal);

    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = startPos + tag.length;
    }, 50);
  };

  const handleTranslateBody = async () => {
    if (!formBody || !formBody.trim()) {
      setTranslationError('Please write some content in the message body first.');
      return;
    }
    setTranslationLoading(true);
    setTranslationError('');
    setTranslationResult('');
    try {
      const response = await fetch(`${backendUrl}/api/translate`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: formBody,
          target_language: translationLang,
          source_language: formLang
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Translation failed');
      setTranslationResult(data.translated_text);
    } catch (err) {
      setTranslationError(err.message);
    } finally {
      setTranslationLoading(false);
    }
  };

  const handleApplyTranslation = () => {
    if (translationResult) {
      setFormBody(translationResult);
      setFormLang(translationLang);
      setTranslationResult('');
    }
  };

  const handleSaveTemplate = async (e) => {
    e.preventDefault();
    if (!formTitle || !formBody) {
      setFormError('Title and Body template content cannot be empty');
      return;
    }
    setFormError('');

    const payload = {
      title: formTitle,
      description: formDesc || null,
      category: formCat,
      channel: formChan,
      default_language: formLang,
      subject_template: formChan === 'email' ? formSubject : null,
      body_template: formBody
    };

    try {
      const url = editId ? `${backendUrl}/api/templates/${editId}` : `${backendUrl}/api/templates`;
      const method = editId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'Failed to save template');
      }

      setEditorOpen(false);
      fetchTemplates();
    } catch (err) {
      setFormError(err.message);
    }
  };

  const handleDeleteTemplate = async (id) => {
    if (!window.confirm('Are you sure you want to soft delete this message template?')) return;
    try {
      const response = await fetch(`${backendUrl}/api/templates/${id}`, {
        method: 'DELETE',
        headers
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'Delete failed');
      }
      fetchTemplates();
    } catch (err) {
      alert(err.message);
    }
  };

  const renderChannelMockup = (tpl, chosenLang = null) => {
    const isMobileChannel = ['sms', 'whatsapp', 'push', 'telegram'].includes(tpl.channel);
    
    let subject = tpl.subject_template;
    let body = tpl.body_template;

    if (chosenLang && chosenLang !== tpl.default_language) {
      let parsed = {};
      try {
        parsed = typeof tpl.translations === 'string' ? JSON.parse(tpl.translations || '{}') : (tpl.translations || {});
      } catch {
        parsed = {};
      }
      if (parsed[chosenLang]) {
        if (parsed[chosenLang].subject) subject = parsed[chosenLang].subject;
        if (parsed[chosenLang].body) body = parsed[chosenLang].body;
      }
    }

    if (tpl.channel === 'email') {
      return (
        <div className="email-mockup animate-fade-in" style={{ flexGrow: 1, minHeight: '200px', borderRadius: '12px', border: '1px solid var(--border-color-glass)' }}>
          <div className="email-browser-bar" style={{ padding: '10px 16px' }}>
            <div className="email-dots">
              <div className="email-dot red" style={{ width: '8px', height: '8px' }}></div>
              <div className="email-dot yellow" style={{ width: '8px', height: '8px' }}></div>
              <div className="email-dot green" style={{ width: '8px', height: '8px' }}></div>
            </div>
            <div className="email-address-bar" style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem' }}>
              <svg className="svg-icon" style={{ width: '12px', height: '12px', marginRight: '6px', color: 'hsl(var(--primary))' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              {user.organization ? user.organization.toLowerCase().replace(/\s+/g, '') : 'gov'}.mail.in
            </div>
          </div>
          <div className="email-content-wrapper" style={{ padding: '16px' }}>
            <div className="email-headers" style={{ gap: '6px', paddingBottom: '12px' }}>
              {subject && (
                <div className="email-header-line">
                  <span className="email-header-label" style={{ width: '60px', fontWeight: '700' }}>Subject:</span>
                  <span className="email-header-val" style={{ fontWeight: '700', color: 'hsl(var(--text-primary))' }}>{subject}</span>
                </div>
              )}
              <div className="email-header-line">
                <span className="email-header-label" style={{ width: '60px', fontWeight: '700' }}>From:</span>
                <span className="email-header-val">Alert Portal &lt;alert@{user.organization ? user.organization.toLowerCase().replace(/\s+/g, '') : 'comm'}.gov.in&gt;</span>
              </div>
            </div>
            <div className="email-body-text" style={{ whiteSpace: 'pre-wrap', padding: '12px', background: 'rgba(255,255,255,0.01)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)', color: 'hsl(var(--text-secondary))', fontSize: '0.82rem', lineHeight: '1.5' }}>{body}</div>
          </div>
        </div>
      );
    }
    
    if (isMobileChannel) {
      if (tpl.channel === 'push') {
        return (
          <div className="phone-mockup animate-fade-in" style={{ height: '200px', width: '100%', minHeight: 'auto', borderBottomWidth: '11px', borderRadius: '20px' }}>
            <div className="phone-status-bar" style={{ background: 'transparent', height: '24px', padding: '6px 16px 0 16px' }}>
              <span style={{ fontWeight: '700' }}>10:42 AM</span>
              <span>📶 🔋</span>
            </div>
            <div className="phone-lockscreen" style={{ background: 'linear-gradient(180deg, #0a0b12 0%, #030407 100%)', padding: '16px 12px' }}>
              <div className="push-notification-card" style={{ padding: '10px 12px', borderRadius: '12px' }}>
                <div className="push-icon" style={{ borderRadius: '6px', width: '18px', height: '18px' }}>
                  <svg className="svg-icon" style={{ width: '11px', height: '11px', color: '#fff' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                </div>
                <div className="push-details">
                  <div className="push-header">
                    <span style={{ fontWeight: '800', letterSpacing: '0.04em' }}>COMM SYSTEM</span>
                    <span>now</span>
                  </div>
                  <div className="push-title" style={{ fontSize: '0.75rem', fontWeight: '700', color: '#fff' }}>{tpl.title}</div>
                  <div className="push-body" style={{ fontSize: '0.72rem', lineHeight: '1.4', color: 'rgba(255,255,255,0.85)' }}>{body}</div>
                </div>
              </div>
            </div>
          </div>
        );
      }

      if (tpl.channel === 'telegram') {
        return (
          <div className="phone-mockup animate-fade-in" style={{ height: '210px', width: '100%', minHeight: 'auto', borderBottomWidth: '11px', borderRadius: '20px' }}>
            <div className="phone-status-bar" style={{ height: '24px', padding: '6px 16px 0 16px' }}>
              <span style={{ fontWeight: '700' }}>10:42 AM</span>
              <span>📶 🔋</span>
            </div>
            <div className="phone-screen">
              <div className="phone-app-header" style={{ height: '36px', padding: '0 12px', gap: '8px', background: '#2481cc', display: 'flex', alignItems: 'center' }}>
                <div className="phone-avatar" style={{ width: '20px', height: '20px', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}>
                  <span style={{ fontSize: '0.65rem' }}>📢</span>
                </div>
                <div className="phone-header-info" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                  <div className="phone-header-title" style={{ fontSize: '0.75rem', fontWeight: '700', color: '#fff', lineHeight: 1 }}>Gov Alert Bot</div>
                  <div className="phone-header-subtitle" style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.7)', marginTop: '2px' }}>bot</div>
                </div>
              </div>
              <div className="phone-chat-bg" style={{ background: '#0e1621', padding: '8px', height: 'calc(100% - 36px)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', overflow: 'hidden' }}>
                <div style={{
                  background: '#182533',
                  color: '#f5f5f5',
                  padding: '8px 12px',
                  borderRadius: '12px 12px 12px 0px',
                  maxWidth: '85%',
                  fontSize: '0.72rem',
                  lineHeight: '1.4',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                  margin: '4px 0',
                  textAlign: 'left'
                }}>
                  {body}
                  <div style={{ textAlign: 'right', fontSize: '0.55rem', color: '#7f91a4', marginTop: '4px' }}>10:42 AM</div>
                </div>
              </div>
            </div>
          </div>
        );
      }
      
      const isWA = tpl.channel === 'whatsapp';
      const bubbleClass = isWA ? 'whatsapp-style' : 'sms-style';
      const senderName = isWA ? 'CommAI alert System' : 'Gov-Alert';
      
      return (
        <div className="phone-mockup animate-fade-in" style={{ height: '210px', width: '100%', minHeight: 'auto', borderBottomWidth: '11px', borderRadius: '20px' }}>
          <div className="phone-status-bar" style={{ height: '24px', padding: '6px 16px 0 16px' }}>
            <span style={{ fontWeight: '700' }}>10:42 AM</span>
            <span>📶 🔋</span>
          </div>
          <div className="phone-screen">
            <div className="phone-app-header" style={{ height: '36px', padding: '0 12px', gap: '8px' }}>
              <div className="phone-avatar" style={{ width: '20px', height: '20px', background: isWA ? 'hsl(var(--accent))' : 'hsl(var(--secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {isWA ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '11px', height: '11px', color: '#fff' }}>
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '11px', height: '11px', color: '#fff' }}>
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                )}
              </div>
              <div className="phone-contact-name">
                <span style={{ fontWeight: '700', fontSize: '0.72rem' }}>{senderName}</span>
                {isWA && <span className="phone-contact-status" style={{ fontSize: '0.55rem' }}>Online</span>}
              </div>
            </div>
            <div className={`phone-body ${isWA ? 'whatsapp' : ''}`} style={{ justifyContent: 'flex-start', padding: '10px' }}>
              <div className={`phone-bubble ${bubbleClass}`} style={{ padding: '6px 10px', fontSize: '0.72rem', borderTopLeftRadius: '0px', borderTopRightRadius: '10px', borderBottomRightRadius: '10px', borderBottomLeftRadius: '10px', boxShadow: '0 1px 2px rgba(0,0,0,0.15)' }}>
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>{body}</div>
                <div className="phone-bubble-time" style={{ fontSize: '0.55rem', textAlign: 'right', marginTop: '3px', opacity: 0.7 }}>10:42 AM</div>
              </div>
            </div>
          </div>
        </div>
      );
    }
    
    // Website advisor toast mockup
    return (
      <div className="email-mockup animate-fade-in" style={{ flexGrow: 1, minHeight: '180px', borderRadius: '12px', border: '1px solid var(--border-color-glass)' }}>
        <div className="email-browser-bar" style={{ padding: '10px 16px' }}>
          <div className="email-dots">
            <div className="email-dot red" style={{ width: '8px', height: '8px' }}></div>
            <div className="email-dot yellow" style={{ width: '8px', height: '8px' }}></div>
            <div className="email-dot green" style={{ width: '8px', height: '8px' }}></div>
          </div>
          <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>https://comm-ai-nine.vercel.app/</span>
        </div>
        <div className="email-content-wrapper" style={{ background: 'rgba(5, 7, 15, 0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div className="website-toast-mockup" style={{ margin: 0, width: '100%', border: '1px solid hsl(var(--primary) / 25%)', padding: '12px', borderRadius: '10px' }}>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '6px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '4px' }}>
              <svg className="svg-icon" style={{ width: '12px', height: '12px', color: 'hsl(var(--primary))' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              <strong style={{ fontSize: '0.65rem', color: 'hsl(var(--primary))', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Public Security Advisory</strong>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#f1f5f9', whiteSpace: 'pre-wrap', lineHeight: '1.35' }}>{body}</div>
          </div>
        </div>
      </div>
    );
  };

  const getChannelIcon = (ch) => {
    switch (ch) {
      case 'email':
        return (
          <svg className="svg-icon" style={{ color: 'hsl(var(--primary))' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
        );
      case 'sms':
        return (
          <svg className="svg-icon" style={{ color: 'hsl(var(--secondary))' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        );
      case 'whatsapp':
        return (
          <svg className="svg-icon" style={{ color: 'hsl(var(--accent))' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
        );
      case 'push':
        return (
          <svg className="svg-icon" style={{ color: 'hsl(var(--warning))' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        );
      default:
        return (
          <svg className="svg-icon" style={{ color: 'hsl(var(--text-muted))' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        );
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="templates-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <p style={{ color: 'hsl(var(--text-secondary))', margin: 0 }}>
            Design and organize reusable multilingual message blocks.
          </p>
        </div>
        {['admin', 'campaign_manager'].includes(user.role) && (
          <button className="btn btn-primary" onClick={handleOpenAdd}>
            <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '1rem', height: '1rem' }}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Create Template
          </button>
        )}
      </div>

      <GlassCard style={{ marginBottom: '24px' }}>
        <div className="templates-filter-bar" style={{ display: 'flex', gap: '16px' }}>
          <div style={{ flexGrow: 1 }}>
            <label className="form-label">Filter Channel</label>
            <select className="form-control" style={{ width: '100%' }} value={filterChan} onChange={(e) => setFilterChan(e.target.value)}>
              <option value="">All Channels</option>
              {channels.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
            </select>
          </div>
          <div style={{ flexGrow: 1 }}>
            <label className="form-label">Filter Category</label>
            <select className="form-control" style={{ width: '100%' }} value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
              <option value="">All Categories</option>
              {categories.map(cat => <option key={cat} value={cat}>{cat.toUpperCase()}</option>)}
            </select>
          </div>
        </div>
      </GlassCard>

      {loading ? (
        <div style={{ color: 'hsl(var(--text-secondary))', textAlign: 'center', padding: '24px' }}>
          Fetching template items...
        </div>
      ) : templates.length === 0 ? (
        <p style={{ color: 'hsl(var(--text-muted))', textAlign: 'center', padding: '48px' }}>
          No templates found in library. Create one above!
        </p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
          {templates.map(tpl => (
            <GlassCard key={tpl.id} style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', padding: '2px 10px', background: 'var(--border-color-glass)', color: 'hsl(var(--text-secondary))', borderRadius: '100px', textTransform: 'capitalize', fontWeight: '500' }}>
                  {tpl.category}
                </span>
                <span style={{ display: 'flex', alignItems: 'center' }}>
                  {getChannelIcon(tpl.channel)}
                </span>
              </div>
              
              <div>
                <h3 style={{ fontSize: '1.15rem', color: 'hsl(var(--primary))', marginBottom: '6px' }}>{tpl.title}</h3>
                <p style={{ fontSize: '0.9rem', color: 'hsl(var(--text-secondary))', height: '40px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {tpl.description || 'No description provided.'}
                </p>
              </div>

              <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                {renderChannelMockup(tpl, cardLanguages[tpl.id] || tpl.default_language)}
              </div>

              {(() => {
                let parsedTranslations = {};
                try {
                  parsedTranslations = typeof tpl.translations === 'string' ? JSON.parse(tpl.translations || '{}') : (tpl.translations || {});
                } catch {
                  parsedTranslations = {};
                }
                const translatedLanguages = Object.keys(parsedTranslations).filter(lang => parsedTranslations[lang] && parsedTranslations[lang].body);
                const currentActiveLang = cardLanguages[tpl.id] || tpl.default_language;
                
                return translatedLanguages.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '-8px', marginBottom: '8px', padding: '8px', background: 'rgba(255,255,255,0.01)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.02)' }}>
                    <div style={{ fontSize: '0.72rem', color: 'hsl(var(--text-muted))', width: '100%', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
                      <span>🌐</span>
                      <span>AI Pre-translations ({translatedLanguages.length}) — Click to preview:</span>
                    </div>
                    {/* Default Language selector badge */}
                    <span 
                      style={{ 
                        fontSize: '0.68rem', 
                        padding: '2px 6px', 
                        background: currentActiveLang === tpl.default_language ? 'rgba(37,99,235,0.25)' : 'rgba(255,255,255,0.02)', 
                        border: currentActiveLang === tpl.default_language ? '1px solid hsl(var(--accent))' : '1px solid rgba(255,255,255,0.1)', 
                        color: currentActiveLang === tpl.default_language ? '#fff' : 'hsl(var(--text-muted))', 
                        borderRadius: '4px', 
                        fontWeight: '500',
                        cursor: 'pointer'
                      }}
                      onClick={() => setCardLanguages({ ...cardLanguages, [tpl.id]: tpl.default_language })}
                    >
                      {tpl.default_language} (Default)
                    </span>
                    {translatedLanguages.map(l => (
                      <span 
                        key={l} 
                        style={{ 
                          fontSize: '0.68rem', 
                          padding: '2px 6px', 
                          background: currentActiveLang === l ? 'rgba(37,99,235,0.25)' : 'rgba(37,99,235,0.08)', 
                          border: currentActiveLang === l ? '1px solid hsl(var(--accent))' : '1px solid rgba(37,99,235,0.15)', 
                          color: currentActiveLang === l ? '#fff' : 'hsl(var(--accent))', 
                          borderRadius: '4px', 
                          fontWeight: '500',
                          cursor: 'pointer'
                        }}
                        onClick={() => setCardLanguages({ ...cardLanguages, [tpl.id]: l })}
                      >
                        {l}
                      </span>
                    ))}
                  </div>
                );
              })()}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', color: 'hsl(var(--text-muted))', borderTop: '1px solid var(--border-color-glass)', paddingTop: '12px' }}>
                <span 
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
                  onClick={() => setCardLanguages({ ...cardLanguages, [tpl.id]: tpl.default_language })}
                >
                  <svg className="svg-icon" style={{ width: '11px', height: '11px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                  Showing: {cardLanguages[tpl.id] || tpl.default_language} (v{tpl.version})
                </span>
                {['admin', 'campaign_manager'].includes(user.role) && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-dark" style={{ padding: '4px 8px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => handleTranslateAll(tpl.id)}>
                      <span>🌐 Translate All</span>
                    </button>
                    <button className="btn btn-dark" style={{ padding: '4px 8px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => handleOpenEdit(tpl)}>
                      <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '0.8rem', height: '0.8rem' }}>
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z" />
                      </svg>
                      <span>Edit</span>
                    </button>
                    {user.role === 'admin' && (
                      <button className="btn btn-danger" style={{ padding: '4px 8px', fontSize: '0.8rem', background: 'hsl(var(--danger) / 10%)', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => handleDeleteTemplate(tpl.id)}>
                        <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '0.8rem', height: '0.8rem', color: 'hsl(var(--danger))' }}>
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                        <span>Delete</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {/* EDITOR MODAL */}
      {editorOpen && (
        <div className="modal-overlay">
          <GlassCard className="modal-content animate-fade-in" style={{ maxWidth: '640px' }}>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '20px', borderBottom: '1px solid var(--border-color-glass)', paddingBottom: '12px', fontWeight: '500', color: 'hsl(var(--text-primary))' }}>
              {editId ? 'Edit Template' : 'Design Message Template'}
            </h2>
            
            {formError && (
              <div className="glass-card danger-text" style={{ padding: '10px 14px', marginBottom: '16px', fontSize: '0.85rem', background: 'hsl(var(--danger) / 10%)', borderColor: 'hsl(var(--danger) / 20%)' }}>
                <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '1.1rem', height: '1.1rem', marginRight: '6px', display: 'inline-block', verticalAlign: 'middle' }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveTemplate}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Template Title *</label>
                  <input type="text" className="form-control" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="Monsoon Warning Ludhiana" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Language</label>
                  <select className="form-control" value={formLang} onChange={(e) => setFormLang(e.target.value)}>
                    {languages.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <input type="text" className="form-control" value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="Alert warning text format used during storms" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select className="form-control" value={formCat} onChange={(e) => setFormCat(e.target.value)}>
                    {categories.map(cat => <option key={cat} value={cat}>{cat.toUpperCase()}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Channel</label>
                  <select className="form-control" value={formChan} onChange={(e) => setFormChan(e.target.value)}>
                    {channels.map(ch => <option key={ch} value={ch}>{ch.toUpperCase()}</option>)}
                  </select>
                </div>
              </div>

              {formChan === 'email' && (
                <div className="form-group">
                  <label className="form-label">Subject Template</label>
                  <input type="text" className="form-control" value={formSubject} onChange={(e) => setFormSubject(e.target.value)} placeholder="Emergency warning: heavy rain alert for {{city}} region" />
                </div>
              )}

              <div className="form-group" style={{ position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label className="form-label">Message Body Template *</label>
                  <span style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))' }}>Double-curly braces placeholders</span>
                </div>
                
                {/* Placeholder Quick Insert Buttons */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px', padding: '8px', background: 'var(--border-color-glass)', borderRadius: '10px' }}>
                  {placeholders.map(p => (
                    <button
                      key={p.tag}
                      type="button"
                      className="pill-chip"
                      onClick={() => handleInsertPlaceholder(p.tag)}
                    >
                      +{p.label}
                    </button>
                  ))}
                </div>

                <textarea
                  ref={bodyTextareaRef}
                  className="form-control"
                  style={{ width: '100%', minHeight: '140px', fontFamily: 'monospace', fontSize: '0.9rem', resize: 'vertical' }}
                  placeholder="Dear {{first_name}}, please note that heavy rains are forecasted in {{city}} organization: {{organization}}..."
                  value={formBody}
                  onChange={(e) => setFormBody(e.target.value)}
                  required
                />

                {/* 🤖 AI Assist Panel Toggle */}
                <button
                  type="button"
                  className="btn btn-dark"
                  style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '6px 14px', background: aiPanelOpen ? 'hsl(var(--primary) / 15%)' : undefined, border: aiPanelOpen ? '1px solid hsl(var(--primary) / 30%)' : undefined }}
                  onClick={() => { setAiPanelOpen(!aiPanelOpen); setAiError(''); setAiResult(null); setAiComplianceResult(null); }}
                >
                  <span style={{ fontSize: '1rem' }}>🤖</span>
                  {aiPanelOpen ? 'Close AI Assist' : 'AI Assist'}
                </button>

                {aiPanelOpen && (
                  <div style={{ marginTop: '10px', padding: '14px', background: 'rgba(37,99,235,0.04)', border: '1px solid hsl(var(--primary) / 15%)', borderRadius: '12px' }}>
                    {/* Tab Bar */}
                    <div style={{ display: 'flex', gap: '4px', marginBottom: '12px', borderBottom: '1px solid var(--border-color-glass)', paddingBottom: '8px', flexWrap: 'wrap' }}>
                      {[
                        { id: 'generate', label: '✨ Generate' },
                        { id: 'optimize', label: '🎯 Optimize' },
                        { id: 'personalize', label: '👥 Personalize' },
                        { id: 'compliance', label: '🛡️ Compliance' },
                      ].map(tab => (
                        <button
                          key={tab.id}
                          type="button"
                          style={{
                            padding: '5px 12px', fontSize: '0.78rem', borderRadius: '6px', cursor: 'pointer',
                            background: aiTab === tab.id ? 'hsl(var(--primary) / 20%)' : 'transparent',
                            color: aiTab === tab.id ? 'hsl(var(--primary))' : 'hsl(var(--text-secondary))',
                            border: aiTab === tab.id ? '1px solid hsl(var(--primary) / 30%)' : '1px solid transparent',
                            fontWeight: aiTab === tab.id ? 600 : 400,
                            transition: 'all 0.15s ease',
                          }}
                          onClick={() => { setAiTab(tab.id); setAiError(''); setAiResult(null); setAiComplianceResult(null); }}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {/* Generate Tab */}
                    {aiTab === 'generate' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label" style={{ fontSize: '0.78rem' }}>Describe what you want to communicate</label>
                          <textarea
                            className="form-control"
                            style={{ minHeight: '60px', fontSize: '0.85rem', resize: 'vertical' }}
                            placeholder="e.g. Warn citizens about upcoming cyclone in coastal Gujarat region with evacuation details"
                            value={aiPrompt}
                            onChange={(e) => setAiPrompt(e.target.value)}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                          <div className="form-group" style={{ marginBottom: 0, flex: '1 1 120px' }}>
                            <label className="form-label" style={{ fontSize: '0.72rem' }}>Tone</label>
                            <select className="form-control" style={{ fontSize: '0.8rem', height: 'auto', minHeight: 'auto', padding: '4px 8px' }} value={aiTone} onChange={(e) => setAiTone(e.target.value)}>
                              {tones.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                          </div>
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ padding: '6px 16px', fontSize: '0.8rem', height: 'auto', whiteSpace: 'nowrap' }}
                            disabled={aiLoading || !aiPrompt.trim()}
                            onClick={async () => {
                              setAiLoading(true); setAiError(''); setAiResult(null);
                              try {
                                const resp = await fetch(`${backendUrl}/api/ai/generate`, {
                                  method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ prompt: aiPrompt, category: formCat, channel: formChan, tone: aiTone })
                                });
                                const data = await resp.json();
                                if (!resp.ok) throw new Error(data.detail || 'Generation failed');
                                if (data.error) throw new Error(data.error);
                                setAiResult({ type: 'generate', subject: data.subject, body: data.body });
                              } catch (err) { setAiError(err.message); }
                              finally { setAiLoading(false); }
                            }}
                          >
                            {aiLoading ? 'Generating...' : '✨ Generate'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Optimize Tab */}
                    {aiTab === 'optimize' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <p style={{ fontSize: '0.78rem', color: 'hsl(var(--text-muted))', margin: 0 }}>Rewrite your current message body in a different tone. Placeholders will be preserved.</p>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                          <div className="form-group" style={{ marginBottom: 0, flex: '1 1 120px' }}>
                            <label className="form-label" style={{ fontSize: '0.72rem' }}>Target Tone</label>
                            <select className="form-control" style={{ fontSize: '0.8rem', height: 'auto', minHeight: 'auto', padding: '4px 8px' }} value={aiTone} onChange={(e) => setAiTone(e.target.value)}>
                              {tones.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                          </div>
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ padding: '6px 16px', fontSize: '0.8rem', height: 'auto', whiteSpace: 'nowrap' }}
                            disabled={aiLoading || !formBody.trim()}
                            onClick={async () => {
                              setAiLoading(true); setAiError(''); setAiResult(null);
                              try {
                                const resp = await fetch(`${backendUrl}/api/ai/optimize`, {
                                  method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ text: formBody, target_tone: aiTone })
                                });
                                const data = await resp.json();
                                if (!resp.ok) throw new Error(data.detail || 'Optimization failed');
                                if (data.error) throw new Error(data.error);
                                setAiResult({ type: 'optimize', text: data.optimized_text });
                              } catch (err) { setAiError(err.message); }
                              finally { setAiLoading(false); }
                            }}
                          >
                            {aiLoading ? 'Optimizing...' : '🎯 Optimize'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Personalize Tab */}
                    {aiTab === 'personalize' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <p style={{ fontSize: '0.78rem', color: 'hsl(var(--text-muted))', margin: 0 }}>Adapt your message for a specific audience and objective.</p>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                          <div className="form-group" style={{ marginBottom: 0, flex: '1 1 140px' }}>
                            <label className="form-label" style={{ fontSize: '0.72rem' }}>Target Audience</label>
                            <select className="form-control" style={{ fontSize: '0.8rem', height: 'auto', minHeight: 'auto', padding: '4px 8px' }} value={aiAudienceProfile} onChange={(e) => setAiAudienceProfile(e.target.value)}>
                              {audienceProfiles.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                            </select>
                          </div>
                          <div className="form-group" style={{ marginBottom: 0, flex: '1 1 140px' }}>
                            <label className="form-label" style={{ fontSize: '0.72rem' }}>Objective</label>
                            <select className="form-control" style={{ fontSize: '0.8rem', height: 'auto', minHeight: 'auto', padding: '4px 8px' }} value={aiObjective} onChange={(e) => setAiObjective(e.target.value)}>
                              {categories.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                            </select>
                          </div>
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ padding: '6px 16px', fontSize: '0.8rem', height: 'auto', whiteSpace: 'nowrap' }}
                            disabled={aiLoading || !formBody.trim()}
                            onClick={async () => {
                              setAiLoading(true); setAiError(''); setAiResult(null);
                              try {
                                const resp = await fetch(`${backendUrl}/api/ai/personalize`, {
                                  method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ text: formBody, audience_profile: aiAudienceProfile, communication_objective: aiObjective })
                                });
                                const data = await resp.json();
                                if (!resp.ok) throw new Error(data.detail || 'Personalization failed');
                                if (data.error) throw new Error(data.error);
                                setAiResult({ type: 'personalize', text: data.personalized_text });
                              } catch (err) { setAiError(err.message); }
                              finally { setAiLoading(false); }
                            }}
                          >
                            {aiLoading ? 'Personalizing...' : '👥 Personalize'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Compliance Tab */}
                    {aiTab === 'compliance' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <p style={{ fontSize: '0.78rem', color: 'hsl(var(--text-muted))', margin: 0 }}>Audit your message for compliance, readability, spam risks, and placeholder integrity.</p>
                        <button
                          type="button"
                          className="btn btn-primary"
                          style={{ padding: '6px 16px', fontSize: '0.8rem', height: 'auto', alignSelf: 'flex-start' }}
                          disabled={aiLoading || !formBody.trim()}
                          onClick={async () => {
                            setAiLoading(true); setAiError(''); setAiComplianceResult(null);
                            try {
                              const resp = await fetch(`${backendUrl}/api/ai/check-compliance`, {
                                method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
                                body: JSON.stringify({ text: formBody, category: formCat })
                              });
                              const data = await resp.json();
                              if (!resp.ok) throw new Error(parseApiError(data, 'Compliance check failed'));
                              setAiComplianceResult(data);
                            } catch (err) { setAiError(err.message); }
                            finally { setAiLoading(false); }
                          }}
                        >
                          {aiLoading ? 'Checking...' : '🛡️ Run Compliance Audit'}
                        </button>

                        {aiComplianceResult && (
                          <div style={{ padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border-color-glass)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'hsl(var(--text-primary))' }}>Quality Score</span>
                              <span style={{
                                fontSize: '1.3rem', fontWeight: 700,
                                color: aiComplianceResult.score >= 80 ? 'hsl(var(--accent))' : aiComplianceResult.score >= 50 ? 'hsl(var(--warning))' : 'hsl(var(--danger))'
                              }}>
                                {aiComplianceResult.score}/100
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: '12px', fontSize: '0.75rem', color: 'hsl(var(--text-muted))', marginBottom: '10px', flexWrap: 'wrap' }}>
                              <span>📝 {aiComplianceResult.word_count} words</span>
                              <span>📄 {aiComplianceResult.char_count} chars</span>
                              <span>🔗 {aiComplianceResult.placeholder_count} placeholders</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {aiComplianceResult.issues.map((issue, idx) => (
                                <div key={idx} style={{
                                  display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '6px 10px', borderRadius: '6px', fontSize: '0.78rem',
                                  background: issue.severity === 'error' ? 'hsl(var(--danger) / 8%)' : issue.severity === 'warning' ? 'hsl(var(--warning) / 8%)' : issue.severity === 'success' ? 'hsl(var(--accent) / 8%)' : 'rgba(255,255,255,0.03)',
                                  color: issue.severity === 'error' ? 'hsl(var(--danger))' : issue.severity === 'warning' ? 'hsl(var(--warning))' : issue.severity === 'success' ? 'hsl(var(--accent))' : 'hsl(var(--text-secondary))',
                                }}>
                                  <span>{issue.severity === 'error' ? '🚫' : issue.severity === 'warning' ? '⚠️' : issue.severity === 'success' ? '✅' : 'ℹ️'}</span>
                                  <span>{issue.message}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* AI Error */}
                    {aiError && (
                      <div style={{ marginTop: '8px', padding: '8px 12px', borderRadius: '6px', background: 'hsl(var(--danger) / 8%)', color: 'hsl(var(--danger))', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        ⚠️ {aiError}
                      </div>
                    )}

                    {/* AI Result Preview (Generate / Optimize / Personalize) */}
                    {aiResult && (
                      <div style={{ marginTop: '10px', padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border-color-glass)' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'hsl(var(--primary))', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {aiResult.type === 'generate' ? '✨ Generated Content' : aiResult.type === 'optimize' ? '🎯 Optimized Text' : '👥 Personalized Text'}
                        </div>
                        {aiResult.subject && (
                          <div style={{ fontSize: '0.8rem', color: 'hsl(var(--text-secondary))', marginBottom: '6px' }}>
                            <strong>Subject:</strong> {aiResult.subject}
                          </div>
                        )}
                        <div style={{
                          padding: '10px', borderRadius: '6px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color-glass)',
                          fontSize: '0.85rem', color: 'hsl(var(--text-primary))', lineHeight: '1.45', whiteSpace: 'pre-wrap', maxHeight: '200px', overflowY: 'auto'
                        }}>
                          {aiResult.body || aiResult.text}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ padding: '5px 12px', fontSize: '0.75rem', height: 'auto' }}
                            onClick={() => {
                              if (aiResult.type === 'generate') {
                                if (aiResult.subject) setFormSubject(aiResult.subject);
                                setFormBody(aiResult.body);
                              } else {
                                setFormBody(aiResult.text);
                              }
                              setAiResult(null);
                            }}
                          >
                            ✅ Apply to Editor
                          </button>
                          <button
                            type="button"
                            className="btn btn-dark"
                            style={{ padding: '5px 12px', fontSize: '0.75rem', height: 'auto' }}
                            onClick={() => setAiResult(null)}
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* AI Translation Helper panel */}
                <div style={{ marginTop: '14px', padding: '12px', background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--border-color-glass)', borderRadius: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '1.1rem' }}>🤖</span>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'hsl(var(--text-secondary))' }}>Groq AI Translation Helper</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <select
                        className="form-control"
                        style={{ padding: '4px 8px', fontSize: '0.8rem', width: 'auto', height: 'auto', minHeight: 'auto' }}
                        value={translationLang}
                        onChange={(e) => setTranslationLang(e.target.value)}
                      >
                        {languages.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                      <button
                        type="button"
                        className="btn btn-dark"
                        style={{ padding: '5px 12px', fontSize: '0.78rem', height: 'auto' }}
                        onClick={handleTranslateBody}
                        disabled={translationLoading}
                      >
                        {translationLoading ? 'Translating...' : 'Translate'}
                      </button>
                    </div>
                  </div>

                  {translationError && (
                    <div style={{ color: 'hsl(var(--danger))', fontSize: '0.78rem', marginTop: '8px' }}>
                      ⚠️ {translationError}
                    </div>
                  )}

                  {translationResult && (
                    <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{
                        background: 'rgba(255,255,255,0.03)',
                        padding: '10px 12px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color-glass)',
                        fontFamily: 'sans-serif',
                        fontSize: '0.85rem',
                        color: 'hsl(var(--text-primary))',
                        lineHeight: '1.4',
                        whiteSpace: 'pre-wrap'
                      }}>
                        {translationResult}
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          type="button"
                          className="btn btn-primary"
                          style={{ padding: '4px 10px', fontSize: '0.75rem', height: 'auto' }}
                          onClick={handleApplyTranslation}
                        >
                          Use Translated Content & Language
                        </button>
                        <button
                          type="button"
                          className="btn btn-dark"
                          style={{ padding: '4px 10px', fontSize: '0.75rem', height: 'auto' }}
                          onClick={() => setTranslationResult('')}
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px', borderTop: '1px solid var(--border-color-glass)', paddingTop: '16px' }}>
                {editId && (
                  <button type="button" className="btn btn-dark" style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }} onClick={() => handleTranslateAll(editId)}>
                    <span>🌐 Auto-Translate (23 Languages)</span>
                  </button>
                )}
                <button type="button" className="btn btn-dark" onClick={() => setEditorOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '1rem', height: '1rem' }}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                  Save Template
                </button>
              </div>
            </form>
          </GlassCard>
        </div>
      )}
    </div>
  );
};

export default Templates;
