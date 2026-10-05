import React, { useState, useEffect, useCallback, useRef } from 'react';
import GlassCard from '../components/GlassCard';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export default function SOSReports({ user, backendUrl, headers, setActiveTab }) {
  const isAudience = user?.role === 'audience';
  const isOperator = user?.role === 'admin' || user?.role === 'campaign_manager';

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form states (Citizen)
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [reportType, setReportType] = useState('medical');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [locationName, setLocationName] = useState('');
  const [reporterName, setReporterName] = useState(user?.full_name || '');
  const [reporterPhone, setReporterPhone] = useState('');
  const [reporterEmail, setReporterEmail] = useState(user?.email || '');
  const [locLoading, setLocLoading] = useState(false);

  // Map & Location Search States
  const [showMap, setShowMap] = useState(true);
  const [addressSearchQuery, setAddressSearchQuery] = useState('');
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [geoStatusMessage, setGeoStatusMessage] = useState('');
  const [showLocationDisabledModal, setShowLocationDisabledModal] = useState(false);
  
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);

  // Triage state (Operator)
  const [selectedReport, setSelectedReport] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [triageStatus, setTriageStatus] = useState('reported');
  const [staffReply, setStaffReply] = useState('');
  const [triageLoading, setTriageLoading] = useState(false);
  const [triageSavedMessage, setTriageSavedMessage] = useState('');
  const [seeding, setSeeding] = useState(false);

  // Real-Time Distress Sync & Live Status Alerts
  const [lastSyncedAt, setLastSyncedAt] = useState(new Date());
  const [statusUpdateAlert, setStatusUpdateAlert] = useState(null);
  const [updatedTicketIds, setUpdatedTicketIds] = useState(new Set());
  const prevReportsMapRef = useRef({});

  const handleSeedDemoSOSData = async () => {
    setSeeding(true);
    setError('');
    setSuccess('');
    
    const demoReports = [
      {
        title: "🌊 Waterlogging & Flash Flood near Connaught Place Market",
        description: "Torrential downpour has caused sudden waterlogging up to 2.5 feet near CP. Stalled vehicles are blocking intersections, and water is starting to enter ground-floor shops. Immediate assistance required for water drainage.",
        report_type: "flood",
        latitude: "28.6139",
        longitude: "77.2090",
        location_name: "Block B Crossing, Connaught Place Market, New Delhi",
        reporter_name: "Nikhil Kapur",
        reporter_phone: "9810452391",
        reporter_email: "nikhil.kapur@example.com"
      },
      {
        title: "🚧 Major Roadblock: Collapsed Tree Blocks Linking Road",
        description: "A massive, century-old banyan tree has collapsed completely across all three lanes of Linking Road due to heavy winds. All vehicular traffic is halted. Municipal cleanup staff and traffic redirection police are needed.",
        report_type: "roadblock",
        latitude: "19.0760",
        longitude: "72.8777",
        location_name: "Near National College Intersection, Linking Road, Mumbai",
        reporter_name: "Ananya Deshmukh",
        reporter_phone: "9820381744",
        reporter_email: "ananya.d@example.com"
      },
      {
        title: "🔥 Electrical Street Transformer Burst & Active Fire",
        description: "An electrical street transformer burst after a sudden power surge. Active fire sparks are flying, and there is thick black toxic smoke. Fire brigade has been notified, police barricades are needed to prevent pedestrian access.",
        report_type: "fire",
        latitude: "12.9716",
        longitude: "77.5946",
        location_name: "100ft Road (Opposite Metro Pillar 84), Indiranagar, Bengaluru",
        reporter_name: "Rahul Hegde",
        reporter_phone: "9740283155",
        reporter_email: "rahul.hegde@example.com"
      }
    ];

    try {
      for (const report of demoReports) {
        const response = await fetch(`${backendUrl}/api/sos`, {
          method: 'POST',
          headers: { 
            ...headers,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(report)
        });
        if (!response.ok) {
          throw new Error(`Server returned status code ${response.status}`);
        }
      }
      setSuccess('✅ 3 Realistic Distress Alerts successfully seeded! The emergency queue has been updated.');
      await fetchReports(true);
    } catch (err) {
      setError(`Failed to seed demo data: ${err.message}`);
    } finally {
      setSeeding(false);
    }
  };

  // Fetch reports with status change tracking
  const fetchReports = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    try {
      let url = `${backendUrl}/api/sos`;
      if (isAudience) {
        url = `${backendUrl}/api/sos/mine`;
      } else if (statusFilter) {
        url = `${backendUrl}/api/sos?status_filter=${statusFilter}`;
      }
      
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error('Failed to load SOS incident tickets.');
      const data = await res.json();

      // Check for real-time status changes in existing citizen tickets
      if (!isInitial && Object.keys(prevReportsMapRef.current).length > 0) {
        data.forEach(report => {
          const prev = prevReportsMapRef.current[report.id];
          if (prev) {
            const statusChanged = prev.status !== report.status;
            const replyChanged = prev.staff_reply !== report.staff_reply && report.staff_reply;
            
            if (statusChanged || replyChanged) {
              setUpdatedTicketIds(prevSet => new Set([...prevSet, report.id]));
              setStatusUpdateAlert({
                title: report.title,
                status: report.status,
                staffReply: report.staff_reply,
                timestamp: new Date()
              });
            }
          }
        });
      }

      // Update map reference
      const newMap = {};
      data.forEach(r => { newMap[r.id] = r; });
      prevReportsMapRef.current = newMap;

      setReports(data);
      setLastSyncedAt(new Date());
      
      // Auto-select first report for operators if none selected, or update selected object on live sync
      if (isOperator && data.length > 0) {
        setSelectedReport(prev => {
          if (!prev) {
            setTriageStatus(data[0].status);
            setStaffReply(data[0].staff_reply || '');
            return data[0];
          }
          const freshMatch = data.find(r => r.id === prev.id);
          return freshMatch || prev;
        });
      }
    } catch (err) {
      if (isInitial) setError(err.message);
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [backendUrl, headers, isAudience, isOperator, statusFilter]);

  // Initial fetch and 5-second polling interval
  useEffect(() => {
    fetchReports(true);
    const interval = setInterval(() => {
      fetchReports(false);
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchReports]);

  // Initialize interactive Leaflet map for location pin drop
  useEffect(() => {
    if (!mapContainerRef.current || !isAudience) return;

    if (!mapInstanceRef.current) {
      const initialLat = latitude ? parseFloat(latitude) : 28.6139;
      const initialLng = longitude ? parseFloat(longitude) : 77.2090;

      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        scrollWheelZoom: true
      }).setView([initialLat, initialLng], 12);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      // Custom high-visibility SVG pin marker icon
      const customPinIcon = L.divIcon({
        className: 'sos-interactive-pin',
        html: `
          <div style="
            width: 36px; height: 36px;
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
            border: 3px solid #ffffff;
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            box-shadow: 0 4px 16px rgba(239, 68, 68, 0.7), 0 0 0 6px rgba(239, 68, 68, 0.25);
            display: flex; alignItems: center; justifyContent: center;
            cursor: grab;
          ">
            <span style="transform: rotate(45deg); font-size: 16px; color: white;">📍</span>
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 36]
      });

      const marker = L.marker([initialLat, initialLng], {
        draggable: true,
        icon: customPinIcon
      }).addTo(map);

      // Handle map clicks to place pin
      map.on('click', (e) => {
        const { lat, lng } = e.latlng;
        marker.setLatLng([lat, lng]);
        handleLocationPick(lat, lng);
      });

      // Handle marker drag
      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        handleLocationPick(pos.lat, pos.lng);
      });

      mapInstanceRef.current = map;
      markerRef.current = marker;
      
      // Trigger map resize fix
      setTimeout(() => map.invalidateSize(), 300);
    }
  }, [showMap, isAudience]);

  // Handle updates when lat/lng change from external inputs/GPS
  const handleLocationPick = async (lat, lng) => {
    const roundedLat = parseFloat(lat).toFixed(6);
    const roundedLng = parseFloat(lng).toFixed(6);
    setLatitude(roundedLat);
    setLongitude(roundedLng);
    setLocationName(`GPS: ${roundedLat}, ${roundedLng}`);
    setGeoStatusMessage(`📍 Pin set at coordinates: ${roundedLat}, ${roundedLng}. Fetching street address...`);

    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, {
        headers: { 'Accept-Language': 'en' }
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.display_name) {
          setLocationName(data.display_name);
          setGeoStatusMessage(`✓ Verified Landmark: ${data.display_name}`);
        }
      }
    } catch (err) {
      console.debug('Reverse geocode fallback:', err);
    }
  };

  // Search Address / Landmark via Nominatim Geocoding
  const handleSearchAddress = async (e) => {
    e.preventDefault();
    if (!addressSearchQuery.trim()) return;
    setIsSearchingAddress(true);
    setGeoStatusMessage('🔍 Geocoding address query...');
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressSearchQuery.trim())}`, {
        headers: { 'Accept-Language': 'en' }
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          const result = data[0];
          const lat = parseFloat(result.lat);
          const lng = parseFloat(result.lon);
          setLatitude(lat.toFixed(6));
          setLongitude(lng.toFixed(6));
          setLocationName(result.display_name);
          
          if (mapInstanceRef.current && markerRef.current) {
            mapInstanceRef.current.flyTo([lat, lng], 15);
            markerRef.current.setLatLng([lat, lng]);
          }
          setGeoStatusMessage(`🎯 Location found & pin dropped: ${result.display_name}`);
        } else {
          setGeoStatusMessage('⚠️ Location address not found. Please click directly on the interactive map to drop your pin.');
        }
      }
    } catch (err) {
      setGeoStatusMessage('⚠️ Geocoding request failed. Please tap directly on the map to set coordinates.');
    } finally {
      setIsSearchingAddress(false);
    }
  };

  // Grab location via browser GPS (with graceful fallback to map picker)
  const handleGrabLocation = () => {
    if (!navigator.geolocation) {
      setGeoStatusMessage('⚠️ Geolocation is not supported by your browser. Please tap directly on the Leaflet map below to drop your pin.');
      setShowMap(true);
      return;
    }
    setLocLoading(true);
    setGeoStatusMessage('🛰️ Requesting high-accuracy GPS coordinates...');
    
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setLatitude(lat.toFixed(6));
        setLongitude(lng.toFixed(6));
        setLocLoading(false);
        setGeoStatusMessage(`✓ Precise GPS Acquired (${pos.coords.accuracy.toFixed(0)}m accuracy). Updating pin...`);

        if (mapInstanceRef.current && markerRef.current) {
          mapInstanceRef.current.flyTo([lat, lng], 15);
          markerRef.current.setLatLng([lat, lng]);
        }
        handleLocationPick(lat, lng);
      },
      (err) => {
        console.warn('Geolocation error:', err);
        setLocLoading(false);
        setGeoStatusMessage('⚠️ Location disabled or GPS signal unavailable. Please enter address manually or drop a pin on the map.');
        setShowLocationDisabledModal(true);
        setShowMap(true);
      },
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 0 }
    );
  };

  // Submit SOS (Citizen)
  const handleSOSSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setError('Please enter Title and Description details.');
      return;
    }
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${backendUrl}/api/sos`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          report_type: reportType,
          latitude: latitude ? parseFloat(latitude) : null,
          longitude: longitude ? parseFloat(longitude) : null,
          location_name: locationName.trim() || 'Manual Pin Drop Location',
          reporter_name: reporterName.trim(),
          reporter_phone: reporterPhone.trim(),
          reporter_email: reporterEmail.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) {
        let errStr = 'Distress signal submission failed.';
        if (Array.isArray(data.detail)) {
          errStr = data.detail.map(d => d.msg || JSON.stringify(d)).join(', ');
        } else if (data.detail && typeof data.detail === 'object') {
          errStr = data.detail.message || JSON.stringify(data.detail);
        } else if (data.detail) {
          errStr = String(data.detail);
        }
        throw new Error(errStr);
      }
      setSuccess('🚨 Emergency SOS Distress Report dispatched successfully! Response operators have been notified.');
      
      // Reset form
      setTitle('');
      setDescription('');
      setLatitude('');
      setLongitude('');
      setLocationName('');
      setReporterPhone('');
      setGeoStatusMessage('');
      
      fetchReports(true);
    } catch (err) {
      setError(err.message);
    }
  };

  // Triage incident update (Operator)
  const handleTriageSubmit = async (e) => {
    e.preventDefault();
    if (!selectedReport) return;
    setTriageLoading(true);
    setError('');
    try {
      const res = await fetch(`${backendUrl}/api/sos/${selectedReport.id}/triage`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: triageStatus,
          staff_reply: staffReply.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to submit triage updates.');
      }
      setSuccess('Incident status and dispatch reply updated successfully!');
      setTriageSavedMessage(`✅ Saved! Status set to "${(data.status || triageStatus).toUpperCase()}" & response dispatched to citizen.`);
      setTimeout(() => setTriageSavedMessage(''), 5000);
      setSelectedReport(data);
      fetchReports(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setTriageLoading(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ padding: '8px 4px', paddingBottom: '32px' }}>
      
      {/* Real-Time Live Distress Status Notification Banner for Citizens */}
      {statusUpdateAlert && (
        <div style={{
          padding: '16px 20px',
          marginBottom: '20px',
          borderRadius: '14px',
          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(16, 185, 129, 0.2) 100%)',
          border: '2px solid rgba(59, 130, 246, 0.6)',
          boxShadow: '0 8px 24px rgba(59, 130, 246, 0.3)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px',
          animation: 'fadeIn 0.4s ease'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span className="badge" style={{ background: '#3b82f6', color: '#fff', fontSize: '0.75rem', fontWeight: 800 }}>
                ⚡ DISPATCH STATUS UPDATED LIVE
              </span>
              <span style={{ fontSize: '0.76rem', color: '#94a3b8' }}>
                {statusUpdateAlert.timestamp.toLocaleTimeString()}
              </span>
            </div>
            <h4 style={{ margin: '4px 0', fontSize: '1.05rem', fontWeight: 800, color: '#f8fafc' }}>
              Incident Ticket: "{statusUpdateAlert.title}"
            </h4>
            <p style={{ margin: 0, fontSize: '0.88rem', color: '#cbd5e1' }}>
              Triage Status changed to <strong style={{ color: statusUpdateAlert.status === 'resolved' ? '#10b981' : '#3b82f6', textTransform: 'uppercase' }}>{statusUpdateAlert.status}</strong>.
              {statusUpdateAlert.staffReply && (
                <span style={{ display: 'block', marginTop: '4px', fontStyle: 'italic', color: '#e2e8f0' }}>
                  💬 Operator Note: "{statusUpdateAlert.staffReply}"
                </span>
              )}
            </p>
          </div>
          <button
            onClick={() => setStatusUpdateAlert(null)}
            className="btn btn-sm"
            style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', cursor: 'pointer', borderRadius: '8px', padding: '6px 12px', fontSize: '0.8rem' }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'hsl(var(--text-primary))', display: 'flex', alignItems: 'center', gap: '12px', margin: 0 }}>
            🚨 Public SOS Reporting & Emergency Triage Queue
          </h2>
          <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.88rem', margin: '6px 0 0', lineHeight: 1.5, overflowWrap: 'break-word' }}>
            {isAudience 
              ? 'Report live public hazards, roadblock incidents, or emergency distress. Use auto-GPS or tap directly on the interactive map pin-dropper.'
              : 'Operational triage workspace. Monitor incoming distress reports, coordinate emergency contacts, post replies, and update active incident triage status in real time.'}
          </p>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Live Auto-Sync Indicator */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            padding: '6px 14px',
            borderRadius: '20px',
            fontSize: '0.78rem',
            color: '#10b981',
            fontWeight: 700
          }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981', animation: 'pulse 1.5s infinite' }}></span>
            <span>Live Sync (5s)</span>
            <button
              onClick={() => fetchReports(false)}
              style={{ background: 'none', border: 'none', color: '#10b981', cursor: 'pointer', fontSize: '0.8rem', padding: 0, marginLeft: '4px' }}
              title="Force Refresh Data"
            >
              🔄
            </button>
          </div>

          <button
            onClick={handleSeedDemoSOSData}
            disabled={seeding}
            className="btn btn-sm"
            style={{
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(52, 211, 153, 0.25) 100%)',
              border: '1.5px solid rgba(16, 185, 129, 0.4)',
              color: '#10b981',
              fontWeight: 800,
              fontSize: '0.85rem',
              padding: '8px 16px',
              borderRadius: '24px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.1)',
              whiteSpace: 'nowrap'
            }}
          >
            {seeding ? '🌱 Seeding...' : '🌱 Seed Demo SOS Alerts'}
          </button>
        </div>
      </div>

      {error && (
        <div className="glass-card danger-text" style={{ padding: '16px', marginBottom: '20px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.05)' }}>
          ⚠️ {error}
        </div>
      )}
      {success && (
        <div className="glass-card success-text" style={{ padding: '16px', marginBottom: '20px', borderRadius: '12px', background: 'rgba(34, 197, 94, 0.05)' }}>
          ✓ {success}
        </div>
      )}

      {/* CITIZEN INTERFACE */}
      {isAudience && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', alignItems: 'start' }}>
          
          {/* Submit form */}
          <GlassCard style={{ padding: '24px' }}>
            <h4 style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: '16px', color: 'hsl(var(--danger))' }}>Report Emergency Hazard</h4>
            <form onSubmit={handleSOSSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem', color: '#ffffff' }}>Incident Title / Topic</label>
                <input
                  type="text"
                  className="text-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Major Flooding on Main Street"
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem', color: '#ffffff' }}>Incident Type</label>
                  <select
                    className="text-input"
                    value={reportType}
                    onChange={(e) => setReportType(e.target.value)}
                    style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                  >
                    <option value="fire">🔥 Fire / Wildfire</option>
                    <option value="flood">🌊 Flood / Water logging</option>
                    <option value="medical">🚑 Medical Emergency</option>
                    <option value="roadblock">🚧 Roadblock / Tree Fall</option>
                    <option value="other">⚠️ Other Safety Hazard</option>
                  </select>
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem', color: '#ffffff' }}>GPS Location Share</label>
                  <button
                    type="button"
                    onClick={handleGrabLocation}
                    disabled={locLoading}
                    className="btn btn-dark"
                    style={{ width: '100%', fontSize: '0.78rem', padding: '10px', height: '40px', fontWeight: 'bold' }}
                  >
                    {locLoading ? 'Fetching Location...' : '📍 Share Current GPS'}
                  </button>
                </div>
              </div>

              {/* Address Search Bar */}
              <div>
                <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem', color: '#ffffff' }}>🔍 Search Address or Landmark</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    className="text-input"
                    value={addressSearchQuery}
                    onChange={(e) => setAddressSearchQuery(e.target.value)}
                    placeholder="e.g. Connaught Place, New Delhi or Linking Road Mumbai"
                  />
                  <button
                    type="button"
                    onClick={handleSearchAddress}
                    disabled={isSearchingAddress || !addressSearchQuery.trim()}
                    className="btn btn-secondary"
                    style={{ padding: '8px 16px', fontWeight: 'bold', fontSize: '0.82rem', whiteSpace: 'nowrap' }}
                  >
                    {isSearchingAddress ? 'Searching...' : 'Find on Map'}
                  </button>
                </div>
              </div>

              {/* Interactive Leaflet Pin-Drop Map */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem', margin: 0, color: '#ffffff' }}>
                    🗺️ Interactive Pin-Drop Map Picker <span style={{ color: 'hsl(var(--primary))', fontWeight: 400 }}>(Tap map to drop pin)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowMap(!showMap)}
                    style={{ background: 'none', border: 'none', color: 'hsl(var(--primary))', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 600 }}
                  >
                    {showMap ? 'Hide Map' : 'Show Map'}
                  </button>
                </div>

                {showMap && (
                  <div
                    ref={mapContainerRef}
                    style={{
                      width: '100%',
                      height: '240px',
                      borderRadius: '12px',
                      border: '1.5px solid rgba(255,255,255,0.15)',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                      overflow: 'hidden',
                      zIndex: 1
                    }}
                  />
                )}
              </div>

              {geoStatusMessage && (
                <div style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: 'rgba(59, 130, 246, 0.08)',
                  border: '1px solid rgba(59, 130, 246, 0.2)',
                  color: '#93c5fd',
                  fontSize: '0.8rem',
                  lineHeight: '1.4'
                }}>
                  {geoStatusMessage}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem', color: '#ffffff' }}>Latitude</label>
                  <input
                    type="text"
                    className="text-input"
                    value={latitude}
                    onChange={(e) => {
                      setLatitude(e.target.value);
                      if (mapInstanceRef.current && markerRef.current && !isNaN(parseFloat(e.target.value))) {
                        markerRef.current.setLatLng([parseFloat(e.target.value), parseFloat(longitude || 77.2090)]);
                      }
                    }}
                    placeholder="e.g. 28.6139"
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem', color: '#ffffff' }}>Longitude</label>
                  <input
                    type="text"
                    className="text-input"
                    value={longitude}
                    onChange={(e) => {
                      setLongitude(e.target.value);
                      if (mapInstanceRef.current && markerRef.current && !isNaN(parseFloat(e.target.value))) {
                        markerRef.current.setLatLng([parseFloat(latitude || 28.6139), parseFloat(e.target.value)]);
                      }
                    }}
                    placeholder="e.g. 77.2090"
                  />
                </div>
              </div>

              <div>
                <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem', color: '#ffffff' }}>Location Name / Landmark</label>
                <input
                  type="text"
                  className="text-input"
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                  placeholder="e.g. Near Sector-15 Metro Station gate"
                  required
                />
              </div>

              <div>
                <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem', color: '#ffffff' }}>Hazard / Distress Description</label>
                <textarea
                  rows={3}
                  className="text-input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the severity, damage, roadblock depth, or status of victims..."
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem', color: '#ffffff' }}>Reporter Name</label>
                  <input
                    type="text"
                    className="text-input"
                    value={reporterName}
                    onChange={(e) => setReporterName(e.target.value)}
                    placeholder="Your name"
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem', color: '#ffffff' }}>Contact Phone</label>
                  <input
                    type="text"
                    className="text-input"
                    value={reporterPhone}
                    onChange={(e) => setReporterPhone(e.target.value)}
                    placeholder="e.g. 9876543210"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', padding: '12px', background: 'hsl(var(--danger))', borderColor: 'hsl(var(--danger))', color: '#fff', fontWeight: 'bold', fontSize: '0.95rem', marginTop: '8px' }}
              >
                🚨 Broadcast Distress Alert (SOS)
              </button>
            </form>
          </GlassCard>

          {/* Incident logs history with live status updates */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <GlassCard style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h4 style={{ fontWeight: 800, fontSize: '1.1rem', margin: 0 }}>My Distress Incident Reports</h4>
                <span style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))' }}>
                  Synced: {lastSyncedAt.toLocaleTimeString()}
                </span>
              </div>

              {loading && reports.length === 0 ? (
                <p style={{ color: 'hsl(var(--text-muted))' }}>Scanning incident history...</p>
              ) : reports.length === 0 ? (
                <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.88rem' }}>No SOS reports filed by you yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '640px', overflowY: 'auto' }}>
                  {reports.map(r => {
                    const isRecentlyUpdated = updatedTicketIds.has(r.id);
                    let badgeColor = 'rgba(245, 158, 11, 0.15)';
                    let badgeText = 'Reported';
                    let textColor = '#f59e0b';
                    
                    if (r.status === 'acknowledged') {
                      badgeColor = 'rgba(59, 130, 246, 0.15)';
                      badgeText = 'Acknowledged';
                      textColor = '#3b82f6';
                    } else if (r.status === 'resolved') {
                      badgeColor = 'rgba(16, 185, 129, 0.15)';
                      badgeText = 'Resolved';
                      textColor = '#10b981';
                    }

                    return (
                      <div
                        key={r.id}
                        style={{
                          padding: '16px',
                          background: isRecentlyUpdated ? 'rgba(59, 130, 246, 0.08)' : 'rgba(255,255,255,0.01)',
                          border: isRecentlyUpdated ? '1.5px solid #3b82f6' : '1px solid rgba(255,255,255,0.04)',
                          borderRadius: '10px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                          boxShadow: isRecentlyUpdated ? '0 0 16px rgba(59, 130, 246, 0.2)' : 'none',
                          transition: 'all 0.3s ease'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <strong style={{ fontSize: '0.95rem' }}>{r.title}</strong>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {isRecentlyUpdated && (
                              <span style={{ fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px', background: '#3b82f6', color: '#fff', fontWeight: 'bold' }}>
                                ⚡ UPDATED LIVE
                              </span>
                            )}
                            <span style={{ fontSize: '0.74rem', padding: '2px 8px', borderRadius: '4px', background: badgeColor, color: textColor, fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                              {badgeText}
                            </span>
                          </div>
                        </div>

                        <p style={{ margin: 0, fontSize: '0.82rem', color: 'hsl(var(--text-muted))', lineHeight: '1.4', overflowWrap: 'break-word' }}>
                          {r.description}
                        </p>

                        <div style={{ fontSize: '0.78rem', display: 'flex', gap: '12px', color: 'hsl(var(--text-muted))', marginTop: '4px', flexWrap: 'wrap' }}>
                          <span>Type: <b style={{ textTransform: 'capitalize' }}>{r.report_type}</b></span>
                          <span>Location: <b>{r.location_name}</b></span>
                        </div>

                        {r.staff_reply && (
                          <div style={{ 
                            marginTop: '8px', 
                            padding: '10px 12px', 
                            background: 'rgba(59, 130, 246, 0.05)', 
                            borderLeft: '3px solid #3b82f6',
                            borderRadius: '4px',
                            fontSize: '0.8rem' 
                          }}>
                            <span style={{ display: 'block', fontWeight: 'bold', marginBottom: '2px', color: '#93c5fd' }}>Operator Dispatch Reply:</span>
                            <span style={{ color: '#e2e8f0', fontStyle: 'italic' }}>{r.staff_reply}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </GlassCard>
          </div>
        </div>
      )}

      {/* OPERATOR INTERFACE */}
      {isOperator && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px', alignItems: 'start' }}>
          
          {/* Triage list sidebar */}
          <GlassCard style={{ padding: '16px', minHeight: '600px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '10px' }}>
              <h4 style={{ fontWeight: 800, fontSize: '1.05rem', margin: 0 }}>Incident Queue</h4>
              <select
                className="text-input"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ fontSize: '0.75rem', padding: '2px 4px', width: '110px' }}
              >
                <option value="">All Tickets</option>
                <option value="reported">Reported</option>
                <option value="acknowledged">Acknowledged</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>

            {loading && reports.length === 0 ? (
              <p style={{ color: 'hsl(var(--text-muted))' }}>Scanning tickets...</p>
            ) : reports.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'hsl(var(--text-muted))' }}>
                <p style={{ fontSize: '0.85rem', margin: 0 }}>Queue is empty. No active hazard tickets.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '550px', overflowY: 'auto' }}>
                {reports.map(r => {
                  const isSelected = selectedReport?.id === r.id;
                  let badgeColor = 'rgba(245, 158, 11, 0.15)';
                  let textColor = '#f59e0b';
                  
                  if (r.status === 'acknowledged') {
                    badgeColor = 'rgba(59, 130, 246, 0.15)';
                    textColor = '#3b82f6';
                  } else if (r.status === 'resolved') {
                    badgeColor = 'rgba(16, 185, 129, 0.15)';
                    textColor = '#10b981';
                  }

                  return (
                    <div
                      key={r.id}
                      onClick={() => {
                        setSelectedReport(r);
                        setTriageStatus(r.status);
                        setStaffReply(r.staff_reply || '');
                      }}
                      style={{
                        padding: '12px 14px', borderRadius: '10px', cursor: 'pointer',
                        background: isSelected ? 'rgba(239, 68, 68, 0.06)' : 'rgba(255,255,255,0.01)',
                        border: `1.5px solid ${isSelected ? 'hsl(var(--danger))' : 'rgba(255,255,255,0.05)'}`,
                        transition: 'all 0.2s'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.7rem', textTransform: 'capitalize', color: 'hsl(var(--text-muted))' }}>{r.report_type}</span>
                        <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', background: badgeColor, color: textColor, fontWeight: 'bold' }}>
                          {r.status}
                        </span>
                      </div>
                      <div style={{ fontWeight: '700', fontSize: '0.88rem', color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)', marginTop: '4px' }}>
                        {r.title}
                      </div>
                      <div style={{ fontSize: '0.74rem', color: 'hsl(var(--text-muted))', marginTop: '4px' }}>
                        Location: {r.location_name}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </GlassCard>

          {/* Details & Response workspace */}
          <div>
            {selectedReport ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <GlassCard style={{ padding: '24px' }}>
                  <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '12px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="badge" style={{ background: 'hsl(var(--danger))', color: '#fff', fontSize: '0.75rem', fontWeight: 700 }}>
                        SOS INCIDENT DISPATCH DECK
                      </span>
                      <span style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))' }}>
                        Reported At: {new Date(selectedReport.created_at).toLocaleString()}
                      </span>
                    </div>
                    <h3 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '12px 0 6px 0' }}>{selectedReport.title}</h3>
                    <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.9rem', lineHeight: '1.5', margin: 0, overflowWrap: 'break-word' }}>
                      {selectedReport.description}
                    </p>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '16px' }}>
                    <div>
                      <span style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))' }}>Location Landmark</span>
                      <strong style={{ display: 'block', fontSize: '0.92rem', marginTop: '2px', overflowWrap: 'break-word' }}>{selectedReport.location_name}</strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))' }}>GPS Coordinates</span>
                      <strong style={{ display: 'block', fontSize: '0.92rem', marginTop: '2px' }}>
                        {selectedReport.latitude && selectedReport.longitude 
                          ? `${selectedReport.latitude}, ${selectedReport.longitude}`
                          : 'Not Provided'}
                      </strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))' }}>Reporter Profile</span>
                      <strong style={{ display: 'block', fontSize: '0.92rem', marginTop: '2px' }}>
                        {selectedReport.reporter_name || 'Anonymous citizen'}
                      </strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))' }}>Contact Channels</span>
                      <strong style={{ display: 'block', fontSize: '0.92rem', marginTop: '2px', color: 'var(--primary)' }}>
                        {selectedReport.reporter_phone || selectedReport.reporter_email || 'None Provided'}
                      </strong>
                    </div>
                  </div>
                </GlassCard>

                {/* Triage action inputs */}
                <GlassCard style={{ padding: '24px' }}>
                  <h4 style={{ fontWeight: 800, fontSize: '1.05rem', marginBottom: '16px' }}>Incident Triage Reply & Status Update</h4>
                  
                  <form onSubmit={handleTriageSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div>
                      <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>Triage State</label>
                      <select
                        className="text-input"
                        value={triageStatus}
                        onChange={(e) => setTriageStatus(e.target.value)}
                      >
                        <option value="reported">Reported (Pending review)</option>
                        <option value="acknowledged">Acknowledged (Dispatch team notified)</option>
                        <option value="resolved">Resolved (Safety hazard cleared)</option>
                      </select>
                    </div>

                    <div>
                      <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>Staff Response / Instructions Reply</label>
                      <textarea
                        rows={4}
                        className="text-input"
                        value={staffReply}
                        onChange={(e) => setStaffReply(e.target.value)}
                        placeholder="e.g. Police team dispatched to direct traffic. Please avoid the underpass."
                      />
                    </div>

                    {triageSavedMessage && (
                      <div style={{
                        padding: '12px 16px',
                        borderRadius: '10px',
                        background: 'rgba(16, 185, 129, 0.15)',
                        border: '1.5px solid rgba(16, 185, 129, 0.4)',
                        color: '#10b981',
                        fontSize: '0.88rem',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        boxShadow: '0 4px 14px rgba(16, 185, 129, 0.2)'
                      }}>
                        {triageSavedMessage}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={triageLoading}
                      className="btn btn-primary"
                      style={{
                        padding: '10px 20px',
                        fontWeight: 'bold',
                        fontSize: '0.92rem',
                        minWidth: '240px',
                        alignSelf: 'flex-end',
                        background: triageSavedMessage ? '#10b981' : undefined,
                        borderColor: triageSavedMessage ? '#10b981' : undefined,
                        transition: 'all 0.3s ease'
                      }}
                    >
                      {triageLoading ? 'Updating triage...' : triageSavedMessage ? '✓ Saved & Dispatched!' : '✓ Submit Response Update'}
                    </button>
                  </form>
                </GlassCard>
              </div>
            ) : (
              <div className="glass-card" style={{ padding: '40px', textAlign: 'center', color: 'hsl(var(--text-muted))' }}>
                🏥 Select an incoming emergency SOS ticket from the sidebar list to inspect details and deploy dispatch response coordinates.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Location Disabled Fallback Modal */}
      {showLocationDisabledModal && (
        <div className="modal-overlay" style={{ zIndex: 1100, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
          <GlassCard className="modal-content animate-fade-in" style={{ width: '90%', maxWidth: '500px', padding: '24px', background: 'rgba(18, 24, 38, 0.95)', border: '1px solid rgba(239, 68, 68, 0.4)' }}>
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>📍⚠️</div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#fca5a5' }}>
                Location Access Disabled / GPS Unavailable
              </h3>
            </div>
            
            <p style={{ fontSize: '0.88rem', color: 'hsl(var(--text-secondary))', lineHeight: '1.5', textAlign: 'center', marginBottom: '20px' }}>
              GPS location access is turned off or unavailable in your browser settings. Please enter your street address/landmark manually or enable location permissions in browser settings.
            </p>

            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '10px', marginBottom: '20px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontSize: '0.78rem', color: 'hsl(var(--text-muted))', fontWeight: 700, display: 'block', marginBottom: '8px' }}>
                💡 Quick Landmark Fallbacks:
              </span>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {[
                  "Near Police Station",
                  "Main Bus Stand / Station",
                  "Primary Health Centre (PHC)",
                  "Block Development Office (BDO)",
                  "District Collectorate"
                ].map(landmark => (
                  <button
                    key={landmark}
                    type="button"
                    style={{
                      fontSize: '0.75rem', padding: '4px 10px', borderRadius: '12px',
                      background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)',
                      color: '#60a5fa', cursor: 'pointer', textAlign: 'left'
                    }}
                    onClick={() => {
                      setAddressSearchQuery(landmark);
                      setLocationName(landmark);
                      setShowLocationDisabledModal(false);
                    }}
                  >
                    + {landmark}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-primary"
                onClick={() => setShowLocationDisabledModal(false)}
                style={{ padding: '8px 20px', fontSize: '0.88rem', fontWeight: 700 }}
              >
                Got It, Enter Manually
              </button>
            </div>
          </GlassCard>
        </div>
      )}

    </div>
  );
}
