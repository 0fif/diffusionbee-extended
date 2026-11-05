const fs = require('fs');
const crypto = require('crypto');
const request = require('request');

// Publish only a fully written, verified file. Cancellation never registers a model.
function downloadModel({url, dest, checksum, progress, complete, failed}) {
    const temporary = dest + '.' + crypto.randomBytes(8).toString('hex') + '.part';
    const file = fs.createWriteStream(temporary);
    const hash = crypto.createHash('md5');
    let settled = false, received = 0, total;
    const transfer = request.get({url, followRedirect:true, timeout:20000});
    const fail = error => {
        if (settled) return;
        settled = true;
        transfer.abort();
        file.destroy();
        file.once('close', () => fs.unlink(temporary, () => failed(error.message)));
    };
    file.on('error', fail);
    transfer.on('error', fail);
    transfer.on('response', response => {
        if (response.statusCode !== 200) return fail(new Error('Download failed (HTTP ' + response.statusCode + ').'));
        total = Number(response.headers['content-length']);
        response.on('data', chunk => {
            if (settled) return;
            received += chunk.length;
            hash.update(chunk);
            progress(total > 0 ? Math.min(99, Math.round(received / total * 100)) : 0);
        });
        response.on('aborted', () => fail(new Error('Download interrupted. Try again.')));
        response.on('error', fail);
        response.pipe(file);
    });
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
