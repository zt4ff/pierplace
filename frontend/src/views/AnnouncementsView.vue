<template>
  <div class="announcements-container">
    <div class="announcement-icon" title="Announcements">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
    </div>
    <div class="announcements-header">
      <h2>Live Activities</h2>
      <div class="server-time">{{ serverTime }}</div>
    </div>
    
    <div v-if="loading" class="loading">
      Loading announcements...
    </div>
    
    <div v-else class="announcements-content">
      <div class="section">
        <h3>Active Now</h3>
        <div v-if="activeActivities.length === 0" class="empty">
          No active activities
        </div>
        <div v-else class="activity-list">
          <div v-for="activity in activeActivities" :key="activity.id" class="activity-card active">
            <div class="activity-header">
              <h4>{{ activity.title }}</h4>
              <span class="status-badge status-open">OPEN</span>
            </div>
            <p class="description">{{ activity.description }}</p>
            <div class="timers" v-if="activity.closes_at">
              <div class="timer">
                <span class="label">Closes in:</span>
                <span class="value">{{ formatTimeRemaining(activity.closes_at) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="section">
        <h3>Coming Up</h3>
        <div v-if="upcomingActivities.length === 0" class="empty">
          No upcoming activities
        </div>
        <div v-else class="activity-list">
          <div v-for="activity in upcomingActivities" :key="activity.id" class="activity-card upcoming">
            <div class="activity-header">
              <h4>{{ activity.title }}</h4>
              <span class="status-badge status-scheduled">SCHEDULED</span>
            </div>
            <p class="description">{{ activity.description }}</p>
            <div class="timers" v-if="activity.opens_at">
              <div class="timer">
                <span class="label">Starts in:</span>
                <span class="value">{{ formatTimeRemaining(activity.opens_at) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="section">
        <h3>Timed Activities</h3>
        <div v-if="timedActivities.length === 0" class="empty">
          No timed activities
        </div>
        <div v-else class="activity-list">
          <div v-for="activity in timedActivities" :key="activity.id" class="activity-card timed">
            <div class="activity-header">
              <h4>{{ activity.title }}</h4>
              <span class="status-badge" :class="activity.status === 'closing_soon' ? 'status-warning' : 'status-open'">
                {{ activity.status.toUpperCase() }}
              </span>
            </div>
            <p class="description">{{ activity.description }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '../stores/auth'

export default {
  name: 'AnnouncementsView',
  setup() {
    const serverTime = ref('')
    const loading = ref(true)
    const activeActivities = ref([])
    const upcomingActivities = ref([])
    const timedActivities = ref([])
    const ws = ref(null)
    const authStore = useAuthStore()
    
    const fetchAnnouncements = async () => {
      try {
        const response = await fetch('/api/announcements', {
          headers: {
            'Authorization': `Bearer ${authStore.token}`
          }
        })
        if (response.ok) {
          const data = await response.json()
          activeActivities.value = data.active
          upcomingActivities.value = data.upcoming
          timedActivities.value = data.timed
          serverTime.value = data.server_time
        }
      } catch (error) {
        console.error('Failed to fetch announcements:', error)
      } finally {
        loading.value = false
      }
    }
    
    const connectWebSocket = () => {
      if (!authStore.token) return
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${window.location.host}/ws/announcements?token=${authStore.token}`
      ws.value = new WebSocket(wsUrl)
      ws.value.onmessage = (event) => {
        const data = JSON.parse(event.data)
        if (data.type === 'snapshot') {
          activeActivities.value = data.active
          upcomingActivities.value = data.upcoming
          timedActivities.value = data.timed
          serverTime.value = data.server_time
        }
      }
      ws.value.onclose = () => {
        setTimeout(connectWebSocket, 5000)
      }
    }
    
    const formatTimeRemaining = (futureTime) => {
      const now = new Date()
      const future = new Date(futureTime)
      const diff = future - now
      if (diff <= 0) return 'Now'
      const minutes = Math.floor(diff / 60000)
      const hours = Math.floor(minutes / 60)
      const days = Math.floor(hours / 24)
      if (days > 0) return `${days}d ${hours % 24}h`
      if (hours > 0) return `${hours}h ${minutes % 60}m`
      return `${minutes}m`
    }
    
    onMounted(() => {
      fetchAnnouncements()
      connectWebSocket()
    })
    
    onUnmounted(() => {
      if (ws.value) {
        ws.value.close()
      }
    })
    
    return {
      serverTime,
      loading,
      activeActivities,
      upcomingActivities,
      timedActivities,
      formatTimeRemaining
    }
  }
}
</script>

<style scoped>
.announcement-icon {
  position: fixed;
  top: 16px;
  right: 16px;
  font-size: 24px;
  cursor: pointer;
  z-index: 1000;
}

.announcements-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}
.announcements-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
  padding-bottom: 20px;
  border-bottom: 2px solid #e0e0e0;
}
.server-time {
  font-size: 14px;
  color: #666;
  font-family: monospace;
}
.loading {
  text-align: center;
  padding: 40px;
  color: #666;
}
.section {
  margin-bottom: 30px;
}
.section h3 {
  color: #333;
  margin-bottom: 20px;
  font-size: 20px;
}
.empty {
  text-align: center;
  padding: 30px;
  background: #f5f5f5;
  border-radius: 8px;
  color: #666;
}
.activity-list {
  display: grid;
  gap: 20px;
}
.activity-card {
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  border-left: 4px solid #ddd;
}
.activity-card.active {
  border-left-color: #4caf50;
}
.activity-card.upcoming {
  border-left-color: #2196f3;
}
.activity-card.timed {
  border-left-color: #ff9800;
}
.activity-header {
  display: flex;
  justify-content: space-between;
  align-items: start;
  margin-bottom: 10px;
}
.activity-header h4 {
  margin: 0;
  color: #333;
}
.status-badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: bold;
}
.status-open {
  background: #4caf50;
  color: white;
}
.status-scheduled {
  background: #2196f3;
  color: white;
}
.status-warning {
  background: #ff9800;
  color: white;
}
.description {
  color: #666;
  margin: 10px 0;
  line-height: 1.4;
}
.timers {
  display: flex;
  gap: 20px;
}
.timer {
  display: flex;
  gap: 8px;
}
.timer .label {
  color: #999;
  font-size: 14px;
}
.timer .value {
  font-weight: bold;
  color: #333;
}
@media (max-width: 768px) {
  .announcements-header {
    flex-direction: column;
    gap: 10px;
  }
  .timers {
    flex-direction: column;
    gap: 10px;
  }
}
</style>
