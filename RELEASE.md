# Publicar Spigot en GitHub Releases

## Generar instalador Windows localmente sin subir

```powershell
pnpm run build
```

Salida esperada en `release/`: instalador NSIS, carpeta `win-unpacked` y archivos auxiliares de Electron Builder.

## Publicar una nueva versión

El flujo queda alineado con `Cyberbistro`: Electron Builder publica en GitHub Releases usando un tag `vX.Y.Z` y sube el instalador con nombre estable `Spigot-Install.exe`.

1. Actualizá `version` en `package.json`.
2. Commit y push de los cambios.
3. Creá y subí el tag:

```powershell
git tag v1.0.1
git push origin v1.0.1
```

El workflow `.github/workflows/release-win.yml` construye en Windows y ejecuta:

```powershell
pnpm run release:win
```

Para publicar localmente necesitás un token con permisos de releases:

```powershell
$env:GH_TOKEN="ghp_TU_TOKEN_AQUI"
pnpm run release:win
```

URL fija del instalador Latest:

```text
https://github.com/Spigot/spigot/releases/latest/download/Spigot-Install.exe
```


## Nota sobre dependencias nativas

`build.npmRebuild` esta desactivado porque Electron Builder intenta reconstruir `node-pty` en Windows y falla con el paquete actual. `asarUnpack: ["**/*.node"]` mantiene los binarios nativos fuera del ASAR para que puedan cargarse en la app empaquetada.
