/**
 * Middleware batas waktu pemrosesan request HTTP (default 30 detik).
 */
function requestTimeout(ms = 30000) {
  return (req, res, next) => {
    // Jangan jalankan timeout saat testing agar tidak mengganggu test suite
    if (process.env.NODE_ENV === 'test') {
      return next();
    }

    const timer = setTimeout(() => {
      if (!res.headersSent) {
        res.status(504).json({
          success: false,
          error: {
            code: 'GATEWAY_TIMEOUT',
            message: 'Batas waktu pemrosesan permintaan habis (30 detik).',
            requestId: req.id,
          },
        });
      }
    }, ms);

    res.on('finish', () => clearTimeout(timer));
    res.on('close', () => clearTimeout(timer));
    next();
  };
}

module.exports = requestTimeout;
