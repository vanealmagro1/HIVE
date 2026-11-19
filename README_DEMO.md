# HIVE — Demo local de 90 segundos (Windows 11)

> **ENTORNO DE SIMULACIÓN · DATOS SINTÉTICOS.** Esta demo no usa RFID UHF ni BLE reales, no tiene backend
> ni base de datos, y sus cifras son ficticias. Ver `STATUS_DEMO.md` para el detalle de lo implementado.

## Requisitos

| Requisito | Versión verificada | Notas |
|---|---|---|
| Windows 11 | 10.0.26300 | PowerShell 7 o Windows PowerShell |
| Node.js | 24.15.0 (mínimo 20.19) | `node -v` |
| npm | 11.12.1 | incluido con Node |
| Navegador | Chrome o Edge recientes | con WebGL; si no hay, la app usa la vista 2D |

No se requiere internet **después** de `npm install`; tampoco cuentas, llaves API ni servicios en la nube.

## Instalación (una vez)

```powershell
git clone https://github.com/vanealmagro1/HIVE.git
cd HIVE
git switch feat/demo-19nov      # rama de trabajo de la demo
cd frontend
npm install                      # dependencias locales (node_modules), nada global
```

## Ejecutar la demo (recomendado para presentar)

```powershell
cd frontend
npm run demo
```

Compila la versión de producción y la sirve en **http://127.0.0.1:4173/**. Ábrala en Chrome/Edge y pulse
`F11` para pantalla completa. Resolución de diseño: 1366×768 o mayor.

Se recomienda presentar con `npm run demo` (build de producción) y no con `npm run dev`: en modo desarrollo
React (StrictMode) muestra avisos en consola por las etiquetas 3D, que no aparecen en producción.

## Otros comandos

```powershell
npm run dev        # servidor de desarrollo con recarga: http://127.0.0.1:5173/
npm test           # 41 pruebas automáticas (Vitest): cálculos, eventos, idempotencia, reset y UI
npm run build      # verificación de tipos (tsc) + build de producción en frontend/dist
npm run preview    # sirve el último build en http://127.0.0.1:4173/
```

## Puertos

| Puerto | Uso |
|---|---|
| 5173 | `npm run dev` |
| 4173 | `npm run preview` / `npm run demo` |

Ambos escuchan solo en `127.0.0.1` y usan `--strictPort` (si el puerto está ocupado, fallan en vez de cambiar de puerto en silencio).

## Reiniciar el estado

- Botón **↺ Reiniciar demo**: restaura semilla, eventos, alertas, recomendaciones y tareas.
- Recargar la página (`F5`) produce el mismo efecto: el estado vive en memoria del navegador.
- La semilla está en `frontend/src/seed/seed.ts` (fecha fija 2026-11-19; no depende del reloj del equipo).

## Solución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| `Port 4173 is already in use` | Otra instancia abierta | Cierre la otra terminal o `Get-Process node \| Stop-Process` |
| `npm` no se reconoce | Node no instalado o PATH | Instale Node LTS desde nodejs.org y abra una terminal nueva |
| Pantalla 3D en blanco / aviso "WebGL no disponible" | Aceleración gráfica deshabilitada | La app cambia sola a vista 2D; para 3D active "Usar aceleración por hardware" en el navegador |
| `npm install` muy lento o con errores `EPERM` | Carpeta sincronizada con OneDrive | Pause la sincronización de OneDrive o clone el repo fuera de OneDrive (p. ej. `C:\dev\HIVE`) |
| Scripts bloqueados en PowerShell (`npm.ps1 cannot be loaded`) | Política de ejecución | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` o use `npm.cmd` |
| Cifras distintas a las del guion | Estado modificado | Pulse **↺ Reiniciar demo** |

## Verificación en navegador (opcional)

`scripts/verify-browser.mjs` recorre la demo en Chrome headless con WebGL por software y guarda capturas.
Requiere `playwright-core`, que **no** es dependencia del proyecto:

```powershell
mkdir $env:TEMP\hive-verify; cd $env:TEMP\hive-verify
npm init -y; npm install playwright-core@1
Copy-Item <ruta-al-repo>\scripts\verify-browser.mjs .
node verify-browser.mjs http://127.0.0.1:4173/ .
```

Resultados de la última ejecución: `docs/evidencia/recorrido_navegador.txt` y capturas `docs/evidencia/*.png`.

## Estructura

```
frontend/src/
  domain/      tipos canónicos, fechas, formato, agregación de inventario (sin doble conteo)
  seed/        semilla determinista (3 zonas, 6 racks, 18 ubicaciones, 8 pallets, 16 cajas, 3 SKU)
  engine/      eventProcessor (conciliación, idempotencia) y scenarios (eventos SIMULATED)
  analytics/   cálculos explicables y recomendaciones
  store/       estado único, reducer, store y selectores
  api/         demoApi: contrato equivalente a la API REST propuesta (en memoria, sin servidor)
  components/  gemelo 3D (React Three Fiber), vista 2D, paneles y acciones
```
