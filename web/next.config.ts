import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // El panel no sirve imágenes externas ni necesita nada especial: cuanto
  // menos configuración, menos que revisar cuando algo falle.
  reactStrictMode: true,
};

export default nextConfig;
