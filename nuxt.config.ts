import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2025-09-14',
  // Game chạy hoàn toàn client-side: three.js cần WebGL, SSR không đem lại gì.
  ssr: false,
  // Nuxt DevTools nạp @vue/devtools-core/kit lúc chạy, khiến Vite phải
  // re-optimize giữa chừng và ép trình duyệt tải lại trang — rất khó chịu khi
  // đang chơi. Bật lại khi cần debug Vue, đừng để bật thường trực.
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      // Khai báo sẵn để Vite pre-bundle ngay lúc khởi động. Nếu để nó tự phát
      // hiện lúc chạy, mỗi lần phát hiện là một lần "new dependencies
      // optimized" kèm full reload — đây là nguyên nhân phổ biến nhất của việc
      // trang tự tải lại ngẫu nhiên khi dev.
      include: ['three', 'three/examples/jsm/loaders/GLTFLoader.js', 'firebase/app', 'firebase/auth', 'firebase/firestore'],
    },
  },
  app: {
    head: {
      title: 'Farm',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, user-scalable=no' },
      ],
    },
  },
  typescript: {
    strict: true,
  },
  // Thiếu biến môi trường Firebase thì game tự chạy ở chế độ localStorage.
  runtimeConfig: {
    public: {
      firebase: {
        apiKey: process.env.NUXT_PUBLIC_FIREBASE_API_KEY || '',
        authDomain: process.env.NUXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
        projectId: process.env.NUXT_PUBLIC_FIREBASE_PROJECT_ID || '',
        storageBucket: process.env.NUXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
        messagingSenderId: process.env.NUXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
        appId: process.env.NUXT_PUBLIC_FIREBASE_APP_ID || '',
      },
    },
  },
})
