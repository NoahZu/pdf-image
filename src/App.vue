<script setup>
import { ref, shallowRef, computed } from 'vue'
import { loadPdf, renderThumbnail, stitchPages } from './utils/pdf-renderer.js'

const pdfDoc = shallowRef(null)
const fileName = ref('')
const pages = ref([])
const format = ref('png')
const jpegQuality = ref(0.92)
const scale = ref(2)
const generating = ref(false)
const progress = ref(0)
const dragging = ref(false)
const resultUrl = ref(null)
const resultFileName = ref('')

const selectedCount = computed(() => pages.value.filter((p) => p.selected).length)
const hasSelection = computed(() => selectedCount.value > 0)

async function handleFile(file) {
  if (!file || file.type !== 'application/pdf') return
  reset()
  fileName.value = file.name

  const buffer = await file.arrayBuffer()
  pdfDoc.value = await loadPdf(buffer)

  const total = pdfDoc.value.numPages
  pages.value = Array.from({ length: total }, (_, i) => ({
    num: i + 1,
    selected: true,
    thumbnail: null,
    cropPercent: 0,
  }))

  for (let i = 0; i < total; i++) {
    pages.value[i].thumbnail = await renderThumbnail(pdfDoc.value, i + 1)
  }
}

function reset() {
  if (pdfDoc.value) {
    pdfDoc.value.destroy()
  }
  pdfDoc.value = null
  pages.value = []
  fileName.value = ''
  progress.value = 0
  if (resultUrl.value) {
    URL.revokeObjectURL(resultUrl.value)
    resultUrl.value = null
  }
  resultFileName.value = ''
}

function onFileInput(e) {
  const file = e.target.files?.[0]
  if (file) handleFile(file)
}

function onDrop(e) {
  dragging.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) handleFile(file)
}

function togglePage(idx) {
  pages.value[idx].selected = !pages.value[idx].selected
}

function selectAll() {
  pages.value.forEach((p) => (p.selected = true))
}

function deselectAll() {
  pages.value.forEach((p) => (p.selected = false))
}

function invertSelection() {
  pages.value.forEach((p) => (p.selected = !p.selected))
}

function downloadResult() {
  if (!resultUrl.value) return
  const a = document.createElement('a')
  a.href = resultUrl.value
  a.download = resultFileName.value
  a.click()
}

