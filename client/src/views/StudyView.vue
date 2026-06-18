<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import ImageExt from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import api from '@/api'
import { formatDate } from '@/lib/utils'
import { pickAndUpload } from '@/lib/uploadImage'
import Input from '@/components/ui/Input.vue'
import {
  ChevronRight, ChevronDown, Plus, Trash2, Pencil, Check, X,
  GraduationCap, FileText, FolderPlus, FilePlus,
  Bold, Italic, UnderlineIcon, Strikethrough,
  Heading1, Heading2, Heading3,
  List, ListOrdered, ListChecks,
  Quote, Code, Code2, Link as LinkIcon,
  AlignLeft, AlignCenter, AlignRight,
  Highlighter, ImagePlus, Minus, Save, Loader2
} from 'lucide-vue-next'

interface Chapter { id: string; title: string; content: string; order: number; updatedAt: string }
interface Topic { id: string; title: string; description: string; chapters: Chapter[]; updatedAt: string }

const topics = ref<Topic[]>([])
const expandedTopics = ref<Set<string>>(new Set())
const selectedTopicId = ref<string | null>(null)
const selectedChapter = ref<Chapter | null>(null)
const isDirty = ref(false)
const saving = ref(false)
const imageUploading = ref(false)

// Inline editing state
const editingNode = ref<{ type: 'topic' | 'chapter'; topicId: string; id: string } | null>(null)
const editingTitle = ref('')
const editingInputRef = ref<HTMLInputElement | null>(null)

// New node forms
const newTopicInput = ref(false)
const newTopicTitle = ref('')
const newChapterInputFor = ref<string | null>(null)
const newChapterTitle = ref('')

const editor = useEditor({
  extensions: [
    StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false, underline: false }),
    ImageExt.configure({ allowBase64: false }),
    Placeholder.configure({ placeholder: 'Начните конспектировать...' }),
    Underline,
    Highlight.configure({ multicolor: false }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Link.configure({ openOnClick: false, HTMLAttributes: { class: 'text-primary underline' } }),
    TaskList,
    TaskItem.configure({ nested: true }),
  ],
  editorProps: {
    attributes: { class: 'prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[400px] p-6' }
  },
  onUpdate: () => { isDirty.value = true }
})

const selectedTopic = () => topics.value.find(t => t.id === selectedTopicId.value) || null

async function loadTopics() {
  const res = await api.get('/study/topics')
  topics.value = res.data
}

function toggleExpand(topicId: string) {
  if (expandedTopics.value.has(topicId)) {
    expandedTopics.value.delete(topicId)
  } else {
    expandedTopics.value.add(topicId)
  }
}

function openChapter(topic: Topic, chapter: Chapter) {
  if (isDirty.value) saveChapter()
  selectedTopicId.value = topic.id
  selectedChapter.value = chapter
  editor.value?.commands.setContent(chapter.content || '')
  isDirty.value = false
}

async function saveChapter() {
  const topic = selectedTopic()
  if (!topic || !selectedChapter.value || !isDirty.value) return
  saving.value = true
  try {
    const content = editor.value?.getHTML() || ''
    await api.put(`/study/topics/${topic.id}/chapters/${selectedChapter.value.id}`, { content })
    isDirty.value = false
  } finally {
    saving.value = false
  }
}

let saveTimeout: any
watch(isDirty, (v) => {
  if (v) { clearTimeout(saveTimeout); saveTimeout = setTimeout(saveChapter, 2000) }
})

// --- Topic CRUD ---
async function addTopic() {
  if (!newTopicTitle.value.trim()) return
  const res = await api.post('/study/topics', { title: newTopicTitle.value.trim() })
  newTopicTitle.value = ''; newTopicInput.value = false
  await loadTopics()
  expandedTopics.value.add(res.data.id)
}

async function deleteTopic(topicId: string) {
  await api.delete(`/study/topics/${topicId}`)
  if (selectedTopicId.value === topicId) { selectedTopicId.value = null; selectedChapter.value = null }
  await loadTopics()
}

