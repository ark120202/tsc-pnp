import path from 'path';
import * as typescript from 'typescript';
import { resolveModuleName, walkUp } from './utils';

export default function(ts: typeof typescript) {
  function findPnp(host: typescript.ModuleResolutionHost, cwd: string): string {
    for (const directory of walkUp(cwd)) {
      const pnpPath = path.join(directory, '.pnp.js');
      if (host.fileExists(pnpPath)) {
        return pnpPath;
      }
    }

    console.log(`Could not find a .pnp.js file from '${cwd}'`);
    ts.sys.exit(ts.ExitStatus.DiagnosticsPresent_OutputsSkipped);
    throw null;
  }

  const nodeModuleNameResolver = ts.nodeModuleNameResolver;
  ts.nodeModuleNameResolver = (name, containingFile, compilerOptions, host, ...args) => {
    const cwd =
      compilerOptions && compilerOptions.configFileName
        ? path.dirname(compilerOptions.configFileName as string)
        : host.getCurrentDirectory!();

    const pnpPath = findPnp(host, cwd);
    return resolveModuleName(pnpPath, name, containingFile, host, (request, issuer) =>
      nodeModuleNameResolver(request, issuer, compilerOptions, host, ...args),
    );
  };

  const createProgram = ts.createProgram;
  ts.createProgram = (...args: any[]) => {
    const createProgramOptions: typescript.CreateProgramOptions = Array.isArray(args[0])
      ? (ts as any).createCreateProgramOptions(...args)
      : args[0];

    const { options } = createProgramOptions;
    const host = createProgramOptions.host || ts.createCompilerHost(options);
    createProgramOptions.host = host;

    const cwd = options.configFileName
      ? path.dirname(options.configFileName as string)
      : host.getCurrentDirectory();

    const pnpPath = findPnp(host, cwd);

    host.resolveModuleNames = (moduleNames, containingFile) =>
      moduleNames.map(
        name =>
          resolveModuleName(pnpPath, name, containingFile, host, (request, issuer) =>
            ts.resolveModuleName(request, issuer, options, host),
          ).resolvedModule,
      );

    host.resolveTypeReferenceDirectives = (typeDirectiveNames, containingFile) =>
      typeDirectiveNames.map(
        name =>
          resolveModuleName(pnpPath, name, containingFile, host, (request, issuer) =>
            ts.resolveTypeReferenceDirective(request, issuer, options, host),
          ).resolvedTypeReferenceDirective,
      );

    return createProgram(createProgramOptions);
  };
}
