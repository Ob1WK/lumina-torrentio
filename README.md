# Lúmina

Buscador web de películas que consulta Cinemeta para identificar títulos y
Torrentio para mostrar fuentes disponibles. Los resultados priorizan audio
dual Latino + English y luego calidad 4K/1080p.

## Desarrollo local

Requiere Node.js 22 o posterior.

```bash
npm install
npm run dev
```

## Despliegue en Vercel

1. Importá este repositorio desde Vercel.
2. Seleccioná **Next.js** como framework.
3. Conservá `npm run build` como comando de compilación.
4. No se requieren variables de entorno.

La aplicación realiza las consultas desde el navegador porque Torrentio admite
CORS. El uso de los resultados debe cumplir las licencias y permisos aplicables.
