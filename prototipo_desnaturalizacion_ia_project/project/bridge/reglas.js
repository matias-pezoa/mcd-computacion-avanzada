/**
 * reglas.js
 * ---------------------------------------------------------------
 * Traduce una lectura cruda del sensor (ej. analogRead 0-1023) en
 * las dos variables que consume el sistema de distorsión web:
 *
 *   intensidad (0-100)  -> magnitud de la variación respecto de una
 *                          línea base individual que se actualiza
 *                          lentamente (igual que en el criterio de
 *                          análisis del anteproyecto: "variación
 *                          porcentual respecto de una línea base").
 *   pico (boolean)       -> true cuando el cambio es abrupto
 *                          (equivalente a un pico de conductancia /
 *                          respuesta simpática abrupta).
 *
 * Se usa tanto desde bridge.js (Arduino real) como desde
 * simulate.js (señal sintética), para que ambos caminos apliquen
 * exactamente la misma regla.
 */

function crearDetector(opts = {}) {
  const alphaBaseline = opts.alphaBaseline ?? 0.12; // qué tan rápido se adapta la línea base lenta
  const escala = opts.escala ?? 1.3; // convierte la distancia a la línea base en un valor 0-100
  // "pico" mide un salto brusco ENTRE LECTURAS CONSECUTIVAS (la aceleración del
  // cambio), no la distancia acumulada a la línea base — así el glitch de
  // fragmentación se dispara en el instante del salto y no queda sostenido
  // mientras la línea base se pone al día (ver Figura 2 del anteproyecto:
  // "fragmentación... en el instante del pico").
  const picoUmbralInstante = opts.picoUmbralInstante ?? 45;

  let baseline = null;
  let anterior = null;

  return function detectar(valorCrudo) {
    if (baseline === null) {
      baseline = valorCrudo;
      anterior = valorCrudo;
    }

    const deltaBaseline = valorCrudo - baseline;
    const deltaInstante = valorCrudo - anterior;
    const magnitud = Math.abs(deltaBaseline);

    // la línea base se adapta lentamente hacia el valor actual
    baseline = baseline + alphaBaseline * deltaBaseline;
    anterior = valorCrudo;

    const intensidad = Math.max(0, Math.min(100, magnitud * escala));
    const pico = Math.abs(deltaInstante) > picoUmbralInstante;

    return { intensidad, pico, baseline, delta: deltaBaseline };
  };
}

module.exports = { crearDetector };
