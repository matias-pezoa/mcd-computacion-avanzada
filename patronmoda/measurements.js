// Definición de las medidas paramétricas del sistema.
// Fuente del método de trazado: https://thecopycat.blog/2021/03/01/como-hacer-un-patron-de-cuerpo-base/
//
// Se separan en dos grupos:
//  - "cuerpo": medidas que se toman directamente sobre la persona.
//  - "tabla": valores de patronaje que el artículo toma de una tabla estándar
//    (bajada de sisa, altura de busto, profundidad de pinza, etc.) en vez de
//    derivarlos por fórmula. Acá quedan expuestos como parámetros ajustables
//    para poder afinarlos contra una medición real o una morfología distinta.

export const MEASUREMENT_GROUPS = [
  {
    id: "cuerpo",
    label: "Medidas del cuerpo",
    collapsed: false,
    fields: [
      { key: "bust", label: "Contorno de busto", unit: "cm", default: 92, min: 60, max: 140, step: 0.5 },
      { key: "waist", label: "Contorno de cintura", unit: "cm", default: 74, min: 50, max: 130, step: 0.5 },
      { key: "hip", label: "Contorno de cadera", unit: "cm", default: 98, min: 60, max: 140, step: 0.5 },
      { key: "neck", label: "Contorno de cuello", unit: "cm", default: 36, min: 28, max: 48, step: 0.5 },
      { key: "chestWidth", label: "Ancho de pecho", unit: "cm", default: 32, min: 22, max: 46, step: 0.5 },
      { key: "backWidth", label: "Ancho de espalda", unit: "cm", default: 34, min: 24, max: 48, step: 0.5 },
      { key: "frontWaistLength", label: "Largo de talle delantero", unit: "cm", default: 40, min: 30, max: 52, step: 0.5 },
      { key: "backWaistLength", label: "Largo de talle espalda", unit: "cm", default: 38, min: 28, max: 50, step: 0.5 },
      { key: "shoulderLength", label: "Largo de hombro", unit: "cm", default: 12, min: 8, max: 16, step: 0.2 },
      { key: "bustSeparation", label: "Separación de busto", unit: "cm", default: 18, min: 12, max: 26, step: 0.5 },
    ],
  },
  {
    id: "tabla",
    label: "Valores de patronaje (tabla estándar / ajuste fino)",
    collapsed: true,
    fields: [
      { key: "frontArmholeDrop", label: "Bajada de sisa delantera", unit: "cm", default: 20, min: 14, max: 26, step: 0.5 },
      { key: "backArmholeDrop", label: "Bajada de sisa espalda", unit: "cm", default: 19, min: 14, max: 26, step: 0.5 },
      { key: "bustHeight", label: "Altura de busto", unit: "cm", default: 25, min: 18, max: 34, step: 0.5 },
      { key: "hipHeight", label: "Altura de cadera", unit: "cm", default: 20, min: 14, max: 28, step: 0.5 },
      { key: "bustDartDepth", label: "Profundidad de pinza de busto", unit: "cm", default: 3, min: 1, max: 6, step: 0.2 },
      { key: "frontWaistDartLength", label: "Largo pinza de talle delantero", unit: "cm", default: 9.5, min: 7, max: 12, step: 0.5 },
      { key: "backWaistDartLength", label: "Largo pinza de talle espalda", unit: "cm", default: 11.5, min: 9, max: 14, step: 0.5 },
      { key: "frontWaistDartWidth", label: "Ancho pinza de talle delantero", unit: "cm", default: 2, min: 1, max: 4, step: 0.2 },
      { key: "backWaistDartWidth", label: "Ancho pinza de talle espalda", unit: "cm", default: 3, min: 1, max: 5, step: 0.2 },
      { key: "backNeckDrop", label: "Bajada de cuello espalda", unit: "cm", default: 2, min: 1, max: 4, step: 0.2 },
      { key: "shoulderDrop", label: "Bajada de hombro", unit: "cm", default: 4, min: 2, max: 6, step: 0.2 },
      { key: "dartRelease", label: "Despegue de pinzas del ápice de busto", unit: "cm", default: 2.5, min: 1, max: 4, step: 0.1 },
      { key: "frontWaistExtra", label: "Holgura extra en cintura delantera", unit: "cm", default: 2, min: 0, max: 4, step: 0.2 },
      { key: "backWaistExtra", label: "Holgura extra en cintura espalda", unit: "cm", default: 2, min: 0, max: 4, step: 0.2 },
      { key: "neckHorizontalConst", label: "Constante ancho de cuello (+)", unit: "cm", default: 0.5, min: 0, max: 2, step: 0.1 },
      { key: "neckVerticalConst", label: "Constante bajada cuello delantero (+)", unit: "cm", default: 2, min: 0, max: 4, step: 0.2 },
    ],
  },
];

export function defaultMeasurements() {
  const out = {};
  for (const group of MEASUREMENT_GROUPS) {
    for (const field of group.fields) out[field.key] = field.default;
  }
  return out;
}
