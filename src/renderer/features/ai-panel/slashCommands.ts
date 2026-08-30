export interface SlashCommand {
  cmd: string;
  label: string;
  desc: string;
  category: 'Código' | 'Arquitectura y Calidad' | 'Git y Flujo' | 'Sistema';
  actionPrompt?: (args?: string) => string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  // Código
  {
    cmd: '/fix',
    label: 'Corregir errores',
    desc: 'Encuentra y soluciona fallos, bugs o advertencias en el código activo',
    category: 'Código',
    actionPrompt: (args) => args 
      ? `Buscá posibles fallos, bugs o problemas de rendimiento relacionados con: "${args}" y mostrá cómo corregirlos quirúrgicamente.`
      : 'Buscá posibles fallos, bugs o problemas de rendimiento en este código y mostrá cómo corregirlos quirúrgicamente.'
  },
  {
    cmd: '/explain',
    label: 'Explicar código',
    desc: 'Explica la arquitectura, flujo y funcionamiento paso a paso',
    category: 'Código',
    actionPrompt: (args) => args 
      ? `Explicá detalladamente cómo funciona: "${args}" con diagrama mental y flujo de ejecución.`
      : 'Analizá detalladamente este código, explicá su arquitectura y cómo funciona paso a paso.'
  },
  {
    cmd: '/test',
    label: 'Generar pruebas unitarias',
    desc: 'Crea una suite exhaustiva de tests con Vitest, Jest o PyTest',
    category: 'Código',
    actionPrompt: (args) => args
      ? `Generá una suite completa de pruebas unitarias para "${args}" cubriendo casos límite, mocks y aserciones estrictas.`
      : 'Generá una suite completa de pruebas unitarias para este código cubriendo casos límite, edge cases y mocks adecuados.'
  },
  {
    cmd: '/refactor',
    label: 'Refactorizar código',
    desc: 'Optimiza la legibilidad, modularidad y principios SOLID',
    category: 'Código',
    actionPrompt: (args) => args
      ? `Refactorizá "${args}" aplicando Clean Architecture, principios SOLID y eliminando duplicación.`
      : 'Refactorizá este código para que sea más limpio, legible y modular, aplicando principios SOLID.'
  },
  {
    cmd: '/types',
    label: 'Tipado estricto',
    desc: 'Infiere y genera interfaces TypeScript o tipos estrictos',
    category: 'Código',
    actionPrompt: (args) => args
      ? `Generá interfaces y tipos estrictos de TypeScript para: "${args}".`
      : 'Generá interfaces y tipos estrictos de TypeScript sin usar "any" para este código.'
  },
  {
    cmd: '/doc',
    label: 'Documentar código',
    desc: 'Genera comentarios JSDoc, docstrings y guía técnica',
    category: 'Código',
    actionPrompt: (args) => args
      ? `Generá documentación exhaustiva con JSDoc/docstrings para: "${args}".`
      : 'Generá comentarios JSDoc detallados y documentación técnica clara para este código.'
  },

  // Arquitectura y Calidad
  {
    cmd: '/review',
    label: 'Revisión Senior Architect',
    desc: 'Auditoría exhaustiva de calidad, diseño y anti-patrones',
    category: 'Arquitectura y Calidad',
    actionPrompt: (args) => args
      ? `Realizá una revisión crítica de Senior Architect sobre "${args}", evaluando acoplamiento, cohesión y escalabilidad.`
      : 'Realizá una revisión crítica de Senior Architect: evaluá Clean Architecture, acoplamiento, principios SOLID, seguridad y rendimiento.'
  },
  {
    cmd: '/optimize',
    label: 'Optimizar rendimiento',
    desc: 'Analiza cuellos de botella y complejidad algorítmica',
    category: 'Arquitectura y Calidad',
    actionPrompt: (args) => args
      ? `Analizá la complejidad algorítmica y cuellos de botella de "${args}" y proponé optimizaciones de CPU/memoria.`
      : 'Analizá posibles cuellos de botella de CPU/memoria y optimizá la complejidad temporal y espacial.'
  },
  {
    cmd: '/security',
    label: 'Auditoría de seguridad',
    desc: 'Escanea vulnerabilidades, inyecciones y validaciones faltantes',
    category: 'Arquitectura y Calidad',
    actionPrompt: (args) => args
      ? `Realizá una auditoría de seguridad para "${args}" buscando inyecciones, XSS, sanitización y fugas de datos.`
      : 'Realizá una auditoría de seguridad buscando posibles vulnerabilidades, fugas de memoria o validaciones de entrada faltantes.'
  },
  {
    cmd: '/init',
    label: 'Analizar arquitectura',
    desc: 'Explora el repositorio y resume módulos principales y stack',
    category: 'Arquitectura y Calidad',
    actionPrompt: () => 'Explorá la estructura completa del proyecto y elaborá un mapa arquitectónico de sus componentes y responsabilidades.'
  },

  // Git y Flujo
  {
    cmd: '/diff',
    label: 'Analizar Git Diff',
    desc: 'Revisa cambios pendientes y estado del repositorio',
    category: 'Git y Flujo',
    actionPrompt: () => 'Analizá el estado actual de Git (status y diff), indicame qué archivos cambiaron y sugerime mensajes de commit apropiados.'
  },
  {
    cmd: '/commit',
    label: 'Generar Commit',
    desc: 'Propone mensajes de commit convencionales (Conventional Commits)',
    category: 'Git y Flujo',
    actionPrompt: () => 'Revisá los archivos modificados en Git y redactá 3 opciones de mensajes de commit usando la convención Conventional Commits (feat, fix, refactor, etc.).'
  },
  {
    cmd: '/pr',
    label: 'Crear Pull Request',
    desc: 'Genera título y descripción detallada para Pull Request',
    category: 'Git y Flujo',
    actionPrompt: () => 'Analizá los cambios en la rama actual y generá una descripción profesional de Pull Request con resumen de cambios, motivación y checklist de verificación.'
  },

  // Sistema
  {
    cmd: '/models',
    label: 'Configurar Modelos',
    desc: 'Abre el panel de ajuste de proveedores, API keys y OAuth',
    category: 'Sistema'
  },
  {
    cmd: '/compact',
    label: 'Compactar contexto',
    desc: 'Resume los puntos clave de la conversación para ahorrar tokens',
    category: 'Sistema',
    actionPrompt: () => 'Sintetizá y compactá los puntos clave, decisiones y contexto técnico acordados hasta ahora en esta conversación.'
  },
  {
    cmd: '/clear',
    label: 'Limpiar chat',
    desc: 'Vacía la conversación actual',
    category: 'Sistema'
  },
  {
    cmd: '/help',
    label: 'Ayuda y Comandos',
    desc: 'Muestra el manual completo de comandos slash y capacidades',
    category: 'Sistema',
    actionPrompt: () => '¿Cuáles son todos los comandos slash (/), atajos y modos disponibles en Spigot? Mostrame una guía completa clasificada por categorías.'
  }
];
