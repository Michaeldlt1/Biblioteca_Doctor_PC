CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_lower ON users (LOWER(email));
CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique_lower ON users (LOWER(username));

CREATE TABLE IF NOT EXISTS folders (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS folders_user_name_unique
ON folders (user_id, LOWER(name));

CREATE TABLE IF NOT EXISTS library_files (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    folder_id INT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    file_type VARCHAR(20) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    storage_path TEXT,
    mime_type VARCHAR(100),
    file_size_bytes BIGINT,
    file_data BYTEA,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE library_files ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE library_files ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100);
ALTER TABLE library_files ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT;
ALTER TABLE library_files ADD COLUMN IF NOT EXISTS file_data BYTEA;
ALTER TABLE library_files ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS library_files_user_idx ON library_files (user_id);
CREATE INDEX IF NOT EXISTS library_files_folder_idx ON library_files (folder_id);
CREATE INDEX IF NOT EXISTS library_files_type_idx ON library_files (file_type);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_email_format') THEN
        ALTER TABLE users ADD CONSTRAINT users_email_format
        CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_username_min_len') THEN
        ALTER TABLE users ADD CONSTRAINT users_username_min_len
        CHECK (length(trim(username)) >= 3);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'library_files_type_valid') THEN
        ALTER TABLE library_files ADD CONSTRAINT library_files_type_valid
        CHECK (file_type IN ('image', 'video', 'document', 'audio', 'other'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'library_files_size_valid') THEN
        ALTER TABLE library_files ADD CONSTRAINT library_files_size_valid
        CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS library_files_updated_at ON library_files;
CREATE TRIGGER library_files_updated_at
BEFORE UPDATE ON library_files
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

DROP FUNCTION IF EXISTS register_user(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS login_user(TEXT, TEXT);
DROP FUNCTION IF EXISTS create_folder(INT, TEXT);
DROP FUNCTION IF EXISTS add_library_file(INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS add_library_file(INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, BYTEA);

CREATE OR REPLACE FUNCTION register_user(p_username TEXT, p_email TEXT, p_password TEXT)
RETURNS TABLE (user_id INT, user_username VARCHAR(50), user_email VARCHAR(255))
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id INT;
BEGIN
    IF p_username IS NULL OR length(trim(p_username)) < 3 THEN
        RAISE EXCEPTION 'El nombre de usuario debe tener al menos 3 caracteres';
    END IF;
    IF p_email IS NULL OR p_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
        RAISE EXCEPTION 'El formato del email no es válido';
    END IF;
    IF p_password IS NULL OR length(p_password) < 8 THEN
        RAISE EXCEPTION 'La contraseña debe tener al menos 8 caracteres';
    END IF;
    IF EXISTS (SELECT 1 FROM users WHERE LOWER(email) = LOWER(trim(p_email))) THEN
        RAISE EXCEPTION 'Ya existe una cuenta con ese email';
    END IF;
    IF EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER(trim(p_username))) THEN
        RAISE EXCEPTION 'Ese nombre de usuario ya está en uso';
    END IF;

    INSERT INTO users (username, email, password_hash)
    VALUES (trim(p_username), lower(trim(p_email)), crypt(p_password, gen_salt('bf')))
    RETURNING users.id INTO v_user_id;

    INSERT INTO folders (user_id, name) VALUES (v_user_id, 'General');

    RETURN QUERY
    SELECT u.id, u.username, u.email FROM users AS u WHERE u.id = v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION login_user(p_email TEXT, p_password TEXT)
RETURNS TABLE (user_id INT, user_username VARCHAR(50), user_email VARCHAR(255))
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id INT;
BEGIN
    SELECT u.id, u.username, u.email
    INTO v_user_id, user_username, user_email
    FROM users AS u
    WHERE LOWER(u.email) = LOWER(trim(p_email))
      AND u.is_active = TRUE
      AND u.password_hash = crypt(p_password, u.password_hash);

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Credenciales inválidas';
    END IF;

    UPDATE users AS u
    SET last_login_at = NOW(), updated_at = NOW()
    WHERE u.id = v_user_id;

    user_id := v_user_id;
    RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION create_folder(p_user_id INT, p_name TEXT)
RETURNS TABLE (folder_id INT, folder_name VARCHAR(100))
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id AND is_active = TRUE) THEN
        RAISE EXCEPTION 'El usuario no existe o está inactivo';
    END IF;
    IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
        RAISE EXCEPTION 'El nombre de la carpeta es obligatorio';
    END IF;

    INSERT INTO folders (user_id, name)
    VALUES (p_user_id, trim(p_name))
    RETURNING folders.id, folders.name INTO folder_id, folder_name;
    RETURN NEXT;
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'La carpeta ya existe para este usuario';
END;
$$;

CREATE OR REPLACE FUNCTION add_library_file(
    p_user_id INT,
    p_folder_name TEXT,
    p_title TEXT,
    p_description TEXT,
    p_file_type TEXT,
    p_file_name TEXT,
    p_file_url TEXT,
    p_mime_type TEXT DEFAULT NULL,
    p_storage_path TEXT DEFAULT NULL,
    p_file_size_bytes BIGINT DEFAULT NULL,
    p_file_data BYTEA DEFAULT NULL
)
RETURNS TABLE (file_id INT, file_title VARCHAR(150), folder_name VARCHAR(100))
LANGUAGE plpgsql
AS $$
DECLARE
    v_folder_id INT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id AND is_active = TRUE) THEN
        RAISE EXCEPTION 'El usuario no existe o está inactivo';
    END IF;
    IF p_title IS NULL OR length(trim(p_title)) = 0 THEN
        RAISE EXCEPTION 'El título del archivo es obligatorio';
    END IF;
    IF p_file_type NOT IN ('image', 'video', 'document', 'audio', 'other') THEN
        RAISE EXCEPTION 'Tipo de archivo no permitido';
    END IF;

    SELECT f.id INTO v_folder_id
    FROM folders AS f
    WHERE f.user_id = p_user_id AND LOWER(f.name) = LOWER(trim(p_folder_name));

    IF v_folder_id IS NULL THEN
        INSERT INTO folders (user_id, name)
        VALUES (p_user_id, trim(p_folder_name))
        RETURNING folders.id INTO v_folder_id;
    END IF;

    INSERT INTO library_files (
        user_id, folder_id, title, description, file_type, file_name,
        file_url, mime_type, storage_path, file_size_bytes, file_data
    )
    VALUES (
        p_user_id, v_folder_id, trim(p_title), p_description, p_file_type,
        p_file_name, p_file_url, p_mime_type, p_storage_path,
        p_file_size_bytes, p_file_data
    )
    RETURNING library_files.id, library_files.title INTO file_id, file_title;

    SELECT f.name INTO folder_name FROM folders AS f WHERE f.id = v_folder_id;
    RETURN NEXT;
