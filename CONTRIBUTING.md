# Guía de Contribución y Flujo de Trabajo

Para mantener la integridad del código y asegurar que todas las protecciones de seguridad y CI/CD funcionen correctamente, sigue este flujo de trabajo en cada edición:

## 1. Ciclo de Desarrollo Estándar

**NUNCA** trabajes directamente sobre la rama `main`. Sigue estos pasos:

1. **Crear una rama nueva**:
   ```bash
   git checkout -b feature/nombre-de-tu-mejora
   # o bien
   git checkout -b fix/nombre-del-error
   ```

2. **Realizar cambios y commits**:
   Asegúrate de que tu código pase los tests locales antes de subirlo:
   ```bash
   pnpm run test
   pnpm exec tsc --noEmit
   ```

3. **Subir la rama al servidor**:
   ```bash
   git push origin nombre-de-tu-rama
   ```

4. **Abrir un Pull Request (PR)**:
   Ve a GitHub y abre un PR de tu rama hacia `main`.

## 2. Validación de CI/CD

Una vez abierto el PR, GitHub Actions ejecutará automáticamente:
- Validación de tipos de TypeScript.
- Tests Unitarios e Integración.
- Verificación del Build de producción.

**El botón de "Merge" solo se habilitará cuando todos los checks estén en VERDE (✅).**

## 3. Seguridad y Releases

### Reporte de Vulnerabilidades
Consulta [SECURITY.md](SECURITY.md) para saber cómo reportar problemas de seguridad de forma privada.

### Crear un Release (Versión .exe para Windows)
Para generar el instalador automático en GitHub:
1. Asegúrate de que `main` esté actualizado.
2. Crea y sube una etiqueta (tag):
   ```bash
   git tag v1.0.x  # Reemplaza x por el número de versión
   git push origin v1.0.x
   ```
3. GitHub Actions compilará el `.exe` y lo subirá a la sección de **Releases**.

---

## 🛠 Comandos Útiles

- `pnpm run dev`: Inicia el entorno de desarrollo.
- `pnpm run build`: Compila la aplicación localmente.
- `pnpm run release:win`: Prepara el ejecutable de Windows localmente.
- `corepack pnpm add -D <package>`: Agrega una nueva dependencia de desarrollo.
