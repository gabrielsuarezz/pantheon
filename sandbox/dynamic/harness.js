/**
 * Pantheon malware instrumentation harness.
 * Stubs dangerous APIs, intercepts all calls, outputs JSON log.
 * Run as: node harness.js <sample_path>
 *
 * SAFETY: This file is designed to run ONLY inside a hardened Docker container.
 * --network none --read-only --cap-drop ALL --security-opt no-new-privileges
 * Never run this on a host machine with the actual malware sample.
 */

'use strict';

const path = require('path');
const interceptLog = [];

function ts() {
  return new Date().toISOString();
}

function makeProxy(apiName) {
  const handler = {
    get(target, prop) {
      if (prop === 'then') return undefined; // prevent Promise confusion
      return new Proxy(function () {}, {
        apply(_t, _this, args) {
          interceptLog.push({
            api: apiName,
            method: String(prop),
            args: args.map(a => {
              try { return JSON.stringify(a); } catch (_) { return String(a); }
            }),
            timestamp: ts(),
          });
          return '';
        },
        get(_t2, prop2) {
          return makeProxy(`${apiName}.${String(prop)}`).get(null, prop2);
        },
      });
    },
    construct(_t, args) {
      interceptLog.push({ api: apiName, method: 'new', args: args.map(String), timestamp: ts() });
      return makeProxy(`${apiName}#instance`);
    },
  };
  return new Proxy({}, handler);
}

// --- Stub globals -----------------------------------------------------------

global.WScript = makeProxy('WScript');
global.WSH = makeProxy('WSH');
global.ActiveXObject = function ActiveXObject(name) {
  interceptLog.push({ api: 'ActiveXObject', method: 'constructor', args: [String(name)], timestamp: ts() });
  return makeProxy(`ActiveX(${name})`);
};
global.GetObject = function GetObject(arg) {
  interceptLog.push({ api: 'GetObject', method: 'call', args: [String(arg)], timestamp: ts() });
  return makeProxy('GetObject#result');
};

// Intercept require for dangerous modules
const _origRequire = require;
function safeRequire(id) {
  const blocked = ['child_process', 'net', 'http', 'https', 'dgram', 'tls', 'cluster'];
  if (blocked.includes(id)) {
    interceptLog.push({ api: 'require', method: id, args: [], timestamp: ts() });
    return makeProxy(`module:${id}`);
  }
  if (id === 'fs') {
    const realFs = _origRequire('fs');
    const fsProxy = Object.assign({}, realFs);
    ['writeFile', 'writeFileSync', 'appendFile', 'appendFileSync', 'unlink', 'unlinkSync'].forEach(fn => {
      fsProxy[fn] = function (...args) {
        interceptLog.push({ api: 'fs', method: fn, args: args.map(a => String(a).slice(0, 200)), timestamp: ts() });
      };
    });
    return fsProxy;
  }
  return _origRequire(id);
}
// Override require in global scope for eval'd code
global.require = safeRequire;

// Collapse time-based evasion
global.setTimeout = function (fn) { try { if (typeof fn === 'function') fn(); } catch (_) {} };
global.setInterval = function (fn) { try { if (typeof fn === 'function') fn(); } catch (_) {} };
global.clearTimeout = function () {};
global.clearInterval = function () {};

// --- Load sample ------------------------------------------------------------

const samplePath = process.argv[2];
if (!samplePath) {
  process.stderr.write('Usage: node harness.js <sample_path>\n');
  process.exit(1);
}

try {
  const abs = path.resolve(samplePath);
  _origRequire(abs);
} catch (e) {
  interceptLog.push({ api: 'runtime', method: 'error', args: [String(e.message)], timestamp: ts() });
}

process.stdout.write(JSON.stringify(interceptLog));
