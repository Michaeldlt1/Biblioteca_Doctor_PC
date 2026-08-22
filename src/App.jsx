import { useState } from 'react'
import './App.css'
import emptyLibraryImage from './assets/hero.png'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000'

const fileTypeOptions = [
  { value: 'fotografias-img', label: 'Fotografías', group: 'image', accept: 'image/*' },
  { value: 'diseños publicados', label: 'Diseños publicados', group: 'image', accept: 'image/*' },
  { value: 'imagenes', label: 'Imágenes', group: 'image', accept: 'image/*' },
  { value: 'documentos', label: 'Documentos', group: 'document', accept: '.doc,.docx,.odt,.txt,.rtf' },
  { value: 'archivospdf', label: 'Archivos PDF', group: 'document', accept: 'application/pdf,.pdf' },
  { value: 'audios', label: 'Audios', group: 'audio', accept: 'audio/*' },
  { value: 'videos', label: 'Videos', group: 'video', accept: 'video/*' },
  { value: 'material publicitario', label: 'Material publicitario', group: 'image', accept: 'image/*' },
  { value: 'logos', label: 'Logos', group: 'image', accept: 'image/*' },
  { value: 'banners', label: 'Banners', group: 'image', accept: 'image/*' },
  { value: 'catalogos', label: 'Catálogos', group: 'document', accept: 'image/*,application/pdf,.pdf' },
  { value: 'presentaciones', label: 'Presentaciones', group: 'document', accept: '.ppt,.pptx,.odp' },
]

const getFileTypeOption = (value) => fileTypeOptions.find((option) => option.value === value)

