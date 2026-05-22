<p align="center">
  <img src="public/logoSpigot.png" width="128" height="128" alt="Spigot Logo">
</p>

# Spigot

**Spigot** es un editor de código premium, multiplataforma y de alto rendimiento, inspirado en VS Code. Está construido con **Electron**, **React**, y **Vite**, implementando **Screaming Architecture** para asegurar la escalabilidad y mantenibilidad del proyecto a largo plazo.

## ✨ Funcionalidades Principales (Features)

- **Editor de Código Avanzado**: Integración profunda con **Monaco Editor**, soportando coloreado de sintaxis y autocompletado nativo impulsado por Language Server Protocol (LSP).
- **Asistente de IA Integrado (Panel AI)**: Chatea con el código. Soporte nativo para múltiples proveedores de IA (OpenAI, Anthropic, Gemini, DeepSeek, OpenRouter, Kimi, MiniMax, Qwen). Incluye streaming de respuestas en tiempo real y capacidad para inyectar el contexto de los archivos en uso.
- **Terminal Integrada**: Terminal totalmente funcional impulsada por `xterm.js` y `node-pty`, que te permite ejecutar comandos del sistema directamente desde el editor sin cambiar de ventana.
- **Gestión de Git**: Control de versiones nativo. Puedes ver el estado de los archivos (Status), comparar cambios (Diff), hacer Commits, revisar el Historial (Log), y hacer Push directamente desde el editor.
- **Conexiones SSH**: Gestor de conexiones VPS integrado en la barra de herramientas para acceder rápidamente a tus servidores remotos.
- **Interfaz "Frameless" y UI Premium**: Diseño de ventana moderno con barra de título personalizada, construido con Tailwind CSS y Framer Motion para animaciones fluidas.
- **Gestión de Espacios de Trabajo (Workspaces)**: Soporte completo de exploración de archivos, visor de árbol de directorios con iconos y lectura/escritura veloz mediante IPC puro con Node.js.
- **Gestor de Atajos Globales (Shortcuts)**: Sistema de atajos de teclado manejable y configurable para maximizar tu productividad.

## 🚀 Próximas Funcionalidades (Coming Soon)

- **Gestión de Plugins y Extensiones**: Un sistema dinámico para instalar utilidades desarrolladas por la comunidad.
- **Depurador Integrado (Debugger)**: Herramienta visual para colocar puntos de ruptura (breakpoints), inspeccionar variables y seguir el hilo de ejecución paso a paso.
- **Multiplexor de Terminales**: Posibilidad de dividir la consola en múltiples paneles, pestañas y layouts personalizados, al estilo Zellij o Tmux.
- **Colaboración en Tiempo Real**: Función estilo *Live Share* para poder editar el mismo archivo simultáneamente con compañeros de equipo.
- **Temas Dinámicos Pro**: Selector avanzado de temas y personalización completa de fuentes y colores (UI y sintaxis del editor).

## 💻 Instalación y Uso

### Pre-requisitos
- **Node.js**: `v22.14.0` o superior.
- **Gestor de paquetes**: El proyecto utiliza `pnpm` (a través de Corepack).

### Iniciar en Modo Desarrollo

1. Clona el repositorio:
   ```bash
   git clone https://github.com/Spigot/spigot.git
   cd spigot
   ```

2. Habilita Corepack y descarga las dependencias:
   ```bash
   corepack enable
   pnpm install --frozen-lockfile
   ```

3. Inicia la aplicación en modo desarrollo (se levantará Vite + Electron):
   ```bash
   pnpm run dev
   ```

### Construir para Producción (Build)

Para compilar y empaquetar la aplicación para tu sistema operativo actual:

```bash
pnpm run build
```

Esto generará el instalador final y los ejecutables dentro de la carpeta `release/`.

## 🛡️ Seguridad y Confianza

La seguridad es un pilar fundamental en Spigot:

- **Política de Seguridad**: Consulta nuestro [SECURITY.md](SECURITY.md) para saber cómo reportar vulnerabilidades.
- **Cadena de Suministro**: Aplicamos controles estrictos para el consumo de dependencias y procesos de build. Detalles en [docs/supply-chain-security.md](docs/supply-chain-security.md).
- **Aislamiento**: Implementamos `contextIsolation` y deshabilitamos `nodeIntegration` en el renderizado de Electron para proteger tu sistema.

## 🛠️ Tecnologías y Stack

- **Framework de Escritorio:** [Electron](https://www.electronjs.org/)
- **Frontend:** [React 18](https://react.dev/), [Vite](https://vitejs.dev/)
- **Editor Base:** [Monaco Editor](https://microsoft.github.io/monaco-editor/)
- **Terminal:** [xterm.js](https://xtermjs.org/) & [node-pty](https://github.com/microsoft/node-pty)
- **Estilos:** [Tailwind CSS](https://tailwindcss.com/)
- **Estado Global:** [Zustand](https://github.com/pmndrs/zustand)
- **Lenguaje:** TypeScript

---

*Spigot está pensado para brindar una experiencia de programación sin fricciones, rápida y fuertemente apoyada por inteligencia artificial.*