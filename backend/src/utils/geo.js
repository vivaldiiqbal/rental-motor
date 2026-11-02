/**
 * Utilitas Matematika Geografis dan Geofencing untuk Pelacakan GPS RodaKita
 * Menggunakan perhitungan Haversine, Ray-Casting Point-in-Polygon, dan RDP Route Simplification.
 * Tanpa ketergantungan PostGIS.
 */

/**
 * Menghitung jarak lingkaran besar (Haversine) antara dua koordinat dalam satuan meter.
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} Jarak dalam meter (dibulatkan 1 desimal)
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  if (lat1 === lat2 && lon1 === lon2) return 0;

  const toRad = (x) => (Number(x) * Math.PI) / 180;
  const R = 6371000; // Radius bumi dalam meter

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const rLat1 = toRad(lat1);
  const rLat2 = toRad(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Memeriksa apakah suatu titik koordinat berada di dalam polygon (Ray-Casting algorithm).
 * Mendukung polygon cembung, cekung, titik pada simpul (vertex), dan titik pada tepi (edge).
 * @param {{ lat: number, lng: number } | [number, number]} point
 * @param {Array<{ lat: number, lng: number } | [number, number]>} polygon
 * @returns {boolean}
 */
function isPointInPolygon(point, polygon) {
  if (!point || !Array.isArray(polygon) || polygon.length < 3) return false;

  const ptLat = Number(point.lat !== undefined ? point.lat : point[0]);
  const ptLng = Number(point.lng !== undefined ? point.lng : point[1]);

  if (isNaN(ptLat) || isNaN(ptLng)) return false;

  let inside = false;
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = Number(polygon[i].lat !== undefined ? polygon[i].lat : polygon[i][0]);
    const yi = Number(polygon[i].lng !== undefined ? polygon[i].lng : polygon[i][1]);
    const xj = Number(polygon[j].lat !== undefined ? polygon[j].lat : polygon[j][0]);
    const yj = Number(polygon[j].lng !== undefined ? polygon[j].lng : polygon[j][1]);

    // 1. Cek apakah titik persis berada pada simpul (vertex)
    if (Math.abs(ptLat - xi) < 1e-7 && Math.abs(ptLng - yi) < 1e-7) {
      return true;
    }

    // 2. Cek apakah titik berada pada segmen garis tepi (edge)
    const minLat = Math.min(xi, xj);
    const maxLat = Math.max(xi, xj);
    const minLng = Math.min(yi, yj);
    const maxLng = Math.max(yi, yj);

    if (ptLat >= minLat && ptLat <= maxLat && ptLng >= minLng && ptLng <= maxLng) {
      // Periksa kolinearitas via cross product
      const crossProduct = (ptLng - yi) * (xj - xi) - (ptLat - xi) * (yj - yi);
      if (Math.abs(crossProduct) < 1e-7) {
        return true;
      }
    }

    // 3. Ray casting
    const intersect = yi > ptLng !== yj > ptLng && ptLat < ((xj - xi) * (ptLng - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Menghitung jarak terpendek (meter) dari titik ke segmen garis (p1 -> p2).
 */
function distanceToSegment(p, p1, p2) {
  const d12 = haversineDistance(p1.lat, p1.lng, p2.lat, p2.lng);
  if (d12 === 0) return haversineDistance(p.lat, p.lng, p1.lat, p1.lng);

  // Proyeksi titik ke garis
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p.lat - p1.lat) * (p2.lat - p1.lat) + (p.lng - p1.lng) * (p2.lng - p1.lng)) /
        ((p2.lat - p1.lat) ** 2 + (p2.lng - p1.lng) ** 2)
    )
  );

  const projLat = p1.lat + t * (p2.lat - p1.lat);
  const projLng = p1.lng + t * (p2.lng - p1.lng);
  return haversineDistance(p.lat, p.lng, projLat, projLng);
}

/**
 * Memeriksa apakah suatu koordinat berada di dalam area geofence (Circle atau Polygon).
 * Mendukung margin toleransi tambahan dalam meter (misal untuk histeresis boundary 30 meter).
 * @param {{ lat: number, lng: number }} point
 * @param {object} geofence
 * @param {number} marginMeters
 * @returns {boolean}
 */
function isPointInGeofence(point, geofence, marginMeters = 0) {
  if (!point || !geofence) return false;

  const shape = geofence.shape || geofence.type || 'circle';

  if (shape === 'circle') {
    const centerLat = geofence.centerLat ?? geofence.geometry?.center?.lat;
    const centerLng = geofence.centerLng ?? geofence.geometry?.center?.lng;
    const radiusM = Number(geofence.radiusM ?? geofence.geometry?.radius ?? 1000);

    if (centerLat === null || centerLng === null || isNaN(centerLat) || isNaN(centerLng)) {
      return false;
    }

    const dist = haversineDistance(point.lat, point.lng, centerLat, centerLng);
    return dist <= radiusM + marginMeters;
  }

  if (shape === 'polygon') {
    const poly = geofence.polygon || geofence.geometry?.coordinates || [];
    if (!Array.isArray(poly) || poly.length < 3) return false;

    // Cek apakah langsung di dalam polygon
    if (isPointInPolygon(point, poly)) {
      return true;
    }

    // Jika ada margin toleransi luar (misal 30m), cek jarak ke setiap segmen garis tepi
    if (marginMeters > 0) {
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const p1 = {
          lat: Number(poly[i].lat ?? poly[i][0]),
          lng: Number(poly[i].lng ?? poly[i][1]),
        };
        const p2 = {
          lat: Number(poly[j].lat ?? poly[j][0]),
          lng: Number(poly[j].lng ?? poly[j][1]),
        };
        if (distanceToSegment(point, p1, p2) <= marginMeters) {
          return true;
        }
      }
    }

    return false;
  }

  return false;
}

