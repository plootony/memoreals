import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue') },
    { path: '/', redirect: '/journal' },
    {
      path: '/journal',
      name: 'journal',
      component: () => import('@/views/JournalView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/finance',
      name: 'finance',
      component: () => import('@/views/FinanceView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/music',
      name: 'music',
      component: () => import('@/views/MusicView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/diet',
      name: 'diet',
      component: () => import('@/views/DietView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/study',
      name: 'study',
      component: () => import('@/views/StudyView.vue'),
      meta: { requiresAuth: true }
    },
  ]
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return '/login'
  }
  if (to.path === '/login' && auth.isAuthenticated) {
    return '/journal'
  }
})

export default router
