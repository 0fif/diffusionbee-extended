const https = require('https');
const yaml = require('js-yaml');

// Source identities for stock conversions that predate catalog metadata.
// These are model cards/repositories, never hand-picked image files.
const sources = {
    'mflux-qwen-image-21-turbo-q4': ['https://github.com/mflux-community/mflux/blob/main/src/mflux/models/qwen21/reference/README.md'],
    'mflux-fibo2-edit-turbo-q4': ['https://github.com/mflux-community/mflux/blob/main/src/mflux/models/fibo2/README.md'],
    'Deliberate_v2': ['https://huggingface.co/XpucT/Deliberate'],
    'Stable Diffusion XL Base 1.0': ['https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0'],
    'JuggernautXL_v7_f8': ['https://civitai.com/models/133005/juggernaut-xl'],
    'bluePencilXL': ['https://huggingface.co/bluepen5805/blue_pencil-XL'],
    'RealVisXL30': ['https://huggingface.co/SG161222/RealVisXL_V3.0'],
    'dynavisionXLAV0610': ['https://civitai.com/models/122606'],
    'FLUX.1-dev': ['https://github.com/black-forest-labs/flux'],
    'Default_SD1.5': ['https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-v1-5'],
    'SD1.5_Inpainting': ['https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-inpainting'],
    'just_control_v11p_sd15_inpaint_fp16': ['https://github.com/lllyasviel/ControlNet-v1-1-nightly#controlnet-11-inpaint', 'https://huggingface.co/lllyasviel/control_v11p_sd15_inpaint'],
    'FLUX.1-schnell': ['https://huggingface.co/black-forest-labs/FLUX.1-schnell', 'https://github.com/black-forest-labs/flux'],
    'mflux-flux2-klein-4b-4bit': ['https://github.com/black-forest-labs/flux2#flux2-klein'],
    'mflux-flux2-klein-9b-4bit': ['https://github.com/black-forest-labs/flux2#flux2-klein'],
};
function requestUncached(url, redirects = 0) {
    return new Promise((resolve, reject) => {
        const target = new URL(url);
        if (target.protocol !== 'https:' || !/^(huggingface\.co|[^/]+\.huggingface\.co|[^/]+\.hf\.co|raw\.githubusercontent\.com|github\.com|civitai\.com|[^/]+\.civitai\.com)$/.test(target.hostname)) return reject(Error('Unsupported preview host'));
        const req = https.get(target, {headers: {'User-Agent':'DiffusionBee-Extended', Accept:'*/*'}}, response => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location && redirects < 5) {
                response.resume();return resolve(requestUncached(new URL(response.headers.location, target).href, redirects + 1));
            }
            if (response.statusCode !== 200) {response.resume();return reject(Error(`Source returned HTTP ${response.statusCode}`));}
            let size = 0;const chunks = [];
            response.on('data', chunk => {size += chunk.length;if (size > 12 * 1024 * 1024) req.destroy(Error('Preview response too large'));else chunks.push(chunk);});
            response.on('end', () => resolve({body:Buffer.concat(chunks), type:response.headers['content-type'] || ''}));
            response.on('error', reject);
        });
        req.setTimeout(10000, () => req.destroy(Error('Preview source timed out')));
        req.on('error', reject);
    });
}
// Share short-lived card/API responses between preview and metadata lookups.
const responses = new Map();
function request(url) {
    const cached = responses.get(url);
    if (cached && Date.now() - cached.time < 300000) return cached.value;
    const value = requestUncached(url);
    responses.set(url,{time:Date.now(),value});
    if(responses.size > 128)responses.delete(responses.keys().next().value);
    value.catch(()=>responses.delete(url));
    return value;
}
function cardLocation(source) {
    const url = new URL(source);const parts = url.pathname.split('/').filter(Boolean);
    if (url.hostname === 'huggingface.co' && parts.length >= 2) {
        const base = `https://huggingface.co/${parts.slice(0,2).join('/')}`;
        return {raw:base+'/raw/main/README.md', base:base+'/resolve/main/'};
    }
    if (url.hostname === 'github.com' && parts.length >= 2) {
        if (parts[2] === 'blob' && parts.length >= 5) {
            const raw = `https://raw.githubusercontent.com/${parts.slice(0,2).join('/')}/${parts.slice(3).join('/')}`;
            return {raw, base:new URL('.', raw).href, section:url.hash.slice(1)};
        }
        const base = `https://raw.githubusercontent.com/${parts.slice(0,2).join('/')}/main/`;
        return {raw:base+'README.md', base, section:url.hash.slice(1)};
    }
    return null;
}
function extractImages(markdown, base, section) {
    if (section) {
        const blocks = markdown.split(/(?=^## )/m);
        markdown = blocks.find(block => block.split('\n')[0].toLowerCase().replace(/[^a-z0-9 -]/g,'').trim().replace(/ +/g,'-') === section) || '';
    }
    // Ignore code samples, badges, diagrams, masks, and benchmark charts.
    markdown = markdown.replace(/```[\s\S]*?```/g, '');
    const images = [...markdown.matchAll(/!\[([^\]]*)\]\(<?([^\s)>]+)>?(?:\s+[^)]*)?\)|<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)];
    return images.map(m => ({label:m[1] || '', path:m[2] || m[3]}))
        .filter(m => !/badge|shield|logo|pareto|benchmark|chart|diagram|inpainting_examples|_mask\b|colab/i.test(m.label+' '+m.path))
        .map(m => new URL(m.path.replace(/&amp;/g,'&'), base).href.replace('/blob/', '/resolve/'))
        .filter(url => /\.(png|jpe?g|webp)(?:[?#]|$)/i.test(url));
}
function createPreviewResolver(fetch = request) {
    const cache = new Map();
    async function resolve(model) {
        let lastError;let readCard = false;
        const image = async (url, source, label) => {
            const response = await fetch(url);
            if (!/^image\/(png|jpeg|webp)/.test(response.type)) throw Error('Source did not return a preview image');
            return {status:'ready', url, source, label, image:`data:${response.type.split(';')[0]};base64,${response.body.toString('base64')}`};
        };
        if (model.img_url) {
            try {return await image(model.img_url, model.source_page_url || (sources[model.id] || [])[0] || model.img_url, 'Catalog preview');} catch(e) {lastError=e;}
        }
        const queue = [...new Set([model.repo && `https://huggingface.co/${model.repo}`,model.source_page_url,...(sources[model.id] || [])].filter(Boolean))];
        const seen = new Set();
        while(queue.length && seen.size < 6) {
            const source = queue.shift();if(seen.has(source))continue;seen.add(source);
            try {
                const civitai = source.match(/^https:\/\/civitai\.com\/models\/(\d+)/);
                if (civitai) {
                    const data = JSON.parse((await fetch(`https://civitai.com/api/v1/models/${civitai[1]}`)).body.toString());
                    const previews = (data.modelVersions || []).flatMap(v => v.images || []).filter(i => i.type !== 'video');
                    readCard = true;
                    for(const preview of previews.slice(0,3)) {try{return await image(preview.url,source,'Source preview');}catch(e){lastError=e;}}
                    continue;
                }
                const location = cardLocation(source);if(!location)continue;
                const markdown = (await fetch(location.raw)).body.toString();readCard = true;
                const urls = extractImages(markdown,location.base,location.section);
                for(const url of urls.slice(0,4)) {try{return await image(url,source,source.includes('github.com/mflux-community/') ? 'MFLUX model example' : source.includes('github.com') ? 'Publisher family examples' : 'Model card example');}catch(e){lastError=e;}}
                const frontmatter = markdown.match(/^---\s*\n([\s\S]*?)\n---/);
                const baseModel = frontmatter && (yaml.load(frontmatter[1]) || {}).base_model;
                for(const repo of (Array.isArray(baseModel) ? baseModel : [baseModel])) if(typeof repo === 'string' && /^[\w.-]+\/[\w.-]+$/.test(repo)) queue.push(`https://huggingface.co/${repo}`);
            } catch(e) {lastError=e;}
        }
        if(lastError) return {status:'error',message:lastError.message};
        return {status:readCard ? 'empty' : 'unknown',message:readCard ? 'No example image found in the source model card.' : 'No model source is linked.'};
    }
    return (model, refresh = false) => {
        const key = JSON.stringify([model.id,model.repo,model.source_page_url,model.img_url]);
        if(refresh)cache.delete(key);
        if(!cache.has(key)) {
            const pending=resolve(model);cache.set(key,pending);
            pending.then(result=>{if(result.status==='error')cache.delete(key);},()=>cache.delete(key));
        }
        return cache.get(key);
    };
}
module.exports={createPreviewResolver,extractImages,cardLocation};

function createMetadataResolver(fetch = request) {
    const cache = new Map();
    return async (model, refresh = false) => {
        const key = JSON.stringify(model);
        if (!refresh && cache.has(key)) return cache.get(key);
        const candidates = [...new Set([model.repo && `https://huggingface.co/${model.repo}`,model.source_page_url,...(sources[model.id] || []),((model.url || '').match(/^https:\/\/huggingface\.co\/[^/]+\/[^/]+/) || [])[0]].filter(Boolean))];
        let error;
        for(const source of candidates) {
            try {
                const hf = source.match(/^https:\/\/huggingface\.co\/([^/]+\/[^/#?]+)/);
                const civitai = source.match(/^https:\/\/civitai\.com\/models\/(\d+)/);
                let result;
                if(hf) {
                    const data=JSON.parse((await fetch(`https://huggingface.co/api/models/${hf[1]}?blobs=true`)).body.toString());
                    result={source:`https://huggingface.co/${hf[1]}`,provider:'Hugging Face',repo:data.id,license:(data.cardData || {}).license,downloads:data.downloads,downloads_label:'Downloads · last month',likes:data.likes,updated:data.lastModified,pipeline:data.pipeline_tag,base_model:(data.cardData || {}).base_model};
                    // Repository totals can include multiple precisions and must not be called download size.
                    const files=data.siblings || [];
                    if(files.length && files.every(f=>Number.isFinite(f.size)))result.repository_bytes=files.reduce((sum,f)=>sum+f.size,0);
                    const filename=model.url && decodeURIComponent(new URL(model.url).pathname.split('/').pop());
                    const file=files.find(f=>f.rfilename===filename);
                    if(file && file.size)result.bytes=file.size;
                    if(typeof result.base_model === 'string' && /^[\w.-]+\/[\w.-]+$/.test(result.base_model)) {
                        try {const base=JSON.parse((await fetch(`https://huggingface.co/api/models/${result.base_model}`)).body.toString());result.base_license=(base.cardData || {}).license;}catch(_) { /* retain the source model link if its API is unavailable */ }
                    }
                } else if(civitai) {
                    const data=JSON.parse((await fetch(`https://civitai.com/api/v1/models/${civitai[1]}`)).body.toString());
                    const versionId=new URL(source).searchParams.get('modelVersionId');
                    const version=(data.modelVersions || []).find(v=>String(v.id)===versionId);
                    const families=[...new Set((data.modelVersions || []).map(v=>v.baseModel).filter(Boolean))];
                    result={architecture:families.length === 1 ? families[0] : undefined,source,provider:'Civitai',repo:data.name,downloads:(data.stats || {}).downloadCount,downloads_label:'Downloads · all versions',likes:(data.stats || {}).thumbsUpCount,likes_label:'Thumbs up',creator:(data.creator || {}).username,license_url:source};
                    if(version){result.architecture=version.baseModel;result.updated=version.updatedAt;}
                } else continue;
                cache.set(key,result);return result;
            }catch(e){error=e;}
        }
        throw error || Error('No repository or catalog source is linked to this model.');
    };
}
module.exports.createMetadataResolver=createMetadataResolver;

function downloadSize(url, redirects = 0) {
    return new Promise((resolve,reject)=>{
        const target=new URL(url);
        const version=target.hostname === 'civitai.com' && target.pathname.match(/^\/api\/download\/models\/(\d+)$/);
        if(version){
            request(`https://civitai.com/api/v1/model-versions/${version[1]}`).then(response=>{
                const data=JSON.parse(response.body.toString());
                const files=(data.files || []).filter(file=>!target.searchParams.get('format') || (file.metadata || {}).format===target.searchParams.get('format'));
                const file=files.find(file=>file.primary) || (files.length===1 ? files[0] : null);
                if(!file || !(file.sizeKB>0))throw Error('Source did not identify the download file size');
                resolve(Math.round(file.sizeKB*1024));
            }).catch(reject);return;
        }
        if(target.protocol !== 'https:' || !/^(models\.diffusionbee\.com|huggingface\.co|[^/]+\.hf\.co|[^/]+\.huggingface\.co)$/.test(target.hostname)) return reject(Error('Unsupported download host'));
        const req=https.request(target,{method:'HEAD',headers:{'User-Agent':'DiffusionBee-Extended'}},response=>{
            response.resume();
            const linked=Number(response.headers['x-linked-size']);
            if(linked>0 && response.statusCode<400)return resolve(linked);
            if(response.statusCode>=300 && response.statusCode<400 && response.headers.location && redirects<5)return resolve(downloadSize(new URL(response.headers.location,target).href,redirects+1));
            const length=Number(response.headers['content-length']);
            if(response.statusCode===200 && length>0 && !/text\/|application\/json/.test(response.headers['content-type'] || ''))return resolve(length);
            reject(Error(`Download size unavailable (HTTP ${response.statusCode})`));
        });
        req.setTimeout(10000,()=>req.destroy(Error('Download size request timed out')));req.on('error',reject);req.end();
    });
}
function createDownloadSizeResolver(head = downloadSize, fetch = request) {
    const cache=new Map();
    return (model,refresh=false)=>{
        const key=JSON.stringify([model.repo,model.revision,model.url]);
        if(refresh)cache.delete(key);
        if(!cache.has(key)){
            const pending=(async()=>{
                if(model.repo && model.engine==='mflux'){
                    const revision=model.revision ? `/revision/${encodeURIComponent(model.revision)}` : '';
                    const data=JSON.parse((await fetch(`https://huggingface.co/api/models/${model.repo}${revision}?blobs=true`)).body.toString());
                    const files=(data.siblings || []).filter(f=>/\.(json|safetensors|jinja|txt|model|ttf|otf)$/.test(f.rfilename)||f.rfilename==='README.md');
                    if(!files.length || files.some(f=>!Number.isFinite(f.size)))throw Error('Source did not return download file sizes');
                    return files.reduce((sum,f)=>sum+f.size,0);
                }
                if(!model.url)throw Error('No download URL is linked');
                return head(model.url);
            })();
            cache.set(key,pending);pending.catch(()=>cache.delete(key));
        }
        return cache.get(key);
    };
}
module.exports.createDownloadSizeResolver=createDownloadSizeResolver;
