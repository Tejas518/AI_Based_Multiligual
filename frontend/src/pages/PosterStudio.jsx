import React, { useState, useEffect, useCallback } from 'react';
import GlassCard from '../components/GlassCard';

const PosterStudio = ({ user, backendUrl, headers, autofillPosterData, setAutofillPosterData }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (autofillPosterData) {
      setTitle(autofillPosterData.title || '');
      setDescription(autofillPosterData.description || '');
      setCategory(autofillPosterData.category || 'emergency');
      setAutofillPosterData(null);
    }
  }, [autofillPosterData, setAutofillPosterData]);
  const [category, setCategory] = useState('awareness');
  const [tone, setTone] = useState('formal');
  const [language, setLanguage] = useState(user?.preferred_languages?.[0] || 'English');
  const [posterUrl, setPosterUrl] = useState('');
  const [promptUsed, setPromptUsed] = useState('');
  const [posterContent, setPosterContent] = useState(null);
  const [isFallback, setIsFallback] = useState(false);
  const [rawImageUrl, setRawImageUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [regeneratingText, setRegeneratingText] = useState(false);
  const [error, setError] = useState('');
  const [posterTheme, setPosterTheme] = useState('dark');
  const [loadingTimer, setLoadingTimer] = useState(0);
  const [fontsLoaded, setFontsLoaded] = useState(false);

  const [showTemplateChoiceModal, setShowTemplateChoiceModal] = useState(false);
  const [pendingTemplateData, setPendingTemplateData] = useState(null);

  const applyTemplateReplace = (data) => {
    setTitle(data.title || '');
    setDescription(data.description || '');
    setCategory(data.category || 'awareness');
    if (data.tone) setTone(data.tone);
    if (data.language) setLanguage(data.language);
    setPosterUrl('');
    setRawImageUrl('');
    setPosterContent(null);
    setPromptUsed('');
    setPosterId(null);
    setShowTemplateChoiceModal(false);
    setPendingTemplateData(null);
  };

  const applyTemplateMerge = (data) => {
    setTitle(prev => prev ? `${prev} • ${data.title}` : data.title);
    setDescription(prev => prev ? `${prev}\n• ${data.description}` : data.description);
    if (posterContent) {
      setPosterContent(prev => ({
        ...prev,
        body_points: [...(prev.body_points || []), data.description]
      }));
    }
    setShowTemplateChoiceModal(false);
    setPendingTemplateData(null);
  };

  const handleSelectTemplateOrCampaign = (data) => {
    if (title.trim() || description.trim() || posterContent) {
      setPendingTemplateData(data);
      setShowTemplateChoiceModal(true);
    } else {
      applyTemplateReplace(data);
    }
  };

  // Restore draft prompt from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('commai_poster_draft');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.title && !title) setTitle(parsed.title);
        if (parsed.description && !description) setDescription(parsed.description);
        if (parsed.category) setCategory(parsed.category);
        if (parsed.tone) setTone(parsed.tone);
        if (parsed.language) setLanguage(parsed.language);
      }
    } catch (e) {}
  }, []);

  // Save prompt draft to localStorage whenever form inputs change
  useEffect(() => {
    if (title || description) {
      try {
        localStorage.setItem('commai_poster_draft', JSON.stringify({
          title, description, category, tone, language
        }));
      } catch (e) {}
    }
  }, [title, description, category, tone, language]);

  // Generation timer effect
  useEffect(() => {
    let interval;
    if (loading) {
      setLoadingTimer(0);
      interval = setInterval(() => {
        setLoadingTimer(prev => prev + 1);
      }, 1000);
    } else {
      setLoadingTimer(0);
    }
    return () => clearInterval(interval);
  }, [loading]);

  const [campaignsList, setCampaignsList] = useState([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');

  const [posterId, setPosterId] = useState(null);
  const [audienceProfiles, setAudienceProfiles] = useState([]);
  const [segments, setSegments] = useState([]);
  const [targetMode, setTargetMode] = useState('all'); // 'all', 'segment', 'profiles'
  const [selectedAudienceIds, setSelectedAudienceIds] = useState([]);
  const [selectedSegmentId, setSelectedSegmentId] = useState('');
  const [selectedChannels, setSelectedChannels] = useState(['email']);
  const [sendLoading, setSendLoading] = useState(false);
  const [sendSuccess, setSendSuccess] = useState('');
  const [showFullscreenModal, setShowFullscreenModal] = useState(false);

  // Fetch audience profiles and segments on mount
  useEffect(() => {
    const fetchAudienceAndSegments = async () => {
      try {
        const audResponse = await fetch(`${backendUrl}/api/audiences?limit=1000`, { headers });
        if (audResponse.ok) {
          const audData = await audResponse.json();
          setAudienceProfiles(audData.results || []);
        }
        const segResponse = await fetch(`${backendUrl}/api/segments`, { headers });
        if (segResponse.ok) {
          const segData = await segResponse.json();
          setSegments(segData || []);
        }
      } catch (err) {
        console.error('Failed to load audience or segments in Poster Studio:', err);
      }
    };
    fetchAudienceAndSegments();
  }, [backendUrl, headers]);


  // Load Google Noto Sans fonts for all Indic scripts
  useEffect(() => {
    const loadFonts = async () => {
      const fontFamilies = [
        // Base Latin + Devanagari (Hindi, Marathi, Sanskrit, Nepali, Bodo, Dogri, Maithili, Konkani)
        { name: 'Noto Sans Devanagari', url: 'https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;600;700;900&display=swap' },
        // Bengali + Assamese
        { name: 'Noto Sans Bengali', url: 'https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;600;700;900&display=swap' },
        // Tamil
        { name: 'Noto Sans Tamil', url: 'https://fonts.googleapis.com/css2?family=Noto+Sans+Tamil:wght@400;600;700;900&display=swap' },
        // Telugu
        { name: 'Noto Sans Telugu', url: 'https://fonts.googleapis.com/css2?family=Noto+Sans+Telugu:wght@400;600;700;900&display=swap' },
        // Gujarati
        { name: 'Noto Sans Gujarati', url: 'https://fonts.googleapis.com/css2?family=Noto+Sans+Gujarati:wght@400;600;700;900&display=swap' },
        // Kannada
        { name: 'Noto Sans Kannada', url: 'https://fonts.googleapis.com/css2?family=Noto+Sans+Kannada:wght@400;600;700;900&display=swap' },
        // Malayalam
        { name: 'Noto Sans Malayalam', url: 'https://fonts.googleapis.com/css2?family=Noto+Sans+Malayalam:wght@400;600;700;900&display=swap' },
        // Odia
        { name: 'Noto Sans Oriya', url: 'https://fonts.googleapis.com/css2?family=Noto+Sans+Oriya:wght@400;700&display=swap' },
        // Punjabi (Gurmukhi)
        { name: 'Noto Sans Gurmukhi', url: 'https://fonts.googleapis.com/css2?family=Noto+Sans+Gurmukhi:wght@400;600;700;900&display=swap' },
        // Urdu / Kashmiri / Sindhi (Arabic script)
        { name: 'Noto Sans Arabic', url: 'https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;600;700;900&display=swap' },
        // Manipuri (Meetei Mayek)
        { name: 'Noto Sans Meetei Mayek', url: 'https://fonts.googleapis.com/css2?family=Noto+Sans+Meetei+Mayek:wght@400;600;700&display=swap' },
        // Santali (Ol Chiki)
        { name: 'Noto Sans Ol Chiki', url: 'https://fonts.googleapis.com/css2?family=Noto+Sans+Ol+Chiki:wght@400;600;700&display=swap' },
      ];

      // Load all font stylesheets
      for (const font of fontFamilies) {
        if (!document.querySelector(`link[href="${font.url}"]`)) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = font.url;
          document.head.appendChild(link);
        }
      }

      // Wait for fonts to load
      try {
        await document.fonts.ready;
        setFontsLoaded(true);
      } catch (e) {
        console.warn('Font loading warning:', e);
        setFontsLoaded(true); // proceed anyway
      }
    };

    loadFonts();
  }, []);

  // Language → font family mapping
  const getFontFamily = (lang) => {
    const fontMap = {
      'Hindi': "'Noto Sans Devanagari', 'Noto Sans', sans-serif",
      'Marathi': "'Noto Sans Devanagari', 'Noto Sans', sans-serif",
      'Sanskrit': "'Noto Sans Devanagari', 'Noto Sans', sans-serif",
      'Nepali': "'Noto Sans Devanagari', 'Noto Sans', sans-serif",
      'Bodo': "'Noto Sans Devanagari', 'Noto Sans', sans-serif",
      'Dogri': "'Noto Sans Devanagari', 'Noto Sans', sans-serif",
      'Maithili': "'Noto Sans Devanagari', 'Noto Sans', sans-serif",
      'Konkani': "'Noto Sans Devanagari', 'Noto Sans', sans-serif",
      'Bengali': "'Noto Sans Bengali', 'Noto Sans', sans-serif",
      'Assamese': "'Noto Sans Bengali', 'Noto Sans', sans-serif",
      'Tamil': "'Noto Sans Tamil', 'Noto Sans', sans-serif",
      'Telugu': "'Noto Sans Telugu', 'Noto Sans', sans-serif",
      'Gujarati': "'Noto Sans Gujarati', 'Noto Sans', sans-serif",
      'Kannada': "'Noto Sans Kannada', 'Noto Sans', sans-serif",
      'Malayalam': "'Noto Sans Malayalam', 'Noto Sans', sans-serif",
      'Odia': "'Noto Sans Oriya', 'Noto Sans', sans-serif",
      'Punjabi': "'Noto Sans Gurmukhi', 'Noto Sans', sans-serif",
      'Urdu': "'Noto Sans Arabic', 'Noto Sans', sans-serif",
      'Kashmiri': "'Noto Sans Arabic', 'Noto Sans', sans-serif",
      'Sindhi': "'Noto Sans Arabic', 'Noto Sans', sans-serif",
      'Manipuri': "'Noto Sans Meetei Mayek', 'Noto Sans', sans-serif",
      'Santali': "'Noto Sans Ol Chiki', 'Noto Sans', sans-serif",
      'English': "'Noto Sans', Arial, sans-serif",
    };
    return fontMap[lang] || "'Noto Sans', Arial, sans-serif";
  };

  // RTL check for Urdu/Kashmiri/Sindhi
  const isRTL = (lang) => ['Urdu', 'Kashmiri', 'Sindhi'].includes(lang);

  useEffect(() => {
    const fetchCampaigns = async () => {
      try {
        const response = await fetch(`${backendUrl}/api/campaigns`, { headers });
        if (response.ok) {
          const data = await response.json();
          if (user?.role === 'campaign_manager') {
            setCampaignsList(data.filter(c => c.created_by === user.id));
          } else {
            setCampaignsList(data);
          }
        }
      } catch (err) {
        console.error('Failed to load campaigns in Poster Studio:', err);
      }
    };
    fetchCampaigns();
  }, [backendUrl, headers, user]);

  const handleCampaignSelect = (campId) => {
    setSelectedCampaignId(campId);
    if (!campId) return;
    const selected = campaignsList.find(c => c.id === campId);
    if (selected) {
      const data = {
        title: selected.title || '',
        description: selected.custom_body || selected.description || selected.objective || '',
        category: selected.campaign_type === 'emergency_alert' ? 'emergency' : 'awareness'
      };
      handleSelectTemplateOrCampaign(data);
    }
  };

  const languages = [
    "English", "Hindi", "Assamese", "Bengali", "Bodo", "Dogri", "Gujarati", 
    "Kannada", "Kashmiri", "Konkani", "Maithili", "Malayalam", "Manipuri", 
    "Marathi", "Nepali", "Odia", "Punjabi", "Sanskrit", "Santali", "Sindhi", 
    "Tamil", "Telugu", "Urdu"
  ];

  const categories = ['emergency', 'awareness', 'education', 'announcement'];
  const tones = ['formal', 'urgent', 'empathetic', 'simplified'];

  // Category color accents for poster design
  const categoryColors = {
    emergency: { primary: '#EF4444', accent: '#FCA5A5', gradient: 'linear-gradient(135deg, #DC2626 0%, #F97316 100%)' },
    awareness: { primary: '#06B6D4', accent: '#67E8F9', gradient: 'linear-gradient(135deg, #0891B2 0%, #10B981 100%)' },
    education: { primary: '#8B5CF6', accent: '#C4B5FD', gradient: 'linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)' },
    announcement: { primary: '#3B82F6', accent: '#93C5FD', gradient: 'linear-gradient(135deg, #2563EB 0%, #6366F1 100%)' },
  };

  const categoryIcons = {
    emergency: '⚠️',
    awareness: '📢',
    education: '📚',
    announcement: '📋',
  };

  /** Helper: wrap text to fit within maxWidth, returns array of lines */
  const wrapText = useCallback((ctx, text, maxWidth) => {
    if (!text) return [''];
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';
    
    for (let i = 0; i < words.length; i++) {
      const testLine = currentLine + (currentLine ? ' ' : '') + words[i];
      const metrics = ctx.measureText(testLine);
      
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = words[i];
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
    
    return lines.length > 0 ? lines : [''];
  }, []);

  /**
   * CORE: Composite translated text onto the AI-generated text-free background
   * using Canvas with proper Noto Sans font rendering for all Indian scripts.
   */
   const compositeTextOnPoster = useCallback((imageUrl, content, lang, cat, theme = 'dark') => {
    return new Promise(async (resolve) => {
      const fontFamily = getFontFamily(lang);

      // Preload target web font faces before canvas rendering to prevent font glitching or metric overlapping
      try {
        if (document.fonts) {
          await Promise.all([
            document.fonts.load(`400 20px "${fontFamily}"`),
            document.fonts.load(`600 22px "${fontFamily}"`),
            document.fonts.load(`700 20px "${fontFamily}"`),
            document.fonts.load(`900 42px "${fontFamily}"`)
          ]);
          await document.fonts.ready;
        }
      } catch (e) {
        console.warn('Font load warning before canvas composite:', e);
      }

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = imageUrl;
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const W = 1024;
        const H = 1024;
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');
        const rtl = isRTL(lang);
        const colors = categoryColors[cat] || categoryColors.awareness;
        const isDark = theme === 'dark';
        
        // 1. Draw the AI background image
        ctx.drawImage(img, 0, 0, W, H);
        
        // 1.5. Subtle global tint (minimal overlay to keep background colors vibrant)
        ctx.fillStyle = isDark ? 'rgba(3, 7, 18, 0.05)' : 'rgba(255, 255, 255, 0.05)';
        ctx.fillRect(0, 0, W, H);
        
        // 2. Draw a gradient overlay covering the FULL image for text readability
        const topOverlay = ctx.createLinearGradient(0, 0, 0, H * 0.45);
        if (isDark) {
          topOverlay.addColorStop(0, 'rgba(3, 7, 18, 0.15)');
          topOverlay.addColorStop(0.5, 'rgba(3, 7, 18, 0.05)');
          topOverlay.addColorStop(1, 'rgba(3, 7, 18, 0)');
        } else {
          topOverlay.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
          topOverlay.addColorStop(0.5, 'rgba(255, 255, 255, 0.05)');
          topOverlay.addColorStop(1, 'rgba(255, 255, 255, 0)');
        }
        ctx.fillStyle = topOverlay;
        ctx.fillRect(0, 0, W, H * 0.45);
        
        const overlayGrad = ctx.createLinearGradient(0, H * 0.4, 0, H);
        if (isDark) {
          overlayGrad.addColorStop(0, 'rgba(3, 7, 18, 0)');
          overlayGrad.addColorStop(0.3, 'rgba(3, 7, 18, 0.35)');
          overlayGrad.addColorStop(0.65, 'rgba(3, 7, 18, 0.7)');
          overlayGrad.addColorStop(1, 'rgba(3, 7, 18, 0.88)');
        } else {
          overlayGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
          overlayGrad.addColorStop(0.3, 'rgba(255, 255, 255, 0.4)');
          overlayGrad.addColorStop(0.65, 'rgba(255, 255, 255, 0.75)');
          overlayGrad.addColorStop(1, 'rgba(255, 255, 255, 0.9)');
        }
        ctx.fillStyle = overlayGrad;
        ctx.fillRect(0, 0, W, H);
        
        // 3. Top banner — category tag
        const bannerH = 52;
        ctx.fillStyle = isDark ? 'rgba(3, 7, 18, 0.75)' : 'rgba(255, 255, 255, 0.85)';
        ctx.fillRect(0, 0, W, bannerH);
        // Accent line
        ctx.fillStyle = colors.primary;
        ctx.fillRect(0, bannerH - 3, W, 3);
        
        const icon = categoryIcons[cat] || '📢';
        ctx.font = `bold 18px ${fontFamily}`;
        ctx.fillStyle = isDark ? colors.accent : colors.primary;
        const tagText = `${icon}  ${cat.toUpperCase()} • ${lang.toUpperCase()}`;
        if (rtl) {
          ctx.textAlign = 'right';
          ctx.fillText(tagText, W - 30, 34);
        } else {
          ctx.textAlign = 'left';
          ctx.fillText(tagText, 30, 34);
        }
        
        // 4. Main content area (bottom section)
        const contentStartY = H * 0.5;
        const padding = 45;
        const textAlign = rtl ? 'right' : 'left';
        const textX = rtl ? W - padding : padding;
        const maxTextW = W - padding * 2;
        
        ctx.textAlign = textAlign;
        
        // 5. Accent bar indicator
        if (!rtl) {
          ctx.fillStyle = colors.primary;
          const barRoundRect = (x, y, w, h, r) => {
            ctx.beginPath();
            if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); }
            else { ctx.rect(x, y, w, h); }
            ctx.fill();
          };
          barRoundRect(padding, contentStartY, 5, 55, 3);
        }
        
        // 6. HEADLINE — large, bold, in target language
        ctx.font = `900 42px ${fontFamily}`;
        ctx.fillStyle = isDark ? '#FFFFFF' : '#111827';
        const headlineLines = wrapText(ctx, content.headline || title, maxTextW - 20);
        let currentY = contentStartY + 5;
        headlineLines.forEach(line => {
          ctx.fillText(line, rtl ? textX : textX + 18, currentY + 40);
          currentY += 52;
        });
        
        // 7. SUBHEADLINE — smaller, colored with explicit vertical spacing
        currentY += 20;
        ctx.font = `600 22px ${fontFamily}`;
        ctx.fillStyle = isDark ? colors.accent : colors.primary;
        const subLines = wrapText(ctx, content.subheadline || '', maxTextW - 20);
        subLines.forEach(line => {
          ctx.fillText(line, rtl ? textX : textX + 18, currentY + 18);
          currentY += 32;
        });
        
        // 8. Divider line
        currentY += 16;
        ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padding + 18, currentY);
        ctx.lineTo(W - padding, currentY);
        ctx.stroke();
        currentY += 24;
        
        // 9. BODY POINTS — bullet points in target language
        ctx.font = `400 20px ${fontFamily}`;
        ctx.fillStyle = isDark ? '#E2E8F0' : '#374151';
        const bulletChar = rtl ? '◂' : '▸';
        
        if (content.body_points && content.body_points.length > 0) {
          content.body_points.forEach((point) => {
            if (!point) return;
            const bulletText = `${bulletChar}  ${point}`;
            const pointLines = wrapText(ctx, bulletText, maxTextW - 40);
            pointLines.forEach((line) => {
              ctx.fillText(line, rtl ? textX - 20 : textX + 20, currentY);
              currentY += 32;
            });
            currentY += 8;
          });
        }
        
        // 10. CALL TO ACTION bar
        currentY += 12;
        const ctaH = 46;
        const ctaX = padding + 18;
        const ctaW = W - padding * 2 - 18;
        
        // CTA gradient background
        const ctaGrad = ctx.createLinearGradient(ctaX, currentY, ctaX + ctaW, currentY);
        ctaGrad.addColorStop(0, colors.primary);
        ctaGrad.addColorStop(1, `${colors.primary}88`);
        ctx.fillStyle = ctaGrad;
        ctx.beginPath();
        if (ctx.roundRect) { ctx.roundRect(ctaX, currentY, ctaW, ctaH, 8); }
        else { ctx.rect(ctaX, currentY, ctaW, ctaH); }
        ctx.fill();
        
        // 11. HELPLINE + FOOTER
        ctx.font = `700 20px ${fontFamily}`;
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.fillText(content.call_to_action || '', ctaX + ctaW / 2, currentY + 30);
        currentY += ctaH + 20;
        
        // 12. Bottom accent border
        ctx.textAlign = textAlign;
        if (content.helpline) {
          ctx.font = `600 18px ${fontFamily}`;
          ctx.fillStyle = isDark ? colors.accent : colors.primary;
          ctx.fillText(`📞  ${content.helpline}`, rtl ? textX : textX + 18, currentY);
          currentY += 28;
        }
        
        if (content.footer) {
          ctx.font = `400 15px ${fontFamily}`;
          ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(55, 65, 81, 0.6)';
          ctx.fillText(content.footer, rtl ? textX : textX + 18, currentY);
        }

        
        // 13. Bottom accent border
        ctx.fillStyle = colors.primary;
        ctx.fillRect(0, H - 4, W, 4);
        
        try {
          const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
          resolve(dataUrl);
        } catch (e) {
          console.error("Failed to generate data URL from canvas:", e);
          resolve(imageUrl);
        }
      };
      
      img.onerror = () => {
        resolve(imageUrl);
      };
    });
  }, [wrapText, categoryIcons, categoryColors]);

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    setLoading(true);
    setError('');
    setPosterUrl('');
    setPromptUsed('');
    setPosterContent(null);
    setIsFallback(false);
    setRawImageUrl('');

    try {
      const response = await fetch(`${backendUrl}/api/poster/generate`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          description,
          category,
          tone,
          language
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate poster');
      }

      const data = await response.json();
      setPosterId(data.id);
      setRawImageUrl(data.image_url);
      setPromptUsed(data.prompt_used);
      setIsFallback(data.is_fallback_content || false);

      if (data.poster_content) {
        setPosterContent(data.poster_content);
        
        // Composite translated text onto the background
        const compiledDataUrl = await compositeTextOnPoster(
          data.image_url,
          data.poster_content,
          language,
          category,
          posterTheme
        );
        setPosterUrl(compiledDataUrl);
      } else {
        // Fallback: show raw image if content generation failed
        setPosterUrl(data.image_url);
      }
    } catch (err) {
      setError(err.message || 'An error occurred while generating the poster.');
    } finally {
      setLoading(false);
    }
  };

  const handleContentChange = (field, value, index = null) => {
    setPosterContent(prev => {
      if (!prev) return prev;
      if (field === 'body_points' && index !== null) {
        const newPoints = [...prev.body_points];
        newPoints[index] = value;
        return { ...prev, body_points: newPoints };
      }
      return { ...prev, [field]: value };
    });
  };

  const handlePlaceTextOnPoster = async () => {
    if (!rawImageUrl || !posterContent) return;
    setLoading(true);
    setError('');
    try {
      const compiledDataUrl = await compositeTextOnPoster(
        rawImageUrl,
        posterContent,
        language,
        category,
        posterTheme
      );
      setPosterUrl(compiledDataUrl);
    } catch (err) {
      setError(err.message || 'Failed to place text on poster.');
    } finally {
      setLoading(false);
    }
  };

  const handleBroadcastPoster = async () => {
    if (!posterId) {
      setError('No poster ID available. Please generate a poster first.');
      return;
    }
    if (!posterUrl) {
      setError('No composited poster image found. Please place text on poster first.');
      return;
    }
    if (selectedChannels.length === 0) {
      setError('Please select at least one communication channel.');
      return;
    }

    setSendLoading(true);
    setError('');
    setSendSuccess('');

    try {
      const payload = {
        image_url: posterUrl,
        audience_ids: targetMode === 'profiles' ? selectedAudienceIds : null,
        segment_id: targetMode === 'segment' ? selectedSegmentId : null,
        channels: selectedChannels
      };

      const response = await fetch(`${backendUrl}/api/poster/${posterId}/send`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to broadcast poster.');
      }

      setSendSuccess('Poster successfully broadcasted to the target audience and saved to dashboards!');
    } catch (err) {
      setError(err.message || 'An error occurred while broadcasting the poster.');
    } finally {
      setSendLoading(false);
    }
  };


  const handleRegenerateText = async () => {
    if (!rawImageUrl || !title.trim()) return;
    
    setRegeneratingText(true);
    setError('');

    try {
      const response = await fetch(`${backendUrl}/api/poster/regenerate-content`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title, description, category, tone, language })
      });

      if (!response.ok) throw new Error('Failed to regenerate text');

      const data = await response.json();
      
      if (data.poster_content) {
        setPosterContent(data.poster_content);
        setIsFallback(data.is_fallback_content || false);
      }
    } catch (err) {
      setError(err.message || 'Failed to regenerate text content.');
    } finally {
      setRegeneratingText(false);
    }
  };

  const handleRegenerateImage = async () => {
    if (!title.trim() || !description.trim()) return;
    
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch(`${backendUrl}/api/poster/generate`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          description,
          category,
          tone,
          language
        })
      });

      if (!response.ok) {
        throw new Error('Failed to regenerate poster background image');
      }

      const data = await response.json();
      setPosterId(data.id);
      setRawImageUrl(data.image_url);
      setPromptUsed(data.prompt_used);
      
      // Auto-composite the current text (preserving edits) onto the new image background
      if (posterContent) {
        const compiledDataUrl = await compositeTextOnPoster(
          data.image_url,
          posterContent,
          language,
          category,
          posterTheme
        );
        setPosterUrl(compiledDataUrl);
      } else if (data.poster_content) {
        setPosterContent(data.poster_content);
        setIsFallback(data.is_fallback_content || false);
        const compiledDataUrl = await compositeTextOnPoster(
          data.image_url,
          data.poster_content,
          language,
          category,
          posterTheme
        );
        setPosterUrl(compiledDataUrl);
      } else {
        setPosterUrl(data.image_url);
      }
    } catch (err) {
      setError(err.message || 'An error occurred while regenerating the image background.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (rawImageUrl && posterContent) {
      compositeTextOnPoster(
        rawImageUrl,
        posterContent,
        language,
        category,
        posterTheme
      ).then(compiledDataUrl => {
        setPosterUrl(compiledDataUrl);
      }).catch(err => {
        console.error("Failed to re-composite poster:", err);
      });
    }
  }, [rawImageUrl, posterContent, language, category, posterTheme, compositeTextOnPoster]);

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 450px), 1fr))', gap: '32px' }}>
        <div>
          <GlassCard style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '20px', color: 'hsl(var(--primary))' }}>
              Visual Poster Generator
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'hsl(var(--text-muted))', marginBottom: '24px' }}>
              Create public safety warning flyers, campaign banners, and visual infographics instantly in any regional language using Generative AI.
            </p>

            <form onSubmit={handleGenerate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {campaignsList.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'hsl(var(--primary))' }}>
                    Quick Auto-Fill from Campaign
                  </label>
                  <select
                    value={selectedCampaignId}
                    onChange={(e) => handleCampaignSelect(e.target.value)}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid var(--input-border)',
                      background: 'var(--input-bg)',
                      color: 'hsl(var(--text-primary))',
                    }}
                  >
                    <option value="" style={{ background: 'var(--input-bg)' }}>-- Select a Campaign to Auto-populate --</option>
                    {campaignsList.map((camp) => (
                      <option key={camp.id} value={camp.id} style={{ background: 'var(--input-bg)' }}>
                        {camp.title} ({camp.campaign_type.replace('_', ' ').toUpperCase()})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: '600' }}>Campaign / Poster Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Swachh Ludhiana Water Drive"
                  required
                  style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--input-border)',
                    background: 'var(--input-bg)',
                    color: 'hsl(var(--text-primary))',
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: '600' }}>Content / Core Message Brief</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the poster contents, helpline details, visual hints, etc."
                  required
                  rows={4}
                  style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--input-border)',
                    background: 'var(--input-bg)',
                    color: 'hsl(var(--text-primary))',
                    resize: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: '600' }}>Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid var(--input-border)',
                      background: 'var(--input-bg)',
                      color: 'hsl(var(--text-primary))',
                    }}
                  >
                    {categories.map((cat) => (
                      <option key={cat} value={cat} style={{ background: 'var(--input-bg)', color: 'hsl(var(--text-primary))' }}>
                        {cat.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: '600' }}>Tone</label>
                  <select
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid var(--input-border)',
                      background: 'var(--input-bg)',
                      color: 'hsl(var(--text-primary))',
                    }}
                  >
                    {tones.map((t) => (
                      <option key={t} value={t} style={{ background: 'var(--input-bg)', color: 'hsl(var(--text-primary))' }}>
                        {t.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: '600' }}>Preferred Poster Language</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--input-border)',
                    background: 'var(--input-bg)',
                    color: 'hsl(var(--text-primary))',
                  }}
                >
                  {languages.map((lang) => (
                    <option key={lang} value={lang} style={{ background: 'var(--input-bg)', color: 'hsl(var(--text-primary))' }}>
                      {lang}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: '600' }}>Poster Text Theme</label>
                <div style={{ display: 'flex', gap: '20px', marginTop: '4px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>
                    <input
                      type="radio"
                      name="posterTheme"
                      value="dark"
                      checked={posterTheme === 'dark'}
                      onChange={() => setPosterTheme('dark')}
                      style={{ accentColor: 'hsl(var(--primary))', width: 'auto', margin: 0 }}
                    />
                    🌙 Dark Theme (Light Text)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>
                    <input
                      type="radio"
                      name="posterTheme"
                      value="light"
                      checked={posterTheme === 'light'}
                      onChange={() => setPosterTheme('light')}
                      style={{ accentColor: 'hsl(var(--primary))', width: 'auto', margin: 0 }}
                    />
                    ☀️ Light Theme (Dark Text)
                  </label>
                </div>
              </div>

              {loading && (
                <div className="animate-fade-in" style={{
                  marginTop: '12px',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  background: 'rgba(139, 92, 246, 0.12)',
                  border: '1px solid rgba(139, 92, 246, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}>
                  <div style={{
                    width: '20px', height: '20px',
                    border: '2px solid rgba(255,255,255,0.2)',
                    borderTopColor: '#8b5cf6',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite'
                  }}></div>
                  <div style={{ fontSize: '0.85rem', color: 'hsl(var(--text-primary))' }}>
                    <strong>Synthesizing AI Poster... {loadingTimer}s</strong>
                    <div style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', marginTop: '2px' }}>
                      Querying xAI Grok / Pollinations AI & rasterizing web fonts...
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div style={{
                  marginTop: '10px',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#fca5a5',
                  fontSize: '0.82rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', fontWeight: '700' }}>
                    <span>⚠️</span>
                    <span>Generation Failed / Timed Out</span>
                  </div>
                  <div>{error}</div>
                  <button
                    type="button"
                    onClick={handleGenerate}
                    style={{
                      marginTop: '8px',
                      padding: '6px 12px',
                      fontSize: '0.78rem',
                      borderRadius: '6px',
                      background: '#ef4444',
                      color: '#fff',
                      border: 'none',
                      cursor: 'pointer',
                      fontWeight: '600',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    🔄 Retry AI Generation (Preserving Prompt Draft)
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !title || !description}
                style={{
                  marginTop: '16px',
                  padding: '12px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--secondary)) 100%)',
                  border: 'none',
                  color: 'white',
                  fontWeight: '700',
                  cursor: 'pointer',
                  opacity: loading || !title || !description ? 0.6 : 1,
                  transition: 'opacity 0.2s',
                }}
              >
                {loading ? `Synthesizing Poster (${loadingTimer}s)...` : '🎨 Generate Flyer / Infographic'}
              </button>
            </form>
          </GlassCard>
        </div>

        <div>
          <GlassCard style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
            {loading && (
              <div style={{ textAlign: 'center' }}>
                <div className="spinner" style={{
                  border: '4px solid rgba(255,255,255,0.1)',
                  width: '50px',
                  height: '50px',
                  borderRadius: '50%',
                  borderLeftColor: 'hsl(var(--primary))',
                  animation: 'spin 1s linear infinite',
                  margin: '0 auto 16px'
                }}></div>
                <h4 style={{ fontWeight: '700', marginBottom: '8px' }}>Generating Poster...</h4>
                <p style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))' }}>
                  Creating AI background + translating content into {language}...
                </p>
              </div>
            )}

            {!loading && !posterUrl && (
              <div style={{ textAlign: 'center', color: 'hsl(var(--text-muted))' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: '64px', height: '64px', marginBottom: '16px', opacity: 0.4 }}>
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <p style={{ fontSize: '0.85rem' }}>
                  No poster generated yet. Complete the form to start visual modeling.
                </p>
              </div>
            )}

            {!loading && posterUrl && (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                
                {/* ✅ Success indicator — poster generated with correct language */}
                <div style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  background: isFallback ? 'rgba(245, 158, 11, 0.08)' : 'rgba(16, 185, 129, 0.08)',
                  border: `1px solid ${isFallback ? 'rgba(245, 158, 11, 0.25)' : 'rgba(16, 185, 129, 0.25)'}`,
                  fontSize: '0.82rem',
                  lineHeight: '1.45',
                  color: 'hsl(var(--text-primary))',
                  textAlign: 'left',
                  marginBottom: '16px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700', color: isFallback ? 'hsl(38, 92%, 55%)' : 'hsl(160, 84%, 40%)' }}>
                    <span>{isFallback ? '⚠️' : '✅'}</span>
                    <span>{isFallback ? 'Fallback Mode — AI translation unavailable' : `Poster generated in ${language}`}</span>
                  </div>
                  {isFallback && (
                    <div style={{ marginTop: '4px', fontSize: '0.78rem', color: 'hsl(var(--text-muted))' }}>
                      Text content was generated using fallback defaults. Add a Groq API key in Settings for AI-powered translation.
                    </div>
                  )}
                  {!isFallback && posterContent && (
                    <div style={{ marginTop: '4px', fontSize: '0.78rem', color: 'hsl(var(--text-muted))' }}>
                      Headline, body content, and call-to-action have been translated by AI. Text rendered using Noto Sans fonts.
                    </div>
                  )}
                </div>

                {/* Poster Image */}
                <div style={{
                  width: '100%',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  border: '1.5px solid var(--border-color-glass)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
                  background: 'var(--input-bg)',
                  marginBottom: '16px',
                }}>
                  <img
                    src={posterUrl}
                    alt={`AI Visual Poster in ${language}`}
                    style={{ width: '100%', display: 'block', maxHeight: '420px', objectFit: 'contain' }}
                  />
                </div>

                {/* Content Preview Panel */}
                {posterContent && (
                  <div style={{
                    width: '100%',
                    padding: '14px',
                    borderRadius: '10px',
                    background: 'var(--chatbot-msg-bg)',
                    border: '1px solid var(--border-color-glass)',
                    marginBottom: '16px',
                    fontSize: '0.8rem',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <h4 style={{ fontSize: '0.85rem', fontWeight: '700', color: 'hsl(var(--accent))' }}>
                        📝 Translated Poster Content ({language})
                      </h4>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={handleRegenerateText}
                          disabled={regeneratingText || loading}
                          style={{
                            padding: '5px 12px',
                            borderRadius: '6px',
                            background: 'rgba(255,255,255,0.08)',
                            border: '1px solid var(--border-color-glass)',
                            color: 'hsl(var(--primary))',
                            fontSize: '0.72rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            opacity: regeneratingText ? 0.5 : 1,
                          }}
                        >
                          {regeneratingText ? '⏳ Regenerating...' : '🔄 Regenerate Text'}
                        </button>
                        <button
                          type="button"
                          onClick={handleRegenerateImage}
                          disabled={loading || regeneratingText}
                          style={{
                            padding: '5px 12px',
                            borderRadius: '6px',
                            background: 'rgba(255,255,255,0.08)',
                            border: '1px solid var(--border-color-glass)',
                            color: 'hsl(var(--primary))',
                            fontSize: '0.72rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            opacity: loading ? 0.5 : 1,
                          }}
                        >
                          {loading ? '⏳ Regenerating...' : '🖼️ Regenerate Image'}
                        </button>
                      </div>
                    </div>
                    <div style={{ lineHeight: '1.8', color: 'hsl(var(--text-primary))', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <strong>Headline:</strong>
                        <input
                          type="text"
                          value={posterContent.headline || ''}
                          onChange={(e) => handleContentChange('headline', e.target.value)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            borderBottom: '1px dashed currentColor',
                            color: 'inherit',
                            fontFamily: getFontFamily(language),
                            fontSize: 'inherit',
                            fontWeight: 'inherit',
                            flex: 1,
                            marginLeft: '8px',
                            padding: '2px 4px',
                            outline: 'none',
                          }}
                        />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <strong>Subheadline:</strong>
                        <input
                          type="text"
                          value={posterContent.subheadline || ''}
                          onChange={(e) => handleContentChange('subheadline', e.target.value)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            borderBottom: '1px dashed currentColor',
                            color: 'inherit',
                            fontFamily: getFontFamily(language),
                            fontSize: 'inherit',
                            fontWeight: 'inherit',
                            flex: 1,
                            marginLeft: '8px',
                            padding: '2px 4px',
                            outline: 'none',
                          }}
                        />
                      </div>
                      <div style={{ marginTop: '4px' }}>
                        <strong>Key Points:</strong>
                        <ul style={{ margin: '4px 0 0 16px', padding: 0, listStyle: 'none' }}>
                          {posterContent.body_points?.map((pt, i) => (
                            <li key={i} style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                              <span style={{ marginRight: '6px' }}>•</span>
                              <input
                                type="text"
                                value={pt || ''}
                                onChange={(e) => handleContentChange('body_points', e.target.value, i)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  borderBottom: '1px dashed currentColor',
                                  color: 'inherit',
                                  fontFamily: getFontFamily(language),
                                  fontSize: 'inherit',
                                  fontWeight: 'inherit',
                                  flex: 1,
                                  padding: '2px 4px',
                                  outline: 'none',
                                }}
                              />
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <strong>Call to Action:</strong>
                        <input
                          type="text"
                          value={posterContent.call_to_action || ''}
                          onChange={(e) => handleContentChange('call_to_action', e.target.value)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            borderBottom: '1px dashed currentColor',
                            color: 'inherit',
                            fontFamily: getFontFamily(language),
                            fontSize: 'inherit',
                            fontWeight: 'inherit',
                            flex: 1,
                            marginLeft: '8px',
                            padding: '2px 4px',
                            outline: 'none',
                          }}
                        />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <strong>Helpline:</strong>
                        <input
                          type="text"
                          value={posterContent.helpline || ''}
                          onChange={(e) => handleContentChange('helpline', e.target.value)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            borderBottom: '1px dashed currentColor',
                            color: 'inherit',
                            fontFamily: getFontFamily(language),
                            fontSize: 'inherit',
                            fontWeight: 'inherit',
                            flex: 1,
                            marginLeft: '8px',
                            padding: '2px 4px',
                            outline: 'none',
                          }}
                        />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <strong>Footer:</strong>
                        <input
                          type="text"
                          value={posterContent.footer || ''}
                          onChange={(e) => handleContentChange('footer', e.target.value)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            borderBottom: '1px dashed currentColor',
                            color: 'inherit',
                            fontFamily: getFontFamily(language),
                            fontSize: 'inherit',
                            fontWeight: 'inherit',
                            flex: 1,
                            marginLeft: '8px',
                            padding: '2px 4px',
                            outline: 'none',
                          }}
                        />
                      </div>
                    </div>

                    <button
                      onClick={handlePlaceTextOnPoster}
                      disabled={loading || regeneratingText}
                      style={{
                        marginTop: '16px',
                        width: '100%',
                        padding: '10px',
                        borderRadius: '8px',
                        background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--secondary)) 100%)',
                        border: 'none',
                        color: 'white',
                        fontSize: '0.8rem',
                        fontWeight: '700',
                        cursor: 'pointer',
                        opacity: loading || regeneratingText ? 0.6 : 1,
                        transition: 'opacity 0.2s',
                      }}
                    >
                      ✍️ Place Text on Poster
                    </button>
                  </div>
                )}

                {/* Prompt used */}
                <div style={{ width: '100%', marginBottom: '16px' }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: '700', marginBottom: '6px', color: 'hsl(var(--accent))' }}>
                    AI Prompts Composition:
                  </h4>
                  <div style={{
                    padding: '12px',
                    borderRadius: '8px',
                    background: 'var(--chatbot-msg-bg)',
                    color: 'hsl(var(--text-primary))',
                    fontSize: '0.75rem',
                    lineHeight: '1.4',
                    fontFamily: 'monospace',
                    maxHeight: '100px',
                    overflowY: 'auto',
                    border: '1px solid var(--border-color-glass)'
                  }}>
                    {promptUsed}
                  </div>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
                  <button
                    onClick={() => setShowFullscreenModal(true)}
                    style={{
                      flex: 1,
                      textAlign: 'center',
                      padding: '10px',
                      borderRadius: '8px',
                      background: 'rgba(255,255,255,0.1)',
                      border: '1px solid var(--border-color-glass)',
                      color: 'hsl(var(--text-primary))',
                      fontSize: '0.8rem',
                      fontWeight: '700',
                      textDecoration: 'none',
                      display: 'inline-block',
                      cursor: 'pointer'
                    }}
                  >
                    🔍 View Fullscreen
                  </button>
                  <button
                    onClick={() => {
                      if (posterUrl.startsWith('data:')) {
                        const a = document.createElement('a');
                        a.href = posterUrl;
                        a.download = `${title.toLowerCase().replace(/\s+/g, '_')}_poster_${language.toLowerCase()}.jpg`;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                      } else {
                        fetch(posterUrl)
                          .then(res => res.blob())
                          .then(blob => {
                            const url = window.URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `${title.toLowerCase().replace(/\s+/g, '_')}_poster_${language.toLowerCase()}.jpg`;
                            document.body.appendChild(a);
                            a.click();
                            a.remove();
                          });
                      }
                    }}
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: '8px',
                      background: 'hsl(var(--primary))',
                      border: 'none',
                      color: 'white',
                      fontSize: '0.8rem',
                      fontWeight: '700',
                      cursor: 'pointer'
                    }}
                  >
                    💾 Save to Disk
                  </button>
                </div>

                {/* Broadcast Section */}
                <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.08)', width: '100%' }}>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: '800', marginBottom: '14px', color: 'hsl(var(--primary))', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    📢 Broadcast to Audience
                  </h4>

                  {/* Target Mode Tabs */}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', background: 'var(--input-bg)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color-glass)' }}>
                    {['all', 'segment', 'profiles'].map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setTargetMode(mode)}
                        style={{
                          flex: 1,
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: 'none',
                          background: targetMode === mode ? 'hsl(var(--primary))' : 'transparent',
                          color: targetMode === mode ? 'white' : 'hsl(var(--text-secondary))',
                          fontSize: '0.72rem',
                          fontWeight: '700',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                        }}
                      >
                        {mode === 'all' && 'All Recipient Profiles'}
                        {mode === 'segment' && 'Target Segment'}
                        {mode === 'profiles' && 'Selected Profiles'}
                      </button>
                    ))}
                  </div>

                  {/* Segment Dropdown */}
                  {targetMode === 'segment' && (
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: 'hsl(var(--text-secondary))', marginBottom: '6px' }}>
                        Choose Target Segment
                      </label>
                      <select
                        value={selectedSegmentId}
                        onChange={(e) => setSelectedSegmentId(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '10px',
                          borderRadius: '8px',
                          background: 'var(--input-bg)',
                          border: '1px solid var(--border-color-glass)',
                          color: 'hsl(var(--text-primary))',
                          fontSize: '0.8rem',
                          outline: 'none',
                        }}
                      >
                        <option value="" style={{ background: 'var(--input-bg)', color: 'hsl(var(--text-primary))' }}>-- Choose Segment --</option>
                        {segments.map((seg) => (
                          <option key={seg.id} value={seg.id} style={{ background: 'var(--input-bg)', color: 'hsl(var(--text-primary))' }}>
                            {seg.name} ({seg.estimated_size} members)
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Selected Profiles Checkbox List */}
                  {targetMode === 'profiles' && (
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: '700', color: 'hsl(var(--text-secondary))' }}>
                          Select Targeted Audiences ({selectedAudienceIds.length} chosen)
                        </span>
                        <button
                          onClick={() => {
                            if (selectedAudienceIds.length === audienceProfiles.length) {
                              setSelectedAudienceIds([]);
                            } else {
                              setSelectedAudienceIds(audienceProfiles.map(p => p.id));
                            }
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'hsl(var(--accent))',
                            fontSize: '0.72rem',
                            fontWeight: '700',
                            cursor: 'pointer',
                            padding: 0,
                          }}
                        >
                          {selectedAudienceIds.length === audienceProfiles.length ? 'Deselect All' : 'Select All'}
                        </button>
                      </div>
                      <div style={{
                        maxHeight: '140px',
                        overflowY: 'auto',
                        padding: '10px',
                        borderRadius: '8px',
                        background: 'var(--input-bg)',
                        border: '1px solid var(--border-color-glass)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}>
                        {audienceProfiles.length === 0 ? (
                          <span style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))' }}>No audience profiles found.</span>
                        ) : (
                          audienceProfiles.map((profile) => {
                            const isChecked = selectedAudienceIds.includes(profile.id);
                            return (
                              <label key={profile.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'hsl(var(--text-primary))', cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {
                                    if (isChecked) {
                                      setSelectedAudienceIds(selectedAudienceIds.filter(id => id !== profile.id));
                                    } else {
                                      setSelectedAudienceIds([...selectedAudienceIds, profile.id]);
                                    }
                                  }}
                                  style={{ accentColor: 'hsl(var(--primary))' }}
                                />
                                {profile.first_name} {profile.last_name} ({profile.email || profile.phone})
                              </label>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}

                  {/* Communication Channels */}
                  <div style={{ marginBottom: '16px' }}>
                    <span style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: 'hsl(var(--text-secondary))', marginBottom: '8px' }}>
                      Delivery Channels
                    </span>
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                      {['email', 'voice', 'sms', 'push', 'telegram'].map((chan) => {
                        const isChanSelected = selectedChannels.includes(chan);
                        return (
                          <label key={chan} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', textTransform: 'capitalize', color: 'hsl(var(--text-primary))', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={isChanSelected}
                              onChange={() => {
                                if (isChanSelected) {
                                  setSelectedChannels(selectedChannels.filter(c => c !== chan));
                                } else {
                                  setSelectedChannels([...selectedChannels, chan]);
                                }
                              }}
                              style={{ accentColor: 'hsl(var(--primary))' }}
                            />
                            {chan === 'voice' ? 'Call' : chan === 'sms' ? 'SMS' : chan}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Broadcast Button */}
                  <button
                    onClick={handleBroadcastPoster}
                    disabled={sendLoading}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--accent)) 100%)',
                      border: 'none',
                      color: 'white',
                      fontSize: '0.85rem',
                      fontWeight: '800',
                      cursor: 'pointer',
                      boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
                      transition: 'transform 0.1s, opacity 0.2s',
                      opacity: sendLoading ? 0.6 : 1,
                    }}
                  >
                    {sendLoading ? '🚀 Broadcasting Poster...' : '🚀 Broadcast Poster to Recipients'}
                  </button>

                  {/* Success notification */}
                  {sendSuccess && (
                    <div style={{
                      marginTop: '12px',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      background: 'rgba(46, 213, 115, 0.15)',
                      border: '1px solid rgba(46, 213, 115, 0.3)',
                      color: '#2ed573',
                      fontSize: '0.78rem',
                      fontWeight: '500',
                      textAlign: 'center',
                    }}>
                      {sendSuccess}
                    </div>
                  )}
                </div>
              </div>
            )}
          </GlassCard>
        </div>
        {showFullscreenModal && (
          <div 
            onClick={() => setShowFullscreenModal(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              background: 'rgba(3, 7, 18, 0.95)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 99999,
              cursor: 'pointer'
            }}
          >
            <div 
              onClick={(e) => e.stopPropagation()} 
              style={{ 
                position: 'relative', 
                maxWidth: '650px', 
                width: '95%', 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center',
                background: '#0e1222',
                border: '1px solid rgba(255,255,255,0.1)',
                padding: '24px',
                borderRadius: '16px',
                boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
              }}
            >
              <img 
                src={posterUrl} 
                alt={title || "Generated Poster"} 
                style={{ maxWidth: '100%', maxHeight: '65vh', borderRadius: '8px', objectFit: 'contain' }} 
              />
              <h3 style={{ color: 'white', marginTop: '16px', fontSize: '1.2rem', textAlign: 'center', fontWeight: '700' }}>
                {title || "Generated Poster"}
              </h3>
              {description && (
                <p style={{ color: 'hsl(var(--text-muted))', marginTop: '8px', fontSize: '0.88rem', textAlign: 'center', lineHeight: '1.4' }}>
                  {description}
                </p>
              )}
              <button 
                onClick={() => setShowFullscreenModal(false)}
                style={{
                  marginTop: '20px',
                  padding: '8px 28px',
                  borderRadius: '8px',
                  background: 'hsl(var(--primary))',
                  color: 'white',
                  border: 'none',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Template Application Choice Modal */}
        {showTemplateChoiceModal && pendingTemplateData && (
          <div className="modal-overlay" style={{ zIndex: 1100, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
            <GlassCard className="modal-content animate-fade-in" style={{ width: '90%', maxWidth: '520px', padding: '24px', background: 'rgba(18, 24, 38, 0.95)', border: '1px solid rgba(0, 212, 255, 0.3)' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 12px 0', color: '#00e5ff' }}>
                🎨 Apply Template to Poster Workspace
              </h3>
              <p style={{ fontSize: '0.88rem', color: 'hsl(var(--text-secondary))', lineHeight: '1.5', margin: '0 0 20px 0' }}>
                You already have active content in your workspace (<strong>"{title || 'Untitled Workspace'}"</strong>). How would you like to apply <strong>"{pendingTemplateData.title}"</strong>?
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <button
                  className="btn btn-primary"
                  onClick={() => applyTemplateMerge(pendingTemplateData)}
                  style={{ padding: '12px 16px', textTransform: 'none', fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.35)', color: '#10b981' }}
                >
                  <span style={{ fontSize: '1.2rem' }}>➕</span>
                  <div style={{ textAlign: 'left' }}>
                    <div>Merge & Append Template Layers</div>
                    <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', fontWeight: 400 }}>Keeps existing background image & title, appending template details.</div>
                  </div>
                </button>

                <button
                  className="btn btn-danger"
                  onClick={() => applyTemplateReplace(pendingTemplateData)}
                  style={{ padding: '12px 16px', textTransform: 'none', fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444' }}
                >
                  <span style={{ fontSize: '1.2rem' }}>🔄</span>
                  <div style={{ textAlign: 'left' }}>
                    <div>Replace Workspace Canvas</div>
                    <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', fontWeight: 400 }}>Resets current canvas layers and applies template defaults.</div>
                  </div>
                </button>
              </div>

              <div style={{ marginTop: '16px', textAlign: 'right' }}>
                <button className="btn btn-ghost" style={{ fontSize: '0.8rem' }} onClick={() => { setShowTemplateChoiceModal(false); setPendingTemplateData(null); }}>
                  Cancel
                </button>
              </div>
            </GlassCard>
          </div>
        )}
      </div>
    </div>
  );
};

export default PosterStudio;