async function commitRename() {
  if (!editingNode.value || !editingTitle.value.trim()) { editingNode.value = null; return }
  const { type, topicId, id } = editingNode.value
  if (type === 'topic') {
    await api.put(`/study/topics/${id}`, { title: editingTitle.value.trim() })
  } else {
    await api.put(`/study/topics/${topicId}/chapters/${id}`, { title: editingTitle.value.trim() })
  }
  editingNode.value = null
  await loadTopics()
}

function startRename(type: 'topic' | 'chapter', topicId: string, id: string, currentTitle: string) {
  editingNode.value = { type, topicId, id }
  editingTitle.value = currentTitle
  nextTick(() => editingInputRef.value?.focus())
}

// --- Chapter CRUD ---
async function addChapter(topicId: string) {
  if (!newChapterTitle.value.trim()) return
  const res = await api.post(`/study/topics/${topicId}/chapters`, { title: newChapterTitle.value.trim() })
  newChapterTitle.value = ''; newChapterInputFor.value = null
  await loadTopics()
  const topic = topics.value.find(t => t.id === topicId)
  if (topic) openChapter(topic, res.data)
}

async function deleteChapter(topicId: string, chapterId: string) {
  await api.delete(`/study/topics/${topicId}/chapters/${chapterId}`)
  if (selectedChapter.value?.id === chapterId) { selectedChapter.value = null; editor.value?.commands.clearContent() }
  await loadTopics()
}

function startNewTopicInput() {
  newTopicInput.value = true
  nextTick(() => (document.getElementById('new-topic-inp') as HTMLInputElement)?.focus())
}

function startNewChapter(topicId: string) {
  newChapterInputFor.value = topicId
  expandedTopics.value.add(topicId)
  nextTick(() => (document.getElementById(`new-ch-${topicId}`) as HTMLInputElement)?.focus())
}

// --- Editor actions ---
async function insertImage() {
  const url = await pickAndUpload(v => imageUploading.value = v)
  if (url) editor.value?.chain().focus().setImage({ src: url }).run()
}

function setLink() {
  const url = window.prompt('URL ссылки:')
  if (url) editor.value?.chain().focus().setLink({ href: url }).run()
}

onMounted(loadTopics)
</script>

