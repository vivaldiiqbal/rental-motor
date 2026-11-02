const BaseGpsProvider = require('./BaseGpsProvider');

class TraccarGpsProvider extends BaseGpsProvider {
  constructor() {
    super('traccar');
  }

  parsePayload(body, headers = {}) {
    if (!body || typeof body !== 'object') {
      throw new Error('Payload Traccar harus berupa objek JSON.');
    }

    // Format 1: Standar Webhook Traccar ({ event: "...", device: { uniqueId }, position: { latitude, longitude, ... } })
    if (body.device && body.position) {
      const device = body.device;
      const pos = body.position;
      const externalId = device.uniqueId || device.id;
      const attributes = pos.attributes || {};

      // Traccar mengirim speed dalam knot (1 knot = 1.852 km/h) jika default, atau jika sudah km/h
      // Cek atribut speed
      let speedKmh = Number(pos.speed || 0);
      if (attributes.speedUnit === 'knots' || (!attributes.speedUnit && speedKmh > 0 && speedKmh < 100)) {
        speedKmh = Math.round(speedKmh * 1.852 * 10) / 10;
      }

      return [
        {
          externalId: String(externalId),
          recordedAt: new Date(pos.fixTime || pos.deviceTime || pos.serverTime || new Date()).toISOString(),
          lat: Number(pos.latitude),
          lng: Number(pos.longitude),
          speedKmh,
          heading: Number(pos.course || 0),
          accuracyM: pos.accuracy !== undefined ? Number(pos.accuracy) : null,
          ignition: Boolean(attributes.ignition || attributes.motion),
          batteryPct: attributes.batteryLevel !== undefined ? Number(attributes.batteryLevel) : null,
          powerCut: attributes.alarm === 'powerCut' || attributes.power === 0,
          raw: body,
        },
      ];
    }

    // Format 2: Direct Positions Array dari Traccar Forwarding
    if (body.positions && Array.isArray(body.positions)) {
      return body.positions.map((p) => {
        const extId = p.uniqueId || p.deviceId || body.uniqueId;
        const attrs = p.attributes || {};
        return {
          externalId: String(extId),
          recordedAt: new Date(p.fixTime || p.deviceTime || new Date()).toISOString(),
          lat: Number(p.latitude),
          lng: Number(p.longitude),
          speedKmh: Number(p.speed || 0) * 1.852,
          heading: Number(p.course || 0),
          accuracyM: p.accuracy !== undefined ? Number(p.accuracy) : null,
          ignition: Boolean(attrs.ignition),
          batteryPct: attrs.batteryLevel !== undefined ? Number(attrs.batteryLevel) : null,
          powerCut: attrs.alarm === 'powerCut',
          raw: p,
        };
      });
    }

    // Fallback: jika format OsmAnd / generic field dalam body
    const externalId = body.id || body.deviceid || body.uniqueId;
    if (externalId && (body.lat || body.latitude) && (body.lon || body.lng || body.longitude)) {
      return [
        {
          externalId: String(externalId),
          recordedAt: new Date(body.timestamp || body.time || new Date()).toISOString(),
          lat: Number(body.lat || body.latitude),
          lng: Number(body.lon || body.lng || body.longitude),
          speedKmh: Number(body.speed || 0),
          heading: Number(body.bearing || body.heading || 0),
          accuracyM: body.accuracy ? Number(body.accuracy) : null,
          ignition: Boolean(body.ignition),
          batteryPct: body.batt ? Number(body.batt) : null,
          powerCut: Boolean(body.powerCut),
          raw: body,
        },
      ];
    }

    throw new Error('Format payload Traccar tidak dikenali.');
  }

  /**
   * Opsi polling API Traccar: GET /api/positions dari Traccar Server
   * @param {string} baseUrl
   * @param {string} userOrToken
   * @param {string} password
   * @param {string} fromIso
   */
  async pollPositions(baseUrl, userOrToken, password = '', fromIso = null) {
    const url = new URL('/api/positions', baseUrl);
    if (fromIso) {
      url.searchParams.set('from', fromIso);
      url.searchParams.set('to', new Date().toISOString());
    }

    const headers = {
      'Accept': 'application/json',
      'User-Agent': 'RodaKita-Traccar-Poller/1.0',
    };

    if (password) {
      const authStr = Buffer.from(`${userOrToken}:${password}`).toString('base64');
      headers['Authorization'] = `Basic ${authStr}`;
    } else if (userOrToken) {
      headers['Authorization'] = `Bearer ${userOrToken}`;
    }

    const res = await fetch(url.toString(), { method: 'GET', headers });
    if (!res.ok) {
      throw new Error(`Traccar polling API gagal: ${res.status} ${res.statusText}`);
    }

    const json = await res.json();
    return this.parsePayload({ positions: json }, headers);
  }
}

module.exports = TraccarGpsProvider;
