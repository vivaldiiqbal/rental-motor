import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Navigation2,
  AlertTriangle,
  Battery,
  Gauge,
  Key,
  Phone,
  MessageCircle,
  ExternalLink,
  RotateCcw,
  Search,
  Play,
  Pause,
  Plus,
  RefreshCw,
  X,
  CheckCircle2,
  MapPin,
  Maximize2,
  Map as MapIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { adminApi } from '../services/adminApi';
import { usePermission } from '../hooks/usePermission';
import { useRealtimeSubscription } from '../../hooks/useRealtimeSubscription';
import { useRealtime } from '../../context/RealtimeContext';

// Fix Leaflet Default Icon path in Vite bundling
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Environment config for Map tiles
const TILE_URL =
  import.meta.env.VITE_MAP_TILE_URL ||
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTR =
  import.meta.env.VITE_MAP_ATTRIBUTION ||
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

type TabType = 'map' | 'alerts' | 'devices' | 'geofences' | 'settings' | 'access_log';
type FilterType = 'all' | 'rented' | 'garage' | 'offline' | 'alert';

export const GpsTracking: React.FC = () => {
  const { role } = usePermission();
  const isAdmin = role === 'admin';
  const { isConnected: isRealtimeConnected } = useRealtime();

  // State Utama
  const [activeTab, setActiveTab] = useState<TabType>('map');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<any[]>([]);
  const [geofences, setGeofences] = useState<any[]>([]);
  const [summary, setSummary] = useState({
    total: 0,
    onlineCount: 0,
    offlineCount: 0,
    rentedCount: 0,
    alertsCount: 0,
  });

  // Filter & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<FilterType>('all');
  const [selectedMotorId, setSelectedMotorId] = useState<number | null>(null);

  // Detail Drawer & Playback
  const [showDetailDrawer, setShowDetailDrawer] = useState<boolean>(false);
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [historyData, setHistoryData] = useState<any | null>(null);
  const [historyRange, setHistoryRange] = useState<'24h' | '3d' | '7d'>('24h');

  // Playback Player State
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playIndex, setPlayIndex] = useState<number>(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1); // 1x, 2x, 5x
  const playbackTimerRef = useRef<any>(null);

  // Admin Modals & Forms
  const [showAlertAcknowledgeModal, setShowAlertAcknowledgeModal] = useState<boolean>(false);
  const [selectedAlert, setSelectedAlert] = useState<any | null>(null);
  const [resolveNote, setResolveNote] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Admin Tabs State
  const [adminDevices, setAdminDevices] = useState<any[]>([]);
  const [adminGeofences, setAdminGeofences] = useState<any[]>([]);
  const [adminSettings, setAdminSettings] = useState<any>({});
  const [adminAccessLogs, setAdminAccessLogs] = useState<any[]>([]);
  const [showAddDeviceModal, setShowAddDeviceModal] = useState<boolean>(false);
  const [showReplaceDeviceModal, setShowReplaceDeviceModal] = useState<boolean>(false);
  const [showAddGeofenceModal, setShowAddGeofenceModal] = useState<boolean>(false);

  // Form states for modals
  const [newDeviceForm, setNewDeviceForm] = useState({
    motorcycleId: '',
    provider: 'simulator',
    externalId: '',
    label: '',
  });
  const [selectedDeviceToReplace, setSelectedDeviceToReplace] = useState<any | null>(null);
  const [replaceDeviceForm, setReplaceDeviceForm] = useState({
    externalId: '',
    label: '',
    reason: '',
  });
  const [newGeofenceForm, setNewGeofenceForm] = useState({
    name: '',
    kind: 'allowed',
    shape: 'circle',
    centerLat: -8.670458,
    centerLng: 115.212629,
    radiusM: 5000,
    appliesToAll: true,
  });

  // Map Refs
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const geofencesLayerRef = useRef<L.LayerGroup | null>(null);
  const historyMapContainerRef = useRef<HTMLDivElement | null>(null);
  const historyMapInstanceRef = useRef<L.Map | null>(null);
  const historyLayerRef = useRef<L.LayerGroup | null>(null);
  const playbackMarkerRef = useRef<L.Marker | null>(null);

  // 1. Fetch Data Live
  const fetchLiveData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const res = await adminApi.getGpsLive();
      const data = res.data;
      if (data) {
        setDevices(data.devices || []);
        setGeofences(data.geofences || []);
        setSummary({
          total: data.total || 0,
          onlineCount: data.onlineCount || 0,
          offlineCount: data.offlineCount || 0,
          rentedCount: data.rentedCount || 0,
          alertsCount: data.alertsCount || 0,
        });
        setError(null);
      }
    } catch (err: any) {
      if (!isSilent) {
        setError(err.message || 'Gagal memuat data live GPS. Pastikan server aktif.');
      }
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, []);

  // Polling cadangan tiap 10 detik
  useEffect(() => {
    fetchLiveData();
    const interval = setInterval(() => {
      fetchLiveData(true);
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchLiveData]);

  // Realtime SSE Listeners
  useRealtimeSubscription(['gps.position', 'gps.alert', 'counters.changed'], () => {
    fetchLiveData(true);
  });

  // Selected Device
  const selectedDevice = useMemo(() => {
    if (!selectedMotorId) return null;
    return devices.find((d) => d.motorcycleId === selectedMotorId) || null;
  }, [devices, selectedMotorId]);

  // Filtered Devices
  const filteredDevices = useMemo(() => {
    return devices.filter((d) => {
      // Search filter
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        d.motorcycleName?.toLowerCase().includes(q) ||
        d.plateNumber?.toLowerCase().includes(q) ||
        d.label?.toLowerCase().includes(q) ||
        d.activeBooking?.customerName?.toLowerCase().includes(q);

      if (!matchSearch) return false;

      // Status filter
      if (statusFilter === 'rented') return Boolean(d.activeBooking);
      if (statusFilter === 'garage') return !d.activeBooking && d.isOnline;
      if (statusFilter === 'offline') return !d.isOnline;
      if (statusFilter === 'alert') return d.openAlertsCount > 0;
      return true;
    });
  }, [devices, searchQuery, statusFilter]);

  // 2. Inisialisasi Peta Utama Leaflet
  useEffect(() => {
    if (activeTab !== 'map' || !mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
      }).setView([-8.670458, 115.212629], 12);

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      const tileLayer = L.tileLayer(TILE_URL, {
        attribution: TILE_ATTR,
        maxZoom: 19,
      });

      tileLayer.on('tileerror', () => {
        toast.error('Ubin peta OpenStreetMap gagal dimuat. Periksa koneksi internet Anda.', {
          id: 'map-tile-error',
        });
      });

      tileLayer.addTo(map);

      markersLayerRef.current = L.layerGroup().addTo(map);
      geofencesLayerRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
    }

    const timer = setTimeout(() => {
      mapInstanceRef.current?.invalidateSize();
    }, 250);

    return () => clearTimeout(timer);
  }, [activeTab]);

  // 3. Render Geofence Overlay pada Peta
  useEffect(() => {
    if (!mapInstanceRef.current || !geofencesLayerRef.current) return;
    geofencesLayerRef.current.clearLayers();

    geofences.forEach((geo) => {
      let color = '#2563eb'; // allowed = blue
      let fillColor = '#3b82f6';
      if (geo.kind === 'garage') {
        color = '#4b5563';
        fillColor = '#6b7280';
      } else if (geo.kind === 'forbidden') {
        color = '#dc2626';
        fillColor = '#ef4444';
      }

      if (geo.shape === 'circle' && geo.centerLat && geo.centerLng) {
        const circle = L.circle([geo.centerLat, geo.centerLng], {
          radius: Number(geo.radiusM || 1000),
          color,
          fillColor,
          fillOpacity: 0.15,
          weight: 2,
        }).bindTooltip(`<b>${geo.name}</b> (${geo.kind})`, { direction: 'top' });
        geofencesLayerRef.current?.addLayer(circle);
      } else if (geo.shape === 'polygon' && Array.isArray(geo.polygon) && geo.polygon.length > 2) {
        const latlngs = geo.polygon.map((p: any) => [
          Number(p.lat ?? p[0]),
          Number(p.lng ?? p[1]),
        ]);
        const polygon = L.polygon(latlngs, {
          color,
          fillColor,
          fillOpacity: 0.15,
          weight: 2,
        }).bindTooltip(`<b>${geo.name}</b> (${geo.kind})`, { direction: 'top' });
        geofencesLayerRef.current?.addLayer(polygon);
      }
    });
  }, [geofences]);

  // 4. Render Markers Motor pada Peta
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current) return;
    markersLayerRef.current.clearLayers();

    const validMarkers: L.Marker[] = [];

    devices.forEach((dev) => {
      if (typeof dev.lastLat !== 'number' || typeof dev.lastLng !== 'number') return;

      // Warna Marker sesuai Aturan Tahap 4:
      // Disewa = biru tua (#1d4ed8), Di Markas = abu-abu (#4b5563), Offline = abu gelap (#1f2937), Peringatan = merah (#dc2626)
      let markerColor = '#4b5563'; // markas / default
      let labelStatus = 'Di Markas';
      if (!dev.isOnline) {
        markerColor = '#1f2937';
        labelStatus = 'Offline';
      } else if (dev.openAlertsCount > 0) {
        markerColor = '#dc2626';
        labelStatus = 'Ada Peringatan';
      } else if (dev.activeBooking) {
        markerColor = '#1d4ed8';
        labelStatus = 'Disewa';
      }

      const isSelected = selectedMotorId === dev.motorcycleId;

      // Custom HTML Marker Pin
      const iconHtml = `
        <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 36px; height: 36px;">
          <div style="
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background-color: ${markerColor};
            border: 3px solid ${isSelected ? '#facc15' : '#ffffff'};
            box-shadow: 0 4px 10px rgba(0,0,0,0.35);
            display: flex;
            align-items: center;
            justify-content: center;
            color: #ffffff;
            font-size: 14px;
            transform: ${isSelected ? 'scale(1.2)' : 'scale(1)'};
            transition: transform 0.2s;
          ">
            🏍️
          </div>
          ${dev.openAlertsCount > 0 ? `<div style="position: absolute; top: -2px; right: -2px; width: 12px; height: 12px; border-radius: 50%; background: #ef4444; border: 2px solid #fff;"></div>` : ''}
        </div>
      `;

      const customIcon = L.divIcon({
        html: iconHtml,
        className: 'custom-motor-marker',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      const marker = L.marker([dev.lastLat, dev.lastLng], { icon: customIcon });

      marker.on('click', () => {
        setSelectedMotorId(dev.motorcycleId);
        setShowDetailDrawer(true);
        mapInstanceRef.current?.setView([dev.lastLat, dev.lastLng], 15, { animate: true });
      });

      marker.bindTooltip(
        `<b>${dev.motorcycleName || dev.label}</b><br/>${dev.plateNumber || ''} (${labelStatus})<br/>Kecepatan: ${dev.speedKmh} km/h`,
        { direction: 'top', offset: [0, -10] }
      );

      markersLayerRef.current?.addLayer(marker);
      validMarkers.push(marker);
    });

    // Auto-fit bounds jika belum ada motor terpilih dan ada marker valid
    if (!selectedMotorId && validMarkers.length > 0) {
      const group = L.featureGroup(validMarkers);
      mapInstanceRef.current.fitBounds(group.getBounds().pad(0.1));
    }
  }, [devices, selectedMotorId]);

  // Center Map ke motor tertentu
  const handleSelectMotor = (motorId: number) => {
    setSelectedMotorId(motorId);
    setShowDetailDrawer(true);
    const target = devices.find((d) => d.motorcycleId === motorId);
    if (target && target.lastLat && target.lastLng && mapInstanceRef.current) {
      mapInstanceRef.current.setView([target.lastLat, target.lastLng], 15, { animate: true });
    }
  };

  // Reset Map View ke semua marker
  const handleFitAllBounds = () => {
    setSelectedMotorId(null);
    const valid = devices.filter((d) => typeof d.lastLat === 'number' && typeof d.lastLng === 'number');
    if (valid.length > 0 && mapInstanceRef.current) {
      const group = L.featureGroup(
        valid.map((d) => L.marker([d.lastLat, d.lastLng]))
      );
      mapInstanceRef.current.fitBounds(group.getBounds().pad(0.1));
    }
  };

  // 5. Muat Riwayat Rute Motor
  const handleOpenHistory = async (range: '24h' | '3d' | '7d' = '24h') => {
    if (!selectedMotorId) return;
    setHistoryLoading(true);
    setShowHistoryModal(true);
    setHistoryRange(range);
    setIsPlaying(false);
    setPlayIndex(0);

    try {
      const now = new Date();
      let fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      if (range === '3d') fromDate = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      if (range === '7d') fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const res = await adminApi.getMotorcycleGpsPositions(selectedMotorId, {
        from: fromDate.toISOString(),
        to: now.toISOString(),
      });

      setHistoryData(res.data);
    } catch (err: any) {
      toast.error(err.message || 'Gagal memuat riwayat rute.');
    } finally {
      setHistoryLoading(false);
    }
  };

  // 6. Render Peta Riwayat Rute
  useEffect(() => {
    if (!showHistoryModal || !historyMapContainerRef.current || !historyData) return;

    if (!historyMapInstanceRef.current) {
      const map = L.map(historyMapContainerRef.current, {
        zoomControl: false,
      }).setView([-8.670458, 115.212629], 13);

      L.control.zoom({ position: 'bottomright' }).addTo(map);
      L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 19 }).addTo(map);

      historyLayerRef.current = L.layerGroup().addTo(map);
      historyMapInstanceRef.current = map;
    }

    if (historyLayerRef.current) {
      historyLayerRef.current.clearLayers();
    }

    const positions = historyData.positions || [];
    if (positions.length > 0) {
      const latlngs = positions.map((p: any) => [p.lat, p.lng]);

      // Polylines rute berwarna biru cerah
      const polyline = L.polyline(latlngs, {
        color: '#2563eb',
        weight: 4,
        opacity: 0.85,
        smoothFactor: 1,
      });
      historyLayerRef.current?.addLayer(polyline);

      // Titik Awal (Hijau)
      const startPos = positions[0];
      const startMarker = L.circleMarker([startPos.lat, startPos.lng], {
        radius: 8,
        color: '#16a34a',
        fillColor: '#22c55e',
        fillOpacity: 1,
      }).bindTooltip('<b>Titik Awal Rute</b>', { permanent: false });
      historyLayerRef.current?.addLayer(startMarker);

      // Titik Akhir (Merah)
      const endPos = positions[positions.length - 1];
      const endMarker = L.circleMarker([endPos.lat, endPos.lng], {
        radius: 8,
        color: '#dc2626',
        fillColor: '#ef4444',
        fillOpacity: 1,
      }).bindTooltip('<b>Posisi Terakhir</b>', { permanent: false });
      historyLayerRef.current?.addLayer(endMarker);

      // Penanda Titik Perhentian (Stops > 5 menit)
      const stops = historyData.stops || [];
      stops.forEach((st: any, i: number) => {
        const stopPin = L.circleMarker([st.lat, st.lng], {
          radius: 7,
          color: '#d97706',
          fillColor: '#f59e0b',
          fillOpacity: 1,
        }).bindTooltip(
          `<b>Perhentian #${i + 1}</b><br/>Durasi: ${st.durationMinutes} menit<br/>Tiba: ${new Date(st.arrivedAt).toLocaleTimeString('id-ID')}`,
          { direction: 'top' }
        );
        historyLayerRef.current?.addLayer(stopPin);
      });

      // Playback moving pin
      const playbackIcon = L.divIcon({
        html: `
          <div style="width: 28px; height: 28px; border-radius: 50%; background: #1d4ed8; border: 3px solid #fff; box-shadow: 0 4px 12px rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 13px;">
            🏍️
          </div>
        `,
        className: 'playback-pin',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const initialPt = positions[playIndex] || positions[0];
      playbackMarkerRef.current = L.marker([initialPt.lat, initialPt.lng], {
        icon: playbackIcon,
      });
      historyLayerRef.current?.addLayer(playbackMarkerRef.current);

      historyMapInstanceRef.current.fitBounds(polyline.getBounds().pad(0.15));
    }

    const timer = setTimeout(() => {
      historyMapInstanceRef.current?.invalidateSize();
    }, 250);

    return () => clearTimeout(timer);
  }, [showHistoryModal, historyData]);

  // 7. Loop Playback Rute
  useEffect(() => {
    if (!isPlaying || !historyData?.positions?.length) {
      clearInterval(playbackTimerRef.current);
      return;
    }

    const intervalMs = Math.max(80, Math.round(500 / playbackSpeed));
    playbackTimerRef.current = setInterval(() => {
      setPlayIndex((prev) => {
        const next = prev + 1;
        if (next >= historyData.positions.length) {
          setIsPlaying(false);
          return prev;
        }
        const pt = historyData.positions[next];
        if (playbackMarkerRef.current && pt) {
          playbackMarkerRef.current.setLatLng([pt.lat, pt.lng]);
          historyMapInstanceRef.current?.panTo([pt.lat, pt.lng], { animate: true });
        }
        return next;
      });
    }, intervalMs);

    return () => clearInterval(playbackTimerRef.current);
  }, [isPlaying, historyData, playbackSpeed]);

  // Update playback marker saat playIndex berubah manual
  const handleSliderChange = (newIdx: number) => {
    setPlayIndex(newIdx);
    if (historyData?.positions?.[newIdx] && playbackMarkerRef.current) {
      const pt = historyData.positions[newIdx];
      playbackMarkerRef.current.setLatLng([pt.lat, pt.lng]);
      historyMapInstanceRef.current?.panTo([pt.lat, pt.lng], { animate: true });
    }
  };

  // 8. Penanganan Acknowledge & Resolve Alert
  const handleAcknowledgeAlert = async (alertId: number) => {
    try {
      await adminApi.acknowledgeGpsAlert(alertId);
      toast.success('Peringatan berhasil diakui oleh petugas.');
      fetchLiveData(true);
    } catch (err: any) {
      toast.error(err.message || 'Gagal mengakui peringatan.');
    }
  };

  const handleResolveAlertSubmit = async () => {
    if (!selectedAlert || !resolveNote.trim()) {
      toast.error('Catatan penyelesaian peringatan wajib diisi.');
      return;
    }
    setSubmitting(true);
    try {
      await adminApi.resolveGpsAlert(selectedAlert.id, resolveNote.trim());
      toast.success('Peringatan berhasil ditandai selesai.');
      setShowAlertAcknowledgeModal(false);
      setSelectedAlert(null);
      setResolveNote('');
      fetchLiveData(true);
    } catch (err: any) {
      toast.error(err.message || 'Gagal menyelesaikan peringatan.');
    } finally {
      setSubmitting(false);
    }
  };

  // 9. Muat Tab Khusus Admin
  useEffect(() => {
    if (!isAdmin) return;

    if (activeTab === 'devices') {
      adminApi.getGpsDevices().then((res) => setAdminDevices(res.data || []));
    } else if (activeTab === 'geofences') {
      adminApi.getGpsGeofences().then((res) => setAdminGeofences(res.data || []));
    } else if (activeTab === 'settings') {
      adminApi.getGpsSettings().then((res) => setAdminSettings(res.data || {}));
    } else if (activeTab === 'access_log') {
      adminApi.getGpsAccessLogs().then((res) => setAdminAccessLogs(res.data || []));
    }
  }, [activeTab, isAdmin]);

  // Update Settings Submit
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await adminApi.updateGpsSettings(adminSettings);
      toast.success('Pengaturan GPS berhasil diperbarui.');
    } catch (err: any) {
      toast.error(err.message || 'Gagal menyimpan pengaturan.');
    } finally {
      setSubmitting(false);
    }
  };

  // Add Device Submit
  const handleAddDeviceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeviceForm.motorcycleId || !newDeviceForm.externalId.trim() || !newDeviceForm.label.trim()) {
      toast.error('Semua kolom wajib diisi.');
      return;
    }
    setSubmitting(true);
    try {
      await adminApi.createGpsDevice({
        motorcycleId: Number(newDeviceForm.motorcycleId),
        provider: newDeviceForm.provider,
        externalId: newDeviceForm.externalId.trim(),
        label: newDeviceForm.label.trim(),
      });
      toast.success('Perangkat GPS berhasil didaftarkan ke unit motor.');
      setShowAddDeviceModal(false);
      setNewDeviceForm({ motorcycleId: '', provider: 'simulator', externalId: '', label: '' });
      fetchLiveData(true);
      const res = await adminApi.getGpsDevices();
      setAdminDevices(res.data || []);
    } catch (err: any) {
      toast.error(err.message || 'Gagal mendaftarkan perangkat GPS.');
    } finally {
      setSubmitting(false);
    }
  };

  // Replace Device Submit
  const handleReplaceDeviceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !selectedDeviceToReplace ||
      !replaceDeviceForm.externalId.trim() ||
      !replaceDeviceForm.label.trim() ||
      !replaceDeviceForm.reason.trim()
    ) {
      toast.error('Semua kolom termasuk alasan penggantian wajib diisi.');
      return;
    }
    setSubmitting(true);
    try {
      await adminApi.replaceGpsDevice(selectedDeviceToReplace.id, {
        externalId: replaceDeviceForm.externalId.trim(),
        label: replaceDeviceForm.label.trim(),
        reason: replaceDeviceForm.reason.trim(),
      });
      toast.success('Perangkat GPS berhasil diganti dengan riwayat posisi dipertahankan.');
      setShowReplaceDeviceModal(false);
      setSelectedDeviceToReplace(null);
      setReplaceDeviceForm({ externalId: '', label: '', reason: '' });
      fetchLiveData(true);
      const res = await adminApi.getGpsDevices();
      setAdminDevices(res.data || []);
    } catch (err: any) {
      toast.error(err.message || 'Gagal mengganti perangkat GPS.');
    } finally {
      setSubmitting(false);
    }
  };

  // Add Geofence Submit
  const handleAddGeofenceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGeofenceForm.name.trim()) {
      toast.error('Nama area geofence wajib diisi.');
      return;
    }
    setSubmitting(true);
    try {
      await adminApi.createGpsGeofence({
        name: newGeofenceForm.name.trim(),
        kind: newGeofenceForm.kind,
        shape: newGeofenceForm.shape,
        centerLat: Number(newGeofenceForm.centerLat),
        centerLng: Number(newGeofenceForm.centerLng),
        radiusM: Number(newGeofenceForm.radiusM),
        appliesToAll: Boolean(newGeofenceForm.appliesToAll),
      });
      toast.success('Area geofence berhasil ditambahkan.');
      setShowAddGeofenceModal(false);
      setNewGeofenceForm({
        name: '',
        kind: 'allowed',
        shape: 'circle',
        centerLat: -8.670458,
        centerLng: 115.212629,
        radiusM: 5000,
        appliesToAll: true,
      });
      fetchLiveData(true);
      const res = await adminApi.getGpsGeofences();
      setAdminGeofences(res.data || []);
    } catch (err: any) {
      toast.error(err.message || 'Gagal menambahkan area geofence.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-gray-50 text-gray-900">
      {/* Top Header Bar */}
      <div className="h-14 px-4 bg-white border-b border-gray-200 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary-900 text-white flex items-center justify-center font-bold text-sm">
            <Navigation2 className="w-4 h-4" />
          </div>
          <div>
            <h1 className="font-bold text-sm text-gray-900 flex items-center gap-2">
              Pelacakan GPS Armada
              {summary.alertsCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 animate-pulse">
                  {summary.alertsCount} Peringatan
                </span>
              )}
            </h1>
            <p className="text-[11px] text-gray-500">
              Pemantauan posisi realtime, kondisi mesin, status baterai & rute armada
            </p>
          </div>
        </div>

        {/* Tab Navigation & Status Koneksi */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 text-[11px] font-medium text-gray-700">
            <span
              className={`w-2 h-2 rounded-full ${
                isRealtimeConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
              }`}
            />
            {isRealtimeConnected ? 'Realtime SSE Aktif' : 'Polling Cadangan (10s)'}
          </div>

          <div className="flex bg-gray-100 p-0.5 rounded-lg text-xs font-medium">
            <button
              onClick={() => setActiveTab('map')}
              className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 ${
                activeTab === 'map' ? 'bg-white shadow-xs text-primary-900 font-bold' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <MapIcon className="w-3.5 h-3.5" />
              Peta Live
            </button>
            <button
              onClick={() => setActiveTab('alerts')}
              className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 ${
                activeTab === 'alerts' ? 'bg-white shadow-xs text-primary-900 font-bold' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              Peringatan ({summary.alertsCount})
            </button>

            {isAdmin && (
              <>
                <button
                  onClick={() => setActiveTab('devices')}
                  className={`px-3 py-1.5 rounded-md transition-all ${
                    activeTab === 'devices' ? 'bg-white shadow-xs text-primary-900 font-bold' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Perangkat
                </button>
                <button
                  onClick={() => setActiveTab('geofences')}
                  className={`px-3 py-1.5 rounded-md transition-all ${
                    activeTab === 'geofences' ? 'bg-white shadow-xs text-primary-900 font-bold' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Area Geofence
                </button>
                <button
                  onClick={() => setActiveTab('settings')}
                  className={`px-3 py-1.5 rounded-md transition-all ${
                    activeTab === 'settings' ? 'bg-white shadow-xs text-primary-900 font-bold' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Pengaturan
                </button>
                <button
                  onClick={() => setActiveTab('access_log')}
                  className={`px-3 py-1.5 rounded-md transition-all ${
                    activeTab === 'access_log' ? 'bg-white shadow-xs text-primary-900 font-bold' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Log Akses
                </button>
              </>
            )}
          </div>

          <button
            onClick={() => fetchLiveData()}
            disabled={loading}
            className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 text-gray-600 transition-colors"
            title="Muat Ulang"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Error Banner with Retry */}
      {error && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2.5 flex items-center justify-between text-xs text-red-800 shrink-0">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => fetchLiveData()}
            className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded font-bold text-[11px] transition-colors"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* Main Content Area */}
      {activeTab === 'map' && (
        <div className="flex-1 flex flex-col md:flex-row relative overflow-hidden">
          {/* Left Panel: Daftar Motor & Filter */}
          <div className="w-full md:w-96 bg-white border-r border-gray-200 flex flex-col shrink-0 z-10 shadow-sm md:shadow-none h-1/2 md:h-full">
            {/* KPI Bar Mini */}
            <div className="grid grid-cols-4 gap-1 p-2 bg-gray-50 border-b border-gray-200 text-center text-[10px]">
              <div className="bg-white p-1.5 rounded border border-gray-200">
                <p className="text-gray-500 font-medium">Total</p>
                <p className="font-bold text-gray-900 text-xs">{summary.total}</p>
              </div>
              <div className="bg-white p-1.5 rounded border border-gray-200">
                <p className="text-emerald-600 font-medium">Online</p>
                <p className="font-bold text-emerald-700 text-xs">{summary.onlineCount}</p>
              </div>
              <div className="bg-white p-1.5 rounded border border-gray-200">
                <p className="text-blue-600 font-medium">Disewa</p>
                <p className="font-bold text-blue-700 text-xs">{summary.rentedCount}</p>
              </div>
              <div className="bg-white p-1.5 rounded border border-gray-200">
                <p className="text-red-600 font-medium">Alert</p>
                <p className="font-bold text-red-700 text-xs">{summary.alertsCount}</p>
              </div>
            </div>

            {/* Search Input */}
            <div className="p-2.5 border-b border-gray-200">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Cari motor, plat, atau penyewa..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 text-xs focus:ring-1 focus:ring-primary-600 focus:outline-none"
                />
              </div>

              {/* Status Filter Chips */}
              <div className="flex gap-1 mt-2 overflow-x-auto pb-1 text-[11px]">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`px-2 py-0.5 rounded-full shrink-0 ${
                    statusFilter === 'all' ? 'bg-primary-900 text-white font-bold' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Semua ({devices.length})
                </button>
                <button
                  onClick={() => setStatusFilter('rented')}
                  className={`px-2 py-0.5 rounded-full shrink-0 ${
                    statusFilter === 'rented' ? 'bg-blue-600 text-white font-bold' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                  }`}
                >
                  Disewa ({summary.rentedCount})
                </button>
                <button
                  onClick={() => setStatusFilter('garage')}
                  className={`px-2 py-0.5 rounded-full shrink-0 ${
                    statusFilter === 'garage' ? 'bg-gray-700 text-white font-bold' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Di Markas
                </button>
                <button
                  onClick={() => setStatusFilter('offline')}
                  className={`px-2 py-0.5 rounded-full shrink-0 ${
                    statusFilter === 'offline' ? 'bg-gray-800 text-white font-bold' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Offline ({summary.offlineCount})
                </button>
                <button
                  onClick={() => setStatusFilter('alert')}
                  className={`px-2 py-0.5 rounded-full shrink-0 ${
                    statusFilter === 'alert' ? 'bg-red-600 text-white font-bold' : 'bg-red-50 text-red-700 hover:bg-red-100'
                  }`}
                >
                  Peringatan ({summary.alertsCount})
                </button>
              </div>
            </div>

            {/* List Motor Cards */}
            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {loading && devices.length === 0 ? (
                <div className="p-8 text-center text-xs text-gray-500">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-primary-600" />
                  Memuat data telemetri armada...
                </div>
              ) : devices.length === 0 ? (
                <div className="p-8 text-center text-xs text-gray-500 space-y-3">
                  <MapPin className="w-10 h-10 text-gray-300 mx-auto" />
                  <div>
                    <p className="font-bold text-gray-800 text-sm">Belum ada perangkat GPS</p>
                    <p className="text-[11px] text-gray-400 mt-1">
                      Belum ada tracker GPS yang terpasang pada armada motor.
                    </p>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => setShowAddDeviceModal(true)}
                      className="px-3.5 py-1.5 rounded-lg bg-primary-900 hover:bg-primary-800 text-white font-bold text-xs inline-flex items-center gap-1.5 shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Pasang Tracker Baru
                    </button>
                  )}
                </div>
              ) : filteredDevices.length === 0 ? (
                <div className="p-8 text-center text-xs text-gray-500">
                  <MapPin className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="font-semibold text-gray-700">Tidak ada motor ditemukan</p>
                  <p className="text-[11px] text-gray-400 mt-1">Coba ganti filter atau kata kunci pencarian.</p>
                </div>
              ) : (
                filteredDevices.map((dev) => {
                  const isSelected = selectedMotorId === dev.motorcycleId;
                  return (
                    <div
                      key={dev.id}
                      onClick={() => handleSelectMotor(dev.motorcycleId)}
                      className={`p-3 cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-primary-50 border-l-4 border-primary-600'
                          : 'hover:bg-gray-50 border-l-4 border-transparent'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-bold text-xs text-gray-900 flex items-center gap-1.5">
                            {dev.motorcycleName || dev.label}
                            {dev.openAlertsCount > 0 && (
                              <span className="w-2 h-2 rounded-full bg-red-600" title="Ada Peringatan" />
                            )}
                          </h4>
                          <p className="text-[11px] font-mono font-medium text-gray-600 mt-0.5">
                            {dev.plateNumber || 'Tanpa Plat'}
                          </p>
                        </div>

                        {/* Status Badge */}
                        <div className="text-right">
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              dev.openAlertsCount > 0
                                ? 'bg-red-100 text-red-700'
                                : dev.activeBooking
                                ? 'bg-blue-100 text-blue-700'
                                : dev.isOnline
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-gray-200 text-gray-700'
                            }`}
                          >
                            {dev.openAlertsCount > 0
                              ? 'Peringatan'
                              : dev.activeBooking
                              ? 'Disewa'
                              : dev.isOnline
                              ? 'Online'
                              : 'Offline'}
                          </span>
                          <p className="text-[9px] text-gray-400 mt-0.5">
                            {dev.minutesAgo !== null
                              ? `${dev.minutesAgo} mnt lalu`
                              : 'Belum ada sinyal'}
                          </p>
                        </div>
                      </div>

                      {/* Info Telemetri Baris 2 */}
                      <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1" title="Status Baterai">
                            <Battery className="w-3.5 h-3.5 text-gray-400" />
                            {dev.batteryPct !== null ? `${dev.batteryPct}%` : '-'}
                          </span>
                          <span className="flex items-center gap-1" title="Kecepatan">
                            <Gauge className="w-3.5 h-3.5 text-gray-400" />
                            {dev.speedKmh} km/h
                          </span>
                          <span
                            className={`flex items-center gap-1 font-semibold ${
                              dev.ignition ? 'text-emerald-600' : 'text-gray-400'
                            }`}
                            title="Status Kontak Mesin"
                          >
                            <Key className="w-3 h-3" />
                            {dev.ignition ? 'ON' : 'OFF'}
                          </span>
                        </div>

                        {dev.activeBooking && (
                          <span className="text-[10px] font-medium text-blue-600 truncate max-w-[120px]">
                            {dev.activeBooking.customerName}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Panel: Leaflet Map */}
          <div className="flex-1 relative h-1/2 md:h-full">
            <div ref={mapContainerRef} className="w-full h-full" />

            {/* Floating Map Controls */}
            <div className="absolute top-3 right-3 z-20 flex flex-col gap-2">
              <button
                onClick={handleFitAllBounds}
                className="bg-white hover:bg-gray-50 text-gray-700 p-2 rounded-lg shadow-md border border-gray-200 transition-colors"
                title="Pusatkan Seluruh Armada"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>

            {/* Detail Drawer (Side Sheet) saat motor dipilih */}
            {showDetailDrawer && selectedDevice && (
              <div className="absolute top-3 left-3 bottom-3 w-84 bg-white/95 backdrop-blur-md rounded-xl shadow-2xl border border-gray-200 z-30 flex flex-col overflow-hidden animate-in slide-in-from-left duration-200">
                {/* Header Drawer */}
                <div className="p-3.5 bg-primary-900 text-white flex items-center justify-between shrink-0">
                  <div>
                    <h3 className="font-bold text-sm text-white">
                      {selectedDevice.motorcycleName || selectedDevice.label}
                    </h3>
                    <p className="text-[11px] text-gray-300 font-mono">
                      {selectedDevice.plateNumber} &bull; {selectedDevice.brand || 'Motor'}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowDetailDrawer(false)}
                    className="p-1 rounded-lg hover:bg-white/10 text-gray-300 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Content Drawer */}
                <div className="flex-1 overflow-y-auto p-3.5 space-y-4 text-xs">
                  {/* Status & Telemetri Grid */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2.5 rounded-lg bg-gray-50 border border-gray-200">
                      <p className="text-[10px] text-gray-500 font-medium">Status Koneksi</p>
                      <p
                        className={`font-bold mt-0.5 ${
                          selectedDevice.isOnline ? 'text-emerald-600' : 'text-gray-600'
                        }`}
                      >
                        {selectedDevice.isOnline ? 'Online (Terhubung)' : 'Offline'}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-gray-50 border border-gray-200">
                      <p className="text-[10px] text-gray-500 font-medium">Status Mesin</p>
                      <p
                        className={`font-bold mt-0.5 ${
                          selectedDevice.ignition ? 'text-emerald-600' : 'text-gray-500'
                        }`}
                      >
                        {selectedDevice.ignition ? 'Menyala (ON)' : 'Mati (OFF)'}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-gray-50 border border-gray-200">
                      <p className="text-[10px] text-gray-500 font-medium">Kecepatan</p>
                      <p className="font-bold text-gray-900 mt-0.5">
                        {selectedDevice.speedKmh} km/jam
                      </p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-gray-50 border border-gray-200">
                      <p className="text-[10px] text-gray-500 font-medium">Baterai Tracker</p>
                      <p className="font-bold text-gray-900 mt-0.5">
                        {selectedDevice.batteryPct !== null ? `${selectedDevice.batteryPct}%` : '-'}
                      </p>
                    </div>
                  </div>

                  {/* Koordinat & Tautan Peta Eksternal */}
                  <div className="p-2.5 rounded-lg bg-gray-50 border border-gray-200 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-500 font-medium">Koordinat Terkini</span>
                      {selectedDevice.lastLat && selectedDevice.lastLng && (
                        <a
                          href={`https://www.google.com/maps?q=${selectedDevice.lastLat},${selectedDevice.lastLng}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] font-bold text-primary-600 hover:underline flex items-center gap-1"
                        >
                          Buka di Peta Eksternal
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                    <p className="font-mono text-gray-800 text-[11px]">
                      {selectedDevice.lastLat && selectedDevice.lastLng
                        ? `${selectedDevice.lastLat.toFixed(6)}, ${selectedDevice.lastLng.toFixed(6)}`
                        : 'Belum ada koordinat tercatat'}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      Pembaruan: {selectedDevice.lastRecordedAt ? new Date(selectedDevice.lastRecordedAt).toLocaleString('id-ID') : '-'}
                    </p>
                  </div>

                  {/* Informasi Booking Aktif (Jika Disewa) */}
                  {selectedDevice.activeBooking ? (
                    <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-800">
                          Sedang Disewa
                        </span>
                        <span className="text-[10px] font-mono font-bold text-blue-900">
                          {selectedDevice.activeBooking.bookingCode}
                        </span>
                      </div>
                      <div>
                        <p className="font-bold text-gray-900 text-xs">
                          {selectedDevice.activeBooking.customerName}
                        </p>
                        <p className="text-[11px] text-gray-600">
                          Jadwal Kembali: {new Date(selectedDevice.activeBooking.scheduledReturn).toLocaleDateString('id-ID')}
                        </p>
                      </div>
                      {/* Tombol Kontak WhatsApp & Telepon */}
                      {selectedDevice.activeBooking.customerPhone && (
                        <div className="flex gap-2 pt-1">
                          <a
                            href={`https://wa.me/${selectedDevice.activeBooking.customerPhone.replace(/[^0-9]/g, '')}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex-1 py-1 px-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-[11px] flex items-center justify-center gap-1.5"
                          >
                            <MessageCircle className="w-3 h-3" />
                            WhatsApp
                          </a>
                          <a
                            href={`tel:${selectedDevice.activeBooking.customerPhone}`}
                            className="py-1 px-2.5 rounded border border-blue-300 hover:bg-blue-100 text-blue-800 font-medium text-[11px] flex items-center justify-center gap-1"
                          >
                            <Phone className="w-3 h-3" />
                            Telepon
                          </a>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-lg bg-gray-50 border border-gray-200 text-center text-gray-500 text-[11px]">
                      Unit sedang tidak dalam masa sewa aktif (Di Markas / Siap Sewa).
                    </div>
                  )}

                  {/* Tombol Lihat Riwayat Rute */}
                  <button
                    onClick={() => handleOpenHistory('24h')}
                    className="w-full py-2 px-3 rounded-lg bg-primary-900 hover:bg-primary-800 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Buka Riwayat Rute & Putar Ulang
                  </button>

                  {/* Daftar Peringatan Terbuka */}
                  {selectedDevice.alerts && selectedDevice.alerts.length > 0 && (
                    <div className="space-y-2 pt-2">
                      <p className="font-bold text-xs text-red-700 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Peringatan Aktif ({selectedDevice.alerts.length})
                      </p>
                      <div className="space-y-1.5">
                        {selectedDevice.alerts.map((al: any) => (
                          <div
                            key={al.id}
                            className="p-2 rounded bg-red-50 border border-red-200 text-[11px] space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-red-900 uppercase tracking-wide text-[10px]">
                                {al.type.replace(/_/g, ' ')}
                              </span>
                              <span className="text-[9px] text-red-600 font-mono">
                                {al.occurrences}x terdeteksi
                              </span>
                            </div>
                            <p className="text-gray-700 text-[10px]">
                              {al.details?.reason || JSON.stringify(al.details)}
                            </p>
                            <div className="flex gap-1.5 pt-1">
                              {al.status === 'open' && (
                                <button
                                  onClick={() => handleAcknowledgeAlert(al.id)}
                                  className="px-2 py-0.5 rounded bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold"
                                >
                                  Akui
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setSelectedAlert(al);
                                  setShowAlertAcknowledgeModal(true);
                                }}
                                className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold"
                              >
                                Selesaikan
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Peringatan (Alerts Management) */}
      {activeTab === 'alerts' && (
        <div className="flex-1 overflow-y-auto p-4 max-w-6xl mx-auto w-full space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900">
              Daftar Seluruh Peringatan Telemetri GPS
            </h2>
            <button
              onClick={() => fetchLiveData()}
              className="text-xs font-bold text-primary-600 hover:underline flex items-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Segarkan Data
            </button>
          </div>

          <div className="bg-white rounded-xl shadow-xs border border-gray-200 overflow-hidden divide-y divide-gray-100 text-xs">
            {devices.flatMap((d) => d.alerts || []).length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                <p className="font-bold text-gray-900 text-sm">Semua Aman! Nol Peringatan Aktif</p>
                <p className="text-gray-400 text-xs mt-1">
                  Seluruh motor berada dalam batas wilayah yang diizinkan dan beroperasi normal.
                </p>
              </div>
            ) : (
              devices.flatMap((d) => d.alerts || []).map((al: any) => (
                <div key={al.id} className="p-4 flex items-start justify-between hover:bg-gray-50">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          al.severity === 'high'
                            ? 'bg-red-600 text-white'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {al.severity}
                      </span>
                      <h4 className="font-bold text-sm text-gray-900">
                        {al.type.replace(/_/g, ' ').toUpperCase()} &bull; {al.motorcycleName || al.deviceLabel}
                      </h4>
                      <span className="text-gray-400 text-xs font-mono">
                        ({al.plateNumber})
                      </span>
                    </div>
                    <p className="text-xs text-gray-600">
                      Rincian: {JSON.stringify(al.details)}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      Pertama terdeteksi: {new Date(al.firstSeenAt).toLocaleString('id-ID')} &bull; Terakhir: {new Date(al.lastSeenAt).toLocaleString('id-ID')} ({al.occurrences}x)
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {al.status === 'open' && (
                      <button
                        onClick={() => handleAcknowledgeAlert(al.id)}
                        className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs"
                      >
                        Akui
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setSelectedAlert(al);
                        setShowAlertAcknowledgeModal(true);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
                    >
                      Selesaikan
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab Khusus Admin: Manajemen Perangkat */}
      {isAdmin && activeTab === 'devices' && (
        <div className="flex-1 overflow-y-auto p-4 max-w-6xl mx-auto w-full space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-900">Perangkat GPS Tracker</h2>
              <p className="text-xs text-gray-500">
                Pemasangan perangkat tracker ke motor armada (Tepat 1 perangkat per unit motor)
              </p>
            </div>
            <button
              onClick={() => setShowAddDeviceModal(true)}
              className="py-2 px-3.5 rounded-lg bg-primary-900 hover:bg-primary-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Pasang Tracker Baru
            </button>
          </div>

          <div className="bg-white rounded-xl shadow-xs border border-gray-200 overflow-hidden text-xs">
            <table className="w-full text-left divide-y divide-gray-200">
              <thead className="bg-gray-50 text-[10px] font-bold text-gray-500 uppercase">
                <tr>
                  <th className="p-3">ID & Label</th>
                  <th className="p-3">External ID</th>
                  <th className="p-3">Unit Motor</th>
                  <th className="p-3">Provider</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(adminDevices.length > 0 ? adminDevices : devices).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-400">
                      Belum ada perangkat GPS yang terdaftar.
                    </td>
                  </tr>
                ) : (
                  (adminDevices.length > 0 ? adminDevices : devices).map((d) => (
                    <tr key={d.id} className="hover:bg-gray-50">
                      <td className="p-3 font-bold text-gray-900">
                        #{d.id} &bull; {d.label}
                      </td>
                      <td className="p-3 font-mono text-gray-600">{d.externalId}</td>
                      <td className="p-3">
                        <span className="font-semibold text-gray-800">{d.motorcycleName}</span>{' '}
                        <span className="font-mono text-gray-400">({d.plateNumber})</span>
                      </td>
                      <td className="p-3 font-medium uppercase text-[10px] text-gray-600">
                        {d.provider}
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            d.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-700'
                          }`}
                        >
                          {d.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => {
                            setSelectedDeviceToReplace(d);
                            setReplaceDeviceForm({
                              externalId: '',
                              label: `Pengganti ${d.label}`,
                              reason: '',
                            });
                            setShowReplaceDeviceModal(true);
                          }}
                          className="text-xs font-bold text-primary-600 hover:underline"
                        >
                          Ganti Alat
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab Khusus Admin: Area Geofence */}
      {isAdmin && activeTab === 'geofences' && (
        <div className="flex-1 overflow-y-auto p-4 max-w-6xl mx-auto w-full space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-900">Area Batas Geofence</h2>
              <p className="text-xs text-gray-500">
                Konfigurasi area yang diizinkan (allowed), markas (garage), dan area terlarang (forbidden)
              </p>
            </div>
            <button
              onClick={() => setShowAddGeofenceModal(true)}
              className="py-2 px-3.5 rounded-lg bg-primary-900 hover:bg-primary-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Tambah Area Geofence
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {(adminGeofences.length > 0 ? adminGeofences : geofences).length === 0 ? (
              <div className="col-span-full p-8 text-center text-gray-500 bg-white rounded-xl border border-gray-200">
                Belum ada area geofence yang dikonfigurasi.
              </div>
            ) : (
              (adminGeofences.length > 0 ? adminGeofences : geofences).map((g) => (
              <div
                key={g.id}
                className="p-4 rounded-xl bg-white border border-gray-200 shadow-xs space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-gray-900">{g.name}</h4>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      g.kind === 'forbidden'
                        ? 'bg-red-100 text-red-700'
                        : g.kind === 'garage'
                        ? 'bg-gray-100 text-gray-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}
                  >
                    {g.kind}
                  </span>
                </div>
                <p className="text-gray-500 text-[11px]">
                  Bentuk: <span className="font-bold capitalize">{g.shape}</span> &bull; Radius:{' '}
                  {g.radiusM ? `${g.radiusM} meter` : '-'}
                </p>
                <p className="text-[10px] text-gray-400">
                  {g.appliesToAll ? 'Berlaku untuk seluruh armada' : 'Khusus unit tertentu'}
                </p>
                <div className="pt-2 border-t border-gray-100 flex justify-end">
                  <button
                    onClick={async () => {
                      if (confirm(`Hapus area geofence "${g.name}"?`)) {
                        await adminApi.deleteGpsGeofence(g.id);
                        toast.success('Area geofence berhasil dihapus.');
                        fetchLiveData(true);
                      }
                    }}
                    className="text-red-600 hover:underline font-bold text-[11px]"
                  >
                    Hapus Area
                  </button>
                </div>
              </div>
            )))}
          </div>
        </div>
      )}

      {/* Tab Khusus Admin: Pengaturan GPS */}
      {isAdmin && activeTab === 'settings' && (
        <div className="flex-1 overflow-y-auto p-4 max-w-2xl mx-auto w-full space-y-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">Pengaturan Parameter Operasional GPS</h2>
            <p className="text-xs text-gray-500">
              Ambang batas peringatan, toleransi jeda sinyal, dan kebijakan retensi data lokasi
            </p>
          </div>

          <form onSubmit={handleSaveSettings} className="bg-white rounded-xl shadow-xs border border-gray-200 p-5 space-y-4 text-xs">
            <div>
              <label className="font-bold text-gray-800 block mb-1">
                Ambang Batas Offline (Menit)
              </label>
              <input
                type="number"
                min={1}
                max={120}
                value={adminSettings['gps.offline_minutes'] ?? 15}
                onChange={(e) =>
                  setAdminSettings({ ...adminSettings, 'gps.offline_minutes': e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-1 focus:ring-primary-600"
              />
              <p className="text-[11px] text-gray-400 mt-0.5">Perangkat dianggap offline jika tidak mengirim sinyal selama waktu ini.</p>
            </div>

            <div>
              <label className="font-bold text-gray-800 block mb-1">
                Batas Kecepatan Maksimal (km/jam)
              </label>
              <input
                type="number"
                min={30}
                max={150}
                value={adminSettings['gps.speed_limit_kmh'] ?? 80}
                onChange={(e) =>
                  setAdminSettings({ ...adminSettings, 'gps.speed_limit_kmh': e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-1 focus:ring-primary-600"
              />
              <p className="text-[11px] text-gray-400 mt-0.5">Memicu alert kecepatan jika melaju di atas batas ini selama 3 sampel berturut-turut.</p>
            </div>

            <div>
              <label className="font-bold text-gray-800 block mb-1">
                Ambang Baterai Rendah (%)
              </label>
              <input
                type="number"
                min={5}
                max={50}
                value={adminSettings['gps.low_battery_pct'] ?? 20}
                onChange={(e) =>
                  setAdminSettings({ ...adminSettings, 'gps.low_battery_pct': e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-1 focus:ring-primary-600"
              />
            </div>

            <div>
              <label className="font-bold text-gray-800 block mb-1">
                Radius Pergeseran Markas Tanpa Sewa (Meter)
              </label>
              <input
                type="number"
                min={20}
                max={2000}
                value={adminSettings['gps.unauthorized_move_meters'] ?? 150}
                onChange={(e) =>
                  setAdminSettings({ ...adminSettings, 'gps.unauthorized_move_meters': e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-1 focus:ring-primary-600"
              />
              <p className="text-[11px] text-gray-400 mt-0.5">Memicu alarm indikasi pencurian jika motor bergerak tanpa booking aktif.</p>
            </div>

            <div>
              <label className="font-bold text-gray-800 block mb-1">
                Masa Retensi Posisi GPS (Hari)
              </label>
              <input
                type="number"
                min={7}
                max={365}
                value={adminSettings['gps.retention_days'] ?? 90}
                onChange={(e) =>
                  setAdminSettings({ ...adminSettings, 'gps.retention_days': e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-1 focus:ring-primary-600"
              />
            </div>

            <div className="pt-3 border-t border-gray-100 flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="py-2 px-5 rounded-lg bg-primary-900 hover:bg-primary-800 text-white font-bold text-xs shadow-sm transition-colors"
              >
                {submitting ? 'Menyimpan...' : 'Simpan Pengaturan'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tab Khusus Admin: Log Akses Lokasi */}
      {isAdmin && activeTab === 'access_log' && (
        <div className="flex-1 overflow-y-auto p-4 max-w-6xl mx-auto w-full space-y-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">Log Akses Lokasi & Riwayat GPS</h2>
            <p className="text-xs text-gray-500">
              Audit trail forensik perlindungan privasi: Setiap kali staf atau admin membuka peta atau riwayat
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-xs border border-gray-200 overflow-hidden text-xs">
            <table className="w-full text-left divide-y divide-gray-200">
              <thead className="bg-gray-50 text-[10px] font-bold text-gray-500 uppercase">
                <tr>
                  <th className="p-3">Waktu (WIB)</th>
                  <th className="p-3">Pengguna</th>
                  <th className="p-3">Aksi</th>
                  <th className="p-3">Target Motor</th>
                  <th className="p-3">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {adminAccessLogs.map((l: any) => (
                  <tr key={l.id} className="hover:bg-gray-50">
                    <td className="p-3 text-gray-500">
                      {new Date(l.at).toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 font-semibold text-gray-900">
                      {l.userName} ({l.userEmail})
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 uppercase">
                        {l.action}
                      </span>
                    </td>
                    <td className="p-3 font-medium text-gray-800">
                      {l.motorcycleName ? `${l.motorcycleName} (${l.plateNumber})` : 'Seluruh Armada (Live)'}
                    </td>
                    <td className="p-3 font-mono text-gray-400">{l.ip || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Riwayat Rute & Playback Player */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="w-full max-w-5xl h-[85vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-4 py-3 bg-primary-900 text-white flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  <RotateCcw className="w-4 h-4" />
                  Riwayat Rute & Pemutar Ulang (Playback)
                </h3>
                <p className="text-[11px] text-gray-300 font-mono">
                  {historyData?.motorcycleName} ({historyData?.plateNumber})
                </p>
              </div>

              {/* Time Range Filter */}
              <div className="flex items-center gap-2">
                <div className="flex bg-white/10 p-0.5 rounded-lg text-xs font-semibold">
                  <button
                    onClick={() => handleOpenHistory('24h')}
                    className={`px-2.5 py-1 rounded ${
                      historyRange === '24h' ? 'bg-white text-primary-900' : 'text-gray-300 hover:text-white'
                    }`}
                  >
                    24 Jam
                  </button>
                  <button
                    onClick={() => handleOpenHistory('3d')}
                    className={`px-2.5 py-1 rounded ${
                      historyRange === '3d' ? 'bg-white text-primary-900' : 'text-gray-300 hover:text-white'
                    }`}
                  >
                    3 Hari
                  </button>
                  <button
                    onClick={() => handleOpenHistory('7d')}
                    className={`px-2.5 py-1 rounded ${
                      historyRange === '7d' ? 'bg-white text-primary-900' : 'text-gray-300 hover:text-white'
                    }`}
                  >
                    7 Hari
                  </button>
                </div>
                <button
                  onClick={() => setShowHistoryModal(false)}
                  className="p-1 rounded-lg hover:bg-white/10 text-gray-300 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Map Area */}
            <div className="flex-1 relative">
              <div ref={historyMapContainerRef} className="w-full h-full" />
              {historyLoading && (
                <div className="absolute inset-0 bg-white/70 backdrop-blur-xs flex items-center justify-center text-xs font-bold text-primary-900 z-20">
                  <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                  Memuat data rute GPS...
                </div>
              )}
            </div>

            {/* Playback Controller Bar */}
            <div className="p-3 bg-white border-t border-gray-200 flex flex-col sm:flex-row items-center gap-3 shrink-0 text-xs">
              {/* Play / Pause Button */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="w-8 h-8 rounded-full bg-primary-900 hover:bg-primary-800 text-white flex items-center justify-center shadow-md transition-colors"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                </button>
                <div className="flex bg-gray-100 p-0.5 rounded text-[10px] font-bold">
                  {[1, 2, 5].map((spd) => (
                    <button
                      key={spd}
                      onClick={() => setPlaybackSpeed(spd)}
                      className={`px-2 py-0.5 rounded ${
                        playbackSpeed === spd ? 'bg-white shadow-xs text-primary-900' : 'text-gray-500'
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Progress Slider */}
              <div className="flex-1 w-full flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, (historyData?.positions?.length || 1) - 1)}
                  value={playIndex}
                  onChange={(e) => handleSliderChange(Number(e.target.value))}
                  className="w-full accent-primary-600 cursor-pointer"
                />
                <span className="text-[11px] font-mono text-gray-500 shrink-0">
                  {playIndex + 1} / {historyData?.positions?.length || 0}
                </span>
              </div>

              {/* Info Current Point */}
              {historyData?.positions?.[playIndex] && (
                <div className="text-[11px] font-medium text-gray-700 bg-gray-50 px-2.5 py-1 rounded border border-gray-200 shrink-0 flex items-center gap-3">
                  <span>
                    Kecepatan: <b>{historyData.positions[playIndex].speedKmh} km/h</b>
                  </span>
                  <span>
                    Waktu:{' '}
                    <b>
                      {new Date(historyData.positions[playIndex].recordedAt).toLocaleTimeString('id-ID')}
                    </b>
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Selesaikan Peringatan dengan Catatan Wajib */}
      {showAlertAcknowledgeModal && selectedAlert && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-5 space-y-4 animate-in zoom-in-95 duration-150 text-xs">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Selesaikan Peringatan GPS
              </h3>
              <button
                onClick={() => setShowAlertAcknowledgeModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-red-50 border border-red-200 rounded-lg space-y-1 text-[11px]">
              <p className="font-bold text-red-900 uppercase">
                {selectedAlert.type.replace(/_/g, ' ')}
              </p>
              <p className="text-gray-700">
                Unit: <b>{selectedAlert.motorcycleName || selectedAlert.deviceLabel}</b>
              </p>
            </div>

            <div>
              <label className="font-bold text-gray-800 block mb-1">
                Catatan Tindakan Penyelesaian <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={3}
                placeholder="Contoh: Petugas telah menghubungi penyewa dan memastikan motor telah kembali ke rute yang aman..."
                value={resolveNote}
                onChange={(e) => setResolveNote(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-gray-300 text-xs focus:ring-1 focus:ring-primary-600 focus:outline-none"
              />
              <p className="text-[10px] text-gray-400 mt-1">
                Wajib diisi untuk audit pertanggungjawaban operasional petugas.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAlertAcknowledgeModal(false)}
                className="px-3 py-1.5 rounded-lg border border-gray-300 font-medium text-gray-700"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={submitting || !resolveNote.trim()}
                onClick={handleResolveAlertSubmit}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold disabled:opacity-50"
              >
                {submitting ? 'Menyimpan...' : 'Tandai Selesai'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Tambah / Pasang Perangkat GPS Baru */}
      {showAddDeviceModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-5 space-y-4 animate-in zoom-in-95 duration-150 text-xs">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-primary-900" />
                Pasang Perangkat GPS Baru
              </h3>
              <button
                onClick={() => setShowAddDeviceModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddDeviceSubmit} className="space-y-3">
              <div>
                <label className="font-bold text-gray-800 block mb-1">
                  ID Unit Motor <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  placeholder="ID Motor (contoh: 1)"
                  value={newDeviceForm.motorcycleId}
                  onChange={(e) =>
                    setNewDeviceForm({ ...newDeviceForm, motorcycleId: e.target.value })
                  }
                  required
                  className="w-full p-2.5 rounded-lg border border-gray-300 text-xs focus:ring-1 focus:ring-primary-600"
                />
              </div>

              <div>
                <label className="font-bold text-gray-800 block mb-1">
                  Penyedia (Provider) <span className="text-red-500">*</span>
                </label>
                <select
                  value={newDeviceForm.provider}
                  onChange={(e) =>
                    setNewDeviceForm({ ...newDeviceForm, provider: e.target.value })
                  }
                  className="w-full p-2.5 rounded-lg border border-gray-300 text-xs focus:ring-1 focus:ring-primary-600"
                >
                  <option value="simulator">Simulator (Pengembangan / Uji Coba)</option>
                  <option value="traccar">Traccar (GPS Server / Perangkat Nyata)</option>
                  <option value="webhook">Webhook Umum (Vendor GPS Pihak Ketiga)</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-gray-800 block mb-1">
                  ID Eksternal (IMEI / Device ID Tracker) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Contoh: SIM-01 atau 865432049182371"
                  value={newDeviceForm.externalId}
                  onChange={(e) =>
                    setNewDeviceForm({ ...newDeviceForm, externalId: e.target.value })
                  }
                  required
                  className="w-full p-2.5 rounded-lg border border-gray-300 text-xs focus:ring-1 focus:ring-primary-600 font-mono"
                />
              </div>

              <div>
                <label className="font-bold text-gray-800 block mb-1">
                  Label Tracker <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Tracker Vario 160 Putih"
                  value={newDeviceForm.label}
                  onChange={(e) =>
                    setNewDeviceForm({ ...newDeviceForm, label: e.target.value })
                  }
                  required
                  className="w-full p-2.5 rounded-lg border border-gray-300 text-xs focus:ring-1 focus:ring-primary-600"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowAddDeviceModal(false)}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 font-medium text-gray-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 rounded-lg bg-primary-900 hover:bg-primary-800 text-white font-bold disabled:opacity-50"
                >
                  {submitting ? 'Menyimpan...' : 'Daftarkan Perangkat'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Ganti Perangkat GPS (Riwayat Tetap Terjaga) */}
      {showReplaceDeviceModal && selectedDeviceToReplace && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-5 space-y-4 animate-in zoom-in-95 duration-150 text-xs">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-primary-900" />
                Ganti Alat GPS Tracker
              </h3>
              <button
                onClick={() => setShowReplaceDeviceModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-[11px] space-y-1">
              <p className="font-bold text-amber-900">Perangkat Saat Ini:</p>
              <p className="text-gray-700 font-mono">
                {selectedDeviceToReplace.label} ({selectedDeviceToReplace.externalId})
              </p>
              <p className="text-gray-500 text-[10px]">
                Perangkat lama akan dinonaktifkan dan perangkat baru dipasangkan ke unit motor ini. Riwayat rute sebelumnya tetap tersimpan utuh.
              </p>
            </div>

            <form onSubmit={handleReplaceDeviceSubmit} className="space-y-3">
              <div>
                <label className="font-bold text-gray-800 block mb-1">
                  ID Eksternal Baru (IMEI / Tracker Baru) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Contoh: SIM-01-REPLACE atau IMEI baru"
                  value={replaceDeviceForm.externalId}
                  onChange={(e) =>
                    setReplaceDeviceForm({ ...replaceDeviceForm, externalId: e.target.value })
                  }
                  required
                  className="w-full p-2.5 rounded-lg border border-gray-300 text-xs focus:ring-1 focus:ring-primary-600 font-mono"
                />
              </div>

              <div>
                <label className="font-bold text-gray-800 block mb-1">
                  Label Tracker Baru <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Tracker Baru Pengganti"
                  value={replaceDeviceForm.label}
                  onChange={(e) =>
                    setReplaceDeviceForm({ ...replaceDeviceForm, label: e.target.value })
                  }
                  required
                  className="w-full p-2.5 rounded-lg border border-gray-300 text-xs focus:ring-1 focus:ring-primary-600"
                />
              </div>

              <div>
                <label className="font-bold text-gray-800 block mb-1">
                  Alasan Penggantian <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="Contoh: Alat lama rusak konektor dayanya dan diganti modul cadangan..."
                  value={replaceDeviceForm.reason}
                  onChange={(e) =>
                    setReplaceDeviceForm({ ...replaceDeviceForm, reason: e.target.value })
                  }
                  required
                  className="w-full p-2.5 rounded-lg border border-gray-300 text-xs focus:ring-1 focus:ring-primary-600"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowReplaceDeviceModal(false)}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 font-medium text-gray-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 rounded-lg bg-primary-900 hover:bg-primary-800 text-white font-bold disabled:opacity-50"
                >
                  {submitting ? 'Menyimpan...' : 'Ganti Alat'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Tambah Area Geofence */}
      {showAddGeofenceModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-5 space-y-4 animate-in zoom-in-95 duration-150 text-xs">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-primary-900" />
                Tambah Area Geofence Baru
              </h3>
              <button
                onClick={() => setShowAddGeofenceModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddGeofenceSubmit} className="space-y-3">
              <div>
                <label className="font-bold text-gray-800 block mb-1">
                  Nama Area <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Wilayah Denpasar & Kuta"
                  value={newGeofenceForm.name}
                  onChange={(e) =>
                    setNewGeofenceForm({ ...newGeofenceForm, name: e.target.value })
                  }
                  required
                  className="w-full p-2.5 rounded-lg border border-gray-300 text-xs focus:ring-1 focus:ring-primary-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-gray-800 block mb-1">
                    Jenis Area (Kind) <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={newGeofenceForm.kind}
                    onChange={(e) =>
                      setNewGeofenceForm({ ...newGeofenceForm, kind: e.target.value })
                    }
                    className="w-full p-2.5 rounded-lg border border-gray-300 text-xs focus:ring-1 focus:ring-primary-600"
                  >
                    <option value="allowed">Allowed (Area Boleh Pakai)</option>
                    <option value="garage">Garage (Markas Armada)</option>
                    <option value="forbidden">Forbidden (Area Terlarang)</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-gray-800 block mb-1">
                    Bentuk (Shape) <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={newGeofenceForm.shape}
                    onChange={(e) =>
                      setNewGeofenceForm({ ...newGeofenceForm, shape: e.target.value })
                    }
                    className="w-full p-2.5 rounded-lg border border-gray-300 text-xs focus:ring-1 focus:ring-primary-600"
                  >
                    <option value="circle">Lingkaran (Circle)</option>
                    <option value="polygon">Polygon</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-gray-800 block mb-1">
                    Latitude Pusat <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={newGeofenceForm.centerLat}
                    onChange={(e) =>
                      setNewGeofenceForm({ ...newGeofenceForm, centerLat: Number(e.target.value) })
                    }
                    required
                    className="w-full p-2.5 rounded-lg border border-gray-300 text-xs focus:ring-1 focus:ring-primary-600 font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-gray-800 block mb-1">
                    Longitude Pusat <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={newGeofenceForm.centerLng}
                    onChange={(e) =>
                      setNewGeofenceForm({ ...newGeofenceForm, centerLng: Number(e.target.value) })
                    }
                    required
                    className="w-full p-2.5 rounded-lg border border-gray-300 text-xs focus:ring-1 focus:ring-primary-600 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-gray-800 block mb-1">
                  Radius (Meter) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min={50}
                  max={100000}
                  value={newGeofenceForm.radiusM}
                  onChange={(e) =>
                    setNewGeofenceForm({ ...newGeofenceForm, radiusM: Number(e.target.value) })
                  }
                  required
                  className="w-full p-2.5 rounded-lg border border-gray-300 text-xs focus:ring-1 focus:ring-primary-600"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="appliesToAllCheck"
                  checked={newGeofenceForm.appliesToAll}
                  onChange={(e) =>
                    setNewGeofenceForm({ ...newGeofenceForm, appliesToAll: e.target.checked })
                  }
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-600"
                />
                <label htmlFor="appliesToAllCheck" className="text-xs text-gray-700">
                  Berlaku untuk seluruh armada motor
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowAddGeofenceModal(false)}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 font-medium text-gray-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 rounded-lg bg-primary-900 hover:bg-primary-800 text-white font-bold disabled:opacity-50"
                >
                  {submitting ? 'Menyimpan...' : 'Simpan Geofence'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default GpsTracking;
