// Movimiento extraído de video (generado; no editar a mano). Solo datos del esqueleto: el video no se guarda.
// muestras: ángulos de rodilla y cadera (grados) por profundidad t; apertura de pies en largos de pierna; puntas en grados.
export default {
 "ejercicio": "sentadilla-barra",
 "fuente": "video",
 "origen": "Grabación de pantalla de un entrenador, vista trasera en diagonal, 3 repeticiones",
 "extraido": "2026-11-02",
 "detector": "MediaPipe Pose (modelo heavy), 15 cuadros por segundo",
 "repeticiones": 3,
 "segundosPorRep": [
  2.8,
  2.73
 ],
 "rodilla": {
  "max": 173,
  "min": 68
 },
 "cadera": {
  "max": 171,
  "min": 82
 },
 "apertura": 0.611,
 "puntas": 9.9,
 "muestras": [
  {
   "t": 0.0,
   "rodilla": 172.1,
   "cadera": 169.1
  },
  {
   "t": 0.1,
   "rodilla": 164.3,
   "cadera": 156.7
  },
  {
   "t": 0.2,
   "rodilla": 153.0,
   "cadera": 145.4
  },
  {
   "t": 0.3,
   "rodilla": 143.9,
   "cadera": 137.9
  },
  {
   "t": 0.4,
   "rodilla": 134.7,
   "cadera": 130.1
  },
  {
   "t": 0.5,
   "rodilla": 131.2,
   "cadera": 126.0
  },
  {
   "t": 0.6,
   "rodilla": 119.0,
   "cadera": 117.2
  },
  {
   "t": 0.7,
   "rodilla": 111.0,
   "cadera": 110.2
  },
  {
   "t": 0.8,
   "rodilla": 100.0,
   "cadera": 103.6
  },
  {
   "t": 0.9,
   "rodilla": 88.4,
   "cadera": 95.2
  },
  {
   "t": 1.0,
   "rodilla": 76.0,
   "cadera": 86.3
  }
 ]
};
