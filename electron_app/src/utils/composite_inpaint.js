// Composite at the original resolution, preserving every unmasked source pixel.
export async function composite_inpaint(original, mask, generated, crop, matchBoundary = false) {
    const load = source => new Promise((resolve, reject) => {
        const image = new Image(); image.onload = () => resolve(image); image.onerror = reject;
        image.src = source.startsWith('data:') || source.startsWith('file:') ? source :
            'file://' + source.split('/').map(encodeURIComponent).join('/');
    });
    const [base, selection, result] = await Promise.all([load(original), load(mask), load(generated)]);
    const layer = document.createElement('canvas'); layer.width = base.width; layer.height = base.height;
    const ctx = layer.getContext('2d');
    const area = crop || {x:0,y:0,width:base.width,height:base.height};
    ctx.drawImage(result, area.x, area.y, area.width, area.height);
    if (matchBoundary) match_selection_colors(ctx, base, selection, area);
    // Feather inward: soften a hard selection without changing any unselected pixels.
    const feather = document.createElement('canvas');
    feather.width = area.width; feather.height = area.height;
    const maskCtx = feather.getContext('2d');
    const radius = Math.max(1, area.width / result.width * 4);
    maskCtx.filter = `blur(${radius}px)`;
    maskCtx.drawImage(selection, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height);
    const pixels = maskCtx.getImageData(0, 0, area.width, area.height);
    for (let i = 3; i < pixels.data.length; i += 4)
        pixels.data[i] = Math.max(0, (pixels.data[i] - 128) * 255 / 127);
    maskCtx.putImageData(pixels, 0, 0);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(feather, area.x, area.y);
    // Retain the exact original selection boundary, including holes and soft brush edges.
    ctx.drawImage(selection, 0, 0, base.width, base.height);
    const output = document.createElement('canvas'); output.width = base.width; output.height = base.height;
    output.getContext('2d').drawImage(base, 0, 0);
    output.getContext('2d').drawImage(layer, 0, 0);
    return output.toDataURL();
}

// Instruction editing can shift the background's lighting. Extend the source-minus-edit
// color difference at the selection boundary smoothly inward (a harmonic correction).
// Solve only the low-frequency correction on a small grid; retain full-resolution detail.
function match_selection_colors(ctx, base, selection, area) {
    const scale = Math.min(1, 96 / Math.max(area.width, area.height));
    const width = Math.max(3, Math.round(area.width * scale));
    const height = Math.max(3, Math.round(area.height * scale));
    const grid = document.createElement('canvas'); grid.width = width; grid.height = height;
    const g = grid.getContext('2d');
    const sample = image => {
        g.clearRect(0, 0, width, height);
        g.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, width, height);
        return g.getImageData(0, 0, width, height).data;
    };
    const source = sample(base), edit = sample(ctx.canvas), mask = sample(selection);
    const correction = new Float32Array(width * height * 3);
    const interior = [];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (mask[i * 4 + 3] > 127) {
            // At image edges there is no surrounding source to match.
            if (x && y && x < width - 1 && y < height - 1) interior.push(i * 3);
        } else for (let c = 0; c < 3; c++) correction[i * 3 + c] = source[i * 4 + c] - edit[i * 4 + c];
    }
    for (let iteration = 0; iteration < 1000; iteration++) {
        let change = 0;
        for (const i of interior) for (let c = 0; c < 3; c++) {
            const j = i + c;
            const delta = 1.7 * ((correction[j - 3] + correction[j + 3] +
                correction[j - width * 3] + correction[j + width * 3]) / 4 - correction[j]);
            correction[j] += delta;
            change = Math.max(change, Math.abs(delta));
        }
        if (change < 0.02) break;
    }
    const pixels = ctx.getImageData(area.x, area.y, area.width, area.height);
    for (let y = 0; y < area.height; y++) for (let x = 0; x < area.width; x++) {
        const gx = Math.max(0, Math.min(width - 1, (x + 0.5) * width / area.width - 0.5));
        const gy = Math.max(0, Math.min(height - 1, (y + 0.5) * height / area.height - 0.5));
        const x0 = Math.floor(gx), y0 = Math.floor(gy), dx = gx - x0, dy = gy - y0;
        const a = (y0 * width + x0) * 3, b = (y0 * width + Math.min(width - 1, x0 + 1)) * 3;
        const row = (Math.min(height - 1, y0 + 1) - y0) * width * 3;
        for (let c = 0; c < 3; c++) pixels.data[(y * area.width + x) * 4 + c] +=
            (1 - dy) * ((1 - dx) * correction[a + c] + dx * correction[b + c]) +
            dy * ((1 - dx) * correction[a + row + c] + dx * correction[b + row + c]);
    }
    ctx.putImageData(pixels, area.x, area.y);
}

// Work on the masked region at model resolution instead of shrinking the entire photo.
export function prepare_inpaint_crop(image, mask, resolution) {
    const width = image.width, height = image.height;
    const alpha = mask.getContext('2d').getImageData(0, 0, width, height).data;
    let left = width, top = height, right = -1, bottom = -1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        if (alpha[(y * width + x) * 4 + 3]) {
            left = Math.min(left, x); top = Math.min(top, y);
            right = Math.max(right, x); bottom = Math.max(bottom, y);
        }
    }
    if (right < 0) throw new Error('Draw a mask before generating.');
    const boxWidth = right-left+1, boxHeight = bottom-top+1;
    const padding = Math.max(resolution / 4, Math.max(boxWidth, boxHeight));
    const crop = {width: Math.min(width, Math.ceil(boxWidth+padding*2)),
        height: Math.min(height, Math.ceil(boxHeight+padding*2))};
    const scale = resolution / Math.max(crop.width, crop.height);
    const modelWidth = Math.max(64, Math.round(crop.width*scale/64)*64);
    const modelHeight = Math.max(64, Math.round(crop.height*scale/64)*64);
    crop.x = Math.max(0, Math.min(width-crop.width, Math.floor((left+right-crop.width)/2)));
    crop.y = Math.max(0, Math.min(height-crop.height, Math.floor((top+bottom-crop.height)/2)));
    const render = (source, isMask) => {
        const canvas = document.createElement('canvas'); canvas.width = modelWidth; canvas.height = modelHeight;
        const ctx = canvas.getContext('2d');
        if (isMask) {ctx.fillStyle='black';ctx.fillRect(0,0,modelWidth,modelHeight);ctx.filter='grayscale(1) brightness(10000)';}
        ctx.drawImage(source,crop.x,crop.y,crop.width,crop.height,0,0,modelWidth,modelHeight);
        return canvas.toDataURL();
    };
    return {crop, width:modelWidth, height:modelHeight, image:render(image,false), mask:render(mask,true)};
}
