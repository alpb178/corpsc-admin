# Flujo de Trabajo para Desarrolladores — EMX Comunicaciones

> Versión 1.2 — Julio 2026

---

## Resumen

A partir de ahora todos los repos activos de la organización siguen un flujo unificado basado en dos ramas protegidas: **`develop`** (staging) y **`main`** (producción). Ningún desarrollador puede hacer push directo a ninguna de las dos.

---

## Ramas

| Rama                            | Entorno            | Acceso                                                   |
| ------------------------------- | ------------------ | -------------------------------------------------------- |
| `main`                          | Producción         | Solo vía PR desde `develop`, requiere 1 aprobación       |
| `develop`                       | Staging            | Solo vía PR desde rama de feature, requiere 1 aprobación |
| `feature/*`, `fix/*`, `chore/*` | Local / desarrollo | Libre                                                    |

---

## Flujo estándar

```
feature/my-task
       │
       │  git push + abrir PR → develop
       ▼
   develop  ◄── staging, aquí se prueba
       │
       │  abrir PR → main (solo cuando está listo para producción)
       ▼
     main  ◄── producción
```

### Paso a paso

**1. Crear rama desde `develop`**

```bash
git checkout develop
git pull origin develop
git checkout -b feature/descriptive-name
```

**2. Desarrollar y commitear**

```bash
git add .
git commit -m "feat: clear description of the change"
git push origin feature/descriptive-name
```

Convención de commits recomendada:

- `feat:` nueva funcionalidad
- `fix:` corrección de bug
- `chore:` mantenimiento, deps, config
- `refactor:` refactorización sin cambio de comportamiento
- `test:` añadir o actualizar tests
- `docs:` documentación

**3. Abrir PR hacia `develop`**

Tenéis dos opciones — la recomendada es la opción A con Claude Code:

---

**Opción A — Con Claude Code (recomendada) 🤖**

