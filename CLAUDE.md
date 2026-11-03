# Guía para Claude

Proyecto: aplicación de entrenamiento guiado por tiempo, de uso personal (Luismi). La especificación vive en el documento base del Proyecto de Claude "Workout App" (pestañas: documento base y especificación técnica). Cualquier desviación de la especificación se señala antes de implementarla.

## Principios

- Sitio estático en GitHub Pages, sin compilación: módulos ES nativos, sin frameworks. Mantenerlo así salvo decisión explícita.
- `js/engine/generator.js` es una función pura con semilla: toda regla nueva del generador lleva su prueba en `tests/`.
- Cada ejercicio es una ficha única en `js/data/exercises.js` (datos, técnica, tempo, control, tensión, movimiento). El formato y su validación están en `js/data/exercise-schema.js` y `tests/exercises.test.js` la aplica a toda la biblioteca. El bot y la cámara leen de la ficha; la geometría del bot vive aparte (`prototipos/bot/motions.js`).
- Los datos guardados tienen formato versionado (`js/engine/records.js`): identificador único, `creada`, `actualizada`, `v`, y registro de borrados. Un cambio de formato sube `DATA_VERSION` y trae su migración con prueba.
- Los valores numéricos del generador son parámetros en `js/data/catalog.js` (DEFAULT_SETTINGS.params), editables desde Ajustes. No fijar números en el código.
- El contenido configurable (ejercicios, textos, parámetros) debe poder editarse desde la app.
- Interfaz en español, legible a distancia (el usuario entrena con la pantalla de frente o de lado), en móvil y computadora.
- Unidad de peso: libras.
- Calentamiento dinámico al inicio, estiramiento estático al final; en sesiones exprés ambos son opcionales.

## Comprobaciones

- `npm test` antes de cada commit que toque el motor.
- La cámara (detección de pose con MediaPipe) solo funciona en un contexto seguro (GitHub Pages o localhost), no dentro de artefactos de Claude.

## Estructura

- Secciones: Progreso (inicio) · Rutinas · Entrenar (centro, destacado) · Biblioteca · Perfil.
- Cada ejercicio principal declara su subzona (`sub: "zona.sub"`) en `js/data/exercises.js`; zonas y atajos en `js/data/catalog.js`.
- La hoja de ruta por fases está en el documento base del Proyecto (pestaña Hoja de ruta).

## Pendiente

- Integrar la cámara como botón opcional por ejercicio (campo `camara` en la biblioteca) usando `prototipos/prueba-camara-pose.html` como base.
- Progresión: hecha la sugerencia de peso, la calibración inicial y la regla de inactividad (`js/engine/progression.js`, parámetros en `params.progresion`). Faltan recomendaciones de zona y énfasis, descarga y gráficas.
- Edición completa de ejercicios desde la app.
- Nombre definitivo de la app.
