# Uso de IA en este repositorio

## 2026-09-26 — Construcción inicial del pipeline

- **Herramienta:** Claude (Anthropic), en una sesión de trabajo agéntica.
- **Encargo:** diseñar y programar un sistema que, a partir de la grabación de
  una sesión (p. ej. del Senado), distinga qué dice cada persona, qué palabras
  repite y cómo se expresa con el rostro, el cuerpo y la voz. La generación de
  imágenes quedó fuera de esta etapa por decisión del autor.
- **Qué hizo la IA:** propuso la arquitectura por etapas y escribió el código,
  los léxicos iniciales de marcadores retóricos, las pruebas con una sesión
  sintética y la documentación.
- **Decisiones del autor:** alcance (solo análisis verbal y no verbal, sin
  imágenes generativas por ahora), foco en sesiones del Senado de Chile y
  publicación como repositorio.
- **Verificado:** las pruebas (`pytest`) pasan con la sesión sintética. Eso
  cubre turnos, ventanas, nombres de oradores, análisis verbal, prosodia,
  resumen no verbal, línea de tiempo y reporte.
- **No verificado en esa sesión:** transcripción con Whisper, diarización con
  pyannote, sentimiento con pysentimiento y detección real de rostro y pose con
  MediaPipe. El entorno de la IA no tenía GPU ni acceso de red para descargar
  esos modelos. Hay que probarlo con una sesión real.
- **Pendiente de revisión del autor:** los léxicos de `etapas/lexicos.py` y los
  índices compuestos de `etapas/linea_tiempo.py` son una operacionalización
  inicial que hay que discutir y justificar en la tesis.