<template>
  <div class="flex h-full -m-4 md:-m-6 overflow-hidden">

    <!-- Tree sidebar: скрыт на мобильном когда открыта глава -->
    <div :class="['md:w-60 md:flex-shrink-0 border-r flex-col bg-card select-none',
      selectedChapter ? 'hidden md:flex' : 'flex w-full']">
      <!-- Header -->
      <div class="h-11 px-3 border-b flex items-center justify-between flex-shrink-0">
        <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Учёба</span>
        <button @click="startNewTopicInput()"
          class="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" title="Новая тема">
          <FolderPlus class="w-3.5 h-3.5" />
        </button>
      </div>

      <!-- Tree -->
      <div class="flex-1 overflow-auto py-1">

        <!-- New topic input (top) -->
        <div v-if="newTopicInput" class="px-2 py-1">
          <div class="flex items-center gap-1 pl-1">
            <GraduationCap class="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <input id="new-topic-inp" v-model="newTopicTitle" placeholder="Название темы"
              class="flex-1 text-sm bg-accent/60 border border-border rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-primary"
              @keyup.enter="addTopic" @keyup.escape="newTopicInput = false; newTopicTitle = ''" />
          </div>
        </div>

        <!-- Topics tree -->
        <div v-for="topic in topics" :key="topic.id">

          <!-- Topic row -->
          <div v-if="editingNode?.type === 'topic' && editingNode.id === topic.id"
            class="flex items-center gap-1 px-2 py-0.5 ml-0.5">
            <ChevronDown class="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <input ref="editingInputRef" v-model="editingTitle"
              class="flex-1 text-sm bg-accent/60 border border-border rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-primary"
              @keyup.enter="commitRename" @keyup.escape="editingNode = null" @blur="commitRename" />
          </div>

          <div v-else
            :class="['group flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-accent/50 transition-colors rounded-sm mx-1',
              selectedTopicId === topic.id && !selectedChapter ? 'bg-accent text-accent-foreground' : '']"
            @click="toggleExpand(topic.id); selectedTopicId = topic.id"
          >
            <button class="flex-shrink-0 p-0.5 text-muted-foreground" @click.stop="toggleExpand(topic.id)">
              <ChevronRight v-if="!expandedTopics.has(topic.id)" class="w-3 h-3 transition-transform" />
              <ChevronDown v-else class="w-3 h-3" />
            </button>
            <GraduationCap class="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
            <span class="flex-1 text-sm truncate">{{ topic.title }}</span>
            <!-- Actions (hover) -->
            <div class="hidden group-hover:flex items-center gap-0.5">
              <button class="p-0.5 rounded hover:bg-accent text-muted-foreground"
                title="Добавить главу" @click.stop="startNewChapter(topic.id)">
                <FilePlus class="w-3 h-3" />
              </button>
              <button class="p-0.5 rounded hover:bg-accent text-muted-foreground"
                title="Переименовать" @click.stop="startRename('topic', topic.id, topic.id, topic.title)">
                <Pencil class="w-3 h-3" />
              </button>
              <button class="p-0.5 rounded hover:bg-accent text-destructive"
                title="Удалить" @click.stop="deleteTopic(topic.id)">
                <Trash2 class="w-3 h-3" />
              </button>
            </div>
          </div>

          <!-- Chapters (expanded) -->
          <div v-if="expandedTopics.has(topic.id)" class="ml-5">

            <div v-for="chapter in topic.chapters" :key="chapter.id">
              <!-- Rename chapter -->
              <div v-if="editingNode?.type === 'chapter' && editingNode.id === chapter.id"
                class="flex items-center gap-1 px-2 py-0.5">
                <FileText class="w-3 h-3 text-muted-foreground flex-shrink-0" />
                <input ref="editingInputRef" v-model="editingTitle"
                  class="flex-1 text-sm bg-accent/60 border border-border rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-primary"
                  @keyup.enter="commitRename" @keyup.escape="editingNode = null" @blur="commitRename" />
              </div>

              <div v-else
                :class="['group flex items-center gap-1 px-2 py-0.5 cursor-pointer rounded-sm mx-1 hover:bg-accent/50 transition-colors',
                  selectedChapter?.id === chapter.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground']"
                @click="openChapter(topic, chapter)"
              >
                <FileText class="w-3 h-3 flex-shrink-0" />
                <span class="flex-1 text-sm truncate py-0.5">{{ chapter.title }}</span>
                <div class="hidden group-hover:flex items-center gap-0.5">
                  <button class="p-0.5 rounded hover:bg-accent"
                    title="Переименовать" @click.stop="startRename('chapter', topic.id, chapter.id, chapter.title)">
                    <Pencil class="w-2.5 h-2.5" />
                  </button>
                  <button class="p-0.5 rounded hover:bg-accent text-destructive"
                    title="Удалить" @click.stop="deleteChapter(topic.id, chapter.id)">
                    <Trash2 class="w-2.5 h-2.5" />
                  </button>
                </div>
              </div>
            </div>

            <!-- New chapter input -->
            <div v-if="newChapterInputFor === topic.id" class="px-2 py-0.5 mx-1">
              <div class="flex items-center gap-1">
                <FileText class="w-3 h-3 text-muted-foreground flex-shrink-0" />
                <input :id="`new-ch-${topic.id}`" v-model="newChapterTitle" placeholder="Название главы"
                  class="flex-1 text-sm bg-accent/60 border border-border rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-primary"
                  @keyup.enter="addChapter(topic.id)"
                  @keyup.escape="newChapterInputFor = null; newChapterTitle = ''"
                  @blur="if(newChapterTitle.trim()) addChapter(topic.id); else newChapterInputFor = null" />
              </div>
            </div>

          </div>
        </div>

        <p v-if="topics.length === 0" class="text-xs text-muted-foreground text-center py-8 px-4">
          Нажмите <span class="font-medium">+</span> чтобы добавить тему
        </p>
      </div>
    </div>

    <!-- Editor area: скрыт на мобильном когда нет главы -->
    <div :class="['flex-col min-w-0 overflow-hidden bg-background',
      selectedChapter ? 'flex flex-1' : 'hidden md:flex md:flex-1']">
      <template v-if="selectedChapter">
        <!-- Toolbar -->
        <div class="border-b px-2 py-1 flex flex-wrap items-center gap-0.5 bg-card flex-shrink-0">
          <button class="md:hidden p-1.5 rounded hover:bg-accent text-muted-foreground mr-1"
            @click="selectedChapter = null; editor?.commands.clearContent()">
            <ChevronRight class="w-4 h-4 rotate-180" />
          </button>
          <button @click="editor?.chain().focus().toggleHeading({ level: 1 }).run()"
            :class="['p-1.5 rounded hover:bg-accent', editor?.isActive('heading', { level: 1 }) ? 'bg-accent' : '']">
            <Heading1 class="w-4 h-4" /></button>
          <button @click="editor?.chain().focus().toggleHeading({ level: 2 }).run()"
            :class="['p-1.5 rounded hover:bg-accent', editor?.isActive('heading', { level: 2 }) ? 'bg-accent' : '']">
            <Heading2 class="w-4 h-4" /></button>
          <button @click="editor?.chain().focus().toggleHeading({ level: 3 }).run()"
            :class="['p-1.5 rounded hover:bg-accent', editor?.isActive('heading', { level: 3 }) ? 'bg-accent' : '']">
            <Heading3 class="w-4 h-4" /></button>
          <div class="w-px h-5 bg-border mx-0.5" />
          <button @click="editor?.chain().focus().toggleBold().run()"
            :class="['p-1.5 rounded hover:bg-accent', editor?.isActive('bold') ? 'bg-accent' : '']">
            <Bold class="w-4 h-4" /></button>
          <button @click="editor?.chain().focus().toggleItalic().run()"
            :class="['p-1.5 rounded hover:bg-accent', editor?.isActive('italic') ? 'bg-accent' : '']">
            <Italic class="w-4 h-4" /></button>
          <button @click="editor?.chain().focus().toggleUnderline().run()"
            :class="['p-1.5 rounded hover:bg-accent', editor?.isActive('underline') ? 'bg-accent' : '']">
            <UnderlineIcon class="w-4 h-4" /></button>
          <button @click="editor?.chain().focus().toggleStrike().run()"
            :class="['p-1.5 rounded hover:bg-accent', editor?.isActive('strike') ? 'bg-accent' : '']">
            <Strikethrough class="w-4 h-4" /></button>
          <button @click="editor?.chain().focus().toggleHighlight().run()"
            :class="['p-1.5 rounded hover:bg-accent', editor?.isActive('highlight') ? 'bg-accent' : '']">
            <Highlighter class="w-4 h-4" /></button>
          <div class="w-px h-5 bg-border mx-0.5" />
          <button @click="editor?.chain().focus().toggleBulletList().run()"
            :class="['p-1.5 rounded hover:bg-accent', editor?.isActive('bulletList') ? 'bg-accent' : '']">
            <List class="w-4 h-4" /></button>
          <button @click="editor?.chain().focus().toggleOrderedList().run()"
            :class="['p-1.5 rounded hover:bg-accent', editor?.isActive('orderedList') ? 'bg-accent' : '']">
            <ListOrdered class="w-4 h-4" /></button>
          <button @click="editor?.chain().focus().toggleTaskList().run()"
            :class="['p-1.5 rounded hover:bg-accent', editor?.isActive('taskList') ? 'bg-accent' : '']">
            <ListChecks class="w-4 h-4" /></button>
          <div class="w-px h-5 bg-border mx-0.5" />
          <button @click="editor?.chain().focus().toggleBlockquote().run()"
            :class="['p-1.5 rounded hover:bg-accent', editor?.isActive('blockquote') ? 'bg-accent' : '']">
            <Quote class="w-4 h-4" /></button>
          <button @click="editor?.chain().focus().toggleCode().run()"
            :class="['p-1.5 rounded hover:bg-accent', editor?.isActive('code') ? 'bg-accent' : '']">
            <Code class="w-4 h-4" /></button>
          <button @click="editor?.chain().focus().toggleCodeBlock().run()"
            :class="['p-1.5 rounded hover:bg-accent', editor?.isActive('codeBlock') ? 'bg-accent' : '']">
            <Code2 class="w-4 h-4" /></button>
          <button @click="editor?.chain().focus().setHorizontalRule().run()"
            class="p-1.5 rounded hover:bg-accent">
            <Minus class="w-4 h-4" /></button>
          <div class="w-px h-5 bg-border mx-0.5" />
          <button @click="editor?.chain().focus().setTextAlign('left').run()"
            :class="['p-1.5 rounded hover:bg-accent', editor?.isActive({ textAlign: 'left' }) ? 'bg-accent' : '']">
            <AlignLeft class="w-4 h-4" /></button>
          <button @click="editor?.chain().focus().setTextAlign('center').run()"
            :class="['p-1.5 rounded hover:bg-accent', editor?.isActive({ textAlign: 'center' }) ? 'bg-accent' : '']">
            <AlignCenter class="w-4 h-4" /></button>
          <button @click="editor?.chain().focus().setTextAlign('right').run()"
            :class="['p-1.5 rounded hover:bg-accent', editor?.isActive({ textAlign: 'right' }) ? 'bg-accent' : '']">
            <AlignRight class="w-4 h-4" /></button>
          <div class="w-px h-5 bg-border mx-0.5" />
          <button @click="setLink" :class="['p-1.5 rounded hover:bg-accent', editor?.isActive('link') ? 'bg-accent' : '']">
            <LinkIcon class="w-4 h-4" /></button>
          <button @click="insertImage" class="p-1.5 rounded hover:bg-accent" :disabled="imageUploading">
            <Loader2 v-if="imageUploading" class="w-4 h-4 animate-spin" />
            <ImagePlus v-else class="w-4 h-4" /></button>

          <div class="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <template v-if="saving"><span>Сохранение...</span></template>
            <template v-else-if="isDirty"><span class="text-orange-500">● Не сохранено</span></template>
            <template v-else><span class="text-green-600 dark:text-green-400">✓ Сохранено</span></template>
          </div>
        </div>

        <!-- Chapter heading -->
        <div class="px-8 pt-6 pb-2 flex-shrink-0">
          <h1 class="text-2xl font-bold">{{ selectedChapter.title }}</h1>
          <p class="text-xs text-muted-foreground mt-1">
            {{ selectedTopic()?.title }} · {{ formatDate(selectedChapter.updatedAt) }}
          </p>
        </div>

        <!-- Editor -->
        <div class="flex-1 overflow-auto">
          <EditorContent :editor="editor" />
        </div>
      </template>

      <!-- Empty state -->
      <div v-else class="flex-1 flex items-center justify-center">
        <div class="text-center text-muted-foreground">
          <GraduationCap class="w-16 h-16 mx-auto mb-4 opacity-15" />
          <p class="font-medium text-base">Откройте главу для редактирования</p>
          <p class="text-sm mt-1 opacity-70">Выберите тему в дереве слева или создайте новую</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.tiptap ul[data-type="taskList"] { list-style: none; padding: 0; }
.tiptap ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 0.5rem; }
.tiptap ul[data-type="taskList"] li input[type="checkbox"] { margin-top: 0.2rem; cursor: pointer; }

.tiptap pre { background: hsl(var(--muted)); padding: 0.75rem 1rem; border-radius: 0.5rem; overflow-x: auto; }
.tiptap pre code { background: none; font-size: 0.875rem; }
.tiptap code { background: hsl(var(--muted)); padding: 0.1rem 0.3rem; border-radius: 0.25rem; font-size: 0.875em; }
.tiptap blockquote { border-left: 3px solid hsl(var(--border)); padding-left: 1rem; color: hsl(var(--muted-foreground)); margin: 0.5rem 0; }
.tiptap mark { background: #fef08a; color: #000; border-radius: 0.15rem; padding: 0 0.1rem; }
.dark .tiptap mark { background: #854d0e; color: #fef9c3; }
.tiptap a { color: hsl(var(--primary)); text-decoration: underline; }
</style>
