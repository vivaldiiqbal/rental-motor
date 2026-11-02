const {
  haversineDistance,
  isPointInPolygon,
  isPointInGeofence,
  distanceToSegment,
  simplifyRouteRDP,
  detectStops,
} = require('../../src/utils/geo');

describe('Unit Test: GPS Geometrics & Algorithms (geo.js)', () => {
  describe('Haversine Distance', () => {
    test('Titik yang identik menghasilkan jarak 0 meter', () => {
      expect(haversineDistance(-6.2, 106.81, -6.2, 106.81)).toBe(0);
    });

    test('Menghitung jarak akurat antara Monas dan Bundaran HI (~2.2 km)', () => {
      const monas = { lat: -6.175392, lng: 106.827153 };
      const bundaranHi = { lat: -6.195034, lng: 106.823035 };
      const dist = haversineDistance(monas.lat, monas.lng, bundaranHi.lat, bundaranHi.lng);
      // Jarak geografis sesungguhnya sekitar 2.22 km (2220 m)
      expect(dist).toBeGreaterThan(2150);
      expect(dist).toBeLessThan(2300);
    });

    test('Sifat simetris: dist(A, B) === dist(B, A)', () => {
      const d1 = haversineDistance(-6.18, 106.82, -6.22, 106.85);
      const d2 = haversineDistance(-6.22, 106.85, -6.18, 106.82);
      expect(d1).toBe(d2);
    });
  });

  describe('Point-in-Polygon (Ray-Casting Algorithm)', () => {
    // Kotak sederhana: (0,0) ke (10,10)
    const squarePolygon = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 10 },
      { lat: 10, lng: 10 },
      { lat: 10, lng: 0 },
    ];

    test('Titik di dalam kotak mengembalikan true', () => {
      expect(isPointInPolygon({ lat: 5, lng: 5 }, squarePolygon)).toBe(true);
    });

    test('Titik di luar kotak mengembalikan false', () => {
      expect(isPointInPolygon({ lat: 15, lng: 5 }, squarePolygon)).toBe(false);
      expect(isPointInPolygon({ lat: -2, lng: 5 }, squarePolygon)).toBe(false);
    });

    test('Titik persis pada simpul (vertex) mengembalikan true', () => {
      expect(isPointInPolygon({ lat: 0, lng: 0 }, squarePolygon)).toBe(true);
      expect(isPointInPolygon({ lat: 10, lng: 10 }, squarePolygon)).toBe(true);
    });

    test('Titik persis pada tepi (edge) garis polygon mengembalikan true', () => {
      expect(isPointInPolygon({ lat: 0, lng: 5 }, squarePolygon)).toBe(true);
      expect(isPointInPolygon({ lat: 5, lng: 10 }, squarePolygon)).toBe(true);
    });

    // Polygon Cekung (Concave / L-shaped):
    // Kotak 10x10 dengan kuadran kanan atas (5..10, 5..10) dipotong
    const concavePolygon = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 10 },
      { lat: 5, lng: 10 },
      { lat: 5, lng: 5 },
      { lat: 10, lng: 5 },
      { lat: 10, lng: 0 },
    ];

    test('Polygon Cekung: titik di dalam area L mengembalikan true', () => {
      expect(isPointInPolygon({ lat: 2, lng: 2 }, concavePolygon)).toBe(true);
      expect(isPointInPolygon({ lat: 2, lng: 8 }, concavePolygon)).toBe(true);
      expect(isPointInPolygon({ lat: 8, lng: 2 }, concavePolygon)).toBe(true);
    });

    test('Polygon Cekung: titik pada lekukan cekung (cutout) mengembalikan false', () => {
      expect(isPointInPolygon({ lat: 8, lng: 8 }, concavePolygon)).toBe(false);
    });

    test('Menolak input tidak valid (< 3 titik atau titik kosong)', () => {
      expect(isPointInPolygon(null, squarePolygon)).toBe(false);
      expect(isPointInPolygon({ lat: 5, lng: 5 }, [])).toBe(false);
      expect(isPointInPolygon({ lat: 5, lng: 5 }, [{ lat: 0, lng: 0 }])).toBe(false);
    });
  });

  describe('Geofence Evaluation & Margin/Hysteresis', () => {
    const circleGeofence = {
      shape: 'circle',
      centerLat: -6.2,
      centerLng: 106.8,
      radiusM: 500,
    };

    test('Lingkaran: Titik di dalam radius mengembalikan true', () => {
      // Titik berjarak ~100m
      expect(isPointInGeofence({ lat: -6.2005, lng: 106.8 }, circleGeofence)).toBe(true);
    });

    test('Lingkaran: Titik jauh di luar radius mengembalikan false', () => {
      // Titik berjarak ~2000m
      expect(isPointInGeofence({ lat: -6.22, lng: 106.8 }, circleGeofence)).toBe(false);
    });

    test('Margin Toleransi: Titik 20m di luar batas dengan margin 30m tetap dianggap di dalam (hysteresis)', () => {
      // Center: -6.2, 106.8, Radius: 500m
      // Hitung koordinat yang berjarak ~515m dari pusat
      // 1 derajat lat ~ 111,000 m -> 515 m ~ 0.00464 derajat
      const testPoint = { lat: -6.2 + 0.00464, lng: 106.8 };
      const dist = haversineDistance(-6.2, 106.8, testPoint.lat, testPoint.lng);
      expect(dist).toBeGreaterThan(500);
      expect(dist).toBeLessThan(530);

      // Tanpa margin: di luar
      expect(isPointInGeofence(testPoint, circleGeofence, 0)).toBe(false);
      // Dengan margin 30m: masih dalam toleransi (mencegah flapping)
      expect(isPointInGeofence(testPoint, circleGeofence, 30)).toBe(true);
    });
  });

  describe('RDP Route Simplification (simplifyRouteRDP)', () => {
    test('Mengembalikan array kosong atau array asli jika titik <= 2', () => {
      expect(simplifyRouteRDP([])).toEqual([]);
      const twoPoints = [{ lat: -6.2, lng: 106.8 }, { lat: -6.21, lng: 106.81 }];
      expect(simplifyRouteRDP(twoPoints)).toEqual(twoPoints);
    });

    test('Menyederhanakan garis lurus sempurna dengan menghapus titik-titik kolinier di antaranya', () => {
      const straightLine = [
        { lat: 0, lng: 0 },
        { lat: 0.01, lng: 0.01 },
        { lat: 0.02, lng: 0.02 },
        { lat: 0.03, lng: 0.03 },
        { lat: 0.04, lng: 0.04 },
      ];
      const simplified = simplifyRouteRDP(straightLine, 10);
      // Hanya menyisakan titik awal dan akhir karena deviasi 0
      expect(simplified.length).toBe(2);
      expect(simplified[0]).toEqual({ lat: 0, lng: 0 });
      expect(simplified[1]).toEqual({ lat: 0.04, lng: 0.04 });
    });

    test('Mempertahankan titik belok signifikan yang melebihi batas toleransi epsilon', () => {
      const lineWithTurn = [
        { lat: 0, lng: 0 },
        { lat: 0.02, lng: 0.05 }, // Belokan jauh ~5.5 km deviasi
        { lat: 0.04, lng: 0 },
      ];
      const simplified = simplifyRouteRDP(lineWithTurn, 20); // epsilon 20m
      expect(simplified.length).toBe(3);
    });
  });

  describe('Stop Detection (detectStops)', () => {
    test('Mendeteksi perhentian saat motor diam selama lebih dari 5 menit', () => {
      const baseTime = new Date('2026-10-25T10:00:00Z').getTime();
      const positions = [
        { lat: -6.2, lng: 106.8, recordedAt: new Date(baseTime).toISOString() },
        { lat: -6.20005, lng: 106.80005, recordedAt: new Date(baseTime + 2 * 60 * 1000).toISOString() },
        { lat: -6.20008, lng: 106.80002, recordedAt: new Date(baseTime + 4 * 60 * 1000).toISOString() },
        { lat: -6.20003, lng: 106.80007, recordedAt: new Date(baseTime + 7 * 60 * 1000).toISOString() }, // 7 menit diam
        { lat: -6.25, lng: 106.85, recordedAt: new Date(baseTime + 10 * 60 * 1000).toISOString() }, // Bergerak jauh
      ];

      const stops = detectStops(positions, 5, 35);
      expect(stops.length).toBe(1);
      expect(stops[0].durationMinutes).toBe(7);
      expect(stops[0].arrivedAt).toBe(positions[0].recordedAt);
      expect(stops[0].departedAt).toBe(positions[3].recordedAt);
    });

    test('Tidak mendeteksi perhentian jika durasi diam kurang dari 5 menit', () => {
      const baseTime = new Date('2026-10-25T10:00:00Z').getTime();
      const positions = [
        { lat: -6.2, lng: 106.8, recordedAt: new Date(baseTime).toISOString() },
        { lat: -6.20002, lng: 106.80002, recordedAt: new Date(baseTime + 2 * 60 * 1000).toISOString() }, // hanya 2 menit
        { lat: -6.25, lng: 106.85, recordedAt: new Date(baseTime + 3 * 60 * 1000).toISOString() },
      ];

      const stops = detectStops(positions, 5, 35);
      expect(stops.length).toBe(0);
    });
  });
});
