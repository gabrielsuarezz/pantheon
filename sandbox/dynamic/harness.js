const fs = require('fs');

const log = [];
function recordAction(api, method, args) {
    // some args could be huge buffers or massive strings (like our payload). 
    // We should truncate massive strings for the JSON log, but maybe write them to disk?
    // Let's truncate strings larger than 1MB to avoid OOM, or maybe 50KB.
    const cleanArgs = args.map(arg => {
        if (typeof arg === 'string' && arg.length > 50000) {
            const sum = require('crypto').createHash('sha256').update(arg).digest('hex');
            fs.writeFileSync(`/tmp/payload_${sum}.bin`, arg);
            return `[LARGE STRING TRIMMED - Saved to /tmp/payload_${sum}.bin] (Len: ${arg.length})`;
        }
        return arg;
    });
    
    log.push({
        timestamp: Date.now(),
        api,
        method,
        args: cleanArgs
    });
}

function createStubProxy(apiName) {
    const state = {};
    return new Proxy(function() {}, {
        get: function(target, prop) {
            if (prop in state) return state[prop];
            if (prop === 'toString' || prop === 'valueOf' || prop === Symbol.toPrimitive) return () => `[${apiName}]`;
            if (typeof prop === 'symbol') return undefined;
            if (prop === 'toString' || prop === 'valueOf' || prop === Symbol.toPrimitive) return () => `[${apiName}]`;
            if (typeof prop === 'symbol') return undefined;
            
            // Return another proxy for chained calls or properties
            return new Proxy(function() {}, {
                apply: function(tgt, thisArg, args) {
                    recordAction(apiName, prop, args);
                    return createStubProxy(`${apiName}.${String(prop)}()`);
                },
                get: function(tgt, subProp) {
                    return createStubProxy(`${apiName}.${String(prop)}.${String(subProp)}`);
                }
            });
        },
        apply: function(target, thisArg, args) {
            recordAction(apiName, 'constructor_or_call', args);
            // Specifically handle classic COM objects
            if (args[0] === 'WScript.Shell') return createWScriptShellStub();
            if (args[0] === 'ADODB.Stream') return createAdodbStreamStub();
            if (args[0] === 'Scripting.FileSystemObject') return createFsoStub();
            return createStubProxy(`${apiName}(...)`);
        },
        set: function(target, prop, value) {
            recordAction(apiName, `set_${String(prop)}`, [value]);
            state[prop] = value;
            return true;
        }
    });
}

function createWScriptShellStub() {
    return {
        Run: function(cmd, windowStyle, bWaitOnReturn) {
            recordAction('WScript.Shell', 'Run', [cmd, windowStyle, bWaitOnReturn]);
            return 0; // Return success code
        },
        RegWrite: function(key, value, type) {
            recordAction('WScript.Shell', 'RegWrite', [key, value, type]);
        },
        ExpandEnvironmentStrings: function(str) {
            recordAction('WScript.Shell', 'ExpandEnvironmentStrings', [str]);
            return str.replace('%TEMP%', 'C:\\Temp').replace('%PUBLIC%', 'C:\\Users\\Public');
        },
        CreateShortcut: function(path) {
            recordAction('WScript.Shell', 'CreateShortcut', [path]);
            return {
                TargetPath: '',
                Save: function() { recordAction('WScript.Shortcut', 'Save', [path]); }
            };
        }
    };
}

function createAdodbStreamStub() {
    let mode, type, charset, pos;
    let content = "";
    return {
        Open: function() { recordAction('ADODB.Stream', 'Open', []); },
        WriteText: function(text) { 
            recordAction('ADODB.Stream', 'WriteText', [text]); 
            content += text;
        },
        SaveToFile: function(path, saveOptions) {
            recordAction('ADODB.Stream', 'SaveToFile', [path, saveOptions]);
        },
        Close: function() { recordAction('ADODB.Stream', 'Close', []); },
        set Type(v) { type = v; recordAction('ADODB.Stream', 'set Type', [v]); },
        set Charset(v) { charset = v; recordAction('ADODB.Stream', 'set Charset', [v]); },
        set Position(v) { pos = v; recordAction('ADODB.Stream', 'set Position', [v]); }
    };
}

function createFsoStub() {
    return {
        FileExists: function(path) {
            recordAction('Scripting.FileSystemObject', 'FileExists', [path]);
            return true; // pretend it exists so it deletes it, or pretend it doesn't
        },
        DeleteFile: function(path) {
            recordAction('Scripting.FileSystemObject', 'DeleteFile', [path]);
        }
    };
}

// Globals injection
global.ActiveXObject = createStubProxy('ActiveXObject');
global.WScript = createStubProxy('WScript');
global.WScript.ScriptName = "6108674530.JS";
global.WScript.ScriptFullName = "C:\\Users\\Public\\6108674530.JS";
global.WScript.Path = "C:\\Users\\Public";
global.WSH = global.WScript;

// SetTimeout collapse
global.setTimeout = function(cb, ms) {
    recordAction('Global', 'setTimeout', [ms]);
    cb();
};
global.setInterval = function(cb, ms) {
    recordAction('Global', 'setInterval', [ms]);
    cb();
};

// Run the script
const path = process.argv[2];
try {
    const code = fs.readFileSync(path, 'utf8');
    recordAction('Harness', 'Start', [path]);
    
    // Evaluate the malware in the current context
    eval(code);
    
    // Capture unhandled things that might be added to 'this' or 'global'
    recordAction('Harness', 'End', []);
} catch (e) {
    recordAction('Harness', 'Error', [e.message]);
}

console.log(JSON.stringify(log, null, 2));
