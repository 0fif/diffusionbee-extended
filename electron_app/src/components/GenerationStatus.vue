<template>
    <div v-if="backend && backend.started_at" class="generation-status">
        <div role="status">{{backend.generation_state_msg}}<span v-if="!backend.is_input_avail && backend.step && !backend.is_stopping"> · Step {{backend.step}} of {{backend.steps}}</span></div>
        <div>{{duration(backend.elapsed_seconds)}} {{backend.is_input_avail ? 'total' : 'elapsed'}}<span v-if="!backend.is_input_avail && backend.step_seconds && !backend.is_stopping"> · Last step {{backend.step_seconds.toFixed(1)}} s</span></div>
        <details v-if="backend.diagnostics && backend.is_input_avail">
            <summary>Run details</summary>
            <dl><template v-for="(seconds, phase) in backend.diagnostics.timings"><dt :key="phase+'label'">{{labels[phase] || phase}}</dt><dd :key="phase">{{seconds.toFixed(1)}} s</dd></template>
                <dt>Peak engine memory</dt><dd>{{(backend.diagnostics.peak_memory_bytes / 1073741824).toFixed(2)}} GiB</dd>
                <template v-if="backend.diagnostics.process_peak_bytes"><dt>Peak process memory</dt><dd>{{(backend.diagnostics.process_peak_bytes / 1073741824).toFixed(2)}} GiB</dd></template>
                <template v-if="backend.diagnostics.system_memory_delta"><dt>System swap-outs</dt><dd>{{(backend.diagnostics.system_memory_delta.Swapouts / 1048576).toFixed(1)}} MiB</dd><dt>System compression</dt><dd>{{(backend.diagnostics.system_memory_delta.Compressions / 1048576).toFixed(1)}} MiB</dd></template>
            </dl>
            <p v-if="backend.diagnostics.system_memory_delta">Swap and compression changes cover the whole computer during this run, including other apps. Process and engine memory overlap.</p>
            <p>Measurements for this run and these settings. The first step can include input processing and deferred model loading.</p>
        </details>
    </div>
</template>
<script>
export default {
    props: {backend:Object},
    data: () => ({labels:{startup:'Engine startup',loading:'Model setup',preparing:'Prompt / input preparation',generation:'Generation',decoding:'Image decoding',saving:'Saving',finishing:'Finishing in editor'}}),
    methods: {duration(seconds) {const total=Math.floor(seconds);return total<60 ? total+' s' : Math.floor(total/60)+' min '+total%60+' s';}}
};
</script>
<style scoped>
.generation-status {font-size:13px;line-height:1.5;margin:8px 0;overflow-wrap:anywhere;}
.generation-status details {margin-top:6px;}
.generation-status summary {cursor:pointer;}
.generation-status dl {display:grid;grid-template-columns:1fr auto;gap:3px 12px;margin:8px 0;}
.generation-status dd {margin:0;}
.generation-status p {font-size:12px;margin:4px 0;}
</style>
