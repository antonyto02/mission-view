# Mission View

Vista holográfica 3D del astronauta para la demo y el video. Cada zona del cuerpo cambia de color con la telemetría:

- **Corazón:** late al ritmo del pulso.
- **Pulmones:** oxigenación (SpO₂).
- **Mente:** posible estrés (pulso alto en reposo).
- **Cuerpo:** impactos.
- **Anillo de la base:** aire de cabina (CO, presión, temperatura, humedad).

Usa el mismo contrato JSON del brief (sección 6), así que funciona con el simulador integrado o con el servidor real.

**En línea:** https://crew-health-durango.vercel.app (no hay que instalar nada).

## Correr en tu compu

Necesitas **Node 20.19 o más nuevo** (`node -v`).

```bash
git clone https://github.com/antonyto02/mission-view.git
cd mission-view
npm install
npm run dev        # http://localhost:5173
```

Es solo front: el simulador, las reglas y la detección de pose corren en el navegador. No necesita backend; solo se conecta al del equipo en modo Live.

## Meterlo en la app del equipo

Con un `<iframe>`:

```html
<iframe
  src="https://crew-health-durango.vercel.app"
  allow="camera"
  style="width: 100%; height: 100vh; border: 0"
></iframe>
```

`allow="camera"` solo hace falta si quieren usar la cámara dentro del iframe. También se puede copiar `src/` a su proyecto, porque usa el mismo stack (React + Vite + TypeScript).

Para generar la versión estática: `npm run build` crea `dist/`, que se puede servir en cualquier lado.

## Modo simulación

Los botones de abajo inyectan escenarios con valores que cambian de forma gradual:

- Normal
- Ejercicio
- Estrés
- Fuga de CO
- Despresurización
- Hipoxia
- Impacto
- Lectura mala
- Nodo desconectado

Cada paquete lleva `"source": "sim"`.

Atajos para quien presenta:

- **Teclas 1–9:** cambian de escenario.
- **H:** esconde la barra del simulador (para el video).
- **C / P / M:** cámara, movimientos de demo y espejo (ver abajo).
- **Esc:** cierra la tarjeta de detalle.

## El holograma copia a quien presenta

Con la cámara de la laptop, el cuerpo de partículas imita la pose de la persona: brazos, piernas, inclinación del torso y sentadillas (el cuerpo baja porque los pies se quedan en el piso). La detección es de MediaPipe y corre dentro del navegador; el modelo y el WASM vienen en `public/mediapipe/`, así que no necesita internet.

- **C:** prende o apaga la cámara. La primera vez, el navegador pide permiso.
- **M:** modo espejo. Sin espejo, la mano izquierda de la persona mueve la mano que el público ve a su derecha, igual que si la vieran a ella. Con espejo, se comporta como un espejo para quien presenta mirando la pantalla.
- **P:** "Demo moves", movimientos automáticos (sentadillas y brazos) sin cámara. Sirve de respaldo si la cámara falla.

Para que funcione bien en la sede:

1. **Abrir en la misma laptop que tiene la cámara, en `http://localhost:5173`.** El navegador solo permite la cámara en `localhost` o `https`; con la IP de la red (`http://192.168…`) no funciona.
2. **Laptop a unos 2.5–3 m**, con el cuerpo completo en cuadro. Si no se ven las piernas, aparece "Step back so your legs are in view" y las piernas se quedan quietas.
3. **Buena luz de frente** y fondo sin otras personas.

## Conectar al servidor real (Nave)

1. Clic en el botón **Sim** (abajo a la izquierda) para cambiar a **Live**.
2. Escribe la URL del servidor (ej. `http://192.168.0.10:3000`) y el nombre del evento de Socket.IO (por defecto `telemetria`), y **Connect**.
3. También se puede abrir directo: `http://localhost:5173/?live=http://192.168.0.10:3000&event=telemetria`

**Importante:** el modo Live hay que usarlo corriendo la página en la laptop (`npm run dev`), no desde el link de Vercel. Una página `https` no puede conectarse a un servidor `http://192.168…`; el navegador lo bloquea. La única excepción es que el servidor también esté en `https`, por ejemplo en Railway.

Acepta el paquete del contrato tal cual o envuelto en `{ data | packet | reading | lectura }`.

El servidor de Socket.IO debe permitir CORS desde esta página:

```ts
new Server(httpServer, { cors: { origin: '*' } })
```

## Notas

- El color de cada zona se calcula aquí con los umbrales y las reglas combinadas del brief, para que la vista funcione sola. Las alertas oficiales siguen siendo las del motor de reglas del servidor.
- `?nofx` apaga el brillo (bloom) en computadoras lentas. En celular se apaga solo.
- Interfaz en inglés (RNF-10). Prototipo no clínico (RNF-09).
