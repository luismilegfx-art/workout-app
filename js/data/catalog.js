// Catálogos y valores iniciales. Los parámetros numéricos son iniciales y se pueden cambiar desde Ajustes.

export const MUSCLES = {
  pecho: "Pecho", espalda: "Espalda", hombros: "Hombros", biceps: "Bíceps", triceps: "Tríceps",
  cuadriceps: "Cuádriceps", isquios: "Isquiotibiales", gluteos: "Glúteos", pantorrillas: "Pantorrillas",
  core: "Core", cardio: "Acondicionamiento", antebrazo: "Antebrazo",
};

// Enfoques: qué grupos trabaja cada uno y en qué orden rotan los bloques
export const FOCUSES = {
  push:     { nombre: "Push",            grupos: ["pecho", "hombros", "triceps"], zona: "superior" },
  pull:     { nombre: "Pull",            grupos: ["espalda", "biceps"],           zona: "superior" },
  piernas:  { nombre: "Piernas",         grupos: ["cuadriceps", "isquios", "gluteos", "pantorrillas"], zona: "inferior" },
  core:     { nombre: "Core",            grupos: ["core"],                         zona: "completo" },
  completo: { nombre: "Cuerpo completo", grupos: ["cuadriceps", "pecho", "espalda", "gluteos", "hombros", "core", "cardio"], zona: "completo" },
  superior: { nombre: "Tren superior",   grupos: ["pecho", "espalda", "hombros", "biceps", "triceps"], zona: "superior" },
  pecho:    { nombre: "Pecho",           grupos: ["pecho"],                        zona: "superior" },
  espalda:  { nombre: "Espalda",         grupos: ["espalda"],                      zona: "superior" },
  hombros:  { nombre: "Hombros",         grupos: ["hombros"],                      zona: "superior" },
  brazos:   { nombre: "Brazos",          grupos: ["biceps", "triceps"],            zona: "superior" },
};

export const EQUIPMENT = {
  corporal: "Peso corporal", barra: "Barra y discos", banco: "Banco", mancuernas: "Mancuernas",
  dominadas: "Barra de dominadas", kettlebell: "Kettlebell", balon: "Balón medicinal",
  maquina: "Máquinas", polea: "Poleas",
};
export const GYM_EQUIPMENT = Object.keys(EQUIPMENT);

export const EMPHASES = {
  fuerza:    { nombre: "Fuerza" },
  masa:      { nombre: "Masa muscular" },
  condicion: { nombre: "Condición" },
};

export const LEVELS = { 1: "Principiante", 2: "Intermedio", 3: "Avanzado" };

export const DEFAULT_SETTINGS = {
  nivel: 2,
  unidad: "lb",
  objetivos: ["fuerza", "masa", "condicion"],   // énfasis que rotan en modo automático
  equipoCasa: ["corporal", "barra", "banco", "mancuernas", "dominadas", "kettlebell", "balon"],
  voz: true,
  pitidos: true,
  desactivados: [],        // ids de ejercicios que el usuario no quiere ver
  evitar: [],              // ids marcados por molestias
  params: {
    calentamientoPct: 15, calentamientoMin: 120, calentamientoMax: 480,
    estiramientoPct: 10,  estiramientoMin: 120,  estiramientoMax: 360,
    exprésHasta: 8,        // minutos: hasta aquí la sesión es exprés (un solo grupo, sin descanso)
    pasoCalentamiento: 40, pasoEstiramiento: 30,  // segundos por ejercicio
    margenTiempo: 5,       // ± % aceptado sobre el tiempo total
    formatos: {
      fuerza:    { trabajo: [45, 60], descanso: [45, 60], descansoRonda: 90, rondas: [2, 3], porBloque: [2, 3] },
      masa:      { trabajo: [40, 50], descanso: [15, 30], descansoRonda: 60, rondas: [2, 3], porBloque: [3, 4] },
      condicion: { trabajo: [30, 40], descanso: [0, 15],  descansoRonda: 40, rondas: [1, 3], porBloque: [3, 4] },
      expres:    { trabajo: [30, 45], descanso: [0, 0],   descansoRonda: 0,  rondas: [1, 2], porBloque: [3, 6] },
    },
  },
};
