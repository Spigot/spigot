const fs = require('node:fs');
const path = require('node:path');

try {
  const monacoPkgPath = require.resolve('monaco-editor/package.json');
  const monacoDir = path.dirname(monacoPkgPath);
  const srcDir = path.join(monacoDir, 'min/vs');
  
  const destDir = path.resolve(__dirname, '../public/monaco-editor/min/vs');

  console.log(`[spigot] Copiando Monaco Editor desde ${srcDir} a ${destDir}...`);

  // Crear la carpeta destino si no existe
  fs.mkdirSync(destDir, { recursive: true });

  // Copiar recursivamente
  fs.cpSync(srcDir, destDir, { recursive: true });

  console.log('[spigot] ¡Monaco Editor copiado correctamente!');
} catch (error) {
  console.error('[spigot] Error al copiar Monaco Editor:', error);
  process.exit(1);
}
