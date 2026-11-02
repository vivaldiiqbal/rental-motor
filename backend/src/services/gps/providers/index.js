const SimulatorGpsProvider = require('./SimulatorGpsProvider');
const TraccarGpsProvider = require('./TraccarGpsProvider');
const GenericWebhookGpsProvider = require('./GenericWebhookGpsProvider');

class ProviderRegistry {
  constructor() {
    this.providers = new Map();
    this.register(new SimulatorGpsProvider());
    this.register(new TraccarGpsProvider());
    this.register(new GenericWebhookGpsProvider());
  }

  register(provider) {
    this.providers.set(provider.name, provider);
  }

  get(name) {
    if (!name) return null;
    const lower = String(name).toLowerCase();
    if (lower === 'webhook') return this.providers.get('generic_webhook');
    return this.providers.get(lower) || null;
  }

  /**
   * Mendeteksi provider secara otomatis dari params / query / header / format payload.
   */
  resolveProvider(req) {
    // 1. Cek dari route param /ingest/:provider, query param ?provider=..., atau header
    const explicitName = req.params?.provider || req.query?.provider || req.headers['x-gps-provider'];
    if (explicitName) {
      const p = this.get(explicitName);
      if (p) return p;
    }

    const body = req.body;
    // 2. Deteksi struktur payload Traccar
    if (body && ((body.device && body.position) || (body.positions && Array.isArray(body.positions)))) {
      return this.providers.get('traccar');
    }

    // 3. Deteksi simulator
    if (body && (body.provider === 'simulator' || req.headers['user-agent']?.includes('Simulator'))) {
      return this.providers.get('simulator');
    }

    // Default ke generic_webhook jika tidak ada indikasi lain
    return this.providers.get('generic_webhook');
  }
}

const registry = new ProviderRegistry();

module.exports = {
  registry,
  SimulatorGpsProvider,
  TraccarGpsProvider,
  GenericWebhookGpsProvider,
};
