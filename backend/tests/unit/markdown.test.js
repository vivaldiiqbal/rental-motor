const { renderMarkdown, buildPlaceholderVars, stripAllTags } = require('../../src/utils/markdown');

describe('Unit Test: Markdown Renderer & HTML Sanitizer', () => {
  test('merender markdown standar menjadi HTML dengan benar', () => {
    const md = '# Judul Halaman\n\nParagraf dengan **tebal** dan *miring* serta [tautan](https://example.com).';
    const html = renderMarkdown(md);

    expect(html).toContain('<h1>Judul Halaman</h1>');
    expect(html).toContain('<strong>tebal</strong>');
    expect(html).toContain('<em>miring</em>');
    expect(html).toContain('<a href="https://example.com" rel="noopener noreferrer nofollow">tautan</a>');
  });

  test('menetralkan payload XSS: script tag, onerror event, dan iframe', () => {
    const malicious = [
      '# Hacked <script>alert("xss")</script>',
      '<img src="invalid.jpg" onerror="alert(1)"> Gambar rusak',
      '<iframe src="https://evil.com"></iframe> Frame jahat',
      '<a href="javascript:alert(1)">Klik saya</a>',
      '<div onmouseover="stealData()">Arahkan kursor</div>',
    ].join('\n\n');

    const clean = renderMarkdown(malicious);

    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('alert(');
    expect(clean).not.toContain('onerror');
    expect(clean).not.toContain('<iframe');
    expect(clean).not.toContain('javascript:');
    expect(clean).not.toContain('onmouseover');
  });

  test('melakukan substitusi placeholder dengan escaping ketat', () => {
    const md = 'Selamat datang di {{brandName}}. Usia minimal {{minRenterAge}} tahun. Hubungi {{contactEmail}}.';
    const vars = {
      brandName: '<b>RodaKita & Partner</b>',
      minRenterAge: 18,
      contactEmail: 'cs@rodakita.id',
    };

    const rendered = renderMarkdown(md, vars);

    expect(rendered).toContain('&lt;b&gt;RodaKita &amp; Partner&lt;/b&gt;');
    expect(rendered).not.toContain('<b>RodaKita');
    expect(rendered).toContain('Usia minimal 18 tahun');
    expect(rendered).toContain('cs@rodakita.id');
  });

  test('stripAllTags membersihkan semua tag HTML', () => {
    const input = 'Judul <script>alert(1)</script> <b>Tebal</b>';
    const output = stripAllTags(input);
    expect(output).toBe('Judul  Tebal');
  });
});