/**
 * Penyederhanaan rute menggunakan algoritma Ramer-Douglas-Peucker (RDP).
 * Mengurangi ribuan koordinat GPS tanpa kehilangan bentuk rute secara signifikan.
 * @param {Array<{ lat: number, lng: number }>} points
 * @param {number} epsilonMeters Toleransi deviasi garis dalam meter (default: 5 meter)
 * @returns {Array<{ lat: number, lng: number }>}
 */
function simplifyRouteRDP(points, epsilonMeters = 5) {
  if (!Array.isArray(points) || points.length <= 2) return points || [];

  let dmax = 0;
  let index = 0;
  const end = points.length - 1;

  for (let i = 1; i < end; i++) {
    const d = distanceToSegment(points[i], points[0], points[end]);
    if (d > dmax) {
      index = i;
      dmax = d;
    }
  }

  if (dmax > epsilonMeters) {
    const recResults1 = simplifyRouteRDP(points.slice(0, index + 1), epsilonMeters);
    const recResults2 = simplifyRouteRDP(points.slice(index), epsilonMeters);
    return recResults1.slice(0, recResults1.length - 1).concat(recResults2);
  }

  return [points[0], points[end]];
}

/**
 * Mendeteksi titik perhentian motor (diam lebih dari X menit) dari rentetan log posisi.
 * @param {Array<{ lat: number, lng: number, recordedAt: string, speedKmh?: number, ignition?: boolean }>} positions
 * @param {number} minDurationMinutes Durasi diam minimal (default: 5 menit)
 * @param {number} maxMovementMeters Toleransi pergeseran koordinat saat diam (default: 35 meter)
 */
function detectStops(positions, minDurationMinutes = 5, maxMovementMeters = 35) {
  if (!Array.isArray(positions) || positions.length < 2) return [];

  const stops = [];
  const minDurationMs = minDurationMinutes * 60 * 1000;

  let clusterStart = positions[0];
  let clusterEnd = positions[0];
  let clusterPoints = [positions[0]];

  for (let i = 1; i < positions.length; i++) {
    const current = positions[i];
    const dist = haversineDistance(clusterStart.lat, clusterStart.lng, current.lat, current.lng);

    if (dist <= maxMovementMeters) {
      clusterEnd = current;
      clusterPoints.push(current);
    } else {
      // Evaluasi apakah cluster sebelumnya memenuhi durasi perhentian
      const startTime = new Date(clusterStart.recordedAt).getTime();
      const endTime = new Date(clusterEnd.recordedAt).getTime();
      const durationMs = endTime - startTime;

      if (durationMs >= minDurationMs) {
        // Rata-rata koordinat cluster
        const avgLat = clusterPoints.reduce((s, p) => s + p.lat, 0) / clusterPoints.length;
        const avgLng = clusterPoints.reduce((s, p) => s + p.lng, 0) / clusterPoints.length;

        stops.push({
          lat: Math.round(avgLat * 1e7) / 1e7,
          lng: Math.round(avgLng * 1e7) / 1e7,
          arrivedAt: clusterStart.recordedAt,
          departedAt: clusterEnd.recordedAt,
          durationMinutes: Math.round(durationMs / 60000),
        });
      }

      // Mulai cluster baru
      clusterStart = current;
      clusterEnd = current;
      clusterPoints = [current];
    }
  }

  // Cek cluster terakhir
  const startTime = new Date(clusterStart.recordedAt).getTime();
  const endTime = new Date(clusterEnd.recordedAt).getTime();
  const durationMs = endTime - startTime;
  if (durationMs >= minDurationMs) {
    const avgLat = clusterPoints.reduce((s, p) => s + p.lat, 0) / clusterPoints.length;
    const avgLng = clusterPoints.reduce((s, p) => s + p.lng, 0) / clusterPoints.length;
    stops.push({
      lat: Math.round(avgLat * 1e7) / 1e7,
      lng: Math.round(avgLng * 1e7) / 1e7,
      arrivedAt: clusterStart.recordedAt,
      departedAt: clusterEnd.recordedAt,
      durationMinutes: Math.round(durationMs / 60000),
    });
  }

  return stops;
}

module.exports = {
  haversineDistance,
  isPointInPolygon,
  isPointInGeofence,
  distanceToSegment,
  simplifyRouteRDP,
  detectStops,
};