END;
$$;

CREATE OR REPLACE VIEW user_library AS
SELECT
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
    lf.created_at,
    lf.updated_at
FROM library_files AS lf
JOIN users AS u ON u.id = lf.user_id
JOIN folders AS f ON f.id = lf.folder_id;

DO $$
DECLARE
    v_admin_id INT;
BEGIN
    SELECT id INTO v_admin_id FROM users WHERE LOWER(email) = 'admin@example.com';
    IF v_admin_id IS NULL THEN
        INSERT INTO users (username, email, password_hash)
        VALUES ('admin', 'admin@example.com', crypt('12345678', gen_salt('bf')))
        RETURNING id INTO v_admin_id;
    END IF;
    INSERT INTO folders (user_id, name)
    VALUES (v_admin_id, 'General')
    ON CONFLICT DO NOTHING;
END;
$$;

DO $$
DECLARE
    v_demo_id INT;
    v_examples_id INT;
BEGIN
    SELECT id INTO v_demo_id FROM users WHERE LOWER(email) = 'demo@example.com';

    IF v_demo_id IS NULL THEN
        INSERT INTO users (username, email, password_hash)
        VALUES ('demo', 'demo@example.com', crypt('12345678', gen_salt('bf')))
        RETURNING id INTO v_demo_id;
    END IF;

    INSERT INTO folders (user_id, name)
    VALUES (v_demo_id, 'Ejemplos')
    ON CONFLICT DO NOTHING;

    SELECT id INTO v_examples_id
    FROM folders
    WHERE user_id = v_demo_id AND LOWER(name) = 'ejemplos';

    INSERT INTO library_files (
        user_id, folder_id, title, description, file_type,
        file_name, file_url, mime_type
    )
    SELECT
        v_demo_id, v_examples_id, 'Imagen de ejemplo',
        'Archivo de prueba para la biblioteca.', 'image',
        'ejemplo.jpg', 'https://example.com/ejemplo.jpg', 'image/jpeg'
    WHERE NOT EXISTS (
        SELECT 1
        FROM library_files
        WHERE user_id = v_demo_id
          AND folder_id = v_examples_id
          AND file_name = 'ejemplo.jpg'
    );
END;
$$;

SELECT * FROM login_user('admin@example.com', '12345678');
SELECT * FROM user_library ORDER BY created_at DESC;
