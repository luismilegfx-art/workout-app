# Workout App

Aplicación de entrenamiento guiado por tiempo. Genera rutinas al instante según el enfoque, el lugar (casa o gimnasio) y el tiempo disponible, con calentamiento dinámico al inicio y estiramiento al final. Un temporizador con voz marca cada intervalo y cada ejercicio muestra su técnica y respiración.

**En línea:** https://luismilegfx-art.github.io/workout-app/

## Funciones

- Generador por enfoque (Push, Pull, Piernas, Core, Cuerpo completo, Tren superior y grupos específicos), lugar y tiempo.
- Énfasis por sesión (fuerza, masa, condición) con rotación automática según el historial.
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
js/ui/                  Pantallas
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
