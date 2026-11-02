const BaseGpsProvider = require('./BaseGpsProvider');

class GenericWebhookGpsProvider extends BaseGpsProvider {
  constructor() {
    super('generic_webhook');
  }

  parsePayload(body, headers = {}) {
    if (!body || typeof body !== 'object') {
      throw new Error('Payload generic webhook harus berupa objek JSON.');
    }

    const list = Array.isArray(body) ? body : (Array.isArray(body.data) ? body.data : [body]);
    const positions = [];

    for (const item of list) {
      const externalId = item.externalId || item.external_id || item.imei || item.trackerId || item.tracker_id || item.deviceId;
      if (!externalId) {
        throw new Error('externalId wajib disertakan pada data posisi.');
      }

      const lat = Number(item.latitude ?? item.lat);
      const lng = Number(item.longitude ?? item.lng ?? item.lon);

      if (isNaN(lat) || isNaN(lng)) {
        throw new Error('Koordinat latitude/longitude tidak valid.');
      }

      positions.push({
        externalId: String(externalId),
        recordedAt: new Date(item.timestamp || item.recordedAt || item.recorded_at || new Date()).toISOString(),
        lat,
        lng,
        speedKmh: Number(item.speedKmh ?? item.speed ?? item.speed_kmh ?? 0),
        heading: Number(item.heading ?? item.course ?? item.bearing ?? 0),
        accuracyM: item.accuracyM !== undefined ? Number(item.accuracyM) : (item.accuracy !== undefined ? Number(item.accuracy) : null),
        ignition: Boolean(item.ignition ?? item.engineOn ?? false),
        batteryPct: item.batteryPct !== undefined ? Number(item.batteryPct) : (item.battery !== undefined ? Number(item.battery) : null),
        powerCut: Boolean(item.powerCut ?? item.power_cut ?? false),
        raw: item,
      });
    }

    return positions;
  }
}

module.exports = GenericWebhookGpsProvider;
