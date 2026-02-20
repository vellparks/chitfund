import sha256 from 'js-sha256';

const LICENSE_SECRET = 'FM-LIC-SECRET-2026';

export function computeLicenseKey(productCode: string): string {
  const base = (productCode || '').replace(/-/g, '').toUpperCase();
  if (!base || base.length < 16) {
    throw new Error('Invalid product code');
  }
  const hash = sha256(base + LICENSE_SECRET).toUpperCase();
  const core = hash.slice(0, 20);
  const parts = core.match(/.{1,5}/g);
  return (parts || []).join('-');
}

