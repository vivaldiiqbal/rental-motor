const { computeDocsStatus } = require('../../src/utils/docsStatus');

describe('Unit Test: User Documents Status Computation (computeDocsStatus)', () => {
  test('Menghasilkan "verified" jika KTP dan SIM keduanya verified', () => {
    expect(computeDocsStatus({ ktp: 'verified', sim: 'verified' })).toBe('verified');
    expect(computeDocsStatus({ ktp: { status: 'verified' }, sim: { status: 'verified' } })).toBe('verified');
  });

  test('Menghasilkan "rejected" jika salah satu atau keduanya rejected', () => {
    expect(computeDocsStatus({ ktp: 'rejected', sim: 'verified' })).toBe('rejected');
    expect(computeDocsStatus({ ktp: 'verified', sim: 'rejected' })).toBe('rejected');
    expect(computeDocsStatus({ ktp: 'rejected', sim: 'pending' })).toBe('rejected');
    expect(computeDocsStatus({ ktp: 'pending', sim: 'rejected' })).toBe('rejected');
    expect(computeDocsStatus({ ktp: 'rejected', sim: 'not_uploaded' })).toBe('rejected');
    expect(computeDocsStatus({ ktp: 'not_uploaded', sim: 'rejected' })).toBe('rejected');
    expect(computeDocsStatus({ ktp: 'rejected', sim: 'rejected' })).toBe('rejected');
  });

  test('Menghasilkan "pending" jika ada yang pending dan tidak ada yang rejected', () => {
    expect(computeDocsStatus({ ktp: 'pending', sim: 'pending' })).toBe('pending');
    expect(computeDocsStatus({ ktp: 'pending', sim: 'verified' })).toBe('pending');
    expect(computeDocsStatus({ ktp: 'verified', sim: 'pending' })).toBe('pending');
    expect(computeDocsStatus({ ktp: 'pending', sim: 'not_uploaded' })).toBe('pending');
    expect(computeDocsStatus({ ktp: 'not_uploaded', sim: 'pending' })).toBe('pending');
  });

  test('Menghasilkan "not_uploaded" bila belum ada yang diunggah atau belum lengkap tanpa pending/rejected', () => {
    expect(computeDocsStatus({})).toBe('not_uploaded');
    expect(computeDocsStatus({ ktp: 'not_uploaded', sim: 'not_uploaded' })).toBe('not_uploaded');
    expect(computeDocsStatus({ ktp: 'verified', sim: 'not_uploaded' })).toBe('not_uploaded');
    expect(computeDocsStatus({ ktp: 'not_uploaded', sim: 'verified' })).toBe('not_uploaded');
  });
});
