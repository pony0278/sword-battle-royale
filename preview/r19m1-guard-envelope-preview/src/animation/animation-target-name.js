export function sanitizeAnimationTargetName(name) {
  return String(name || '').replace(/\s/g, '_').replace(/[\[\]\.:/]/g, '');
}
