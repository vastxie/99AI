export function sanitizeTraceText(value: unknown, limit: number): string | undefined {
  const text = String(value ?? '')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]')
    .replace(
      /\b(?:token|api[_-]?key|authorization|credential|access[_-]?key|secret|signature|password)\b\s*[:=]\s*([^&\s"'<>)]*)/gi,
      match => `${match.split(/[:=]/)[0]}=[redacted]`,
    )
    .replace(
      /\b(?:object[-_ ]?key|storage[-_ ]?path|stdout|stderr|stack|raw[-_ ]?logs?|runtime[-_ ]?logs?|logs?)\b\s*[:=]\s*[^\n\r]*/gi,
      '[trace-detail-hidden]',
    )
    .replace(
      /data:[a-z0-9.+/-]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+/gi,
      '[inline-content-hidden]',
    )
    .replace(/\b[A-Za-z0-9+/]{120,}={0,2}\b/g, '[inline-content-hidden]')
    .replace(/https?:\/\/[^\s"'<>)]*/g, '[url]')
    .replace(/\/api\/files\/[^\s"'<>)]*\/(?:download|preview)[^\s"'<>)]*/gi, '[url]')
    .replace(/\bfile_[A-Za-z0-9_-]+\b/g, '[private-file]')
    .replace(/\/(?:Users|private|var|tmp|root|home|storage|mnt|srv|app)\/[^\s"'<>)]*/g, '[path]')
    .replace(/[A-Za-z]:\\[^\s"'<>)]*/g, '[path]')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return undefined;
  return text.length > limit ? `${text.slice(0, Math.max(0, limit - 3))}...` : text;
}
