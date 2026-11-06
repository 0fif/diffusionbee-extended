const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const https = require('https');

// Publish only a fully written, verified file. Cancellation never registers a model.
function downloadModel({url, dest, checksum, progress, complete, failed}) {
    const temporary = dest + '.' + crypto.randomBytes(8).toString('hex') + '.part';
    const file = fs.createWriteStream(temporary);
    const hash = crypto.createHash('md5');
    let settled = false, received = 0, total;
    let transfer;
    const fail = error => {
        if (settled) return;
        settled = true;
        if (transfer) transfer.destroy();
        const cleanup = () => fs.unlink(temporary, () => failed(error.message));
        if (file.closed) cleanup(); else {file.once('close', cleanup);file.destroy();}
    };
    file.on('error', fail);
    function connect(address, redirects = 0) {
        if (settled) return;
        try {
            const target = new URL(address);
            if (!['https:', 'http:'].includes(target.protocol)) throw Error('Unsupported download URL.');
            transfer = (target.protocol === 'https:' ? https : http).get(target, response => {
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    response.resume();
                    let next;
                    try {next = new URL(response.headers.location, target);}
                    catch (_) {return fail(Error('Invalid download redirect.'));}
                    if (redirects >= 5 || (target.protocol === 'https:' && next.protocol !== 'https:'))
                        return fail(Error('Unsafe or excessive download redirects.'));
                    connect(next.href, redirects + 1);return;
                }
                if (response.statusCode !== 200) {response.resume();return fail(Error('Download failed (HTTP ' + response.statusCode + ').'));}
                total = Number(response.headers['content-length']);
                response.on('data', chunk => {
                    if (settled) return;
                    received += chunk.length;hash.update(chunk);
                    progress(total > 0 ? Math.min(99, Math.round(received / total * 100)) : 0);
                });
                response.on('aborted', () => fail(Error('Download interrupted. Try again.')));
                response.on('error', fail);
                response.pipe(file);
            });
            transfer.setTimeout(20000, () => fail(Error('Download timed out. Try again.')));
            transfer.on('error', fail);
        } catch (error) {fail(error);}
    }
    queueMicrotask(() => connect(url));
    file.on('finish', () => {
        if (settled) return;
        const digest = hash.digest('hex');
        if (total > 0 && received !== total) return fail(new Error('Download incomplete. Try again.'));
        if (checksum && checksum !== digest) return fail(new Error('Download checksum did not match. Try again.'));
        // Reserve completion before the async rename so late cancellation cannot
        // report a failure after a valid file has already been installed.
        settled = true;
        fs.rename(temporary, dest, error => {
            if (error) fs.unlink(temporary, () => failed(error.message));
            else complete(digest);
        });
    });
    return () => fail(new Error('Download cancelled.'));
}
module.exports = {downloadModel};