Asegúrate de tener instalados [Claude Code](https://docs.anthropic.com/claude-code) y [GitHub CLI](https://cli.github.com/):

```bash
npm install -g @anthropic-ai/claude-code
gh auth login
```

Cuando tu rama esté lista, ejecuta desde la raíz del repo:

```bash
claude --permission-mode bypassPermissions --print \
  "Analiza los cambios de esta rama con git diff develop...HEAD. \
   Lee el template de PR en .github/PULL_REQUEST_TEMPLATE.md. \
   Rellena el template con contenido real y descriptivo basado en los cambios. \
   Crea el PR hacia develop con: gh pr create --base develop \
   usando el título y cuerpo generados. \
   Asigna el PR al usuario actual con --assignee @me."
```

Claude leerá tus cambios, rellenará el template automáticamente y abrirá el PR. Solo tendrás que asignar un revisor desde GitHub.

---

**Opción B — Manual desde GitHub**

- Ir a GitHub y abrir el PR desde la interfaz web
- Se cargará automáticamente el **template** — rellenarlo completo

---

En ambos casos:

- Asignar al menos un revisor del equipo
- El PR recibirá un **review automático de IA** con observaciones

**4. Review y aprobación**

- Al menos 1 aprobación de un compañero del equipo
- Resolver los comentarios antes de mergear
- No mergear si hay tests fallando

**5. Merge a `develop`**

- Usar **"Squash and merge"** para mantener el historial limpio
- Verificar en staging que todo funciona

**6. PR a producción (`main`)**

- Cuando el código está validado en staging
- Abrir PR de `develop` → `main`
- Requiere 1 aprobación (preferiblemente del CTO o tech lead)
- Incluir en la descripción qué se despliega y cómo probarlo

---

## Template de PR

Al abrir un PR se carga automáticamente este template:

```markdown
## ¿Qué hace este PR?
<!-- Descripción breve del cambio -->

## ¿Por qué?
<!-- Contexto, motivación o issue relacionado. Ej: Closes #123 -->

## ¿Cómo probarlo?
<!-- Pasos para verificar que funciona correctamente -->

## Checklist
- [ ] El código funciona en local
- [ ] Tests añadidos o actualizados
- [ ] Sin `console.log`, `dd()` o código de debug olvidado
- [ ] El PR es pequeño y enfocado (un solo propósito)
- [ ] CHANGELOG actualizado (si aplica)
```

---

## Buenas prácticas

### PRs pequeños y enfocados

Un PR debe hacer **una sola cosa**. PRs grandes son difíciles de revisar y más propensos a introducir bugs. Si el cambio es grande, dividirlo en PRs encadenados.

### Nombres de rama descriptivos

```bash
# ✅ Bien
feature/add-user-profile-images
fix/cardindex-eager-loading
chore/update-dependencies

# ❌ Mal
feature/cambios
fix/bug
mi-rama
```

### Idioma del código: inglés

La interfaz de usuario va en el idioma del producto (español), pero **a nivel
de código todo se escribe en inglés**: modelos y campos de base de datos,
enums y sus valores, clases, servicios, DTOs, rutas de API nuevas, claves de
payloads JSON, componentes, variables y props. Los textos visibles (labels,
mensajes de error, notificaciones) se mantienen en español.

```ts
// ✅ Bien
TraceType.AD_DELETED   ·  POST /visits   ·  { adId: string }

// ❌ Mal
TipoTraza.ANUNCIO_ELIMINADO   ·  POST /visitas   ·  { anuncioId: string }
```

El código legado en español **no se renombra "de paso"** en PRs de features
(cambiaría contratos de API que consumen otros clientes). Su migración se
planifica aparte — en tu-chamba, ver `docs/MIGRACION-CODIGO-INGLES.md`.

### Idioma de git: inglés

Todo lo que vive en git también va en inglés: **nombres de rama, mensajes de
commit y títulos/descripciones de PR**. Así el historial queda uniforme con el
código y con las herramientas (conventional commits, changelogs, reviews de IA).

```bash
# ✅ Bien
git checkout -b feature/csv-bulk-import
git commit -m "feat: add CSV bulk import for listings"
# PR: "feat: add CSV bulk import for listings"

# ❌ Mal
git checkout -b feature/importacion-csv
git commit -m "feat: importación masiva de anuncios por CSV"
# PR: "Importación de anuncios"
```

### Commits atómicos

Cada commit debe representar un cambio coherente y compilable. Evitar commits tipo "WIP", "arreglando cosas" o "cambios varios".

### No commitear a `develop` o `main` directamente

Las ramas están protegidas — cualquier intento de push directo será rechazado. Siempre vía PR.

---

## Gestión de issues

- Los bugs se reportan como **Issues** en el repo correspondiente
- Usar labels: `bug`, `feature`, `tech-debt`, `blocked`
- Referenciar el issue en el PR: `Closes #123`
- No cerrar issues manualmente — se cierran solos al mergear el PR

---

## Repos activos

| Repo               | Stack                     | Rama dev |
| ------------------ | ------------------------- | -------- |
| emasex             | PHP / Laravel             | develop  |
| tikneonext         | TypeScript / Next.js      | develop  |
| orlegitech-landing | TypeScript                | develop  |
| pop-mobile         | TypeScript / React Native | dev      |
| pop                | Python                    | develop  |
| chatbots           | TypeScript                | develop  |
| tikneo-api         | Python                    | develop  |
| tikneo-mobile      | TypeScript                | develop  |
| golf-mobile        | TypeScript                | develop  |

---

## Preguntas frecuentes

**¿Puedo hacer push directo a `develop` en casos de urgencia?**
No. Las ramas están protegidas técnicamente. En caso de hotfix urgente, crear una rama `hotfix/description` y abrir un PR exprés — puede aprobarlo cualquier miembro del equipo.

**¿Quién puede aprobar mis PRs?**
Cualquier miembro del equipo asignado al repo en GitHub. El objetivo es que el código pase por al menos un par de ojos distintos.

**¿Qué hago si mi PR tiene conflictos con `develop`?**

```bash
git checkout develop
git pull origin develop
git checkout feature/my-branch
git merge develop
# Resolver conflictos
git push origin feature/my-branch
```

**¿Cada cuánto se despliega a producción (`main`)?**
Cuando el CTO lo decida según el estado de `develop` en staging. No hay un cadencia fija — depende del proyecto.

---

*Documento generado por Pepi 🦞 — para dudas, preguntar en el canal del equipo.*
