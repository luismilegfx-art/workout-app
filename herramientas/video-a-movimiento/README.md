# Video → movimiento del bot

Convierte la grabación de un ejercicio en datos de movimiento para el bot. El video no se guarda en el repositorio: solo los ángulos resultantes (`prototipos/bot/motions/<ejercicio>.video.js`).

1. Grabación: cuerpo completo, cámara fija, 2–3 repeticiones limpias, un ejercicio por clip. De lado o en diagonal.
2. Cuadros: `ffmpeg -i clip.mov -vf "fps=30,scale=1280:-2" -q:v 3 video/f30/%04d.jpg`
3. Modelo de pose (incluye los archivos del modelo, sin descargas aparte): `npm pack @mediapipe/pose && tar xzf mediapipe-pose-*.tgz` junto a `run.html`.
4. Detección (servir la carpeta por HTTP en el puerto 8790): `node run.cjs <carpeta> <cuadros> 2` → `video/pose.json`
5. Movimiento: `python3 process.py video/pose.json video/motion.json` → repeticiones, rangos de ángulo y muestras por profundidad.

Qué se toma del video: ángulos de las articulaciones por profundidad, apertura de pies y orientación de las puntas (medidas que no dependen del ángulo de la cámara). La postura completa la resuelve el bot con sus proporciones y reglas físicas del ejercicio (por ejemplo, la barra sobre el medio del pie).
