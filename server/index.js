import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import { unlink } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { Pool } = pg
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const uploadsDirectory = path.join(__dirname, 'uploads')

const app = express()
const port = Number(process.env.API_PORT || 5000)
const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || 'postgres',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD,
})

const upload = multer({
  dest: uploadsDirectory,
  limits: { fileSize: 100 * 1024 * 1024 },
})

const fileTypeRules = {
  'fotografias-img': ['image/'],
  'diseños publicados': ['image/'],
  imagenes: ['image/'],
  documentos: [
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.oasis.opendocument.text',
    'text/plain',
    'text/rtf',
  ],
  archivospdf: ['application/pdf'],
  audios: ['audio/'],
  videos: ['video/'],
  'material publicitario': ['image/'],
  logos: ['image/'],
  banners: ['image/'],
  catalogos: ['application/pdf', 'image/'],
  presentaciones: [
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.oasis.opendocument.presentation',
  ],
}

const isSupportedFileType = (fileType, mimeType) => {
  const allowedMimeTypes = fileTypeRules[fileType]
  return allowedMimeTypes?.some((allowedMimeType) =>
    allowedMimeType.endsWith('/')
      ? mimeType.startsWith(allowedMimeType)
      : mimeType === allowedMimeType,
  )
}

const removeUploadedFile = async (file) => {
  if (!file?.path) return
  await unlink(file.path).catch((error) => {
    if (error.code !== 'ENOENT') throw error
  })
}

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173' }))
app.use(express.json())
app.use('/uploads', express.static(uploadsDirectory))

const getUserId = (request) => Number(request.header('x-user-id'))

