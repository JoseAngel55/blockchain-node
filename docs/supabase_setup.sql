-- ============================================================
--  SCRIPT DE SETUP PARA SUPABASE
--  Ejecutar en el SQL Editor de tu proyecto Supabase
-- ============================================================

-- 1. Personas
CREATE TABLE IF NOT EXISTS personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(100) NOT NULL,
  apellido_paterno VARCHAR(100) NOT NULL,
  apellido_materno VARCHAR(100),
  curp VARCHAR(18) UNIQUE,
  correo VARCHAR(150),
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Instituciones
CREATE TABLE IF NOT EXISTS instituciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(255) NOT NULL,
  pais VARCHAR(100),
  estado VARCHAR(100),
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Niveles de grado
CREATE TABLE IF NOT EXISTS niveles_grado (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL
);

INSERT INTO niveles_grado (nombre) VALUES
  ('Técnico'),
  ('Licenciatura'),
  ('Maestría'),
  ('Doctorado'),
  ('Especialidad')
ON CONFLICT DO NOTHING;

-- 4. Programas
CREATE TABLE IF NOT EXISTS programas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(255) NOT NULL,
  nivel_grado_id INT REFERENCES niveles_grado(id),
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Grados (tabla principal de bloques)
CREATE TABLE IF NOT EXISTS grados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id UUID REFERENCES personas(id) ON DELETE CASCADE,
  institucion_id UUID REFERENCES instituciones(id),
  programa_id UUID REFERENCES programas(id),
  fecha_inicio DATE,
  fecha_fin DATE,
  titulo_obtenido VARCHAR(255),
  numero_cedula VARCHAR(50),
  titulo_tesis TEXT,
  menciones VARCHAR(100),
  -- Campos blockchain
  hash_actual TEXT NOT NULL UNIQUE,
  hash_anterior TEXT,
  nonce INTEGER,
  firmado_por VARCHAR(255),
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices útiles
CREATE INDEX IF NOT EXISTS idx_grados_hash_actual ON grados(hash_actual);
CREATE INDEX IF NOT EXISTS idx_grados_creado_en ON grados(creado_en);

-- ============================================================
--  DATOS DE PRUEBA (opcional, para testear sin UUID reales)
-- ============================================================

INSERT INTO personas (id, nombre, apellido_paterno, apellido_materno, curp, correo)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Juan', 'García', 'López', 'GALJ000101HDFRCN01', 'juan@test.com'),
  ('22222222-2222-2222-2222-222222222222', 'María', 'Hernández', 'Ruiz', 'HERM000202MDFRZR01', 'maria@test.com')
ON CONFLICT DO NOTHING;

INSERT INTO instituciones (id, nombre, pais, estado)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Universidad de Guanajuato', 'México', 'Guanajuato'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Instituto Tecnológico', 'México', 'CDMX')
ON CONFLICT DO NOTHING;

INSERT INTO programas (id, nombre, nivel_grado_id)
VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Ingeniería en Sistemas Computacionales', 2),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Ciencias de la Computación', 3)
ON CONFLICT DO NOTHING;
