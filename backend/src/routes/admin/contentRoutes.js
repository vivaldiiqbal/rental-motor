const express = require('express');
const router = express.Router();
const c = require('../../controllers/admin/contentAdminController');
const asyncHandler = require('../../middleware/asyncHandler');
const { requireRole } = require('../../middleware/requireRole');

// Pengelolaan konten (halaman, FAQ, content block): Khusus Admin.
// Router ini dipasang di root /api/admin, sehingga guard dibatasi pada prefix miliknya.
router.use(['/pages', '/faqs', '/content-blocks'], requireRole('admin'));

// Halaman
router.get('/pages', asyncHandler(c.listPages));
router.post('/pages/preview', asyncHandler(c.preview)); // sebelum /pages/:slug
router.get('/pages/:slug', asyncHandler(c.getPage));
router.put('/pages/:slug', asyncHandler(c.updatePage));
router.patch('/pages/:slug/publish', asyncHandler(c.setPublished));
router.get('/pages/:slug/versions', asyncHandler(c.listVersions));
router.get('/pages/:slug/versions/:version', asyncHandler(c.getVersion));
router.post('/pages/:slug/versions/:version/restore', asyncHandler(c.restoreVersion));

// FAQ
router.get('/faqs', asyncHandler(c.listFaqs));
router.post('/faqs', asyncHandler(c.createFaq));
router.put('/faqs/reorder', asyncHandler(c.reorderFaqs)); // sebelum /faqs/:id
router.put('/faqs/:id', asyncHandler(c.updateFaq));
router.delete('/faqs/:id', asyncHandler(c.deleteFaq));

// Content block
router.get('/content-blocks', asyncHandler(c.listBlocks));
router.put('/content-blocks/:key', asyncHandler(c.updateBlock));

module.exports = router;
