import { useState, useEffect } from 'react';

export const THEME_COLORS = {
  primary: '#4ADEBF',
  primaryHover: '#2DD4BF',
  
  light: {
    background: '#F3F4F6',
    card: 'rgba(255, 255, 255, 0.85)',
    text: '#1F2937',
    textSecondary: '#6B7280',
    border: 'rgba(0, 0, 0, 0.05)',
    input: '#FFFFFF',
    mapFilter: 'grayscale(0%) contrast(100%) brightness(100%)',
    statusBar: 'dark-content' as const,
  },
  
  dark: {
    background: '#0A0E12',
    card: 'rgba(10, 14, 18, 0.75)',
    text: '#FFFFFF',
    textSecondary: '#94A3B8',
    border: 'rgba(255, 255, 255, 0.1)',
    input: '#111A22',
    mapFilter: 'grayscale(100%) invert(90%) contrast(110%) brightness(80%)',
    statusBar: 'light-content' as const,
  }
};

/**
 * Função para interpolar cores entre light e dark baseado na hora do dia.
 * 06:00 - 18:00 -> Transição para Light
 * 18:00 - 06:00 -> Transição para Dark
 */
export function useDynamicTheme() {
  const [hour, setHour] = useState(new Date().getHours());

  useEffect(() => {
    const timer = setInterval(() => {
      setHour(new Date().getHours());
    }, 60000); // Atualiza a cada minuto
    return () => clearInterval(timer);
  }, []);

  // Lógica de transição suave (simplificada para o exemplo)
  // No futuro podemos usar Animated.interpolate para transição de cores real
  const isDark = hour >= 18 || hour < 6;
  const theme = isDark ? THEME_COLORS.dark : THEME_COLORS.light;

  return {
    isDark,
    theme,
    colors: THEME_COLORS,
    hour
  };
}
