# Nodo Blockchain — Express.js

Nodo individual de la red blockchain distribuida para gestión de grados académicos.

## Stack
- **Backend:** Node.js + Express
- **Base de datos:** Supabase (PostgreSQL)
- **Docs:** OpenAPI 3.0 (Swagger UI)
- **PoW:** SHA256 con prefijo configurable

---

## ⚡ Instalación rápida

```bash
# 1. Instalar dependencias
npm install

# 2. Crear tu .env
cp .env.example .env

# 3. Editar .env con tus datos
PORT=8003          # Tu puerto único en el equipo
NODE_ID=nodo-express-tunombre
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=tu_anon_key
DIFFICULTY=3

# 4. Arrancar
npm run dev
```

---

## 🗄️ Setup Supabase

1. Ve a tu proyecto Supabase → **SQL Editor**
2. Ejecuta el archivo `docs/supabase_setup.sql`
3. Copia tu URL y anon key de **Settings → API**

---

## 🌐 Montar la red con tus compañeros

### Fase 1 — Cada quien levanta su nodo

| Integrante | Stack    | Puerto |
|------------|----------|--------|
| Tú         | Express  | :8003  |
| Compañero 1| Laravel  | :8001  |
| Compañero 2| Next.js  | :8002  |

Cada quien ejecuta su nodo localmente. Si van a conectarse en red local, necesitan conocer las IPs de los demás (o usar ngrok si están remotos).

### Fase 2 — Registrar los nodos entre sí

Una vez que todos tienen su API corriendo, cada nodo debe registrar a los demás. Hazlo con una sola petición:

```bash
# Registra a tus compañeros en TU nodo
curl -X POST http://localhost:8003/nodes/register \
  -H "Content-Type: application/json" \
  -d '{"nodes": ["http://IP_COMP1:8001", "http://IP_COMP2:8002"]}'
```

Tus compañeros hacen lo mismo registrándote a ti. Después de esto, todos se conocen.

**Verificar:**
```bash
curl http://localhost:8003/nodes
```

### Fase 3 — Pruebas de red

**Crear transacción en tu nodo y verificar propagación:**
```bash
curl -X POST http://localhost:8003/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "persona_id": "11111111-1111-1111-1111-111111111111",
    "institucion_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "programa_id": "cccccccc-cccc-cccc-cccc-cccccccccccc",
    "titulo_obtenido": "Ingeniero en Sistemas Computacionales",
    "fecha_fin": "2023-05-30"
  }'
```

Verifica en el nodo de un compañero que la transacción llegó:
```bash
curl http://IP_COMP1:8001/transactions
```

**Minar un bloque:**
```bash
curl -X POST http://localhost:8003/mine
```

Verifica en los demás nodos que el bloque fue recibido:
```bash
curl http://IP_COMP1:8001/chain
```

### Fase 4 — Consenso (conflicto intencional)

1. Desconectar un nodo temporalmente (bajar el server)
2. Crear transacciones y minar en otros nodos
3. Reconectar el nodo caído
4. Ejecutar el algoritmo de consenso:

```bash
curl http://localhost:8003/nodes/resolve
```

El nodo adoptará la cadena válida más larga de la red.

---

## 📡 Endpoints completos

| Método | Ruta               | Descripción                          |
|--------|--------------------|--------------------------------------|
| GET    | `/`                | UI de diagnóstico                    |
| GET    | `/status`          | Estado del nodo                      |
| GET    | `/chain`           | Cadena completa de bloques           |
| GET    | `/chain/validate`  | Valida integridad de la cadena       |
| POST   | `/mine`            | Mina bloque con transacciones pendientes |
| POST   | `/blocks/receive`  | Recibe bloque propagado por otro nodo |
| GET    | `/transactions`    | Transacciones pendientes             |
| POST   | `/transactions`    | Nueva transacción (y propaga)        |
| POST   | `/nodes/register`  | Registra nodos en la red             |
| GET    | `/nodes`           | Lista nodos conocidos                |
| GET    | `/nodes/resolve`   | Algoritmo de consenso                |
| GET    | `/docs`            | Swagger UI                           |

---

## 🌍 Usando ngrok (si están en redes distintas)

```bash
# Instalar ngrok: https://ngrok.com
ngrok http 8003
# Te da una URL pública tipo: https://abc123.ngrok.io
# Comparte esa URL con tus compañeros para que te registren
```

---

## 📋 Logs

Los logs se imprimen en consola con prefijos:
- `[HTTP]` — requests recibidos
- `[TX]` — transacciones
- `[MINADO]` — proceso de minado
- `[PROPAGACIÓN TX/BLOQUE]` — difusión a la red
- `[CONSENSO]` — algoritmo de resolución
- `[RECEIVE]` — bloques recibidos de otros nodos
- `[NODOS]` — registro de peers


5065HTvM72Lmn5