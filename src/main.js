if (!Map.prototype.getOrInsertComputed) {
  Map.prototype.getOrInsertComputed = function (key, callbackInsert) {
    if (this.has(key)) return this.get(key)
    const value = callbackInsert(key)
    this.set(key, value)
    return value
  }
}

import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

createApp(App).mount('#app')
