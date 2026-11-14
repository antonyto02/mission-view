# Mission View

Visualización 3D del estado de salud de un astronauta.

## Instalación

Requiere Node 20.19 o superior.

```bash
npm install
npm run dev
```

Abrir http://localhost:5173

## Qué hace

- Cuerpo de partículas que cambia de color según la telemetría: pulso, oxigenación, estrés, impactos y aire de cabina.
- Simulador integrado con escenarios (teclas 1–9).
- Seguimiento de pose con la cámara usando MediaPipe (tecla C).
- Modo Live para recibir telemetría por Socket.IO.
