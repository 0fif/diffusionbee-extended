const {spawn} = require('child_process');

// Keep process failures out of Electron's main thread and report one terminal event.
function createLegacyEngine({binary, args = [], line, log, failed, spawnProcess = spawn}) {
    let child, stopped = false, ended = false, buffer = '', stderr = '';
    function fail(error) {
        if (stopped || ended) return;
        ended = true;
        if (child && child.exitCode === null) child.kill();
        failed(error.message || String(error));
    }
    return {
        start() {
            try {
                child = spawnProcess(binary, args);
                child.on('error', fail);
                child.stdin.on('error', fail);
                child.stdout.on('data', data => {
                    buffer += data.toString('utf8');
                    const lines = buffer.split('\n'); buffer = lines.pop();
                    for (const value of lines) line(value.replace(/\r$/, ''));
                });
                child.stderr.on('data', data => { stderr = (stderr + data).slice(-2000); log(data.toString()); });
                child.on('close', code => fail(Error('Legacy engine stopped (exit ' + code + '). ' + stderr)));
            } catch (error) { fail(error); }
        },
        write(message) {
            if (!child || ended || stopped || child.stdin.destroyed) return false;
            child.stdin.write('b2py ' + message + '\n');
            return true;
        },
        close() { stopped = true; if (child) child.kill('SIGKILL'); }
    };
}
module.exports = {createLegacyEngine};
