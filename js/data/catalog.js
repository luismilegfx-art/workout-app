// Catálogos y valores iniciales. Los parámetros numéricos son iniciales y se pueden cambiar desde Perfil.

export const MUSCLES = {
  pecho: "Pecho", espalda: "Espalda", hombros: "Hombros", biceps: "Bíceps", triceps: "Tríceps",
  cuadriceps: "Cuádriceps", isquios: "Isquiotibiales", gluteos: "Glúteos", pantorrillas: "Pantorrillas",
  aductores: "Aductores", core: "Core", cardio: "Acondicionamiento", antebrazo: "Antebrazo",
};

// Zonas y subzonas que el usuario escoge en la silueta. Cada ejercicio declara una subzona ("zona.sub").
export const ZONES = {
  pecho:   { nombre: "Pecho",   subs: { superior: "Superior", medio: "Medio e inferior" } },
  espalda: { nombre: "Espalda", subs: { dorsales: "Dorsales (ancho)", alta: "Espalda alta (grosor)", lumbar: "Lumbar" } },
  hombros: { nombre: "Hombros", subs: { anterior: "Anterior", lateral: "Lateral", posterior: "Posterior" } },
  brazos:  { nombre: "Brazos",  subs: { biceps: "Bíceps", triceps: "Tríceps", antebrazo: "Antebrazo" } },
  abdomen: { nombre: "Abdomen", subs: { recto: "Recto abdominal", oblicuos: "Oblicuos", estabilidad: "Estabilidad (core profundo)" } },
  piernas: { nombre: "Piernas", subs: { cuadriceps: "Cuádriceps", isquios: "Isquiotibiales", gluteos: "Glúteos", pantorrillas: "Pantorrillas", aductores: "Aductores" } },
};
export const ALL_SUBS = Object.fromEntries(Object.entries(ZONES).map(([z, v]) => [z, Object.keys(v.subs)]));
export const subLabel = key => { const [z, s] = key.split("."); return ZONES[z]?.subs[s] ?? key; };

// Atajos de la silueta: qué subzonas enciende cada uno
export const PRESETS = {
  push:     { nombre: "Push",  sel: { pecho: ["superior", "medio"], hombros: ["anterior", "lateral"], brazos: ["triceps"] } },
  pull:     { nombre: "Pull",  sel: { espalda: ["dorsales", "alta"], hombros: ["posterior"], brazos: ["biceps", "antebrazo"] } },
  piernas:  { nombre: "Piernas", sel: { piernas: ALL_SUBS.piernas } },
  core:     { nombre: "Core",  sel: { abdomen: ALL_SUBS.abdomen, espalda: ["lumbar"] } },
  completo: { nombre: "Cuerpo completo", sel: ALL_SUBS },
};

// Enfoques antiguos (historial previo y pruebas) traducidos a zonas
export const FOCUSES = {
  push: { nombre: "Push", zonas: PRESETS.push.sel },
  pull: { nombre: "Pull", zonas: PRESETS.pull.sel },
  piernas: { nombre: "Piernas", zonas: PRESETS.piernas.sel },
  core: { nombre: "Core", zonas: PRESETS.core.sel },
  completo: { nombre: "Cuerpo completo", zonas: PRESETS.completo.sel },
  superior: { nombre: "Tren superior", zonas: { pecho: ALL_SUBS.pecho, espalda: ["dorsales", "alta"], hombros: ALL_SUBS.hombros, brazos: ALL_SUBS.brazos } },
  pecho: { nombre: "Pecho", zonas: { pecho: ALL_SUBS.pecho } },
  espalda: { nombre: "Espalda", zonas: { espalda: ALL_SUBS.espalda } },
  hombros: { nombre: "Hombros", zonas: { hombros: ALL_SUBS.hombros } },
  brazos: { nombre: "Brazos", zonas: { brazos: ALL_SUBS.brazos } },
};

export const EQUIPMENT = {
  corporal: "Peso corporal", barra: "Barra y discos", banco: "Banco", mancuernas: "Mancuernas",
  dominadas: "Barra de dominadas", kettlebell: "Kettlebell", balon: "Balón medicinal",
  maquina: "Máquinas", polea: "Poleas",
};
export const GYM_EQUIPMENT = Object.keys(EQUIPMENT);