async function generate() {
  if (!pdfDoc.value || !hasSelection.value) return
  generating.value = true
  progress.value = 0

  const selected = pages.value.filter((p) => p.selected)
  const pageNums = selected.map((p) => p.num)
  const cropPercents = selected.map((p) => p.cropPercent)

  try {
    const blob = await stitchPages(
      pdfDoc.value,
      pageNums,
      scale.value,
      format.value,
      jpegQuality.value,
      cropPercents,
      (p) => (progress.value = p)
    )

    if (resultUrl.value) URL.revokeObjectURL(resultUrl.value)
    const ext = format.value === 'png' ? 'png' : 'jpg'
    const baseName = fileName.value.replace(/\.pdf$/i, '')
    resultFileName.value = `${baseName}_拼接.${ext}`
    resultUrl.value = URL.createObjectURL(blob)
  } catch (err) {
    console.error(err)
    alert('生成失败: ' + err.message)
  } finally {
    generating.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-slate-800">
    <!-- Header -->
    <header class="bg-white/80 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-10">
      <div class="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
        <h1 class="text-xl font-bold tracking-tight">
          <span class="text-indigo-600">PDF</span> 转长图
        </h1>
        <button
          v-if="pdfDoc"
          @click="reset"
          class="text-sm text-slate-500 hover:text-red-500 transition-colors cursor-pointer"
        >
          重新选择文件
        </button>
      </div>
    </header>

    <main class="max-w-5xl mx-auto px-4 py-8">
      <!-- Upload Area -->
      <div
        v-if="!pdfDoc"
        @dragover.prevent="dragging = true"
        @dragleave.prevent="dragging = false"
        @drop.prevent="onDrop"
        @click="$refs.fileInput.click()"
        :class="[
          'border-2 border-dashed rounded-2xl p-16 text-center cursor-pointer transition-all duration-200',
          dragging
            ? 'border-indigo-400 bg-indigo-50 scale-[1.01]'
            : 'border-slate-300 hover:border-indigo-300 hover:bg-slate-50',
        ]"
      >
        <div class="flex flex-col items-center gap-4">
          <div class="w-16 h-16 rounded-2xl bg-indigo-100 flex items-center justify-center">
            <svg class="w-8 h-8 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <div>
            <p class="text-lg font-medium text-slate-700">点击或拖拽上传 PDF 文件</p>
            <p class="text-sm text-slate-400 mt-1">所有处理均在浏览器本地完成，文件不会上传到服务器</p>
          </div>
        </div>
        <input ref="fileInput" type="file" accept=".pdf" class="hidden" @change="onFileInput" />
      </div>

      <!-- Pages Preview -->
      <template v-if="pdfDoc">
        <div class="flex items-center justify-between mb-4">
          <p class="text-sm text-slate-500">
            <span class="font-medium text-slate-700">{{ fileName }}</span>
            &mdash; 共 {{ pages.length }} 页，已选 {{ selectedCount }} 页
          </p>
          <div class="flex gap-2">
            <button @click="selectAll" class="text-xs px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer">全选</button>
            <button @click="deselectAll" class="text-xs px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer">全不选</button>
            <button @click="invertSelection" class="text-xs px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer">反选</button>
          </div>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-8">
          <div
            v-for="(page, idx) in pages"
            :key="page.num"
            class="flex flex-col"
          >
            <!-- Thumbnail with crop preview -->
            <div
              @click="togglePage(idx)"
              :class="[
                'relative rounded-xl overflow-hidden border-2 cursor-pointer transition-all duration-150',
                page.selected
                  ? 'border-indigo-500 shadow-md shadow-indigo-100'
                  : 'border-slate-200 opacity-50 hover:opacity-80',
              ]"
            >
              <img
                v-if="page.thumbnail"
                :src="page.thumbnail"
                :alt="'第 ' + page.num + ' 页'"
                class="w-full block"
              />
              <div v-else class="w-full aspect-[3/4] bg-slate-100 animate-pulse" />
              <!-- Crop preview overlay -->
              <div
                v-if="page.cropPercent > 0"
                class="absolute bottom-0 left-0 right-0 bg-red-400/30 border-t-2 border-dashed border-red-400 pointer-events-none"
                :style="{ height: page.cropPercent + '%' }"
              />
              <!-- Page number badge -->
              <span
                :class="[
                  'absolute top-1.5 left-1.5 text-xs font-medium px-2 py-0.5 rounded-md',
                  page.selected ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-500',
                ]"
              >
                {{ page.num }}
              </span>
              <!-- Check mark -->
              <div
                v-if="page.selected"
                class="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center"
              >
                <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
            <!-- Per-page crop slider -->
            <div v-if="page.selected" class="mt-2 px-1" @click.stop>
              <div class="flex items-center gap-1.5">
                <span class="text-[10px] text-slate-400 shrink-0">裁底</span>
                <input
                  v-model.number="page.cropPercent"
                  type="range"
                  min="0"
                  max="80"
                  step="1"
                  class="flex-1 h-1 accent-red-400"
                />
                <span class="text-[10px] text-slate-500 w-8 text-right tabular-nums">{{ page.cropPercent }}%</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Options & Generate -->
        <div class="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div class="flex flex-wrap items-end gap-6">
            <!-- Format -->
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-slate-500 uppercase tracking-wide">输出格式</label>
              <div class="flex rounded-lg overflow-hidden border border-slate-200">
                <button
                  @click="format = 'png'"
                  :class="[
                    'px-4 py-2 text-sm font-medium transition-colors cursor-pointer',
                    format === 'png' ? 'bg-indigo-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
                  ]"
                >
                  PNG
                </button>
                <button
                  @click="format = 'jpeg'"
                  :class="[
                    'px-4 py-2 text-sm font-medium transition-colors cursor-pointer',
                    format === 'jpeg' ? 'bg-indigo-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
                  ]"
                >
                  JPEG
                </button>
              </div>
            </div>

            <!-- JPEG Quality -->
            <div v-if="format === 'jpeg'" class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-slate-500 uppercase tracking-wide">
                质量 {{ Math.round(jpegQuality * 100) }}%
              </label>
              <input
                v-model.number="jpegQuality"
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                class="w-32 accent-indigo-500"
              />
            </div>

            <!-- Scale -->
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-slate-500 uppercase tracking-wide">清晰度</label>
              <select
                v-model.number="scale"
                class="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-indigo-500"
              >
                <option :value="1">标清 (1x)</option>
                <option :value="2">高清 (2x)</option>
                <option :value="3">超清 (3x)</option>
              </select>
            </div>

            <!-- Generate Button -->
            <button
              @click="generate"
              :disabled="!hasSelection || generating"
              :class="[
                'ml-auto px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer',
                hasSelection && !generating
                  ? 'bg-indigo-500 text-white hover:bg-indigo-600 shadow-md shadow-indigo-200 hover:shadow-lg'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed',
              ]"
            >
              <span v-if="generating" class="flex items-center gap-2">
                <svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" class="opacity-25" />
                  <path d="M4 12a8 8 0 018-8" stroke="currentColor" stroke-width="3" stroke-linecap="round" class="opacity-75" />
                </svg>
                生成中 {{ Math.round(progress * 100) }}%
              </span>
              <span v-else>生成长图</span>
            </button>
          </div>

          <!-- Progress Bar -->
          <div v-if="generating" class="mt-4 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              class="h-full bg-indigo-500 rounded-full transition-all duration-300"
              :style="{ width: Math.round(progress * 100) + '%' }"
            />
          </div>
        </div>

        <!-- Result Preview -->
        <div v-if="resultUrl" class="mt-8 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-sm font-semibold text-slate-700">生成结果</h2>
            <div class="flex gap-2">
              <button
                @click="downloadResult"
                class="text-xs px-4 py-2 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 transition-colors cursor-pointer font-medium"
              >
                下载图片
              </button>
            </div>
          </div>
          <p class="text-xs text-slate-400 mb-3">手机用户可长按图片直接保存到相册</p>
          <div class="rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
            <img :src="resultUrl" :alt="resultFileName" class="w-full block" />
          </div>
        </div>
      </template>
    </main>

    <!-- Footer -->
    <footer class="text-center text-xs text-slate-400 py-6">
      所有处理均在浏览器本地完成 · 文件不会上传到任何服务器
    </footer>
  </div>
</template>
