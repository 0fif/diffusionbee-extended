// Composite at the original resolution, preserving every unmasked source pixel.
export async function composite_inpaint(original, mask, generated, crop) {
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
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(selection, 0, 0, base.width, base.height);
    const output = document.createElement('canvas'); output.width = base.width; output.height = base.height;
    output.getContext('2d').drawImage(base, 0, 0);
    output.getContext('2d').drawImage(layer, 0, 0);
    return output.toDataURL();
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
    const side = Math.min(Math.max(width, height), Math.max(512, Math.ceil(Math.max(right-left+1, bottom-top+1)*1.5)));
    const crop = {width: Math.min(side, width), height: Math.min(side, height)};
    crop.x = Math.max(0, Math.min(width-crop.width, Math.floor((left+right-crop.width)/2)));
    crop.y = Math.max(0, Math.min(height-crop.height, Math.floor((top+bottom-crop.height)/2)));
    const render = (source, isMask) => {
        const canvas = document.createElement('canvas'); canvas.width = resolution; canvas.height = resolution;
        const ctx = canvas.getContext('2d');
        if (isMask) {ctx.fillStyle='black';ctx.fillRect(0,0,resolution,resolution);ctx.filter='grayscale(1) brightness(10000)';}
        ctx.drawImage(source,crop.x,crop.y,crop.width,crop.height,0,0,resolution,resolution);
        return canvas.toDataURL();
    };
    return {crop, image:render(image,false), mask:render(mask,true)};
}
