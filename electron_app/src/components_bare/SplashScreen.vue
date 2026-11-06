@import '../assets/css/theme.css';
<template>
    <div class="splash_screen">
        <Transition name="fade">
            <picture v-if="show">
                <source :srcset="require('../assets/logo_splash_dark.png')" media="(prefers-color-scheme: dark)">
                <img :src="require('../assets/logo_splash.png')" alt="DiffusionBee Extended" width="60%">
            </picture>
        </Transition>
    </div>
</template>
<script>
export default {
    name: 'SplashScreen',
    props: {},
    components: {},
    mounted() {
        this.show = true;
    },
    data() {
        return {
            show:false
        };
    },
    methods: {

    },
}
</script>
<style>

.fade-enter-active,
.fade-leave-active {
  transition: opacity 2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

</style>
<style scoped>
@import '../assets/css/theme.css';
.splash_screen {
    position: fixed;
    top: 0;
    left: 0;
    height: 100%;
    width: 100%;

    -webkit-user-select: none;
    -webkit-app-region: drag;
}

img {
    position: absolute;
    margin: auto auto auto auto;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
}
</style>