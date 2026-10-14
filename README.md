# QBAS-Recibos

Generador de recibos profesional de **QBASWING DESIGNER**. Funciona **100% sin conexión**,
es **bilingüe (Español / Inglés)** y se compila para **Windows (.exe)** y
**Android (.apk)** desde un mismo código fuente.

**Autor:** Dr. Sergio Grabiel Borbolla Verdecia

## Características

- Selector de idioma **ES | EN** con cambio instantáneo.
- Guardado local automático (los datos no salen del dispositivo).
- Datos de emisor y cliente, logo opcional.
- Tabla de conceptos con cálculo automático por fila.
- Descuento por **monto** o **porcentaje**.
- **Folio automático** con numeración consecutiva.
- Más de 55 monedas (incluye **CUP**) y opción de moneda personalizada.
- Botón **Imprimir / Guardar PDF** con vista limpia del recibo.
- Sin login, sin servidor, sin publicidad, sin marca de agua.

## Estructura

```
QBAS-Recibos/
├── .github/workflows/build.yml   # Compila .exe y .apk en GitHub Actions
├── src/                          # Aplicación (código compartido)
│   ├── index.html
│   ├── css/style.css
│   ├── js/app.js
│   ├── js/i18n.js
│   ├── js/currency.js
│   └── img/qbas-logo.png
├── neutralino.config.json        # Configuración para el .exe
├── capacitor.config.json         # Configuración para el .apk
└── package.json
```

## Uso del ejecutable (.exe)

1. Descarga `QBAS-Recibos.exe` desde la pestaña **Actions** del repositorio.
2. Haz doble clic para abrirlo. La aplicación levanta un servidor local
   (`localhost`) y muestra la interfaz en una ventana propia.
3. Rellena los datos, agrega conceptos y pulsa **Imprimir / Guardar PDF**.

## Uso de la app Android (.apk)

1. Descarga `QBAS-Recibos.apk` desde la pestaña **Actions** del repositorio.
2. Instálalo en tu dispositivo (permite "instalar apps de origen desconocido").
3. Abre la app: funciona íntegramente sin conexión.

## Compilación

Cada `push` a la rama principal ejecuta GitHub Actions y genera los dos
artefactos (`QBAS-Recibos.exe` y `QBAS-Recibos.apk`) listos para descargar.

---

© QBASWING DESIGNER - Dr. Sergio Grabiel Borbolla Verdecia. Todos los derechos reservados.
