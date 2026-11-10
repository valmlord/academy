// TypeSpec compile host of module 04 (design #44, section 7.2). Copied unchanged into the checks of every
// lesson that compiles the learner's contract; a demo asserts the copies are byte-identical.
//
// The grader (final_runtime.py) has already copied the learner's regular *.tsp files into <src> and placed
// a `node_modules` link there to the pinned TypeSpec install, so library imports resolve only to it.
// This host never runs learner JavaScript: every getJsImport request must be one of the realpaths in the
// allowlist file (recorded over the honest import corpus), and anything else is refused before it loads.
// Options are passed programmatically, so a learner tspconfig never applies.
//
// Usage: node --max-old-space-size=512 tsp_host.mjs <enforce|log> <pinned node_modules> <src> <work> <allowlist.json> <result fd>
// The result (one JSON object) is written to <result fd>, a pipe the grader created; stdout is unused.

import fs from "node:fs";
import path from "node:path";

const [mode, pinArg, srcArg, workArg, allowlistArg, resultFdArg] = process.argv.slice(2);
const resultFd = Number.parseInt(resultFdArg, 10);
const LIBRARIES = new Set(["@typespec/http", "@typespec/openapi", "@typespec/openapi3"]);
const EMITTER = "@typespec/openapi3";
const MAX_DIAGNOSTICS = 20;

function send(result) {
  fs.writeSync(resultFd, JSON.stringify(result));
  fs.closeSync(resultFd);
}

function realOrResolved(target) {
  try {
    return fs.realpathSync(target);
  } catch {
    return path.resolve(target);
  }
}

// A refused read looks to the compiler like a missing file, so its upward package.json lookup goes on
// as it would in an empty directory instead of aborting the compile.
function notFound(target) {
  const error = new Error(`ENOENT: refused read: ${target}`);
  error.code = "ENOENT";
  return error;
}

function isInside(target, root) {
  return target === root || target.startsWith(root + path.sep);
}

async function main() {
  const pin = fs.realpathSync(pinArg);
  const src = fs.realpathSync(srcArg);
  const work = fs.realpathSync(workArg);
  const allowed = new Set(
    JSON.parse(fs.readFileSync(allowlistArg, "utf8")).map((relative) => path.join(pin, relative)),
  );
  const compilerEntry = path.join(pin, "@typespec/compiler/dist/src/index.js");
  const { compile, getSourceLocation, NodeHost } = await import(`file://${compilerEntry}`);

  const refusedImports = [];
  const refusedReads = [];
  const logged = new Set();
  const writable = (target) => isInside(realOrResolved(path.dirname(target)), work) || isInside(path.resolve(target), work);
  const readable = (target) => {
    const real = realOrResolved(target);
    return isInside(real, src) || isInside(real, pin);
  };
  const host = {
    ...NodeHost,
    getJsImport: async (target) => {
      const real = realOrResolved(target);
      if (mode === "log") {
        logged.add(path.relative(pin, real));
        return NodeHost.getJsImport(target);
      }
      if (!allowed.has(real)) {
        refusedImports.push(isInside(real, src) ? path.relative(src, real) : real);
        throw new Error(`refused JS import: ${real}`);
      }
      return NodeHost.getJsImport(target);
    },
    readUrl: async (url) => {
      refusedReads.push(String(url));
      throw new Error(`refused URL read: ${url}`);
    },
    readFile: async (target) => {
      if (!readable(target)) {
        refusedReads.push(realOrResolved(target));
        throw notFound(target);
      }
      return NodeHost.readFile(target);
    },
    stat: async (target) => {
      if (!readable(target) && !isInside(path.resolve(target), work)) throw notFound(target);
      return NodeHost.stat(target);
    },
    readDir: async (target) => {
      if (!readable(target)) {
        refusedReads.push(realOrResolved(target));
        throw notFound(target);
      }
      return NodeHost.readDir(target);
    },
    writeFile: async (target, content) => {
      if (!writable(target)) throw new Error(`refused write: ${target}`);
      return NodeHost.writeFile(target, content);
    },
    mkdirp: async (target) => {
      if (!isInside(path.resolve(target), work)) throw new Error(`refused mkdir: ${target}`);
      return NodeHost.mkdirp(target);
    },
    rm: async (target, options) => {
      if (!isInside(path.resolve(target), work)) throw new Error(`refused rm: ${target}`);
      return NodeHost.rm(target, options);
    },
  };

  async function compileOnce(outputDir) {
    const program = await compile(host, path.join(src, "main.tsp"), {
      outputDir,
      emit: [EMITTER],
      warningAsError: true,
      options: {
        [EMITTER]: {
          "file-type": "json",
          "openapi-versions": ["3.1.0"],
          "seal-object-schemas": true,
          "emitter-output-dir": outputDir,
        },
      },
    });
    const diagnostics = program.diagnostics.slice(0, MAX_DIAGNOSTICS).map((diagnostic) => {
      let file = null;
      let line = null;
      try {
        const location = getSourceLocation(diagnostic.target);
        if (location?.file) {
          file = location.file.path;
          line = location.file.getLineAndCharacterOfPosition(location.pos).line + 1;
        }
      } catch {
        // A diagnostic without a source location (a library or emitter one) is reported without a line.
      }
      return {
        code: String(diagnostic.code),
        severity: String(diagnostic.severity),
        message: String(diagnostic.message),
        file: file && isInside(realOrResolved(file), src) ? path.relative(src, realOrResolved(file)) : null,
        line,
      };
    });
    const contexts = [];
    const badContexts = [];
    for (const [, script] of [...program.sourceFiles, ...program.jsSourceFiles]) {
      const file = script.file;
      const context = program.getSourceFileLocationContext(file);
      const real = realOrResolved(file.path);
      const label = context.type === "library" ? `library:${context.metadata?.name}` : context.type;
      contexts.push(label);
      const ok =
        context.type === "compiler" ||
        (context.type === "project" && isInside(real, src)) ||
        (context.type === "library" && LIBRARIES.has(context.metadata?.name));
      if (!ok) badContexts.push({ context: label, file: isInside(real, src) ? path.relative(src, real) : real });
    }
    const emitted = fs.existsSync(outputDir)
      ? fs.readdirSync(outputDir, { recursive: true }).filter((name) => String(name).endsWith(".json"))
      : [];
    const documents = emitted.map((name) => fs.readFileSync(path.join(outputDir, String(name)), "utf8"));
    return {
      hasError: program.hasError(),
      diagnostics,
      contexts: [...new Set(contexts)].sort(),
      badContexts,
      emitted: emitted.map(String).sort(),
      documents,
    };
  }

  const first = await compileOnce(path.join(work, "out-1"));
  const second = first.hasError ? null : await compileOnce(path.join(work, "out-2"));
  send({
    mode,
    hasError: first.hasError,
    diagnostics: first.diagnostics,
    refusedImports: [...new Set(refusedImports)],
    refusedReads: [...new Set(refusedReads)],
    contexts: first.contexts,
    badContexts: first.badContexts,
    emitted: first.emitted,
    document: first.documents.length === 1 ? first.documents[0] : null,
    deterministic: second === null ? null : JSON.stringify(second.documents) === JSON.stringify(first.documents),
    logged: [...logged].sort(),
  });
}

main().catch((error) => {
  send({ mode, crashed: true, error: String(error?.message ?? error).slice(0, 500) });
});
