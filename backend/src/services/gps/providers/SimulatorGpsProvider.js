const BaseGpsProvider = require('./BaseGpsProvider');

class SimulatorGpsProvider extends BaseGpsProvider {
  constructor() {
    super('simulator');
  }

  parsePayload(body, headers = {}) {
    if (!body || typeof body !== 'object') {
      throw new Error('Payload simulator harus berupa objek JSON.');
    }

    const items = Array.isArray(body) ? body : [body];
    const positions = [];

    for (const item of items) {
      const externalId = item.externalId || item.deviceId || item.device_id || item.external_id;
      if (!externalId) {
        throw new Error('externalId atau deviceId wajib diisi.');
      }

      const recordedAt = item.recordedAt || item.recorded_at || item.timestamp || new Date().toISOString();
      const lat = Number(item.lat !== undefined ? item.lat : item.latitude);
      const lng = Number(item.lng !== undefined ? item.lng : item.longitude);

      if (isNaN(lat) || isNaN(lng)) {
        throw new Error('lat dan lng harus berupa angka koordinat valid.');
      }

      positions.push({
        externalId: String(externalId),
        recordedAt: new Date(recordedAt).toISOString(),
        lat,
        lng,
        speedKmh: Number(item.speedKmh ?? item.speed ?? item.speed_kmh ?? 0),
        heading: Number(item.heading ?? item.course ?? item.bearing ?? 0),
        accuracyM: item.accuracyM !== undefined ? Number(item.accuracyM) : (item.accuracy !== undefined ? Number(item.accuracy) : null),
        ignition: Boolean(item.ignition),
        batteryPct: item.batteryPct !== undefined ? Number(item.batteryPct) : (item.battery !== undefined ? Number(item.battery) : null),
        powerCut: Boolean(item.powerCut ?? item.power_cut ?? false),
        raw: item,
      });
    }

    return positions;
  }
}

module.exports = SimulatorGpsProvider;
