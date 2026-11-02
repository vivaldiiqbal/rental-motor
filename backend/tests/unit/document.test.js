process.env.USE_DB = 'memory';
const fs = require('fs');
const path = require('path');
const documentService = require('../../src/services/documentService');
const { store } = require('../../src/repositories');

describe('Unit Test: Document Service', () => {
  const dummyUploadDir = path.resolve(__dirname, '../../uploads/test-docs');

  beforeAll(() => {
    if (!fs.existsSync(dummyUploadDir)) {
      fs.mkdirSync(dummyUploadDir, { recursive: true });
    }
  });

  afterAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (fs.existsSync(dummyUploadDir)) {
      fs.rmSync(dummyUploadDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    store.resetToSeed();
  });

  test('handleDocumentsUpload: Mengubah status dokumen ke pending dan mencatat path', async () => {
    const dummyFile = path.join(dummyUploadDir, 'ktp-test.png');
    fs.writeFileSync(dummyFile, 'dummy content');

    const result = await documentService.handleDocumentsUpload(1, [
      {
        kind: 'ktp',
        file: { path: dummyFile },
      },
    ]);

    expect(result.ktp).toBe('pending');
  });

  test('handleDocumentsUpload: Menghapus file lama saat dokumen baru diunggah ulang', async () => {
    const oldFile = path.join(dummyUploadDir, 'old-ktp.png');
    fs.writeFileSync(oldFile, 'old content');

    // Set file lama di user 1
    const { userRepo } = require('../../src/repositories');
    await userRepo.update(1, {
      documentPaths: { ktp: oldFile },
      documents: { ktp: 'pending', sim: 'not_uploaded' },
    });

    expect(fs.existsSync(oldFile)).toBe(true);

    const newFile = path.join(dummyUploadDir, 'new-ktp.png');
    fs.writeFileSync(newFile, 'new content');

    await documentService.handleDocumentsUpload(1, [
      {
        kind: 'ktp',
        file: { path: newFile },
      },
    ]);

    // File lama harus sudah terhapus
    expect(fs.existsSync(oldFile)).toBe(false);
  });

  test('getDocumentFile: Menolak tipe dokumen yang tidak valid (bukan ktp atau sim)', async () => {
    await expect(documentService.getDocumentFile(1, 'paspor')).rejects.toThrow('Jenis dokumen harus "ktp" atau "sim".');
  });

  test('getDocumentFile: Menolak jika file dokumen belum diunggah atau tidak ditemukan di disk', async () => {
    await expect(documentService.getDocumentFile(2, 'ktp')).rejects.toThrow(/belum diunggah/);
  });

  test('getDocumentFile: Berhasil mengambil file dokumen yang valid', async () => {
    const dummyFile = path.join(dummyUploadDir, 'valid-sim.png');
    fs.writeFileSync(dummyFile, 'valid image data');

    const { userRepo } = require('../../src/repositories');
    await userRepo.update(1, {
      documentPaths: { sim: dummyFile },
      documents: { ktp: 'verified', sim: 'verified' },
    });

    const doc = await documentService.getDocumentFile(1, 'sim');
    expect(doc.filePath).toBe(dummyFile);
    expect(doc.status).toBe('verified');
    if (doc.stream) {
      doc.stream.on('error', () => {});
      await new Promise((resolve) => {
        doc.stream.on('end', resolve);
        doc.stream.on('close', resolve);
        doc.stream.resume();
      });
    }
  });
});
