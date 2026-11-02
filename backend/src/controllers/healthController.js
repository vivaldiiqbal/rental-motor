const { successResponse } = require('../utils/response');
const env = require('../config/env');
const { healthCheck } = require('../../db/pool');

const healthController = {
  async check(req, res) {
    let dbStatus = null;
    if (env.USE_DB === 'postgres') {
      try {
        dbStatus = await healthCheck();
      } catch (err) {
        dbStatus = { status: 'DOWN', error: err.message };
      }
    }

    return successResponse(res, {
      data: {
        status: 'UP',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0',
        service: 'RodaKita Motor Rental Backend API',
        environment: process.env.NODE_ENV || 'development',
        ...(dbStatus ? { database: dbStatus } : {}),
      },
      message: 'Server RodaKita beroperasi secara normal.',
    });
  },
};

module.exports = healthController;