export const EMPHASES = {
  fuerza:    { nombre: "Fuerza",      desc: "Series por repeticiones, descanso largo, menos ejercicios" },
  masa:      { nombre: "Músculo",     desc: "Circuitos por tiempo, descanso moderado" },
  condicion: { nombre: "Resistencia", desc: "Circuitos rápidos, poco descanso" },
};

export const LEVELS = { 1: "Principiante", 2: "Intermedio", 3: "Avanzado" };

export const DEFAULT_SETTINGS = {
  nivel: 2,
  unidad: "lb",
  objetivos: ["fuerza", "masa", "condicion"],   // prioridades del perfil (para recomendaciones futuras)
  metaSemanal: 4,                                // sesiones por semana
  // Presets de equipo para Casa. "Mi casa" refleja el equipo registrado; "Solo mancuernas" es un ejemplo.
  presetsEquipo: [
    { id: "mi-casa", nombre: "Mi casa", equipo: ["corporal", "barra", "banco", "mancuernas", "dominadas", "kettlebell", "balon"] },
    { id: "mancuernas", nombre: "Solo mancuernas", equipo: ["corporal", "mancuernas"] },
  ],
  presetActivo: "mi-casa",
  voz: true,
  pitidos: true,
  desactivados: [],        // ids de ejercicios que el usuario no quiere ver
  evitar: [],              // ids marcados por molestias
  params: {
    calentamientoPct: 15, calentamientoMin: 120, calentamientoMax: 480,
    estiramientoPct: 10,  estiramientoMin: 120,  estiramientoMax: 360,
    exprésHasta: 8,        // minutos: hasta aquí la sesión es exprés (una sola zona, sin descanso)
    pasoCalentamiento: 40, pasoEstiramiento: 30,  // segundos por ejercicio
    margenTiempo: 5,       // ± % aceptado sobre el tiempo total
    maxEquipos: 3,         // equipos distintos por sesión (el peso corporal no cuenta)
    registroMinDescanso: 15, // segundos: descansos más cortos acumulan el registro hasta uno más largo
    // Fuerza: series por repeticiones; el tiempo de cada serie es una estimación para planificar
    fuerza: {
      series: [3, 5], repsPrincipal: [4, 6], repsAccesorio: [6, 10],
      descansoPrincipal: 150, descansoAccesorio: 90, cambioEjercicio: 90,
      serieEstimada: 40, isometrico: 40, principales: 2,
      aproximacion: true, aproximaciones: [[50, 8], [75, 3]], descansoAproximacion: 60,
      margenAjuste: 120,   // segundos por encima de lo planificado antes de proponer quitar una serie
    },
    // Progresión (reglas en la especificación técnica): pasos de peso, sesiones para subir o bajar, inactividad
    progresion: {
      incrementoSuperior: 5, incrementoInferior: 10,   // lb por paso
      sesionesParaSubir: 2, rirParaSubir: 2,           // sesiones seguidas superando el rango con esa reserva
      sesionesParaBajar: 3,                            // sesiones seguidas sin llegar al mínimo
      diasPausa: 14, recortePausa: 10,                 // días sin el ejercicio → % menos de carga
      diasPausaLarga: 28, recortePausaLarga: 20,
      objetivos: { masa: [8, 12], condicion: [12, 20], expres: [10, 20] },   // repeticiones objetivo por énfasis (Fuerza usa las suyas)
    },
    formatos: {
      masa:      { trabajo: [40, 50], descanso: [15, 30], descansoRonda: 60, rondas: [2, 3], porBloque: [3, 4] },
      condicion: { trabajo: [30, 40], descanso: [0, 15],  descansoRonda: 40, rondas: [1, 3], porBloque: [3, 4] },
      expres:    { trabajo: [30, 45], descanso: [0, 0],   descansoRonda: 0,  rondas: [1, 2], porBloque: [3, 6] },
    },
  },
};

// Equipo disponible según lugar y preset
export function equipmentFor(lugar, settings, presetId) {
  if (lugar === "gym") return GYM_EQUIPMENT;
  const p = settings.presetsEquipo.find(x => x.id === (presetId ?? settings.presetActivo)) ?? settings.presetsEquipo[0];
  return p?.equipo ?? ["corporal"];
}
