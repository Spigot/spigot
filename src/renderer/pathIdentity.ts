type RendererApi = {
  platform?: string;
};

function rendererPlatform() {
  return typeof window === 'undefined'
    ? undefined
    : (window as Window & { api?: RendererApi }).api?.platform;
}

export function normalizedPath(path: string) {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
  return rendererPlatform() === 'win32' ? normalized.toLowerCase() : normalized;
}

export function pathsEqual(left: string, right: string) {
  return normalizedPath(left) === normalizedPath(right);
}

export function findPath(paths: string[], path: string) {
  return paths.find((candidate) => pathsEqual(candidate, path));
}

export function recordPath<T>(record: Record<string, T>, path: string) {
  return Object.keys(record).find((candidate) => pathsEqual(candidate, path));
}

export function isPathAtOrWithin(path: string, parent: string) {
  const normalized = normalizedPath(path);
  const normalizedParent = normalizedPath(parent);
  return normalized === normalizedParent || normalized.startsWith(`${normalizedParent}/`);
}

export function replacePathPrefix(path: string, from: string, to: string) {
  const normalized = normalizedPath(path);
  const normalizedFrom = normalizedPath(from);
  if (normalized === normalizedFrom) return to;
  return normalized.startsWith(`${normalizedFrom}/`) ? `${to}${path.slice(from.length)}` : path;
}