const parseTags = (value) => {
  if (!value) return []
  let parsedTags = []
  try {
    const parsedValue = JSON.parse(value)
    if (Array.isArray(parsedValue)) parsedTags = parsedValue
  } catch {
    parsedTags = value.split(',')
  }
  return [...new Set(
    parsedTags
      .filter((tag) => typeof tag === 'string')
      .map((tag) => tag.trim().replace(/^#+/, ''))
      .filter(Boolean),
  )]
}

app.get('/api/health', async (_request, response) => {
  try {
    await pool.query('SELECT 1')
    response.json({ status: 'ok', database: 'connected' })
  } catch {
    response.status(503).json({ status: 'error', database: 'disconnected' })
  }
})

app.post('/api/auth/register', async (request, response) => {
  const { username, email, password } = request.body

  try {
    const result = await pool.query(
      'SELECT * FROM register_user($1, $2, $3)',
      [username, email, password],
    )
    response.status(201).json({ user: result.rows[0] })
  } catch (error) {
    response.status(400).json({ error: error.message })
  }
})

app.post('/api/auth/login', async (request, response) => {
  const { email, password } = request.body

  try {
    const result = await pool.query(
      'SELECT * FROM login_user($1, $2)',
      [email, password],
    )
    response.json({ user: result.rows[0] })
  } catch {
    response.status(401).json({ error: 'Credenciales inválidas.' })
  }
})

app.get('/api/folders', async (request, response) => {
  const userId = getUserId(request)

  try {
    const result = await pool.query(
      `SELECT
         f.id,
         f.name,
         f.created_at,
         COUNT(lf.id)::int AS file_count
       FROM public.folders AS f
       LEFT JOIN public.library_files AS lf ON lf.folder_id = f.id
       WHERE f.user_id = $1
       GROUP BY f.id, f.name, f.created_at
       ORDER BY f.name`,
      [userId],
    )
    response.json({ folders: result.rows })
  } catch (error) {
    response.status(400).json({ error: error.message })
  }
})

app.post('/api/folders', async (request, response) => {
  const userId = getUserId(request)
  const { name } = request.body

  try {
    const result = await pool.query('SELECT * FROM create_folder($1, $2)', [userId, name])
    response.status(201).json({ folder: result.rows[0] })
  } catch (error) {
    response.status(400).json({ error: error.message })
  }
})

app.get('/api/library', async (request, response) => {
  const userId = getUserId(request)

  try {
    const result = await pool.query(
      `SELECT
         lf.id AS file_id,
         lf.user_id,
         u.username,
         u.email,
         f.id AS folder_id,
         f.name AS folder_name,
         lf.title,
         lf.description,
         lf.file_type,
         lf.file_name,
         lf.file_url,
         lf.storage_path,
         lf.mime_type,
         lf.file_size_bytes,
         lf.tags,
         lf.file_date,
         lf.created_at,
         lf.updated_at
       FROM public.library_files AS lf
       JOIN public.users AS u ON u.id = lf.user_id
       JOIN public.folders AS f ON f.id = lf.folder_id
       WHERE lf.user_id = $1
       ORDER BY lf.created_at DESC`,
      [userId],
    )
    response.json({ files: result.rows })
  } catch (error) {
    response.status(400).json({ error: error.message })
  }
})

app.delete('/api/library/:fileId', async (request, response) => {
  const userId = getUserId(request)
  const fileId = Number(request.params.fileId)
  if (!Number.isInteger(fileId) || fileId < 1) {
    response.status(400).json({ error: 'El identificador del archivo no es válido.' })
    return
  }

  try {
    const fileResult = await pool.query(
      `DELETE FROM public.library_files
       WHERE id = $1 AND user_id = $2
       RETURNING storage_path`,
      [fileId, userId],
    )

    if (fileResult.rowCount === 0) {
      response.status(404).json({ error: 'El archivo no existe.' })
      return
    }

    await removeUploadedFile({ path: fileResult.rows[0].storage_path }).catch(() => {})
    response.status(204).send()
  } catch (error) {
    response.status(400).json({ error: error.message })
  }
})

app.patch('/api/library/:fileId', upload.single('file'), async (request, response) => {
  const userId = getUserId(request)
  const fileId = Number(request.params.fileId)
  const { folderName, title, description, fileType, tags } = request.body
  const newFile = request.file

  if (!Number.isInteger(fileId) || fileId < 1) {
    await removeUploadedFile(newFile).catch(() => {})
    response.status(400).json({ error: 'El identificador del archivo no es válido.' })
    return
  }

  try {
    const currentResult = await pool.query(
      `SELECT storage_path, mime_type, file_name, file_url, file_size_bytes
       FROM public.library_files
       WHERE id = $1 AND user_id = $2`,
      [fileId, userId],
    )

    if (currentResult.rowCount === 0) {
      await removeUploadedFile(newFile).catch(() => {})
      response.status(404).json({ error: 'El archivo no existe.' })
      return
    }

    const currentFile = currentResult.rows[0]
    const mimeType = newFile?.mimetype || currentFile.mime_type
    if (newFile && !isSupportedFileType(fileType, mimeType)) {
      await removeUploadedFile(newFile).catch(() => {})
      response.status(400).json({ error: 'El tipo de archivo no coincide con la categoría seleccionada.' })
      return
    }

    const updatedFile = newFile
      ? {
          fileName: newFile.originalname,
          fileUrl: `/uploads/${newFile.filename}`,
          mimeType: newFile.mimetype,
          storagePath: newFile.path,
          fileSize: newFile.size,
        }
      : {
          fileName: currentFile.file_name,
          fileUrl: currentFile.file_url,
          mimeType: currentFile.mime_type,
          storagePath: currentFile.storage_path,
          fileSize: currentFile.file_size_bytes,
        }

    const folderResult = await pool.query(
      `SELECT id
       FROM public.folders
       WHERE user_id = $1 AND LOWER(name) = LOWER(trim($2))`,
      [userId, folderName],
    )

    if (folderResult.rowCount === 0) {
      await removeUploadedFile(newFile).catch(() => {})
      response.status(400).json({ error: 'La carpeta seleccionada no existe.' })
      return
    }

    const updateResult = await pool.query(
      `UPDATE public.library_files
       SET folder_id = $3,
           title = trim($4),
           description = $5,
           file_type = $6,
           file_name = $7,
           file_url = $8,
           mime_type = $9,
           storage_path = $10,
           file_size_bytes = $11,
           tags = COALESCE($12::text[], '{}'),
           updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [
        fileId,
        userId,
        folderResult.rows[0].id,
        title,
        description || null,
        fileType,
        updatedFile.fileName,
        updatedFile.fileUrl,
        updatedFile.mimeType,
        updatedFile.storagePath,
        updatedFile.fileSize,
        parseTags(tags),
      ],
    )

    if (updateResult.rowCount === 0) {
      await removeUploadedFile(newFile).catch(() => {})
      response.status(400).json({ error: 'La carpeta seleccionada no existe.' })
      return
    }

    if (newFile && currentFile.storage_path !== newFile.path) {
      await removeUploadedFile({ path: currentFile.storage_path }).catch(() => {})
    }
    response.json({ fileId })
  } catch (error) {
    await removeUploadedFile(newFile).catch(() => {})
    response.status(400).json({ error: error.message })
  }
})

app.post('/api/library', upload.single('file'), async (request, response) => {
  const userId = getUserId(request)
  const { folderName, title, description, fileType, tags } = request.body
  const file = request.file

  if (!file) {
    response.status(400).json({ error: 'Debes seleccionar un archivo.' })
    return
  }

  if (!isSupportedFileType(fileType, file.mimetype)) {
    await removeUploadedFile(file)
    response.status(400).json({ error: 'El tipo de archivo no coincide con la categoría seleccionada.' })
    return
  }

  try {
    const fileUrl = `/uploads/${file.filename}`
    const result = await pool.query(
      `SELECT * FROM add_library_file(
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
      )`,
      [
        userId,
        folderName,
        title,
        description || null,
        fileType,
        file.originalname,
        fileUrl,
        file.mimetype,
        file.path,
        file.size,
        null,
        parseTags(tags),
      ],
    )
    response.status(201).json({ file: result.rows[0] })
  } catch (error) {
    await removeUploadedFile(file).catch(() => {})
    response.status(400).json({ error: error.message })
  }
})

app.listen(port, () => {
  console.log(`API disponible en http://localhost:${port}`)
})
