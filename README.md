# Workout App

Aplicación de entrenamiento guiado por tiempo. Genera rutinas al instante según el enfoque, el lugar (casa o gimnasio) y el tiempo disponible, con calentamiento dinámico al inicio y estiramiento al final. Un temporizador con voz marca cada intervalo y cada ejercicio muestra su técnica y respiración.

**En línea:** https://luismilegfx-art.github.io/workout-app/

## Secciones

Progreso (inicio) · Rutinas · **Entrenar** · Biblioteca · Perfil

## Funciones

- Flujo de Entrenar paso a paso: lugar (con preset de equipo en casa) → zona en una figura anatómica con subzonas y prioridades → tiempo → énfasis.
- Generador por zonas y subzonas: las prioritarias reciben más ejercicios, varía ángulos y agarres, nunca sale de lo escogido.
- Énfasis por sesión: Fuerza, Músculo o Resistencia.
- Progreso: semana actual frente a la meta, constancia, calendario y sesiones recientes.
- Rutinas guardadas con estrellas, carpetas y comentarios.
- Sesiones exprés: un solo grupo muscular, ejercicios encadenados.
- Reproductor a pantalla completa: voz en español, pitidos de cuenta regresiva, cambio de lado en unilaterales, pausa, saltar, +15 s de descanso y cambio de ejercicio en vivo.
- Registro de sesión: repeticiones, peso (lb), esfuerzo (RIR) y molestias. Los ejercicios con molestia dejan de proponerse.
- Biblioteca para consultar técnica y desactivar ejercicios. Ajustes editables: nivel, equipo de casa, parámetros del generador, copia de seguridad.

## Estructura

```
index.html            Punto de entrada
css/app.css           Estilos y tokens de diseño (tema claro y oscuro)
js/main.js            Estado de la app y navegación
js/store.js           Persistencia local (ajustes, historial, exportar/importar)
js/data/exercises.js  Biblioteca de ejercicios (modelo de datos de la especificación)
js/data/catalog.js    Enfoques, grupos, equipo y parámetros iniciales
js/engine/generator.js  Generador y distribución del tiempo (función pura, con semilla)
js/engine/runner.js     Ejecución por marcas de tiempo
js/engine/voice.js      Voz y pitidos
js/data/body-paths.js   Trazos de la figura anatómica (MIT, ver third_party/)
js/ui/                  Pantallas (progress, routines, train, body-map, preview, player, summary, library, profile)
prototipos/             Pruebas técnicas (detección de pose con cámara)
tests/                  Pruebas del generador
```

## Desarrollo

Sitio estático sin paso de compilación (módulos ES nativos).

```
npm run serve   # http://localhost:8080
npm test        # pruebas del generador (Node 18+)
```

Los datos del usuario se guardan en el navegador del dispositivo (`localStorage`).
