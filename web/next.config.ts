import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // El panel no sirve imágenes externas ni necesita nada especial: cuanto
  // menos configuración, menos que revisar cuando algo falle.
  reactStrictMode: true,

  // Los sitios del grupo envían a `https://hub.corpsc.com/api/ingest/...`,
  // pero la API vive en Render. Este reenvío hace que esa URL sea la buena y
  // que cambiar de hosting no obligue a tocar el HUB_URL de cada sitio.
  //
  // Solo la ingesta: es lo único que se llama desde fuera. El panel habla con
  // el resto de la API por servidor, con API_URL. Tiene que ir excluido en
  // `proxy.ts`, que se ejecuta antes que los rewrites y lo mandaría al login.
  async rewrites() {
    const apiUrl = process.env.API_URL;
    if (!apiUrl) return [];
    return [{ source: '/api/ingest/:path*', destination: `${apiUrl}/ingest/:path*` }];
  },
};

export default nextConfig;
