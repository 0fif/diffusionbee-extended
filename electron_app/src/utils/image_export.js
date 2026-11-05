export function image_export_format(source = '') {
    return /\.(jpe?g|mpo)(?:[?#].*)?$/i.test(source) ? 'jpg' : 'png';
}

export async function export_image(source, format, suggestedName) {
    const output = window.ipcRenderer.sendSync('save_dialog', suggestedName, format);
    if (!output) return false;
    if (!(format === 'jpg' ? /\.jpe?g$/i : /\.png$/i).test(output))
        throw new Error('Use a .' + format + ' filename for the selected export format.');
    const image = await new Promise((resolve, reject) => {
        const img = new Image();img.onload = () => resolve(img);img.onerror = () => reject(new Error('Could not read the image for export.'));
        img.src = /^(data:|file:|https?:)/.test(source) ? source : 'file://' + source.split('/').map(encodeURIComponent).join('/');
    });
    const canvas = document.createElement('canvas');canvas.width = image.naturalWidth;canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (format === 'jpg') {ctx.fillStyle = 'white';ctx.fillRect(0,0,canvas.width,canvas.height);}
    ctx.drawImage(image,0,0);
    const encoded = canvas.toDataURL(format === 'jpg' ? 'image/jpeg' : 'image/png', 0.98);
    const result = window.ipcRenderer.sendSync('save_encoded_image', output, encoded);
    if (!result?.success) throw new Error(result?.error || 'Could not save the image.');
    return true;
}
