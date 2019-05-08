import path from 'path';
import * as typescript from 'typescript';

export function* walkUp(cwd: string) {
  const { root } = path.parse(cwd);
  let directory = cwd;
  do {
    yield directory;
    directory = path.dirname(directory);
  } while (directory !== root);
}

export interface ResolutionResult {
  readonly resolvedModule?: typescript.ResolvedModuleFull;
  readonly resolvedTypeReferenceDirective?: typescript.ResolvedTypeReferenceDirective;
  readonly failedLookupLocations?: ReadonlyArray<string>;
}

export const getResolvedValue = (result: ResolutionResult) =>
  result.resolvedModule || result.resolvedTypeReferenceDirective;

export function resolveModuleName<T extends ResolutionResult>(
  pnpPath: string | undefined,
  request: string,
  issuer: string,
  moduleResolutionHost: typescript.ModuleResolutionHost,
  parentResolver: (request: string, issuer: string) => T,
): T {
  const failedLookupLocations: string[] = [];
  const failedResolution = { failedLookupLocations } as any;

  const baseResolution = parentResolver(request, issuer);
  failedLookupLocations.push(...(baseResolution.failedLookupLocations || []));
  if (getResolvedValue(baseResolution)) {
    return baseResolution;
  }

  if (!pnpPath) return failedResolution;
  const pnp: any = require(pnpPath);

  const pattern = /^(!(?:.*!)+)?((?!\.{0,2}\/)(?:@[^\/]+\/)?[^\/]+)?(.*)/;
  const [, , packageName = '', rest] = request.match(pattern)!;
  if (!packageName) return failedResolution;

  const escapedPackageName = packageName.startsWith('@')
    ? packageName.slice(1).replace(/\//g, `__`)
    : packageName;

  const resolutionResults: T[] = [];
  const regularPackage = `${packageName}${rest}`;
  const typesPackage = `@types/${escapedPackageName}${rest}`;
  for (const fullPackageName of [regularPackage, typesPackage]) {
    let unqualified: string | undefined;
    try {
      unqualified = pnp.resolveToUnqualified(fullPackageName, issuer, { considerBuiltins: false });
    } catch {}
    if (!unqualified) continue;

    const extensions = ['', '.ts', '.tsx', '.d.ts', '.js', '.jsx', '.json'];
    const isDirectory =
      moduleResolutionHost.directoryExists &&
      moduleResolutionHost.directoryExists(unqualified) &&
      !extensions.some(ext => !moduleResolutionHost.fileExists(unqualified! + ext));

    if (isDirectory) {
      unqualified += '/';
    }

    const resolution = parentResolver(unqualified, issuer);
    failedLookupLocations.push(...(resolution.failedLookupLocations || []));
    if (getResolvedValue(resolution)) {
      resolutionResults.push(resolution);
    }
  }

  const preferredResult = resolutionResults.find(resolution => {
    if (!resolution) return false;
    const resolved = getResolvedValue(resolution);
    return (
      resolved != null &&
      resolved.resolvedFileName != null &&
      resolved.resolvedFileName.endsWith('.ts')
    );
  });

  return preferredResult || resolutionResults[0] || failedResolution;
}