const normalizeTags = (value) => {
  if (Array.isArray(value)) {
    return value
      .flatMap((tag) => typeof tag === 'string' ? tag : [])
      .map((tag) => tag.trim())
      .filter(Boolean)
  }
  if (typeof value !== 'string' || !value.trim()) return []

  try {
    const parsedValue = JSON.parse(value)
    if (Array.isArray(parsedValue)) return normalizeTags(parsedValue)
  } catch {
    return value
      .replace(/^\{/, '')
      .replace(/\}$/, '')
      .split(',')
      .map((tag) => tag.trim().replace(/^"|"$/g, '').replace(/\\"/g, '"'))
      .filter(Boolean)
  }

  return []
}

const isAllowedFile = (file, fileType) => {
  const option = getFileTypeOption(fileType)
  if (!option) return false
  if (option.group === 'image') return file.type.startsWith('image/')
  if (option.group === 'video') return file.type.startsWith('video/')
  if (option.group === 'audio') return file.type.startsWith('audio/')
  if (fileType === 'archivospdf') return file.type === 'application/pdf'
  if (fileType === 'presentaciones') {
    return [
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.oasis.opendocument.presentation',
    ].includes(file.type)
  }
  if (fileType === 'catalogos') {
    return file.type.startsWith('image/') || file.type === 'application/pdf'
  }
  return [
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.oasis.opendocument.text',
    'text/plain',
    'text/rtf',
  ].includes(file.type)
}

const initialForm = {
  username: '',
  email: '',
  password: '',
}

function App() {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState(initialForm)
  const [message, setMessage] = useState({ type: '', text: '' })
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [activeUser, setActiveUser] = useState(null)
  const [folders, setFolders] = useState([])
  const [selectedFolder, setSelectedFolder] = useState('General')
  const [folderName, setFolderName] = useState('')
  const [libraryItems, setLibraryItems] = useState([])
  const [dateFilter, setDateFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [tagFilter, setTagFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [sortOrder, setSortOrder] = useState('desc')
  const [editingFileId, setEditingFileId] = useState(null)
  const [isAddFormOpen, setIsAddFormOpen] = useState(false)
  const [isFilterBarOpen, setIsFilterBarOpen] = useState(false)
  const [isFileDragActive, setIsFileDragActive] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [uploadForm, setUploadForm] = useState({
    title: '',
    description: '',
    type: 'fotografias-img',
    folder: 'General',
    file: null,
    preview: '',
    tags: [],
    tagInput: '',
  })

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
    setMessage({ type: '', text: '' })
  }

  const resetForm = () => {
    setForm(initialForm)
  }

  const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  const getErrorMessage = async (response, fallback) => {
    const data = await response.json().catch(() => ({}))
    return data.error || fallback
  }

  const loadLibrary = async (userId) => {
    const headers = { 'x-user-id': String(userId) }
    const [foldersResponse, libraryResponse] = await Promise.all([
      fetch(`${API_BASE}/api/folders`, { headers }),
      fetch(`${API_BASE}/api/library`, { headers }),
    ])

    if (!foldersResponse.ok || !libraryResponse.ok) {
      throw new Error('No se pudo cargar la biblioteca.')
    }

    const foldersData = await foldersResponse.json()
    const libraryData = await libraryResponse.json()
    const loadedFolders = foldersData.folders || []
    const loadedItems = (libraryData.files || []).map((item) => ({
      id: item.file_id,
      title: item.title,
      description: item.description,
      type: item.file_type,
      folder: item.folder_name,
      fileName: item.file_name,
      date: item.file_date || item.created_at,
      createdAt: item.created_at || item.file_date,
      tags: normalizeTags(item.tags ?? item.file_tags),
      mimeType: item.mime_type,
      url: item.file_url.startsWith('http') ? item.file_url : `${API_BASE}${item.file_url}`,
    }))

    setFolders(loadedFolders)
    setLibraryItems(loadedItems)
    setSelectedFolder(loadedFolders[0]?.name || 'General')
    setDateFilter('all')
    setCategoryFilter('all')
    setTagFilter('all')
    setSearchTerm('')
    setEditingFileId(null)
    setIsAddFormOpen(false)
    setUploadForm((prev) => ({
      ...prev,
      folder: loadedFolders[0]?.name || 'General',
    }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setIsLoading(true)
    setMessage({ type: '', text: '' })

    const email = form.email.trim().toLowerCase()
    const username = form.username.trim()
    const password = form.password

    if (mode === 'register') {
      if (!username || !email || !password) {
        setMessage({ type: 'error', text: 'Todos los campos son obligatorios.' })
        setIsLoading(false)
        return
      }

      if (username.length < 3) {
        setMessage({ type: 'error', text: 'El nombre de usuario debe tener al menos 3 caracteres.' })
        setIsLoading(false)
        return
      }

      if (!isValidEmail(email)) {
        setMessage({ type: 'error', text: 'El formato del email no es válido.' })
        setIsLoading(false)
        return
      }

      if (password.length < 8) {
        setMessage({ type: 'error', text: 'La contraseña debe tener al menos 8 caracteres.' })
        setIsLoading(false)
        return
      }

      try {
        const response = await fetch(`${API_BASE}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, email, password }),
        })

        if (!response.ok) {
          throw new Error(await getErrorMessage(response, 'No se pudo crear la cuenta.'))
        }

        resetForm()
        setMode('login')
        setMessage({ type: 'success', text: 'Cuenta creada. Ahora inicia sesión.' })
      } catch (error) {
        setMessage({ type: 'error', text: error.message || 'No se pudo conectar con el servidor.' })
      } finally {
        setIsLoading(false)
      }
      return
    }

    if (!email || !password) {
      setMessage({ type: 'error', text: 'Email y password son obligatorios.' })
      setIsLoading(false)
      return
    }

    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Credenciales inválidas.'))
      }

      const data = await response.json()
      const user = data.user
      await loadLibrary(user.user_id)
      setActiveUser({ id: user.user_id, username: user.user_username, email: user.user_email })
      setIsLoggedIn(true)
      setMessage({ type: 'success', text: 'Inicio de sesión correcto.' })
      resetForm()
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'No se pudo conectar con el servidor.' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleForgotPassword = () => {
    setMessage({ type: 'success', text: 'Revisa tu correo para restablecer la contraseña.' })
  }

  const handleLogout = () => {
    setIsLoggedIn(false)
    setActiveUser(null)
    setMessage({ type: '', text: '' })
    setMode('login')
  }

  const handleFolderCreate = async () => {
    const trimmed = folderName.trim()

    if (!trimmed) {
      setMessage({ type: 'error', text: 'El nombre de la carpeta es requerido.' })
      return
    }

    try {
      const response = await fetch(`${API_BASE}/api/folders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': String(activeUser.id),
        },
        body: JSON.stringify({ name: trimmed }),
      })

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'No se pudo crear la carpeta.'))
      }

      const data = await response.json()
      const newFolder = {
        id: data.folder.folder_id,
        name: data.folder.folder_name,
        created_at: data.folder.folder_created_at,
        file_count: 0,
      }
      setFolders((prev) => [...prev, newFolder])
      setSelectedFolder(newFolder.name)
      setUploadForm((prev) => ({ ...prev, folder: newFolder.name }))
      setFolderName('')
      setMessage({ type: 'success', text: 'Carpeta creada correctamente.' })
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'No se pudo crear la carpeta.' })
    }
  }

  const handleLibraryChange = (event) => {
    const { name, value } = event.target
    setUploadForm((prev) => ({
      ...prev,
      [name]: value,
      ...(name === 'type' ? { file: null, preview: '' } : {}),
    }))
  }

  const handleTagInputKeyDown = (event) => {
    if (!['Enter', ','].includes(event.key)) return
    event.preventDefault()
    const nextTag = uploadForm.tagInput.trim().replace(/^#+/, '')
    if (!nextTag || uploadForm.tags.includes(nextTag)) return
    setUploadForm((prev) => ({
      ...prev,
      tags: [...prev.tags, nextTag],
      tagInput: '',
    }))
  }

  const removeUploadTag = (tag) => {
    setUploadForm((prev) => ({
      ...prev,
      tags: prev.tags.filter((currentTag) => currentTag !== tag),
    }))
  }

  const processSelectedFile = (file, inputElement) => {

    if (!file) {
      setUploadForm((prev) => ({ ...prev, file: null, preview: '' }))
      return
    }

    if (!isAllowedFile(file, uploadForm.type)) {
      if (inputElement) inputElement.value = ''
      setUploadForm((prev) => ({ ...prev, file: null, preview: '' }))
      setMessage({ type: 'error', text: 'El archivo no coincide con la categoría seleccionada.' })
      return
    }

    const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : ''

    setUploadForm((prev) => ({
      ...prev,
      file,
      preview,
      folder: prev.folder || selectedFolder,
    }))
  }

  const handleFileUpload = (event) => {
    processSelectedFile(event.target.files[0], event.target)
  }

  const handleFileDrop = (event) => {
    event.preventDefault()
    setIsFileDragActive(false)
    processSelectedFile(event.dataTransfer.files[0])
  }

  const handleFileDragOver = (event) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setIsFileDragActive(true)
  }

  const handleFileDragLeave = (event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setIsFileDragActive(false)
    }
  }

  const handleLibrarySubmit = async (event) => {
    event.preventDefault()
    const wasEditing = Boolean(editingFileId)

    if (!uploadForm.title.trim() || (!editingFileId && !uploadForm.file)) {
      setMessage({ type: 'error', text: editingFileId
        ? 'Debes completar el título.'
        : 'Debes completar el título y seleccionar un archivo.' })
      return
    }

    if (uploadForm.file && !isAllowedFile(uploadForm.file, uploadForm.type)) {
      setMessage({ type: 'error', text: 'El archivo no coincide con la categoría seleccionada.' })
      return
    }

    const data = new FormData()
    data.append('title', uploadForm.title.trim())
    data.append('description', uploadForm.description.trim())
    data.append('fileType', uploadForm.type)
    data.append('folderName', uploadForm.folder || selectedFolder)
    data.append('tags', JSON.stringify(uploadForm.tags))
    if (uploadForm.file) data.append('file', uploadForm.file)

    try {
      const response = await fetch(
        editingFileId ? `${API_BASE}/api/library/${editingFileId}` : `${API_BASE}/api/library`,
        {
        method: editingFileId ? 'PATCH' : 'POST',
        headers: { 'x-user-id': String(activeUser.id) },
          body: data,
        },
      )

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'No se pudo guardar el archivo.'))
      }

      await loadLibrary(activeUser.id)
      setUploadForm({
        title: '',
        description: '',
        type: 'fotografias-img',
        folder: selectedFolder,
        file: null,
        preview: '',
        tags: [],
        tagInput: '',
      })
      setEditingFileId(null)
      setIsAddFormOpen(false)
      setMessage({ type: 'success', text: wasEditing
        ? 'Archivo modificado correctamente.'
        : 'Archivo guardado en la biblioteca.' })
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'No se pudo guardar el archivo.' })
    }
  }

  const handleEditFile = (item) => {
    setEditingFileId(item.id)
    setIsAddFormOpen(false)
    setUploadForm((prev) => ({
      ...prev,
      title: item.title,
      description: item.description || '',
      type: item.type,
      folder: item.folder,
      file: null,
      preview: '',
      tags: [...(item.tags || [])],
      tagInput: '',
    }))
    setMessage({ type: 'success', text: 'Editando archivo. Puedes agregar o quitar etiquetas.' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const cancelEditFile = () => {
    setEditingFileId(null)
    setUploadForm((prev) => ({
      ...prev,
      title: '',
      description: '',
      type: 'fotografias-img',
      folder: selectedFolder,
      file: null,
      preview: '',
      tags: [],
      tagInput: '',
    }))
    setMessage({ type: '', text: '' })
  }

  const handleDeleteFile = async (fileId) => {
    if (!window.confirm('¿Deseas eliminar este archivo?')) return

    try {
      const response = await fetch(`${API_BASE}/api/library/${fileId}`, {
        method: 'DELETE',
        headers: { 'x-user-id': String(activeUser.id) },
      })

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'No se pudo eliminar el archivo.'))
      }

      setLibraryItems((prev) => prev.filter((item) => item.id !== fileId))
      setMessage({ type: 'success', text: 'Archivo eliminado correctamente.' })
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'No se pudo eliminar el archivo.' })
    }
  }

  const formatDate = (value) => {
    if (!value) return 'Sin fecha'
    const date = value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value)
    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date)
  }

  const formatDateTime = (value) => {
    if (!value) return 'Sin fecha'
    return new Intl.DateTimeFormat('es-ES', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value))
  }

  const addSearchSuggestion = (suggestion) => {
    setSearchTerm(suggestion)
  }

  const folderItems = libraryItems.filter((item) => item.folder === selectedFolder)
  const availableDates = [...new Set(folderItems.map((item) => item.date).filter(Boolean))].sort()
  const availableCategories = [...new Set(folderItems.map((item) => item.type).filter(Boolean))]
  const availableTags = [...new Set(folderItems.flatMap((item) => item.tags || []))].sort()
  const normalizedSearchTerm = searchTerm.trim().toLowerCase()
  const searchSuggestions = normalizedSearchTerm
    ? [...new Set(folderItems
      .flatMap((item) => [item.title, item.fileName])
      .filter((value) => value?.toLowerCase().includes(normalizedSearchTerm)))]
    : []
  const visibleItems = folderItems
    .filter((item) => dateFilter === 'all' || item.date?.slice(0, 10) === dateFilter)
    .filter((item) => categoryFilter === 'all' || item.type === categoryFilter)
    .filter((item) => tagFilter === 'all' || item.tags?.includes(tagFilter))
    .filter((item) => !normalizedSearchTerm
      || item.title.toLowerCase().includes(normalizedSearchTerm)
      || item.fileName.toLowerCase().includes(normalizedSearchTerm))
    .sort((firstItem, secondItem) => {
      const firstDate = new Date(firstItem.createdAt || firstItem.date || 0).getTime()
      const secondDate = new Date(secondItem.createdAt || secondItem.date || 0).getTime()
      return sortOrder === 'desc' ? secondDate - firstDate : firstDate - secondDate
    })

  return (
    <div className="app-root">
      {!isLoggedIn ? (
        <main className="auth-shell">
          <section className="auth-card">
            <div className="auth-header">
              <div className="auth-toggle" role="tablist" aria-label="Autenticación">
                <button
                  type="button"
                  className={mode === 'login' ? 'tab active' : 'tab'}
                  onClick={() => setMode('login')}
                >
                  Iniciar sesión
                </button>
                <button
                  type="button"
                  className={mode === 'register' ? 'tab active' : 'tab'}
                  onClick={() => setMode('register')}
                >
                  Registrarse
                </button>
              </div>
            </div>

            <div className="auth-body">
              <h1>{mode === 'login' ? '¡Hola de nuevo!' : 'Crear cuenta'}</h1>
              <p className="subtitle">
                {mode === 'login'
                  ? 'Ingresa tus datos para continuar'
                  : 'Completa la información para registrarte'}
              </p>

              <form onSubmit={handleSubmit} className="auth-form">
                {mode === 'register' && (
                  <label className="field">
                    <span>Usuario</span>
                    <input
                      type="text"
                      name="username"
                      value={form.username}
                      onChange={handleChange}
                      placeholder="Tu nombre de usuario"
                    />
                  </label>
                )}

                <label className="field">
                  <span>Email</span>
                  <input
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="usuario@correo.com"
                  />
                </label>

                <label className="field">
                  <span>Contraseña</span>
                  <input
                    type="password"
                    name="password"
                    value={form.password}
                    onChange={handleChange}
                    placeholder="••••••••"
                  />
                </label>

                {mode === 'login' && (
                  <button type="button" className="link-button" onClick={handleForgotPassword}>
                    ¿Olvidaste tu contraseña?
                  </button>
                )}

                <button type="submit" className="primary-button auth-submit-button" disabled={isLoading}>
                  {isLoading
                    ? 'Procesando...'
                    : mode === 'login'
                      ? 'Iniciar sesión'
                      : 'Registrarse'}
                </button>
              </form>

              {message.text && (
                <div className={message.type === 'error' ? 'alert error' : 'alert success'}>
                  {message.text}
                </div>
              )}
            </div>
          </section>
        </main>
      ) : (
        <main className="library-shell">
          <header className="topbar">
            <div className="topbar-brand">
              <img
                className="topbar-logo"
                src="/WhatsApp%20Image%202026-08-20%20at%2022.27.31.jpeg"
                alt="Doctor PC Laptop"
              />
              <div>
              <p className="eyebrow">Biblioteca</p>
              <h2>Mi colección digital</h2>
              </div>
            </div>
            <div className="topbar-actions">
              <span className="user-badge">{activeUser?.username}</span>
              <button type="button" className="logout-button" onClick={handleLogout}>
                Log out
              </button>
            </div>
          </header>

          <div className="library-layout">
            <aside className="sidebar">
              <div className="sidebar-header">
                <div className="folder-heading">
                  <span className="folder-icon" aria-hidden="true" />
                  <div>
                    <h3>Carpetas</h3>
                    <span>{folders.length} organizadas</span>
                  </div>
                </div>
              </div>

              <div className="folder-list">
                {folders.map((folder) => (
                  <button
                    key={folder.id}
                    type="button"
                    className={selectedFolder === folder.name ? 'folder-item active' : 'folder-item'}
                    onClick={() => {
                      setSelectedFolder(folder.name)
                      setDateFilter('all')
                      setCategoryFilter('all')
                      setTagFilter('all')
                      setSearchTerm('')
                      setUploadForm((prev) => ({ ...prev, folder: folder.name }))
                    }}
                  >
                    {folder.name}
                    <small>{folder.file_count ?? 0} {folder.file_count === 1 ? 'archivo' : 'archivos'} · {formatDate(folder.created_at)}</small>
                  </button>
                ))}
              </div>

              <div className="folder-form">
                <input
                  type="text"
                  value={folderName}
                  onChange={(event) => setFolderName(event.target.value)}
                  placeholder="Nueva carpeta"
                />
                <button type="button" className="folder-add-button" onClick={handleFolderCreate}>
                  Agregar
                </button>
              </div>
            </aside>

            <section className={editingFileId ? 'content-panel editing-mode' : 'content-panel'}>
              <div className="library-actions">
                <button
                  type="button"
                  className="library-action-button primary-action"
                  onClick={() => setIsAddFormOpen((isOpen) => !isOpen)}
                >
                  {isAddFormOpen ? 'Cerrar agregar archivo' : 'Agregar archivo'}
                </button>
                <button
                  type="button"
                  className="library-action-button"
                  onClick={() => setIsFilterBarOpen((isOpen) => !isOpen)}
                >
                  {isFilterBarOpen ? 'Ocultar filtros' : 'Organizar archivos'}
                </button>
              </div>

              {isAddFormOpen && !editingFileId && (
              <form className="upload-form" onSubmit={handleLibrarySubmit} aria-label="Guardar archivo">
                <div className="form-row">
                  <label className="field compact">
                    <span>Título</span>
                    <input
                      type="text"
                      name="title"
                      value={uploadForm.title}
                      onChange={handleLibraryChange}
                      placeholder="Ej. Proyecto final"
                    />
                  </label>

                  <label className="field compact">
                    <span>Tipo</span>
                    <select name="type" value={uploadForm.type} onChange={handleLibraryChange}>
                      {fileTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="field">
                  <span>Descripción</span>
                  <textarea
                    name="description"
                    value={uploadForm.description}
                    onChange={handleLibraryChange}
                    placeholder="Describe el archivo..."
                    rows="3"
                  />
                </label>

                <label className="field">
                  <span>Etiquetas</span>
                  <input
                    type="text"
                    name="tagInput"
                    value={uploadForm.tagInput}
                    onChange={handleLibraryChange}
                    onKeyDown={handleTagInputKeyDown}
                    placeholder="Escribe una etiqueta y presiona Enter"
                  />
                  {uploadForm.tags.length > 0 && (
                    <div className="tag-list">
                      {uploadForm.tags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          className="tag-chip"
                          onClick={() => removeUploadTag(tag)}
                          title={`Quitar ${tag}`}
                        >
                          {tag} ×
                        </button>
                      ))}
                    </div>
                  )}
                </label>

                <div className="form-row">
                  <label className="field compact">
                    <span>Carpeta</span>
                    <select
                      name="folder"
                      value={uploadForm.folder}
                      onChange={handleLibraryChange}
                    >
                      {folders.map((folder) => (
                        <option key={folder.id} value={folder.name}>
                          {folder.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label
                    className={`field compact upload-box ${isFileDragActive ? 'drag-active' : ''}`}
                    onDragOver={handleFileDragOver}
                    onDragLeave={handleFileDragLeave}
                    onDrop={handleFileDrop}
                  >
                    <span>Archivo</span>
                    <small>Arrastra el documento aquí o selecciónalo</small>
                    <input
                      type="file"
                      accept={getFileTypeOption(uploadForm.type)?.accept}
                      onChange={handleFileUpload}
                    />
                  </label>
                </div>

                {uploadForm.preview && (
                  <div className="preview-box">
                    <img src={uploadForm.preview} alt="Vista previa" />
                  </div>
                )}

                <button type="submit" className="primary-button wide-button">
                  Guardar archivo
                </button>
              </form>
              )}

              {editingFileId && (
                <form className="upload-form edit-modal-form" onSubmit={handleLibrarySubmit} aria-label="Modificar archivo">
                  <div className="edit-modal-heading">
                    <span className="filter-kicker">Edición</span>
                    <h3>Modificar archivo</h3>
                    <p>Actualiza sus datos, etiquetas o reemplaza el archivo.</p>
                  </div>

                  <div className="form-row">
                    <label className="field compact">
                      <span>Título</span>
                      <input type="text" name="title" value={uploadForm.title} onChange={handleLibraryChange} />
                    </label>
                    <label className="field compact">
                      <span>Tipo</span>
                      <select name="type" value={uploadForm.type} onChange={handleLibraryChange}>
                        {fileTypeOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label className="field">
                    <span>Descripción</span>
                    <textarea name="description" value={uploadForm.description} onChange={handleLibraryChange} rows="3" />
                  </label>

                  <label className="field">
                    <span>Etiquetas</span>
                    <input
                      type="text"
                      name="tagInput"
                      value={uploadForm.tagInput}
                      onChange={handleLibraryChange}
                      onKeyDown={handleTagInputKeyDown}
                      placeholder="Escribe una etiqueta y presiona Enter"
                    />
                    {uploadForm.tags.length > 0 && (
                      <div className="tag-list">
                        {uploadForm.tags.map((tag) => (
                          <button key={tag} type="button" className="tag-chip" onClick={() => removeUploadTag(tag)}>
                            {tag} ×
                          </button>
                        ))}
                      </div>
                    )}
                  </label>

                  <div className="form-row">
                    <label className="field compact">
                      <span>Carpeta</span>
                      <select name="folder" value={uploadForm.folder} onChange={handleLibraryChange}>
                        {folders.map((folder) => <option key={folder.id} value={folder.name}>{folder.name}</option>)}
                      </select>
                    </label>
                    <label
                      className={`field compact upload-box ${isFileDragActive ? 'drag-active' : ''}`}
                      onDragOver={handleFileDragOver}
                      onDragLeave={handleFileDragLeave}
                      onDrop={handleFileDrop}
                    >
                      <span>Reemplazar archivo (opcional)</span>
                      <small>Arrastra el documento aquí o selecciónalo</small>
                      <input type="file" accept={getFileTypeOption(uploadForm.type)?.accept} onChange={handleFileUpload} />
                    </label>
                  </div>

                  {uploadForm.preview && <div className="preview-box"><img src={uploadForm.preview} alt="Vista previa" /></div>}
                  <button type="submit" className="primary-button wide-button">Guardar cambios</button>
                  <button type="button" className="cancel-edit-button" onClick={cancelEditFile}>Cancelar modificación</button>
                </form>
              )}

              {message.text && (
                <div className={message.type === 'error' ? 'alert error' : 'alert success'}>
                  {message.text}
                </div>
              )}

              {isFilterBarOpen && <section className="filter-panel" aria-label="Filtros de archivos">
                <div className="filter-panel-header">
                  <div>
                    <span className="filter-kicker">Organizar archivos</span>
                    <h3>Filtros de la carpeta</h3>
                  </div>
                  <button
                    type="button"
                    className="clear-filters-button"
                    onClick={() => {
                      setSearchTerm('')
                      setDateFilter('all')
                      setCategoryFilter('all')
                      setTagFilter('all')
                      setSortOrder('desc')
                    }}
                  >
                    Limpiar filtros
                  </button>
                </div>

                <div className="search-control">
                  <label className="field">
                    <span>Buscar por nombre</span>
                    <input
                      type="search"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      placeholder="Escribe un nombre..."
                    />
                  </label>
                  {searchSuggestions.length > 0 && (
                    <div className="search-suggestions">
                      {searchSuggestions.slice(0, 5).map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => addSearchSuggestion(suggestion)}
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="date-controls">
                <label className="field compact">
                  <span>Filtrar por fecha</span>
                  <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value)}>
                    <option value="all">Todas las fechas</option>
                    {availableDates.map((date) => (
                      <option key={date} value={date.slice(0, 10)}>
                        {formatDate(date)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field compact">
                  <span>Filtrar por categoría</span>
                  <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                    <option value="all">Todas las categorías</option>
                    {availableCategories.map((category) => (
                      <option key={category} value={category}>
                        {getFileTypeOption(category)?.label || category}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field compact">
                  <span>Filtrar por etiqueta</span>
                  <select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}>
                    <option value="all">Todas las etiquetas</option>
                    {availableTags.map((tag) => (
                      <option key={tag} value={tag}>{tag}</option>
                    ))}
                  </select>
                </label>

                <label className="field compact">
                  <span>Ordenar</span>
                  <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}>
                    <option value="desc">Más recientes primero</option>
                    <option value="asc">Más antiguos primero</option>
                  </select>
                </label>
                </div>
              </section>}

              <div className="library-grid">
                {visibleItems.length === 0 ? (
                  folderItems.length === 0 ? (
                    <div className="empty-state">
                      <img src={emptyLibraryImage} alt="Biblioteca vacía" />
                      <strong>Ningún archivo por ahora</strong>
                      <span>Agrega tu primer archivo para verlo aquí.</span>
                    </div>
                  ) : (
                    <div className="empty-state">
                      <strong>No hay coincidencias</strong>
                      <span>Prueba quitando alguno de los filtros.</span>
                    </div>
                  )
                ) : (
                  visibleItems.map((item) => (
                    <article key={item.id} className="library-card">
                      {getFileTypeOption(item.type)?.group === 'video' || item.type === 'video' ? (
                        <video controls src={item.url} />
                      ) : getFileTypeOption(item.type)?.group === 'image' || item.type === 'image' ? (
                        <img src={item.url} alt={item.title} />
                      ) : (
                        <a className="file-download" href={item.url} target="_blank" rel="noreferrer">
                          Abrir archivo
                        </a>
                      )}

                      <div className="card-body">
                        <div className="card-meta">
                          <span>{item.folder}</span>
                          <span>{getFileTypeOption(item.type)?.label || item.type}</span>
                        </div>
                        <div className="card-title-row">
                          <h4>{item.title}</h4>
                          {item.tags?.length > 0 && (
                            <div className="tag-list card-tags" aria-label="Etiquetas">
                              {item.tags.map((tag) => <span key={tag} className="tag-chip">{tag}</span>)}
                            </div>
                          )}
                        </div>
                        <p>{item.description || 'Sin descripción.'}</p>
                        <small>{item.fileName}</small>
                        <small className="item-date">Creado el {formatDateTime(item.createdAt || item.date)}</small>
                        <button
                          type="button"
                          className="edit-button"
                          onClick={() => handleEditFile(item)}
                        >
                          Modificar
                        </button>
                        <button
                          type="button"
                          className="delete-button"
                          onClick={() => handleDeleteFile(item.id)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>
          </div>

          <footer className="library-footer">
            <div>
              <strong>Doctor PC Laptop</strong>
              <span>Tu biblioteca digital, ordenada y accesible.</span>
            </div>
            <nav className="social-links" aria-label="Redes sociales">
              <a href="https://www.facebook.com/" target="_blank" rel="noreferrer" aria-label="Facebook" title="Facebook">f</a>
              <a href="https://t.me/" target="_blank" rel="noreferrer" aria-label="Telegram" title="Telegram">tg</a>
              <a href="https://wa.me/" target="_blank" rel="noreferrer" aria-label="WhatsApp" title="WhatsApp">wa</a>
              <a href="https://www.tiktok.com/" target="_blank" rel="noreferrer" aria-label="TikTok" title="TikTok">t</a>
              <a href="https://www.instagram.com/" target="_blank" rel="noreferrer" aria-label="Instagram" title="Instagram">ig</a>
            </nav>
            <span className="footer-status">Biblioteca activa</span>
          </footer>
        </main>
      )}
    </div>
  )
}

export default App
